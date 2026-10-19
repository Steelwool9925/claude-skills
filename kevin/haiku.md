# kevin — Haiku delegation reference

Read by `kevin/SKILL.md` when launched as `/haiku-split kevin`. Section numbers cited below refer to `kevin/SKILL.md` (and `kevin/e2e.md` for §6.x).

Applies **only** when launched as `/haiku-split kevin [--args "..."]`. Plain `/kevin` ignores this
section. `--args` is verbatim, so write `--args "--plan <path>"`, `--args "--domain <name>"` or
`--args "--e2e"`. `/haiku-split` runs this skill in its dynamic mode: you work every step yourself,
in order, and only the browser driving of named flows goes to Haiku (`claude-haiku-4-5-20251001`).

**What stays with you, unchanged:** §0 gate and plan/map lookup, §0b model floor (it gates the
grading and synthesis this session does, not the Haiku driving), §1 getting the app running,
picking the browser surface and securing safe test targets, §3's coverage verdicts, §3b UI/UX
rating (including the `ui-ux-pro-max` critique — a segment cannot invoke skills), §3c confirming
`map.mjs edges` candidates, §4 report, severities and Correction Plan, §5 announcement, §6.1 cost
checkpoint, §6.3 cross-domain journey, §6.4 report and §6.5 onboarding doc.

**What Haiku does:** drives the live UI through the steps you list, records what happened, nothing
else.

1. **One brief per flow or criterion.** After §1 has the app up and the browser surface chosen,
   write each acceptance criterion (§3), map `## Flow:` (§3 `--domain`, §6.2), or confirmed §3c
   regression check as one brief. Inline: the base URL, the runner command syntax (or the MCP tool names), the
   steps in order, the mistake to try at each step (§2's list, varied across briefs), every
   legitimate route to try (§2b), the safe test data to use, and where to save output. A §3c
   brief is correct-usage only. The full start-to-finish continuous run (§3) is its own brief.
2. **Persona rules go in the brief, not by reference.** Haiku never sees this skill, so copy in:
   interact only through the rendered page; never call an API, edit storage/cookies/requests or
   use devtools to get unstuck — stuck is a finding; never read source, a manifest, a diff or a
   map's `## Structure` paths; snapshot by default, screenshot only clean correct-pass step states
   and at most one per visual finding; console/network output only as evidence for a symptom seen
   on screen; use the runner's file outputs and read a file only when its summary is not enough.
3. **Mechanical done-check.** Each brief's output is one block per step in `notes.md`: step,
   mistake tried + what the page did, each route tried + result, status
   (`exercised | partial | unreachable`), and any finding as `symptom | repro steps | expected |
   actual | screenshot path`. Clean screenshots go to `<run folder>/shots/<brief>-<step>.png`.
   A step with no block, or a finding with no repro steps, fails the check.
4. **One batch per mode run.** `--plan`/`--domain`: one batch. `--e2e`: one batch per domain,
   matching split execution's per-domain passes (§0b/§6.1), each with its own confirmation.
5. **Verify every Haiku result yourself** before it goes in the report: replay every Critical and
   blocking finding's repro steps in the browser and confirm it reproduces; check each claimed
   `exercised` step against its snapshot or screenshot; open each clean screenshot before it feeds
   §3b or §5. A finding that doesn't reproduce is dropped or re-driven by you. A Haiku `DONE`
   line is a claim, not evidence.
6. **A failed, blocked or unverifiable brief is redone by you** in this session. No second Haiku
   pass, no escalation to a larger model, no subagent. Note in the report header which coverage
   ran via Haiku.

