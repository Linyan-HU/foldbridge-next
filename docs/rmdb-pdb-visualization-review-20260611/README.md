# RMDB/PDB 可视化审查文档

本目录记录 FoldBridge 网站接入 133 远端 RMDB/PDB sequence-projection 数据前的设计与交付风险。

## 审查范围

- 本地网站项目：`/Users/joseperezmartinez/docs/foldbridge`
- 远端公开数据包：`133:/data/FoldBridgeShare/rmdb_pdb_sequence_cases_rasp_params_besthit_20260610`
- 远端支持数据包：`133:/data/hsBack/05_devSpace/03_foldbridge_rmdb_rasp/06_compute_intermediates/rmdb_pdb_sequence_cases_rasp_params_besthit_20260610_support`
- 目标页面口径：一个生物学分子可以映射到多个 PDB ID case；当前每个页面承载一个 PDB ID case，不进行跨 PDB 合并。

## 文档清单

- [blockers.md](./blockers.md)：接入该数据包做网站可视化前需要解决的 blockers。
- [page-scope.md](./page-scope.md)：PDB ID case 页面的生物学口径、分层模型和页面硬规则。
- [data-assets-contract.md](./data-assets-contract.md)：静态站点部署下的数据资产生成、索引调度和懒加载契约。
- [decisions.md](./decisions.md)：按「问题 -> 用户决策 -> 落地规则」记录每个 blocker 的解决口径。

## 明确排除

本目录不记录本地 Git 工作树状态问题。工作树状态属于工程流程清理项，不属于这批数据可视化设计 blocker。
