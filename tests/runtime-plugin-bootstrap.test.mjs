import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { initializeProfile, pluginIsInstalled } from '../runtime/bootstrap-openbkn-plugin.mjs'

test('recognizes only an exact bundled plugin installed as a web profile layer', () => {
  const home = mkdtempSync(join(tmpdir(), 'openbkn-runtime-home-'))
  assert.equal(pluginIsInstalled({ home, packageName: '@openbkn/dsh-business-context', version: '0.1.3' }), false)

  const profile = join(home, 'profiles', 'web')
  mkdirSync(join(profile, 'node_modules', '@openbkn', 'dsh-business-context'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@openbkn/dsh-business-context'] } },
  }))
  writeFileSync(join(profile, 'node_modules', '@openbkn', 'dsh-business-context', 'package.json'), JSON.stringify({ version: '0.1.3' }))

  assert.equal(pluginIsInstalled({ home, packageName: '@openbkn/dsh-business-context', version: '0.1.3' }), true)
  assert.equal(pluginIsInstalled({ home, packageName: '@openbkn/dsh-business-context', version: '0.1.4' }), false)
})

test('copies the release-built, native-plugin-managed profile without network access', () => {
  const home = mkdtempSync(join(tmpdir(), 'openbkn-runtime-home-'))
  const template = mkdtempSync(join(tmpdir(), 'openbkn-runtime-profile-'))
  mkdirSync(join(template, 'node_modules', '@openbkn', 'dsh-business-context'), { recursive: true })
  writeFileSync(join(template, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@openbkn/dsh-business-context'] } },
  }))
  writeFileSync(join(template, 'node_modules', '@openbkn', 'dsh-business-context', 'package.json'), JSON.stringify({ version: '0.1.3' }))

  assert.equal(initializeProfile({
    home,
    template,
    packageName: '@openbkn/dsh-business-context',
    version: '0.1.3',
  }), true)
  assert.equal(pluginIsInstalled({ home, packageName: '@openbkn/dsh-business-context', version: '0.1.3' }), true)
  assert.equal(initializeProfile({ home, template, packageName: '@openbkn/dsh-business-context', version: '0.1.3' }), false)
})

test('a corrupted home profile manifest fails closed with context and is never overwritten', () => {
  const home = mkdtempSync(join(tmpdir(), 'openbkn-bootstrap-corrupt-'))
  const profile = join(home, 'profiles', 'web')
  mkdirSync(join(profile, 'node_modules', '@openbkn', 'dsh-business-context'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{ this is not json')
  // the plugin manifest must exist so the check reaches parsing the corrupted profile manifest
  writeFileSync(join(profile, 'node_modules', '@openbkn', 'dsh-business-context', 'package.json'), JSON.stringify({ version: '0.1.4' }))
  const template = mkdtempSync(join(tmpdir(), 'openbkn-bootstrap-template-'))
  mkdirSync(join(template, 'node_modules', '@openbkn', 'dsh-business-context'), { recursive: true })
  writeFileSync(join(template, 'package.json'), JSON.stringify({
    dsh: { profile: { bundles: ['@openbkn/dsh-business-context'] } },
  }))
  writeFileSync(join(template, 'node_modules', '@openbkn', 'dsh-business-context', 'package.json'), JSON.stringify({ version: '0.1.4' }))

  assert.throws(
    () => initializeProfile({ home, template, packageName: '@openbkn/dsh-business-context', version: '0.1.4' }),
    /corrupted and must be repaired|not a JSON object/,
  )
  // the corrupted manifest is still exactly what was there: no seeding ran
  assert.equal(readFileSync(join(profile, 'package.json'), 'utf8'), '{ this is not json')

  rmSync(home, { recursive: true, force: true })
  rmSync(template, { recursive: true, force: true })
})

test('a corrupted template manifest fails closed before any home directory is created', () => {
  const home = mkdtempSync(join(tmpdir(), 'openbkn-bootstrap-corrupt-home-'))
  rmSync(home, { recursive: true, force: true }) // initializeProfile must not get far enough to create it
  const template = mkdtempSync(join(tmpdir(), 'openbkn-bootstrap-corrupt-template-'))
  writeFileSync(join(template, 'package.json'), '] also not json')
  // the plugin manifest must exist so the template check reaches the parse
  mkdirSync(join(template, 'node_modules', '@openbkn', 'dsh-business-context'), { recursive: true })
  writeFileSync(join(template, 'node_modules', '@openbkn', 'dsh-business-context', 'package.json'), JSON.stringify({ version: '0.1.4' }))

  assert.throws(
    () => initializeProfile({ home, template, packageName: '@openbkn/dsh-business-context', version: '0.1.4' }),
    /corrupted and must be repaired|not a JSON object/,
  )
  assert.equal(existsSync(home), false)

  rmSync(template, { recursive: true, force: true })
})
