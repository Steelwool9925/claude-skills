---
name: execute-plan
description: >
  Execute an approved FEATURE_PLAN milestone by milestone in this session under a hard token ceiling, hard-pausing for user testing, then run cleanup-crew on approval. With --roadmap, works every Active item in .claude/roadmap.md. Never spawns a subagent except Haiku micro-tasks via /haiku-split. Triggered by /execute-plan.
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, AskUserQuestion
---

# execute-plan

**Never spawn a subagent — not via `Agent`, not via `Workflow`, not via any other dispatch
surface — except Haiku segments launched through `/haiku-split` under the `## Haiku delegation
(via /haiku-split)` section below, after the user's per-launch confirmation.** Plain
`/execute-plan` never delegates. You are always the sole verifier: every verification pass and
every ledger line is written by you, in this session, yourself; unless that section is in force,
you are also the sole implementer. The plan is
the source of truth. Artifact paths and cost discipline come from
`~/.claude/skills/_shared/pipeline-contract.md`. The complexity rubric used in §2 comes from
`~/.claude/skills/_shared/complexity-scoring.md`, repurposed here as a verification-rigor and
session-model signal, never as a dispatch tier — there is no tier to dispatch to.

## 0 — Gate

- **`--roadmap` passed?** Skip everything below — go to §8 instead. Roadmap mode processes
  several plans; the rest of this gate through §7 governs a single plan.
- **If plan mode is active, STOP:** "execute-plan implements an approved plan — approve it
  first." This skill executes; it does not write plans.
- **Locate the plan:** an explicit argument, else the newest `.claude/plans/FEATURE_PLAN_*.md`
  (check the container as well as the current repo), else ask. Read it **once** and extract the
  selected tier, its File Impact Manifest, its milestones, the test cases, the contingency
  section, and — if present — its `## Design Direction`. Its absence means the plan was judged
  non-UI at planning time; don't invent one.
- **Determine the repo set** from the plan's `**Repos:**` line and the manifest's Repo column.
  One repo → everything below behaves as it always has. Several → see *Cross-repo execution*.
- **Conflict scan, one shot:** read the plan for contradictory tasks or plan-mandated defects.
  Batch-ask which governs before starting. Clean → proceed silently.

## 1 — Budget guard

**The ceiling is 350k output tokens per milestone**, all of it yours — there is no dispatch spend
to separate out, since nothing is ever dispatched. Track it yourself; the harness has no separate
budget-accounting surface for a single session's own generation.

Before starting, print the milestone's projected cost by summing the plan's per-task token bands
(S ~5–15k, M ~15–40k, L ~40–100k, XL >100k). Show it to the user alongside the ceiling.

While running, check the remaining budget before each task — computed from **actual tokens spent
so far**, not the original projection. Sum the `tokens=<n>` field off every `STAT` line already
written to the ledger this milestone (§5 requires each task to log its own real count) and
subtract that running total from the 350k ceiling. Do not re-read the ledger to sum it:

```bash
node ~/.claude/skills/tooling/cli.mjs ledger.rollupFile '["<ledger path>"]'
```

returns `{tasks, tokens, remaining, nearCeiling, perRepo, correctionRound, approved, ...}` over the
whole ledger, so note the `tokens` value when a milestone begins and subtract it to get that
milestone's spend; `nearCeiling: true` is the hard-stop-and-ask trigger below. The projection in this section is a
before-the-fact heads-up for the user, useful for exactly one thing: comparing against the
ledger's actual total at the end (§5 already asks for this). It is never the number a live
go/no-go decision is made against, because a milestone running hotter than planned must be caught
while it is happening, not discovered afterward in the rollup. When actual-so-far falls within one
task's estimate of the ceiling, **hard-stop and ask** whether to continue. Never silently exceed
the ceiling, and never let a stale projection wave through a task that measured spend would have
stopped.

The figure is revisable — the user can raise it for a given run — but it is never quietly
ignored. This exists because a runaway execution loop can consume a week's allowance in a single
milestone.

