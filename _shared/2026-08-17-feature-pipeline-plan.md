# Feature Pipeline Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build five chained user-level Claude Code skills — `/map-codebase`, `/plan-feature`, `/execute-plan`, `/test-feature`, `/cleanup-crew` — over a shared artifact contract, and archive the four skills they supersede.

**Architecture:** Five independent `SKILL.md` files in `~/.claude/skills/`, each a markdown instruction set that drives Claude. They coordinate only through a shared contract file that fixes artifact paths and formats. Exactly one helper script — `map.mjs`, dependency-free Node — does the deterministic filesystem and git work for `map-codebase` at zero token cost. No stage invokes the next; the chain is a convention the user drives.

**Tech Stack:** Markdown with YAML frontmatter (skills); Node 25 with `node:test` and `node:fs` (helper script, no npm dependencies); PowerShell (reused `ado-status/ado.ps1` for Azure DevOps); git.

**Spec:** `~/.claude/skills/_shared/2026-08-17-feature-pipeline-design.md`

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include this section.

- **Token ceiling:** `execute-plan` caps a milestone at **350k output tokens** and hard-stops to ask. This exact figure appears in `execute-plan/SKILL.md` §budget and in the ledger rollup description — nowhere else, and never as a different number.
- **Install location:** user-level `~/.claude/skills/`. Never per-repo.
- **Model IDs, exact strings:** Haiku tier is `claude-haiku-4-5-20251001`; Sonnet tier is `claude-sonnet-5`. Subagents never exceed Sonnet. Opus is controller-only. Any `claude-3-*` model ID is a defect.
- **No new ADO code:** ticket access is `powershell -File ~/.claude/skills/ado-status/ado.ps1 <command> [args]` using `AZURE_DEVOPS_ORG_URL` and `AZURE_DEVOPS_PAT`. The PAT is never printed.
- **Exactly one helper script:** `map.mjs`. The other four skills are markdown only.
- **Node has no dependencies:** `node:` builtins only. No `package.json`, no `npm install`.
- **Global ignore list:** no skill reads `.env*`, `*.key`, `*.pem`, `*.pfx`, `secrets/`, `credentials*`, `appsettings.*`, `config.json`, `web.config`, or `.claude/settings.json`.
- **Non-goals that must not appear anywhere in the output:** git hooks; `.claude/settings.json` custom-tool registration; `claude -p` subprocess orchestration; any stage auto-invoking the next.
- **Skill frontmatter:** every one of the five carries `name`, `description`, `disable-model-invocation: true`, and `allowed-tools` exactly as listed in spec §9.

## Working Environment

`~/.claude` is **not** a git repository, so there is no commit step in this plan. Each task ends with a verification checkpoint whose output is the evidence that the task landed. Nothing in this plan deletes a file — the retirement task moves directories, which is reversible by moving them back.

Run all commands from a Bash tool shell. `$HOME` resolves to `C:\Users\Jason_Weiss`.

## File Structure

```
~/.claude/skills/
  _shared/
    2026-08-17-feature-pipeline-design.md   # spec (exists)
    2026-08-17-feature-pipeline-plan.md     # this plan (exists)
    pipeline-contract.md                    # Task 1 — artifact paths/formats, read by all five
  map-codebase/
    map.mjs                                 # Tasks 2-5 — deterministic scan/update/verify
    test-map.mjs                            # Tasks 2-5 — node:test suite
    SKILL.md                                # Task 6 — map authoring instructions
  plan-feature/SKILL.md                     # Task 7
  execute-plan/SKILL.md                     # Task 8
  test-feature/SKILL.md                     # Task 9
  cleanup-crew/SKILL.md                     # Task 10
  _retired/
    README.md                               # Task 11
    batman/ gru/ review-my-code/ roast/     # Task 11 — moved, not deleted
```

Responsibilities: `pipeline-contract.md` is the single source of truth for where artifacts live and what they contain — the five skills reference it rather than restating it, so a path change is a one-file edit. `map.mjs` holds every operation that can be answered without a model. Each `SKILL.md` holds one stage's behaviour and nothing else.

---

### Task 1: Shared pipeline contract

Everything downstream reads this file, so it lands first.

**Files:**
- Create: `~/.claude/skills/_shared/pipeline-contract.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the artifact path table and `<Name>` derivation rule that Tasks 6–10 cite by section number. Section anchors other tasks depend on: `## Artifact locations`, `## Repo resolution`, `## Name derivation`, `## Cost discipline`, `## Read-only guardrail`.

- [ ] **Step 1: Write the contract file**

Transcribe spec §3 in full. The file must contain, verbatim, the artifact table from spec §3.1 with all six rows, and these four sections:

- `## Artifact locations` — the six-row table, plus the rule that `map-codebase` ensures `.gitignore` contains `.claude/maps/`, `.claude/plans/`, `.claude/reports/`.
- `## Repo resolution` — walk up from cwd to the nearest `.git`; if none, say so and stop. Must state explicitly that the `Projects` folder is not a repo and must never be treated as one.
- `## Name derivation` — ADO work item ID when supplied, else a kebab-case slug of the feature title; the same `<Name>` threads through plan, ledger, and report.
- `## Cost discipline` — the four bullets from spec §3.4, including the escalation checkpoint and the sentence: *A standing "work autonomously" instruction does not pre-authorise a large spend.*
- `## Read-only guardrail` — from spec §4.4: a map records only read navigation and must never contain an executable command or shell snippet, a secret/token/PAT/connection string, any file contents, or any mutating action.

Open with a one-line statement that this file is read by all five pipeline skills and is the only place artifact paths are defined.

- [ ] **Step 2: Verify every required section is present**

```bash
cd "$HOME/.claude/skills/_shared" && \
for s in "## Artifact locations" "## Repo resolution" "## Name derivation" "## Cost discipline" "## Read-only guardrail"; do
  grep -qF "$s" pipeline-contract.md && echo "OK   $s" || echo "MISS $s"
done
```

Expected: five `OK` lines, no `MISS`.

- [ ] **Step 3: Verify all six artifact paths are present**

```bash
cd "$HOME/.claude/skills/_shared" && \
for p in ".claude/maps/ARCHITECTURE_MAP.md" ".claude/maps/index.md" ".claude/plans/FEATURE_PLAN_" ".claude/plans/" ".claude/reports/TEST_REPORT_" ".ledger.md"; do
  grep -qF "$p" pipeline-contract.md && echo "OK   $p" || echo "MISS $p"
done
```

