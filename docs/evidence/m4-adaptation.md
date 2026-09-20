# M4：bkn-dsh 适配 DSH 0.1.6-alpha.2 记录

> **注记（2026-09-20）**：本文为当时证据快照。第 5 节「原补丁 3（ignorable session events）已删除」的表述已被后续修改取代——M5 期间 compat 系列**恢复**了该补丁的写入侧（0003，`Session.append` 非界面事件接受 `LogOnlyEventIntent`；读侧原生、写入侧缺失；恢复提交 `00d5942`），2026-09-20 的 G2 实验证实其必要性：缺写入侧时插件事件以 required 持久化，DSH 重启后拒绝重载。历史正文保留下文不作改写。

日期：2026-09-19。

## 新 compat 系列 `compat/dsh-0.1.6-alpha.2/`
- manifest：tag `dsh-v0.1.6-alpha.2`，baseCommit `ddefc45fbc7f8e46dd73185e68295696d1297887`。
- 补丁 0001（MCP 凭证头，重制）：新 transport/connection/index + package.json + tsconfig.json。新版 mcp-client 改用 `@modelcontextprotocol/client` 与 `scrubbedParentEnv`，补丁按新代码重写；`credentialRef`（packages/credentials/credentials）与 `launchEnvironmentOf`（packages/util/launch-environment）两个 seam 在新版仍存在。
- 补丁 0002（Typert 外部协议识别，重定位）：`analyzer.ts` 的 `isTypeMetaSymbol`（原 1847 行处 → 现 registration 检查后）。**实证必要性**：去除该补丁时 `typert-analysis-contract` 测试发现 Remote 方法 0/10（应为 10）；恢复后 10/10。
- 补丁 0003（lockfile）：pnpm-lock.yaml 对应 0001 新增源码依赖的条目。
- 原补丁 3（ignorable session events）已删除：0.1.6-alpha.2 原生支持（surface.ts:284 等处理 `ignorable === true`）。

## 验证
- `apply.mjs`（干净树）→ applied；重复执行 → "already-applied"；`--revert` → reverted；再 apply+verify → verified。**幂等闭环通过**。
- compat 单元测试 `node --test tests/*.test.mjs`：5/5 通过（apply 3 + verify 2）。
- DSH 打补丁树：`pnpm install --no-frozen-lockfile && pnpm build` 全量构建通过（host + client + web）。

## 插件侧变更（bkn-dsh 工作树，未提交）
1. 版本 bump：`packages/openbkn-business-context/package.json` 与根 `package.json` 中所有 `@deepseek-ai/dsh-*` → `0.1.6-alpha.2`（共 32+1 处）；插件版本 0.1.3 → **0.1.4**；`pnpm-workspace.yaml` generator override → `../deepseek-harness`；`allowBuilds.esbuild: true`（修复仓库内占位符文本导致 pnpm 11 拒绝安装的问题）。
2. 源码适配（编译报错驱动，共 3 处 API 差异）：
   - `business-context-service.ts`：新版事件监听器要求返回 `Promise<undefined> | undefined`，`agent/created` 回调显式 `return undefined`。
   - `client/index.tsx`：`sessions.open(id)` 已移除，改用 `uiWorkspace.openSession(id)`（client/ui-workspace navigation 接口）。
   - `tests/openbkn-mcp-manager.test.ts`：新版 mcp-client schema 新增 `maxInstructionBytes` 默认 32768，更新 deepEqual 期望。
3. 构建与测试：`pnpm --filter @openbkn/dsh-business-context build`（host+client）通过；`pnpm test` **113/113 通过**（含 typert contract 4 项）。
4. pack + 安装：`openbkn-dsh-business-context-0.1.4.tgz` → `pnpm dsh plugin --profile web add` 成功；`dsh plugin --profile web list` 列出 `@openbkn/dsh-business-context@0.1.4`。
5. `pnpm dsh web` 启动成功（http://127.0.0.1:3080，token URL 输出）；插件宿主侧仅报「baseUrl missing required value」——首次安装未配置平台地址的预期状态，配置后激活（M5）。

## 过程中的环境类发现（与插件无关）
- DSH 源码树的 lib 必须与源码同步重建（曾在混合旧 lib 下出现 registry 校验契约错乱假象）。
- DSH web profile（~/.dsh/profiles/web）的 pnpm-workspace.yaml 存在 YAML 重复键（koffi/protobufjs 各出现两次且值相反），pnpm 11 拒绝解析；已备份后去重（保留 true 值，与 onlyBuiltDependencies 一致）。该 profile 由社区插件使用 pnpm 10 装载，升级 pnpm 11 需 `CI=true pnpm install` 迁移 store。
- 用户 profile 中的旧社区插件（@michengai/* 等）按旧 typert 契约构建，在 0.1.6-alpha.2 下注册报 "no create() factory"——属上游插件未跟进新版 DSH，非本项目改动引起。
