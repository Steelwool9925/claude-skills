# map-codebase — Haiku delegation reference

Read by `map-codebase/SKILL.md` only when launched as `/haiku-split map-codebase`. Section references are to `map-codebase/SKILL.md`.

## Haiku delegation (via /haiku-split)

Applies **only** when launched as `/haiku-split map-codebase [--args "..."]`. Plain
`/map-codebase` ignores this section. `--args` is verbatim, so write `--args "--update"` or
`--args "--root <dir>"`. `--verify` never delegates: it is one script call. `/haiku-split` runs
this skill in its dynamic mode: you work every step yourself, in order, and only the drafting of
domain maps and digests of long project docs go to Haiku (`claude-haiku-4-5-20251001`).

**What stays with you, unchanged:** §0 model floor, Preflight (`scan`, the search-hints ledger,
`gitignore --write`), deciding which docs are authoritative, carving domains, `index.md`,
`ARCHITECTURE_MAP.md`, `## Build & test commands` (including asking the user on `stackHint`), the
search-hints ledger, every `verify` run and its guardrail check, and all of `## Publishing`.

**What Haiku does:**

1. **Doc digest (optional).** A long project doc (Preflight step 3) can go to Haiku as one brief:
   the doc path, the sections to read (architecture, build, gotchas), and an output file of short
   bullet claims, each with the heading it came from. You still read the cited headings yourself
   wherever the digest decides a domain boundary or contradicts the tree.
2. **Domain map draft.** After you carve domains, write one brief per domain map to write (on
   `--update`, only maps whose `regenerate` is true). Inline: the domain name and purpose, its
   anchor entry points, the exact files Haiku may read, the `## What to write` template and rules
   copied in full (backticked exact-case paths, required `## Structure`, `Generated: <date>
   (<sha>)` with the sha you give it, explicit side effects or "(none)", mermaid only above three
   steps, no code, no commands, no secrets or config contents), and the output path
   `.claude/maps/<domain>.md`. Haiku never reads files outside its list and never writes
   `index.md`.
3. **Mechanical done-check.** The draft exists at its path, carries the `Generated:` line,
   `## Structure` and at least one `## Flow:` with all four parts, and
   `node ~/.claude/skills/map-codebase/map.mjs verify` reports no drift, empty map or guardrail
   hit for it. Haiku also writes the locations it found to `notes.md` as candidate ledger lines.
4. **One batch per run.** A full build or `--update` is one batch, confirmed by the user before
   launch.
5. **Verify every draft yourself** before it is cited, published or folded into `index.md`: read
   it in full; for each flow open its entry point and confirm the call order; check every side
   effect line against source and look for missed ones (db writes, external calls, queues, file
   writes, cache invalidations); check the domain doesn't contradict an authoritative doc. A
   Haiku `DONE` line is a claim, not evidence. You fold the candidate ledger lines in after
   checking them.
6. **A failed or wrong draft is fixed by you** in this session. No second Haiku pass, no
   escalation to a larger model, no subagent. Publishing never goes to Haiku.
