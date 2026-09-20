# M6 续：补丁树与 Runtime 端到端验证（交付物验证轮）

日期：2026-09-20（晚）。目的：验证两样交付物——①插件包 tgz（装/卸可用）②DSH 补丁脚本（apply 后插件正常工作）——并把 G2 在原版上的失败项逐一对照通过。接续 `m6-stock-dsh-install.md`。

**结论先行：两样交付物全链路验证通过。** 同一个 pristine tgz（sha256 `8cd2776f…`，纯 HEAD `500d0a7` 构建，已落位 `release/plugin/`）在三种形态下的表现：

| 环节 | 原版源码 dev | **补丁源码 dev**（apply.mjs 后） | **补丁 Runtime**（官方脚本打包） |
| --- | --- | --- | --- |
| 插件安装 / 卸载 | ✅ / ✅ | ✅ / ✅ | ✅ / ✅（本表卸载仅在补丁源码验证） |
| ①加载 ②入口 ③Remote | ✅ | ✅ | ✅ |
| ④绑定 | ✅ | ✅ | ✅ |
| ④问答 | ❌ 上游源码 dev 工具派发缺陷 | ❌ 同缺陷（**非补丁范围**，判别实验见下） | ✅ **「40 张、全部已确认」，9 步工具调用，与 M5 MySQL 核对基准一致** |
| ⑤重启后会话重载 | ❌ 拒绝 | ✅ **无拒绝、历史完好** | （同机理，未重复） |
| ⑥卸载后会话重载 | ❌ 会话从列表消失 | ✅ **仍列出、历史完整加载（含工具调用记录）** | — |

## 补丁树过程（/tmp/dsh-patched，全新克隆）

```bash
git clone --depth 1 --branch dsh-v0.1.6-alpha.2 …/deepseek-harness.git /tmp/dsh-patched
node compat/dsh-0.1.6-alpha.2/apply.mjs  --dsh /tmp/dsh-patched   # → applied
node compat/dsh-0.1.6-alpha.2/verify.mjs --dsh /tmp/dsh-patched   # → verified: openbkn-business-context.1
cd /tmp/dsh-patched && pnpm install && pnpm build                 # 全量通过
```

隔离 home `/tmp/g3-home` 安装同一 tgz、同配置。绑定事件落盘对照（**补丁生效的直接证据**）：

- 原版树：`{"type":"openbkn/business-network-bound",…}`（无标记）；
- 补丁树：同一事件带 **`"ignorable": true`**（写入侧补丁在工作）。

⑤：重启 `dsh web` 后会话以标题「查询销售订单数量与状态」重载，无拒绝、历史完好（原版同场景报 `refusing to interpret the log`）。
⑥：`plugin remove` + 清残留 + 重启后，该会话仍在列表、点开历史完整（含 `mcp__openbkn__bkn_start_interaction` 工具调用记录）——**ignorable 读侧（原生）跳过未知事件，会话可移植性成立**。

问答判别（补丁源码 dev）：提问同一业务问题，模型正确调用 BKN MCP 工具后 turn 以 `Cannot read properties of undefined (reading 'prepare')` 失败——与原版源码 dev 完全一致。**该缺陷在补丁前后表现相同，确证为上游源码 dev 形态问题，与本补丁系列无关**；打包形态（Runtime）下消失。

## Runtime 过程（/tmp/g3-runtime，官方脚本从干净树构建）

```bash
git clone --depth 1 --branch dsh-v0.1.6-alpha.2 …/deepseek-harness.git /tmp/dsh-clean2
cd <bkn-dsh>
node scripts/build-compatible-runtime.mjs --dsh /tmp/dsh-clean2 --output /tmp/g3-runtime
# 脚本自行 apply compat → frozen install → build → deploy 闭包，exit 0
```

Runtime 的 dsh CLI（`node_modules/@deepseek-ai/dsh/lib/bin.js`）+ 隔离 home `/tmp/g3-home-rt` 装同一 tgz → 绑定 → 提问「382-000005 有多少张销售订单？什么状态？」：

- turn 完成 **9 steps**（多轮工具调用，含逐页核对），无 prepare 崩溃；
- 回答：**40 张，状态分布仅「已确认」一种**，含明细核对过程——与 M5（MySQL 独立核对）基准一致；
- 截图：`m6-runtime-qa-answered.png`。

注：本轮 Runtime 首启曾因 3080 端口被占报 EADDRINUSE（清理后正常），属环境占用非产物问题。

## 交付物

1. **插件包**：`release/plugin/openbkn-dsh-business-context-0.1.4.tgz`（sha256 `8cd2776f…`，99,695 B，纯 HEAD 构建，含 round-9 修复；替换了 9 月 19 日旧产物）。装卸命令与行为见 `docs/guides/install-with-patch.md`。已知环境注意：`dsh plugin remove` 后 `node_modules/@openbkn` 可能残留，需手动清理才彻底卸载。
2. **补丁脚本**：`compat/dsh-0.1.6-alpha.2/`（apply/verify/manifest/patches/tests，`--revert` 可整体还原）。本轮完成其最完整的端到端验证：apply → verify → install → build → 装 tgz → ①–⑥ 全过（问答除外，属上游源码 dev 缺陷）→ Runtime 打包问答通过。

## 遗留

- 原版源码 dev 的工具派发缺陷（`agent-loop/tool-calls.ts:170` 调度器未注册）为上游问题，补丁系列不覆盖；需要问答请使用 Runtime 形态。README（G5）表述待按此修正。
- 重启后绑定徽标在会话有历史时未渲染（agent 非活跃时 `getNetworkBinding` 抛错被控制器吞掉的表现层细节；事件与读取路径均在，下一 turn 即恢复）。建议列入插件侧小修清单。
- 实验树保留：`/tmp/dsh-patched`、`/tmp/dsh-clean2`、`/tmp/g3-runtime`、隔离 home ×3。