Expected: six `OK` lines.

---

### Task 2: `map.mjs` — repo resolution and pruned walk

The first real code. TDD applies: test, watch it fail, implement, watch it pass.

**Files:**
- Create: `~/.claude/skills/map-codebase/map.mjs`
- Create: `~/.claude/skills/map-codebase/test-map.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `findRepoRoot(startDir: string): string | null` — absolute path of the directory containing `.git`, walking up from `startDir`; `null` if none found before the filesystem root.
  - `walk(root: string): string[]` — repo-relative POSIX-separated paths of every file under `root`, excluding the prune list.
  - `PRUNE: Set<string>` — directory names never descended into.

- [ ] **Step 1: Write the failing tests**

Create `test-map.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findRepoRoot, walk, PRUNE } from './map.mjs'

function fixture (layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mapmjs-'))
  for (const [rel, body] of Object.entries(layout)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  return root
}

test('findRepoRoot walks up to the directory holding .git', () => {
  const root = fixture({ '.git/HEAD': 'ref: refs/heads/main\n', 'src/deep/nested/a.cs': '' })
  const found = findRepoRoot(path.join(root, 'src', 'deep', 'nested'))
  assert.equal(fs.realpathSync(found), fs.realpathSync(root))
})

test('findRepoRoot returns null when no .git exists anywhere above', () => {
  const root = fixture({ 'src/a.cs': '' })
  assert.equal(findRepoRoot(path.join(root, 'src')), null)
})

test('walk returns repo-relative posix paths', () => {
  const root = fixture({ '.git/HEAD': '', 'src/app/Program.cs': '', 'README.md': '' })
  const files = walk(root)
  assert.ok(files.includes('src/app/Program.cs'))
  assert.ok(files.includes('README.md'))
})

test('walk prunes build and dependency directories', () => {
  const root = fixture({
    '.git/HEAD': '',
    'src/a.cs': '',
    'node_modules/pkg/index.js': '',
    'src/bin/Debug/a.dll': '',
    'src/obj/x.json': '',
    'dist/bundle.js': '',
    'coverage/lcov.info': ''
  })
  const files = walk(root)
  assert.deepEqual(files, ['src/a.cs'])
})

test('PRUNE covers every directory the spec names', () => {
  for (const d of ['node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.vs', 'packages', 'coverage']) {
    assert.ok(PRUNE.has(d), `PRUNE missing ${d}`)
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: FAIL — `Cannot find module ... map.mjs` (the file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `map.mjs`:

```js
#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

export const PRUNE = new Set([
  'node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.vs', 'packages', 'coverage'
])

export function findRepoRoot (startDir) {
  let dir = path.resolve(startDir)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function walk (root) {
  const out = []
  const rec = (abs, rel) => {
    let entries
    try { entries = fs.readdirSync(abs, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (PRUNE.has(e.name)) continue
        rec(path.join(abs, e.name), rel ? `${rel}/${e.name}` : e.name)
      } else if (e.isFile()) {
        out.push(rel ? `${rel}/${e.name}` : e.name)
      }
    }
  }
  rec(path.resolve(root), '')
  return out.sort()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: PASS, 5 tests, 0 failures.

---

### Task 3: `map.mjs` — stack and entry-point detection

**Files:**
- Modify: `~/.claude/skills/map-codebase/map.mjs`
- Modify: `~/.claude/skills/map-codebase/test-map.mjs`

**Interfaces:**
- Consumes: `walk` and `PRUNE` from Task 2.
- Produces:
  - `detectStacks(files: string[]): string[]` — sorted unique stack names drawn from `dotnet`, `flutter`, `node`, `python`, `go`.
  - `findEntryPoints(files: string[]): string[]` — files whose basename matches a known entry-point pattern.
  - `findTestAndCi(files: string[]): { tests: string[], ci: string[] }`.

- [ ] **Step 1: Write the failing tests**

Append to `test-map.mjs` (and extend the import on line 6 to `{ findRepoRoot, walk, PRUNE, detectStacks, findEntryPoints, findTestAndCi }`):

```js
test('detectStacks identifies dotnet from csproj and sln', () => {
  assert.deepEqual(detectStacks(['src/App/App.csproj', 'App.sln']), ['dotnet'])
})

test('detectStacks identifies every supported stack', () => {
  const files = ['a/App.csproj', 'b/pubspec.yaml', 'c/package.json', 'd/pyproject.toml', 'e/go.mod']
  assert.deepEqual(detectStacks(files), ['dotnet', 'flutter', 'go', 'node', 'python'])
})

test('detectStacks returns empty for an unrecognised tree', () => {
  assert.deepEqual(detectStacks(['docs/readme.txt']), [])
})

test('findEntryPoints matches known entry files', () => {
  const found = findEntryPoints([
    'src/Api/Program.cs', 'src/Api/Startup.cs', 'lib/main.dart',
    'web/src/index.ts', 'svc/server.js', 'src/Api/Helper.cs'
  ])
  assert.ok(found.includes('src/Api/Program.cs'))
  assert.ok(found.includes('lib/main.dart'))
  assert.ok(found.includes('svc/server.js'))
  assert.ok(!found.includes('src/Api/Helper.cs'))
})

test('findTestAndCi separates test projects from pipeline files', () => {
  const { tests, ci } = findTestAndCi([
    'tests/App.Tests/App.Tests.csproj', 'test/widget_test.dart',
    'azure-pipelines.yml', '.github/workflows/ci.yml', 'src/App/App.csproj'
  ])
  assert.ok(tests.includes('tests/App.Tests/App.Tests.csproj'))
  assert.ok(tests.includes('test/widget_test.dart'))
  assert.ok(ci.includes('azure-pipelines.yml'))
  assert.ok(ci.includes('.github/workflows/ci.yml'))
  assert.ok(!tests.includes('src/App/App.csproj'))
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: FAIL — `detectStacks is not a function` (or a SyntaxError on the import), 5 new failures.

- [ ] **Step 3: Write the minimal implementation**

Append to `map.mjs`:

```js
const STACK_MARKERS = [
  ['dotnet', f => f.endsWith('.csproj') || f.endsWith('.sln')],
  ['flutter', f => f.endsWith('pubspec.yaml')],
  ['node', f => f.endsWith('package.json')],
  ['python', f => f.endsWith('pyproject.toml') || f.endsWith('pytest.ini')],
  ['go', f => f.endsWith('go.mod')]
]

const ENTRY_NAMES = new Set(['Program.cs', 'Startup.cs', 'main.dart'])
const ENTRY_STEMS = new Set(['index', 'server', 'main'])
const ENTRY_EXTS = new Set(['.ts', '.js', '.mjs', '.py', '.go'])

export function detectStacks (files) {
  const hit = new Set()
  for (const f of files) {
    for (const [name, match] of STACK_MARKERS) if (match(f)) hit.add(name)
  }
  return [...hit].sort()
}

export function findEntryPoints (files) {
  return files.filter(f => {
    const base = path.posix.basename(f)
    if (ENTRY_NAMES.has(base)) return true
    const ext = path.posix.extname(base)
    return ENTRY_EXTS.has(ext) && ENTRY_STEMS.has(base.slice(0, -ext.length))
  }).sort()
}

export function findTestAndCi (files) {
  const tests = files.filter(f =>
    /(^|\/)(tests?|spec)\//i.test(f) || /\.(tests?|spec)\.[a-z]+$/i.test(f) ||
    /(Tests?|Spec)\.csproj$/.test(f) || /_test\.(dart|go|py)$/.test(f)
  ).sort()
  const ci = files.filter(f =>
    /(^|\/)azure-pipelines[^/]*\.ya?ml$/i.test(f) ||
    /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(f) ||
    /(^|\/)\.gitlab-ci\.ya?ml$/i.test(f)
  ).sort()
  return { tests, ci }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: PASS, 10 tests, 0 failures.

---

### Task 4: `map.mjs` — drift verification

This is the zero-token check `cleanup-crew` depends on, so its exit code contract matters.

**Files:**
- Modify: `~/.claude/skills/map-codebase/map.mjs`
- Modify: `~/.claude/skills/map-codebase/test-map.mjs`

**Interfaces:**
- Consumes: `findRepoRoot` from Task 2.
- Produces:
  - `citedPaths(mapText: string): string[]` — repo-relative paths cited in backticks in a map file. A token counts as a cited path only if it contains a `/` and has a file extension, and contains no `*`. This excludes prose, globs, and bare command names.
  - `verifyMaps(root: string): { ok: boolean, drift: Array<{ map: string, missing: string }> }`.

- [ ] **Step 1: Write the failing tests**

Append to `test-map.mjs` (extend the import to include `citedPaths, verifyMaps`):

```js
test('citedPaths extracts backticked file paths only', () => {
  const md = [
    'The handler lives at `src/Api/Controllers/AssetController.cs` and calls',
    '`src/Api/Services/AssetService.cs`. Run `dotnet test` to check.',
    'Globs like `src/**/*.cs` are not citations, nor is `Program` alone.'
  ].join('\n')
  assert.deepEqual(citedPaths(md), [
    'src/Api/Controllers/AssetController.cs',
    'src/Api/Services/AssetService.cs'
  ])
})

test('verifyMaps reports no drift when every cited path exists', () => {
  const root = fixture({
    '.git/HEAD': '',
    'src/Api/Program.cs': '',
    '.claude/maps/ARCHITECTURE_MAP.md': 'Entry point is `src/Api/Program.cs`.'
  })
  const r = verifyMaps(root)
  assert.equal(r.ok, true)
  assert.deepEqual(r.drift, [])
})

test('verifyMaps reports drift for a cited path that no longer exists', () => {
  const root = fixture({
    '.git/HEAD': '',
    '.claude/maps/ARCHITECTURE_MAP.md': 'Handler is `src/Api/GoneController.cs`.'
  })
  const r = verifyMaps(root)
  assert.equal(r.ok, false)
  assert.equal(r.drift.length, 1)
  assert.equal(r.drift[0].missing, 'src/Api/GoneController.cs')
})

test('verifyMaps is ok when there are no maps at all', () => {
  const root = fixture({ '.git/HEAD': '', 'src/a.cs': '' })
  const r = verifyMaps(root)
  assert.equal(r.ok, true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: FAIL — `citedPaths is not a function`, 4 new failures.

- [ ] **Step 3: Write the minimal implementation**

Append to `map.mjs`:

```js
export function citedPaths (mapText) {
  const out = new Set()
  for (const m of mapText.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim()
    if (!t.includes('/')) continue
    if (t.includes('*') || t.includes(' ')) continue
    if (!/\.[A-Za-z0-9]+$/.test(t)) continue
    out.add(t.replace(/^\.\//, ''))
  }
  return [...out].sort()
}

export function verifyMaps (root) {
  const mapsDir = path.join(root, '.claude', 'maps')
  const drift = []
  if (!fs.existsSync(mapsDir)) return { ok: true, drift }
  const mapFiles = walk(mapsDir).filter(f => f.endsWith('.md'))
  for (const rel of mapFiles) {
    const text = fs.readFileSync(path.join(mapsDir, rel), 'utf8')
    for (const cited of citedPaths(text)) {
      if (!fs.existsSync(path.join(root, cited))) {
        drift.push({ map: `.claude/maps/${rel}`, missing: cited })
      }
    }
  }
  return { ok: drift.length === 0, drift }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: PASS, 14 tests, 0 failures.

---

### Task 5: `map.mjs` — change detection and CLI

**Files:**
- Modify: `~/.claude/skills/map-codebase/map.mjs`
- Modify: `~/.claude/skills/map-codebase/test-map.mjs`

**Interfaces:**
- Consumes: everything from Tasks 2–4.
- Produces:
  - `changedFiles(root: string): string[]` — union of `git diff --name-only HEAD`, `git diff --name-only --staged`, and `git ls-files --others --exclude-standard`, de-duplicated and sorted. Returns `[]` when git fails.
  - CLI: `node map.mjs <scan|update|verify> [--root <dir>]`. Prints JSON to stdout. `verify` exits 1 on drift, 0 otherwise; `scan` and `update` always exit 0. An unknown command exits 2 with a usage line on stderr.

- [ ] **Step 1: Write the failing tests**

Append to `test-map.mjs` (extend the import to include `changedFiles`; add `import { execFileSync } from 'node:child_process'` at the top):

```js
test('changedFiles lists untracked and modified files in a real repo', () => {
  const root = fixture({ 'tracked.cs': 'v1', 'untracked.cs': 'new' })
  const git = a => execFileSync('git', a, { cwd: root, stdio: 'pipe' })
  git(['init', '-q'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'test'])
  git(['add', 'tracked.cs'])
  git(['commit', '-qm', 'init'])
  fs.writeFileSync(path.join(root, 'tracked.cs'), 'v2')
  const changed = changedFiles(root)
  assert.ok(changed.includes('tracked.cs'))
  assert.ok(changed.includes('untracked.cs'))
})

test('changedFiles returns empty when the directory is not a git repo', () => {
  const root = fixture({ 'a.cs': '' })
  assert.deepEqual(changedFiles(root), [])
})

test('CLI verify exits 1 on drift and 0 when clean', () => {
  const cli = path.resolve('map.mjs')
  const dirty = fixture({
    '.git/HEAD': '',
    '.claude/maps/ARCHITECTURE_MAP.md': 'Gone: `src/Nope.cs`.'
  })
  let code = 0
  try {
    execFileSync(process.execPath, [cli, 'verify', '--root', dirty], { stdio: 'pipe' })
  } catch (e) { code = e.status }
  assert.equal(code, 1)

  const clean = fixture({ '.git/HEAD': '', 'src/a.cs': '' })
  const out = execFileSync(process.execPath, [cli, 'verify', '--root', clean], { stdio: 'pipe' })
  assert.equal(JSON.parse(out.toString()).ok, true)
})

test('CLI scan emits stacks and entry points as JSON', () => {
  const cli = path.resolve('map.mjs')
  const root = fixture({ '.git/HEAD': '', 'src/App.csproj': '', 'src/Program.cs': '' })
  const out = execFileSync(process.execPath, [cli, 'scan', '--root', root], { stdio: 'pipe' })
  const json = JSON.parse(out.toString())
  assert.deepEqual(json.stacks, ['dotnet'])
  assert.ok(json.entryPoints.includes('src/Program.cs'))
})

test('CLI exits 2 on an unknown command', () => {
  const cli = path.resolve('map.mjs')
  let code = 0
  try {
    execFileSync(process.execPath, [cli, 'bogus'], { stdio: 'pipe' })
  } catch (e) { code = e.status }
  assert.equal(code, 2)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: FAIL — `changedFiles is not a function`, and the CLI tests fail because `map.mjs` produces no output.

- [ ] **Step 3: Write the minimal implementation**

Append to `map.mjs`:

```js
import { execFileSync } from 'node:child_process'

export function changedFiles (root) {
  const run = args => {
    try {
      return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().split('\n').map(s => s.trim()).filter(Boolean)
    } catch { return null }
  }
  const parts = [
    run(['diff', '--name-only', 'HEAD']),
    run(['diff', '--name-only', '--staged']),
    run(['ls-files', '--others', '--exclude-standard'])
  ]
  if (parts.every(p => p === null)) return []
  return [...new Set(parts.filter(Boolean).flat())].sort()
}

function cli (argv) {
  const cmd = argv[0]
  const rootFlag = argv.indexOf('--root')
  const start = rootFlag !== -1 ? argv[rootFlag + 1] : process.cwd()
  const root = findRepoRoot(start) ?? start

  if (cmd === 'scan') {
    const files = walk(root)
    const { tests, ci } = findTestAndCi(files)
    process.stdout.write(JSON.stringify({
      root, fileCount: files.length, stacks: detectStacks(files),
      entryPoints: findEntryPoints(files), tests, ci
    }, null, 2) + '\n')
    return 0
  }
  if (cmd === 'update') {
    process.stdout.write(JSON.stringify({ root, changed: changedFiles(root) }, null, 2) + '\n')
    return 0
  }
  if (cmd === 'verify') {
    const r = verifyMaps(root)
    process.stdout.write(JSON.stringify({ root, ...r }, null, 2) + '\n')
    return r.ok ? 0 : 1
  }
  process.stderr.write('usage: map.mjs <scan|update|verify> [--root <dir>]\n')
  return 2
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.filename === process.argv[1]) {
  process.exit(cli(process.argv.slice(2)))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: PASS, 19 tests, 0 failures.

- [ ] **Step 5: Smoke-test against a real repo**

```bash
cd "C:/Users/Jason_Weiss/Projects/FuzionTrackFams" && \
node "$HOME/.claude/skills/map-codebase/map.mjs" scan | head -40
```

Expected: JSON naming `dotnet` in `stacks`, a non-zero `fileCount`, and real `.csproj`/`Program.cs` paths. If `stacks` is empty or `fileCount` is 0, the walk or detection is wrong — fix before continuing.

---

### Task 6: `map-codebase/SKILL.md`

**Files:**
- Create: `~/.claude/skills/map-codebase/SKILL.md`

**Interfaces:**
- Consumes: the `map.mjs` CLI contract from Task 5; `pipeline-contract.md` sections from Task 1.
- Produces: the maps that Tasks 7–9 read, in the format spec §4.3 defines.

- [ ] **Step 1: Write the skill file**

Frontmatter exactly:

```yaml
---
name: map-codebase
description: >
  Generate and maintain high-signal architecture maps of the current repository so future
  sessions understand end-to-end feature flows without reading source. Modes: full build,
  --update for changed domains only, --verify for a zero-token drift check. Triggered by
  /map-codebase.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---
```

Body sections, in order:

1. **Overview** — what a map is for, and the rule that the script does all deterministic work: always run `node ~/.claude/skills/map-codebase/map.mjs scan` before any Glob or Grep, and never re-walk the tree by hand.
2. **Preflight** — resolve the repo per `_shared/pipeline-contract.md` § Repo resolution; if there is no `.git`, say so and stop. Ensure `.gitignore` contains `.claude/maps/`, `.claude/plans/`, `.claude/reports/`.
3. **Modes** — a three-row table for full build / `--update` / `--verify`, mapping each to its `map.mjs` subcommand. `--verify` must be documented as costing no model tokens: run the script, report its JSON, stop.
4. **What to write** — spec §4.3 verbatim: purpose, input/output schema, exact file paths in call order, explicitly enumerated side effects (database writes, external API calls, message queue publishes/consumes, file system writes, cache invalidations), a mermaid `graph TD` or `sequenceDiagram` where a flow exceeds three steps, and the rule to abstract the *how* while detailing the *what* and *where*. State plainly: no function bodies, no code dumps, no boilerplate.
5. **Search hints ledger** — spec §4.4, including the exact line format `<topic> -> <dir/file glob>   (verified <date>; ~<tokens> to locate)` and that it is append-only in `.claude/maps/index.md`.
6. **Read-only guardrail** — reproduce spec §4.4's guardrail in full, marked non-negotiable.
7. **Staleness check** — spec §4.5, including the 14-day threshold and the three-entry glob spot-check, and the instruction never to re-walk the tree "to make sure".
8. **Common mistakes** — at minimum: re-walking instead of running the script; dumping code into a map; writing a mermaid diagram for a two-step flow; forgetting to fold new locations back into the hints ledger; treating the `Projects` folder as a repo.
9. **Next step** — end by naming `/plan-feature` as what typically follows. Do not invoke it.

- [ ] **Step 2: Verify frontmatter and required content**

```bash
cd "$HOME/.claude/skills/map-codebase" && \
head -1 SKILL.md | grep -qx -- '---' && echo "OK frontmatter opens" ; \
for s in "disable-model-invocation: true" "allowed-tools: Bash, Read, Write, Edit, Glob, Grep" \
         "map.mjs" "sequenceDiagram" "Side effects" "verified" "14" "/plan-feature"; do
  grep -qiF "$s" SKILL.md && echo "OK   $s" || echo "MISS $s"
done
```

Expected: all `OK`, no `MISS`.

- [ ] **Step 3: Verify no non-goal leaked in**

```bash
cd "$HOME/.claude/skills/map-codebase" && \
grep -niE 'post-commit|post-merge|git hook|settings\.json|claude -p|claude-3-' SKILL.md \
  && echo "FAIL: non-goal present" || echo "OK: clean"
```

Expected: `OK: clean`.

---

### Task 7: `plan-feature/SKILL.md`

**Files:**
- Create: `~/.claude/skills/plan-feature/SKILL.md`

**Interfaces:**
- Consumes: maps from Task 6; `ado.ps1` (already installed); contract sections from Task 1.
- Produces: `.claude/plans/FEATURE_PLAN_<Name>.md` with sections `## Tier 1 — Status Quo`, `## Tier 2 — Localized Optimization`, `## Tier 3 — Global Upgrade (sketch)`, each tier containing a `### File Impact Manifest` and `### Milestones`; plus a final `## Contingency`. Task 8 parses these headings.

- [ ] **Step 1: Write the skill file**

Frontmatter:

```yaml
---
name: plan-feature
description: >
  Turn an Azure DevOps ticket or a written description into a three-tier implementation plan
  with File Impact Manifests, scored effort, milestones and hard pauses. Reads the architecture
  maps; writes only the plan file, never source. Triggered by /plan-feature.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
---
```

Body sections, in order:

1. **Constraint** — stated first and unmissably: this skill writes exactly one file, the plan, and never modifies source. If asked mid-run to "just make the change", refuse and point at `/execute-plan`.
2. **Ingestion** — spec §5.2. Include the literal command form `powershell -File ~/.claude/skills/ado-status/ado.ps1 workitem -Id <id>`, the four fields to extract (`System.Title`, `System.Description`, `Microsoft.VSTS.Common.AcceptanceCriteria`, `Microsoft.VSTS.TCM.ReproSteps`) plus the comment thread, HTML stripped. State that requests are GET-only and the PAT is never printed. Include the empty-ticket rule verbatim: if title, description, acceptance criteria and repro steps are all empty, do not proceed on the title alone — ask the user to confirm scope, because a guessed task poisons every downstream stage.
3. **Map contextualisation** — spec §5.3, including the rule that if no maps exist, offer `/map-codebase` and do **not** silently fall back to scanning source.
4. **Three-tier design engine** — the table from spec §5.4 with tiers 1 and 2 at full depth and tier 3 as a sketch, followed by the File Impact Manifest rule (exhaustive create/modify/delete list with a one-line reason per file, for tiers 1 and 2; an affected-area summary for tier 3).
5. **Scoring** — the calibration bands verbatim: **S ~5–15k**, **M ~15–40k**, **L ~40–100k**, **XL >100k**, with their definitions from spec §5.4, plus complexity 1–5, estimated file count, risks and unknowns, and reusable existing utilities with file paths. State that effort means Claude Code's execution effort, never the user's wall-clock time.
6. **Milestones and hard pauses** — spec §5.5. Every milestone ends with a literal directive addressed to the future implementing session: stop coding, ask the user to test to this point, wait for explicit approval.
7. **Contingency** — spec §5.6: consolidated risks, named fallback approaches drawn from the tiers not chosen, and the validation gate (worktree pseudo-build → runtime tests → `/code-review` → `/test-feature`, proceed only if clean).
8. **Output** — write to `.claude/plans/FEATURE_PLAN_<Name>.md` per the contract's name-derivation rule. Use `AskUserQuestion` to let the user pick a tier; record the choice in the plan.
9. **Next step** — name `/execute-plan`. Do not invoke it.

- [ ] **Step 2: Verify required content**

```bash
cd "$HOME/.claude/skills/plan-feature" && \
for s in "disable-model-invocation: true" "ado.ps1" "Microsoft.VSTS.Common.AcceptanceCriteria" \
         "File Impact Manifest" "5–15k" "15–40k" "40–100k" ">100k" \
         "FEATURE_PLAN_" "/execute-plan" "/map-codebase"; do
  grep -qF "$s" SKILL.md && echo "OK   $s" || echo "MISS $s"
done
```

Expected: all `OK`. If a band shows `MISS`, check the dash character — the bands use an en dash (`–`), not a hyphen.

- [ ] **Step 3: Verify the non-mutation constraint is stated before anything else**

```bash
cd "$HOME/.claude/skills/plan-feature" && \
awk '/^## /{n++} n<=1' SKILL.md | grep -qiE 'never (modif|touch|edit).*source|writes exactly one file' \
  && echo "OK: constraint stated in the first section" || echo "FAIL: constraint buried"
```

Expected: `OK`.

---

### Task 8: `execute-plan/SKILL.md`

The one skill that spends real money, so its guards are the deliverable.

**Files:**
- Create: `~/.claude/skills/execute-plan/SKILL.md`

**Interfaces:**
- Consumes: `FEATURE_PLAN_<Name>.md` headings from Task 7; correction plans from Task 9.
- Produces: `.claude/plans/<Name>.ledger.md` with the `STAT` line format below, which Task 9 reads.

- [ ] **Step 1: Write the skill file**

Frontmatter:

```yaml
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
```

Body sections, in order:

1. **Gate** — refuse if plan mode is active (this executes an approved plan, it does not write one). Locate the plan: explicit argument, else the newest `.claude/plans/FEATURE_PLAN_*.md`, else ask. Read it once and extract the selected tier, its milestones, manifest, and test cases.
2. **Budget guard** — the ceiling is **350k output tokens per milestone**, set as `budget.total` in the Workflow script. Before dispatching, print the milestone's projected cost by summing the plan's per-task token bands. When `budget.remaining()` drops below the next task's estimate, hard-stop and ask whether to continue. State that this figure is revisable but never silently exceeded.
3. **Model policy** — reproduce spec §6.3's three-row table with the exact IDs `claude-haiku-4-5-20251001` and `claude-sonnet-5`. State: subagents never exceed Sonnet; always specify the model explicitly, because an omitted model inherits the controller's Opus and violates the cap.
4. **Escalation ladder** — the four steps from spec §6.4: Haiku; Sonnet with attempt-1 findings; Sonnet with accumulated findings; then the controller implements it. Add the note that the original "escalate to Opus" is deliberately replaced by "the controller does it" — same capability, no unsupervised subagent on the expensive model.
5. **Verification** — spec §6.5. Lead with the rule in bold: **a capped subagent never grades its own work.** Controller checks the diff against the atomic task spec and the plan's constraints and test cases, covering architecture-map adherence, syntax, logic, and goal alignment. Large diffs go to a dedicated Sonnet verifier subagent; small diffs inline.
6. **Regression re-evaluation** — after each task, validate the integration so far, not just the new task. The plan governs. A genuinely self-contradictory plan is escalated as a plan defect, never improvised around.
7. **Ledger** — `.claude/plans/<Name>.ledger.md`, first line naming the plan file, with this exact `STAT` format:
   ```
   STAT | task=<N> | role=subagent|verifier|verify-inline | model=<haiku-4-5|sonnet-5|controller> | round=<k> | status=<DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT|PASS|FAIL> | tokens=<n>
   ```
   Plus a top rollup: dispatch counts by tier, verifier count, fix rounds, cumulative tokens against the 350k ceiling.
8. **Isolation and milestone pause** — worktree via `superpowers:using-git-worktrees` (non-git fallback where needed; in-place only with explicit go-ahead). On milestone completion print this message verbatim and wait for input:
   > Milestone [X] complete. Please run your tests and verify the functionality. Type 'Approve' to begin the next milestone, or provide feedback for corrections.
9. **Workflow declined fallback** — if the user declines the multi-agent opt-in, degrade to a single-context executor doing each task with the same verify/fix loop, and say so plainly.
10. **Red flags** — a table of stop conditions: dispatching without an explicit model; letting a subagent verify itself; exceeding Sonnet to break a stuck loop; declaring done without running the plan's verification; treating a subagent's edit as truth over the plan.
11. **Next step** — name `/test-feature`. Do not invoke it.

- [ ] **Step 2: Verify the budget and model guards**

```bash
cd "$HOME/.claude/skills/execute-plan" && \
for s in "350k" "claude-haiku-4-5-20251001" "claude-sonnet-5" "budget.total" "budget.remaining" \
         "Workflow" "STAT | task=" "Type 'Approve'"; do
  grep -qF "$s" SKILL.md && echo "OK   $s" || echo "MISS $s"
done
grep -c "500k" SKILL.md | grep -qx 0 && echo "OK: no stale ceiling" || echo "FAIL: 500k present"
```

Expected: all `OK`, plus `OK: no stale ceiling`.

- [ ] **Step 3: Verify no forbidden model tier or dispatch mechanism**

```bash
cd "$HOME/.claude/skills/execute-plan" && \
grep -niE 'claude-3-|opus.*(minion|subagent)|(minion|subagent).*opus|claude -p' SKILL.md \
  | grep -viE 'never|forbidden|violates|inherits|not permitted|deliberately replaced' \
  && echo "FAIL: check the lines above" || echo "OK: clean"
```

Expected: `OK: clean`. Any surviving line is a genuine cap violation, not a rule statement.

---

### Task 9: `test-feature/SKILL.md`

**Files:**
- Create: `~/.claude/skills/test-feature/SKILL.md`

**Interfaces:**
- Consumes: the plan headings from Task 7 and the ledger from Task 8.
- Produces: `.claude/reports/TEST_REPORT_<Name>.md` ending in a `## Correction Plan` section — a numbered list of atomic fixes phrased so Task 8's decomposer can consume it directly as a task list.

- [ ] **Step 1: Write the skill file**

Frontmatter:

```yaml
---
name: test-feature
description: >
  Grade an implemented feature against its plan at a chosen rigour level (--optimism 1-5),
  measuring real coverage at level 3 and above, judging test effectiveness, and checking
  completeness, security, deployment, pipeline and efficiency vectors. Writes only a test
  report, never source. Triggered by /test-feature.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Glob, Grep, Skill, AskUserQuestion
---
```

Body sections, in order:

1. **Constraint** — stated first: writes exactly one file, the report. Never edits source, never commits.
2. **Optimism scale** — the five-row table from spec §7.2 with the "Runs tests?" column. Levels 1–2 static and cheap; 3–5 build and run for real. Default is 3 when `--optimism` is omitted.
3. **Stack detection and coverage** — the five-row marker→command table from spec §7.3 verbatim, including `dotnet test --collect:"XPlat Code Coverage"`, `flutter test --coverage` with `coverage/lcov.info` parsing, `npm test -- --coverage`, `pytest --cov`, and `go test -cover ./...`. Buckets: **Critical** 0%, **Partial** 1–79%, **Compliant** ≥80% or the project's own contractual threshold. For changed and critical files, list the specific uncovered lines.
4. **Evidence before assertions** — never state a coverage number or a pass/fail without showing the command output it came from. If the build fails or tooling is missing, say so explicitly and fall back to static reasoning, labelled as such.
5. **Test effectiveness** — spec §7.4: tests that execute without asserting anything meaningful; missing edge cases, error paths, boundary values; tautological mocks that assert the mock; coverage theatre. Recommend mutation testing where the signal is worth it.
6. **Mandatory evaluation vectors** — the five from spec §7.5, numbered, with the note that intensity scales with optimism but none may be skipped.
7. **.NET checklist** — spec §7.6, applied only when the detected stack is dotnet: N+1 LINQ and `.ToList()` before filtering; bypassed DI and bloated controllers; unsanitised input and hardcoded secrets; missing `ConfigureAwait`/`CancellationToken`; null handling; async state machine and GC traps. Include the rule: explain *why* a finding is wrong, not only how to fix it.
8. **Correctness pass** — invoke `/code-review` via the Skill tool in report-only mode, never `--fix` or `--comment`, and de-duplicate its findings against this skill's own.
9. **Output** — `.claude/reports/TEST_REPORT_<Name>.md`, structured as Passes / Warnings / Critical Failures, closing with `## Correction Plan`.
10. **Next step** — name `/execute-plan` if the correction plan is non-empty, otherwise `/cleanup-crew`. Do not invoke either.

- [ ] **Step 2: Verify the coverage table and vectors**

```bash
cd "$HOME/.claude/skills/test-feature" && \
for s in 'XPlat Code Coverage' 'flutter test --coverage' 'pytest --cov' 'go test -cover' \
         'lcov.info' 'Critical' 'Partial' 'Compliant' 'Correction Plan' \
         'ConfigureAwait' 'code-review'; do
  grep -qF "$s" SKILL.md && echo "OK   $s" || echo "MISS $s"
done
```

Expected: all `OK`.

- [ ] **Step 3: Verify all five optimism levels are defined**

```bash
cd "$HOME/.claude/skills/test-feature" && \
for n in 1 2 3 4 5; do
  grep -qE "(^\| *$n *\||Level +$n|LEVEL +$n)" SKILL.md && echo "OK   level $n" || echo "MISS level $n"
done
grep -qiE 'report[- ]only' SKILL.md && echo "OK code-review is report-only" || echo "MISS report-only"
```

Expected: five `OK` levels plus the report-only line.

---

### Task 10: `cleanup-crew/SKILL.md`

**Files:**
- Create: `~/.claude/skills/cleanup-crew/SKILL.md`

**Interfaces:**
- Consumes: `map.mjs verify` from Task 5.
- Produces: a pushed feature branch. Terminal stage — nothing consumes its output.

- [ ] **Step 1: Write the skill file**

Frontmatter:

```yaml
---
name: cleanup-crew
description: >
  Stash, branch off an up-to-date base, restore work, refresh docs, and drive a reviewed
  conventional commit and push in preparation for a pull request. Hard-pauses for the base
  branch, the new branch name, any stash conflict, and the composed commit. Triggered by
  /cleanup-crew.
disable-model-invocation: true
allowed-tools: Bash(git *), Read, Write, Edit, Glob, Grep, AskUserQuestion
---
```

Body: the eight numbered steps from spec §8.1, each marked with whether it is a **hard pause**.

0. **Drift preflight** — `node ~/.claude/skills/map-codebase/map.mjs verify`. On exit 1, warn and offer `/map-codebase --update` before continuing. Costs no model tokens.
1. **Stash** — `git status`; if dirty, `git stash push -u`.
2. **Base branch** — ask *"Which branch should we branch off of? (e.g. main, develop)"*. **HARD PAUSE.** Then `git checkout <base>` and `git pull`.
3. **Feature branch** — ask *"What should the new feature branch be named?"*. **HARD PAUSE.** Then `git checkout -b <name>`.
4. **Restore** — `git stash pop`. **On any conflict: HARD PAUSE.** Show the conflicted files and both sides, and wait for a per-file decision. State explicitly that this skill does **not** auto-resolve in favour of the stash, and why: silently discarding a change pulled from base seconds earlier is not an acceptable default.
5. **Docs refresh** — update `README.md` to match what the code now does, creating one if absent. Maintain a gitignored append-only `changes.md`: ensure the `.gitignore` entry exists, ask for the ticket number(s), and append a dated entry using `date +%Y-%m-%d` in this exact format:
   ```
   ## <YYYY-MM-DD> — <ticket(s)>
   - <change 1>
   ```
6. **Summarise** — analyse the applied changes, present a brief summary of files changed and the feature or fix implemented, then ask for task links or ticket references. **HARD PAUSE** — skipped only if step 5 already captured them.
7. **Commit and push** — show the staged file list for confirmation, then:
   ```
   git add -A
   git commit -m "<title>" -m "<short description of all changes>" -m "<#123 #456>"
   git push -u origin <new_branch>
   ```
   The three `-m` flags are: concise title; short description of all changes; each ticket as `#<number>`, space-delimited. Show the fully composed command and get approval before running it. **HARD PAUSE.** Report the commit hash, push result, and any PR URL git prints.

Close with a **Guardrails** section: never force-push; never push to `main` or `master`; abort and surface the error if `git stash pop` fails unexpectedly, the target is not a git repo, or the working-tree state is unclear.

- [ ] **Step 2: Verify the hard pauses and commit format**

```bash
cd "$HOME/.claude/skills/cleanup-crew" && \
echo "hard pauses: $(grep -ciF 'HARD PAUSE' SKILL.md) (expect >= 5)" && \
for s in 'git stash push -u' 'git checkout -b' 'git stash pop' 'git push -u origin' \
         'map.mjs verify' 'changes.md' '-m "<title>"' 'force-push'; do
  grep -qF "$s" SKILL.md && echo "OK   $s" || echo "MISS $s"
done
```

Expected: at least five hard pauses, all `OK`.

- [ ] **Step 3: Verify the conflict rule is the new one, not the retired behaviour**

```bash
cd "$HOME/.claude/skills/cleanup-crew" && \
grep -niE 'favou?r.{0,20}stash|--theirs|automatically resolve' SKILL.md \
  | grep -viE 'does not|never|not an acceptable|unlike|deliberately' \
  && echo "FAIL: auto-resolve language survives" || echo "OK: stop-and-ask enforced"
```

Expected: `OK: stop-and-ask enforced`.

---

### Task 11: Retire the superseded skills

Nothing is deleted. Moving a directory out of `~/.claude/skills/` is what makes a skill inert, and moving it back restores it.

**Files:**
- Create: `~/.claude/skills/_retired/README.md`
- Move: `~/.claude/skills/{batman,gru,review-my-code,roast}` → `~/.claude/skills/_retired/`

- [ ] **Step 1: Find dangling references before moving anything**

```bash
cd "$HOME/.claude/skills" && \
grep -rniE '/?(batman|gru|review-my-code|roast)\b' \
  --include=SKILL.md . | grep -vE '^\./(batman|gru|review-my-code|roast)/'
```

Record every hit. Expected culprits are `morning`, `goodnight`, `quest-log`, and `ado-status`. An empty result means no updates are needed in Step 3.

- [ ] **Step 2: Move the four directories**

```bash
cd "$HOME/.claude/skills" && mkdir -p _retired && \
for s in batman gru review-my-code roast; do
  [ -d "$s" ] && mv "$s" "_retired/$s" && echo "moved $s"
done && ls -1 _retired
```

Expected: four `moved` lines, then a listing of all four directories. Confirm `_retired/gru/minion-prompt.md` and `_retired/gru/verifier-prompt.md` came across:

```bash
ls -1 "$HOME/.claude/skills/_retired/gru"
```

- [ ] **Step 3: Update each dangling reference found in Step 1**

Rewrite each hit to point at its successor: `batman` → `/plan-feature`; `gru` → `/execute-plan`; `review-my-code` → `/test-feature`; `roast` → `/test-feature`. Where a retired skill was named as a dependency, replace the dependency rather than dropping the sentence.

- [ ] **Step 4: Write the retirement record**

Create `_retired/README.md` stating the retirement date (2026-08-17), that these directories are inert while they live here and are restored by moving them back one level, and a mapping table:

| Retired | Successor | Why |
|---|---|---|
| `batman` | `/plan-feature` (+ `/map-codebase`) | Ticket ingestion, repo mapping and scored planning split across the two new stages |
| `gru` | `/execute-plan` | Same controller-verifies loop, now under a hard 350k token ceiling |
| `review-my-code` | `/test-feature` (+ `/cleanup-crew`) | Coverage and effectiveness went to test-feature; the git and docs flow went to cleanup-crew |
| `roast` | `/test-feature` | The .NET review checklist is now a stack-conditional section |

- [ ] **Step 5: Verify the retirement is clean**

```bash
cd "$HOME/.claude/skills" && \
echo "-- active skills --" && ls -1d */ | grep -v '^_' && \
echo "-- dangling refs (expect none) --" && \
grep -rniE '/(batman|gru|review-my-code|roast)\b' --include=SKILL.md . \
  | grep -v '^\./_retired/' || echo "none"
```

Expected: the active listing contains all five new skills and none of the retired four; the dangling-reference check prints `none`.

---

### Task 12: End-to-end verification

**Files:** none created or modified.

- [ ] **Step 1: Verify all five skills parse and are discoverable**

```bash
cd "$HOME/.claude/skills" && \
for s in map-codebase plan-feature execute-plan test-feature cleanup-crew; do
  f="$s/SKILL.md"
  if [ -f "$f" ] && head -1 "$f" | grep -qx -- '---' && grep -qx "name: $s" "$f"; then
    echo "OK   $s"
  else
    echo "FAIL $s"
  fi
done
```

Expected: five `OK` lines.

- [ ] **Step 2: Verify the global constraints hold across every new file**

```bash
cd "$HOME/.claude/skills" && \
echo "-- forbidden patterns (expect none) --" && \
grep -rniE 'claude-3-|post-commit|post-merge|claude -p|register.*settings\.json' \
  --include=SKILL.md map-codebase plan-feature execute-plan test-feature cleanup-crew \
  | grep -viE 'never|not implemented|deliberately|does not' || echo "none" && \
echo "-- token ceiling consistency --" && \
grep -rho '[0-9]\+k output tokens' --include=SKILL.md . | sort -u
```

Expected: `none` for forbidden patterns; the ceiling listing shows `350k output tokens` and nothing else.

- [ ] **Step 3: Run the full map.mjs suite one final time**

```bash
cd "$HOME/.claude/skills/map-codebase" && node --test test-map.mjs
```

Expected: PASS, 19 tests, 0 failures.

- [ ] **Step 4: Live smoke test on a real repo**

```bash
cd "C:/Users/Jason_Weiss/Projects/FuzionTrackFams" && \
node "$HOME/.claude/skills/map-codebase/map.mjs" verify; echo "verify exit: $?"
```

Expected: exit 0 with `"ok": true` and an empty `drift` array, because no maps exist yet. A non-zero exit here means `verifyMaps` mishandles the no-maps case — return to Task 4.

- [ ] **Step 5: Report to the user**

Summarise: the five skills installed and where, the four archived and how to restore them, the 350k ceiling and where it is enforced, and the one deliberate departure from the original brief (cleanup-crew stops on stash conflicts instead of auto-resolving). Recommend `/map-codebase` on one repo as the first real exercise.

---

## Self-Review

**Spec coverage.** §3 → Task 1. §4.2 → Tasks 2–5. §4.3–4.6 → Task 6. §5 → Task 7. §6 → Task 8. §7 → Task 9. §8 → Task 10. §9 frontmatter → each skill's Step 1, verified in Task 12 Step 1. §10 → Task 11. §11 non-goals → verified in Task 6 Step 3, Task 8 Step 3, and Task 12 Step 2. No gaps.

**Placeholder scan.** No "TBD", no "add appropriate error handling", no "similar to Task N". Every verification step carries a runnable command and an expected result. The `SKILL.md` tasks specify structure, exact frontmatter, verbatim-required strings and grep assertions rather than reproducing prose that already exists in the spec — the spec travels with the plan and is the authority for that prose.

**Type consistency.** `findRepoRoot`, `walk`, `PRUNE`, `detectStacks`, `findEntryPoints`, `findTestAndCi`, `citedPaths`, `verifyMaps`, `changedFiles` are each defined once in Tasks 2–5 and imported under the same names in the test file. The CLI verbs `scan` / `update` / `verify` are used identically in Tasks 5, 6, 10 and 12. The `STAT` line format appears once, in Task 8. The token ceiling is 350k everywhere and Task 8 Step 2 actively fails the build if `500k` reappears.

**Known limitation, accepted.** `citedPaths` recognises a path only when it is backticked, slash-containing, extension-bearing and glob-free. A map citing a bare directory or a glob will not be drift-checked. This keeps `--verify` free of false positives, which matters because `cleanup-crew` gates on its exit code. Task 6 Step 1 accordingly instructs the skill to cite exact file paths in backticks.
