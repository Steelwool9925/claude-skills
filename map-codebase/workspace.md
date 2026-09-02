# Workspace mode

Read this when `map.mjs workspace` exits 0. When it exits 4 the target is a single repo and
nothing in `SKILL.md` changes.

The *workspace* concept — repo vs workspace vs collection, `.claude-workspace.json`, and where
workspace artifacts live — is defined in `~/.claude/skills/_shared/pipeline-contract.md`. Read it
there.

```
node ~/.claude/skills/map-codebase/map.mjs workspace --root <dir>   # exit 4 = not a workspace
node ~/.claude/skills/map-codebase/map.mjs edges --root <dir> --limit 40
node ~/.claude/skills/map-codebase/map.mjs verify --workspace
```

## Procedure

1. Run `workspace` for the repo inventory.
2. Map **each repo** exactly as a single repo, writing into that repo's own `.claude/maps/`.
3. Run `edges`, confirm the candidates, and write `<container>/.claude/maps/WORKSPACE_MAP.md`.
4. Run `verify --workspace` to close out.

## What goes in `WORKSPACE_MAP.md`

Same `Generated: <ISO date> (<short sha>)` header as any other map, then:

- **Repo inventory** — name, stack, infra, role, file count, whether it has tests and CI.
- **Cross-repo edges** — producer repo and file → mechanism (queue / topic / socket / HTTP route)
  → consumer repo and file. Cite paths as `<repo>/<path>` so they resolve from the container.
- **Mermaid `graph LR`** with repos as nodes and edges as labelled arrows.
- **Shared contracts** — DTOs, schemas, or generated clients duplicated across repos. This is
  where cross-repo features break.
- **`## Build & test commands`** — including the regeneration command for each shared contract.
  `plan-feature` reads this section to turn a contract edit into a task rather than a footnote.
  It is the one section allowed to carry a command; see the guardrail carve-out in the contract.

## Rules

**Summarise, do not enumerate.** A real frontend/backend pair yields ~100 route edges. Group them
by controller or domain and cite one representative path per group; a map listing 100 rows costs
more to read than the code. `edges --limit <n>` caps what the script hands you, and each edge
reports `siteCount` so you can see how much a group represents without listing it.

**Confirm before writing.** `edges` output is candidates — the script asserts only that the same
string appears in two repos. A coincidental match is possible; check before recording it.

**Record the config key, never the value.** Queue names and service URLs live in `appsettings.*`
and `.env`, which the ignore list bars. Write
`ServiceBus:AssetQueue (value in configuration, not read)`.
