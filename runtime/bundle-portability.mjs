import { cpSync, lstatSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const scrubExtensions = new Set(['.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.map', '.html', '.txt', '.md'])
const scrubByteLimit = 32 * 1024 * 1024

function walkFiles(root) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else if (entry.isSymbolicLink()) files.push(path)
    }
  }
  visit(root)
  return files
}

function isProbablyText(path) {
  const dot = path.slice(path.lastIndexOf('/'))
  const extension = dot.slice(dot.indexOf('.'))
  return scrubExtensions.has(extension)
}

/** Replace every surviving symlink with a real copy of its resolved target. */
export function dereferenceSymlinks(root) {
  const replaced = []
  // Loop to a fixed point: copying a directory target can itself introduce
  // nested symlinks, and each pass must see the tree as it is now.
  for (;;) {
    const links = walkFiles(root).filter(path => lstatSync(path).isSymbolicLink())
    if (links.length === 0) break
    for (const path of links) {
      const target = realpathSync(path) // throws when dangling: fail closed
      const wasDirectory = statSync(target).isDirectory()
      // Stage beside the link, then rename over it: cpSync's dereference
      // mode refuses directory sources whose resolved src equals dest, and a
      // plain rename keeps this atomic without touching the target tree.
      const staging = `${path}.openbkn-portable-copy`
      rmSync(staging, { recursive: true, force: true })
      cpSync(target, staging, { recursive: true })
      // recursive is required for links whose target is a directory
      rmSync(path, { recursive: true, force: true })
      renameSync(staging, path)
      replaced.push({ link: relative(root, path), wasDirectory })
    }
  }
  return replaced
}

/** Erase build-machine absolute path prefixes from text files in the bundle. */
export function scrubAbsolutePaths(root, prefixes) {
  const roots = prefixes.map(value => resolve(value)).filter(Boolean)
  const scrubbed = []
  for (const path of walkFiles(root)) {
    if (!isProbablyText(path)) continue
    if (statSync(path).size > scrubByteLimit) continue
    const original = readFileSync(path, 'utf8')
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

/** Fail-closed portability scan over one assembled bundle directory. */
export function assertPortableBundle({ directory, home }) {
  const root = resolve(directory)
  const violations = []
  for (const path of walkFiles(root)) {
    if (lstatSync(path).isSymbolicLink()) violations.push(`absolute or relative symlink survived: ${relative(root, path)}`)
  }
  const machineRoots = home === undefined ? [] : [resolve(home)]
  for (const path of walkFiles(root)) {
    if (!isProbablyText(path)) continue
    if (statSync(path).size > scrubByteLimit) continue
    const text = readFileSync(path, 'utf8')
    for (const prefix of machineRoots) {
      if (text.includes(prefix)) violations.push(`build-machine path ${prefix} in ${relative(root, path)}`)
    }
    if (/file:\/\/\/|file:\//.test(text) && /"dependencies"[\s\S]{0,400}file:\//.test(text)) {
      violations.push(`absolute file: dependency in ${relative(root, path)}`)
    }
  }
  if (violations.length > 0) {
    throw new Error(`Runtime bundle is not portable:\n  - ${violations.slice(0, 20).join('\n  - ')}`)
  }
  return { checked: root }
}
