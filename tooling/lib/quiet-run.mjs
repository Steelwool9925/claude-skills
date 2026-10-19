// quiet-run.mjs — run a noisy command (build, test, coverage) with its full output written to a
// file, and return only a few-line summary. Keeps 10k+ line tool results out of the model's
// context: the model greps the file when it needs detail instead of reading the whole stream.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ERROR_RE = /\b(error|fail(?:ed|ure)?|exception|panic|fatal)\b/i

/**
 * Runs `command` through the shell in `root`, writes combined stdout+stderr to `outFile`
 * (parent dirs created), and returns `{ exitCode, outFile, lines, bytes, tail, errorLines }`.
 * `tail` is the last `tailLines` (default 15) lines; `errorLines` the first `maxErrors` (default
 * 10) lines matching error/fail/exception, as `"<lineNo>: <text>"` so a follow-up grep or read of
 * `outFile` lands on the right spot. A command that cannot start reports `exitCode: -1`.
 */
export function runToFile (root, command, outFile, { tailLines = 15, maxErrors = 10, timeoutMs = 600000 } = {}) {
  const res = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    timeout: timeoutMs
  })
  const output = (res.stdout || '') + (res.stderr || '') + (res.error ? `\n${res.error.message}\n` : '')
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true })
  fs.writeFileSync(outFile, output)

  const lines = output.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const errorLines = []
  for (let i = 0; i < lines.length && errorLines.length < maxErrors; i++) {
    if (ERROR_RE.test(lines[i])) errorLines.push(`${i + 1}: ${lines[i].trim().slice(0, 200)}`)
  }
  return {
    exitCode: typeof res.status === 'number' ? res.status : -1,
    outFile,
    lines: lines.length,
    bytes: Buffer.byteLength(output),
    tail: lines.slice(-tailLines),
    errorLines
  }
}
