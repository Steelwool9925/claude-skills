import { test } from '../../map-codebase/harness.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runToFile } from './quiet-run.mjs'

test('quiet-run: full output goes to the file, only a summary comes back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-run-'))
  const out = path.join(dir, 'nested', 'out.log')
  const script = path.join(dir, 'noisy.mjs')
  fs.writeFileSync(script, 'for (let i = 1; i <= 100; i++) console.log(i === 40 ? "Error: boom" : "line " + i); process.exit(3)')
  const r = runToFile(dir, `"${process.execPath}" "${script}"`, out, { tailLines: 2 })
  assert.equal(r.exitCode, 3)
  assert.equal(r.lines, 100)
  assert.deepEqual(r.tail, ['line 99', 'line 100'])
  assert.deepEqual(r.errorLines, ['40: Error: boom'])
  assert.equal(fs.readFileSync(out, 'utf8').split('\n').length, 101)
})
