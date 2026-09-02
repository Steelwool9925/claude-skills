# Design — Feature Pipeline Skills

Date: 2026-08-17
Status: approved design, pending implementation plan
Scope: five chained user-level Claude Code skills, plus retirement of four superseded skills

---

## 1. Purpose

Replace an ad-hoc collection of overlapping skills with one deliberate pipeline that carries a
feature from "I have a ticket" to "the branch is pushed and ready for a pull request", with a
hard token ceiling at every fan-out point.

```
/map-codebase  →  /plan-feature  →  /execute-plan  →  /test-feature  →  /cleanup-crew
   (atlas)         (design)          (build)           (grade)          (ship)
```

Each stage is independently invocable. The chain is a convention, not an automation: no stage
invokes the next. Every stage ends by naming the command that would follow.

## 2. Constraints

- **Token ceiling.** No single task may consume more than 10% of the weekly account budget.
  Concretely: `execute-plan` caps a milestone at **350k output tokens** and hard-stops to ask.
  Every stage that fans out prints a projected cost before it starts.
- **Install location.** User-level `~/.claude/skills/`, available to every repo under
  `C:\Users\Jason_Weiss\Projects` (FuzionTrackFams, Stallion Project A/B, flutter) with no
  per-repo setup.
- **No new ADO code.** Ticket access reuses the existing helper
  `~/.claude/skills/ado-status/ado.ps1` and its `AZURE_DEVOPS_ORG_URL` / `AZURE_DEVOPS_PAT`
  environment variables.
- **Scripts only where determinism pays.** Exactly one helper script, for `map-codebase`.
  The other four are markdown that drives Claude.
- **Global ignore list applies.** No skill reads `.env*`, `*.key`, `*.pem`, `*.pfx`,
  `secrets/`, `credentials*`, `appsettings.*`, `config.json`, `web.config`, or
  `.claude/settings.json`.

## 3. Shared contract

A single file, `~/.claude/skills/_shared/pipeline-contract.md`, defines the artifact formats so
the handoffs between stages cannot drift apart. All five skills read it.

### 3.1 Artifact locations

All artifacts live inside the **target repo**, not the user profile, so their file paths stay
relative to the code they describe. All are gitignored.

| Artifact | Path | Written by | Read by |
|---|---|---|---|
| Root architecture map | `.claude/maps/ARCHITECTURE_MAP.md` | map-codebase | plan-feature, test-feature |
| Domain maps | `.claude/maps/<domain>.md` | map-codebase | plan-feature, execute-plan |
| Map index + search hints | `.claude/maps/index.md` | map-codebase | all |
| Feature plan | `.claude/plans/FEATURE_PLAN_<Name>.md` | plan-feature | execute-plan, test-feature |
| Execution ledger | `.claude/plans/<Name>.ledger.md` | execute-plan | execute-plan (resume), test-feature |
| Test report | `.claude/reports/TEST_REPORT_<Name>.md` | test-feature | execute-plan (correction loop) |

`map-codebase` ensures `.gitignore` contains `.claude/maps/`, `.claude/plans/`, and
`.claude/reports/`, adding the entries if absent.

### 3.2 Repo resolution

Every skill resolves the target repo by walking up from the current working directory to the
nearest `.git`. If there is none, the skill says so and stops rather than guessing — the
`Projects` folder itself is not a repo and must never be treated as one.

### 3.3 `<Name>` derivation

`<Name>` is the ADO work item ID when one is supplied (`FEATURE_PLAN_12345.md`), otherwise a
kebab-case slug of the feature title. The same `<Name>` threads through plan, ledger, and report
so the four artifacts of one feature are trivially associated.

### 3.4 Cost discipline (applies to every stage)

Inherited from the retired `batman` skill, which proved it out:

- Consult the map's search hints before touching the filesystem.
- `Glob` for structure; `Grep` with `glob`/`type` filters and `head_limit` for content. Never
  `Read` or list a whole directory to see what is there.
- Read only the relevant span of a large file.
- **Escalation checkpoint.** When the only way forward multiplies spend so far — broad subagent
  fan-out, filter-less repo-wide grep, reading large files whole — STOP and ask, stating what
  was tried, the specific higher-effort step wanted, and its rough token cost. A standing
  "work autonomously" instruction does not pre-authorise a large spend.

---

## 4. Stage 1 — `map-codebase`

`/map-codebase [--update] [--verify]`

