import { celEnv, isCelError, parse, plan } from '@bufbuild/cel'
import type { CheckIssue, Clause, IndicatorDefinition, IndicatorRegistry } from './types'

export type CelValueType =
  'double' | 'int' | 'uint' | 'num' | 'bool' | 'string' | 'timestamp' | 'duration' | 'list' | 'null' | 'error'

const env = celEnv()
const tsCastPlan = plan(env, parse('timestamp(v)'))
const durCastPlan = plan(env, parse('duration(v)'))
const compiledCache = new Map<string, ReturnType<typeof plan>>()

export function toCelTimestamp(iso: string): unknown {
  const res = tsCastPlan({ v: iso })
  if (isCelError(res)) {
    throw new Error(`Invalid timestamp '${iso}': ${res.message}`)
  }
  return res
}

export function toCelDuration(durOrSeconds: string | bigint): unknown {
  const res = durCastPlan({ v: durOrSeconds })
  if (isCelError(res)) {
    throw new Error(`Invalid duration '${String(durOrSeconds)}': ${res.message}`)
  }
  return res
}

export const WINDOW_FIELD_DEFS: Readonly<Record<string, { celType: CelValueType; scope: 'window' }>> = {
  'w.start': { celType: 'timestamp', scope: 'window' },
  'w.end': { celType: 'timestamp', scope: 'window' },
  'w.start_local_min': { celType: 'int', scope: 'window' },
  'w.end_local_min': { celType: 'int', scope: 'window' },
  'w.kind': { celType: 'string', scope: 'window' },
  'w.duration': { celType: 'duration', scope: 'window' }
}

export interface TypeEnvEntry {
  name: string
  celType: CelValueType
  scope: 'site' | 'window'
}

export function buildTypeEnv(registry: IndicatorRegistry): Map<string, TypeEnvEntry> {
  const map = new Map<string, TypeEnvEntry>()
  for (const [name, def] of Object.entries(WINDOW_FIELD_DEFS)) {
    map.set(name, { name, celType: def.celType, scope: def.scope })
  }
  for (const item of registry) {
    map.set(item.name, {
      name: item.name,
      celType: item.celType,
      scope: item.scope
    })
  }
  return map
}

interface AstExpr {
  id: bigint
  exprKind:
    | {
        case: 'constExpr'
        value: {
          constantKind:
            | { case: 'boolValue'; value: boolean }
            | { case: 'int64Value'; value: bigint }
            | { case: 'uint64Value'; value: bigint }
            | { case: 'doubleValue'; value: number }
            | { case: 'stringValue'; value: string }
            | { case: 'bytesValue'; value: Uint8Array }
            | { case: 'nullValue'; value: number }
            | { case: undefined; value?: undefined }
        }
      }
    | {
        case: 'identExpr'
        value: { name: string }
      }
    | {
        case: 'selectExpr'
        value: { operand?: AstExpr; field: string; testOnly: boolean }
      }
    | {
        case: 'callExpr'
        value: { target?: AstExpr; function: string; args: AstExpr[] }
      }
    | {
        case: 'listExpr'
        value: { elements: AstExpr[] }
      }
    | {
        case: 'structExpr'
        value: unknown
      }
    | {
        case: 'comprehensionExpr'
        value: {
          iterVar: string
          iterRange?: AstExpr
          accuVar: string
          accuInit?: AstExpr
          loopCondition?: AstExpr
          loopStep?: AstExpr
          result?: AstExpr
        }
      }
    | { case: undefined; value?: undefined }
}

interface SourceInfo {
  positions: Record<string, number>
  macroCalls: Record<string, AstExpr>
}

function posOf(id: bigint, sourceInfo: SourceInfo): number {
  return sourceInfo.positions[id.toString()] ?? 0
}

function flattenSelectChain(expr: AstExpr): { rootId: bigint; fullName: string } | null {
  if (expr.exprKind.case === 'identExpr') {
    return { rootId: expr.id, fullName: expr.exprKind.value.name }
  }
  if (expr.exprKind.case === 'selectExpr' && expr.exprKind.value.operand) {
    const inner = flattenSelectChain(expr.exprKind.value.operand)
    if (!inner) return null
    return {
      rootId: inner.rootId,
      fullName: `${inner.fullName}.${expr.exprKind.value.field}`
    }
  }
  return null
}

