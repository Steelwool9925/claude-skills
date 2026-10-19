import { test } from '../../map-codebase/harness.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { summarize, toRanges, bucket } from './coverage-summary.mjs'

const LCOV = `SF:src/a.js
DA:1,1
DA:2,0
DA:3,0
DA:5,0
BRF:4
BRH:1
end_of_record
SF:src/b.js
DA:1,0
end_of_record
SF:src/c.js
DA:1,2
DA:2,1
end_of_record
`

const COBERTURA = `<coverage><packages><package><classes>
<class name="A" filename="src/A.cs"><methods><method name="m"><lines><line number="1" hits="1" branch="false"/></lines></method></methods>
<lines><line number="1" hits="1" branch="false"/><line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/></lines></class>
</classes></package></packages></coverage>`

function tmp (name, text) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cov-')), name)
  fs.writeFileSync(file, text)
  return file
}

test('coverage-summary: ranges and buckets', () => {
  assert.deepEqual(toRanges([5, 2, 3, 1, 9]), ['1-3', '5', '9'])
  assert.deepEqual([0, 50, 80, 100].map(p => bucket(p)), ['Critical', 'Partial', 'Compliant', 'Compliant'])
})

test('coverage-summary: lcov overall, per-file buckets, uncovered only for non-compliant or focused files', () => {
  const s = summarize(tmp('lcov.info', LCOV))
  assert.deepEqual(s.overall, { linePct: 42.9, branchPct: 25 })
  assert.deepEqual(s.buckets, { Critical: 1, Partial: 1, Compliant: 1 })
  assert.deepEqual(s.files.map(f => f.file), ['src/b.js', 'src/a.js', 'src/c.js'])
  assert.deepEqual(s.files[1].uncovered, ['2-3', '5'])
  assert.equal(s.files[2].uncovered, undefined)
  const focused = summarize(tmp('lcov.info', LCOV), { focus: ['src\\c.js'] })
  assert.deepEqual(focused.files.find(f => f.file === 'src/c.js').uncovered, [])
  assert.equal(focused.files.find(f => f.file === 'src/a.js').uncovered, undefined)
})

test('coverage-summary: cobertura sniffed by content, method-level duplicate lines collapse, branches read', () => {
  const s = summarize(tmp('coverage.cobertura.xml', COBERTURA))
  assert.deepEqual(s.overall, { linePct: 50, branchPct: 50 })
  assert.deepEqual(s.files[0].uncovered, ['2'])
})
