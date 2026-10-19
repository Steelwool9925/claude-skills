import { test } from '../../map-codebase/harness.mjs'
import assert from 'node:assert/strict'
import { parseRoadmap, selectRows, setStatus } from './roadmap.mjs'

const TABLE = `# Roadmap

| Name | Title | Status | Plan |
|---|---|---|---|
| 12345 | Asset barcode import | Active | .claude/plans/FEATURE_PLAN_12345.md |
| v2 | Export v2 | Future | .claude/plans/FEATURE_PLAN_v2.md |
| 12200 | Export v1 | Done | .claude/plans/FEATURE_PLAN_12200.md |
| 12346 | Second active | Active | .claude/plans/FEATURE_PLAN_12346.md |
`

test('roadmap: rows parse, Active keeps file order, Future/Done separated', () => {
  assert.equal(parseRoadmap(TABLE).length, 4)
  const s = selectRows(TABLE)
  assert.deepEqual(s.active.map(r => r.name), ['12345', '12346'])
  assert.deepEqual(s.skippedFuture.map(r => r.name), ['v2'])
  assert.deepEqual(s.done.map(r => r.name), ['12200'])
})

test('roadmap: setStatus flips only the named row and throws on an unknown one', () => {
  const out = setStatus(TABLE, '12345', 'Done')
  assert.deepEqual(selectRows(out).active.map(r => r.name), ['12346'])
  assert.equal(out.split('\n').length, TABLE.split('\n').length)
  assert.ok(out.includes('| 12345 | Asset barcode import | Done | .claude/plans/FEATURE_PLAN_12345.md |'))
  assert.throws(() => setStatus(TABLE, 'nope', 'Done'), /no roadmap row/)
})
