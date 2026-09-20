import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'

import { runPrepareCompatibleRuntimeProfile } from '../scripts/prepare-compatible-runtime-profile.mjs'

test('requires every release profile input', () => {
  assert.throws(() => runPrepareCompatibleRuntimeProfile([]), /Usage:/)
})

test('passes explicit paths to the native-profile preparer', () => {
  const calls = []
  runPrepareCompatibleRuntimeProfile(['--runtime', '/tmp/runtime', '--plugin', '/tmp/plugin.tgz', '--output', '/tmp/profile'], {
    prepare: input => calls.push(input),
  })
  assert.deepEqual(calls, [{
    runtimeDirectory: resolve('/tmp/runtime'),
    pluginTarball: resolve('/tmp/plugin.tgz'),
    outputDirectory: resolve('/tmp/profile'),
  }])
})