### 4.1 Responsibility

Produce and maintain high-signal architecture maps that let a future session understand
end-to-end feature flows without reading source.

### 4.2 Helper script

`~/.claude/skills/map-codebase/map.mjs` (Node 25, no dependencies). Does all deterministic work
at zero token cost and emits JSON on stdout:

- Pruned directory walk, excluding `node_modules`, `.git`, `bin`, `obj`, `dist`, `build`,
  `.vs`, `packages`, `coverage`.
- Stack detection by marker file (`*.sln`/`*.csproj`, `pubspec.yaml`, `package.json`,
  `pyproject.toml`, `go.mod`).
- Entry-point candidates (`Program.cs`, `Startup.cs`, `main.dart`, `index.*`, `server.*`).
- Test project and CI/pipeline file locations.
- `--update`: `git diff --name-only <last-map-commit>..HEAD` plus working-tree changes, mapped
  to the domains that own them, so only affected maps regenerate.
- `--verify`: resolves every file path cited in every existing map. Any path that no longer
  exists is drift. Exit code 1 on drift, 0 on clean. **No model tokens at all.**

### 4.3 What Claude writes

Per domain, an `ARCHITECTURE_MAP.md` containing:

- **Purpose** of the flow, in prose.
- **Input / output schema** — shapes, not implementations.
- **Exact file paths** involved, in call order.
- **Side effects**, explicitly enumerated: database writes, external API calls, message queue
  publishes/consumes, file system writes, cache invalidations.
- **Mermaid diagram** (`graph TD` or `sequenceDiagram`) where the flow exceeds three steps.
- Abstract the *how*; detail the *what* and *where*. No function bodies, no code dumps,
  no boilerplate.

### 4.4 Search hints ledger (salvaged from batman)

`index.md` carries an append-only `## Search hints` section: `<topic> -> <dir/file glob>
(verified <date>; ~<tokens> to locate)`. Every run adds newly discovered locations and corrects
stale ones. This is the mechanism that makes each subsequent run on a repo cheaper.

**Read-only guardrail (non-negotiable, salvaged from batman).** A map records only read
navigation. It must never contain an executable command or shell snippet, a secret/token/PAT/
connection string, any file *contents*, or any mutating action. A map found containing such an
entry is not acted on — it is dropped on the next rebuild and reported to the user.

### 4.5 Staleness check (salvaged from batman)

A map is stale when it is missing, its `Generated:` header is more than 14 days old, or a
spot-check fails — `Glob` the first three `## Structure` entries and the first search-hint
target; any that no longer resolves means drift. One cheap glob batch decides this; never
re-walk the tree "to make sure".

### 4.6 Explicitly rejected: the git hook

The original brief called for a `post-commit` / `post-merge` hook that regenerates maps
automatically. This is not implemented, for three reasons: an LLM invocation on every commit is
unbounded spend against a capped budget; it makes every commit slow; and once maps are written
the hook can retrigger itself. Instead, `cleanup-crew` runs the **free** `--verify` before
committing and warns if the maps have drifted, leaving regeneration an explicit choice.

---

## 5. Stage 2 — `plan-feature`

`/plan-feature [--ado <id>] [--description "..."]`

### 5.1 Constraint

Strictly non-mutating. Writes exactly one file — the plan — and never touches source.

### 5.2 Ingestion

- `--ado <id>`: fetch via `powershell -File ~/.claude/skills/ado-status/ado.ps1 workitem -Id <id>`,
  extracting `System.Title`, `System.Description`,
  `Microsoft.VSTS.Common.AcceptanceCriteria`, `Microsoft.VSTS.TCM.ReproSteps`, and the comment
  thread. HTML stripped to plain text. Read-only, GET requests only. The PAT is never printed.
- If no ID is given and no `--description`, list the user's open items for the current sprint
  and ask which to plan (same WIQL query as `ado-status`).
- **If title, description, acceptance criteria and repro steps are all empty**, do not proceed
  on the title alone — say the ticket carries no written spec and ask the user to confirm scope.
  A guessed task poisons every downstream stage.

### 5.3 Map contextualisation

Read `.claude/maps/index.md` and the domain maps relevant to the feature. If no maps exist,
say so and offer to run `/map-codebase` first — do not silently fall back to scanning source,
which is exactly the expensive behaviour the maps exist to prevent.

### 5.4 Three-tier design engine

