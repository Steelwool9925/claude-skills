// coverage-summary.mjs — parse a coverage report (lcov.info or Cobertura XML, which covers
// `dotnet test --collect:"XPlat Code Coverage"`, `pytest --cov --cov-report=xml`, JaCoCo-to-
// Cobertura converters and `flutter test --coverage`) into the overall %, per-file buckets and
// uncovered line ranges test-feature §2 asks for — without the model reading the raw report.
import fs from 'node:fs'

const pct = (hit, found) => (found === 0 ? 100 : Math.round((hit / found) * 1000) / 10)

/** Collapses line numbers into `"3-5"`, `"9"` ranges. */
export function toRanges (lines) {
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < sorted.length;) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    out.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`)
    i = j + 1
  }
  return out
}

/** `'Critical'` (0%), `'Partial'` (below threshold), `'Compliant'` (>= threshold, default 80). */
export function bucket (percent, threshold = 80) {
  if (percent === 0) return 'Critical'
  return percent < threshold ? 'Partial' : 'Compliant'
}

/** lcov.info text → `[{ file, lines: Map<n, hits>, branchesFound, branchesHit }]`. */
export function parseLcov (text) {
  const files = []
  let cur = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('SF:')) cur = { file: line.slice(3), lines: new Map(), branchesFound: 0, branchesHit: 0 }
    else if (!cur) continue
    else if (line.startsWith('DA:')) {
      const [n, hits] = line.slice(3).split(',')
      cur.lines.set(Number(n), Number(hits))
    } else if (line.startsWith('BRF:')) cur.branchesFound = Number(line.slice(4))
    else if (line.startsWith('BRH:')) cur.branchesHit = Number(line.slice(4))
    else if (line === 'end_of_record') { files.push(cur); cur = null }
  }
  return files
}

/** Cobertura XML text → same shape as `parseLcov`. Method-level duplicate `<line>`s collapse by number. */
export function parseCobertura (xml) {
  const files = []
  for (const block of xml.split('<class ').slice(1)) {
    const file = (block.match(/\bfilename="([^"]*)"/) || [])[1]
    if (!file) continue
    const body = block.split('</class>')[0]
    const lines = new Map()
    let branchesFound = 0
    let branchesHit = 0
    for (const m of body.matchAll(/<line\b([^>]*)>/g)) {
      const n = (m[1].match(/\bnumber="(\d+)"/) || [])[1]
      const hits = (m[1].match(/\bhits="(\d+)"/) || [])[1]
      if (n === undefined || hits === undefined || lines.has(Number(n))) continue
      lines.set(Number(n), Number(hits))
      const cond = m[1].match(/condition-coverage="[^"]*\((\d+)\/(\d+)\)"/)
      if (cond) { branchesHit += Number(cond[1]); branchesFound += Number(cond[2]) }
    }
    const existing = files.find(f => f.file === file)
    if (existing) { // one source file can appear under several <class> entries (nested/partial classes)
      for (const [n, h] of lines) existing.lines.set(n, Math.max(existing.lines.get(n) || 0, h))
      existing.branchesFound += branchesFound
      existing.branchesHit += branchesHit
    } else files.push({ file, lines, branchesFound, branchesHit })
  }
  return files
}

/**
 * Reads `reportPath` (format sniffed from content) and returns
 * `{ overall: { linePct, branchPct }, buckets: { Critical, Partial, Compliant }, files: [...] }`.
 * Each file: `{ file, linePct, branchPct, bucket, uncovered? }` — `uncovered` (line ranges) only
 * for files whose path ends with one of `focus` (e.g. the plan manifest's changed files) or, when
 * `focus` is empty, for every non-Compliant file. Sorted worst-first.
 */
export function summarize (reportPath, { focus = [], threshold = 80 } = {}) {
  const text = fs.readFileSync(reportPath, 'utf8')
  const parsed = text.trimStart().startsWith('<') ? parseCobertura(text) : parseLcov(text)
  const norm = p => p.replace(/\\/g, '/')
  const focusSet = focus.map(norm)
  let lf = 0; let lh = 0; let bf = 0; let bh = 0
  const files = parsed.map(f => {
    const found = f.lines.size
    const hit = [...f.lines.values()].filter(h => h > 0).length
    lf += found; lh += hit; bf += f.branchesFound; bh += f.branchesHit
    const linePct = pct(hit, found)
    const entry = {
      file: f.file,
      linePct,
      branchPct: f.branchesFound ? pct(f.branchesHit, f.branchesFound) : null,
      bucket: bucket(linePct, threshold)
    }
    const wanted = focusSet.length ? focusSet.some(s => norm(f.file).endsWith(s)) : entry.bucket !== 'Compliant'
    if (wanted) entry.uncovered = toRanges([...f.lines].filter(([, h]) => h === 0).map(([n]) => n))
    return entry
  }).sort((a, b) => a.linePct - b.linePct)
  const buckets = { Critical: 0, Partial: 0, Compliant: 0 }
  for (const f of files) buckets[f.bucket]++
  return { overall: { linePct: pct(lh, lf), branchPct: bf ? pct(bh, bf) : null }, buckets, files }
}
