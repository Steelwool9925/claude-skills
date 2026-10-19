# execute-plan — Haiku delegation reference

Read by `execute-plan/SKILL.md` only when launched as `/haiku-split execute-plan`. Section references are to `execute-plan/SKILL.md`.

## Haiku delegation (via /haiku-split)

Applies **only** when launched as `/haiku-split execute-plan [--args "..."]`. Plain `/execute-plan`
ignores this section. `--args` is verbatim, so write `--args "--roadmap"`. `/haiku-split` runs
this skill in its dynamic mode: you work every step below yourself, in order, and only the
implementation of micro-tasks goes to Haiku (`claude-haiku-4-5-20251001`).

**What stays with you, unchanged:** §0 gate, §1 budget guard, §2 decompose and score (including
the Opus ask for scores 8-10), §3 verification, §4 regression, §5 ledger, §6 branches and the
milestone hard stop, §7 finish, and §8 including `test-feature` and `kevin` (a segment cannot
invoke skills), and §6b cleanup-crew. Branch creation and every state-changing git command are
yours; Haiku never runs them.

**What Haiku does:** writes the code for one micro-task, nothing else. Tests stay with you: §3b
needs the whole milestone's test files in view to extend, parameterize and sweep, which a
single-file micro-task cannot see. Haiku briefs say "write no tests"; you write them after
verifying the diff.

1. **Split every task finer.** After §2 scores a task, cut it into micro-tasks Haiku can do
   mechanically: one file or function, exact signatures and interfaces, an exact acceptance
   check, within the `--task-size` token estimate. The higher the score, the finer the split. The
   parent task keeps its score. A piece you cannot make mechanical stays with you and is
   implemented in this session.
2. **One batch per milestone.** Write the briefs as a run folder (see `/haiku-split` §10), then
   the user confirms the launch (`/haiku-split` §6). Each milestone, and each correction round in
   §8, is a new batch with a new confirmation. Never launch unconfirmed, never launch the next
   milestone before the §6 hard stop is approved.
3. **Verify every diff yourself (§3)** before the next brief that depends on it, or before
   anything depends on it. A parent scored 8-10, or any large diff, gets the line-by-line pass.
   A Haiku `DONE` line is a claim, not evidence.
4. **A failed or rejected micro-task is fixed by you.** No second Haiku pass, no escalation to a
   larger model, no subagent.
5. **Ledger.** Micro-tasks log as `task=<N>.<m>`, the parent keeps `score=`, and a line may end
   with `| by=haiku` or `| by=main`. Plan pruning reads only `APPROVED | milestone=<N> |` lines,
   so the extra field is safe. Haiku segment spend (`startCounter - endCounter` per segment)
   counts against the 350k ceiling in §1; add it to the `tokens=` totals alongside your own.
