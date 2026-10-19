// Smoke test: drives a real Chromium against a throwaway local fixture server. Needs
// `npm i` in browser-runner/ (installs playwright + chromium); skips cleanly if the browser is missing.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert'
import { test, run } from '../../map-codebase/harness.mjs'
import { createSession, serve } from './session.mjs'

const PAGE = `<!doctype html><title>Fixture</title>
<h1>Fixture</h1>
<input id="name" aria-label="Name"><button id="go" onclick="document.getElementById('out').textContent='Hello ' + document.getElementById('name').value">Go</button>
<p id="out"></p><a href="/second">Second page</a>
<script>console.error('fixture-error'); fetch('/missing.json')</script>`

const fixture = http.createServer((req, res) => {
  if (req.url === '/') res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE)
  else if (req.url === '/second') res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Second</title><h1>Second</h1>')
  else res.writeHead(404).end('nope')
})
await new Promise(r => fixture.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${fixture.address().port}`
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-runner-'))

let session
try {
  session = await createSession({ outDir })
} catch (e) {
  console.log(`SKIP browser-runner smoke test: ${String(e.message).split('\n')[0]}`)
  console.log('run `npm i` (or `npx playwright install chromium`) inside browser-runner/')
  fixture.close()
  process.exit(0)
}
const server = await serve(session)
const post = (cmd, args) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST' }, res => {
    let d = ''
    res.on('data', c => { d += c })
    res.on('end', () => resolve(JSON.parse(d)))
  })
  req.on('error', reject)
  req.end(JSON.stringify({ cmd, args }))
})

test('open, fill, click change the page; summaries stay small', async () => {
  const opened = await session.exec('open', { url: base })
  assert.strictEqual(opened.ok, true)
  assert.strictEqual(opened.title, 'Fixture')
  assert.strictEqual(opened.status, 200)
  await session.exec('fill', { selector: '#name', text: 'Kevin' })
  await session.exec('click', { selector: '#go' })
  const text = await session.exec('text', { selector: '#out' })
  assert.strictEqual(fs.readFileSync(text.file, 'utf8'), 'Hello Kevin')
  assert.ok(JSON.stringify(text).length < 400)
})

test('snapshot and screenshot write files and return paths only', async () => {
  const snap = await session.exec('snapshot', {})
  assert.ok(fs.readFileSync(snap.file, 'utf8').includes('Second page'))
  assert.ok(!('content' in snap))
  const shot = await session.exec('screenshot', {})
  assert.ok(fs.statSync(shot.file).size > 500)
})

test('console and network capture the fixture errors', async () => {
  const con = await session.exec('console', {})
  assert.ok(con.errors >= 1)
  assert.ok(fs.readFileSync(con.file, 'utf8').includes('fixture-error'))
  const net = await session.exec('network', {})
  assert.ok(fs.readFileSync(net.file, 'utf8').includes('missing.json'))
})

test('link click navigates; failures return a one-line error, not a throw', async () => {
  const nav = await session.exec('click', { selector: 'text=Second page' })
  assert.strictEqual(nav.title, 'Second')
  const bad = await session.exec('click', { selector: '#does-not-exist' })
  assert.strictEqual(bad.ok, false)
  assert.ok(!bad.error.includes('\n'))
  assert.strictEqual((await session.exec('nonsense')).ok, false)
})

test('HTTP server runs commands and stop closes the session', async () => {
  const st = await post('status', {})
  assert.strictEqual(st.ok, true)
  assert.strictEqual(st.title, 'Second')
  const stopped = await post('stop', {})
  assert.strictEqual(stopped.stopped, true)
})

const code = await run()
fixture.close()
fs.rmSync(outDir, { recursive: true, force: true })
process.exit(code)
