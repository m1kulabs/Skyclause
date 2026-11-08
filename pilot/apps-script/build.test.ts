import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import { build } from './build.ts'
import { triggerRegistry } from './src/registry.ts'

const stamp = {
  sha: '498aadd0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  builtAt: '2026-11-06T10:00:00+08:00',
  pilotScriptId: '1pilotScriptIdStampedByCi'
}
let outdir = ''
let code = ''

beforeAll(async () => {
  outdir = mkdtempSync(join(tmpdir(), 'skyclause-dist-'))
  await build({ outdir, ...stamp })
  code = readFileSync(join(outdir, 'Code.js'), 'utf8')
})

afterAll(() => rmSync(outdir, { recursive: true, force: true }))

// Code.js loaded the way Apps Script loads it: one global scope with only ECMAScript built-ins, plus a
// ContentService double so a call can answer.
function load() {
  const context = createContext({
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (content: string) => ({ content, setMimeType: () => ({ content }) })
    }
  })
  runInContext(code, context)
  return context as Record<string, (event: unknown) => { content: string }>
}

describe('the Apps Script bundle in dist/', () => {
  test('holds only Code.js and the manifest', () => {
    expect(readdirSync(outdir).sort()).toEqual(['Code.js', 'appsscript.json'])
  })

  test('declares the entry points as top-level functions, including every registry handler', () => {
    const declared = [...code.matchAll(/^function (\w+)\(/gm)].map((match) => match[1])
    expect(declared).toEqual(
      expect.arrayContaining([
        'doGet',
        'doPost',
        'setup',
        'runEvaluationTick',
        'pollApims',
        'pollMetWarnings',
        'pollMetForecast',
        'verifyMetWarningText'
      ])
    )
    for (const entry of triggerRegistry) expect(declared).toContain(entry.handler)
  })

  test('declares parameterless MET source exports and ships no runtime fixture or Node imports', () => {
    const source = ts.createSourceFile(
      'main.ts',
      readFileSync(join(import.meta.dir, 'src/main.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    for (const name of ['pollMetWarnings', 'pollMetForecast', 'verifyMetWarningText', 'runAuditor']) {
      const declaration = source.statements.find(
        (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
      ) as ts.FunctionDeclaration
      expect(declaration).toBeDefined()
      expect(declaration.parameters.length).toBe(0)
      expect(declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)).toBe(true)
    }
    expect(code).not.toMatch(/node:|readFileSync|weather-warning-20261105|weather-forecast-kl-20261108/)
  })

  test('registers exactly one five-minute auditor under the existing pilot setup', () => {
    expect(triggerRegistry.filter((entry) => entry.handler === 'runAuditor')).toEqual([
      { kind: 'time', handler: 'runAuditor', every: { minutes: 5 } }
    ])
  })

  test('avoids logical assignment syntax rejected by the native Apps Script parser', () => {
    // This guards a known native-parser incompatibility, not the entire Apps Script grammar.
    const source = ts.createSourceFile('Code.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const assignments: { operator: string; line: number; column: number }[] = []
    function visit(node: ts.Node): void {
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.QuestionQuestionEqualsToken,
          ts.SyntaxKind.AmpersandAmpersandEqualsToken,
          ts.SyntaxKind.BarBarEqualsToken
        ].includes(node.operatorToken.kind)
      ) {
        const position = source.getLineAndCharacterOfPosition(node.operatorToken.getStart(source))
        assignments.push({
          operator: node.operatorToken.getText(source),
          line: position.line + 1,
          column: position.character + 1
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(assignments).toEqual([])
  })

  test('loads with no browser or Node globals and answers through the routers', () => {
    const script = load()
    expect(JSON.parse(script.doPost?.({ postData: { contents: 'not json' } }).content ?? '')).toEqual({
      ok: false,
      error: 'malformed body'
    })
    const unknown = { kind: 'no_such_kind', token: 't', device_id: 'cam-1' }
    expect(JSON.parse(script.doPost?.({ postData: { contents: JSON.stringify(unknown) } }).content ?? '')).toEqual({
      ok: false,
      error: 'unknown kind'
    })
    expect(JSON.parse(script.doGet?.({ parameter: {} }).content ?? '')).toEqual({ ok: false, error: 'unknown route' })
  })

  test('carries the stamped SHA, build time and pilot script ID', () => {
    for (const value of Object.values(stamp)) expect(code).toContain(JSON.stringify(value))
  })

  test('ships the manifest the ticket specifies', () => {
    expect(JSON.parse(readFileSync(join(outdir, 'appsscript.json'), 'utf8'))).toEqual({
      timeZone: 'Asia/Kuala_Lumpur',
      runtimeVersion: 'V8',
      exceptionLogging: 'STACKDRIVER',
      dependencies: { enabledAdvancedServices: [{ userSymbol: 'Gmail', serviceId: 'gmail', version: 'v1' }] },
      oauthScopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/script.external_request',
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/forms',
        'https://www.googleapis.com/auth/script.send_mail'
      ],
      webapp: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
    })
  })
})
