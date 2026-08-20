---
name: plan-feature
description: >
  Turn an Azure DevOps ticket or a written description into a three-tier implementation plan
  with File Impact Manifests, scored effort, milestones and hard pauses. Reads the architecture
  maps; writes only the plan file, never source. Triggered by /plan-feature.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
---

# plan-feature

## Constraint — read this first

**This skill writes exactly one file: the plan. It never modifies source code.**

If asked mid-run to "just make the change while you're in there", refuse and point at
`/execute-plan`. The value of a plan is that it was written before anyone touched anything; a
planner that edits code produces neither a plan nor a reviewed change.

Artifact paths, repo resolution, `<Name>` derivation and cost discipline come from
`~/.claude/skills/_shared/pipeline-contract.md`.

## 1 — Ingestion

Accept **either** an ADO work item or a written description.

### From Azure DevOps (`--ado <id>`)

Reuse the existing read-only helper. Do not write new ADO code.

```bash
powershell -File ~/.claude/skills/ado-status/ado.ps1 workitem -Id <id>
```

It needs `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PAT`. Confirm both are set; **never print the
PAT**. If either is missing or auth fails, tell the user to run `/ado-status` first to validate
the connection, and stop.

Extract and strip HTML to plain text:

- `System.Title`
- `System.Description`
- `Microsoft.VSTS.Common.AcceptanceCriteria`
- `Microsoft.VSTS.TCM.ReproSteps`
- the comment / discussion thread

All requests are GET-only, the same contract as `ado-status`. This skill never writes to ADO.

If no ID was given, list the user's open items for the current sprint using the same WIQL query
as `ado-status`, print each as `#<ID>  <Title>  [<State>]`, and ask which to plan. **Hard
pause** — do not proceed until answered.

**Empty-ticket rule.** If title, description, acceptance criteria and repro steps are *all*
empty, do not proceed on the title alone. Tell the user the ticket carries no written spec and
ask them to confirm the intended scope or supply detail. Wait for the answer — **a guessed task
poisons every downstream stage.**

### From a description (`--description "..."`)

Use the text as given. If it is a single vague sentence, ask the clarifying questions that
change the design before planning against a guess.

## 2 — Map contextualisation

Read `.claude/maps/index.md` and the domain maps relevant to the feature. Extract the specific
flows the feature touches so you understand how the system behaves today, start to finish.

**Read the repo's own docs too.** `map.mjs scan` reports them as `projectDocs`, agent-directed
files first. A repo that documents itself is the authority on its own architecture — where a doc
disagrees with a map or with what directory names suggest, **the doc wins**. Planning against an
inferred architecture produces manifests that name files which do not do what you assumed.

**If no maps exist**, say so and offer to run `/map-codebase` first. Do **not** silently fall
back to scanning source — that is precisely the expensive rediscovery the maps exist to prevent.
If the user declines mapping, proceed under the cost discipline in the contract and say the plan
is built on a partial view.

### Cross-repo features

Run `map.mjs workspace`. If it exits 0, the target is a **workspace** — several repos forming one
product — and this feature may span more than one of them.

1. Read `<container>/.claude/maps/WORKSPACE_MAP.md` for the cross-repo edges, shared contracts,
   and change guidance.
2. Decide which repos the feature touches. Say so explicitly and early; it changes everything
   downstream.
3. **A change that crosses a shared contract is a multi-repo change.** Generated clients, shared
   DTOs, queue message shapes and API route names all fall in this class — a contract edit on one
   side is incomplete until the other side is updated. The workspace map names the regeneration
   or update command; put it in the plan as a task, not a footnote.

If it exits 4, the target is a single repo. Everything below behaves exactly as before.

## 3 — Three-tier design engine

Produce exactly three tiers.

| Tier | Depth | Content |
|---|---|---|
| **1 — Status Quo** | Full | Implement using the architectural standards and patterns already present in the project. Do not optimize. Do not refactor. The only permitted additions are mandatory vulnerability and security checks. |
| **2 — Localized Optimization** | Full | Builds on tier 1, optimising **only** the files this feature flow touches. Mandate best practices and computationally efficient data retrieval and processing. Require unit tests written specifically to prove the efficiency claim. If a required optimisation breaks standard operating bounds, state the roadblock plainly and ask for explicit approval before assuming it. |
| **3 — Global Upgrade** | **Sketch** | Prose summary only: what an unbounded rewrite would change — dependency upgrades, surrounding refactors, paradigm shifts — and why it might be worth it. Give an affected-area summary, not a file list. Expand to full depth only if the user asks. |

### File Impact Manifest

Tiers 1 and 2 each carry an **exhaustive** list of every file created, modified, or deleted, one
line of reasoning per file. **The Repo column is mandatory** — single-repo plans repeat one value,
which costs nothing and means `/execute-plan` never has to guess:

