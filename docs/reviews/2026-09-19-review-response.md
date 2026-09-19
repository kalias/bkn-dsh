# 审核回应：2026-09-19-dsh-0.1.6-compat-review

逐条核实结论：**11 项属实、0 项误报**。以下按审核编号说明处置与证据。审核全文见同目录审核报告；本回应只记差异与验证。

## BLOCKER-1 CI generator override 不一致 — 已修复

- 证据：已提交的 `pnpm-workspace.yaml` 带构建机相对路径（`link:../deepseek-harness/...`），而配置脚本只识别上游占位符。
- 修复：`replaceGeneratorOverride` 改为识别该 override 键的任意 `link:` 值（占位符或已配置形态均可），保持「缺失/重复/非 link 即拒绝」的失败关闭语义；提交的 workspace 文件还原为上游占位符（保留 `allowBuilds.esbuild: true` 修复）；测试新增幂等、畸形拒绝与**真实仓库 workspace 文件**三条用例（tests/configure-pinned-dsh-generator.test.mjs，4/4）。

## BLOCKER-2 Runtime 产物不可移植 — 已修复

- 证据复现：包内 13 个绝对符号链接、55 个文本文件含构建机路径、profile 含 `file:/Users/...` 绝对依赖；`cpSync(dereference:true)` 不解引用嵌套链接是根因之一（另发现 `rmSync` 对指向目录的 symlink 需 `recursive`）。
- 修复（runtime/bundle-portability.mjs + assemble 接线）：
  - `dereferenceSymlinks`：staging 拷贝 + rename 替换每个符号链接，循环至不动点（嵌套链接也覆盖）；
  - `scrubAbsolutePaths`：文本载荷清除构建根前缀（DSH 检出、bkn-dsh、$HOME）；
  - `normalizeProfileDependency`：模板内全部 package.json（含 home 种子）的插件依赖改写为注册表式版本 pin；
  - `scripts/check-runtime-portability.mjs`：CI 门禁（符号链接存活 / 本机路径 / file: 依赖即失败），已接入 workflow。
- 验收实测：检查通过；tar 解压至 `/tmp/isolated-runtime`（远离源码树）后 `find -type l` = 0，`bin/dsh --version` 输出 0.1.6-alpha.2，`web --no-open` 在 3083 端口健康启动（401 鉴权响应），隔离 home 自动种子插件成功。

## BLOCKER-3 构建不可重复且改 manifest 外文件 — 已修复

- 修复：
  - osx-sign 处理折叠进补丁系列：新 `0003-compatible-runtime-lockfile.patch` 同时覆盖 `pnpm-workspace.yaml`（移除未使用的 `@electron/osx-sign` patch 注册）与 `pnpm-lock.yaml`（pnpm 11.7.0 重生成）——补丁完全描述构建源码；
  - `prepare-compatible-runtime.mjs` 删除 LOCAL-ONLY workaround，恢复 `--frozen-lockfile`；
  - CI pnpm 10 → 11.7.0（见 HIGH-1）。
- 验收实测：干净 tag 树 → apply（3 补丁）→ `corepack pnpm@11.7.0 install --frozen-lockfile` 通过（含 `--lockfile-only` 校验）→ 完整构建通过；apply 后工作树 diff 与 manifest 文件清单完全一致。副作用：pnpm 10 下 frozen 安装即刻失败（本地实测复现），这正是统一到 11.7.0 的依据。

## HIGH-1 pnpm 主版本不一致 — 已修复

CI 固定 11.7.0（DSH `packageManager` 声明值）；本地构建以 corepack 11.7.0 执行并验证。

## HIGH-2 Node 版本矛盾 — 已修复

README/README.zh、runtime manifest `bundle.node` 统一为 `^22.19.0 || >=24.0.0`；另在 `bin/dsh`（及 Windows 启动器）加运行时版本守卫，旧 Node 直接拒绝启动并提示。

## HIGH-3 THIRD_PARTY_NOTICES 漂移 — 已修复

