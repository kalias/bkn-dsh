import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { replaceGeneratorOverride } from '../scripts/configure-pinned-dsh-generator.mjs'

const placeholder = `packages:\n  - packages/*\n\noverrides:\n  '@deepseek-ai/dsh-typert-generator': link:../../../../../DSH/deepseek-harness/packages/typert/generator\n`
const alreadyConfigured = `packages:\n  - packages/*\n\noverrides:\n  '@deepseek-ai/dsh-typert-generator': link:../deepseek-harness/packages/typert/generator\n`

test('replaces the pristine placeholder override', () => {
  assert.equal(
    replaceGeneratorOverride(placeholder, 'link:release/deepseek-harness/packages/typert/generator'),
    placeholder.replace('link:../../../../../DSH/deepseek-harness', 'link:release/deepseek-harness'),
  )
})

test('replaces an already-configured local override and is idempotent', () => {
  const once = replaceGeneratorOverride(alreadyConfigured, 'link:release/deepseek-harness/packages/typert/generator')
  assert.equal(once, placeholder.replace('link:../../../../../DSH/deepseek-harness', 'link:release/deepseek-harness'))
  assert.equal(replaceGeneratorOverride(once, 'link:release/deepseek-harness/packages/typert/generator'), once)
})

test('refuses a missing, duplicated, or non-link override', () => {
  assert.throws(() => replaceGeneratorOverride('packages: []\n', 'link:x'), /exactly one/)
  assert.throws(() => replaceGeneratorOverride(`${placeholder}${alreadyConfigured}`, 'link:x'), /exactly one/)
  const notALink = placeholder.replace('link:../../../../../DSH/deepseek-harness/packages/typert/generator', '9.9.9')
  assert.throws(() => replaceGeneratorOverride(notALink, 'link:x'), /exactly one/)
})

test('configures the real repository workspace file', () => {
  const workspace = readFileSync(fileURLToPath(new URL('../pnpm-workspace.yaml', import.meta.url)), 'utf8')
  const configured = replaceGeneratorOverride(workspace, 'link:release/deepseek-harness/packages/typert/generator')
  assert.match(configured, /'@deepseek-ai\/dsh-typert-generator': link:release\/deepseek-harness\/packages\/typert\/generator/)
})
