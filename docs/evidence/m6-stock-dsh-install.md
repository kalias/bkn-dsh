# M6：原版（未打补丁）DSH 直装实验记录（G2 决定性实验）

日期：2026-09-20。目的：回答差距分析 G2——预构建插件 tgz 能否装进干净的 `dsh-v0.1.6-alpha.2` 并正常工作，从而决定分发形态（npm/tgz 直装 vs 仅 Runtime）。

**结论先行：悲观分支成立。** 安装、加载、入口、Remote 调用、绑定全部在原版宿主上成功；但绑定产生的插件会话事件以 required 形式持久化，**DSH 一重启，该会话即被拒绝重载——且此时插件仍处于安装状态**。原版 DSH 的事件类型白名单是构建期生成的静态集合，插件事件按构造不在其中，唯一兼容机制是 `SessionEvent.ignorable` 标记，而该标记的写入侧正是 compat 补丁 0003。npm/tgz 直装不能作为主分发形态；Runtime（含补丁）仍是唯一受支持形态。

## 环境

- DSH：`git clone --depth 1 --branch dsh-v0.1.6-alpha.2` → `/tmp/dsh-stock`（`ddefc45f`，零 compat apply），pnpm 11.7.0（与上游 `packageManager` pin 一致），node v24.19.0。
- 插件：`/tmp/g2-plugin-head/openbkn-dsh-business-context-0.1.4.tgz`，**从纯 HEAD `500d0a7` 经独立 git worktree 构建**（见「产物纯度」节），sha256 `8cd2776f…`。构建经工作区 `pnpm-workspace.yaml` 链接的补丁版 typert generator——这正是「预构建」的定义。六项结论以该产物为准（`8cd2776f`）。
- 隔离 home：`DSH_HOME=/tmp/g2-dsh-home`（不触碰 `~/.dsh` 与工作区 `deepseek-harness`，后者全程保持 5 个未 revert 文件不变）。
- 平台：`https://192.168.50.28`（kind-bkn-dev，EE 0.1.4），`NODE_EXTRA_CA_CERTS=~/.dsh/openbkn-dev-ca.pem`；baseUrl 经 profile `cordis.patch.yml` 配置，token 由 `openbkn` CLI 凭证库（admin，未过期）经宿主握手取得，未落任何文件。
- 模型：`DEEPSEEK_API_KEY` 在本实验环境不可用 → ④的问答环节受阻（见下）。

## 前置步骤（含计划外发现）

```bash
cd /tmp/dsh-stock
pnpm install          # 9.2s 成功（store 命中）；未改写 pnpm-lock.yaml
pnpm install --frozen-lockfile   # 复跑亦通过（254ms, Already up to date）
pnpm build            # 全量成功（host+client+web，248 client artifacts）
```

**发现 A（与 compat README 表述的差异）**：stock 树在 pnpm 11.7.0 下安装与源码构建均不触发锁文件问题——该问题只影响 Runtime 打包的 deploy 闭包（补丁 0004 的场景）。源码路径用户无需锁文件补丁即可构建运行原版 DSH。

安装与配置：

```bash
DSH_HOME=/tmp/g2-dsh-home pnpm dsh plugin --profile web add file:/tmp/g2-plugin/openbkn-dsh-business-context-0.1.4.tgz
# → initialized profile web；+5 packages；exit 0（仅 3 条 peer 缺失警告：dsh-tools/dsh-typert-protocol/dsh-util-values，profile 层面，不影响运行）
# profile/cordis.patch.yml 写入：- id: openbkn-business-context / config.baseUrl: https://192.168.50.28
DSH_HOME=… NODE_EXTRA_CA_CERTS=… pnpm dsh web   # http://127.0.0.1:3080
```

## 产物纯度（首轮污染与纯 HEAD 复验）

首轮 tgz（`9c98cced…`，111,071 B）于 18:09 在主工作树直接构建——当时树中已混入**另一条并发工作流未提交的 provenance v1-v2 改动**（`turn-timeline.ts` 等，17:14–17:21 落盘，晚于本实验开始、早于构建；打包产物中确含 `turn-timeline.d.ts`）。该工作流不触碰绑定事件写入路径，但为消除证据疑点，改用 `git worktree add --detach /tmp/bkn-dsh-head 500d0a7` + 指向补丁树的同名 `../deepseek-harness` 符号链接，从纯 HEAD 重建 tgz（`8cd2776f…`，99,695 B，timeline 零命中），并在全新隔离 home（`/tmp/g2-home2`）上复验关键路径：①加载②入口③面板列网④「继续会话」绑定（entry 渲染 + 会话事件落盘 seq 3）⑤重启后拒绝重载（`Failed to load history … session-47b75dcf… "openbkn/business-network-bound" (seq 3) unknown to this harness and not marked ignorable`，截图 `m6-stock-dsh-reload-refused-head.png`）——**与首轮逐字同形**。⑥（卸载后）在纯产物上补充观察到：无插件时不可读会话**从侧栏列表整体消失**（磁盘日志完好），比首轮「列表可见+报错横幅」更隐蔽；其拒绝机理与⑤同源（静态白名单不含插件事件，与插件在否无关）。首轮完整六项记录（含 turn 会话 5de38d83 与两张截图）保留在下文，作为同一结论的双重实证。

