// Spec §1 module map: `notBuilt(owner)` stands in for a seam until its owning ticket lands. The value it returns has the
// declared type; calling it, or calling any member of it, throws `NotBuiltError` naming the owner.

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