**Output tokens are not the whole bill.** This ceiling counts generation, which is the priciest
per token but rarely the largest share of a milestone's spend — that is input: the plan, the maps,
the diffs and the files, re-read as each task is worked. A milestone can sit well under 350k output
and still be the most expensive thing the pipeline does all week. So treat the ceiling as one of
two guards, and watch task **count** as the second — if a milestone's task count climbs past what
the plan projected, say so at the same checkpoint, even when output tokens look fine.

## 2 — Decompose

Break the current milestone into the **smallest possible single-step atomic tasks** — "create
interface X", "implement method Y", "update unit test Z". For each, write a self-contained brief:
goal, files, interfaces produced by earlier tasks, acceptance criteria, and the plan's global
constraints. If the plan carries a `## Design Direction` and the task touches a UI file, include
it verbatim in the brief's global constraints — this is what keeps every UI task visually
consistent without re-deriving style choices per task.

Every brief that adds or changes logic also carries a **test obligation**: the existing test file
to extend (or "none found"), the branches the change introduces, and the plan test cases it
satisfies. Tasks that touch only trivial code (§3b) state "no test". Do not decompose "write
tests" as its own task — tests belong to the task whose branches they cover, so §3b can merge them.

Score each task against its own brief using the task-level rubric in
`~/.claude/skills/_shared/complexity-scoring.md`. There is no tier to dispatch to — you implement
every task yourself, regardless of score. Look up what the score means deterministically:

```bash
node ~/.claude/skills/tooling/cli.mjs complexity-scoring.modelForGate '["taskLevel", <score>]'
```

Returns `{"guidance": "<text>"}` — never a model, since nothing is ever dispatched. The score still
does two things:

- **Sets verification rigor** (§3): a higher score gets a slower, more skeptical read of its own
  diff before you move on, the same way a large diff always does regardless of score.
- **Flags a session-model gap.** A task scoring 8-10 is exactly the kind of task the pipeline used
  to reserve for the controller alone (never a capped subagent) — if the session is not currently
  running at Opus tier, tell the user the score and ask whether to switch before implementing it,
  the same gate `plan-feature` applies at design time. Proceeding anyway on a lower tier is the
  user's call to make explicitly, not yours to default into.

Record the score on the task's ledger line (`score=<n>`, see §5) so a resumed run can see why a
task got the scrutiny it did without re-deriving the call.

## 3 — Verification

After every task, verify the diff yourself against:

1. the atomic task brief, and
2. the plan's global constraints and test cases.

Check adherence to the architecture map, syntax correctness, logical errors, and alignment with
the atomic task goal — and, for a UI diff, adherence to the plan's Design Direction (style,
palette, typography, component patterns).

**Verify with a fresh, skeptical read — don't rubber-stamp your own implementation.** Re-read the
diff as if someone else wrote it: re-derive what it should do from the brief before checking what
it actually does, rather than confirming the intent you already had in mind while writing it. A
large diff, or a task scored 8-10 in §2, earns a slower, line-by-line pass; a small diff on a
low-scored task can be verified more quickly, but never skipped.

**The lever here is thoroughness, not a second opinion.** There is no verifier subagent to catch
what you missed, so the read has to be genuinely adversarial toward your own work — actively
looking for the ways the diff could satisfy the brief's letter while missing its intent, not just
confirming it compiles.

If errors are found, fix them yourself and re-verify before moving on.

## 3b — Test economy

The goal is the fewest tests that cover the most lines and branches of the code the milestone
changed. A test earns its place by covering a line or branch nothing else covers, or by pinning a
plan acceptance criterion. Apply this to every test you write or touch, in every task.

**Before writing a test, in this order:**

1. **Find an existing test to extend.** Grep the test project for the unit under test. If one
   exists, add a case, row, or assertion to it rather than a new test.
2. **Parameterize.** Cases that differ only by input and expected output go in one data-driven test
   (`[Theory]`/`[TestCase]`, `it.each`, `@pytest.mark.parametrize`, table tests), one row per
   branch.
3. **Write a new test only when 1 and 2 cannot hold the case**, and then write the one test whose
   inputs drive the most uncovered branches through the unit.

**What a test must be:**

- **Behavioural.** It asserts observable output, state change, or a thrown error for a given
  input. A test that only checks a mock was called, restates the implementation, or has no
  assertion is rejected.
