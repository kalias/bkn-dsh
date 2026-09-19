# 插件市场收录（awesome-dsh-plugin）

`awesome-dsh-plugin-entry.yml` 是按 awesome-dsh-plugin 贡献指南准备的投稿条目（一个文件即全部投稿）。

**当前状态：备妥待发**，两个前置未满足：

1. **可安装路径**：收录要求从源码可构建或提供 tarball（GitHub Release 托管的 https .tgz）。本插件从源码构建需要 typert 兼容补丁（原版 generator 无法识别外部协议），npm 包是预构建的——因此需要二选一：
   - org 账号在 openbkn-ai/bkn-dsh 发一个 Release 并附上 `openbkn-dsh-business-context-0.1.4.tgz`（YAML 可加 `tarball:` 字段指向它）；
   - 或以 @openbkn scope 发布 npm（需 npm org 凭证；`repository` 字段已指回本仓库，收录自动关联下载量）。
2. **GitHub topic**：给 openbkn-ai/bkn-dsh 加 `dsh-plugin` topic（需 org 管理权限；CLI 侧 kalias 对该仓库只有 pull 权限）。

另请知悉：插件依赖 compat 兼容系列（typert 外部协议识别、ignorable 会话事件写入侧、发布锁文件对），**需配合 OpenBKN Runtime 使用**——描述中已如实注明；DSH 侧修复分支存于 kalias/deepseek-harness（上游 GitHub 为只读镜像、issues/PR 均禁用，通道打开即可贡献）。