> 注：并发 provenance 工作流的未提交改动（约 20 个文件 + 新增 `turn-timeline.*`、`docs/evidence/2026-09-20-provenance-v1-v2.md`、`docs/plans/`）与本实验互不触碰；本实验全程未改动主工作树任何 tracked 文件（新增仅本文件与三张截图）。

## 六项逐条记录（首轮，污染产物；结论已被纯 HEAD 复验覆盖确认）

**① 插件加载、控制台报错 —— 通过。** `dsh plugin --profile web list` 列出 `@openbkn/dsh-business-context@0.1.4`；web 端 Plugins 面板显示 Installed(1) `business-context`，开关已启用；宿主无报错（首轮无 baseUrl 时报「baseUrl missing required value」为预期初始态，配置后消失）。

**② 侧栏 OpenBKN 入口 —— 通过。** 侧栏渲染「OpenBKN business knowledge networks」按钮（图标 B + OpenBKN）；页面版本标识 `DSH Local Build 0.1.6-alpha.2-ddefc45` 确认原版构建；默认 agent preset 即 standard（不触发 PTC 缺陷）。见 `m6-stock-dsh-bound-session.png`。

**③ Remote 方法 10/10 —— 注册 10/10，实测 4 类。** 预构建产物 `lib/typert.remote-client.d.ts/js` 随 tgz 安装，`TypertRemoteMap` 恰好 10 个方法（beginLogin/bindNetwork/bindNetworkWorkspace/configureToken/getNetworkBinding/getSessionSuggestions/getTurnProvenance/getTurnProvenanceView/listNetworks/status）——**typert 补丁确认为构建期问题，预构建足以让原版宿主完成 Remote 注册**。实测成功调用：`status`（鉴权链路）、`listNetworks`（面板列出平台 2 个网络）、`bindNetwork`（绑定成功，写入会话事件）、`bindNetworkWorkspace`（关联持久化生效，见「偏差」）。未逐一调用：getTurnProvenance/View 需要模型 turn（缺 key）；beginLogin/configureToken 涉及凭证操作，有意跳过。

**④ 绑定知识网络 + 一轮问答 —— 绑定通过；问答受上游源码 dev 缺陷阻断（详见补充实验）。** 面板中选 supply_ontology_hand → 新建会话 → 会话创建成功且合成区渲染「OpenBKN business session entry」（了解「供应链本体知识网络-手工版」知识网络）按钮；会话日志落盘 `{"type":"openbkn/business-network-bound",…}`（session-e08e2648 seq 3、session-5de38d83 seq 20，均实测 zstdcat 可见）。另建会话发消息验证模型链路：turn 以 `MISSING_CREDENTIAL`（llm-deepseek: no API key）失败——环境无 `DEEPSEEK_API_KEY`，**问答精准性在原版环境本轮未验证**，不属于原版特有失败。

> **补充实验（2026-09-20 晚，用户提供 API key 后，纯 HEAD 产物 /tmp/g2-home2）**：注入 `DEEPSEEK_API_KEY` 后重建绑定会话并提问「382-000005 有多少张销售订单？什么状态？」——模型正确推理并调用 BKN MCP 工具（会话日志 `tool/call` → `mcp__openbkn__bkn_start_interaction`，**插件工具挂载与调用意图在原版宿主上成立**），但 turn 以 `Cannot read properties of undefined (reading 'prepare')` 失败。判别实验：改问「用 shell 工具运行 ls」（纯原生工具）**同样崩溃、同一错误**。结论：**该缺陷是 DSH 源码 dev 模式下整体工具派发的失效（崩点 `agent-loop/tool-calls.ts:170` `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare`，调度器服务未注册），与预设无关、与插件无关**——修正 G5 的归因（原记为「PTC 预设缺陷」；本次 standard 预设同样崩，M5 在 Runtime 上 standard 通过互证打包形态正常）。因此原版源码 dev 形态下问答无法完成；问答验证需 Runtime 形态（M5 已在 Runtime 上以 3 问全对完成）。G2 的分发结论不受影响（⑤⑥已定局）。README 的 G5 规避建议应改为「源码 dev 模式工具调用不可用，请使用 Runtime」而非「切换 Standard 预设」。

