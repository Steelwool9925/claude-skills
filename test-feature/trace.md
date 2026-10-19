# test-feature — end-to-end trace reference

Read by `test-feature/SKILL.md` §2b at optimism 1+ (execution depth scales with the level). Section references are to `test-feature/SKILL.md`.

## 2b — End-to-end trace (systematic debugging)

**REQUIRED BACKGROUND:** invoke `superpowers:systematic-debugging` and apply its Phase 1–3 here.
Phase 4 (implementing a fix) does **not** apply: this skill never edits source, so every root
cause found becomes a Correction Plan item.

Coverage says which lines ran, not whether the feature works from entry to exit. Trace the real
path: **entry point** (UI action, route, CLI, queue message) → each layer (controller/handler →
service → data access → external calls) → **persistence** → **response/side effect** → back to the
caller. Take the path from the plan's manifest, or the map's flow for the feature (§0 fallback).

1. **Reproduce.** Drive the path with the cheapest real trigger: a test that already exercises it,
   else a request/CLI call against a locally started app (`curl`, the project's own run script).
   Record exact input and exact output.
2. **Instrument boundaries without touching source.** At each layer boundary, record what enters
   and what exits, using existing logs, verbose test output (`-v`, `--logger "console;verbosity=detailed"`),
   debugger/trace flags, or a throwaway script in the scratchpad. Never add log lines to the repo.
3. **Locate the break.** Follow the first wrong value backwards to where it originated. Fix
   nothing at the symptom; name the originating layer, file and line.
4. **Hypothesis, one at a time.** State "X is the root cause because Y", then confirm with the
   smallest experiment (a different input, a single test run). Refuted → new hypothesis; never
   stack guesses.
5. **Record.** Each defect gets: trigger, evidence (command + output), root cause, and the
   layer where it originates. A failed path with no confirmed root cause is reported as
   *unexplained*, with what was ruled out — never as a guessed cause.

Scale with `--optimism`:

| Level | Trace |
|---|---|
| 1–2 | Static walk of the path through the diff and map; no execution. Label findings as estimates (§3). |
| 3 | Run the primary happy path end to end, plus one failure input per layer boundary. |
| 4 | Every path the plan names: happy, validation failure, dependency failure, boundary values, concurrent or repeated calls. |
| 5 | Level 4, plus hostile input at the entry point and partial failure mid-path (persistence written, response lost). |

Cross-repo features: trace across the seam — request leaves repo A, is received and parsed by repo
B, and the response is consumed back in A. A path that breaks only at the seam is a contract
finding.

If the app cannot be started, or a dependency (database, queue, third party) is unavailable, say so,
trace as far as the evidence reaches, and mark the remainder unverified. Three failed hypotheses on
one defect means stop and report a suspected design problem instead of a fourth guess.
