import { test } from './harness.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { discoverEdges, citedPaths, findProjectDocs, walk } from './map.mjs'

test('findProjectDocs finds agent-directed docs first', () => {
  const root = fixture({
    'README.md': '', 'CLAUDE.md': '', 'claude/ONBOARDING.md': '', 'backend/CLAUDE.md': ''
  })
  const docs = findProjectDocs(walk(root))
  assert.deepEqual(docs.slice(0, 3), ['CLAUDE.md', 'backend/CLAUDE.md', 'claude/ONBOARDING.md'],
    'agent-directed docs must rank above README')
  assert.ok(docs.includes('README.md'))
})

test('findProjectDocs recognises the common doc names', () => {
  const root = fixture({
    'AGENTS.md': '', 'ARCHITECTURE.md': '', 'CONTRIBUTING.md': '', 'docs/setup.md': ''
  })
  const docs = findProjectDocs(walk(root))
  for (const d of ['AGENTS.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md', 'docs/setup.md']) {
    assert.ok(docs.includes(d), `expected ${d}, got ${JSON.stringify(docs)}`)
  }
})

test('findProjectDocs ignores incidental markdown deep in the tree', () => {
  const root = fixture({
    'CLAUDE.md': '',
    'src/components/widget/notes.md': '',
    'a/b/c/d/README.md': ''
  })
  const docs = findProjectDocs(walk(root))
  assert.deepEqual(docs, ['CLAUDE.md'])
})

test('findProjectDocs returns an empty list when a repo documents nothing', () => {
  const root = fixture({ 'src/a.cs': '' })
  assert.deepEqual(findProjectDocs(walk(root)), [])
})

test('citedPaths ignores angle-bracket placeholders', () => {
  const md = 'Client files are `services/<area>.service.ts` and `fn/<area>/api-<op>-get.ts`, ' +
             'the real one is `src/app/app.module.ts`.'
  assert.deepEqual(citedPaths(md), ['src/app/app.module.ts'])
})

test('citedPaths ignores parent-relative paths', () => {
  const md = 'See `../../../.claude/maps/WORKSPACE_MAP.md` and `src/main.ts`.'
  assert.deepEqual(citedPaths(md), ['src/main.ts'])
})