- **Non-trivial target.** No tests for getters/setters, DTOs and records, DI wiring, generated
  code, or framework behaviour.
- **Plan-mandated tests stay.** Run every plan test case. You may merge one into another test or a
  parameterized row, but never drop one that covers a unique branch or acceptance criterion.

**Prove it with coverage, line and branch.** Run the project's own coverage tool scoped to the
files the task changed, before and after adding tests.

- A new test must raise line or branch coverage on a changed file. If it doesn't, merge it into a
  test that does, or delete it.
- Keep coverage output out of context: run the coverage command with
  `quiet-run.runToFile '["<repo root>", "<coverage command>", "<out file>"]'` and read the report
  with `coverage-summary.summarize '["<lcov.info or cobertura.xml>", {"focus": ["<changed file>"]}]'`
  (both via `node ~/.claude/skills/tooling/cli.mjs <module>.<export> '[args]'`). Never read the raw
  report or the command's full output; grep the out file for a failing line.
- If no coverage tool is configured, tell the user, write `cov=n/a` on the `TESTS` line, and map
  each branch of the changed code to its test by hand instead. Do not install a tool unasked.
- Uncovered branches that are unreachable (defensive guards, impossible states) are listed in the
  report, not given contrived tests.

**Milestone sweep.** Before the §6 hard stop, review every test file the milestone added or
touched. Merge tests that exercise the same unit through overlapping branches, collapse
copy-pasted cases into parameterized rows, delete any test whose removal leaves line and branch
coverage unchanged and no plan test case or acceptance criterion uncovered. Re-run the suite and
coverage after the sweep to confirm nothing dropped. Then append:

```
TESTS | milestone=<N> | added=<a> | merged=<m> | dropped=<d> | cov=<line%>/<branch%>
```

`cov=` is measured on the milestone's changed files, not the whole repo.

## 4 — Regression re-evaluation

After each task, validate the **integration so far**, not just the new task. If a later task
broke an earlier one: re-run the affected earlier tests, locate the regression, and fix it yourself.

**The plan governs.** If the plan is genuinely self-contradictory — a later step cannot coexist
with an earlier one — STOP and escalate it to the user as a plan defect. Do not improvise around
it.

## 5 — Ledger

`.claude/plans/<Name>.ledger.md` is the compaction-proof recovery map. First line names the plan
file. Append one line per task, after it is implemented and verified:

```
STAT | task=<N> | score=<1-10> | repo=<name> | round=<k> | status=<DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT|PASS|FAIL> | tokens=<n>
```

On a milestone's hard-stop approval (§6), append one more line:

```
APPROVED | milestone=<N> | by=user
```

This is the only record that a milestone actually cleared its hard stop — `/cleanup-crew`'s step 8
(`plan-pruning`) reads it back to decide whether a finished plan is safe to delete, comparing it
against the chosen tier's milestone numbers in the plan itself. A milestone with no `APPROVED` line
reads as still pending, forever, even after the plan's row is marked `Done` in the roadmap — write
it in the same breath as printing the hard-stop message, not as an afterthought.

After each approved milestone's cleanup (§6b), append:

```
CLEANUP | milestone=<N> | commit=<hash> | push=<ok|failed|skipped>
```

`plan-pruning` and the ledger rollup match only `STAT`, `APPROVED` and `CORRECTIONS` lines, so this
line is safe alongside them.

`score=` is the task's complexity-scoring result from §2 — keep it even after a later round fixes
the task, so a resumed run can see how much scrutiny it got without re-deriving the call.

`repo=` is always present — single-repo runs repeat one value. Without it a resumed run cannot
tell which repository a task belonged to, and a cross-repo ledger becomes unreadable after
compaction.

For a cross-repo plan the ledger lives at `<container>/.claude/plans/<Name>.ledger.md` and
records the branch name for each repo.

Keep a rollup at the top of the section: total fix rounds, cumulative tokens against the 350k
ceiling, and a per-repo task count.

