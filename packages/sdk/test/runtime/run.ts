import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox, webkit, type BrowserType } from '@playwright/test'

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const binRoot = join(sdkRoot, 'node_modules/.bin')
const tempRoot = await mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'skyclause-sdk-runtimes-'))
const checksExpected = 37

async function buildBundle(entry: string, output: string, format: 'esm' | 'iife'): Promise<void> {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: join(tempRoot, 'bundles'),
    naming: '[name].js',
    target: 'browser',
    format,
    splitting: false,
    minify: false
  })
  if (!result.success) throw new Error(`Failed to bundle ${entry}: ${result.logs.map((log) => log.message).join('\n')}`)
  const bundle = result.outputs[0]
  if (!bundle) throw new Error(`Bun produced no output for ${entry}.`)
  await Bun.write(output, bundle)
}

async function runCommand(label: string, executable: string, args: string[], expectedOutput: RegExp): Promise<void> {
  const child = Bun.spawn([executable, ...args], { cwd: sdkRoot, stdout: 'pipe', stderr: 'pipe' })
  const stdoutPromise = new Response(child.stdout).text()
  const stderrPromise = new Response(child.stderr).text()
  const exitCode = await child.exited
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
  if (exitCode !== 0 || !expectedOutput.test(stdout)) {
    throw new Error(`${label} failed (exit ${exitCode}).\n${stdout}${stderr}`)
  }
  console.log(`${label}: ${checksExpected} checks passed`)
}

async function ensurePlaywrightBrowsers(): Promise<void> {
  const missing: string[] = []
  for (const [name, browser] of [
    ['chromium', chromium],
    ['firefox', firefox],
    ['webkit', webkit]
  ] as const) {
    try {
      await access(browser.executablePath())
    } catch {
      missing.push(name)
    }
  }
  if (missing.length === 0) return

  console.log(`Installing Playwright browsers: ${missing.join(', ')}`)
  const installer = Bun.spawn([join(binRoot, 'playwright'), 'install', '--with-deps', ...missing], {
    cwd: sdkRoot,
    stdout: 'inherit',
    stderr: 'inherit'
  })
  const exitCode = await installer.exited
  if (exitCode !== 0) throw new Error(`Playwright browser installation failed (exit ${exitCode}).`)
}

async function runBrowser(label: string, browserType: BrowserType, bundlePath: string, origin: string): Promise<void> {
  const browser = await browserType.launch()
  try {
    const page = await browser.newPage()
    await page.goto(origin)
    await page.addScriptTag({ path: bundlePath })
    const checks = await page.evaluate(() => window.__runSdkRuntimeSuite())
    if (checks !== checksExpected) throw new Error(`${label} ran ${checks} checks; expected ${checksExpected}.`)
    console.log(`${label}: ${checks} checks passed`)
  } finally {
    await browser.close()
  }
}

async function runWorkerd(): Promise<void> {
  const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() })
  const port = reservation.port
  reservation.stop()

  const configPath = join(tempRoot, 'workerd.capnp')
  const config = `using Workerd = import "/workerd/workerd.capnp";

const runtimeConfig :Workerd.Config = (
  services = [(name = "main", worker = .sdkWorker)],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")]
);

const sdkWorker :Workerd.Worker = (
  modules = [(name = "worker", esModule = embed "./sdk-runtime-suite.workerd.js")],
  compatibilityDate = "2026-11-09"
);
`
  await Bun.write(configPath, config)

  const executable = join(binRoot, 'workerd')
  const child = Bun.spawn(
    [executable, 'serve', '--verbose', '--socket-addr', `http=127.0.0.1:${port}`, configPath, 'runtimeConfig'],
    {
      cwd: tempRoot,
      env: { ...process.env, PWD: tempRoot },
      stdout: 'pipe',
      stderr: 'pipe'
    }
  )
  const stdoutPromise = new Response(child.stdout).text()
  const stderrPromise = new Response(child.stderr).text()
  let response: Response | undefined

  try {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null && child.exitCode !== undefined) break
      try {
        response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(10_000) })
        break
      } catch {
        await Bun.sleep(100)
      }
    }
    if (!response) {
      child.kill()
      const exitCode = await child.exited
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
      throw new Error(`workerd did not start (exit ${exitCode}).\n${stdout}${stderr}`)
    }

    const body = (await response.json()) as { checks?: number; error?: string }
    if (!response.ok || body.checks !== checksExpected) {
      throw new Error(`workerd runtime suite failed: ${body.error ?? `received ${body.checks} checks`}`)
    }
    console.log(`workerd: ${body.checks} checks passed`)
  } finally {
    child.kill()
    await child.exited
    await Promise.all([stdoutPromise, stderrPromise])
  }
}

try {
  const nodeBundle = join(tempRoot, 'sdk-runtime-suite.mjs')
  const browserBundle = join(tempRoot, 'sdk-runtime-suite.browser.js')
  const workerdBundle = join(tempRoot, 'sdk-runtime-suite.workerd.js')
  await buildBundle(join(sdkRoot, 'test/runtime/execute.ts'), nodeBundle, 'esm')
  await buildBundle(join(sdkRoot, 'test/runtime/browser-entry.ts'), browserBundle, 'iife')
  await buildBundle(join(sdkRoot, 'test/runtime/workerd-entry.ts'), workerdBundle, 'esm')

  await runCommand('Node 22.15.0', join(binRoot, 'node'), [nodeBundle], /passed 37 checks/)
  await runCommand('Bun 1.4.4', join(binRoot, 'bun'), ['run', nodeBundle], /passed 37 checks/)
  await runCommand('Deno 2.9.6', join(binRoot, 'deno'), ['run', '--allow-all', nodeBundle], /passed 37 checks/)

  await ensurePlaywrightBrowsers()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response('<!doctype html><html><body>SDK runtime suite</body></html>', {
        headers: { 'Content-Type': 'text/html' }
      })
  })
  try {
    const origin = `http://127.0.0.1:${server.port}/`
    await runBrowser('Playwright Chromium', chromium, browserBundle, origin)
    await runBrowser('Playwright Firefox', firefox, browserBundle, origin)
    await runBrowser('Playwright WebKit', webkit, browserBundle, origin)
  } finally {
    server.stop()
  }

  await runWorkerd()
  console.log('SDK runtime matrix passed: Node, Bun, Deno, Chromium, Firefox, WebKit, workerd.')
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}
