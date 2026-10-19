# execute-plan — roadmap execution reference

Read by `execute-plan/SKILL.md` §8 when launched with `--roadmap`. Section references (§0–§7, §6b) are to `execute-plan/SKILL.md`.

## 8 — Roadmap execution

`/execute-plan --roadmap [--optimism <1-5>]`. A roadmap is just a list of feature plans — the
register at `.claude/roadmap.md` (container-level too, in a workspace) that `plan-feature` writes.
This mode works through it instead of a single plan, converging each item before moving to the
next.

**Locate the register.** If `.claude/roadmap.md` doesn't exist, say so and stop — there is
nothing to execute. Read every row.

**Select rows.** `node ~/.claude/skills/tooling/cli.mjs roadmap.selectRowsFile '[".claude/roadmap.md"]'`
returns `{active, skippedFuture, done}`; flip a row with `roadmap.setStatusFile '[<path>, "<Name>", "Done"]'`.
Only rows with Status `Active` are in scope, in the order they appear in the
file — that order is the user's own priority, not something to re-sort. Skip `Future` rows: print
which were skipped and that `plan-feature`'s Design checkpoint means they aren't meant to be built
yet. Skip rows already `Done`. If nothing is `Active`, say so and stop.

**Before starting, name the cost.** Print how many `Active` rows were found. Each one runs its own
full build plus a test-feature/kevin convergence loop that can itself repeat several rounds — this
is a multi-x spend over a single-plan run, the contract's escalation checkpoint. State that plainly
before the first item starts.

### Per-item convergence loop

For each selected row, in order:

1. **Build.** Run §0 through §7 exactly as normal against that row's Plan path. Nothing about
   milestone execution changes in roadmap mode — the same per-milestone hard stop in §6 still
   applies, including the §6b cleanup after each approval; roadmap mode does not run milestones
   unattended.
2. **Grade the diff.** Invoke the `test-feature` skill (`Skill` tool) with
   `--plan <path> --optimism <n>` (`<n>` is the roadmap invocation's `--optimism`, default 3).
   `test-feature` never spawns subagents by its own rule — nothing extra to enforce here.
3. **Grade the live app.** Invoke the `kevin` skill (`Skill` tool) with `--plan <path>`.
4. **Check convergence** against both reports:
   - **test-feature clean** — Verdict is not "do not ship", and Critical Failures is empty.
     (Warnings may remain; those aren't the "major errors" this loop gates on.)
   - **kevin clean** — Verdict is not "broken", every acceptance criterion/milestone in Coverage
     is marked exercised (none partial or unreachable — a gap there means Kevin never actually
     reached part of the feature, the opposite of understanding it completely), and Issues
     contains no **Critical** entries. (Confusing/Minor may remain.)
   - Both conditions must hold together.
5. **Converged** → set the row's Status to `Done` in `.claude/roadmap.md`. If correction rounds
   left the tree dirty, run one more mid-feature cleanup (§6b, same branch) to commit and push
   them, then cleanup-crew's step 8 (plan pruning) for this item's plan; step 9 only after the
   last `Active` item. Print a short summary
   (what shipped, any remaining Warnings/Confusing/Minor items left for a human to judge), then
   **hard pause**: ask the user before starting the next `Active` row. Do not auto-advance.
6. **Not converged** → merge the two reports' Correction Plans into one de-duplicated, repo-tagged
   task list, and run it through this skill's own §2–§4 decompose/verify/regression loop as a
   synthetic milestone. Log it on the item's ledger as its own round:
   ```
   CORRECTIONS | round=<k> | source=test-feature+kevin | items=<n>
   ```
   A correction round has no user hard stop, so it gets no cleanup of its own; its changes are
   committed by the item's closing cleanup (step 5). Then repeat from step 2 — re-grade with fresh test-feature and kevin runs; a correction can
   introduce a new problem as easily as it fixes the reported one.
7. **Round ceiling.** 5 correction rounds per item. Reaching it without converging is a hard stop,
   not a silent continuation: report what's still failing after 5 rounds and ask the user how to
   proceed — raise the ceiling, accept the item as-is, or drop it from this run. Never loop past it
   unasked.

**Resuming a roadmap run.** `.claude/roadmap.md`'s Status column is the resume state — rows already
`Done` are skipped, `Active` rows pick back up at step 1. Check the item's own
`.claude/plans/<Name>.ledger.md` for the highest `CORRECTIONS round=` line to know which round to
resume from rather than restarting the loop at round 1.
