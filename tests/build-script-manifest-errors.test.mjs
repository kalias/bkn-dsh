import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readCompatibilityManifest } from '../scripts/build-compatible-runtime.mjs'
import { parsePackManifest } from '../scripts/package-bundle.mjs'

test('a corrupted compatibility manifest fails with the file path and cause', () => {
  const dir = mkdtempSync(join(tmpdir(), 'openbkn-manifest-corrupt-'))
  const path = join(dir, 'manifest.json')
  writeFileSync(path, '{ not json')
  assert.throws(() => readCompatibilityManifest(path), (error) => {
    assert.match(error.message, /Compatibility manifest is not valid JSON/)
    assert.ok(error.message.includes(path), 'error names the offending file')
    assert.ok(error.cause instanceof SyntaxError)
    return true
  })
  rmSync(dir, { recursive: true, force: true })
})

test('non-JSON pnpm pack output fails with instructions instead of a bare SyntaxError', () => {
  assert.throws(() => parsePackManifest('WARN some pnpm notice\nsecond line', '/a/b'), (error) => {
    assert.match(error.message, /not the expected JSON manifest/)
    assert.ok(error.message.includes('/a/b'), 'error names the package directory to inspect')
    assert.ok(error.cause instanceof SyntaxError)
    return true
  })
})

test('valid inputs still parse through both helpers', () => {
  assert.deepEqual(parsePackManifest('{"files":[]}', '/cwd'), { files: [] })
})