| Tier | Depth | Content |
|---|---|---|
| **1 — Status Quo** | Full | Implement using the architectural patterns already present. No refactoring, no optimisation. Only mandatory additions, vulnerability checks and security checks. |
| **2 — Localized Optimization** | Full | Builds on tier 1, optimising only files this feature flow touches. Mandates efficient data retrieval and processing, plus unit tests that specifically prove the efficiency claim. If an optimisation breaks standard operating bounds, state the roadblock and ask for explicit approval. |
| **3 — Global Upgrade** | Sketch | Prose summary only: what an unbounded rewrite would change (dependency upgrades, surrounding refactors, paradigm shifts) and why it might be worth it. Expanded to full depth only on request. |

**File Impact Manifest** — tiers 1 and 2 each carry an exhaustive list of every file created,
modified, or deleted, with a one-line reason per file. Tier 3 gives an affected-area summary.

**Scoring per tier** (salvaged from batman): complexity 1–5; estimated file count; estimated
Claude Code token effort anchored to calibration bands — **S ~5–15k** (1–2 files, localized,
follows existing pattern), **M ~15–40k** (3–6 files or one new component), **L ~40–100k**
(7+ files or a new subsystem), **XL >100k** (architectural change; flag for a split). Also:
risks and unknowns, and reusable existing utilities with their file paths.

### 5.5 Milestones and hard pauses

Every tier decomposes into sequential milestones, each a functional, testable increment. Every
milestone ends with a literal directive addressed to the future implementing session: stop
coding, ask the user to test the feature to this point, and wait for explicit approval before
continuing.

### 5.6 Contingency section (salvaged from batman Phase 3)

The plan closes with consolidated risks, named fallback approaches drawn from the tiers not
chosen, and a validation gate to run before the work is considered done: worktree pseudo-build,
runtime tests, `/code-review`, `/test-feature` — proceed only if all are clean.

---

## 6. Stage 3 — `execute-plan`

`/execute-plan [path to FEATURE_PLAN_<Name>.md]`

### 6.1 Dispatcher

The built-in **Workflow** tool. Chosen over `claude -p` child processes because it is the only
option with a hard token-budget ceiling, plus concurrency caps, per-agent model and effort
overrides, and resume-from-runId. Requires the user's multi-agent opt-in, which is granted for
this skill by design; if declined, the skill degrades to a single-context executor doing each
task itself with the same verify/fix loop, and says so plainly.

### 6.2 Budget guard

`budget.total` is set to **350k output tokens per milestone**. Before dispatching, the skill
prints the milestone's projected cost (sum of the plan's per-task token bands). When
`budget.remaining()` falls below the next task's estimate, it hard-stops and asks whether to
continue. The figure is a starting value, revisable.

### 6.3 Model policy (salvaged from gru)

| Role | Model | Does |
|---|---|---|
| Controller (this session) | session model, typically Opus 5 | decompose, **all verification**, regression re-eval, adjudication |
| Subagent — mechanical | Haiku 4.5 `claude-haiku-4-5-20251001` | transcription, boilerplate, mechanical edits |
| Subagent — judgment | Sonnet 5 `claude-sonnet-5` | wiring, non-trivial logic, every fix-loop escalation |

**Subagents never exceed Sonnet.** Always specify the model explicitly — an omitted model
inherits the controller's Opus and violates the cap.

### 6.4 Escalation ladder

Three attempts per atomic task, then the controller takes over:

1. Haiku 4.5.
2. Sonnet 5, with the controller's findings from attempt 1.
3. Sonnet 5, with accumulated findings from attempts 1–2.
4. **Controller implements the task itself.** Progress is never blocked by a capped model.

This satisfies the original three-strike design while respecting the Sonnet ceiling — the
original's "escalate to Opus" step becomes "the controller does it", which is the same
capability without handing an unsupervised subagent the expensive model.

### 6.5 Verification (salvaged from gru)

**A capped subagent never grades its own work.** After every task the controller verifies the
diff against (i) the atomic task spec and (ii) the plan's constraints and test cases, checking
adherence to the architecture map, syntax, logic, and goal alignment. Large diffs are verified
by a dedicated Sonnet verifier subagent to keep controller context clean; small diffs inline.

**Regression re-evaluation** — after each task, validate the integration so far, not just the
new task. If a later task broke an earlier one, re-run the affected earlier tests and dispatch
a fix. The plan governs. If the plan is genuinely self-contradictory, stop and escalate it as a
plan defect rather than improvising.

