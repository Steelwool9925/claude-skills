# plan-feature — Haiku delegation reference

Read by `plan-feature/SKILL.md` only when launched as `/haiku-split plan-feature`. Section references are to `plan-feature/SKILL.md`.

## Haiku delegation (via /haiku-split)

Applies **only** when launched as `/haiku-split plan-feature [--args "..."]`. Plain
`/plan-feature` ignores this section and never delegates. `--args` is verbatim, so write
`--args "--ado 1234"`. `/haiku-split` runs this skill in its dynamic mode: you work every step in
order and only the three pieces below go to Haiku (`claude-haiku-4-5-20251001`). Every batch is a
separate run and needs its own user confirmation (`/haiku-split` §6).

**Haiku may do only:**

- **(a) ADO fetch.** Run `ado.ps1 workitem` per §1 and write the stripped plain text of the
  fields listed there to a file in the run folder. It never prints the PAT and never writes to
  ADO.
- **(b) Dossier.** Copy, verbatim, the map sections you name (from `.claude/maps/index.md` and the
  domain maps), the `map.mjs scan` `projectDocs` list, and the `map.mjs workspace` exit code (and
  `WORKSPACE_MAP.md` sections you name) into one file. No summarising, no judgement.
- **(c) Roadmap upsert.** After `ExitPlanMode` approval and after you write the plan, upsert the
  item's row in `.claude/roadmap.md` with the exact values you give it.

**Everything else stays with you:** the classification questions, the empty-ticket rule, the
complexity score and model gate, `ui-ux-pro-max`, `EnterPlanMode`, the tier design, the scoring,
milestones, every `AskUserQuestion`, `ExitPlanMode`, and writing `FEATURE_PLAN_<Name>.md`. You
read the fetched or copied files yourself before relying on them; a Haiku `DONE` line is a claim.

**Ordering.** Plan mode forbids writes, so run folders cannot be created inside it. Batches (a)
and (b) therefore run **before** `EnterPlanMode`: (a) right after §1's questions, (b) after the
complexity gate and before step 2 calls `EnterPlanMode`. Batch (c) runs after `ExitPlanMode` is
approved. If the maps are missing, say so and offer `/map-codebase` as step 2 already requires;
do not delegate source scanning.
