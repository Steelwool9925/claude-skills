---
name: execute-plan
description: >
  Execute an approved FEATURE_PLAN milestone by milestone: decompose into atomic tasks,
  dispatch capped subagents via the Workflow tool under a hard token ceiling, verify every
  result as controller, re-evaluate regressions, and hard-pause at each milestone for user
  testing. Triggered by /execute-plan.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Workflow, AskUserQuestion, TaskCreate, TaskUpdate
---

# execute-plan

You are the **controller**. Subagents write code; you decide whether it is right. The plan is the
source of truth. Artifact paths and cost discipline come from
`~/.claude/skills/_shared/pipeline-contract.md`.

## 0 — Gate

- **If plan mode is active, STOP:** "execute-plan implements an approved plan — approve it
  first." This skill executes; it does not write plans.
- **Locate the plan:** an explicit argument, else the newest `.claude/plans/FEATURE_PLAN_*.md`
  (check the container as well as the current repo), else ask. Read it **once** and extract the
  selected tier, its File Impact Manifest, its milestones, the test cases, and the contingency
  section.
- **Determine the repo set** from the plan's `**Repos:**` line and the manifest's Repo column.
  One repo → everything below behaves as it always has. Several → see *Cross-repo execution*.
- **Conflict scan, one shot:** read the plan for contradictory tasks or plan-mandated defects.
  Batch-ask which governs before starting. Clean → proceed silently.

## 1 — Budget guard

**The ceiling is 350k output tokens per milestone.** Set it as `budget.total` in the Workflow
script.

Before dispatching anything, print the milestone's projected cost by summing the plan's per-task
token bands (S ~5–15k, M ~15–40k, L ~40–100k, XL >100k). Show it to the user alongside the
ceiling.

While running, check `budget.remaining()` before each dispatch. When it falls below the next
task's estimate, **hard-stop and ask** whether to continue. Never silently exceed the ceiling.

The figure is revisable — the user can raise it for a given run — but it is never quietly
ignored. This exists because a runaway execution loop can consume a week's allowance in a single
milestone.

## 2 — Model policy

| Role | Model | Does |
|---|---|---|
| **Controller — you** | session model, typically Opus 5 | decompose, **all verification**, regression re-eval, adjudication |
| **Subagent — mechanical** | `claude-haiku-4-5-20251001` | transcription, boilerplate, mechanical edits |
| **Subagent — judgment** | `claude-sonnet-5` | wiring, non-trivial logic, every escalation |

🔒 **Subagents never exceed Sonnet.** Always specify the model explicitly on every dispatch — an
omitted model inherits the controller's Opus and violates the cap.

## 3 — Decompose

Break the current milestone into the **smallest possible single-step atomic tasks** — "create
interface X", "implement method Y", "update unit test Z". For each, write a self-contained brief:
goal, files, interfaces produced by earlier tasks, acceptance criteria, the plan's global
constraints, and the model tier.

Classify each task's complexity to pick its tier. Mechanical → Haiku. Judgment → Sonnet.

## 4 — Escalation ladder

Three subagent attempts per atomic task, then you take over:

1. **Attempt 1** — `claude-haiku-4-5-20251001`.
2. **Attempt 2** — `claude-sonnet-5`, with your findings from attempt 1.
3. **Attempt 3** — `claude-sonnet-5`, with accumulated findings from attempts 1–2.
4. **Controller** — you implement the task yourself. Progress is never blocked by a capped model.

The original brief called for escalating to Opus on strike 3. That is deliberately replaced by
"the controller does it" — the same capability, without handing an unsupervised subagent the
expensive model.

## 5 — Verification

**A capped subagent never grades its own work.** After every task, verify the diff against:

1. the atomic task brief, and
2. the plan's global constraints and test cases.

Check adherence to the architecture map, syntax correctness, logical errors, and alignment with
the atomic task goal. Large diff → dispatch a dedicated `claude-sonnet-5` verifier subagent to
keep your context clean. Small diff → verify inline.

If errors are found, return a **strict list of corrections** to feed into the next attempt.

## 6 — Regression re-evaluation

After each task, validate the **integration so far**, not just the new task. If a later task
broke an earlier one: re-run the affected earlier tests, locate the regression, dispatch a fix.

**The plan governs.** If the plan is genuinely self-contradictory — a later step cannot coexist
with an earlier one — STOP and escalate it to the user as a plan defect. Do not improvise around
it.

