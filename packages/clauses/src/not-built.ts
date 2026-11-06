// Clauses keeps its own copy because it may import only its CEL library.
export class NotBuiltError extends Error {
  readonly owner: string

  constructor(owner: string) {
    super(`not built: owned by ${owner}`)
    this.name = 'NotBuiltError'
    this.owner = owner
  }
}

export function notBuilt<T>(owner: string): T {
  const fail = (): never => {
    throw new NotBuiltError(owner)
  }
  return new Proxy(fail, {
    apply: fail,
    construct: fail,
    get: (_target, key) => (key === 'then' ? undefined : fail)
  }) as T
}
