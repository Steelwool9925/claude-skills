import { test } from './harness.mjs'
import assert from 'node:assert/strict'
import { detectStacks, findEntryPoints, UNKNOWN_STACK_HINT } from './map.mjs'

const has = (files, stack) => detectStacks(files).includes(stack)

test('detects JVM builds and does not confuse them with Android', () => {
  assert.ok(has(['pom.xml', 'src/main/java/App.java'], 'jvm'), 'maven')
  assert.ok(has(['build.gradle', 'src/main/java/App.java'], 'jvm'), 'gradle jvm')
  assert.ok(has(['build.sbt', 'src/main/scala/App.scala'], 'jvm'), 'sbt')
  assert.ok(!has(['pom.xml'], 'android'), 'maven is never android')
  assert.ok(!has(['build.gradle', 'src/main/java/App.java'], 'android'),
    'gradle without an Android manifest is a JVM build, not an Android app')
})

test('Android still detected when the manifest is present', () => {
  const files = ['build.gradle', 'app/build.gradle', 'app/src/main/AndroidManifest.xml']
  assert.ok(has(files, 'android'))
  assert.ok(!has(files, 'jvm'), 'an Android app is reported as android, not both')
})

test('detects the common stacks that previously reported nothing', () => {
  const cases = [
    ['rust', ['Cargo.toml', 'src/main.rs']],
    ['ruby', ['Gemfile', 'app/controllers/x_controller.rb']],
    ['ruby', ['myapp.gemspec']],
    ['php', ['composer.json', 'routes/web.php']],
    ['python', ['requirements.txt', 'app/main.py']],
    ['python', ['setup.py']],
    ['python', ['Pipfile']],
    ['cpp', ['CMakeLists.txt', 'src/main.cpp']],
    ['swift', ['Package.swift', 'Sources/App/main.swift']],
    ['elixir', ['mix.exs', 'lib/app.ex']]
  ]
  for (const [stack, files] of cases) {
    assert.ok(has(files, stack), `${stack} not detected from ${JSON.stringify(files)}`)
  }
})

test('previously-supported stacks are unaffected', () => {
  assert.deepEqual(detectStacks(['src/App.csproj', 'App.sln']), ['dotnet'])
  assert.deepEqual(detectStacks(['pubspec.yaml']), ['flutter'])
  assert.deepEqual(detectStacks(['go.mod']), ['go'])
  assert.ok(has(['package.json'], 'node'))
  assert.ok(has(['pyproject.toml'], 'python'))
})

test('a Flutter project is not also reported as generic dart/node noise', () => {
  assert.deepEqual(detectStacks(['pubspec.yaml', 'lib/main.dart']), ['flutter'])
})

test('composer.json plus package.json reports both, not one', () => {
  const s = detectStacks(['composer.json', 'package.json'])
  assert.ok(s.includes('php') && s.includes('node'))
})

test('entry points are found for the newly supported stacks', () => {
  const cases = [
    ['src/main.rs', ['Cargo.toml', 'src/main.rs']],
    ['public/index.php', ['composer.json', 'public/index.php']],
    ['manage.py', ['requirements.txt', 'manage.py']],
    ['src/main/java/com/x/Application.java', ['pom.xml', 'src/main/java/com/x/Application.java']],
    ['Sources/App/main.swift', ['Package.swift', 'Sources/App/main.swift']],
    ['config.ru', ['Gemfile', 'config.ru']]
  ]
  for (const [expected, files] of cases) {
    assert.ok(findEntryPoints(files).includes(expected),
      `expected ${expected}, got ${JSON.stringify(findEntryPoints(files))}`)
  }
})

test('an unrecognised codebase yields no stack and a usable hint', () => {
  assert.deepEqual(detectStacks(['weird/thing.xyz', 'notes.txt']), [])
  assert.match(UNKNOWN_STACK_HINT, /unrecognised|unknown/i)
  assert.ok(UNKNOWN_STACK_HINT.length > 40, 'the hint must tell the reader what to do next')
})