### 6.6 Ledger

`.claude/plans/<Name>.ledger.md` is the compaction-proof recovery map. First line names the plan
file. One `STAT` line per dispatch and per verification:

```
STAT | task=<N> | role=subagent|verifier|verify-inline | model=<haiku-4-5|sonnet-5|controller> | round=<k> | status=<DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT|PASS|FAIL> | tokens=<n>
```

A rollup at the top tracks dispatch counts by tier, verifier count, fix rounds, and cumulative
tokens against the 350k ceiling.

### 6.7 Isolation and milestone pause

Work happens in a git worktree via `superpowers:using-git-worktrees` (non-git fallback where
needed; building in place only with explicit go-ahead). On milestone completion the skill halts
and prints:

> Milestone [X] complete. Please run your tests and verify the functionality. Type 'Approve' to
> begin the next milestone, or provide feedback for corrections.

It waits for explicit input. It does not decompose the next milestone until approved.

---

## 7. Stage 4 — `test-feature`

`/test-feature --plan <path> --optimism <1-5>`

### 7.1 Constraint

Strictly non-mutating. Writes exactly one file — the report. Never edits source, never commits.

### 7.2 Optimism scale

| Level | Posture | Runs tests? |
|---|---|---|
| 1 | Fully optimistic — completeness against the plan, glaring syntax or build breakage only | No |
| 2 | Standard — basic logic flaws, standard best practices | No |
| 3 (default) | Thorough — edge cases, common vulnerabilities (injection, XSS), basic bottlenecks | **Yes** |
| 4 | Pessimistic — actively hunt breakage: data bounds, error handling, thread safety, resource leaks | **Yes** |
| 5 | Paranoid — trust nothing; obscure vulnerabilities, deployment hazards, severe algorithmic inefficiency | **Yes** |

Levels 1–2 reason statically over the diff and are cheap. Levels 3–5 build and run the real
coverage command for the detected stack, and quote the output as evidence.

### 7.3 Stack detection and coverage (salvaged from review-my-code)

| Marker | Stack | Coverage command |
|---|---|---|
| `*.csproj` / `*.sln` | .NET (follow `dotnet-test` conventions) | `dotnet test --collect:"XPlat Code Coverage"` |
| `pubspec.yaml` | Flutter (follow `flutter-tests`) | `flutter test --coverage`, parse `coverage/lcov.info` |
| `package.json` (jest/vitest) | JS/TS | `npm test -- --coverage` |
| `pyproject.toml` / `pytest.ini` | Python | `pytest --cov` |
| `go.mod` | Go | `go test -cover ./...` |

Files bucket as **Critical** (0%), **Partial** (1–79%), **Compliant** (≥80%, or the project's
own contractual threshold). For changed and critical files, list the specific uncovered lines.

**Evidence before assertions.** Never state a coverage number or a pass/fail without showing the
command output it came from. If the build fails or tooling is missing, say so explicitly and
fall back to static reasoning — labelled as such.

### 7.4 Test effectiveness (salvaged from review-my-code)

Coverage is not quality. Flag: tests that execute code without asserting anything meaningful;
missing edge cases, error paths, and boundary values; tautological mocks that assert the mock;
coverage theatre — lines counted covered but never asserted. Recommend mutation testing where
the signal would be worth it.

### 7.5 Mandatory evaluation vectors

Applied at every level, intensity scaling with optimism:

1. **Completeness** — does the diff fulfil every requirement and milestone in the plan?
2. **Vulnerabilities** — authentication bypasses, injection flaws, data leaks.
3. **Deployment hazards** — missing environment variables, conflicting dependency versions,
   migration risks.
4. **Pipeline hazards** — will CI break? build time impact? missing or brittle tests?
5. **Efficiency** — algorithmic complexity, N+1 queries, memory leaks, slow paths.

### 7.6 Stack-conditional .NET checklist (salvaged from roast)

When the stack is .NET, additionally scrutinise: N+1 LINQ patterns and `.ToList()` before
filtering; bypassed dependency injection and bloated controllers; unsanitised input and
hardcoded secrets; missing `ConfigureAwait` / `CancellationToken`; null handling; async state
machine and GC traps. Explain *why* each finding is wrong, not only how to fix it.

### 7.7 Correctness pass

Invoke `/code-review` on the same diff in **report-only** mode (never `--fix` or `--comment`),
and de-duplicate its findings against this skill's own.

