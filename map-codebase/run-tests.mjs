#!/usr/bin/env node
// Runs every test file in one process. Usage: node run-tests.mjs
import { run } from './harness.mjs'
import './test-map.mjs'
import './test-stacks.mjs'
import './test-edges.mjs'
import './test-improvements.mjs'

process.exit(await run())
