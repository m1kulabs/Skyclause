import type { Instant, Pack } from '@skyclause/clauses'

export interface EvaluatorQuery {
  projectId: string
  pack: Pack
  tEval: Instant
}
