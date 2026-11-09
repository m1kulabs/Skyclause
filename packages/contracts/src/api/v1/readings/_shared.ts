import { z } from '@hono/zod-openapi'
import {
  PollRecordedEventSchema,
  SourceErrorEventSchema,
  SourceRecoveredEventSchema,
  SourceStaleEventSchema
} from '../../../events'

export const ReadingStreamEvent = z.union([
  SourceErrorEventSchema,
  SourceStaleEventSchema,
  SourceRecoveredEventSchema,
  PollRecordedEventSchema
])
