# CI 假绿发现与修复交接（复核会话 → 开发会话，2026-09-20）

> 来源：主会话（复核方）对 run#4 的日志取证结论。用户已授权开发会话按本文件执行修复（范围 = 第 2 节 a–f；边界见第 4 节）。
> 直接跨会话消息投递不可用，故以此文件交接；执行完成后本文件可并入第七轮回应或归档。

## 1. 复核结论（gh api 实测取证）

run#4 `35457559502`（基线 `4860bb9`）job 级双平台 success、publish 正确跳过——矩阵修复生效。**但 Windows 是假绿**：

1. Windows job（id `105935443059`）"Test plugin and compatibility tooling" 步骤内，插件组 119/119 通过；仓库/compat/runtime 组（`node --test compat/dsh-0.1.6-alpha.2/tests/*.test.mjs tests/*.test.mjs runtime/tests/*.test.mjs`）实为 **48 例 46 过 2 挂**，挂例均在 `tests/bundle-portability.test.mjs`：
   - `:136` "a mirrored .bin entry keeps resolving modules relative to its real file"
   - `:167` "maps links through a bundle subdirectory prefix (runtime shape)"

   两者均期望 `relative-link` 实得 `copy`。诊断 dump 显示 realpath 的 target/root/sourceReal/sourceRaw 全为 `C:\Users\RUNNER~1\...`（8.3 短名），而 runner 环境为长名 `runneradmin`（如 `PNPM_HOME`）——`f71c1d5` 的 sourceMappings 虽已尝试 realpath + 原始源根双键，仍未覆盖这个长短名方向。这正是 round7 4.3 对 `47c03ab`/`f71c1d5` 的审核担心，已被证实。
2. **退出码被吞**：该步骤三条命令（`pnpm --filter ... test` → `node --test ...` → `pnpm run package:check`）在同一个 `run:` 块，Windows 默认 pwsh，GHA 的 pwsh 包装以最后一个原生命令的 `LASTEXITCODE` 退出——`node --test` 退出 1 被 `package:check` 的 exit 0 覆盖。日志证据：`# fail 2`（17:22:28）之后紧接 `$ node scripts/package-bundle.mjs --check` → "Package audit passed"，步骤继续绿。**即 Windows 测试门禁目前形同虚设**。macOS（job `105935443010`）为 bash 语义，119/119 + 48/48 真实全过。
3. 后果评估：`copy` 相对 `relative-link` 功能良性（归档可用，portability 检查也过），但违反测试契约，且门禁失效必须在合入前修复。
4. `6e3ac65`（CI 验收记录）中「两平台全绿」「symlink 用例真实执行非 skip」的表述需按上述更正（按项目惯例主动更正不实陈述）。

## 2. 修复清单（一次推送完成，然后 workflow_dispatch 重跑）

- **a. 门禁修复**：`compatible-runtime.yml` 的测试步骤加 `shell: bash`（或拆成三个独立步骤），确保任何一条失败即步骤失败。
- **b. P2-1 冒烟**（round7）：CI 在 portability 检查后加冒烟步骤——直接运行组装目录的 `bin/dsh --version`（win32 用 `bin\dsh.cmd --version`），断言输出含 `0.1.6-alpha.2`。
- **c. 修两例 Windows 失败**：以日志 realpaths dump 为准定位参与匹配的两个形态（存储目标串 vs 映射键）差在哪（长短名/大小写/分隔符），修 source 或按真实契约修测试——不得为绿弱化断言。同时补 round7 建议的单测：POSIX（或路径规范化单测层面）下大小写不同的两个根不应互相镜像。
- **d. 更正 `6e3ac65` 验收记录 + 补第七轮回应**（`docs/reviews/2026-09-19-review-response.md`）：Windows 行改为「46/48，2 例失败曾被退出码掩盖，修复后重跑真绿」；补记两平台测试计数；按 round7 P0-2 补 `f71c1d5`/`47c03ab` 两提交的审核叙述与依据、run 链接、验收缺口表更新（round6 缺口里 1/3/4/5 经 run#4 可关闭，但第 1 项须以修复后重跑为准）。
- **e. P1 三处文档漂移**（round7 4.7）：
  1. `compat/dsh-0.1.6-alpha.2/README.md:52` 的 `0.1.3.tgz` → `0.1.4.tgz`（`compat/dsh-0.1.2-rc.1/` 下的 README 属该系列历史文档、当时插件版本确为 0.1.3，不动，但回应中说明与 round7 grep 验收式的命中差异）；
  2. `CHANGELOG.md`：118/118 → 119/119，且 `## Unreleased` 段内容为项目早期事项却压在 0.1.4 之上，按实际情况归位/清理；
  3. `docs/evidence/m5-e2e.md` 加「已被后续修改取代」注记（LOCAL-ONLY workaround 已随 BLOCKER-3 删除；401/403→LICENSE_REQUIRED 已被 R8 收窄），不改写历史证据正文。
- **f. 重跑取证**：推送后 workflow_dispatch，验收 = 两平台 job 全绿、测试计数全 pass、冒烟断言通过；run 链接与计数写入回应。推送沿既有模式（fork main 快进后 dispatch，或推 feat 分支后 `--ref`）。

## 3. 当前仓库状态（复核会话实测，2026-09-20 01:30 前后）

- 本地 `feat/dsh-0.1.6-alpha.2-compat` HEAD = `6e3ac65`，工作树干净（仅 CLAUDE.md 等未跟踪文件）。
- fork main = `6e3ac65`；fork feat 分支仍在 `1c527af`（本地领先 4 提交）。
- round7 报告：`docs/reviews/2026-09-20-dsh-0.1.6-compat-review-round7.md`。
- 项目 memory `bkn-dsh-progress-20260919.md` 已由复核会话追加 ⚠️ 假绿更正段；完成后请同步更新该 memory（勿删更正段，叠加新状态）。

## 4. 授权边界

- **已授权**：本地修复、推 fork（`kalias/bkn-dsh`）、workflow_dispatch、gh 取证。
- **未授权（继续等用户）**：向 `openbkn-ai/bkn-dsh` 提 PR、推 `openbkn-dsh-runtime-v*` tag（触发 publish/Release）、业务 E2E 重跑（需用户在场）、P3 环境清理（deepseek-harness revert、settings.yaml 恢复）。
- 沿用 round7 第 6 节约束：不 `reset --hard` / `clean`；DSH 树只经 compat apply/revert 变更；不读取/输出凭据；`.lic` 不提交；回应中区分实测/自报/未验证，每个产物记 SHA-256、平台、构建基线。