function fixture (layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mapedges-'))
  for (const [rel, body] of Object.entries(layout)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  return root
}

const repos = (root, ...names) => names.map(name => ({ name, path: path.join(root, name) }))

test('discoverEdges pairs a queue name produced in one repo and consumed in another', () => {
  const root = fixture({
    'producer/.git/HEAD': '',
    'producer/src/Publisher.cs': 'var QueueName = "asset-import-completed";',
    'consumer/.git/HEAD': '',
    'consumer/src/worker.js': 'const QueueName = "asset-import-completed";'
  })
  const { edges } = discoverEdges(repos(root, 'producer', 'consumer'))
  const e = edges.find(x => x.name === 'asset-import-completed')
  assert.ok(e, `expected a shared queue edge, got ${JSON.stringify(edges)}`)
  assert.deepEqual(e.repos.slice().sort(), ['consumer', 'producer'])
  assert.equal(e.kind, 'queue')
})

test('discoverEdges pairs a socket event emitted in one repo and handled in another', () => {
  const root = fixture({
    'web/.git/HEAD': '', 'web/src/client.ts': "socket.emit('vehicle-position');",
    'sockets/.git/HEAD': '', 'sockets/app.js': "io.on('vehicle-position', handler);"
  })
  const { edges } = discoverEdges(repos(root, 'web', 'sockets'))
  const e = edges.find(x => x.name === 'vehicle-position')
  assert.ok(e, `expected a socket edge, got ${JSON.stringify(edges)}`)
  assert.equal(e.kind, 'socket')
})

test('discoverEdges ignores dependency directories - the Karma regression', () => {
  const root = fixture({
    'a/.git/HEAD': '',
    'a/node_modules/karma/client.js': "socket.emit('karma_error'); socket.emit('all-test-results');",
    'a/src/real.js': "socket.emit('genuine-event');",
    'b/.git/HEAD': '',
    'b/node_modules/karma/server.js': "socket.on('karma_error');",
    'b/src/real.js': "socket.on('genuine-event');"
  })
  const { edges } = discoverEdges(repos(root, 'a', 'b'))
  const names = edges.map(e => e.name)
  assert.ok(!names.includes('karma_error'), 'vendored content must not appear')
  assert.ok(!names.includes('all-test-results'), 'vendored content must not appear')
  assert.ok(names.includes('genuine-event'), 'real source must still be found')
})

test('discoverEdges separates single-repo names from cross-repo edges', () => {
  const root = fixture({
    'a/.git/HEAD': '', 'a/src/x.js': "socket.emit('only-here');",
    'b/.git/HEAD': '', 'b/src/y.js': "socket.emit('shared');",
    'c/.git/HEAD': '', 'c/src/z.js': "socket.on('shared');"
  })
  const { edges, internal } = discoverEdges(repos(root, 'a', 'b', 'c'))
  assert.ok(edges.some(e => e.name === 'shared'))
  assert.ok(!edges.some(e => e.name === 'only-here'), 'single-repo name is not a cross-repo edge')
  assert.ok(internal.some(e => e.name === 'only-here'))
})

test('discoverEdges records http config keys without reading their values', () => {
  const root = fixture({
    'a/.git/HEAD': '', 'a/src/client.js': 'const base = config.REPORTING_SERVICE_URL;',
    'b/.git/HEAD': '', 'b/src/server.js': 'const base = config.REPORTING_SERVICE_URL;'
  })
  const { edges } = discoverEdges(repos(root, 'a', 'b'))
  const e = edges.find(x => x.name === 'REPORTING_SERVICE_URL')
  assert.ok(e, `expected a config-key edge, got ${JSON.stringify(edges.map(x => x.name))}`)
  assert.equal(e.kind, 'httpConfigKey')
})

test('discoverEdges records where each edge was seen', () => {
  const root = fixture({
    'a/.git/HEAD': '', 'a/src/x.js': "socket.emit('ping-me');",
    'b/.git/HEAD': '', 'b/src/y.js': "socket.on('ping-me');"
  })
  const { edges } = discoverEdges(repos(root, 'a', 'b'))
  const e = edges.find(x => x.name === 'ping-me')
  assert.equal(e.sites.length, 2)
  assert.ok(e.sites.every(s => s.file && typeof s.line === 'number'))
  assert.ok(e.sites.some(s => s.repo === 'a' && s.file === 'src/x.js'))
})

test('discoverEdges pairs a .NET route attribute with its frontend caller', () => {
  const root = fixture({
    'api/.git/HEAD': '',
    'api/Controllers/DeviceController.cs':
      '[Route("api/v1/DeviceManagement")]\npublic class C {\n[HttpGet("GetAllDevices")]\npublic X Get() {}\n}',
    'web/.git/HEAD': '',
    'web/src/app/device.service.ts':
      "return this.http.get(`${environment.api}/api/v1/DeviceManagement/GetAllDevices`);"
  })
  const { edges } = discoverEdges(repos(root, 'api', 'web'))
  const e = edges.find(x => x.name === 'GetAllDevices')
  assert.ok(e, `expected a route edge, got ${JSON.stringify(edges.map(x => x.name))}`)
  assert.equal(e.kind, 'httpRoute')
  assert.deepEqual(e.repos.slice().sort(), ['api', 'web'])
})

test('discoverEdges does not treat generic path segments as edges', () => {
  const root = fixture({
    'api/.git/HEAD': '', 'api/C.cs': '[Route("api/v1/Thing")]',
    'web/.git/HEAD': '', 'web/s.ts': "http.get('/api/v1/Other');"
  })
  const { edges } = discoverEdges(repos(root, 'api', 'web'))
  const names = edges.map(e => e.name)
  for (const generic of ['api', 'v1']) {
    assert.ok(!names.includes(generic), `"${generic}" is boilerplate, not a contract`)
  }
})

test('discoverEdges ignores route-like segments that are path parameters', () => {
  const root = fixture({
    'api/.git/HEAD': '', 'api/C.cs': '[HttpGet("GetThing/{identifier}")]',
    'web/.git/HEAD': '', 'web/s.ts': "http.get('/GetThing/{identifier}');"
  })
  const { edges } = discoverEdges(repos(root, 'api', 'web'))
  assert.ok(!edges.some(e => e.name.includes('{')), 'placeholders are not contract names')
  assert.ok(edges.some(e => e.name === 'GetThing'))
})

// Every workspace verb is exercised as a real subprocess. The unit tests import the module,
// which evaluates all declarations; running the CLI does not. That difference hid a temporal
// dead zone that broke every workspace command while the suite stayed green.
test('CLI workspace verbs run end to end as a subprocess', () => {
  const cli = path.resolve('map.mjs')
  const root = fixture({
    'api/.git/HEAD': '', 'api/C.cs': '[HttpGet("GetThings")]', 'api/api.csproj': '',
    'web/.git/HEAD': '', 'web/s.ts': "http.get('/api/v1/GetThings');", 'web/package.json': '{}'
  })
  const run = (...args) => JSON.parse(
    execFileSync(process.execPath, [cli, ...args, '--root', root], { stdio: 'pipe' }).toString())

  const ws = run('workspace')
  assert.equal(ws.repos.length, 2)
  assert.ok(ws.repos.every(r => typeof r.fileCount === 'number'))

  const ed = run('edges')
  assert.ok(ed.edges.some(e => e.name === 'GetThings'), 'edges verb must find the shared route')

  const vf = run('verify', '--workspace')
  assert.equal(vf.ok, true)
})

test('CLI workspace verbs exit 4 outside a workspace', () => {
  const cli = path.resolve('map.mjs')
  const root = fixture({ 'solo/.git/HEAD': '', 'solo/a.cs': '' })
  for (const cmd of ['workspace', 'edges']) {
    let code = 0
    try {
      execFileSync(process.execPath, [cli, cmd, '--root', path.join(root, 'solo')], { stdio: 'pipe' })
    } catch (e) { code = e.status }
    assert.equal(code, 4, `${cmd} must exit 4 when there is no workspace`)
  }
})

test('discoverEdges does not treat MIME types as routes', () => {
  const root = fixture({
    'api/.git/HEAD': '',
    'api/C.cs': 'Response.ContentType = "application/json";\n[HttpGet("GetThing")]',
    'web/.git/HEAD': '',
    'web/s.ts': "headers={'Content-Type':'application/x-www-form-urlencoded'};\nhttp.get('/api/v1/GetThing');"
  })
  const { edges } = discoverEdges(repos(root, 'api', 'web'))
  const names = edges.map(e => e.name)
  for (const mime of ['application', 'json', 'text', 'x-www-form-urlencoded', 'octet-stream']) {
    assert.ok(!names.includes(mime), `"${mime}" is a MIME fragment, not a route`)
  }
  assert.ok(names.includes('GetThing'), 'real routes must survive the filter')
})

test('discoverEdges tolerates a missing repo directory', () => {
  const root = fixture({ 'a/.git/HEAD': '', 'a/src/x.js': "socket.emit('e');" })
  const r = discoverEdges([
    { name: 'a', path: path.join(root, 'a') },
    { name: 'ghost', path: path.join(root, 'does-not-exist') }
  ])
  assert.ok(Array.isArray(r.edges))
})
