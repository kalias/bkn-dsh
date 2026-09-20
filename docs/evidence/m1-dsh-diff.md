# M1：DSH 上游差异评估与版本决策

日期：2026-09-19。评估方法：`git show/grep` 对照 `dsh-v0.1.2-rc.1`（a66e470）与 `dsh-v0.1.6-alpha.2`（deepseek-harness 本地克隆），结论以源码位置为证；API 全量差异用「版本 bump 后编译报错」在 M4 实证补全（见 m4 记录）。

## 版本决策

**主目标维持 `dsh-v0.1.6-alpha.2`**（当前 GitHub 最新 release，2026-09-17）。

理由：
- 4 个补丁中 1 个已被上游原生吸收（补丁 3），2 个仍需移植且改动面可控（补丁 1 重制、补丁 2 预计原样可用），无重大结构性冲突信号。
- 回退条件（预估移植 >2 天）未触发；若 M4 编译中发现 API 破坏面过大，按计划回退 `dsh-v0.1.5-rc.2` 并在此更新。

## 4 个补丁的逐项结论

### 补丁 1（credential-backed-mcp-headers）——仍需移植，需重制
- 0.1.6-alpha.2 的 `packages/mcp/mcp-client/` 无 `credentialHeaders`/`CredentialHeader`（git grep 零命中），能力未上游化。
- 重制注意点（源码已变化，不能机械 rebase）：
  - `src/transport.ts` 重写为更精简实现：MCP SDK 导入从 `@modelcontextprotocol/sdk/client/*` 改为 `@modelcontextprotocol/client`，env 构建改用 `scrubbedParentEnv()`（dsh-subprocess）；原补丁的 `createTransportForContext`/`resolveHttpHeaders` 需按新文件重写。
  - `src/connection.ts` 调用点仍为 `createTransport(config)`（新文件 line 307），替换为 `await createTransportForContext(ctx, config)`。
  - `src/index.ts` 的 `StreamableHttpConfig` schema 需重新对照（新文件结构有变）。
  - `credentialRef` 仍在 `packages/credentials/credentials/src/index.ts:29`；`launchEnvironmentOf` 仍在 `packages/util/launch-environment/src/index.ts:114`，补丁依赖的两个 seam 均可用。
  - `package.json`/`tsconfig.json` 的依赖与 references 需按新文件重新生成。

### 补丁 2（third-party-typert-protocol）——预计仍需，M4 实证确认
- 新 `analyzer.ts` 大幅增长（1847 行 → 3100+ 行）。`isTypeMetaSymbol`（~line 1930）仍只认「注册根内文件」与源内 `declare module '@deepseek-ai/dsh-typert-protocol'` 两种形态；`externalModuleIdentityForFile`（line 3171）新增的用途在跨包引用解析（line 2535），未见把 node_modules 中已发布协议包纳入 type-meta 识别的逻辑。
- 判定：外部插件从 node_modules 消费 `@deepseek-ai/dsh-typert-protocol` 的场景大概率仍需该 2 行补丁；实证方法 = M4 用未打此补丁的新 DSH 树构建插件，若复现 `publishes Remote artifacts but has no Remote methods` 则确认保留。
- 补丁上下文行号已漂移（原 @@ -1847 附近 → 需在新文件重新定位 `isTypeMetaSymbol`），补丁需重生成。

### 补丁 3（ignorable-plugin-session-events）——已被上游原生提供，删除
- 0.1.6-alpha.2 原生支持 ignorable 事件信封：
  - `packages/core/session/src/index.ts:212`（`case 'ignorable'`）、`:225`（校验 `event['ignorable'] !== true`）；
  - `surface.ts:284-285`：未知类型 + `ignorable === true` 的事件不影响 surface；
  - `types.ts:82` 起、`known-event-types.ts` 均有原生 `SessionEvent.ignorable` 语义，且仓库内留有设计笔记 `2026-08-30-retain-ignorable-external-session-events.md`。
- 行动：新 compat 系列不含此补丁；插件源码中 emit 侧用法经编译与测试验证（M4）。

### 补丁 4（compatible-runtime-lockfile）——按最终补丁集重新生成
- pnpm-lock.yaml 条目取决于补丁 1 移植后 mcp-client 的新增依赖（dsh-credentials、dsh-launch-environment）；在新工作树上 apply 全部补丁后 `git diff pnpm-lock.yaml` 重新导出。

## 插件 API 依赖面（待 M4 实证）

插件源码/客户端 import 的 DSH 包（按引用次数）：dsh-client-ui-slots(9)、cordis(6)、dsh-client-ui-conversation(4)、dsh-api-remotes(4)、dsh-session(3)、dsh-tools(2)、dsh-client-ui-workspace/tool/layout(2×3)、dsh-api-session-controller(2)、dsh-agent(2)、以及 dsh-util-values、dsh-typert-protocol、dsh-subprocess、dsh-storage-domain、dsh-mcp-client、dsh-credentials、dsh-client-ui-sidebar/session/renderer/chat、dsh-api-workspace-controller 各 1。
两 tag 间上游总差异量级：9687 files changed（含 vendor/web 资产）。全量 API 差异清单由 M4 的 bump→编译报错清单充当（见 `docs/evidence/m4-*.md`）。

## 新版 DSH 侧配套确认

- `apps/cli/src/plugin.ts` 仍存在（`dsh plugin` 管理命令保留），M4.6 的 `pnpm dsh plugin --profile web add file:*.tgz` 路径可用。
- 根 `package.json` scripts：`build:lib:host`/`build:lib:client` 仍在，`dsh` 入口 `apps/cli/src/bin.ts` 不变。
- 根 packageManager：`pnpm@11.7.0`（本机 11.21.0 兼容）。
