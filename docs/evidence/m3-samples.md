# M3：supply_ontology_hand 样例导入与验证记录

日期：2026-09-19。样例仓库：bkn-samples @ tag `supply-ontology-hand-v0.1.4`（7b5b59c）。

## 前置
- MySQL 8.0 容器 `bkn-supply-mysql`（host 3306；库 `supply_demo_hand`，用户 `supply_demo`；平台侧经 `catalog_host=192.168.50.28` 访问）。
- Node 24.19.0；Python 3.13 venv（tools/.venv，PyYAML/SQLAlchemy/PyMySQL 等）。
- CLI：`openbkn auth login https://192.168.50.28 -u admin -k`。

## 版本偏差说明
- 样例文档要求 `@openbkn/bkn-sdk@0.1.4`，实测 0.1.4 的 `vega catalog list` zod schema 将内置 logical catalog 的 `connector_config: null` 判为非法（CLI bug），无法完成步骤 4。改用 **0.1.5-rc.1**（对平台 0.1.4 完全兼容，schema 已容忍 null）完成全部步骤，其余行为一致。
- `import_kn.py` 未加 `--resolve-embedding`（平台尚未注册 embedding 模型，待 M2.4 onboard 后可在 M5 前重跑一次以填充向量绑定；不影响本方案 M3/M5 的查询与工具调用验证）。

## 执行结果（对应伙伴手册步骤 1–6）
| 步骤 | 命令 | 结果 |
|---|---|---|
| 1 preflight | `preflight.py --config config.yaml` | ok:true（cli 0.1.4/0.1.5-rc.1, node 24.19.0） |
| 2 灌数 | `load_sample_data.py` | 12 张表 78,635 行 |
| 3 导 KN | `import_kn.py` | verified:true；`bkn get supply_ontology_hand` 返回「供应链本体知识网络-手工版」 |
| 4 Catalog | `setup_catalog.py --write-config` | verification.ok=true，found_count=12，catalog_id=damo4ndmpep000cp2sr0 |
| 5 绑定+冒烟 | `bind_kn_resources.py`（dry-run+实跑）、`smoke_test.py` | 绑定解析到 resource ID（mon_task 为空属预期）；关联冒烟 hit_rate=1.0 passed=true |
| 6 业务能力 | `power_layer.py all`、`register_native_function_toolbox.py --apply`、`register_skills.py --apply` | 指标绑定全部成功 failed:[]；原生函数发布（open_forecast_count/backward_plan/material_where_used）；S1/S2/S3 Skill 全部 registered+published |

期间修复（平台侧，详见 m2-platform.md）：五个 release 的 `bknSafe.authzProvider` 切到 bkn-safe；minio arm64 变通；OSS 默认存储确认存在。

## M3 验收（对照计划）
- `openbkn --json bkn list` → `['supply_ontology_hand']` ✓
- `openbkn --json bkn object-type list supply_ontology_hand` → 15 个对象类型（forecast/inventory/salesorder/supplier/material/product/mps/po/pr/mrp/bom/skills/mon_item/mon_task/pr_decision）✓
- MCP 工具调用 + 回执：`openbkn --json context tool-call supply_ontology_hand query_object_instance --args '{"kn_id":"supply_ontology_hand","ot_id":"supply_ontology_hand_product","limit":3}'`
  - receipt：`rcpt_68890e32fe721e5b97bee9f9ef65b8c6`，receipt_status=**completed**
  - 返回业务数据：产品实例（如 `367-000061 农业无人飞机`、`367-000097 …`）✓
- `openbkn context tools supply_ontology_hand` → 26 个 MCP 工具可发现 ✓
