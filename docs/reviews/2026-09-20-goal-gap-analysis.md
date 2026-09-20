# bkn-dsh 交付目标差距分析（2026-09-20）

> 与历轮审核报告的分工：审核报告看「改动对不对」，本文看「离产品目标还差什么」。
> 基线：分支 `feat/dsh-0.1.6-alpha.2-compat` @ `952d404`；证据来源为仓库内文档、源码与 fork 上的 CI 记录（均为本轮实测或注明出处）。

## 代码位置（三处，勿混淆）

工作区 `/Users/kalias/Documents/project/app/openBKN` 本身不是 git 仓库，其下目录分属三个角色（总览另见根 `CLAUDE.md`）。所有差距条目的代码改动只落在 bkn-dsh；openbkn 侧仅作部署与数据来源，dsh 源只经 compat apply/revert 变更。

**① openbkn 侧（平台，非交付物）**
- `bkn-foundry/` — OpenBKN 平台源码（`main` @ `5eeaa90f`），本地部署入口 `deploy/dev/mac.sh`；
- `bkn-samples/` — 样例知识网络，`supply_ontology_hand` 为主 E2E 数据集；
- `openbkn-ee-0.1.4-online/` 与根目录 `*.lic` — 企业版安装器与 License：不读出内容、不复制、不提交；
- 运行态：本机 kind 集群 `kind-bkn-dev` 节点 Ready、平台 `https://192.168.50.28` 应答 HTTP 302（2026-09-20 实测）；EE 0.1.4 为 2026-09-19 升级记录（license 未验证）。
- 涉及条目：G6/G7/G8（评测与样例）、G9（版本前提）、G10（试用路径）。

**② bkn-dsh（交付物，本文所在仓库）**
- 分支 `feat/dsh-0.1.6-alpha.2-compat`，HEAD `500d0a7`，工作树干净；本文基线 `952d404` 之后仅 round-9 修复与文档提交（`0ee6d9a`、`e142abd`、`500d0a7`）。除①③所列条目外，其余差距的改动均在此仓库。

