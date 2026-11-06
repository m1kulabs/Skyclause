'use client'

import { useSelectedLayoutSegments } from 'next/navigation'
import { useEffect, useState } from 'react'
import { reportVitals, routeGroupOf } from './vitals'

/** Mounted once in the root layout: reports the hard navigation's vitals under the route group it loaded in (D40). */
export function WebVitals() {
  const segments = useSelectedLayoutSegments()
  const [group] = useState(() => routeGroupOf(segments))
  useEffect(() => {
    if (group) reportVitals(group)
  }, [group])
  return null
}