Append each `STAT` line yourself, as the last action on that task, before moving to the next one —
this is pure bookkeeping, not a reason to route it through anything else. The `ledger` module
builds and appends every line type (`statLine`, `approvedLine`, `correctionsLine`, `testsLine`,
`appendLine`), rejecting a missing field or unknown status before a bad line is written; the
formats above stay the contract.

## 5b — Cross-repo execution

Applies only when the plan names more than one repo. **Read `execute-plan/cross-repo.md` (next to
this file) before §1 and follow it** — one branch per repo, every task names its repo, per-repo
verification plus cross-repo integration, deployment ordering, contract regeneration as a task, and
the 350k ceiling per milestone, not per repo.

## 6 — Isolation and milestone pause

Isolate the workspace with a **branch, in place** — never a worktree. For a cross-repo plan this
means one branch per affected repo, each checked out in that repo's own directory, per §5b.

**Step 0 — detect existing isolation.** If the current branch is not the repo's base branch
(neither `main-windows` nor `main`), the workspace is already isolated — skip branch creation and
build on the branch you're on.

**Step 1 — resolve the base branch.** `main-windows` if it exists, else `main`:

```bash
if git show-ref --verify --quiet refs/heads/main-windows || \
   git show-ref --verify --quiet refs/remotes/origin/main-windows; then
  BASE_BRANCH=main-windows
else
  BASE_BRANCH=main
fi
```

**Step 2 — branch off it.**

```bash
git checkout "$BASE_BRANCH"
git pull
git checkout -b "feature/<Name>"
```

`<Name>` is the plan's own name derivation (`~/.claude/skills/_shared/pipeline-contract.md`). If
`git checkout "$BASE_BRANCH"` would discard uncommitted work, stop and ask rather than switching
over it.

If the target is not a git repo at all, say so and build in place — there is nothing to branch.

Execute tasks sequentially until the milestone is complete, run the §3b milestone sweep, then
**hard stop** and print exactly:

> Milestone [X] complete. Please run your tests and verify the functionality. Type 'Approve' to
> begin the next milestone, or provide feedback for corrections.

Wait for explicit input. Do not decompose the next milestone until approved. On approval, append
the milestone's `APPROVED | milestone=<N> | by=user` line to the ledger (§5), then run cleanup
(§6b) before decomposing the next milestone.

## 6b — Cleanup after each approved milestone

Only after the `APPROVED` line is written — never on feedback, never before the user types
'Approve'. Invoke `cleanup-crew` through the `Skill` tool, in this session, never a subagent and
never delegated to Haiku. Tell it the milestone number, whether this is the first milestone on the
branch, and whether the plan has finished. It runs in its *Mid-feature mode*:

- **First milestone** — the full run (stash, base branch, branch name, restore, docs, reviewed
  commit, push), with one extra hard pause: stay on the `feature/<Name>` branch §6 already created
  (recommended) or stash and re-branch off base.
- **Later milestones** — same branch only: drift preflight, docs refresh, summary, reviewed commit
  and push. No branch work.
- **Plan pruning and handoff removal** (cleanup steps 8 and 9) are deferred: step 8 runs once the
  plan has finished (§7 passed, or the roadmap item converged), step 9 only when the whole run has
  no work left. The plan, ledger and handoff are live recovery state until then.
- **Cross-repo plan** — once per milestone; the branches already share a name (§5b), so ask
  stay/re-branch once and confirm each repo's commit separately.

Append the `CLEANUP` ledger line (§5) with the commit hash and push result. If the commit or push
fails or is declined, do not start the next milestone until the user decides.

## 7 — Finish

Run the plan's end-to-end verification section plus a final whole-branch review. Declare done
only when **all** acceptance criteria and test cases pass — evidence before assertions. Then run
cleanup-crew's step 8 (plan pruning), and step 9 if no work remains (§6b), and hand off to
`superpowers:finishing-a-development-branch`, or report status plainly if the target is not git.

## 8 — Roadmap execution

`/execute-plan --roadmap [--optimism <1-5>]` works through every `Active` row of
`.claude/roadmap.md`, one item at a time, looping build / `test-feature` / `kevin` / corrections
until both come back clean (5 correction rounds max, hard pause between items). **Read
`execute-plan/roadmap.md` (next to this file) now and follow it in full.** Per-milestone hard stops
and §6b cleanup are unchanged inside it.

