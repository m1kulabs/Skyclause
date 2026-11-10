import type { ApiFamily } from './contract'

export class SchemaError extends Error {
  override name = 'SchemaError'
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string
  ) {
    super(`HTTP ${status} from ${url}`)
    this.name = 'HttpError'
  }
}

export class TimeoutError extends Error {
  constructor(readonly url: string) {
    super(`HTTP request timed out: ${url}`)
    this.name = 'TimeoutError'
  }
}

export class NetworkError extends Error {
  constructor(
    readonly url: string,
    cause: unknown
  ) {
    super(`Network request failed: ${url}`, { cause })
    this.name = 'NetworkError'
  }
}

export class RateLimitedError extends Error {
  constructor(readonly family: ApiFamily) {
    super(`Request budget exhausted: ${family}`)
    this.name = 'RateLimitedError'
  }
}