`kalias/deepseek-harness` 的 `fix/mcp-credential-credential-headers` 分支 839a2015 曾由 lefthook 基于本地被改的 workspace 重新生成 NOTICE 并带入提交；已还原上游原文件并 amend（新提交 3d291b30cf）。

## MEDIUM-1 credentialHeaders 未被消费 — 采纳方案 2（删补丁缩 fork）

- 关键证据（审核未提及）：0.1.2 原始代码注释明说「DSH 0.1.2's published MCP client has no credentialHeaders schema yet」——插件从最初就是字面 Authorization 头 + 应用层轮换（每回合 `refreshManagedMcpAtTurnStart` 重挂载），补丁 0001 一直未被消费。
- 处置：compat 系列删除该补丁（现为 3 补丁），manifest/runtime manifest/README/CHANGELOG 同步；字面头方案同时兼容已发布与打补丁的 mcp-client，行为与已验证 E2E 一致。DSH 侧实现保留在 `kalias/deepseek-harness:fix/mcp-credential-headers`（含 3 个新单测）供上游通道打开后贡献。
- 注释更新：`openbkn-mcp-manager.ts` 的 0.1.2 陈旧注释改为描述现行设计与轮换策略。

## MEDIUM-2 permission_denied 过度映射 — 已收窄

`LICENSE_REQUIRED` 分类仅作用于 observability 两条路由（`getInteractionOperations/BusinessGraph` 显式 `licenseGated`）；其余路由维持 `AUTHENTICATION_REQUIRED`。新增测试：非 observability 路由的 403 permission_denied（如无权访问某知识网络）不再误报 License。

## MEDIUM-3 DSH 分支缺行为测试 + typert 叠加 — 已补

- `fix/mcp-credential-headers`：新增 `credential-headers.spec.ts`（无凭证头直通 / 引用+prefix 解析 / 无法解析即抛错），3/3 通过；
- `feat/ignorable-session-events-write-side`：`session.spec.ts` 新增写入侧用例（带 intent 落 `ignorable:true`，不带则无标记），通过（读侧持久化接受用例上游已有）；
- `fix/typert-external-protocol` 重建为直接基于 tag 的单提交（不再叠加 mcp 提交）；
- 三个分支已更新推送（fork，force-with-lease）。
- 未覆盖（说明）：reconnect 后的凭证轮换需 fixture 服务级集成测试，属上游合入后补强项。

## MEDIUM-4 Release workflow 无门禁 — 已修复

workflow 在打包前加入：compat apply/verify/revert 闭环、插件全量测试、compat+runtime+配置脚本单测、`package:check`、portability 扫描；publish 依赖 build job 全绿。

## MEDIUM-5 unknown 返回告警 — 已处理

两个能力面接口 `append(...): unknown` 改为 `void`（调用方从不消费返回值；TS 允许实现返回任意值），编译与 118 项测试通过。

## 遗留讨论项（不阻塞，需决策）

1. **observability 路由的 401 语义**：企业版下观察到「凭证保险库令牌过期 → 401 permission_denied（OAuth 文案）→ 面板短暂显示 License 提示，面板重开自动重同步后恢复」。根因是平台对令牌类别/域两类拒绝共用同一错误码；若上游能区分 `license_required` 与 `token_expired`，映射可再精确一层。当前行为可接受（自动恢复），已记录。
2. **sourcemap 内路径清洗策略**：现为前缀抹除（调试映射降级为相对路径）。若要保留可用 sourcemap，需构建期改用相对/匿名 sourceRoot——涉及 DSH 构建配置，建议随上游分支提出。
3. **npm 发布**：`repository` 已就位；发布需 @openbkn org 凭证（docs/market/README.md 已记录）。

## 回归汇总

- 插件测试 118/118；仓库测试（tests+compat+runtime）29/29；`package:check` 通过；
- compat 三补丁 apply/verify/revert 闭环 + pnpm 11.7 冻结安装 + DSH 完整构建通过；
- Runtime 干净重建 → portability 检查通过 → 隔离目录启动（版本/web/自种子）通过；
- 3082 端到端：会话重载、网络绑定徽章、企业版溯源面板完整读取（6 操作 + Receipt 链路）。