**⑤ 重启 DSH 后会话重载 —— 失败（核心发现）。** 杀进程重启 `dsh web` 后打开含绑定事件的会话，web 报：

> Failed to load history: failed to observe session "session-5de38d83…": contains event type "openbkn/business-network-bound" (seq 20) **unknown to this harness and not marked ignorable; refusing to interpret the log** — it was likely written by a newer harness (gateway/internal)

根因（stock 源码实证，`packages/core/session/src/known-event-types.ts`）：`KNOWN_SESSION_EVENT_TYPES` 是 `gen-persistence-catalog.ts` 构建期从仓库自身事件表生成的静态集合，注释明言「仓库外插件事件按构造不在此列表；`SessionEvent.ignorable` 标记是唯一兼容机制，事件名注册机制被有意否决（不能分类省略安全性）」。**插件安装与否不影响该集合**——比 compat README「缺该插件的 harness 拒绝重载」的预测更严格：**装着插件也拒绝**。绑定事件无 ignorable 标记（stock `Session.append` 写入侧无法设置，正是补丁 0003 缺口），故必拒。见 `m6-stock-dsh-reload-refused.png`。

**⑥ 卸载插件后旧会话重载 —— 失败（同形）。** `dsh plugin --profile web remove` + 清理残留 node_modules + 重启：侧栏入口消失，打开同一会话得到与⑤完全相同的拒绝错误。失败形态：会话列表可见、标题可显示，但历史拒绝解释，报错文案对用户可读（指明事件类型与原始日志路径），不崩溃。

## 计划偏差（均为数据层等价操作，沿用 M5 先例）

1. 工作区注册：`storages/workspace.json` 直写记录（浏览器内无法完成原生目录选择器，M5 同样受限；picker 仅是取路径的 UI，宿主侧 `createWorkspace({path})` 才是数据操作）。
2. 网络↔工作区关联：`storages/openbkn_workspace_bindings.json` 直写一条 binding 记录（等价于 remote `bindNetworkWorkspace` 的落盘结果；写入后面板显示「已关联工作区」、流程切换为免 picker 的「继续/新建会话」路径，全部 UI 后续操作真实执行）。
3. 中途一轮重启带 SSH 环境标记（强制 browse picker 后端）用于定位「新建工作区」失败根因；最终结论轮无此标记。

## 附加发现

**发现 B（插件侧 UX 缺陷，原版/补丁版同样存在）**：browse picker 后端（SSH/远程场景）的能力对象只有 `list`/`createDirectory`，没有 `pick`；插件「新建工作区」直调 `ctx.uiWorkspace.pickDirectory()` → 瞬时失败，且 `openbkn-ui-controller.ts` 的 `catch {}` 吞掉错误，用户只看到「无法绑定当前会话，请重试」。建议：插件改走 directory-flow 插槽或先查能力种类，并放开空 catch（可并入文档包或单开小修）。

**发现 C**：`dsh plugin remove` 更新了 profile package.json 但未清 `node_modules/@openbkn`（本实验手动删除后插件才真正卸载）。属 DSH 侧行为，记录备查。

## 对差距清单的影响

- **G15（轻松安装）**：结论定型——原版直装不可作为主路径，README 首屏与市场条目应如实写明「需配合 OpenBKN Runtime（含兼容补丁）」，并给出体积/前置预期；
- **G14（tarball 字段）**：`tarball:` 仍可提供（能装、能绑定、进程内可用），但描述必须带上述限制；
- **G4（Linux）**：权重上升——Linux 用户无直装退路，Runtime 的 linux-x64 产物更必要；
- **G2 证据链**：compat README 中「缺该插件的 harness 拒绝重载」宜修正为「未打 ignorable 写入侧补丁时，任何重启后的重载都会被拒绝（含插件在场）」。

## 遗留

- 实验树保留于 `/tmp/dsh-stock`、隔离 home `/tmp/g2-dsh-home`（首轮）与 `/tmp/g2-home2`（纯 HEAD 复验，含两个带插件事件的会话样本），供复核；确认后可删。
- 问答精准性（④后半）待有 `DEEPSEEK_API_KEY` 的环境补测；预期与 Runtime 路径一致（模型链路与补丁无关），但未验证就是未验证。
