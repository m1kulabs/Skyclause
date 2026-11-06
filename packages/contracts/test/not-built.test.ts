import { describe, expect, it } from 'vitest'
import { NotBuiltError, notBuilt } from '../src/not-built'

describe('notBuilt', () => {
  it('throws NotBuiltError naming the owner when called', () => {
    const draft = notBuilt<(input: string) => Promise<string>>('b-agent')
    expect(() => draft('x')).toThrow(NotBuiltError)
    try {
      draft('x')
    } catch (error) {
      expect((error as NotBuiltError).owner).toBe('b-agent')
    }
  })

  it('throws when a member is called, and is not mistaken for a promise', () => {
    const port = notBuilt<{ send: () => void }>('c-delivery')
    expect(() => port.send()).toThrow(NotBuiltError)
    expect((port as unknown as { then?: unknown }).then).toBeUndefined()
  })
})
