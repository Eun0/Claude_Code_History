// Reverse index: messageUuid -> array of memoIds that contain it.
// `excludeMemoId` hides a single memo from the index — used during
// "Edit Message" mode so the memo under edit loses its yellow in-memo
// background; the blue .selected state then represents the *future* membership
// that the user is sculpting.
export function buildMemosByMessage(memos, excludeMemoId) {
  const idx = new Map()
  for (const memo of memos) {
    if (excludeMemoId && memo.id === excludeMemoId) continue
    for (const uuid of memo.messageUuids || []) {
      if (!idx.has(uuid)) idx.set(uuid, [])
      idx.get(uuid).push(memo.id)
    }
  }
  return idx
}
