import { getProperty, piRowsStore } from './gas.ts'
import { handlePiRows, PI_ROWS_KIND } from './pi-rows.ts'
import type { GetRoute, PostRoute } from './router.ts'

// Feature tickets register their web app handlers here, one line each.
export const postRoutes: PostRoute[] = [
  {
    kind: PI_ROWS_KIND,
    tokenProperty: 'PI_TOKEN',
    handle: (body) => handlePiRows(body, piRowsStore(getProperty('SHEET_ID') ?? ''), new Date())
  }
]

export const getRoutes: GetRoute[] = []
