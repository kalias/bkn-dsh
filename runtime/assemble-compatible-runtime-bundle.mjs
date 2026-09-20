import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { dereferenceSymlinks, scrubAbsolutePaths, stripInstallMetadata } from './bundle-portability.mjs'

const patchedDependencies = [
  '@deepseek-ai/dsh-mcp-client',
  '@deepseek-ai/dsh-session',
]
const embeddedCli = ['node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js']
const bootstrapSource = fileURLToPath(new URL('./bootstrap-openbkn-plugin.mjs', import.meta.url))

function assertFile(path, message) {
  if (!existsSync(path)) throw new Error(message)
}

/** The bundled profile is pre-installed; keep only the registry-style pin. */
function normalizeProfileDependency({ directory, manifest }) {
  const template = join(directory, 'profile-template')
  const manifests = [join(template, 'web', 'package.json')]
  // DSH's plugin manager records a file: dependency wherever it touched a
  // package.json (the live profile and any seeded home copy).
  const collect = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules') continue
      const path = join(current, entry.name)
      const manifestPath = join(path, 'package.json')
      if (entry.isDirectory() && existsSync(manifestPath)) manifests.push(manifestPath)
      collect(path)
    }
  }
  collect(template)
  for (const path of manifests.filter(existsSync)) {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed.dependencies?.[manifest.plugin.packageName] === undefined) continue
    if (parsed.dependencies[manifest.plugin.packageName] !== manifest.plugin.version) {
      parsed.dependencies[manifest.plugin.packageName] = manifest.plugin.version
      writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
    }
  }
}

function archiveFor(manifest, platform) {
  const archive = manifest?.bundle?.archives?.find((entry) => entry.platform === platform)
  if (archive === undefined) throw new Error(`Compatible runtime manifest does not support ${platform}.`)
  return archive
}

export function launcher(plugin) {
  return `#!/usr/bin/env sh
set -eu
node -e "const v=process.versions.node.split('.').map(Number);if(!((v[0]===22&&v[1]>=19)||v[0]>=24)){console.error('OpenBKN runtime requires Node ^22.19.0 || >=24.0.0 (current: '+process.versions.node+')');process.exit(1)}"
bundle_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
: "\${OPENBKN_DSH_HOME:=\${XDG_DATA_HOME:-$HOME/.local/share}/openbkn-dsh}"
export DSH_HOME="$OPENBKN_DSH_HOME"
case "\${1:-}" in
  --help|-h|-V|--version) ;;
  *) node "$bundle_dir/bootstrap-openbkn-plugin.mjs" "$DSH_HOME" "$bundle_dir/profile-template/web" "${plugin.packageName}" "${plugin.version}" ;;
esac
exec node "$bundle_dir/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"
`
}

export function windowsLauncher(plugin) {
  return `@echo off
setlocal
node -e "const v=process.versions.node.split('.').map(Number);if(!((v[0]===22&&v[1]>=19)||v[0]>=24)){console.error('OpenBKN runtime requires Node ^22.19.0 || >=24.0.0 (current: '+process.versions.node+')');process.exit(1)}"||exit /b 1
if "%OPENBKN_DSH_HOME%"=="" set "OPENBKN_DSH_HOME=%LOCALAPPDATA%\\OpenBKN\\dsh"
set "DSH_HOME=%OPENBKN_DSH_HOME%"
if "%~1"=="--help" goto run
if "%~1"=="-h" goto run
if "%~1"=="-V" goto run
if "%~1"=="--version" goto run
node "%~dp0..\\bootstrap-openbkn-plugin.mjs" "%DSH_HOME%" "%~dp0..\\profile-template\\web" "${plugin.packageName}" "${plugin.version}"||exit /b 1
:run
node "%~dp0..\\runtime\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" %*
`
}

/**
 * Copy a pre-deployed DSH CLI and its patched production closure into one
 * user-unpackable bundle. It deliberately accepts no global DSH path.
 */
export function assembleCompatibleRuntimeBundle({ runtimeDirectory, profileDirectory, outputDirectory, pluginTarball, manifest, platform }) {
  const runtime = resolve(runtimeDirectory)
  const output = resolve(outputDirectory)
  const plugin = resolve(pluginTarball)
  const profile = resolve(profileDirectory)
  const archive = archiveFor(manifest, platform)
  assertFile(join(runtime, ...embeddedCli), 'Compatible runtime source is missing its built DSH CLI.')
  for (const dependency of patchedDependencies) {
    assertFile(join(runtime, 'node_modules', dependency), `Compatible runtime source is missing patched dependency closure: ${dependency}`)
  }
  assertFile(plugin, 'Compatible runtime plugin tarball does not exist.')
  assertFile(join(profile, 'package.json'), 'Compatible runtime profile template does not exist.')

  const directory = join(output, basename(archive.file).replace(/\.(tar\.gz|zip)$/, ''))
  if (existsSync(directory)) throw new Error(`Compatible runtime bundle already exists: ${directory}`)
  mkdirSync(join(directory, 'bin'), { recursive: true })
  // keep symlinks verbatim: dereferencing here would copy .bin entries onto
  // their link path and break scripts that resolve modules relative to their
  // real location; the portability sweep below replaces links appropriately
  cpSync(runtime, join(directory, 'runtime'), { recursive: true })
  mkdirSync(join(directory, 'plugins'), { recursive: true })
  cpSync(plugin, join(directory, 'plugins', manifest.plugin.artifact))
  cpSync(profile, join(directory, 'profile-template', 'web'), { recursive: true })
  cpSync(bootstrapSource, join(directory, 'bootstrap-openbkn-plugin.mjs'))
  // pnpm's deploy closure keeps absolute symlinks (vendor links, .bin entries)
  // and inline source maps keep build-machine paths; neither survives a move
  // to another machine, so replace links with real copies and erase the
  // build roots from text payloads before anything is archived.
  dereferenceSymlinks(directory, [{ source: runtime, into: 'runtime' }, { source: profile, into: join('profile-template', 'web') }])
  stripInstallMetadata(directory)
  scrubAbsolutePaths(directory, [dirname(runtime), dirname(plugin), dirname(profile), homedir()])
  normalizeProfileDependency({ directory, manifest })
  writeFileSync(join(directory, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const launcherPath = join(directory, 'bin', 'dsh')
  writeFileSync(launcherPath, launcher(manifest.plugin))
  chmodSync(launcherPath, 0o755)
  if (platform.startsWith('win32-')) {
    writeFileSync(join(directory, 'bin', 'dsh.cmd'), windowsLauncher(manifest.plugin))
  }
  return { directory, archive }
}
