// Reverse index: messageUuid -> array of memoIds that contain it.
export function buildMemosByMessage(memos) {
  const idx = new Map()
  for (const memo of memos) {
    for (const uuid of memo.messageUuids || []) {
      if (!idx.has(uuid)) idx.set(uuid, [])
      idx.get(uuid).push(memo.id)
    }
  }
  return idx
}