function dottedSpan(source: string, rootOffset: number, fullName: string): { offset: number; length: number } {
  const slice = source.slice(rootOffset)
  const match = /^[a-zA-Z_]\w*(?:\s*\.\s*[a-zA-Z_]\w*)*/.exec(slice)
  if (match && match[0].replace(/\s+/g, '').startsWith(fullName)) {
    return { offset: rootOffset, length: fullName.length }
  }
  const idx = source.indexOf(fullName, Math.max(0, rootOffset - 4))
  if (idx >= 0) {
    return { offset: idx, length: fullName.length }
  }
  return { offset: rootOffset, length: Math.max(1, fullName.length) }
}

function tokenSpanFromOffset(source: string, rawOffset: number, token: string): { offset: number; length: number } {
  const slice = source.slice(rawOffset)
  if (slice.startsWith(token)) {
    return { offset: rawOffset, length: token.length }
  }
  const dotMatch = /^\.\s*([a-zA-Z_]\w*)/.exec(slice)
  if (dotMatch && dotMatch[1] === token) {
    const innerIdx = slice.indexOf(token)
    return { offset: rawOffset + innerIdx, length: token.length }
  }
  const nearbyIdx = source.indexOf(token, Math.max(0, rawOffset - 2))
  if (nearbyIdx >= 0) {
    return { offset: nearbyIdx, length: token.length }
  }
  return { offset: rawOffset, length: Math.max(1, token.length) }
}

function isNumeric(t: CelValueType): boolean {
  return t === 'int' || t === 'double' || t === 'uint' || t === 'num'
}

function areComparable(left: CelValueType, right: CelValueType): boolean {
  if (left === 'error' || right === 'error') return true
  if (isNumeric(left) && isNumeric(right)) return true
  return (
    (left === 'string' && right === 'string') ||
    (left === 'timestamp' && right === 'timestamp') ||
    (left === 'duration' && right === 'duration') ||
    (left === 'bool' && right === 'bool')
  )
}

function areEquatable(left: CelValueType, right: CelValueType): boolean {
  if (left === 'error' || right === 'error') return true
  if (isNumeric(left) && isNumeric(right)) return true
  if (left === 'null' || right === 'null') return true
  return left === right
}

const ALLOWED_FUNCTIONS = new Set([
  '_&&_',
  '_||_',
  '!_',
  '_==_',
  '_!=_',
  '_<_',
  '_<=_',
  '_>_',
  '_>=_',
  '_+_',
  '_-_',
  '_*_',
  '_/_',
  '_%_',
  '-_',
  'size',
  'duration',
  'timestamp',
  'int',
  'double'
])

