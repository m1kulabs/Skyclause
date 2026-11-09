import { notBuilt } from '@skyclause/contracts'
import type { WithTenant } from '../tenancy'

// Spec §1's `withTenant` is f-db's (#91), which `@skyclause/db` doesn't export yet; re-export it from there then.
export const withTenant: WithTenant = notBuilt('f-db')
