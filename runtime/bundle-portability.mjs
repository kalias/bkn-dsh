import { cpSync, existsSync, readlinkSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const scrubByteLimit = 64 * 1024 * 1024

// pnpm install-time metadata references the build machine's layout (absolute
// virtual-store dirs, build-time file: specifiers). The shipped bundle is
// pre-installed and nothing runs pnpm against it, so these are removed.
const installMetadataBasenames = new Set(['pnpm-lock.yaml', '.modules.yaml'])
// file: followed by a rooted target: POSIX /, ../, Windows drive letter, or UNC.
const fileReferencePattern = /file:(?:\/|\.\.|[A-Za-z]:[\\/]|\\\\)/
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
  // A statSync here follows symlinks; directory links would fail readFileSync
  // with EISDIR, so only regular files ever reach the decoder.
  if (!stat.isFile()) return undefined
  if (stat.size > scrubByteLimit) return undefined
  const buffer = readFileSync(path)
  if (buffer.subarray(0, 8192).includes(0)) return undefined
  return buffer.toString('utf8')
}

/** Plain (non-symlink) files only — link entries are judged by link rules, never by following them. */
function walkPlainFiles(root) {
  return walkEntries(root).filter(entry => !entry.directory && !entry.symlink).map(entry => entry.path)
}

/** Remove pnpm install-time metadata so no build-machine layout survives in it. */
export function stripInstallMetadata(root) {
  const removed = []
  for (const path of walkPlainFiles(root)) {
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
  const mappings = []
  for (const entry of sourceRoots) {
    const into = typeof entry === 'string' ? '' : entry.into ?? ''
    const raw = resolve(typeof entry === 'string' ? entry : entry.source)
    // realpath canonicalizes symlinked system roots (macOS /var) and 8.3
    // short names (Windows RUNNER~1); the raw form covers sources whose
    // realpath does not expand, so both are tried as matching roots.
    mappings.push({ source: realpathSync(raw), into })
    mappings.push({ source: raw, into })
  }
  return mappings
}

/** True when a link's stored target string is an absolute path (POSIX, UNC, or drive letter). */
function storedTargetIsAbsolute(target) {
  return target.startsWith('/')
    || target.startsWith('\\\\')
    || /^[A-Za-z]:[\\/]/.test(target)
}

// Windows compares paths case-insensitively and tolerates mixed separators,
// but string comparisons do not; normalize before matching mirror roots.
const normalizedKey = value => (process.platform === 'win32'
  ? value.replaceAll('\\', '/').toLowerCase()
  : value)

/**
 * Pure core of mirror-root matching: returns the path of `target` relative to
 * the first mapping root whose normalized key contains it, or undefined.
 * Windows path identity is case-insensitive with mixed separators tolerated;
 * every other platform compares exactly, so two roots differing only by case
 * never mirror each other there.
 */
export function mirrorRelativeFor(sourceRoots, target) {
  const targetKey = normalizedKey(target)
  for (const source of sourceRoots) {
    const sourceKey = normalizedKey(source)
    if (targetKey === sourceKey || !targetKey.startsWith(`${sourceKey}/`)) continue
    const rel = targetKey.slice(sourceKey.length + 1)
    if (rel.length === 0) continue
    return rel
  }
  return undefined
}

function mirrorsTarget(mappings, root, target) {
  const canonicalRoot = realpathSync(resolve(root))
  for (const { source, into } of mappings) {
    const rel = mirrorRelativeFor([source], target)
    if (rel !== undefined) return join(canonicalRoot, into, rel)
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
  // Loop to a fixed point: replacing one link can surface nested ones. A link
  // is portable only when its STORED target is relative AND resolves inside
  // the bundle; an absolute target keeps working solely on the build machine.
  for (;;) {
    const links = walkEntries(root)
      .filter(entry => entry.symlink)
      .map(entry => entry.path)
      .filter(path => storedTargetIsAbsolute(readlinkSync(path)) || !insideBundle(path))
    if (links.length === 0) break
    for (const path of links) {
      const target = realpathSync(path) // throws when dangling: fail closed
      if (insideBundle(path)) {
        // Absolute target that still resolves in-bundle: re-base it relative.
        const linkTarget = relative(realpathSync(dirname(path)), target)
        rmSync(path, { recursive: true, force: true })
        symlinkSync(linkTarget, path, statSync(target).isDirectory() ? 'dir' : 'file')
        replaced.push({ link: relative(root, path), target: linkTarget, kind: 'rebased-link' })
        continue
      }
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

/**
 * The serialization forms one build root can legitimately appear as inside
 * text payloads: the platform-native separators, forward slashes (emitted by
 * many tools on Windows), and JSON/YAML double-backslash escapes. Scrubbing
 * and detection must share this contract or legal inputs leak past one while
 * the other rejects them.
 */
export function prefixForms(prefix) {
  const forms = new Set([prefix, prefix.split('\\').join('/')])
  if (prefix.includes('\\')) forms.add(prefix.split('\\').join('\\\\'))
  return [...forms]
}

/** Erase build-machine absolute path prefixes from text payloads in the bundle. */
export function scrubAbsolutePaths(root, prefixes) {
  const roots = prefixes.map(value => resolve(value)).filter(Boolean).flatMap(prefixForms)
  const scrubbed = []
  for (const path of walkPlainFiles(root)) {
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
    const stored = readlinkSync(entry.path)
    if (storedTargetIsAbsolute(stored)) {
      violations.push(`symlink with absolute stored target: ${relative(root, entry.path)} -> ${stored}`)
      continue
    }
    const target = realpathSync(entry.path)
    const rel = relative(root, target)
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      violations.push(`symlink escapes the bundle: ${relative(root, entry.path)} -> ${target}`)
    }
  }
  const homeRoot = home === undefined ? undefined : resolve(home)
  const machineRoots = homeRoot === undefined ? [] : prefixForms(homeRoot)
  for (const path of walkPlainFiles(root)) {
    const name = basename(path)
    const text = readTextIfTextual(path)
    if (text === undefined) continue
    // JSON (and YAML double-quoted) payloads escape backslashes; scan the raw
    // text plus an unescaped variant so C:\\Users\\... cannot hide.
    const variants = text.includes('\\\\') ? [text, text.split('\\\\').join('\\')] : [text]
    for (const variant of variants) {
      for (const prefix of machineRoots) {
        if (variant.includes(prefix)) violations.push(`build-machine path ${homeRoot} in ${relative(root, path)}`)
      }
    }
    if (/\.(json|ya?ml|lock)$/.test(name)) {
      for (const variant of variants) {
        if (fileReferencePattern.test(variant)) {
          violations.push(`build-time file: reference in ${relative(root, path)}`)
          break
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`Runtime bundle is not portable:\n  - ${violations.slice(0, 20).join('\n  - ')}`)
  }
  return { checked: root }
}