**③ dsh 源（两棵树，严格区分）**
- 工作区 `deepseek-harness/`：detached @ tag `dsh-v0.1.6-alpha.2`（`ddefc45f`），带 5 个未 revert 的 compat 补丁文件（`packages/core/session/src/index.ts`、`packages/core/session/src/types.ts`、`packages/typert/generator/src/analyzer.ts`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`）；还原只经 `compat/dsh-0.1.6-alpha.2/apply.mjs --revert`，待用户确认后执行。
- 干净对照树：G2 实验克隆到 `/tmp/dsh-stock` 等独立目录（见第 6 节约束），不得复用工作区这棵已打补丁的树。涉及条目：G2、G3。

## 0. 目标与当前达成度

核心目标三条：

1. **装得上**：插件能有效安装到最新版 DSH；
2. **用得准**：DSH 会话中涉及业务知识网络的内容，都能经 BKN 获得本体知识，从而精准回答；
3. **找得到、装得easy**：插件在插件市场可被搜到并轻松安装。

| 目标 | 达成度 | 一句话判断 |
| --- | --- | --- |
| 1 装得上 | ⚠️ 部分 | 捆绑 Runtime 路径已验证；**装进原版（未打补丁）DSH 的路径从未验证过** |
| 2 用得准 | ⚠️ 部分 | 有一次真实的人工验证（3 问全部与库数据吻合），但**不可重复、不覆盖失败路径** |
| 3 找得到 | ❌ 未达成 | 无 Release、无 npm 包、无 `dsh-plugin` topic，收录条目备妥但前置全缺 |

## 1. 目标一：装进最新版 DSH

### G1（高）版本精确锁死，"最新版"是移动目标

**事实**：`packages/openbkn-business-context/package.json` 的 peerDependencies 把 12 个 `@deepseek-ai/dsh-*` 全部精确锁在 `0.1.6-alpha.2`；根 `package.json` 的 generator 同锁。目标版本是 2026-09-17 的 pre-release。
**影响**：上游每发一版，都要整体 bump + 重做 compat 系列 + 重打产物；插件对「最新版」的承诺只在一个时间点成立。
**欠缺**：没有任何上游版本跟踪机制（CI 无定时检测新 tag，文档无维护节奏与支持窗口声明）。
**建议**：① 加一个定时 workflow，检测 `deepseek-ai/deepseek-harness` 新 tag 并开 issue；② README 增加「当前支持的 DSH 版本 / 支持策略」小节，明确一次只支持一个 pin 版本。

### G2（最高，决定后续路线）装进原版 DSH 的路径零验证

**事实链**：
- `docs/evidence/m4-adaptation.md` 第 4 步的 `pnpm dsh plugin --profile web add` 成功，是在**已打补丁**的 DSH 树上；
- `docs/evidence/m5-e2e.md` 的端到端，跑的是捆绑 Runtime（内含补丁）；
- `docs/market/README.md` 自述「从源码构建需要 typert 补丁，npm 包是预构建的」——即预构建产物**理论上**不需要 typert 补丁；
- 但 `compat/dsh-0.1.6-alpha.2/README.md` 明确：缺 ignorable 写入侧补丁时，插件写入的会话事件以 required 形式持久化，**缺该插件的 harness 拒绝重载该会话**。

**影响**：这是核心目标一的直接证据缺口。结论有两种可能且分叉很大：能用（仅会话可移植性受损）→ 市场可主推 npm/tgz；不能用 → Runtime 是唯一分发形态，必须如实声明。
**决定性实验（成本低，建议最先做）**：

```bash
# 干净的未打补丁 DSH
git clone --depth 1 --branch dsh-v0.1.6-alpha.2 https://github.com/deepseek-ai/deepseek-harness.git /tmp/dsh-stock
cd /tmp/dsh-stock && pnpm install && pnpm build          # 不执行任何 compat apply
pnpm dsh plugin --profile web add file:<已构建的 0.1.4 tgz>
pnpm dsh web
```

**逐项记录**：① 插件是否加载、控制台有无报错；② 侧栏 OpenBKN 入口是否出现；③ Remote 方法是否 10/10 可用（typert 预构建是否足够）；④ 绑定知识网络 + 一轮问答是否成功；⑤ 重启 DSH 后会话能否重载；⑥ 卸载插件后旧会话能否重载（预期失败，需确认失败形态）。
**验收**：`docs/evidence/` 新增 `m6-stock-dsh-install.md`，六项逐条记录命令、输出与结论；据此更新 README 的安装路径表述与市场条目描述。

> **已执行（2026-09-20，见 `docs/evidence/m6-stock-dsh-install.md`）**：①–④ 通过（问答经 API key 补测：插件 MCP 工具挂载与 `tool/call` 成立，但 turn 被上游**源码 dev 模式工具派发缺陷**阻断——与预设无关，原生工具同崩，**G5 归因据此修正**；问答完整验证仍以 M5 的 Runtime 记录为准），**⑤⑥ 失败且比预期更严**——插件事件以 required 持久化，重启后会话被拒绝重载，**插件在场也一样**（stock 事件类型白名单为构建期静态集合）。G15/G14 定调：原版直装不可作主分发形态，Runtime 仍是唯一受支持形态；G4（Linux Runtime）权重上升。附带新发现：browse picker 场景下插件「新建工作区」必败且错误被空 catch 吞掉（插件侧待修）；`dsh plugin remove` 不清 node_modules 残留。

### G3（高，外部约束）上游通道关闭，桥接无退出路径

**事实**：上游 GitHub 为只读镜像，issues/PR 均禁用；DSH 侧修复留在 `kalias/deepseek-harness` 的分支上（`fix/mcp-credential-headers` 等）。
**影响**：「未来上游原生支持后不再需要桥接」没有时间表，compat 系列是长期维护负担；每个 DSH 新版都要重做。
**建议**：在 README / compat README 记录上游联系渠道的尝试与现状；保持 DSH 侧分支基于 tag 的单主题形态（已满足），以便通道一开即可贡献。

### G4（中高）平台覆盖缺 Linux 与 Intel Mac

**事实**：`runtime/openbkn-dsh-runtime.manifest.json` 只声明 darwin-arm64 与 win32-x64；`runtime/runtime-manifest.mjs` 的 `platforms` 集合同样只有两项；`tests/package-compatible-runtime.test.mjs:58` 明确断言 `linux-x64` 被拒绝；darwin-x64 已于 `4860bb9` 移除（Intel mac runner 不可调度）。
**影响**：Linux 开发者（DSH 的重要用户面）拿不到 Runtime，而在原版 DSH 上直装又受 G2 未知数阻挡；市场覆盖面因此受限。
**建议**：把 linux-x64（必要时加 linux-arm64）加回 manifest/校验器/CI 矩阵（`ubuntu-latest`，跑得比 mac 更快更稳）；darwin-x64 若要恢复，需确认 GitHub 当前可用的 Intel runner 标签。
**验收**：CI 三平台全绿，Linux 产物经 portability 检查与入口冒烟。

### G5（中）PTC 预设不可用未进文档

**事实**：`docs/evidence/m5-e2e.md` 记载，`dsh-v0.1.6-alpha.2` 的 PTC 工具派发存在 `Cannot read properties of undefined (reading 'prepare')`，工具调用必失败，故全部验证改用 Standard 预设。README 双语均未提及。
**影响**：用户按默认/PTC 配置使用会直接踩坑，且会误判为插件缺陷。
**建议**：README 与 compat README 各加一句已知限制与规避方式（`agent-presets` 设为 `standard`）。

## 2. 目标二：会话中经 BKN 精准回答

### G6（最高，工程侧）答案精准性没有可重复的证明

**事实**：现有证据为一次性人工验证——3 个问题、1 个样例（supply_ontology_hand）、人工比对 MySQL，且形成于 R8（错误分类与 capabilities 判定变更）之前。
**影响**：「精准」是本项目的价值主张，但每次代码改动后都无法低成本重新证明；回归风险不可见。
**建议**：建一个最小评测集——`docs/eval/supply-ontology.yaml`，每条包含：问题、期望出现的业务事实（对象/数量/状态）、期望调用的工具类别、禁止出现的内容；配一个跑批脚本（可先人工判定，逐步引入自动断言）。规模 10 条即可起步。
**验收**：脚本可在一条命令内跑完并输出通过率；纳入发布前检查清单（不必进 CI，因为需要平台与模型凭证）。

### G7（高）失败路径与边界未验证

**欠缺清单**：无权限 / 不存在的 KN；Token 失效（应显示认证提示而非 License 提示——R8 的行为变更点）；平台不可达与超时；结果超过 `maxResultBytes` 被截断后模型看到什么；企业版域授权缺失时的溯源面板表现。
**影响**：业务场景里这些比正常路径更常出现，且直接影响用户对「可信」的判断。
**建议**：并入 G6 的评测集作为负例组，或至少在下次 E2E 中逐条走一遍并留证。

### G8（中）样例覆盖单一，动作面验证不足

**事实**：只做了 supply_ontology_hand；world-cup（27 CSV → MySQL → Vega catalog → `vega_sql_execute`）在 PROJECT-PLAN 中为可选项，未执行。
**影响**：「动作（工具调用）执行成功」只在查询类工具上验证过，SQL 执行类工具链路无证据。
**建议**：如要对外宣称动作能力，补做 world-cup 的一次最小验证。

### G9（中）溯源的版本前提未在 README 声明

**事实**：溯源面板需要企业版 License + 业务域授权（`x-business-domain`）；社区版用户看到的是升级提示。`docs/market/awesome-dsh-plugin-entry.yml` 的描述里写了这一点，**README.md / README.zh.md 都没写**。
**影响**：README 把「可查看业务溯源」列为核心能力，社区版用户预期落空。
**建议**：README 的能力描述处加版本前提；与 G15 的分发形态说明放在一起。

### G10（中）没有试用入口

**事实**：README 双语中没有任何 `sample` / `bkn-samples` / 最小环境搭建的指引（本轮 grep 零命中）。
**影响**：市场用户装上插件后，若没有现成 OpenBKN 平台与知识网络，无法进行任何有效操作。
**建议**：README 增加「先决条件与试用路径」小节，链接 `bkn-samples` 与 `bkn-foundry` 的本地部署入口，说明最小可试链路（平台 → CLI 登录 → 导入样例 → 绑定网络）。

## 3. 目标三：市场可搜可装

### G11（高，需授权）没有任何 GitHub Release

**事实**：产物只存在于 fork 的 CI artifact；`publish` job 依赖 `openbkn-dsh-runtime-v*` tag 触发，从未打过 tag。
**阻塞**：打 tag 与发布需用户授权；发到 `openbkn-ai/bkn-dsh` 还需 org 权限（当前账号对该仓库只有 pull）。
**建议**：先在 fork 上发一个预发布 Release 验证 publish job 通路，再由 org 账号在上游正式发布。

### G12（中，需凭证）npm 发布路径未就绪

**事实**：`packages/openbkn-business-context/package.json` 的 `publishConfig` 为 `null`。scoped 包默认 restricted，不加 `publishConfig.access: public` 会发成私有包。
**阻塞**：还需 @openbkn 的 npm org 凭证。
**建议**：工程侧先补 `publishConfig: { "access": "public" }`，并在本地 `npm pack --dry-run` 核对 `files` 清单；凭证到位后再发。

### G13（高，需权限）`dsh-plugin` topic 未添加

**事实**：`docs/market/README.md` 记录其为收录硬前置，需 org 管理权限。
**建议**：这是纯权限动作，请 org 管理员加上；无工程依赖，可与 G11 并行。

### G14（低）收录条目缺 tarball 字段

**事实**：`awesome-dsh-plugin-entry.yml` 已备妥 url/name/category/双语描述，但没有 `tarball:` 指向可安装产物（依赖 G11）。
**建议**：Release 落地后补该字段，同时按 G2 的结论复核描述里「随 OpenBKN Runtime 发布」的表述是否仍准确。

### G15（高）「轻松安装」与现状不符

**事实**：当前唯一验证过的安装形态是下载 150–190 MB 的 Runtime 归档（win32 zip 实测 194 MB）；而插件市场用户的心智是 `dsh plugin add @openbkn/dsh-business-context`。
**影响**：直接关系目标三的「轻松」。
**建议**：由 G2 的实验结论二选一——能直装则主推 npm/tgz、Runtime 降级为可选便捷包；不能直装则在市场描述与 README 首屏如实说明「需配合 OpenBKN Runtime」，并给出体积与前置条件预期。

### G16（中）缺升级与卸载文档

**欠缺**：Runtime 从 N 升到 N+1 的步骤；隔离 home（`OPENBKN_DSH_HOME`）中数据的迁移与保留；卸载插件后历史会话的可读性（与 G2 第 ⑥ 项耦合）。
**建议**：README 增加「升级与卸载」小节，其中会话可移植性的表述以 G2 实验结果为准。

## 4. 其他（文档一致性）

### G17（低）m4 证据与最终形态矛盾

`docs/evidence/m4-adaptation.md` 写「原补丁 3（ignorable session events）已删除：0.1.6-alpha.2 原生支持」，但最终的 compat 系列**包含**该补丁的写入侧（`00d5942` 恢复；read side 原生、write side 缺失）。该文件未像 `m5-e2e.md` 那样加「已被后续修改取代」注记。
**建议**：加注记，不改写历史正文。

## 5. 优先级与关键路径

**第一梯队（决定路线，先做）**
1. **G2 决定性实验**——原版 DSH 直装验证（六项记录）。它的结论会改写 G15、G14、G4 的优先级，也会决定 README 与市场描述怎么写。
2. **G6 最小评测集**——让「精准」这个目标可重复证明；顺带吸收 G7 的负例。

**第二梯队（工程，可与第一梯队并行）**
3. G4 Linux 产物（`ubuntu-latest` 比 mac runner 更稳更快）。
4. G5 / G9 / G10 / G16 / G17 的 README 与文档补全（依赖 G2 结论的部分等实验结果）。
5. G12 的 `publishConfig` 与 `npm pack --dry-run` 自检。
6. G1 上游版本跟踪 workflow 与支持策略声明。

**第三梯队（卡权限，不占工程时间）**
7. G13 `dsh-plugin` topic（org 管理员）。
8. G11 Release（打 tag 需用户授权；正式发布需 org）。
9. G12 npm 正式发布（需 org 凭证）。
10. G3 上游贡献通道（持续观察）。

**仍未关闭的既有验收缺口**（见 round9 第 6 节）：强隔离跨机启动、业务 E2E 重跑（需用户在场）、Windows 守卫拒绝路径的原生负例。

## 6. 约束

沿用历轮：不 `reset --hard`/`clean`；DSH 树只经 compat apply/revert 变更；不读取或输出凭据；`.lic` 不提交；文档中区分实测 / 自报 / 未验证。**G2 的实验请在独立目录（如 `/tmp/dsh-stock`）进行，不要动工作区里的 `deepseek-harness`**（它仍带着上轮的补丁改动，待用户确认后 revert）。推送、打 tag、Release、向上游提 PR 仍需用户另行授权。
