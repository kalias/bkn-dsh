# DSH 0.1.6-alpha.2 兼容补丁

[English](README.md)

该源码包用于让精确版本的 DeepSeek Harness `dsh-v0.1.6-alpha.2` 支持 OpenBKN Business Context。它是临时兼容桥接，不替代 DSH 原生插件管理。

## 支持范围

仅支持提交 `ddefc45fbc7f8e46dd73185e68295696d1297887`（tag `dsh-v0.1.6-alpha.2`）上干净的 DSH Git 源码工作树。不要用于桌面应用包、其他 DSH 版本或存在本地修改的工作树。

补丁仅提供插件与可重复 Runtime 构建所需的能力：Streamable HTTP MCP 的凭证引用请求头（已按新版 `packages/mcp/mcp-client` 重写后的 transport 重新移植，新版改用 `@modelcontextprotocol/client` 与 `scrubbedParentEnv`）、外部插件的已发布 Typert 协议识别（`analyzer.ts` 的 `isTypeMetaSymbol`；缺失时插件 10 个公开 Remote 方法只能发现 0 个），以及新增源码依赖对应的 lockfile 条目。

旧系列「可忽略插件非界面会话记录」补丁的读取侧已被上游原生支持（`SessionEvent.ignorable`，见 `packages/core/session/src/surface.ts`）；但 alpha.2 的 `Session.append` 尚不接受非界面事件的 ignorable 标记，插件写入的自定义事件会被持久层按必需事件拒绝，导致会话重启后无法加载——因此本系列保留写入侧桥接补丁（0003）。

本补丁不会读取或写入 OpenBKN Token。

## 应用与验证

在本仓库源码目录执行：

```bash
node compat/dsh-0.1.6-alpha.2/apply.mjs --dsh /path/to/deepseek-harness
node compat/dsh-0.1.6-alpha.2/verify.mjs --dsh /path/to/deepseek-harness
```

按 DSH 自身的构建说明重新构建打了补丁的源码树，然后构建本地插件产物并通过 DSH 原生插件命令安装：

```bash
pnpm --filter @openbkn/dsh-business-context build
pnpm --filter @openbkn/dsh-business-context pack --pack-destination /tmp/openbkn-plugin
pnpm dsh plugin --profile web add file:/tmp/openbkn-plugin/openbkn-dsh-business-context-0.1.4.tgz
```

切换 DSH 版本前先移除整个补丁系列：

```bash
node compat/dsh-0.1.6-alpha.2/apply.mjs --dsh /path/to/deepseek-harness --revert
```

命令在修改任何内容前会校验补丁摘要、精确基线提交、干净工作树与完整补丁系列；任一校验失败即不做任何改动（fail-closed）。