## 7 — Ledger

`.claude/plans/<Name>.ledger.md` is the compaction-proof recovery map. First line names the plan
file. Append one line per dispatch **and** per verification:

```
STAT | task=<N> | repo=<name> | role=subagent|verifier|verify-inline | model=<haiku-4-5|sonnet-5|controller> | round=<k> | status=<DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT|PASS|FAIL> | tokens=<n>
```

`repo=` is always present — single-repo runs repeat one value. Without it a resumed run cannot
tell which repository a task belonged to, and a cross-repo ledger becomes unreadable after
compaction.

For a cross-repo plan the ledger lives at `<container>/.claude/plans/<Name>.ledger.md` and
records the worktree path for each repo.

Keep a rollup at the top of the section: dispatches by tier, verifier count, total fix rounds,
cumulative tokens against the 350k ceiling, and a per-repo task count. A `model=` value above
`sonnet-5` on a subagent or verifier line is a cap violation and a red flag.

## 7b — Cross-repo execution

When the plan names more than one repo:

- **One worktree per affected repo.** Each repo is independently versioned, so each needs its own
  isolated checkout. Create them all before the milestone starts and record the mapping in the
  ledger — a task dispatched against the wrong worktree edits the wrong repository.
- **Every atomic task names its repo.** The task brief states the repo and the worktree path;
  paths inside the brief stay repo-relative. Never hand a subagent a path it must resolve against
  an unstated root.
- **Verification is per repo, integration is across them.** Verify each task in its own repo, then
  ask the separate question of whether the repos still agree — a backend route rename verifies
  perfectly while breaking the client that calls it.
- **Respect the plan's deployment ordering.** Where a milestone states one, the task order must
  follow it. If the plan is silent and the change crosses a contract, stop and ask rather than
  guessing an order.
- **Contract regeneration is a task, not a cleanup step.** If the plan names a regeneration command
  (a generated client, a schema, stubs), dispatch it as its own atomic task and verify its output
  like any other diff.
- **The 350k ceiling is per milestone, not per repo.** A milestone spanning four repos gets the
  same budget as one spanning a single repo. Say so when projecting cost.

## 8 — Isolation and milestone pause

Isolate the workspace with `superpowers:using-git-worktrees` when the target is a git repo; use
its non-git fallback otherwise. Build in place **only** with explicit user go-ahead. For a
cross-repo plan this means one worktree per affected repo, per §7b.

Execute tasks sequentially until the milestone is complete, then **hard stop** and print exactly:

> Milestone [X] complete. Please run your tests and verify the functionality. Type 'Approve' to
> begin the next milestone, or provide feedback for corrections.

Wait for explicit input. Do not decompose the next milestone until approved.

## 9 — If the Workflow opt-in is declined

The Workflow tool needs the user's multi-agent opt-in. If declined, **degrade to a
single-context executor**: do each task yourself with the same verify / fix / regression loop,
and say so plainly. Do not silently fall back to a weaker process.

## 10 — Finish

Run the plan's end-to-end verification section plus a final whole-branch review. Declare done
only when **all** acceptance criteria and test cases pass — evidence before assertions. Then hand
off to `superpowers:finishing-a-development-branch`, or report status plainly if the target is
not git.

## Red flags — STOP

| About to… | Reality |
|---|---|
| Dispatch a subagent without an explicit model | It inherits Opus. Set the model, every time. |
| Let a subagent verify its own work | Verification is the controller's job. Always. |
| Exceed Sonnet to break a stuck loop | Forbidden. At the cap you take over yourself. |
| Silently pass the 350k ceiling | Hard-stop and ask. The ceiling is the point. |
| Declare "done" without running the plan's verification | Run it. Evidence first. |
| Treat a subagent's edit as truth over the plan | The plan governs. Re-verify. |
| Skip verification because "this task is trivial" | Trivial tasks break integration. Verify every one. |
| Dispatch a task without naming its repo and worktree | It will edit the wrong repository. Always state both. |
| Call a cross-repo milestone done after verifying each repo alone | Each repo passing is not the repos agreeing. Check the contract. |
| Treat contract regeneration as tidy-up after the "real" work | It is the change. Dispatch and verify it as a task. |

## Next step

`/test-feature --plan <path> --optimism <1-5>` grades the result. Name it; do not invoke it.
