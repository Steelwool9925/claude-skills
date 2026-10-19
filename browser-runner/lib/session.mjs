// Browser session: one Playwright browser/page held open by a loopback HTTP server so each CLI
// call (open, click, fill, ...) acts on the same page. Every command writes its bulky output to a
// file under `outDir` and returns a short summary object, never the content itself.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const CONSOLE_LIMIT = 2000
const NETWORK_LIMIT = 2000

export async function createSession ({ outDir, headed = false, viewport = { width: 1280, height: 800 } }) {
  const { chromium } = await import('playwright')
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const consoleLog = []
  const networkLog = []
  let seq = 0

  const push = (arr, limit, entry) => { arr.push(entry); if (arr.length > limit) arr.shift() }
  page.on('console', m => push(consoleLog, CONSOLE_LIMIT, { type: m.type(), text: m.text(), url: page.url() }))
  page.on('pageerror', e => push(consoleLog, CONSOLE_LIMIT, { type: 'pageerror', text: String(e && e.message || e), url: page.url() }))
  page.on('requestfailed', r => push(networkLog, NETWORK_LIMIT,
    { status: 'FAILED', method: r.method(), url: r.url(), error: r.failure() && r.failure().errorText }))
  page.on('response', r => {
    if (r.status() >= 400) push(networkLog, NETWORK_LIMIT, { status: r.status(), method: r.request().method(), url: r.url() })
  })

  const file = (stem, ext) => path.join(outDir, `${String(++seq).padStart(3, '0')}-${stem}.${ext}`)
  const write = (f, text) => { fs.writeFileSync(f, text); return f }
  const state = async () => ({ url: page.url(), title: await page.title() })

  // Selector is a Playwright selector (css, text=..., role=button[name="x"], etc.).
  const handlers = {
    async open ({ url }) {
      const res = await page.goto(url, { waitUntil: 'load' })
      return { ...(await state()), status: res ? res.status() : null }
    },
    async click ({ selector }) {
      await page.locator(selector).first().click({ timeout: 5000 })
      await page.waitForLoadState('load').catch(() => {})
      return await state()
    },
    async fill ({ selector, text }) {
      await page.locator(selector).first().fill(text, { timeout: 5000 })
      return { filled: selector, chars: text.length }
    },
    async press ({ key }) {
      await page.keyboard.press(key)
      return await state()
    },
    async select ({ selector, value }) {
      await page.locator(selector).first().selectOption(value, { timeout: 5000 })
      return { selected: value }
    },
    async wait ({ selector, ms }) {
      if (selector) await page.locator(selector).first().waitFor({ timeout: 10000 })
      else await page.waitForTimeout(Math.min(Number(ms) || 500, 10000))
      return await state()
    },
    async snapshot ({ selector }) {
      const text = await page.locator(selector || 'body').first().ariaSnapshot()
      const f = write(file('snapshot', 'yml'), text)
      const lines = text.split('\n').length
      return { ...(await state()), file: f, lines }
    },
    async screenshot ({ fullPage }) {
      const f = file('screenshot', 'png')
      await page.screenshot({ path: f, fullPage: !!fullPage })
      return { file: f }
    },
    async text ({ selector }) {
      const text = await page.locator(selector || 'body').first().innerText({ timeout: 5000 })
      const f = write(file('text', 'txt'), text)
      return { file: f, chars: text.length, head: text.slice(0, 200) }
    },
    async console () {
      const f = write(file('console', 'json'), JSON.stringify(consoleLog, null, 1))
      return { file: f, total: consoleLog.length, errors: consoleLog.filter(e => e.type === 'error' || e.type === 'pageerror').length }
    },
    async network () {
      const f = write(file('network', 'json'), JSON.stringify(networkLog, null, 1))
      return { file: f, failedOrErrored: networkLog.length }
    },
    async viewport ({ width, height }) {
      await page.setViewportSize({ width: Number(width), height: Number(height) })
      return { width: Number(width), height: Number(height) }
    },
    async back () { await page.goBack(); return await state() },
    async reload () { await page.reload(); return await state() },
    async status () {
      return { ...(await state()), consoleErrors: consoleLog.filter(e => e.type === 'error' || e.type === 'pageerror').length, failedRequests: networkLog.length }
    }
  }

  async function exec (cmd, args = {}) {
    const h = handlers[cmd]
    if (!h) return { ok: false, error: `unknown command "${cmd}"; known: ${Object.keys(handlers).join(', ')}` }
    try {
      return { ok: true, ...(await h(args)) }
    } catch (e) {
      // Playwright errors are long (call log); keep only the first line for the summary.
      return { ok: false, error: String(e && e.message || e).split('\n')[0] }
    }
  }

  return { exec, close: () => browser.close(), commands: Object.keys(handlers) }
}

// Loopback-only server. `onStop` fires after a `stop` request so the owning process can exit.
export function serve (session, { port = 0, onStop } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', async () => {
      let msg
      try { msg = JSON.parse(body || '{}') } catch { res.writeHead(400).end('bad json'); return }
      const out = msg.cmd === 'stop' ? { ok: true, stopped: true } : await session.exec(msg.cmd, msg.args)
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out))
      if (msg.cmd === 'stop') { await session.close(); server.close(); if (onStop) onStop() }
    })
  })
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)))
}
