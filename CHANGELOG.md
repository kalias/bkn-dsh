# Changelog

All notable changes to this project are documented here.

## Unreleased

- Windows and CI hardening from the online acceptance runs: bash test gates,
  an assembled-runtime entrypoint smoke test, win32 pnpm spawning, and
  case/separator-normalized mirror-root matching with pure matching tests.
- Dropped the darwin-x64 release target (Intel-mac CI runners proved
  unrecoverable); the matrix now covers darwin-arm64 and win32-x64.

## 0.1.3 (2026-09-06)

- Establish the DSH Cordis bundle structure for authenticated, session-bound OpenBKN business context.
- Add a controlled platform-level OSDK runner and safe OpenBKN CLI authentication boundary.
- Add additive native DSH UI contributions for network selection, bound context, prompt suggestions, safe tool summaries, and per-turn provenance.
- Add release package auditing and security guidance.

## 0.1.4 (2026-09-19)

Target DSH: `dsh-v0.1.6-alpha.2` (`ddefc45fbc7f8e46dd73185e68295696d1297887`).

- Retarget the plugin and compatible runtime from `dsh-v0.1.2-rc.1` to `dsh-v0.1.6-alpha.2`: bump every `@deepseek-ai/dsh-*` peer/dev dependency to `0.1.6-alpha.2` and bump the plugin package to `0.1.4`.
- Rebuild the compatibility series as `compat/dsh-0.1.6-alpha.2/` with three patches: external published-protocol recognition in the typert analyzer (without it the analyzer discovers 0 of the plugin's 10 public Remote methods), the write side of ignorable plugin session records (`Session.append` accepts `LogOnlyEventIntent`; the read side is native, but without it stored plugin events refuse session reload), and the release-lockfile pair (the upstream alpha lockfile is inconsistent with its own `patchedDependencies`; the patch removes the unused `@electron/osx-sign` registration and carries the pnpm 11.7 lockfile so installs stay frozen and repeatable). The previous MCP credential-headers patch is dropped: the plugin deliberately mounts the MCP client with a literal Authorization header resolved per turn, which works on published and patched clients alike; a DSH-side implementation stays on `kalias/deepseek-harness` for upstream.
- Adapt plugin sources to the new DSH API surface: `agent/created` listeners must return `undefined`, session navigation moves from `sessions.open(id)` to `UiWorkspace.openSession(id)`, and the resolved MCP client config now carries the upstream `maxInstructionBytes` default.
- Surface an explicit enterprise-license hint when provenance reads are license-gated (#22): the platform reader classifies `permission_denied` gates as `LICENSE_REQUIRED` on the observability routes only, the service reports `openbkn/provenance-license-required` with the deployment's license edition, and the provenance overlay explains the enterprise capability instead of a generic connection/permission message. Platform reads now also send the `x-business-domain` header enterprise deployments authorize on (configurable via `businessDomain`).
- Make the runtime bundle portable: symlinked closure entries are replaced with real copies, build-machine paths are scrubbed from text payloads, the seeded profile keeps a registry-style pin instead of a build-time `file:` path, and `scripts/check-runtime-portability.mjs` fails the release when any of these regress. The launcher now also refuses Node builds older than the supported range.
- Unify toolchain contracts: CI uses pnpm 11.7.0 (the DSH-pinned version) with a frozen lockfile, and Node requirements read `^22.19.0 || >=24.0.0` everywhere (READMEs, runtime manifest, plugin engines, launcher guard).
- Sync the compatible-runtime workflow and runtime manifests to the new DSH tag, plugin artifact `openbkn-dsh-business-context-0.1.4.tgz`, and bundle version `0.1.6-alpha.2-openbkn.1`, and add pre-package gates (compatibility round-trip, plugin tests, compatibility/runtime unit tests, package check, portability scan).
- Verified on a clean `dsh-v0.1.6-alpha.2` worktree: apply/verify revert round-trip with a frozen pnpm 11.7 install, full DSH build, plugin tests 119/119, native plugin install, isolated-directory runtime boot, and web-profile E2E with enterprise provenance reads.