export function checkCelCondition(
  clauseKey: string,
  when: string,
  clauseScope: Clause['scope'],
  declaredDeps: ReadonlySet<string>,
  typeEnv: ReadonlyMap<string, TypeEnvEntry>
): CheckIssue[] {
  const issues: CheckIssue[] = []

  if (!when.trim()) {
    issues.push({
      clauseKey,
      message: 'Clause condition cannot be empty',
      offset: 0,
      length: Math.max(1, when.length)
    })
    return issues
  }

  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(when)
  } catch (err: unknown) {
    const loc = (err as { location?: { start?: { offset?: number }; end?: { offset?: number } } })?.location
    const found = (err as { found?: string })?.found
    const offset = loc?.start?.offset ?? 0
    const endOffset = loc?.end?.offset
    const length =
      typeof endOffset === 'number' && endOffset > offset
        ? endOffset - offset
        : typeof found === 'string' && found.length > 0
          ? found.length
          : Math.max(1, when.length - offset)
    issues.push({
      clauseKey,
      message: err instanceof Error ? err.message : 'CEL syntax error',
      offset,
      length
    })
    return issues
  }

  try {
    plan(env, parsed)
  } catch (err: unknown) {
    issues.push({
      clauseKey,
      message: err instanceof Error ? err.message : 'CEL plan error',
      offset: 0,
      length: Math.max(1, when.length)
    })
    return issues
  }

  const sourceInfo = (parsed.sourceInfo ?? { positions: {}, macroCalls: {} }) as unknown as SourceInfo
  const rootExpr = parsed.expr as unknown as AstExpr

  function resolveDottedReference(
    chain: { rootId: bigint; fullName: string },
    localVars: ReadonlyMap<string, CelValueType>
  ): CelValueType {
    const { rootId, fullName } = chain
    const rootOffset = posOf(rootId, sourceInfo)
    const span = dottedSpan(when, rootOffset, fullName)

    if (!fullName.includes('.') && localVars.has(fullName)) {
      return localVars.get(fullName)!
    }

    if (fullName === 'now') {
      issues.push({
        clauseKey,
        message: `'now' is not allowed in clause conditions; time enters only through t_eval and the span`,
        offset: span.offset,
        length: span.length
      })
      return 'error'
    }

    const entry = typeEnv.get(fullName)
    if (!entry) {
      issues.push({
        clauseKey,
        message: `Unknown indicator or identifier '${fullName}'`,
        offset: span.offset,
        length: span.length
      })
      return 'error'
    }

    if (entry.scope === 'window' && clauseScope !== 'window') {
      issues.push({
        clauseKey,
        message: `Window-scoped indicator '${fullName}' cannot be used in a '${clauseScope}' clause`,
        offset: span.offset,
        length: span.length
      })
    }

    if (!declaredDeps.has(fullName)) {
      issues.push({
        clauseKey,
        message: `Indicator '${fullName}' read in when must appear in requires or optional`,
        offset: span.offset,
        length: span.length
      })
    }

    return entry.celType
  }

  function inferExprType(expr: AstExpr, localVars: ReadonlyMap<string, CelValueType>): CelValueType {
    const kind = expr.exprKind
    const exprOffset = posOf(expr.id, sourceInfo)

    switch (kind.case) {
      case 'constExpr': {
        const ck = kind.value.constantKind
        switch (ck.case) {
          case 'boolValue':
            return 'bool'
          case 'int64Value':
            return 'int'
          case 'uint64Value':
            return 'uint'
          case 'doubleValue':
            return 'double'
          case 'stringValue':
            return 'string'
          case 'nullValue':
            return 'null'
          case 'bytesValue':
            issues.push({
              clauseKey,
              message: 'Bytes literals are outside the allowed CEL subset',
              offset: exprOffset,
              length: 1
            })
            return 'error'
          default:
            return 'error'
        }
      }

      case 'identExpr': {
        return resolveDottedReference({ rootId: expr.id, fullName: kind.value.name }, localVars)
      }

      case 'selectExpr': {
        if (kind.value.testOnly) {
          // Expanded has(...) macro
          const chain = flattenSelectChain(expr)
          if (!chain) {
            issues.push({
              clauseKey,
              message: 'has() requires a dotted indicator reference',
              offset: exprOffset,
              length: 3
            })
            return 'error'
          }
          resolveDottedReference(chain, localVars)
          return 'bool'
        }
        const chain = flattenSelectChain(expr)
        if (!chain) {
          issues.push({
            clauseKey,
            message: 'Unsupported field selection on non-identifier expression',
            offset: exprOffset,
            length: Math.max(1, kind.value.field.length)
          })
          return 'error'
        }
        return resolveDottedReference(chain, localVars)
      }

      case 'listExpr': {
        for (const el of kind.value.elements) {
          inferExprType(el, localVars)
        }
        return 'list'
      }

      case 'structExpr': {
        issues.push({
          clauseKey,
          message: 'Map and message literals are outside the allowed CEL subset',
          offset: exprOffset,
          length: 1
        })
        return 'error'
      }

      case 'comprehensionExpr': {
        const macroCall = sourceInfo.macroCalls[expr.id.toString()]
        const macroFunc = macroCall?.exprKind.case === 'callExpr' ? macroCall.exprKind.value.function : undefined
        if (macroFunc !== 'all' && macroFunc !== 'exists') {
          const name = macroFunc ?? 'comprehension'
          const span = tokenSpanFromOffset(when, exprOffset, name)
          issues.push({
            clauseKey,
            message: `Macro '${name}' is outside the allowed CEL subset; only all() and exists() are permitted`,
            offset: span.offset,
            length: span.length
          })
          return 'error'
        }

        const rangeExpr = kind.value.iterRange
        const rangeType = rangeExpr ? inferExprType(rangeExpr, localVars) : 'error'
        if (rangeType !== 'list' && rangeType !== 'error') {
          const rangeOffset = rangeExpr ? posOf(rangeExpr.id, sourceInfo) : exprOffset
          issues.push({
            clauseKey,
            message: `${macroFunc}() target must be a list, got '${rangeType}'`,
            offset: rangeOffset,
            length: Math.max(1, macroFunc.length)
          })
          return 'error'
        }

        const nextVars = new Map(localVars)
        nextVars.set(kind.value.iterVar, 'num')

        const predExpr =
          macroCall?.exprKind.case === 'callExpr' && macroCall.exprKind.value.args[1]
            ? macroCall.exprKind.value.args[1]
            : kind.value.loopStep
        if (predExpr) {
          const predType = inferExprType(predExpr, nextVars)
          if (predType !== 'bool' && predType !== 'error') {
            const predOffset = posOf(predExpr.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `${macroFunc}() predicate must return bool, got '${predType}'`,
              offset: predOffset,
              length: Math.max(1, when.length - predOffset)
            })
            return 'error'
          }
        }
        return 'bool'
      }

      case 'callExpr': {
        const fn = kind.value.function
        const target = kind.value.target
        const args = kind.value.args

        if (fn === 'has') {
          const span = tokenSpanFromOffset(when, exprOffset, 'has')
          issues.push({
            clauseKey,
            message: 'has() requires a field selection such as has(site.camera_far_low_frames)',
            offset: span.offset,
            length: span.length
          })
          return 'error'
        }

        if (!ALLOWED_FUNCTIONS.has(fn)) {
          const displayFn = fn === '_?_:_' ? '?' : fn === '_[_]' ? '[' : fn === '@in' ? 'in' : fn
          const span = tokenSpanFromOffset(when, exprOffset, displayFn)
          issues.push({
            clauseKey,
            message: `Function or operator '${displayFn}' is outside the allowed CEL subset`,
            offset: span.offset,
            length: span.length
          })
          return 'error'
        }

        if (fn === 'size') {
          const allArgs = target ? [target, ...args] : args
          if (allArgs.length !== 1) {
            const span = tokenSpanFromOffset(when, exprOffset, 'size')
            issues.push({
              clauseKey,
              message: 'size() takes exactly 1 argument',
              offset: span.offset,
              length: span.length
            })
            return 'error'
          }
          const argType = inferExprType(allArgs[0]!, localVars)
          if (argType !== 'list' && argType !== 'string' && argType !== 'error') {
            const argOffset = posOf(allArgs[0]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `size() requires list or string, got '${argType}'`,
              offset: argOffset,
              length: 4
            })
            return 'error'
          }
          return 'int'
        }

        if (fn === 'duration') {
          if (target || args.length !== 1) {
            const span = tokenSpanFromOffset(when, exprOffset, 'duration')
            issues.push({
              clauseKey,
              message: 'duration() takes 1 string argument',
              offset: span.offset,
              length: span.length
            })
            return 'error'
          }
          const arg = args[0]!
          const argType = inferExprType(arg, localVars)
          if (argType !== 'string' && argType !== 'error') {
            const span = tokenSpanFromOffset(when, posOf(arg.id, sourceInfo), 'duration')
            issues.push({
              clauseKey,
              message: `duration() requires string argument, got '${argType}'`,
              offset: span.offset,
              length: span.length
            })
            return 'error'
          }
          if (arg.exprKind.case === 'constExpr' && arg.exprKind.value.constantKind.case === 'stringValue') {
            try {
              toCelDuration(arg.exprKind.value.constantKind.value)
            } catch (err: unknown) {
              const argOffset = posOf(arg.id, sourceInfo)
              issues.push({
                clauseKey,
                message: err instanceof Error ? err.message : 'Invalid duration literal',
                offset: argOffset,
                length: arg.exprKind.value.constantKind.value.length + 2
              })
              return 'error'
            }
          }
          return 'duration'
        }

        if (fn === 'timestamp') {
          if (target || args.length !== 1) {
            const span = tokenSpanFromOffset(when, exprOffset, 'timestamp')
            issues.push({
              clauseKey,
              message: 'timestamp() takes 1 string argument',
              offset: span.offset,
              length: span.length
            })
            return 'error'
          }
          const arg = args[0]!
          const argType = inferExprType(arg, localVars)
          if (argType !== 'string' && argType !== 'error') {
            const span = tokenSpanFromOffset(when, posOf(arg.id, sourceInfo), 'timestamp')
            issues.push({
              clauseKey,
              message: `timestamp() requires string argument, got '${argType}'`,
              offset: span.offset,
              length: span.length
            })
            return 'error'
          }
          if (arg.exprKind.case === 'constExpr' && arg.exprKind.value.constantKind.case === 'stringValue') {
            try {
              toCelTimestamp(arg.exprKind.value.constantKind.value)
            } catch (err: unknown) {
              const argOffset = posOf(arg.id, sourceInfo)
              issues.push({
                clauseKey,
                message: err instanceof Error ? err.message : 'Invalid timestamp literal',
                offset: argOffset,
                length: arg.exprKind.value.constantKind.value.length + 2
              })
              return 'error'
            }
          }
          return 'timestamp'
        }

        if (fn === 'int' || fn === 'double') {
          if (target || args.length !== 1) {
            const span = tokenSpanFromOffset(when, exprOffset, fn)
            issues.push({
              clauseKey,
              message: `${fn}() takes 1 argument`,
              offset: span.offset,
              length: span.length
            })
            return 'error'
          }
          const argType = inferExprType(args[0]!, localVars)
          if (argType === 'error') return 'error'
          if (!isNumeric(argType) && argType !== 'string' && argType !== 'timestamp' && argType !== 'duration') {
            const argOffset = posOf(args[0]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Cannot convert '${argType}' to ${fn}`,
              offset: argOffset,
              length: fn.length
            })
            return 'error'
          }
          return fn
        }

        if (fn === '!_') {
          const argType = inferExprType(args[0]!, localVars)
          if (argType !== 'bool' && argType !== 'error') {
            const argOffset = posOf(args[0]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Logical '!' requires bool operand, got '${argType}'`,
              offset: argOffset,
              length: 1
            })
            return 'error'
          }
          return 'bool'
        }

        if (fn === '-_') {
          const argType = inferExprType(args[0]!, localVars)
          if (!isNumeric(argType) && argType !== 'error') {
            const argOffset = posOf(args[0]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Unary '-' requires numeric operand, got '${argType}'`,
              offset: argOffset,
              length: 1
            })
            return 'error'
          }
          return argType
        }

        if (fn === '_&&_' || fn === '_||_') {
          const left = inferExprType(args[0]!, localVars)
          const right = inferExprType(args[1]!, localVars)
          const opStr = fn === '_&&_' ? '&&' : '||'
          if (left !== 'bool' && left !== 'error') {
            const off = posOf(args[0]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Operator '${opStr}' requires bool left operand, got '${left}'`,
              offset: off,
              length: Math.max(1, exprOffset - off)
            })
          }
          if (right !== 'bool' && right !== 'error') {
            const off = posOf(args[1]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Operator '${opStr}' requires bool right operand, got '${right}'`,
              offset: off,
              length: Math.max(1, when.length - off)
            })
          }
          return left === 'error' || right === 'error' || left !== 'bool' || right !== 'bool' ? 'error' : 'bool'
        }

        if (fn === '_==_' || fn === '_!=_') {
          const left = inferExprType(args[0]!, localVars)
          const right = inferExprType(args[1]!, localVars)
          const opStr = fn === '_==_' ? '==' : '!='
          if (!areEquatable(left, right)) {
            const rightOff = posOf(args[1]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Type mismatch in '${opStr}': cannot compare '${left}' and '${right}'`,
              offset: rightOff,
              length: Math.max(1, when.length - rightOff)
            })
            return 'error'
          }
          return 'bool'
        }

        if (fn === '_<_' || fn === '_<=_' || fn === '_>_' || fn === '_>=_') {
          const left = inferExprType(args[0]!, localVars)
          const right = inferExprType(args[1]!, localVars)
          const opStr = fn.slice(1, -1)
          if (!areComparable(left, right)) {
            const rightOff = posOf(args[1]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Type mismatch in '${opStr}': cannot compare '${left}' and '${right}'`,
              offset: rightOff,
              length: Math.max(1, when.length - rightOff)
            })
            return 'error'
          }
          return 'bool'
        }

        if (fn === '_+_' || fn === '_-_' || fn === '_*_' || fn === '_/_' || fn === '_%_') {
          const left = inferExprType(args[0]!, localVars)
          const right = inferExprType(args[1]!, localVars)
          const opStr = fn.slice(1, -1)
          if (left === 'error' || right === 'error') return 'error'

          if (fn === '_+_') {
            if (left === 'timestamp' && right === 'duration') return 'timestamp'
            if (left === 'duration' && right === 'timestamp') return 'timestamp'
            if (left === 'duration' && right === 'duration') return 'duration'
            if (left === 'string' && right === 'string') return 'string'
            if (left === 'list' && right === 'list') return 'list'
          }
          if (fn === '_-_') {
            if (left === 'timestamp' && right === 'timestamp') return 'duration'
            if (left === 'timestamp' && right === 'duration') return 'timestamp'
            if (left === 'duration' && right === 'duration') return 'duration'
          }
          if (fn === '_%_') {
            if ((left === 'int' || left === 'num') && (right === 'int' || right === 'num')) {
              return 'int'
            }
            const rightOff = posOf(args[1]!.id, sourceInfo)
            issues.push({
              clauseKey,
              message: `Operator '%' requires int operands, got '${left}' and '${right}'`,
              offset: rightOff,
              length: Math.max(1, when.length - rightOff)
            })
            return 'error'
          }

          if (isNumeric(left) && isNumeric(right)) {
            if (left === 'double' || right === 'double') {
              if (left === right || left === 'num' || right === 'num') return 'double'
              const rightOff = posOf(args[1]!.id, sourceInfo)
              issues.push({
                clauseKey,
                message: `Operator '${opStr}' requires matching numeric types, got '${left}' and '${right}'`,
                offset: rightOff,
                length: Math.max(1, when.length - rightOff)
              })
              return 'error'
            }
            return 'int'
          }

          const rightOff = posOf(args[1]!.id, sourceInfo)
          issues.push({
            clauseKey,
            message: `Operator '${opStr}' cannot be applied to '${left}' and '${right}'`,
            offset: rightOff,
            length: Math.max(1, when.length - rightOff)
          })
          return 'error'
        }

        return 'error'
      }

      default:
        return 'error'
    }
  }

  const rootType = inferExprType(rootExpr, new Map())
  if (rootType !== 'bool' && rootType !== 'error') {
    issues.push({
      clauseKey,
      message: `Clause condition must evaluate to bool, got '${rootType}'`,
      offset: 0,
      length: Math.max(1, when.length)
    })
  }

  return issues
}

export function evalCelCondition(
  when: string,
  bindings: { site: Record<string, unknown>; w?: Record<string, unknown> }
): boolean {
  let compiled = compiledCache.get(when)
  if (!compiled) {
    compiled = plan(env, parse(when))
    compiledCache.set(when, compiled)
  }
  const result = compiled(bindings as Parameters<typeof compiled>[0])
  if (isCelError(result)) {
    throw new Error(`CEL evaluation error in '${when}': ${result.message}`)
  }
  if (typeof result !== 'boolean') {
    throw new Error(`CEL condition '${when}' returned non-boolean: ${String(result)}`)
  }
  return result
}

export function indicatorValToCel(raw: unknown, celType?: IndicatorDefinition['celType'] | CelValueType): unknown {
  if (raw === null || raw === undefined) return undefined
  if (celType === 'int') {
    if (typeof raw === 'bigint') return raw
    if (typeof raw === 'number' && Number.isFinite(raw)) return BigInt(Math.trunc(raw))
  }
  if (celType === 'double') {
    if (typeof raw === 'number') return raw
    if (typeof raw === 'bigint') return Number(raw)
  }
  if (celType === 'timestamp' && typeof raw === 'string') {
    return toCelTimestamp(raw)
  }
  if (celType === 'duration') {
    if (typeof raw === 'string' || typeof raw === 'bigint') return toCelDuration(raw)
    if (typeof raw === 'number') return toCelDuration(BigInt(Math.trunc(raw)))
  }
  if (celType === 'list' && Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'number' ? item : item))
  }
  return raw
}