## Haiku delegation (via /haiku-split)

Applies **only** when launched as `/haiku-split execute-plan [--args "..."]`; plain `/execute-plan`
ignores it. Then read `execute-plan/haiku.md` (next to this file) before §2 and follow it: Haiku only
writes code for micro-tasks; everything else, including tests, verification, the ledger, git and
§6b cleanup, stays with you.

## Red flags — STOP

| About to… | Reality |
|---|---|
| Spawn a subagent for any part of this — a task, a verifier, a ledger update | Forbidden, unconditionally, except Haiku micro-task implementation launched through `/haiku-split` after the user's confirmation. Verification and the ledger are never delegated. |
| Launch a Haiku batch for the next milestone, or a correction round, on the previous confirmation | Every batch is a new run with its own confirmation. |
| Mark a Haiku micro-task done because its progress line says `DONE` | Read its diff yourself (§3). The line is a claim. |
| Skip the fresh, skeptical re-read in §3 because you just wrote the diff | That's exactly the diff most likely to get a rubber-stamp. Re-derive intent from the brief before checking the code. |
| Treat a task scored 8-10 as routine because you implemented it yourself | Tell the user the score; ask whether the session should be running Opus tier before continuing. |
| Add a new test file or test method without checking for an existing one to extend | §3b step 1. Extend or parameterize first; new tests are the last resort. |
| Keep a test because "more coverage can't hurt" | A test that adds no line or branch coverage and covers no plan case is deleted or merged. |
| Write a test that only verifies a mock call, restates the code, or asserts nothing | Rejected under §3b. Assert observable behaviour. |
| Write tests for getters, DTOs, DI wiring or generated code | Trivial targets get no test. |
| Skip the milestone sweep because every task's tests already looked minimal | Overlap only shows across tasks. Run it before the hard stop. |
| Drop a plan-mandated test to hit the minimum | Merge it, never drop it if it covers a unique branch or acceptance criterion. |
| Silently pass the 350k ceiling | Hard-stop and ask. The ceiling is the point. |
| Declare "done" without running the plan's verification | Run it. Evidence first. |
| Skip verification because "this task is trivial" | Trivial tasks break integration. Verify every one. |
| Work a task without naming its repo and branch | It will edit the wrong repository. Always state both. |
| Call a cross-repo milestone done after verifying each repo alone | Each repo passing is not the repos agreeing. Check the contract. |
| Treat contract regeneration as tidy-up after the "real" work | It is the change. Implement and verify it as a task, same as any other. |
| Verify a UI diff without checking it against the plan's Design Direction | Style drift compounds silently across milestones — check it every time the plan carries one, not just once. |
| Mark a roadmap item Done because the build finished | Done means test-feature *and* kevin both came back clean. Check both. |
| Run milestones unattended because "it's roadmap mode" | The per-milestone hard stop in §6 is unchanged in roadmap mode. |
| Auto-advance to the next roadmap item without asking | §8 step 5 is a hard pause. Ask before starting the next item. |
| Keep looping corrections past the round ceiling | 5 rounds, then stop and ask. Never loop past it unasked. |
| Execute a `Future` roadmap row | Skip it — plan-feature's Design checkpoint means it isn't meant to be built yet. |
| Skip cleanup-crew after an approved milestone | §6b is part of the milestone. Run it after the `APPROVED` line, every time. |
| Run cleanup-crew before the user types 'Approve', or on feedback | Only an approval triggers it. Feedback means corrections, not a commit. |
| Run cleanup-crew's plan pruning or handoff removal mid-run | Steps 8 and 9 are deferred (§6b); the plan, ledger and handoff are live recovery state. |
| Delegate cleanup-crew to Haiku or any subagent | It stays in the main session, including under `/haiku-split`. |
| Start the next milestone after a failed or declined commit or push | Stop and let the user decide first. |

## Next step

Single-plan mode: `/test-feature --plan <path> --optimism <1-5>` grades the result. Name it; do
not invoke it. Roadmap mode (§8) already invokes `test-feature` and `kevin` itself as part of the
convergence loop — nothing further to name once a run finishes.
