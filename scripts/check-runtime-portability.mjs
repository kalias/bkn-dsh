import { homedir } from 'node:os'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadRuntimeManifest } from '../runtime/runtime-manifest.mjs'
import { assertPortableBundle } from '../runtime/bundle-portability.mjs'

function valueAfter(args, flag) {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

export function runCheck(args) {
  const outputDirectory = valueAfter(args, '--output')
  const platform = valueAfter(args, '--platform')
  if (outputDirectory === undefined || platform === undefined) {
    throw new Error('Usage: node scripts/check-runtime-portability.mjs --output <release-artifacts> --platform <darwin-arm64|win32-x64>')
  }
  const manifest = loadRuntimeManifest(new URL('../runtime/openbkn-dsh-runtime.manifest.json', import.meta.url))
  const archive = manifest.bundle.archives.find(entry => entry.platform === platform)
  if (archive === undefined) throw new Error(`Compatible runtime manifest does not support ${platform}.`)
  const directory = join(resolve(outputDirectory), archive.file.replace(/\.(tar\.gz|zip)$/, ''))
  const bundled = readdirSync(resolve(outputDirectory), { withFileTypes: true })
    .some(entry => entry.isDirectory() && entry.name === archive.file.replace(/\.(tar\.gz|zip)$/, ''))
  if (!bundled) throw new Error(`Assembled bundle directory not found: ${directory}`)
  return assertPortableBundle({ directory, home: homedir() })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCheck(process.argv.slice(2))
    console.log('Runtime bundle portability check passed.')
  } catch (error) {
    console.error(`Runtime portability check: ${error.message}`)
    process.exitCode = 1
  }
}
