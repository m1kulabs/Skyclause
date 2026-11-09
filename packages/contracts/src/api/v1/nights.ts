import { listNights } from './nights/listNights'
import { getNight } from './nights/getNight'

export { listNights } from './nights/listNights'
export { getNight } from './nights/getNight'

export const routes = [listNights, getNight] as const
