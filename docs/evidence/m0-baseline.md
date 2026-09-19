# M0 基线验证（2026-09-19）
- bkn-dsh @ c4a87cb, DSH @ dsh-v0.1.2-rc.1 (a66e470) + compat 4 补丁已应用
- pnpm-workspace.yaml: allowBuilds.esbuild=true（修复占位符）; generator override -> ../deepseek-harness
- pnpm install --no-frozen-lockfile: OK
- pnpm --filter @openbkn/dsh-business-context build: OK (host 71.96kB + client 258.02kB)
- pnpm --filter @openbkn/dsh-business-context test: 113 pass / 0 fail
OpenBKN DSH compatibility verified: dsh-0.1.2-rc.1/openbkn-business-context.1.
