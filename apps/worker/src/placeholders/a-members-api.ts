import { nextApprovers as rotaNextApprovers } from '@skyclause/api/rota'
import type { NextApprovers } from '../notifications'

// #103 owns D22's next rota level; the notifications consumer (#155) takes it in this shape.
export const nextApprovers: NextApprovers = rotaNextApprovers
