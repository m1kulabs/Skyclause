const CROSSING_FILENAME_RE = /^crossing-(\d{8}-\d{4})-(\d+)\.json$/
const CROSSING_ID_RE = /^X-(\d{8}-\d{4})-(\d+)$/

// Peer claims are inventory tokens only; callers retain their own pack history.
// Native access is deferred until allocation needs this inventory.
export function peerCrossingReservations(destinationFolderId: string, peerFolderId: string | null): string[] {
  const destination = typeof destinationFolderId === 'string' ? destinationFolderId.trim() : ''
  if (!destination) throw new Error('Crossing destination folder ID is not set')
  const peer = typeof peerFolderId === 'string' ? peerFolderId.trim() : ''
  if (!peer) return []
  if (peer === destination) throw new Error('Live crossing packs require separate folders')

  const names = new Set<string>()
  const files = DriveApp.getFolderById(peer).getFiles()
  while (files.hasNext()) {
    const file = files.next()
    if (file.isTrashed()) continue
    const name = file.getName()
    if (CROSSING_FILENAME_RE.test(name)) names.add(name)
    const text = file.getBlob().getDataAsString()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue
    const id = (parsed as { crossing_id?: unknown }).crossing_id
    if (typeof id !== 'string') continue
    const match = CROSSING_ID_RE.exec(id.trim())
    if (match) names.add(`crossing-${match[1]}-${match[2]}.json`)
  }
  return [...names]
}
