// ledger.mjs — execute-plan's ledger bookkeeping as code: build the STAT / APPROVED / CORRECTIONS
// lines, append them, and compute the budget rollup (tokens against the ceiling, per-repo counts,
// highest correction round) that §1 and §5 otherwise have the model re-derive by re-reading the
// whole ledger every task.
import fs from 'node:fs'

const STATUSES = ['DONE', 'DONE_WITH_CONCERNS', 'BLOCKED', 'NEEDS_CONTEXT', 'PASS', 'FAIL']

/** Builds a STAT line. Throws on a missing field or unknown status rather than writing a line a later parse would drop. */
export function statLine ({ task, score, repo, round = 1, status, tokens, by }) {
  for (const [k, v] of Object.entries({ task, score, repo, status, tokens })) {
    if (v === undefined || v === null || v === '') throw new Error(`statLine: missing ${k}`)
  }
  if (!STATUSES.includes(status)) throw new Error(`statLine: unknown status ${status}`)
  return `STAT | task=${task} | score=${score} | repo=${repo} | round=${round} | status=${status} | tokens=${tokens}${by ? ` | by=${by}` : ''}`
}

export const approvedLine = milestone => `APPROVED | milestone=${milestone} | by=user`
export const correctionsLine = (round, items, source = 'test-feature+kevin') => `CORRECTIONS | round=${round} | source=${source} | items=${items}`
export const testsLine = ({ milestone, added, merged, dropped, cov }) => `TESTS | milestone=${milestone} | added=${added} | merged=${merged} | dropped=${dropped} | cov=${cov}`

/** Appends one line (adding the newline, and one before it if the file lacks a trailing one). */
export function appendLine (ledgerPath, line) {
  const existing = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : ''
  fs.appendFileSync(ledgerPath, `${existing && !existing.endsWith('\n') ? '\n' : ''}${line}\n`)
  return { ok: true }
}

/**
 * Parses ledger text into the §1/§5 rollup:
 * `{ tasks, tokens, remaining, ceiling, nearCeiling, perRepo, rounds, approved, correctionRound }`.
 * A task logged more than once (fix rounds) counts once in `tasks`/`perRepo`, but every line's
 * tokens count toward spend. `nearCeiling` is true when `remaining <= maxTaskTokens` (one task's
 * estimate, default 40000) — the hard-stop-and-ask trigger.
 */
export function rollup (ledgerText, { ceiling = 350000, maxTaskTokens = 40000 } = {}) {
  const tasks = new Set()
  const perRepo = {}
  let tokens = 0
  let rounds = 0
  const approved = new Set()
  let correctionRound = 0
  for (const line of (ledgerText || '').split('\n')) {
    if (line.startsWith('STAT |')) {
      const f = Object.fromEntries([...line.matchAll(/(\w+)=([^|\s]+)/g)].map(m => [m[1], m[2]]))
      tokens += Number(f.tokens) || 0
      rounds = Math.max(rounds, Number(f.round) || 0)
      const key = `${f.repo}#${f.task}`
      if (!tasks.has(key)) { tasks.add(key); perRepo[f.repo] = (perRepo[f.repo] || 0) + 1 }
    } else if (line.startsWith('APPROVED |')) {
      const m = line.match(/milestone=(\d+)/)
      if (m) approved.add(Number(m[1]))
    } else if (line.startsWith('CORRECTIONS |')) {
      const m = line.match(/round=(\d+)/)
      if (m) correctionRound = Math.max(correctionRound, Number(m[1]))
    }
  }
  const remaining = ceiling - tokens
  return {
    tasks: tasks.size,
    tokens,
    remaining,
    ceiling,
    nearCeiling: remaining <= maxTaskTokens,
    perRepo,
    rounds,
    approved: [...approved].sort((a, b) => a - b),
    correctionRound
  }
}

/** Reads a ledger file and returns `rollup` of it; a missing file rolls up as empty. */
export function rollupFile (ledgerPath, opts) {
  return rollup(fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : '', opts)
}
