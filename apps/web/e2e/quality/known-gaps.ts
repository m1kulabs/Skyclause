// Findings the crawl expects today, each owned by an open issue. A listed gap is reported, not failed; a gap
// that stops occurring fails the crawl so its entry is removed.
export interface KnownGap {
  route: string
  check: string
  issue: number
  why: string
}

export const KNOWN_GAPS: KnownGap[] = []
