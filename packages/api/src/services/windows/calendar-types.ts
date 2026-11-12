import type { Operations } from '@skyclause/contracts'
import type { z } from 'zod'

type WindowInput = z.infer<Operations['createWindow']['request']['body']['content']['application/json']['schema']>

export type FieldIssue = { pointer: string; detail: string }
export type LocalDate = string // validated YYYY-MM-DD
export type NativeRule = NonNullable<WindowInput['recurrence']>
export type WindowKind = WindowInput['kind']
export type WindowFields = Pick<WindowInput, 'starts_at' | 'ends_at' | 'kind' | 'tz'>
