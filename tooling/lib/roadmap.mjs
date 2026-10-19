// roadmap.mjs — read and update the `.claude/roadmap.md` register (| Name | Title | Status | Plan |)
// that plan-feature writes and `execute-plan --roadmap` walks, so row selection and status flips
// are code, not table-parsing by eye.
import fs from 'node:fs'

/** Markdown table text → `[{ name, title, status, plan }]` in file order (header and divider skipped). */
export function parseRoadmap (text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
    if (cells.length < 4 || cells[0] === 'Name' || /^-+$/.test(cells[0])) continue
    rows.push({ name: cells[0], title: cells[1], status: cells[2], plan: cells[3] })
  }
  return rows
}

/** `{ active, skippedFuture, done }` — `active` keeps file order (the user's own priority). */
export function selectRows (text) {
  const rows = parseRoadmap(text)
  const by = s => rows.filter(r => r.status === s)
  return { active: by('Active'), skippedFuture: by('Future'), done: by('Done') }
}

/** Returns the roadmap text with `name`'s Status cell replaced; throws if the row doesn't exist. */
export function setStatus (text, name, status) {
  let hit = false
  const out = text.split('\n').map(line => {
    if (!line.trim().startsWith('|')) return line
    const cells = line.split('|')
    if (cells.length < 6 || cells[1].trim() !== name) return line
    hit = true
    cells[3] = ` ${status} `
    return cells.join('|')
  }).join('\n')
  if (!hit) throw new Error(`setStatus: no roadmap row named ${name}`)
  return out
}

/** File wrapper for `setStatus`. */
export function setStatusFile (roadmapPath, name, status) {
  fs.writeFileSync(roadmapPath, setStatus(fs.readFileSync(roadmapPath, 'utf8'), name, status))
  return { ok: true }
}

/** File wrapper for `selectRows`. */
export function selectRowsFile (roadmapPath) {
  return selectRows(fs.readFileSync(roadmapPath, 'utf8'))
}
