// Turns an arbitrary thrown value into a readable one-line message.
//
// The motivating case: when a hostname resolves to several addresses and every
// attempt fails, Node rejects with an AggregateError whose own `message` is an
// empty string — so `String(err.message || err)` collapses to the useless
// literal "AggregateError" and the real causes (ECONNREFUSED, EHOSTUNREACH…)
// stay buried in `err.errors`.
export function formatError(err) {
  if (err == null) return 'unknown error'

  if (Array.isArray(err.errors)) {
    const causes = [...new Set(err.errors.map((e) => formatError(e)))]
    const head = err.message || 'all connection attempts failed'
    return causes.length ? `${head}: ${causes.join('; ')}` : head
  }

  const base = err.message || String(err)
  const code = err.code && !base.includes(err.code) ? ` (${err.code})` : ''
  return `${base}${code}`
}
