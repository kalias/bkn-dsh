import assert from 'node:assert/strict'
import test from 'node:test'

import { launcher, windowsLauncher } from '../runtime/assemble-compatible-runtime-bundle.mjs'

const plugin = { packageName: '@openbkn/dsh-business-context', version: '0.1.4' }

/** Extract the real `node -e "…"` guard script from a generated launcher. */
function extractGuardScript(launcherText) {
  const match = launcherText.match(/node -e "((?:[^"\\]|\\.)*)"/)
  assert.ok(match, 'generated launcher contains a node -e guard')
  return match[1]
}

/** Run the actual generated guard against a faked process and report the exit path. */
function guardExitCodeFor(script, version) {
  let exited = 0
  const fakeProcess = {
    versions: { node: version },
    exit: code => { exited = code ?? 0; throw new Error('__exit__') },
  }
  const fakeConsole = { error: () => {} }
  try {
    // eslint-disable-next-line no-new-func
    new Function('process', 'console', script)(fakeProcess, fakeConsole)
  } catch (error) {
    if (error instanceof Error && error.message === '__exit__') return exited
    throw error
  }
  return exited
}

const boundaries = [
  ['20.0.0', 1],
  ['22.18.9', 1],
  ['22.19.0', 0],
  ['23.0.0', 1], // the declared range excludes odd/non-LTS 23
  ['23.5.1', 1],
  ['24.0.0', 0],
  ['25.1.0', 0],
]

for (const [launcherFor, name] of [[launcher, 'posix'], [windowsLauncher, 'windows']]) {
  test(`${name} launcher guard enforces ^22.19.0 || >=24.0.0 on the generated script`, () => {
    const script = extractGuardScript(launcherFor(plugin))
    for (const [version, expected] of boundaries) {
      assert.equal(guardExitCodeFor(script, version), expected, `${name} guard misclassifies Node ${version}`)
    }
  })
}

test('windows launcher aborts on guard and bootstrap failure', () => {
  const text = windowsLauncher(plugin)
  const lines = text.split('\n').map(line => line.trim())
  const guardLine = lines.find(line => line.startsWith('node -e'))
  const bootstrapLine = lines.find(line => line.includes('bootstrap-openbkn-plugin.mjs'))
  assert.ok(guardLine?.endsWith('||exit /b 1'), 'guard line must abort the batch on failure')
  assert.ok(bootstrapLine?.endsWith('||exit /b 1'), 'bootstrap line must abort the batch on failure')
})