### 7.8 Output

`TEST_REPORT_<Name>.md`, structured as Passes / Warnings / Critical Failures, closing with an
actionable **Correction Plan** — a numbered list of atomic fixes phrased so `/execute-plan` can
consume it directly as a task list.

---

## 8. Stage 5 — `cleanup-crew`

`/cleanup-crew`

### 8.1 Workflow

0. **Drift preflight.** Run `map.mjs --verify` (free). If maps have drifted, warn and offer to
   run `/map-codebase --update` before continuing.
1. **Stash.** `git status`; if the tree is dirty, `git stash push -u`.
2. **Base branch.** Ask "Which branch should we branch off of?" — **hard pause**. On answer,
   `git checkout <base>` then `git pull`.
3. **Feature branch.** Ask "What should the new feature branch be named?" — **hard pause**.
   On answer, `git checkout -b <name>`.
4. **Restore.** `git stash pop`. **On any conflict, stop and ask.** Show the conflicted files
   and both sides, and wait for the user to decide per file. This deliberately departs from the
   original brief and from the retired `review-my-code`, both of which auto-resolved in favour
   of the stashed changes — silently discarding a teammate's change that was pulled seconds
   earlier is not an acceptable default.
5. **Docs refresh** (salvaged from review-my-code Phase 6).
   - `README.md` — bring into line with what the code now does; create one if absent.
   - `changes.md` — gitignored, append-only. Ensure the `.gitignore` entry exists. Ask for the
     ticket number(s). Append a dated entry (`date +%Y-%m-%d`):
     ```
     ## <YYYY-MM-DD> — <ticket(s)>
     - <change 1>
     ```
6. **Summarise.** Analyse the applied changes; present a brief summary of files changed and the
   feature or fix implemented. Ask for task links or ticket references — **hard pause**
   (skip the re-ask if step 5 already captured them).
7. **Commit and push.** Show the staged file list for confirmation, then:
   ```
   git add -A
   git commit -m "<title>" -m "<short description of all changes>" -m "<#123 #456>"
   git push -u origin <new_branch>
   ```
   The three-`-m` structure is retained from `review-my-code`: title, description,
   space-delimited `#`-prefixed tickets. The composed command is shown and approved before it
   runs. Report the commit hash, push result, and any PR URL git prints.

### 8.2 Guardrails

Never force-push. Never push to `main`,`qa`,`prod` or `master`. Abort and surface the error if `git stash
pop` fails unexpectedly, the target is not a git repo, or the working-tree state is unclear.

---

## 9. Skill metadata

All five: user-level `~/.claude/skills/<name>/SKILL.md`, `disable-model-invocation: true` so
they run only on explicit slash invocation, matching the convention of the existing skills.

| Skill | `allowed-tools` |
|---|---|
| map-codebase | Bash, Read, Write, Edit, Glob, Grep |
| plan-feature | Bash, Read, Write, Glob, Grep, AskUserQuestion |
| execute-plan | Bash, Read, Write, Edit, Glob, Grep, Workflow, AskUserQuestion, TaskCreate, TaskUpdate |
| test-feature | Bash, Read, Write, Glob, Grep, Skill, AskUserQuestion |
| cleanup-crew | Bash(git *), Read, Write, Edit, Glob, Grep, AskUserQuestion |

## 10. Retirement

`batman`, `gru`, `review-my-code`, and `roast` move to `~/.claude/skills/_retired/<name>/`,
preserving `gru/minion-prompt.md` and `gru/verifier-prompt.md`. A `_retired/README.md` records
the retirement date, the successor skill for each, and the fact that these are inert once moved
out of the skills root.

Before archiving, grep the surviving skills (`morning`, `goodnight`, `quest-log`, `ado-status`,
`commit`, `document`, `brainstorm`, `testgen`, `dotnet-test`, `flutter-tests`, `scs-monitoring`)
for references to the retired four and update any that point at them.

Explicitly **kept**: `commit`, `document`, `brainstorm`, `testgen` — the user chose not to
retire these. `testgen` in particular is not redundant: it *generates* tests, whereas
`test-feature` only reviews them.

## 11. Non-goals

- No git hooks of any kind.
- No `.claude/settings.json` custom-tool registration — it does not exist as a mechanism.
- No `claude -p` subprocess orchestration.
- No stage automatically invoking the next.
- No skill modifying source outside `execute-plan` and `cleanup-crew`.
