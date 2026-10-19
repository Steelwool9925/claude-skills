# browser-runner

Local Playwright runner for `/kevin` (and anything else that needs a browser). It holds one Chromium
page open in a background process; each CLI call acts on that page, writes bulky output to numbered
files, and prints a few `key: value` lines. This keeps snapshots, screenshots, console and network
output out of Claude's context. The chrome-devtools MCP server stays as a fallback only.

Local only: no Docker needed, because the runner has no database or other services. It binds to
`127.0.0.1` and never talks to anything but the app you point it at.

## Install

```
cd browser-runner
npm i          # installs playwright; the postinstall step downloads Chromium
npm test       # smoke test against a throwaway local fixture (skips with a message if Chromium is missing)
```

If the Chromium download was skipped: `npx playwright install chromium`.

## Use

```
node runner.mjs [--out <dir>] <command> [args]
```

The default out dir is `.claude/browser/` under the current directory (gitignored in this repo).
`--out` must be the same on every call of one session.

| Command | Does | Prints |
|---|---|---|
| `start [--headed] [--port n]` | launches the detached session | port, pid, out dir |
| `open <url>` | navigates | url, title, HTTP status |
| `click <selector>` | clicks the first match | url, title |
| `fill <selector> <text...>` | types into a field | selector, char count |
| `press <key>` | keyboard key (`Enter`, `Tab`) | url, title |
| `select <selector> <value>` | picks a `<select>` option | value |
| `wait [selector\|ms]` | waits for an element or a delay (max 10s) | url, title |
| `snapshot [selector]` | accessibility snapshot to `NNN-snapshot.yml` | file, line count |
| `screenshot [--full]` | PNG to `NNN-screenshot.png` | file |
| `text [selector]` | visible text to `NNN-text.txt` | file, chars, first 200 chars |
| `console` | console + page errors to `NNN-console.json` | file, total, error count |
| `network` | failed, 4xx and 5xx requests to `NNN-network.json` | file, count |
| `viewport <w> <h>` | resizes | size |
| `back`, `reload`, `status` | navigation, session summary | url, title, error counts |
| `stop` | closes the browser and the session | stopped |

Selectors are Playwright selectors: CSS, `text=Save`, `role=button[name="Save"]`, `#id >> text=x`.
A failed command prints one `ERROR: ...` line (first line of the Playwright error only) and exits 1.
Read a file only when you need its content; the summary is usually enough.

Console and network logs keep the most recent 2000 entries per session. `runner.log` in the out dir
holds the background process's own output, for debugging a failed `start`.

## Layout

- `runner.mjs`: CLI (`start` spawns itself with `--serve`)
- `lib/session.mjs`: `createSession`, `serve`
- `lib/session.test.mjs`: smoke test (not part of `tooling/run-tests.mjs`, which stays zero-dependency)
