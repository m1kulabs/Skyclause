import { format, resolveConfig } from 'prettier'

const scriptUrl = import.meta.url
const packageRoot = new URL('../', scriptUrl).pathname
const srcRoot = new URL('../src/', scriptUrl).pathname
const openapiRoot = new URL('../openapi/', scriptUrl).pathname
const distRoot = new URL('../dist/', scriptUrl).pathname
const openapiDist = new URL('../dist/openapi/', scriptUrl).pathname

await Bun.$`mkdir -p ${distRoot} ${openapiDist}`

const entries = [
  { source: new URL('../src/index.ts', scriptUrl).pathname, root: srcRoot, outdir: distRoot },
  { source: new URL('../src/snippets.ts', scriptUrl).pathname, root: srcRoot, outdir: distRoot },
  { source: new URL('../openapi/index.ts', scriptUrl).pathname, root: openapiRoot, outdir: openapiDist }
]

for (const entry of entries) {
  const result = await Bun.build({
    entrypoints: [entry.source],
    root: entry.root,
    outdir: entry.outdir,
    naming: '[name].js',
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: false
  })
  if (!result.success) {
    console.error(result.logs)
    throw new Error(`Failed to build ${entry.source}`)
  }
}

const compiler = Bun.spawn(['bunx', 'tsc', '--project', new URL('../tsconfig.build.json', scriptUrl).pathname], {
  cwd: packageRoot,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit'
})
if ((await compiler.exited) !== 0) throw new Error('SDK declaration build failed.')

async function formatFile(path: string, parser: 'babel' | 'typescript'): Promise<void> {
  const options = (await resolveConfig(path)) ?? {}
  await Bun.write(path, await format(await Bun.file(path).text(), { ...options, parser }))
}

const jsGlob = new Bun.Glob('**/*.js')
for await (const path of jsGlob.scan({ cwd: distRoot, onlyFiles: true })) {
  await formatFile(`${distRoot}${path}`, 'babel')
}

const typesRoot = new URL('../dist/types/', scriptUrl).pathname
const declarationGlob = new Bun.Glob('**/*.d.ts')
for await (const path of declarationGlob.scan({ cwd: typesRoot, onlyFiles: true })) {
  await formatFile(`${typesRoot}${path}`, 'typescript')
}

console.log('Built @skyclause/sdk ESM JavaScript and TypeScript declarations.')
