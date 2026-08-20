#!/usr/bin/env node
// map.mjs — deterministic repository scanning for the map-codebase skill.
// Does every part of mapping that can be answered without a model, at zero token cost.
// No dependencies: node: builtins only.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const PRUNE = new Set([
  'node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.vs', 'packages', 'coverage'
])

/** Absolute path of the nearest ancestor containing .git, or null. */
export function findRepoRoot (startDir) {
  let dir = path.resolve(startDir)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Repo-relative, POSIX-separated paths of every file under root, minus the prune list. */
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

const base = f => path.posix.basename(f)

const STACK_MARKERS = [
  ['dotnet', f => f.endsWith('.csproj') || f.endsWith('.sln') || f.endsWith('.fsproj')],
  ['flutter', f => base(f) === 'pubspec.yaml'],
  ['node', f => base(f) === 'package.json'],
  ['python', f => ['pyproject.toml', 'pytest.ini', 'requirements.txt', 'setup.py',
                   'setup.cfg', 'Pipfile'].includes(base(f))],
  ['go', f => base(f) === 'go.mod'],
  ['rust', f => base(f) === 'Cargo.toml'],
  ['ruby', f => ['Gemfile', 'Rakefile'].includes(base(f)) || f.endsWith('.gemspec')],
  ['php', f => base(f) === 'composer.json'],
  ['cpp', f => ['CMakeLists.txt', 'meson.build'].includes(base(f)) || f.endsWith('.vcxproj')],
  ['swift', f => base(f) === 'Package.swift' || f.includes('.xcodeproj/')],
  ['elixir', f => base(f) === 'mix.exs'],
  // Android and JVM share Gradle. The manifest is what makes it Android; resolved below.
  ['android', f => base(f) === 'AndroidManifest.xml'],
  ['jvm', f => ['pom.xml', 'build.sbt', 'build.gradle', 'build.gradle.kts',
                'settings.gradle', 'settings.gradle.kts'].includes(base(f))]
]

export const UNKNOWN_STACK_HINT =
  'Unrecognised stack: no known build manifest was found. Say so in the map rather than ' +
  'guessing — name the file extensions actually present, and ask the user for the build and ' +
  'test commands instead of inferring them.'

const ENTRY_NAMES = new Set([
  'Program.cs', 'Startup.cs', 'main.dart', 'main.rs', 'manage.py', 'wsgi.py', 'asgi.py',
  'config.ru', 'artisan', 'main.swift', 'main.cpp', 'main.go'
])
const ENTRY_STEMS = new Set(['index', 'server', 'main', 'app'])
const ENTRY_EXTS = new Set(['.ts', '.js', '.mjs', '.py', '.go', '.php', '.rb', '.rs'])
// Frameworks that name their entry class rather than their file.
const ENTRY_PATTERNS = [/Application\.(java|kt|scala)$/, /(^|\/)Main\.(java|kt|scala)$/]

/** Sorted unique stack names present in the file list. */
export function detectStacks (files) {
  const hit = new Set()
  for (const f of files) {
    for (const [name, match] of STACK_MARKERS) if (match(f)) hit.add(name)
  }
  // Gradle is used by both Android and plain JVM projects. An AndroidManifest.xml is what
  // distinguishes them; without it, a Gradle build is a JVM build. Reporting a Spring Boot
  // service as "android" is worse than reporting nothing.
  if (hit.has('android')) hit.delete('jvm')
  // Flutter projects carry a pubspec and often a package.json for tooling; the pubspec wins.
  if (hit.has('flutter')) hit.delete('dart')
  return [...hit].sort()
}

/**
 * Files that look like application entry points.
 * When `root` is supplied, package.json's declared `main` (and `scripts.start` target) wins over
 * filename guessing — Node services routinely name their entry `app.js`, which no heuristic
 * would rank above any other file.
 */
export function findEntryPoints (files, root) {
  const out = new Set()

  if (root) {
    for (const f of files) {
      if (path.posix.basename(f) !== 'package.json') continue
      let pkg
      try { pkg = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) } catch { continue }
      const dir = path.posix.dirname(f)
      const declared = [pkg.main, extractStartTarget(pkg.scripts?.start)]
      for (const d of declared) {
        if (!d) continue
        const rel = (dir === '.' ? d : `${dir}/${d}`).replace(/^\.\//, '')
        if (files.includes(rel)) out.add(rel)
      }
    }
  }

  for (const f of files) {
    const name = path.posix.basename(f)
    if (ENTRY_NAMES.has(name)) { out.add(f); continue }
    if (ENTRY_PATTERNS.some(re => re.test(f))) { out.add(f); continue }
    const ext = path.posix.extname(name)
    if (ENTRY_EXTS.has(ext) && ENTRY_STEMS.has(name.slice(0, -ext.length))) out.add(f)
  }

  return [...out].sort()
}

/** Pull a script path out of an npm start command, e.g. "node app.js --port 3000" -> "app.js". */
function extractStartTarget (start) {
  if (typeof start !== 'string') return null
  const m = start.match(/(?:^|\s)([\w./-]+\.(?:js|mjs|cjs|ts))(?:\s|$)/)
  return m ? m[1] : null
}

// Docs a repo writes about itself. The first group is addressed to coding agents and is
// authoritative where it disagrees with anything inferred from file structure.
const AGENT_DOCS = ['claude.md', 'agents.md', 'gemini.md', 'onboarding.md']
const HUMAN_DOCS = ['readme.md', 'architecture.md', 'contributing.md', 'development.md', 'setup.md']
const MAX_DOC_DEPTH = 3

/**
 * Project documentation, agent-directed files first.
 *
 * A repo that documents itself is the authority on its own architecture — reading these before
 * inferring anything from directory names avoids confidently-wrong maps.
 */
export function findProjectDocs (files) {
  const rank = f => {
    const base = path.posix.basename(f).toLowerCase()
    const depth = f.split('/').length
    if (depth > MAX_DOC_DEPTH) return null
    if (AGENT_DOCS.includes(base)) return 0
    if (HUMAN_DOCS.includes(base)) return 1
    if (/^docs?\//i.test(f) && base.endsWith('.md')) return 2
    return null
  }
  return files
    .map(f => ({ f, r: rank(f) }))
    .filter(x => x.r !== null)
    .sort((a, b) => a.r - b.r || a.f.split('/').length - b.f.split('/').length ||
                    a.f.localeCompare(b.f))
    .map(x => x.f)
}

/** Split the file list into test files and CI/pipeline definitions. */
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

/**
 * Repo-relative paths cited in backticks in a map file.
 * A token counts only if it contains a slash, has a file extension, and is glob-free —
 * which excludes prose, globs, and bare command names, keeping --verify free of false
 * positives. cleanup-crew gates on this exit code, so precision beats recall here.
 */
export function citedPaths (mapText) {
  const out = new Set()
  for (const m of mapText.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim()
    if (!t.includes('/')) continue
    // Globs and placeholders describe a shape, not a file: `src/**/*.cs`, `services/<area>.ts`,
    // `api/{id}/thing.ts`. None of them can be resolved, so none of them are citations.
    if (/[*<>{}]/.test(t) || t.includes(' ')) continue
    // Parent-relative paths cannot be resolved against a repo root — a map that needs to point
    // outside its own repo should name the other repo explicitly instead.
    if (t.startsWith('../') || t.includes('/../')) continue
    if (!/\.[A-Za-z0-9]+$/.test(t)) continue
    out.add(t.replace(/^\.\//, ''))
  }
  return [...out].sort()
}

/** Resolve every path cited by every map; any that no longer exists is drift. */
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

/**
 * Files changed vs HEAD: unstaged, staged, and untracked-but-not-ignored.
 * Returns [] when git is unavailable or the directory is not a repo.
 */
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
  const wantWorkspace = argv.includes('--workspace')

  // ---- workspace-scoped commands, which operate on a container rather than one repo ----

  if (cmd === 'workspace' || cmd === 'edges' || (cmd === 'verify' && wantWorkspace)) {
    const ws = findWorkspace(start)
    if (!ws) {
      process.stdout.write(JSON.stringify({
        error: 'not a workspace',
        start: path.resolve(start),
        hint: 'A workspace is a directory holding 2+ git repos. A single repo, or a folder of ' +
              'unrelated products, is not one. Add .claude-workspace.json to declare it explicitly.'
      }, null, 2) + '\n')
      return 4
    }

    if (cmd === 'workspace') {
      process.stdout.write(JSON.stringify({
        root: ws.root,
        name: ws.name,
        configured: Boolean(ws.config),
        repos: ws.repos.map(r => {
          const files = walk(r.path)
          const { tests, ci } = findTestAndCi(files)
          return {
            name: r.name,
            role: r.role,
            fileCount: files.length,
            stacks: detectStacks(files),
            projectDocs: findProjectDocs(files),
            entryPoints: findEntryPoints(files, r.path).slice(0, 5),
            hasTests: tests.length > 0,
            hasCi: ci.length > 0
          }
        })
      }, null, 2) + '\n')
      return 0
    }

    if (cmd === 'edges') {
      const { edges, internal } = discoverEdges(ws.repos)
      process.stdout.write(JSON.stringify({
        root: ws.root, name: ws.name, edgeCount: edges.length, edges, internalCount: internal.length
      }, null, 2) + '\n')
      return 0
    }

    // verify --workspace: every repo, plus the container's own workspace map.
    const results = ws.repos.map(r => ({ repo: r.name, ...verifyMaps(r.path) }))
    const wsLevel = verifyMaps(ws.root)
    const drifted = results.filter(r => !r.ok)
    const ok = drifted.length === 0 && wsLevel.ok
    process.stdout.write(JSON.stringify({
      root: ws.root, ok, workspaceMap: wsLevel, repos: results
    }, null, 2) + '\n')
    return ok ? 0 : 1
  }

  // ---- repo-scoped commands ----

  // Refuse outside a repo rather than falling back to the start directory. A container of
  // unrelated repos (e.g. ~/Projects) would otherwise scan tens of thousands of files and
  // report several stacks as if they were one system.
  const root = findRepoRoot(start)
  if (root === null && cmd !== undefined && ['scan', 'update', 'verify'].includes(cmd)) {
    process.stdout.write(JSON.stringify({
      error: 'not a git repository',
      start: path.resolve(start),
      hint: 'Run from inside a repo. A folder holding several repos is not itself a repo.'
    }, null, 2) + '\n')
    return 3
  }

  if (cmd === 'scan') {
    const files = walk(root)
    const { tests, ci } = findTestAndCi(files)
    process.stdout.write(JSON.stringify({
      root, fileCount: files.length, stacks: detectStacks(files),
      // Listed before everything else: read these before inferring anything.
      projectDocs: findProjectDocs(files),
      entryPoints: findEntryPoints(files, root), tests, ci
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
  process.stderr.write(
    'usage: map.mjs <scan|update|verify|workspace|edges> [--root <dir>] [--workspace]\n' +
    '  scan|update|verify   operate on one repo\n' +
    '  workspace            repo inventory for a container of 2+ repos\n' +
    '  edges                cross-repo integration candidates\n' +
    '  verify --workspace   drift across every repo in the workspace\n')
  return 2
}

// (CLI entry point lives at the very end of this file — everything it references must be
// initialised first, or const declarations below would be in the temporal dead zone.)

// ------------------------------------------------------------------ workspace

export const WORKSPACE_CONFIG = '.claude-workspace.json'

/** Names of immediate subdirectories that are git repos, sorted. */
export function childRepos (dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  return entries
    .filter(e => e.isDirectory() && !PRUNE.has(e.name))
    .filter(e => fs.existsSync(path.join(dir, e.name, '.git')))
    .map(e => e.name)
    .sort()
}

function readWorkspaceConfig (dir) {
  const p = path.join(dir, WORKSPACE_CONFIG)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

/**
 * True when dir holds at least one subdirectory that is itself a container of 2+ repos.
 * Such a directory is a *collection* of workspaces, not a workspace: e.g. a Projects folder
 * holding several products plus a couple of loose clones. Pairing those loose clones as one
 * system would be wrong.
 */
function holdsSubWorkspaces (dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return false }
  return entries.some(e =>
    e.isDirectory() && !PRUNE.has(e.name) &&
    !fs.existsSync(path.join(dir, e.name, '.git')) &&
    childRepos(path.join(dir, e.name)).length >= 2)
}

function buildWorkspace (dir) {
  const config = readWorkspaceConfig(dir)
  const exclude = new Set(config?.exclude ?? [])
  const names = childRepos(dir).filter(n => !exclude.has(n))
  if (names.length < 2) return null
  // An explicit config is an override: the user has declared this set deliberately.
  if (!config && holdsSubWorkspaces(dir)) return null
  return {
    root: path.resolve(dir),
    name: config?.name ?? path.basename(path.resolve(dir)),
    config,
    repos: names.map(name => ({
      name,
      path: path.join(dir, name),
      role: config?.repos?.[name]?.role
    }))
  }
}

/**
 * The workspace containing startDir, or null.
 * A workspace is a directory holding 2+ git repos. A lone repo with no sibling repos is not a
 * workspace — single-repo behaviour is unchanged, which is the whole point.
 */
export function findWorkspace (startDir) {
  const dir = path.resolve(startDir)

  // 1. startDir is itself the container.
  const here = buildWorkspace(dir)
  if (here) return here

  // 2. startDir is inside a repo — the container can only be that repo's parent.
  //
  // Deliberately bounded to exactly one level. An unbounded walk keeps climbing until it finds
  // any directory with 2+ repos, which will eventually be a home or temp directory full of
  // unrelated checkouts. That is not a workspace, and treating it as one would map unrelated
  // systems together.
  const repo = findRepoRoot(dir)
  if (repo) {
    const parent = path.dirname(repo)
    if (parent !== repo) return buildWorkspace(parent)
  }

  return null
}

// -------------------------------------------------------------- edge discovery

const SOURCE_EXTS = new Set([
  '.cs', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.java', '.kt', '.dart', '.py', '.go'
])
const MAX_SOURCE_BYTES = 512 * 1024

// Each matcher yields the identifier two repos would have in common. Values are never captured
// from configuration files — the global ignore list bars reading them — so an HTTP target is
// recorded as its config KEY and the value stays unread.
const EDGE_MATCHERS = [
  { kind: 'queue', re: /\b(?:Queue|Topic|Subscription)Name\b\s*[:=]\s*["'`]([\w.\-/]+)["'`]/g },
  { kind: 'queue', re: /\b(?:CreateQueue|GetQueue|SendMessage|ReceiveMessage)\w*\s*\(\s*["'`]([\w.\-/]+)["'`]/g },
  { kind: 'socket', re: /\b(?:socket|io|hub|connection)\s*\.\s*(?:on|emit|to|invoke|send)\s*\(\s*["'`]([\w.\-]+)["'`]/gi },
  { kind: 'httpConfigKey', re: /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:URL|URI|ENDPOINT|BASEURL|HOST))\b/g },
  // Server-side route declarations and client-side call paths reduce to the same segments,
  // so a route declared in one repo and called from another matches on the segment name.
  // This is the commonest cross-repo coupling of all (frontend to backend) and was invisible
  // until it was added.
  { kind: 'httpRoute', re: /\[(?:Http(?:Get|Post|Put|Delete|Patch)|Route)\("([^"]+)"\)\]/g, segments: true },
  // Anywhere in a string, not anchored to its start: client code routinely interpolates a base
  // URL first, e.g. `${environment.api}/api/v1/Thing/Action`.
  { kind: 'httpRoute', re: /(\/(?:api|API)\/[\w{}$.\-/]{2,120})/g, segments: true },
  { kind: 'httpRoute', re: /["'`](\/?[A-Za-z][\w-]{3,}(?:\/[\w{}$-]+){1,6})["'`]/g, segments: true }
]

// Path pieces that carry no contract meaning — matching on these would pair every repo with
// every other repo that happens to serve HTTP.
const GENERIC_SEGMENTS = new Set([
  'api', 'v1', 'v2', 'v3', 'v1.0', 'v2.0', 'get', 'post', 'put', 'delete', 'patch', 'id',
  'index', 'list', 'all', 'new', 'edit', 'create', 'update', 'remove', 'http', 'https',
  'localhost', 'assets', 'static', 'public', 'src', 'app', 'com', 'net', 'org', 'www',
  // MIME types split on '/' exactly like routes do, so "application/json" and
  // "application/x-www-form-urlencoded" would otherwise pair every repo that sets a header.
  'application', 'json', 'text', 'xml', 'html', 'plain', 'octet-stream', 'form-data',
  'x-www-form-urlencoded', 'multipart', 'image', 'audio', 'video', 'pdf', 'csv', 'zip'
])

/** Split a route or path into the segments that could be a shared contract name. */
function routeSegments (raw) {
  return raw.split('/')
    .map(s => s.trim())
    .filter(s => s.length >= 4)
    .filter(s => !s.includes('{') && !s.includes('}') && !s.includes(':') && !s.includes('$'))
    .filter(s => !GENERIC_SEGMENTS.has(s.toLowerCase()))
    .filter(s => /^[A-Za-z][\w-]*$/.test(s))
}

/**
 * Cross-repo integration candidates, found deterministically over pruned source only.
 *
 * Returns { edges, internal }: `edges` are identifiers seen in 2+ repos (a real cross-repo
 * coupling); `internal` are seen in exactly one. These are CANDIDATES for a model to confirm
 * and describe — the script asserts only that the same string appears in both places.
 */
export function discoverEdges (repos) {
  const seen = new Map()

  for (const repo of repos) {
    if (!fs.existsSync(repo.path)) continue
    // walk() applies PRUNE, so node_modules / bin / obj / dist never reach the matchers.
    for (const rel of walk(repo.path)) {
      if (!SOURCE_EXTS.has(path.posix.extname(rel))) continue
      const abs = path.join(repo.path, rel)
      let text
      try {
        if (fs.statSync(abs).size > MAX_SOURCE_BYTES) continue
        text = fs.readFileSync(abs, 'utf8')
      } catch { continue }

      for (const { kind, re, segments } of EDGE_MATCHERS) {
        for (const m of text.matchAll(re)) {
          if (!m[1]) continue
          const names = segments ? routeSegments(m[1]) : [m[1]]
          for (const name of names) {
            if (name.length < 3) continue
            const key = `${kind} ${name}`
            if (!seen.has(key)) seen.set(key, { kind, name, repos: new Set(), sites: [] })
            const entry = seen.get(key)
            entry.repos.add(repo.name)
            if (entry.sites.length < 20) {
              entry.sites.push({
                repo: repo.name,
                file: rel,
                line: text.slice(0, m.index).split('\n').length
              })
            }
          }
        }
      }
    }
  }

  const all = [...seen.values()]
    .map(e => ({ kind: e.kind, name: e.name, repos: [...e.repos].sort(), sites: e.sites }))
    .sort((a, b) => b.repos.length - a.repos.length || a.name.localeCompare(b.name))

  return {
    edges: all.filter(e => e.repos.length >= 2),
    internal: all.filter(e => e.repos.length === 1)
  }
}

// Run the CLI only when executed directly, not when imported by the test suite.
// MUST remain the last statement in this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(cli(process.argv.slice(2)))
}
