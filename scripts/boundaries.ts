// The `lint` guard for spec §1 dependency rules and D10: every package stays inside its "May depend on" cell,
// packages never depend on apps, project references stay acyclic and nothing reaches into `pilot/`.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'
import { listFiles } from './files'

/** Spec §1 "May depend on", workspace packages only; `type:` entries allow `import type` alone. */
const CELLS: Record<string, string[]> = {
  contracts: ['type:clauses', 'type:sources', 'type:forecast'],
  config: ['contracts'],
  i18n: ['config'],
  clauses: [],
  forecast: ['clauses', 'contracts'],
  sources: ['clauses', 'contracts'],
  agent: ['contracts'],
  db: ['contracts', 'clauses', 'forecast', 'config'],
  auth: ['db', 'contracts', 'delivery', 'config'],
  api: ['contracts', 'config', 'i18n', 'clauses', 'forecast', 'sources', 'agent', 'db', 'delivery'],
  delivery: ['contracts', 'i18n', 'config'],
  mcp: ['sdk'],
  sdk: [],
  cli: ['sdk', 'mcp', 'i18n', 'type:contracts'],
  elements: ['contracts', 'i18n'],
  skills: []
}
const APPS = ['web', 'worker', 'docs']
/** `packages/clauses` is pure and browser-safe: its only runtime dependency is its CEL library (TRD layout). */
const CLAUSES_ONLY = '@bufbuild/cel'
const SOURCE = /\.[cm]?[jt]sx?$/
const SCOPE = '@skyclause/'

interface Unit {
  dir: string // e.g. `packages/db`
  name: string // e.g. `db`
  app: boolean
}

interface Edge {
  where: string
  verb: 'depends on' | 'imports' | 'references'
  target: Unit
  typeOnly: boolean
}

function readUnits(root: string): Unit[] {
  return ['packages', 'apps'].flatMap((group) =>
    existsSync(join(root, group))
      ? readdirSync(join(root, group))
          .filter((name) => existsSync(join(root, group, name, 'package.json')))
          .sort()
          .map((name) => ({ dir: `${group}/${name}`, name, app: group === 'apps' }))
      : []
  )
}

function specifiers(file: string, text: string): Array<{ spec: string; typeOnly: boolean }> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false)
  const found: Array<{ spec: string; typeOnly: boolean }> = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ spec: node.moduleSpecifier.text, typeOnly: node.importClause?.isTypeOnly ?? false })
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly })
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push({ spec: node.arguments[0].text, typeOnly: false })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const posix = (path: string) => path.split(sep).join('/')
const isPilot = (path: string) => path === 'pilot' || path.startsWith('pilot/')

export function checkBoundaries(root: string): string[] {
  const units = readUnits(root)
  const byName = new Map(units.map((unit) => [unit.name, unit]))
  const unitAt = (path: string) => units.find((unit) => path === unit.dir || path.startsWith(`${unit.dir}/`))
  const pilotPackage = existsSync(join(root, 'pilot/package.json'))
    ? (JSON.parse(readFileSync(join(root, 'pilot/package.json'), 'utf8')) as { name?: string }).name
    : undefined
  const problems: string[] = []
  const references = new Map<string, string[]>()

  for (const unit of units) {
    const cell = CELLS[unit.name]
    if (unit.app ? !APPS.includes(unit.name) : !cell) {
      problems.push(`${unit.dir} is not in the §1 module map`)
      continue
    }
    const edges: Edge[] = []

    const manifest = JSON.parse(readFileSync(join(root, unit.dir, 'package.json'), 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dep of Object.keys(manifest[field] ?? {})) {
        const where = `${unit.dir}/package.json`
        if (dep === pilotPackage) problems.push(`${where} depends on pilot/ (D10)`)
        else if (dep.startsWith(SCOPE)) {
          const target = byName.get(dep.slice(SCOPE.length))
          if (target) edges.push({ where, verb: 'depends on', target, typeOnly: true })
        } else if (unit.name === 'clauses' && field !== 'devDependencies' && dep !== CLAUSES_ONLY) {
          problems.push(`${where} depends on ${dep}; packages/clauses may depend on ${CLAUSES_ONLY} only`)
        }
      }
    }

    for (const file of listFiles(root, [unit.dir]).filter((f) => SOURCE.test(f))) {
      const isTest = file.includes('/test/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes('/e2e/')
      for (const { spec, typeOnly } of specifiers(file, readFileSync(join(root, file), 'utf8'))) {
        if (spec.startsWith('.')) {
          const path = posix(relative(root, resolve(root, dirname(file), spec)))
          const target = unitAt(path)
          if (isPilot(path)) problems.push(`${file} imports pilot/ (D10)`)
          else if (target && target !== unit) edges.push({ where: file, verb: 'imports', target, typeOnly })
        } else if (spec === pilotPackage || isPilot(spec)) {
          problems.push(`${file} imports pilot/ (D10)`)
        } else if (spec.startsWith(SCOPE)) {
          const target = byName.get(spec.slice(SCOPE.length).split('/')[0]!)
          if (target && target !== unit) edges.push({ where: file, verb: 'imports', target, typeOnly })
        } else if (
          unit.name === 'clauses' &&
          !isTest &&
          spec !== CLAUSES_ONLY &&
          !spec.startsWith(`${CLAUSES_ONLY}/`)
        ) {
          problems.push(`${file} imports ${spec}; packages/clauses may depend on ${CLAUSES_ONLY} only`)
        }
      }
    }

    const tsconfig = join(root, unit.dir, 'tsconfig.json')
    if (existsSync(tsconfig)) {
      const { config } = ts.readConfigFile(tsconfig, ts.sys.readFile) as {
        config?: { references?: Array<{ path: string }> }
      }
      const targets: string[] = []
      for (const reference of config?.references ?? []) {
        const path = posix(relative(root, resolve(root, unit.dir, reference.path)))
        const target = unitAt(path)
        if (isPilot(path)) problems.push(`${unit.dir}/tsconfig.json references pilot/ (D10)`)
        else if (target) {
          targets.push(target.dir)
          edges.push({ where: `${unit.dir}/tsconfig.json`, verb: 'references', target, typeOnly: true })
        }
      }
      references.set(unit.dir, targets)
    }

    for (const { where, verb, target, typeOnly } of edges) {
      if (target.app && !unit.app) {
        problems.push(`${where} ${verb} app ${SCOPE}${target.name}; apps depend on packages, never the reverse`)
      } else if (unit.app ? target.app : !cell!.includes(target.name)) {
        if (typeOnly && cell?.includes(`type:${target.name}`)) continue
        if (cell?.includes(`type:${target.name}`)) {
          problems.push(`${where} ${verb} ${SCOPE}${target.name}, which its §1 cell allows only as import type`)
        } else problems.push(`${where} ${verb} ${SCOPE}${target.name}, outside its §1 cell`)
      }
    }
  }

  problems.push(...cycles(references))
  return [...new Set(problems)].sort()
}

function cycles(graph: Map<string, string[]>): string[] {
  const found: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (node: string, ancestors: string[]) => {
    state.set(node, 'visiting')
    const path = [...ancestors, node]
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        found.push(`project references form a cycle: ${[...path.slice(path.indexOf(next)), next].join(' → ')}`)
      } else if (!state.has(next)) visit(next, path)
    }
    state.set(node, 'done')
  }
  for (const node of [...graph.keys()].sort()) if (!state.has(node)) visit(node, [])
  return found
}
