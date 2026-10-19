#!/usr/bin/env node
// browser-runner CLI. `start` launches a detached browser session; every other command talks to it
// over loopback and prints a few `key: value` lines. Bulky output (snapshots, screenshots, console,
// network, page text) goes to numbered files under the out dir; only the path is printed.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SELF = fileURLToPath(import.meta.url)
const DEFAULT_OUT = path.join(process.cwd(), '.claude', 'browser')

const USAGE = `usage: node runner.mjs [--out dir] <command> [args]
  start [--headed] [--port n]     launch the browser session (detached)
  open <url>                      navigate
  click <selector>                click first match
  fill <selector> <text...>       type into a field
  press <key>                     keyboard key, e.g. Enter, Tab
  select <selector> <value>       choose a <select> option
  wait [selector|ms]              wait for an element or a delay
  snapshot [selector]             accessibility snapshot -> .yml file
  screenshot [--full]             PNG -> file
  text [selector]                 visible text -> .txt file
  console                         console + page errors -> .json file
  network                         failed / 4xx / 5xx requests -> .json file
  viewport <w> <h>                resize
  back | reload | status          navigation / session summary
  stop                            close the browser and the session
selectors are Playwright selectors: css, text=Save, role=button[name="Save"], ...`

function parseArgv (argv) {
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out' || a === '--port') flags[a.slice(2)] = argv[++i]
    else if (a === '--headed' || a === '--full' || a === '--serve') flags[a.slice(2)] = true
    else rest.push(a)
  }
  return { flags, rest }
}

function toRequest (cmd, a) {
  switch (cmd) {
    case 'open': return { url: a[0] }
    case 'click': return { selector: a[0] }
    case 'fill': return { selector: a[0], text: a.slice(1).join(' ') }
    case 'press': return { key: a[0] }
    case 'select': return { selector: a[0], value: a[1] }
    case 'wait': return /^\d+$/.test(a[0] || '') ? { ms: a[0] } : { selector: a[0] }
    case 'snapshot': case 'text': return { selector: a[0] }
    case 'viewport': return { width: a[0], height: a[1] }
    default: return {}
  }
}

function post (port, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST' }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

function print (out) {
  if (!out.ok) { console.log(`ERROR: ${out.error}`); process.exitCode = 1; return }
  for (const [k, v] of Object.entries(out)) if (k !== 'ok') console.log(`${k}: ${v}`)
}

async function runServe (outDir, flags) {
  const { createSession, serve } = await import('./lib/session.mjs')
  const session = await createSession({ outDir, headed: !!flags.headed })
  const server = await serve(session, { port: Number(flags.port) || 0, onStop: () => process.exit(0) })
  fs.writeFileSync(path.join(outDir, 'session.json'), JSON.stringify({ port: server.address().port, pid: process.pid }))
}

async function runStart (outDir, flags) {
  fs.mkdirSync(outDir, { recursive: true })
  const sessionFile = path.join(outDir, 'session.json')
  fs.rmSync(sessionFile, { force: true })
  const args = [SELF, '--serve', '--out', outDir]
  if (flags.headed) args.push('--headed')
  if (flags.port) args.push('--port', String(flags.port))
  const log = fs.openSync(path.join(outDir, 'runner.log'), 'w')
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', log, log], windowsHide: true })
  child.unref()
  for (let i = 0; i < 100; i++) {
    if (fs.existsSync(sessionFile)) {
      const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
      console.log(`started: port ${s.port}, pid ${s.pid}`)
      console.log(`out: ${outDir}`)
      return
    }
    await new Promise(r => setTimeout(r, 300))
  }
  console.log(`ERROR: session did not start in 30s; see ${path.join(outDir, 'runner.log')}`)
  process.exitCode = 1
}

async function main () {
  const { flags, rest } = parseArgv(process.argv.slice(2))
  const outDir = path.resolve(flags.out || DEFAULT_OUT)
  if (flags.serve) return runServe(outDir, flags)
  const [cmd, ...args] = rest
  if (!cmd || cmd === 'help') { console.log(USAGE); return }
  if (cmd === 'start') return runStart(outDir, flags)

  const sessionFile = path.join(outDir, 'session.json')
  if (!fs.existsSync(sessionFile)) {
    console.log(`ERROR: no session in ${outDir}; run "start" first`)
    process.exitCode = 1
    return
  }
  const { port } = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
  const body = { cmd, args: { ...toRequest(cmd, args), fullPage: !!flags.full } }
  try {
    const out = await post(port, body)
    if (cmd === 'stop') fs.rmSync(sessionFile, { force: true })
    print(out)
  } catch (e) {
    console.log(`ERROR: cannot reach session on port ${port} (${e.code || e.message}); run "start" again`)
    process.exitCode = 1
  }
}

main().catch(e => { console.log(`ERROR: ${e && e.message || e}`); process.exitCode = 1 })
