/** The most pages of windows read to name the windows a count is grouped by. */
const PAGE_LIMIT = 5

export interface WindowName {
  title: string
  starts_at: string
}

type Read = (cursor?: string) => Promise<{
  data: Array<{ id: string; title: string; starts_at: string }>
  next_cursor: string | null
}>

/**
 * Names the windows a count is grouped by: reads the project's windows page by page and stops once every wanted id has
 * been found. An id the project no longer lists is simply absent from the answer; the caller says so in words.
 */
export async function readWindowNames(read: Read, wanted: ReadonlySet<string>): Promise<Map<string, WindowName>> {
  const found = new Map<string, WindowName>()
  let cursor: string | undefined
  for (let pages = 0; pages < PAGE_LIMIT && found.size < wanted.size; pages++) {
    const page = await read(cursor)
    for (const window of page.data) {
      if (wanted.has(window.id)) found.set(window.id, { title: window.title, starts_at: window.starts_at })
    }
    cursor = page.next_cursor ?? undefined
    if (!cursor) break
  }
  return found
}
