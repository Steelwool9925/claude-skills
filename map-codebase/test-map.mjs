import { test } from './harness.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  findRepoRoot, walk, PRUNE,
  detectStacks, findEntryPoints, findTestAndCi,
  citedPaths, verifyMaps,
  changedFiles,
  findWorkspace, childRepos
} from './map.mjs'

function fixture (layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mapmjs-'))
  for (const [rel, body] of Object.entries(layout)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  return root
}

// ---------------------------------------------------------------- Task 2

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

// ---------------------------------------------------------------- Task 3

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

// ---------------------------------------------------------------- Task 4

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

// ---------------------------------------------------------------- Task 5

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

// ------------------------------------------------- Repo guard (regression)

test('CLI refuses to scan when there is no git repo above the target', () => {
  const cli = path.resolve('map.mjs')
  const root = fixture({ 'repoA/src/a.cs': '', 'repoB/src/b.dart': '' })
  let code = 0
  let out = ''
  try {
    out = execFileSync(process.execPath, [cli, 'scan', '--root', root], { stdio: 'pipe' }).toString()
  } catch (e) {
    code = e.status
    out = e.stdout.toString()
  }
  assert.equal(code, 3, 'must exit 3, not silently scan a container of unrelated repos')
  const json = JSON.parse(out)
  assert.match(json.error, /not a git repository/i)
  assert.equal(json.fileCount, undefined, 'must not report a file count for a non-repo')
})

test('CLI refuses update and verify outside a repo too', () => {
  const cli = path.resolve('map.mjs')
  const root = fixture({ 'repoA/src/a.cs': '' })
  for (const cmd of ['update', 'verify']) {
    let code = 0
    try {
      execFileSync(process.execPath, [cli, cmd, '--root', root], { stdio: 'pipe' })
    } catch (e) { code = e.status }
    assert.equal(code, 3, `${cmd} must exit 3 outside a repo`)
  }
})

// ------------------------------------------------- Phase 1: defect fixes

// These originally asserted that any Gradle file meant Android. That was wrong — Gradle is the
// standard JVM build tool, so a Spring Boot service was reported as an Android app. The
// AndroidManifest is what distinguishes them. Full matrix in test-stacks.mjs.
test('detectStacks treats gradle alone as a JVM build, not android', () => {
  assert.deepEqual(detectStacks(['app/build.gradle', 'settings.gradle']), ['jvm'])
  assert.deepEqual(detectStacks(['app/build.gradle.kts']), ['jvm'])
})

test('detectStacks identifies android from the manifest', () => {
  assert.deepEqual(detectStacks(['app/src/main/AndroidManifest.xml']), ['android'])
  assert.deepEqual(detectStacks(['build.gradle', 'app/src/main/AndroidManifest.xml']), ['android'])
})

test('detectStacks keeps jvm separate from node when both present', () => {
  assert.deepEqual(detectStacks(['build.gradle', 'web/package.json']), ['jvm', 'node'])
})

test('findEntryPoints reads package.json main when given a root', () => {
  const root = fixture({
    'package.json': JSON.stringify({ main: 'app.js' }),
    'app.js': '',
    'lib/helper.js': ''
  })
  const found = findEntryPoints(walk(root), root)
  assert.ok(found.includes('app.js'), `expected app.js, got ${JSON.stringify(found)}`)
  assert.ok(!found.includes('lib/helper.js'))
})

test('findEntryPoints resolves package.json main in a subdirectory', () => {
  const root = fixture({
    'services/api/package.json': JSON.stringify({ main: 'app.js' }),
    'services/api/app.js': ''
  })
  const found = findEntryPoints(walk(root), root)
  assert.ok(found.includes('services/api/app.js'), `got ${JSON.stringify(found)}`)
})

test('findEntryPoints still works without a root (back-compat)', () => {
  const found = findEntryPoints(['src/Api/Program.cs', 'src/Api/Helper.cs'])
  assert.deepEqual(found, ['src/Api/Program.cs'])
})

test('findEntryPoints treats app.js as an entry point by filename too', () => {
  assert.ok(findEntryPoints(['svc/app.js']).includes('svc/app.js'))
})

// ------------------------------------------------- Phase 1: workspace model

test('childRepos lists immediate subdirectories containing .git', () => {
  const root = fixture({
    'repoA/.git/HEAD': '', 'repoA/src/a.cs': '',
    'repoB/.git/HEAD': '', 'repoB/src/b.ts': '',
    'notARepo/readme.md': ''
  })
  assert.deepEqual(childRepos(root), ['repoA', 'repoB'])
})

test('findWorkspace detects a container holding two repos', () => {
  const root = fixture({
    'backend/.git/HEAD': '', 'backend/src/a.cs': '',
    'frontend/.git/HEAD': '', 'frontend/src/main.ts': ''
  })
  const ws = findWorkspace(root)
  assert.ok(ws, 'expected a workspace')
  assert.equal(fs.realpathSync(ws.root), fs.realpathSync(root))
  assert.deepEqual(ws.repos.map(r => r.name), ['backend', 'frontend'])
})

test('findWorkspace walks up from inside one of the repos', () => {
  const root = fixture({
    'backend/.git/HEAD': '', 'backend/src/deep/a.cs': '',
    'frontend/.git/HEAD': '', 'frontend/src/main.ts': ''
  })
  const ws = findWorkspace(path.join(root, 'backend', 'src', 'deep'))
  assert.ok(ws)
  assert.equal(ws.repos.length, 2)
})

test('findWorkspace returns null for a lone repo with no sibling repos', () => {
  const root = fixture({ 'solo/.git/HEAD': '', 'solo/src/a.cs': '', 'docs/notes.md': '' })
  assert.equal(findWorkspace(path.join(root, 'solo')), null)
})

test('findWorkspace honours exclude from .claude-workspace.json', () => {
  const root = fixture({
    'repoA/.git/HEAD': '', 'repoB/.git/HEAD': '', 'helper_scripts/.git/HEAD': '',
    '.claude-workspace.json': JSON.stringify({ name: 'Demo', exclude: ['helper_scripts'] })
  })
  const ws = findWorkspace(root)
  assert.equal(ws.name, 'Demo')
  assert.deepEqual(ws.repos.map(r => r.name), ['repoA', 'repoB'])
})

test('findWorkspace falls back to the directory name when no config exists', () => {
  const root = fixture({ 'a/.git/HEAD': '', 'b/.git/HEAD': '' })
  assert.equal(findWorkspace(root).name, path.basename(root))
})

test('findWorkspace attaches roles declared in config', () => {
  const root = fixture({
    'api/.git/HEAD': '', 'web/.git/HEAD': '',
    '.claude-workspace.json': JSON.stringify({ repos: { api: { role: 'backend' } } })
  })
  const ws = findWorkspace(root)
  assert.equal(ws.repos.find(r => r.name === 'api').role, 'backend')
  assert.equal(ws.repos.find(r => r.name === 'web').role, undefined)
})

test('a directory containing other workspaces is a collection, not a workspace', () => {
  const root = fixture({
    'productA/api/.git/HEAD': '', 'productA/web/.git/HEAD': '',
    'productB/svc1/.git/HEAD': '', 'productB/svc2/.git/HEAD': '',
    'looseRepo/.git/HEAD': '', 'sdkClone/.git/HEAD': ''
  })
  assert.equal(findWorkspace(root), null,
    'root holds two sub-workspaces plus loose repos — pairing the loose ones is wrong')
  const ws = findWorkspace(path.join(root, 'productA'))
  assert.ok(ws)
  assert.deepEqual(ws.repos.map(r => r.name), ['api', 'web'])
})

test('a loose repo beside sub-workspaces resolves to no workspace', () => {
  const root = fixture({
    'productA/api/.git/HEAD': '', 'productA/web/.git/HEAD': '',
    'looseRepo/.git/HEAD': '', 'sdkClone/.git/HEAD': ''
  })
  assert.equal(findWorkspace(path.join(root, 'looseRepo')), null)
})

test('an explicit config forces a workspace despite sub-containers', () => {
  const root = fixture({
    'productA/api/.git/HEAD': '', 'productA/web/.git/HEAD': '',
    'looseRepo/.git/HEAD': '', 'sdkClone/.git/HEAD': '',
    '.claude-workspace.json': JSON.stringify({ name: 'Everything' })
  })
  const ws = findWorkspace(root)
  assert.ok(ws, 'explicit config is an override')
  assert.equal(ws.name, 'Everything')
})
