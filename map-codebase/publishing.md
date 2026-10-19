# map-codebase — Publishing reference

Read by `map-codebase/SKILL.md` when it is time to publish finished maps as Artifacts.

## Publishing

**Every map this skill writes is also published as an Artifact.** The file on disk stays the
source of truth that `/plan-feature` and `/execute-plan` read; the artifact is the copy a person
can open and share without cloning the repo. One artifact per file, `index.md` included — a run
that writes seven files publishes seven artifacts.

### Model

**Never spawn a subagent for this.** By the time a map reaches this section its content is
finished and has passed `verify` — publishing is a mechanical read-URL/call-tool loop, but you do
it yourself, in this session: one file at a time, or the whole batch when several maps changed in
a run. For a republish, read the existing URL from `## Published artifacts` first — the tool
refuses to overwrite an artifact this conversation hasn't read — then publish and fold the
resulting URL(s) into `## Published artifacts` yourself.

**Publish the `.md` file itself.** This is the explicit skill instruction the Artifact tool's
format rule requires, and it is deliberate: rendering a map as HTML would fork its content, and a
forked copy drifts from the file `verify` checks. Pass the map's path straight to the Artifact
tool — no rewriting, no design pass, no `artifact-design`.

Per file, pass:

- **`file_path`** — the map on disk.
- **`description`** — `<repo> · <what this map covers>`. A markdown artifact takes its filename as
  its title, so several repos will each contribute a `data-layer`; the description is the only
  thing separating them in the gallery. Make it specific.
- **`favicon`** — on a first publish only. Pick one emoji for the whole run so a repo's maps read
  as a set. Never pass it on a redeploy: the icon is how someone finds the tab again.

### Republish, never duplicate

`index.md` carries a `## Published artifacts` table pairing each map with its URL. **Read it
before publishing anything.** For every map already listed, pass its `url` so the publish
**updates that artifact in place**. Publishing without `url` from a later session creates a
*second* artifact instead, and the link a teammate bookmarked quietly goes stale.

The tool refuses to overwrite an artifact this conversation has not read, so on `--update`: read
each URL first, then build the republish on what came back. Write the table back afterwards,
adding a row for every map published for the first time.

Record the URLs as plain markdown links, **not in backticks**. `verify`'s drift checker only
inspects backticked tokens, and a URL has no business being resolved as a repo path.

### Guardrail

Publishing sends the map to an external service. Artifacts start private, but the copy has left
the machine either way — so the contract's read-only guardrail matters more here, not less:

**Run `verify` before publishing, not after.** Its `guardrail` array is the only thing standing
between a secret-shaped string in a map and a published copy of one. If it reports any hit, fix
the map and re-run; **do not publish a map that failed the guardrail check.**

Nothing about publishing relaxes what a map may contain. No commands outside
`## Build & test commands`, no secrets, no file contents — the same rules, now with a wider
audience.

If publishing is unavailable or refused, say so plainly, leave the files on disk, and finish the
run. The maps are the deliverable; the artifacts are a convenience.
