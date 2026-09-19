import { cpSync, existsSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const scrubByteLimit = 64 * 1024 * 1024

// pnpm install-time metadata references the build machine's layout (absolute
// virtual-store dirs, build-time file: specifiers). The shipped bundle is
// pre-installed and nothing runs pnpm against it, so these are removed.
const installMetadataBasenames = new Set(['pnpm-lock.yaml', '.modules.yaml'])
const installMetadataPrefixes = ['.pnpm-workspace-state']

function walkEntries(root) {
  const entries = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      entries.push({ path, symlink: entry.isSymbolicLink(), directory: entry.isDirectory() })
      if (entry.isDirectory()) visit(path)
    }
  }
  visit(root)
  return entries
}

function walkFiles(root) {
  return walkEntries(root).filter(entry => !entry.directory).map(entry => entry.path)
}

/** Decode as text unless the leading bytes look binary; hidden and multi-dot names included. */
function readTextIfTextual(path) {
  const stat = statSync(path)
  if (stat.size > scrubByteLimit) return undefined
  const buffer = readFileSync(path)
  if (buffer.subarray(0, 8192).includes(0)) return undefined
  return buffer.toString('utf8')
}

/** Remove pnpm install-time metadata so no build-machine layout survives in it. */
export function stripInstallMetadata(root) {
  const removed = []
  for (const path of walkFiles(root)) {
    const name = basename(path)
    const insideVirtualStore = path.split(sep).includes('.pnpm')
    if (installMetadataBasenames.has(name)
      || (name === 'lock.yaml' && insideVirtualStore)
      || installMetadataPrefixes.some(prefix => name.startsWith(prefix))) {
      rmSync(path)
      removed.push(relative(root, path))
    }
  }
  return removed
}

// A source root paired with the bundle subdirectory it was copied into.
// Plain strings stay supported and map onto the bundle root itself.
function sourceMappings(sourceRoots) {
  return sourceRoots.map(entry => typeof entry === 'string'
    ? { source: realpathSync(resolve(entry)), into: '' }
    : { source: realpathSync(resolve(entry.source)), into: entry.into ?? '' })
}

function mirrorsTarget(mappings, root, target) {
  const canonicalRoot = realpathSync(resolve(root))
  for (const { source, into } of mappings) {
    const rel = relative(source, target)
    if (rel !== '' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) {
      return join(canonicalRoot, into, rel)
    }
  }
  return undefined
}

/**
 * Replace surviving symlinks so every one resolves inside the bundle.
 *
 * Links whose target lives under one of the source roots being copied (the
 * deployed runtime or the prepared profile) are re-created as RELATIVE links
 * to the mirrored path inside the bundle — copying would break `.bin`
 * entries whose scripts resolve modules relative to their own location.
 * Links to anything outside those roots (vendored trees) are replaced with a
 * real copy via staging + rename.
 */
export function dereferenceSymlinks(root, sourceRoots = []) {
  const replaced = []
  const mappings = sourceMappings(sourceRoots)
  const canonicalRoot = realpathSync(resolve(root))
  const insideBundle = path => {
    const rel = relative(canonicalRoot, realpathSync(path))
    return rel !== '' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  }
  // Loop to a fixed point: replacing one link can surface nested ones. Links
  // that already resolve inside the bundle are portable and left untouched.
  for (;;) {
    const links = walkEntries(root)
      .filter(entry => entry.symlink)
      .map(entry => entry.path)
      .filter(path => !insideBundle(path))
    if (links.length === 0) break
    for (const path of links) {
      const target = realpathSync(path) // throws when dangling: fail closed
      const mirrored = mirrorsTarget(mappings, root, target)
      if (mirrored !== undefined && existsSync(mirrored)) {
        const kind = statSync(mirrored).isDirectory() ? 'dir' : 'file'
        // canonicalize both sides through symlinked system roots (/tmp vs
        // /private/tmp) or the computed relative link escapes the bundle
        const linkTarget = relative(realpathSync(dirname(path)), mirrored)
        rmSync(path, { recursive: true, force: true })
        symlinkSync(linkTarget, path, kind)
        replaced.push({ link: relative(root, path), target: linkTarget, kind: 'relative-link' })
        continue
      }
      const staging = `${path}.openbkn-portable-copy`
      rmSync(staging, { recursive: true, force: true })
      cpSync(target, staging, { recursive: true })
      // recursive is required for links whose target is a directory
      rmSync(path, { recursive: true, force: true })
      renameSync(staging, path)
      replaced.push({ link: relative(root, path), kind: 'copy' })
    }
  }
  return replaced
}

/** Erase build-machine absolute path prefixes from text payloads in the bundle. */
export function scrubAbsolutePaths(root, prefixes) {
  const roots = prefixes.map(value => resolve(value)).filter(Boolean)
  const scrubbed = []
  for (const path of walkFiles(root)) {
    const original = readTextIfTextual(path)
    if (original === undefined) continue
    let updated = original
    for (const prefix of roots) {
      if (updated.includes(prefix)) updated = updated.split(prefix).join('')
    }
    if (updated !== original) {
      writeFileSync(path, updated)
      scrubbed.push(relative(root, path))
    }
  }
  return scrubbed
}

/**
 * Fail-closed portability scan over one assembled bundle directory:
 * every symlink must resolve inside the bundle, no build-machine path may
 * survive in text payloads, and no build-time `file:` dependency reference
 * (JSON or YAML) may remain.
 */
export function assertPortableBundle({ directory, home }) {
  // canonicalize through symlinked system roots (e.g. macOS /var -> /private/var)
  const root = realpathSync(resolve(directory))
  const violations = []
  for (const entry of walkEntries(root)) {
    if (!entry.symlink) continue
    const target = realpathSync(entry.path)
    const rel = relative(root, target)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      violations.push(`symlink escapes the bundle: ${relative(root, entry.path)} -> ${target}`)
    }
  }
  const machineRoots = home === undefined ? [] : [resolve(home)]
  for (const path of walkFiles(root)) {
    const name = basename(path)
    const text = readTextIfTextual(path)
    if (text === undefined) continue
    for (const prefix of machineRoots) {
      if (text.includes(prefix)) violations.push(`build-machine path ${prefix} in ${relative(root, path)}`)
    }
    if (/\.(json|ya?ml|lock)$/.test(name)) {
      if (/file:(\/|\.\.)/.test(text)) violations.push(`build-time file: reference in ${relative(root, path)}`)
    }
  }
  if (violations.length > 0) {
    throw new Error(`Runtime bundle is not portable:\n  - ${violations.slice(0, 20).join('\n  - ')}`)
  }
  return { checked: root }
}
