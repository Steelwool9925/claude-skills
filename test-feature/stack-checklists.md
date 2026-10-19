# test-feature — stack-specific checklists

Read by `test-feature/SKILL.md` §6 after stack detection (§2). Apply the section for the detected stack only.

## 6 — Stack-specific checklist

Apply the checklist for the **detected stack only**. If the stack is not listed here, apply the
five mandatory vectors and say plainly that no stack-specific checklist was available — do not
transplant one stack's idioms onto another.

### .NET

- **LINQ / data:** N+1 query patterns. `.ToList()` called before filtering.
- **Architecture:** dependency injection bypassed. Controllers bloated with business logic.
- **Security:** user input unsanitised. Secrets hardcoded.
- **C# practice:** async methods missing `ConfigureAwait` or `CancellationToken`. Nulls handled
  properly. Async state machine and GC traps.

### JS / TS / Node

Unawaited promises and floating rejections. `any` used to silence the compiler. Blocking work on
the event loop. Dependency and lockfile drift. Secrets in client-side bundles.

### Python

Mutable default arguments. Bare `except`. Unpinned dependencies. Blocking I/O in async code.
String-built SQL.

### JVM

Resources not closed (try-with-resources). Swallowed exceptions. N+1 in JPA/Hibernate. Mutable
static state and thread-safety in singletons.

### Go

Ignored `error` returns. Goroutine leaks and missing context cancellation. Captured loop
variables. `defer` inside a loop.

### Ruby / PHP

Mass assignment without strong parameters. N+1 in ActiveRecord/Eloquent. Unescaped output in
views. Unsanitised input reaching a query.

### Rust

`unwrap`/`expect` on recoverable errors. `unsafe` without an invariant comment. Blocking calls in
async contexts.
