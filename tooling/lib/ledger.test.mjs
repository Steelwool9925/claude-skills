import { test } from '../../map-codebase/harness.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { statLine, approvedLine, correctionsLine, appendLine, rollup, rollupFile } from './ledger.mjs'

test('ledger: line builders reject incomplete or unknown input', () => {
  assert.equal(statLine({ task: 1, score: 4, repo: 'api', status: 'DONE', tokens: 9000 }),
    'STAT | task=1 | score=4 | repo=api | round=1 | status=DONE | tokens=9000')
  assert.ok(statLine({ task: '2.1', score: 2, repo: 'api', status: 'PASS', tokens: 1, by: 'haiku' }).endsWith('| by=haiku'))
  assert.throws(() => statLine({ task: 1, score: 4, repo: 'api', status: 'MAYBE', tokens: 1 }), /unknown status/)
  assert.throws(() => statLine({ task: 1, score: 4, status: 'DONE', tokens: 1 }), /missing repo/)
  assert.equal(approvedLine(2), 'APPROVED | milestone=2 | by=user')
  assert.equal(correctionsLine(3, 5), 'CORRECTIONS | round=3 | source=test-feature+kevin | items=5')
})

test('ledger: appendLine + rollup count spend per line, tasks once, and flag the ceiling', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'x.ledger.md')
  fs.writeFileSync(file, 'plan: FEATURE_PLAN_x.md') // no trailing newline
  appendLine(file, statLine({ task: 1, score: 3, repo: 'api', status: 'FAIL', tokens: 100000 }))
  appendLine(file, statLine({ task: 1, score: 3, repo: 'api', round: 2, status: 'DONE', tokens: 100000 }))
  appendLine(file, statLine({ task: 2, score: 5, repo: 'web', status: 'DONE', tokens: 120000 }))
  appendLine(file, approvedLine(1))
  appendLine(file, correctionsLine(2, 4))
  const r = rollupFile(file)
  assert.deepEqual(
    { tasks: r.tasks, tokens: r.tokens, remaining: r.remaining, perRepo: r.perRepo, rounds: r.rounds, approved: r.approved, correctionRound: r.correctionRound, nearCeiling: r.nearCeiling },
    { tasks: 2, tokens: 320000, remaining: 30000, perRepo: { api: 1, web: 1 }, rounds: 2, approved: [1], correctionRound: 2, nearCeiling: true })
  assert.equal(rollup(fs.readFileSync(file, 'utf8'), { ceiling: 1000000 }).nearCeiling, false)
  assert.equal(rollupFile(path.join(os.tmpdir(), 'no-such-ledger.md')).tokens, 0)
})
