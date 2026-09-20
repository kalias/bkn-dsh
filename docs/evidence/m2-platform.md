# M2：Mac OpenBKN 测试平台（kind）验证记录

日期：2026-09-19。

## 平台地址
- 对外地址：`https://192.168.50.28`（kind ingress，host 80/443 映射；自签 TLS，CLI 需 `-k`）
- 控制台初始账号：admin（初始密码记录于 `bkn-foundry/deploy/dev/conf/mac-config.yaml` 的 `bknSafe.initialPassword`）
- 集群：kind `bkn-dev`（kind 0.29?/helm 4.3.0/kubectl 1.33，节点 bkn-dev-control-plane，Kubernetes v1.37.0）

## 安装过程要点（含问题与修复）
1. `dev/mac.sh cluster up` 首次创建后 ingress-nginx 拉镜像失败：宿主机 `HTTP(S)_PROXY=127.0.0.1:10808` 被 kind 继承，节点内 127.0.0.1 不可达。
   修复：`cluster down` 后以 `HTTPS_PROXY=http://host.orb.internal:10808`（节点可达宿主机代理的地址）+ 扩大 NO_PROXY 重建集群。
2. `dev/mac.sh bkn-foundry install`：`deploy.sh` 使用 bash 4 特性（`${var,,}`），macOS 系统 bash 3.2 不支持 → `brew install bash`（5.3）后重跑成功。Helm 全栈（MariaDB/Redis/Kafka/OpenSearch + 全部服务）安装于 ns `openbkn`。
3. 4 个镜像 tag `0.1.4-hotfix-supply-sample-p1` 在 SWR 不存在（上游未发布）→ 对 agent-retrieval / agent-operator-integration / sandbox 用 `helm upgrade --reuse-values` 把镜像 tag pin 到稳定 `0.1.4`（SWR 存在）；sandbox 模板镜像同理。
4. `bkn-backend` CrashLoop：启动时 GetCatalogByID 经 vega 返回 500（vega 调不存在的 `authorization-private:30920`）。修复：vega-backend / bkn-backend / mf-model-api / mf-model-manager / agent-operator-integration 五个 release 设置 `bknSafe.authzProvider=bkn-safe` + `bknSafe.url=http://bkn-safe:3000`。设置后 bkn-backend 稳定 Running（"Server Started on Port:13014"）。
5. minio（sandbox chart 组件）：openbkn 的 minio 镜像（SWR 与 ghcr）均为 **amd64-only**，本机 arm64 节点无法运行；docker.io 匿名拉取被代理出口 IP 限流拒绝，Bitnami minio 镜像已在 Docker Hub 全量下架。变通：宿主机 `docker pull quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`（multi-arch）→ 重打 tag 为 `ghcr.io/openbkn-ai/minio:<同tag>` → `kind load docker-image` 注入节点，靠 IfNotPresent 命中本地镜像。minio 已 Running。官方镜像不支持 `MINIO_DEFAULT_BUCKETS`，已用 minio python SDK（port-forward 9000）手工创建 `sandbox-workspace` 桶。
6. OSS 默认存储：执行 `onboard_oss_storage.sh` 的 `onboard_provision_oss_default_storage` → "already configured"（已存在）。

## 最终状态
- `kubectl -n openbkn get pods`：除以下两项外全部 Running/Completed：
  - `sandbox-sandbox-sess-aoi-0`（Error，重启中）：S3 workspace 初始化期间 minio 不可用所致；minio 恢复后随重启自愈（sandbox 非本项目验证关键路径）。
  - superseded RS 的 minio 旧 pod 曾短暂 ImagePullBackOff，已清理。
- CLI 认证：`openbkn auth login https://192.168.50.28 -u admin -p *** -k` → Logged in as admin；`openbkn bkn list` 正常返回（导入样例前为空列表）。
- 工具链：node 24.19.0（nvm default）、@openbkn/bkn-sdk 0.1.5-rc.1（见 m3 文档的版本偏差说明）、python 3.13（样例要求 ≥3.11）。

## 偏差与已知限制
- onboard 模型注册（LLM + embedding）待用户提供 DeepSeek API Key 后执行（M2.4 阻塞项，见交付报告）。
- minio 依赖本地注入镜像（集群重建后需重跑 `docker tag` + `kind load` 两步）。
- doctor 的 docker 内存 15.7GB 警告（建议 ≥16G）：未触发稳定性问题。

## 补充（TLS 修复链，2026-09-19 深夜）
插件 MCP 连接曾持续失败，根因链：
1. 全部 ingress 规则未配置 `host`（K8s 禁止 IP 作 host），流量落入 ingress-nginx 兜底 server，永远出示 default fake certificate（CN=Kubernetes Ingress Controller Fake Certificate，无 SAN）；Node 严格校验报 `ERR_TLS_CERT_ALTNAME_INVALID`（curl -k 掩盖了这一点）。
2. 修复：生成自签证书（CN=192.168.50.28，SAN 含该 IP），创建 secret `openbkn/openbkn-tls`，并通过 `--default-ssl-certificate=openbkn/openbkn-tls` 设为 ingress-nginx 控制器的默认证书（rollout 后生效）。
3. DSH 侧以 `NODE_EXTRA_CA_CERTS=~/.dsh/openbkn-dev-ca.pem` 启动即信任该证书。
验证：`curl --cacert` 握手通过（401 为无 token 的预期响应）；插件 `status` 远端返回 authenticated，`listNetworks` 返回 supply_ontology_hand。
