import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assertPortableBundle, dereferenceSymlinks, scrubAbsolutePaths, stripInstallMetadata } from '../runtime/bundle-portability.mjs'

function fresh(name) {
  const root = join(tmpdir(), `openbkn-portability-${name}-${process.pid}`)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  return root
}

const home = '/Users/build-machine'

test('flags build-machine paths in hidden and multi-dot text files', () => {
  const root = fresh('hidden')
  writeFileSync(join(root, '.modules.yaml'), `virtualStoreDir: ${home}/.pnpm\n`)
  writeFileSync(join(root, 'client.terminal.js'), `// sourcemapping ${home}/src\n`)
  assert.throws(() => assertPortableBundle({ directory: root, home }), /build-machine path.*\.modules\.yaml[\s\S]*client\.terminal\.js/)
  rmSync(root, { recursive: true, force: true })
})

test('flags build-time file: references in YAML lockfiles and JSON manifests', () => {
  const root = fresh('filedeps')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'dependencies:\n  specifier: file:/plugin/x.tgz\n  version: file:../../../../plugin/x.tgz\n')
  writeFileSync(join(root, 'package-lock.json'), '{"dependencies":{"x":"file:../x.tgz"}}')
  assert.throws(() => assertPortableBundle({ directory: root, home }), /file: reference[\s\S]*file: reference/)
  rmSync(root, { recursive: true, force: true })
})

test('removes pnpm install metadata from the bundle', () => {
  const root = fresh('metadata')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'locked\n')
  writeFileSync(join(root, '.modules.yaml'), 'store\n')
  writeFileSync(join(root, '.pnpm-workspace-state-v1.json'), '{}')
  writeFileSync(join(root, 'package.json'), '{"name":"keep"}')
  const removed = stripInstallMetadata(root)
  assert.deepEqual([...removed].sort(), ['.modules.yaml', '.pnpm-workspace-state-v1.json', 'pnpm-lock.yaml'])
  rmSync(root, { recursive: true, force: true })
})

test('keeps in-bundle symlinks relative and rejects escaping ones', () => {
  const root = fresh('links')
  mkdirSync(join(root, 'pkg'))
  writeFileSync(join(root, 'pkg', 'a.js'), 'module.exports = 1\n')
  mkdirSync(join(root, '.bin'))
  symlinkSync('../pkg/a.js', join(root, '.bin', 'a'))
  assertPortableBundle({ directory: root, home }) // in-bundle relative link passes
  symlinkSync('/etc/hosts', join(root, '.bin', 'escape'))
  assert.throws(() => assertPortableBundle({ directory: root, home }), /symlink escapes the bundle/)
  rmSync(root, { recursive: true, force: true })
})

test('re-points source-tree links to mirrored bundle paths and copies external ones', () => {
  const source = fresh('src')
  mkdirSync(join(source, 'pkg'), { recursive: true })
  writeFileSync(join(source, 'pkg', 'real.js'), 'module.exports = 42\n')
  mkdirSync(join(source, 'vendor'), { recursive: true })
  writeFileSync(join(source, 'vendor', 'v.txt'), 'vendored\n')

  const root = fresh('mirror')
  mkdirSync(join(root, 'pkg'), { recursive: true })
  writeFileSync(join(root, 'pkg', 'real.js'), 'module.exports = 42\n')
  mkdirSync(join(root, 'bin'), { recursive: true })
  symlinkSync(join(source, 'pkg', 'real.js'), join(root, 'bin', 'tool')) // absolute, into mirrored area
  symlinkSync(join(source, 'vendor'), join(root, 'vendored')) // absolute, external

  const replaced = dereferenceSymlinks(root, [source])
  const byLink = new Map(replaced.map(entry => [entry.link, entry]))
  assert.equal(byLink.get('bin/tool').kind, 'relative-link')
  assert.equal(byLink.get('vendored').kind, 'copy')
  assertPortableBundle({ directory: root, home })

  rmSync(source, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

test('a mirrored .bin entry keeps resolving modules relative to its real file', () => {
  const source = fresh('binsrc')
  mkdirSync(join(source, 'semver'), { recursive: true })
  writeFileSync(join(source, 'semver', 'package.json'), '{"name":"semver","version":"1.0.0"}\n')
  // A bin script that resolves a sibling of its own real location, exactly
  // like real .bin entries that require('../package.json').
  mkdirSync(join(source, 'semver', 'bin'))
  writeFileSync(join(source, 'semver', 'bin', 'semver.js'), 'const p = require("../package.json")\nconsole.log(p.name)\n')
  mkdirSync(join(source, 'node_modules', '.bin'), { recursive: true })
  symlinkSync(join(source, 'semver', 'bin', 'semver.js'), join(source, 'node_modules', '.bin', 'semver'))

  const root = fresh('binmirror')
  cpSync(source, root, { recursive: true })

  const replaced = dereferenceSymlinks(root, [source])
  assert.equal(replaced.find(entry => entry.link.endsWith('.bin/semver')).kind, 'relative-link')
  const output = execFileSync(process.execPath, [join(root, 'node_modules', '.bin', 'semver')], { encoding: 'utf8' })
  assert.equal(output.trim(), 'semver')

  rmSync(source, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

test('maps links through a bundle subdirectory prefix (runtime shape)', () => {
  const source = fresh('prefix-src')
  mkdirSync(join(source, 'node_modules', 'semver'), { recursive: true })
  writeFileSync(join(source, 'node_modules', 'semver', 'package.json'), '{"name":"semver"}')
  mkdirSync(join(source, 'node_modules', 'semver', 'bin'))
  writeFileSync(join(source, 'node_modules', 'semver', 'bin', 'semver.js'), 'const p = require("../package.json")\nconsole.log(p.name)\n')
  mkdirSync(join(source, 'node_modules', '.bin'))
  // cpSync rewrites relative links to absolute source paths; emulate that
  symlinkSync(join(source, 'node_modules', 'semver', 'bin', 'semver.js'), join(source, 'node_modules', '.bin', 'semver'))

  const root = fresh('prefix-root')
  cpSync(source, join(root, 'runtime'), { recursive: true })

  const replaced = dereferenceSymlinks(root, [{ source, into: 'runtime' }])
  assert.equal(replaced.find(entry => entry.link.endsWith('.bin/semver')).kind, 'relative-link')
  const output = execFileSync(process.execPath, [join(root, 'runtime', 'node_modules', '.bin', 'semver')], { encoding: 'utf8' })
  assert.equal(output.trim(), 'semver')

  rmSync(source, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})

test('scrubs absolute build roots from text payloads only', () => {
  const root = fresh('scrub')
  writeFileSync(join(root, 'a.map'), `{"sources":["${home}/x.ts"]}`)
  const scrubbed = scrubAbsolutePaths(root, [home])
  assert.deepEqual(scrubbed, ['a.map'])
  assert.equal(JSON.parse(readFileSync(join(root, 'a.map'), 'utf8')).sources[0], '/x.ts')
  rmSync(root, { recursive: true, force: true })
})