```
| Repo | Action | File | Why |
|---|---|---|---|
| api | Create | `src/Api/Services/BarcodeImportService.cs` | Owns the parse-and-persist flow |
| api | Modify | `src/Api/Controllers/AssetController.cs` | New POST endpoint |
| web | Regenerate | `src/app/openapi-generated/` | Contract changed; run the workspace map's command |
```

Paths are **repo-relative**, with the repo named in its own column — never a container-relative
path glued onto the front.

Tier 3 gets an affected-area summary instead, naming the repos involved.

### Scoring

Score every tier on all of these:

- **Complexity:** 1–5.
- **Estimated files created/modified:** a count plus representative paths.
- **Estimated token effort** — Claude Code's execution effort, **never the user's wall-clock
  time**. Pick a band, then give a point figure inside it:
  - **S (~5–15k):** 1–2 files, a localized edit following an existing pattern, minimal new tests.
  - **M (~15–40k):** 3–6 files or one new component, some cross-file wiring, a handful of tests.
  - **L (~40–100k):** 7+ files or a new subsystem, cross-cutting changes, broad test coverage.
  - **XL (>100k):** architectural change or migration — flag it for a follow-up split.
  The band makes two tiers comparable; the figure is your best guess inside it.
- **Risks and unknowns.**
- **Reusable existing utilities** to lean on, with their file paths.

## 4 — Milestones and hard pauses

Every tier decomposes into sequential milestones. Each milestone is a **functional, testable
increment** — not "write the model layer", but "the endpoint accepts a barcode and returns 202".

**Each milestone names the repos it touches.** A milestone spanning repos must also state its
**deployment ordering constraint**, because the two sides ship separately:

- *Adding* a contract — backend first; the frontend is harmless until it calls the new thing.
- *Removing or renaming* one — consumer first; the producer cannot drop it while callers remain.
- *Changing a shape in place* — usually needs a compatible intermediate step. Say so rather than
  pretending a simultaneous deploy is possible.

Prefer milestones that leave every repo independently deployable at the boundary. Where that is
impossible, say it plainly — an honest "these two must ship together" is worth more than a
milestone split that pretends otherwise.

End every milestone in the plan with this directive, addressed to the future implementing
session:

> **HARD STOP.** Do not begin the next milestone. Ask the user to test the feature up to this
> point and wait for explicit approval before continuing.

## 5 — Contingency

Close the plan with:

- **Consolidated risks** for the selected tier.
- **Fallback approaches**, drawn from the tiers not chosen, to fall back to if the primary
  approach hits a blocker mid-execution.
- **Validation gate** to run before the work is considered done: worktree pseudo-build → runtime
  tests → `/code-review` → `/test-feature`. Proceed to merge only if all are clean.

## 6 — Output

**Single-repo feature** → `<repo>/.claude/plans/FEATURE_PLAN_<Name>.md`.
**Cross-repo feature** → `<container>/.claude/plans/FEATURE_PLAN_<Name>.md`, and state the repo
list in a `**Repos:**` line directly under the title so `/execute-plan` can read it without
parsing the manifest.

Include the ADO work item ID and title when there is one.

Present the three tiers in a compact comparison, recommend the best-value tier first, then use
`AskUserQuestion` to let the user choose. Record the choice in the plan — `/execute-plan` reads
it to know which tier's milestones to execute.

Required headings, because `/execute-plan` parses them:

```
## Tier 1 — Status Quo
### File Impact Manifest
### Milestones
## Tier 2 — Localized Optimization
### File Impact Manifest
### Milestones
## Tier 3 — Global Upgrade (sketch)
## Contingency
```

## Common mistakes

- Editing source "while you're in there". This skill plans; `/execute-plan` builds.
- Proceeding on a ticket title when the ticket has no written spec.
- Scanning source because the maps were missing, instead of offering `/map-codebase`.
- Quoting the user's wall-clock time instead of Claude Code's execution effort.
- A File Impact Manifest that says "and related files" — it must be exhaustive.
- Milestones that are layers rather than testable increments.
- Expanding tier 3 to full depth unasked.
- Writing to ADO. Ingestion is GET-only.
- **Planning a contract change in one repo and forgetting the consumer.** If the change crosses a
  generated client, shared DTO, queue message shape or route name, the other repo is in scope.
- **Omitting the Repo column** because the feature "is obviously all in one repo".
- Asserting a simultaneous deploy when the repos ship separately.
- Trusting a map over the repo's own `CLAUDE.md` / `ONBOARDING.md`.

## Next step

`/execute-plan` implements the selected tier. Name it; do not invoke it.
