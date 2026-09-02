// Minimal test harness.
//
// The suite used node:test, which does not exist before Node 18 — on the Node 16 installed on
// this machine every test file died at import with ERR_UNKNOWN_BUILTIN_MODULE, so 700 lines of
// tests had never run anywhere the skill actually runs. This harness has the same surface and
// works on Node 14.8+.
const tests = []

export function test (name, fn) { tests.push({ name, fn }) }

export async function run () {
  let pass = 0
  const failures = []
  for (const t of tests) {
    try {
      await t.fn()
      pass++
    } catch (e) {
      failures.push({ name: t.name, err: e })
    }
  }
  for (const f of failures) {
    const raw = f.err && f.err.message ? f.err.message : String(f.err)
    process.stdout.write('FAIL  ' + f.name + '\n      ' +
      String(raw).split('\n').slice(0, 4).join('\n      ') + '\n')
  }
  process.stdout.write(
    '\n' + pass + ' passed, ' + failures.length + ' failed, ' + tests.length + ' total\n')
  return failures.length === 0 ? 0 : 1
}
