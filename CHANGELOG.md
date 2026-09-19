# Changelog

All notable changes to this project are documented here.

## Unreleased

- Establish the DSH Cordis bundle structure for authenticated, session-bound OpenBKN business context.
- Add a controlled platform-level OSDK runner and safe OpenBKN CLI authentication boundary.
- Add additive native DSH UI contributions for network selection, bound context, prompt suggestions, safe tool summaries, and per-turn provenance.
- Add release package auditing and security guidance.

## 0.1.4 (2026-09-19)

Target DSH: `dsh-v0.1.6-alpha.2` (`ddefc45fbc7f8e46dd73185e68295696d1297887`).

- Retarget the plugin and compatible runtime from `dsh-v0.1.2-rc.1` to `dsh-v0.1.6-alpha.2`: bump every `@deepseek-ai/dsh-*` peer/dev dependency to `0.1.6-alpha.2` and bump the plugin package to `0.1.4`.
- Rebase the compatibility series as `compat/dsh-0.1.6-alpha.2/`: re-port the credential-backed Streamable HTTP MCP headers onto the rewritten `packages/mcp/mcp-client` transport, re-base external published-protocol recognition in `packages/typert/generator/src/analyzer.ts` (required: without it the analyzer discovers 0 of the plugin's 10 public Remote methods), and regenerate the lockfile patch. The ignorable session-events patch is dropped — `dsh-v0.1.6-alpha.2` natively supports ignorable session records.
- Adapt plugin sources to the new DSH API surface: `agent/created` listeners must return `undefined`, session navigation moves from `sessions.open(id)` to `UiWorkspace.openSession(id)`, and the resolved MCP client config now carries the upstream `maxInstructionBytes` default.
- Sync the compatible-runtime CI workflow and runtime manifests to the new DSH tag, plugin artifact `openbkn-dsh-business-context-0.1.4.tgz`, and bundle version `0.1.6-alpha.2-openbkn.1`.
- Verified on a clean `dsh-v0.1.6-alpha.2` worktree: apply/verify revert round-trip, full DSH build, plugin build with 113/113 tests passing, native plugin install, and web-profile boot listing the OpenBKN sidebar entry with authenticated platform connection and network discovery.
