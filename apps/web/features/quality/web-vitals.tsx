'use client'

import { useEffect } from 'react'
import { reportVitals } from './vitals'
import type { RouteGroup } from '@skyclause/contracts/analytics'

/** Mounted once in the root layout: reports the hard navigation's vitals under the route group it loaded in (D40). */
export function WebVitals({ routeGroup }: { routeGroup?: RouteGroup }) {
  useEffect(() => {
    if (routeGroup) reportVitals(routeGroup)
  }, [routeGroup])
  return null
}
