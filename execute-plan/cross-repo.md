# execute-plan — cross-repo execution reference

Read by `execute-plan/SKILL.md` §5b when the plan's `**Repos:**` line or manifest names more than one repo.

## 5b — Cross-repo execution

When the plan names more than one repo:

- **One branch per affected repo.** Each repo is independently versioned, so each needs its own
  branch off its own `main-windows`/`main`, created in place in that repo's own directory. Create
  them all before the milestone starts and record the mapping in the ledger — working against
  the wrong repo directory edits the wrong repository.
- **Every atomic task names its repo.** The task brief states the repo and its directory; paths
  inside the brief stay repo-relative. Never work from a path you'd have to resolve against an
  unstated root.
- **Verification is per repo, integration is across them.** Verify each task in its own repo, then
  ask the separate question of whether the repos still agree — a backend route rename verifies
  perfectly while breaking the client that calls it.
- **Respect the plan's deployment ordering.** Where a milestone states one, the task order must
  follow it. If the plan is silent and the change crosses a contract, stop and ask rather than
  guessing an order.
- **Contract regeneration is a task, not a cleanup step.** If the plan names a regeneration command
  (a generated client, a schema, stubs), run it as its own atomic task and verify its output like
  any other diff.
- **The 350k ceiling is per milestone, not per repo.** A milestone spanning four repos gets the
  same budget as one spanning a single repo. Say so when projecting cost.
