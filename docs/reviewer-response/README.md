# Reviewer 回复证据索引

本目录集中保存评审意见对应的修复证据、复现协议和实现范围评估，供后续撰写 rebuttal
时引用。索引只陈述已经验证的状态；“已评估”不等于“已实现”，“候选通过”也不等于
“已上线”。

## E 类网站一致性

- E0.1 数据提交联系入口：Help 新增苗智超研究员邮箱；本地候选，维护与更新计划尚未补充。记录见下方 E 类证据文档。
- [E1.3 / E1.4 网站一致性修复](2026-09-13-e13-e14-consistency.md)：本地候选；命名与科学术语排版已实现，尚未上线。稿件格式不在本次范围内。

## C 类修复

| 评审项 | 当前结论 | 证据与复现入口 |
| --- | --- | --- |
| C1.5 主站与 Case 响应式布局 | GitHub Pages 与 Case/Tunnel 均已上线并复验 | [主站 C1.5 / C1.6 证据](2026-09-12-c1.5-c1.6-spa-evidence.md)、[Case C 类证据与复现协议](2026-09-12-c-case-evidence.md) |
| C1.6 旧式 Extended PDB ID 搜索 | 已上线；`pdb_00001ddy` 与 `1DDY` 在公网返回同一组 4 条链结果 | [主站 C1.5 / C1.6 证据](2026-09-12-c1.5-c1.6-spa-evidence.md) |
| C1.7 VARNA 缩放与双轴滚动 | Case/Tunnel 已上线；140% 双轴滚动与 1:1 复位已复验 | [Case C 类证据与复现协议](2026-09-12-c-case-evidence.md) |
| C1.8 Technique 筛选反馈 | Case/Tunnel 已上线；提示筛选结果，不自动切换 Profile 或重绘其他视图 | [Case C 类证据与复现协议](2026-09-12-c-case-evidence.md) |
| C1.9 废弃 RDAT / RMDB raw heatmap | Case/Tunnel 已上线；不公开 RDAT，也不请求退役资源 | [Case C 类证据与复现协议](2026-09-12-c-case-evidence.md) |
| C3.2 反应性三状态 | Case/Tunnel 已上线；missing、finite `<= 0`、positive 在 1D/2D/3D 使用同一分类 | [Case C 类证据与复现协议](2026-09-12-c-case-evidence.md) |

主站与 Case 使用两条独立发布链：主站由 `ghhttps/main` 的 GitHub Pages 提供，Case 由
私有 Case document root 经本机静态服务和 Tunnel 提供。因此上表分别记录上线状态，不能用
其中一条链的成功代替另一条链的验收；本机绝对路径不进入对外 reviewer 索引。

本批次两条生产链的提交、运行、哈希、回滚点和已知限制统一记录在
[2026-09-13 C 类生产发布记录](2026-09-13-c-production-release.md)。

## D 类范围评估

[D 类功能实现范围评估](2026-09-12-d-class-scope-assessment.md)覆盖 D3.3、D3.4、D3.6。
当前状态：D3.4 已在 Case/Tunnel 上线，E 的两个下载均已在主站 iframe 保存完成；F 保存和 SVG 独立查看待验收。D3.3、D3.6 不在本次发布范围。

- D3.4 按后续讨论实现 SVG 热图与原 JSON.gz 直接下载，详见 [D3.4 下载证据](2026-09-13-d3.4-download-evidence.md)；初始评估中的 CSV 未纳入本次范围；
- D3.6 已实现本地候选：1 个主 Profile 加最多 3 个自选比较，独立显示尺度，不作差异统计；未上线，详见 [D3.6 候选证据与验收边界](2026-09-13-d36-profile-comparison-evidence.md)；
- D3.3 先做离线几何 sidecar pilot，并在开始前通过工具许可和科学验证 gate；
- 显著性检验暂不承诺，需先补齐 condition、replicate、sample size 和 per-position error。

## Rebuttal 引用边界

- 可以写：C 类候选与线上发布均有自动测试、静态闭包、真实浏览器和可回滚发布证据。
- 可以写：D 类已完成数据、依赖、风险、工作量和推荐顺序评估。
- 可以写：D3.4 下载入口已上线；实际验收范围以 [D3.4 下载证据](2026-09-13-d3.4-download-evidence.md) 为准。
- 可以写：D3.6 已具备本地候选比较能力；具体测试和未完成验收以其证据文档为准。
- 不应写：D3.6 已发布，或已有数据足以支持任意 Profile 间的显著性检验。D3.3 状态不由本次 D3.6 工作判断。
- 引用 C 类结论时，应同时给出评审项、证据文档、验证日期和对应线上 URL，不只引用提交号。
