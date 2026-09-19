# DSH 0.1.6-alpha.2 Compatibility Patch

[中文](README.zh.md)

This source package prepares an exact DeepSeek Harness `dsh-v0.1.6-alpha.2` checkout for OpenBKN Business Context. It is a temporary compatibility bridge, not a replacement for DSH's plugin manager.

## Supported target

Only a clean Git source checkout at commit `ddefc45fbc7f8e46dd73185e68295696d1297887` (tag `dsh-v0.1.6-alpha.2`) is supported. Do not use it on a desktop application bundle, a different DSH release, or a worktree with local changes.

The series adds only the capabilities required by the plugin and reproducible
runtime build:

- credential references for streamable HTTP MCP headers (rebased onto the
  rewritten `packages/mcp/mcp-client` transport, which now imports
  `@modelcontextprotocol/client` and `scrubbedParentEnv`);
- recognition of the published Typert protocol in an external plugin
  (`packages/typert/generator/src/analyzer.ts`, `isTypeMetaSymbol`); without
  it the analyzer discovers 0 of the plugin's 10 public Remote methods;
- the write side of ignorable plugin session records: `Session.append` accepts
  a `LogOnlyEventIntent` (`{ ignorable: true }`) for non-surface events. The
  read side is native in `dsh-v0.1.6-alpha.2`, but without the write side a
  plugin-owned event is persisted as required and the stored session refuses
  to reload in any harness that lacks the plugin;
- lockfile entries for the added source dependencies.

It never reads or writes an OpenBKN token.

## Apply and verify

From a checked-out copy of this repository:

```bash
node compat/dsh-0.1.6-alpha.2/apply.mjs --dsh /path/to/deepseek-harness
node compat/dsh-0.1.6-alpha.2/verify.mjs --dsh /path/to/deepseek-harness
```

Rebuild the patched DSH checkout using its normal build instructions. Then
build the local plugin artifact and install it through DSH's native plugin command:

```bash
pnpm --filter @openbkn/dsh-business-context build
pnpm --filter @openbkn/dsh-business-context pack --pack-destination /tmp/openbkn-plugin
pnpm dsh plugin --profile web add file:/tmp/openbkn-plugin/openbkn-dsh-business-context-0.1.3.tgz
```

To remove the complete series before changing DSH version:

```bash
node compat/dsh-0.1.6-alpha.2/apply.mjs --dsh /path/to/deepseek-harness --revert
```

The command verifies every patch digest, the exact base revision, a clean target, and the full patch series before modifying anything. If a check fails, it makes no change.
