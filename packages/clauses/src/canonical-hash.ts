import { sha256 } from './sha256'

function quote(value: string): string {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('Lone Unicode surrogate')
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('Lone Unicode surrogate')
    }
  }
  return JSON.stringify(value)
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (typeof value !== 'object') throw new TypeError('Expected a JSON value')

  const array = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (!array && prototype !== Object.prototype && prototype !== null) throw new TypeError('Expected a JSON object')
  if (ancestors.has(value)) throw new TypeError('Cyclic JSON value')
  ancestors.add(value)
  try {
    if (array) {
      const elements: string[] = []
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i)) throw new TypeError('Sparse JSON array')
        elements.push(serialize(value[i], ancestors))
      }
      return `[${elements.join(',')}]`
    }
    const object = value as Record<string, unknown>
    // JSON members are own enumerable string keys; symbol-keyed and non-enumerable metadata is ignored.
    // Emit members directly: JSON.stringify on a rebuilt object reorders integer keys.
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${quote(key)}:${serialize(object[key], ancestors)}`)
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

/** The RFC 8785 JCS text of a JSON value; throws on anything JSON can't hold. */
export function canonicalJson(value: unknown): string {
  return serialize(value, new Set())
}

export function canonicalHash(value: unknown): string {
  const canonical = canonicalJson(value)
  const bytes: number[] = []
  // Strings have already been checked for lone surrogates, so iteration yields Unicode scalars.
  for (const character of canonical) {
    const point = character.codePointAt(0)!
    if (point < 0x80) bytes.push(point)
    else if (point < 0x800) bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 0x3f))
    else if (point < 0x10000) bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f))
    else
      bytes.push(
        0xf0 | (point >>> 18),
        0x80 | ((point >>> 12) & 0x3f),
        0x80 | ((point >>> 6) & 0x3f),
        0x80 | (point & 0x3f)
      )
  }
  return sha256(Uint8Array.from(bytes))
}
