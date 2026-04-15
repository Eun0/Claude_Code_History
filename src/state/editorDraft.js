const KEY = 'editor.draft.v1'

export function readDraft() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      docTitle: typeof parsed.docTitle === 'string' ? parsed.docTitle : '',
      intro: typeof parsed.intro === 'string' ? parsed.intro : '',
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    }
  } catch {
    return null
  }
}

export function writeDraft(draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {}
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
