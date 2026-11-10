import { notBuilt } from '@skyclause/contracts'
import type { NextApprovers } from '../notifications'

// #79 §1 names `nextApprovers` (a-members-api, #103) without a type; the notifications consumer takes it in this shape.
// #103 replaces this export with its own, keeping the type.
export const nextApprovers: NextApprovers = notBuilt('a-members-api')
