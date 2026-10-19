# kevin — end-to-end mode (`--e2e`) reference

Read by `kevin/SKILL.md` §6 when the run is `--e2e`. Section numbers (6.1–6.5) are the ones the core and its Common mistakes cite.

Replaces §3–§5 for this invocation. §1 (get the app running), §2 (persona) and §2b (every avenue)
still apply, applied per-flow below.

### 6.1 — Cost checkpoint (every run, before touching the app)

- Read `.claude/maps/index.md` (container-level in a workspace) and count the domains and the
  flows listed under each.
- State that count out loud, and that a full-persona pass (§2's mistake-then-correct pattern, per
  step) **plus one `ui-ux-pro-max` expert critique per domain** (§3b/§6.2) across every one of them
  is a large, multi-domain spend — the same escalation checkpoint `pipeline-contract.md`'s
  cost-discipline section requires before any multi-x jump. Naming only the domain/flow count and
  leaving out the per-domain critique understates what's actually being approved.
- State the required model floor from §0b in the same breath — `--e2e` needs at least Sonnet 5,
  Opus 5 **required** (not just recommended) past ~5 domains. If the session is below the floor for
  the domain count just counted, stop here and ask the user to switch (`/model`) before continuing.
- **Ask before proceeding.** This runs every time, regardless of how few domains the map has —
  `--e2e` *is* the multi-x jump that checkpoint exists for, not a case that might be small enough
  to skip it.
- **Below the Opus floor for the domain count just named → offer the split-execution alternative
  (§0b) before falling back to scoping down.** Run §6.2's per-domain coverage one domain at a time
  under Sonnet 5 — same content a `--domain` run would produce: coverage, issues, and that domain's
  UI/UX rating — collecting each domain's findings and clean screenshots as you go. Once every
  domain is covered, ask the user to switch to Opus 5, then run §6.3's cross-domain journey and
  §6.4/§6.5's consolidated report + `ONBOARDING.md` refresh under Opus 5, folding in the
  Sonnet-collected per-domain sections rather than re-grading them. Note in the consolidated
  report's header that per-domain coverage ran under split execution. If the user declines this
  too, fall back to switching the whole run to Opus 5, or scoping down to specific `--domain` runs
  instead of a partial `--e2e`.

### 6.2 — Per-domain coverage

Apply §2's persona and §2b's every-avenue coverage to every `## Flow:` in every domain the index
lists — same mistake-then-correct pattern per step as single-feature mode, same
exercised/partial/unreachable tracking as §3. Rate
each domain with §3b's UI/UX rating too — persona score plus the `ui-ux-pro-max` expert critique
against that domain's clean screenshots. `--e2e` has no single plan behind any one domain, so the
Design Direction check is always "n/a" here — never invented.

**Under split execution** (§0b/§6.1), this section runs once per domain as its own Sonnet-5 pass —
same coverage, issues and UI/UX rating content as above, just scored and run separately rather than
as part of one aggregate Opus-tier session. Carry each domain's findings and clean screenshots
forward to §6.3-6.5 rather than re-deriving them once the session switches to Opus 5.

### 6.3 — Cross-domain journey

Run `map.mjs edges` for candidate couplings between domains (shared auth, a sequential business
process, shared queue/topic or route names). **Confirm a candidate is real before building a
journey on it** — per `pipeline-contract.md`, edges are candidates, not conclusions, and the same
string can appear in two domains by coincidence. Cover **every** confirmed edge a real user's
session would actually cross (not just one — the same every-avenue standard §2b sets within a
single feature applies across domains here too), drive each start to finish through the UI, and
apply §2's persona at each step exactly as any other flow. A candidate that doesn't hold up gets
said so in the report, not a journey built on it anyway.

### 6.4 — Report

Write one consolidated report: `.claude/reports/KEVIN_REPORT_e2e-<ISO date>.md` (container-level
for a workspace) — a new dated file every run; past runs stay on disk.

```markdown
# Kevin E2E Report
URL: <base-url>   Generated: <ISO date>

## Verdict
<one line: usable / confusing in places / broken>

## Domains
### <domain>
<same Coverage + Issues structure as §3/§4, scoped to this domain>
<same UI/UX Rating structure as §4, Design Direction line fixed to "n/a — e2e mode">

### <domain>
...

## Cross-domain journey: <name>
<same Coverage + Issues structure, for the chained journey — repeat this section once per confirmed edge, or write "none confirmed" and why if none held up>

## Correction Plan
1. [repo] [domain] <atomic fix — area if inferable, what, why>
2. [repo] [domain] [UI/UX] <atomic fix, from a concrete expert-critique violation only>
3. ...
```

Severity definitions (Critical/Confusing/Minor) are unchanged from §4.

### 6.5 — Onboarding doc (replaces §5 for this mode)

`--e2e`'s audience deliverable is a living guide, not a one-off announcement — refreshed every run
rather than published once per feature.

- **Regenerate `<repo-or-container-root>/ONBOARDING.md`** — repo root for a single repo, the
  container root for a workspace. Unlike every other pipeline artifact, **this file is not
  gitignored**: it is meant to be checked in and read by people, not tooling.
- Source it the way §5 sources its announcement: each domain's map functional description (title,
  flows, purpose) — never the Issues section, the Correction Plan, or source files.
- One section per domain (what it does, how to use it, numbered everyday steps), plus a short
  section for the cross-domain journey. No internal jargon, no mention of testing, QA, kevin,
  screenshots-as-evidence, severities, or file paths — same voice as §5's announcement.
- **Illustrate with clean screenshots** the same way §5 does: inline as base64
  `data:image/png;base64,...`, one per major step, skipped only where no clean screenshot exists —
  never substitute an error-state one. Encode runner PNGs with a one-line Node command, as in §5.
- **Publish/republish it as an Artifact, reusing the same URL every run:**
  - First run: publish it, then write the URL into a hidden HTML comment at the very top of the
    file: `<!-- kevin-e2e-artifact: <url> -->`.
  - Every later run: read that comment before publishing, pass its URL to the Artifact tool so the
    same page updates in place, and leave the comment as-is unless the URL genuinely changed.
  - Publishing fails or is unavailable → say so, leave the comment untouched, keep the file on
    disk. The file is the deliverable; the Artifact is a convenience, same as `map-codebase`'s
    maps.

**Never spawn a subagent for this.** Same reasoning as §5: the domain grading is done by this
point, so draft/regenerate `ONBOARDING.md` and publish it yourself, in this session, using each
domain's map functional description, the screenshots, the existing artifact-comment URL (if any),
and the voice/content rules above. Perform the read-before-republish yourself before publishing.

**Watch your own context on this one.** This is the pipeline's heaviest brief: every domain's
description plus every screenshot, in a mode that only runs when there are many domains. Encoded
screenshots are the bulk of it. If it risks overflowing the session's context, work through it
domain by domain — draft and stage each domain's section, then assemble and publish once all are
ready — rather than trying to hold every domain's screenshots in context at once.

