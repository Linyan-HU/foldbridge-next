# ANNOJOIN Atlas 分支阶段记录

日期：2026-06-18  
仓库：`/Users/joseperezmartinez/docs/foldbridge`  
分支：`feature/annojoin-atlas-web-adapter`  
当前基线提交：`30d6776 feat(ANNOJOIN Atlas): 添加网页展示适配器`  
目标来源：`/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/remote_root/09_reports/ANNOCONFIDENCE_ANNOJOIN_STAGE_RECORD_AND_WEB_HANDOFF_20260617.md`

## 阶段结论

本分支已经建立 ANNOJOIN-first 的 FoldBridge Atlas 网页适配基线：构建脚本、静态资产生成、浏览器懒加载 store、当前筛选导出 API、mmCIF 按需结构 API、轻量 3D canvas viewer、测试和 Docker 运行面都已经落在 `30d6776`。

但当前页面信息架构需要返工。`30d6776` 把 handoff 文档中的 9 个一级能力集中在一个大的 `#annojoin-atlas` 页面上，这不再是后续目标形态。后续并行推进应以「总表页」和「详情页」两套网页为边界重构，不要继续扩大当前单页。

## 当前已提交内容

### 数据和构建

- `scripts/build-annojoin-atlas.mjs`：从 `ANNOJOIN` 表生成浏览器侧 JSON 资产。
- `scripts/lib/annojoin-atlas-corpus.mjs`：归一化 case、facet、route、preset、download、bounded visual preview。
- `scripts/lib/annojoin-atlas-structure.mjs`：解析 `structure_file_path`，并生成 `/api/annojoin/structure` URL。
- `scripts/lib/annojoin-atlas-export.mjs`：根据当前筛选结果生成 CSV / JSON 导出。
- `scripts/verify-annojoin-atlas-smoke.mjs`：抽样验证 ANNOJOIN Atlas 生成资产。

当前生成资产规模：

| 项目 | 当前值 |
| --- | ---: |
| case 数 | 1,126 |
| facet 数 | 12 |
| preset 数 | 6 |
| download manifest 数 | 24 |
| 生成 JSON asset 数 | 9,178 |
| 生成树文件数 | 9,179 |
| 生成树大小 | 440M |

`src/assets/generated/annojoin-atlas/` 是可重建构建产物，已被 `.gitignore` 忽略；不要把 440M 生成树直接作为源码提交。

### 运行和 API

- `scripts/serve.mjs` 新增：
  - `GET /api/annojoin/export-current-filter`
  - `GET /api/annojoin/structure?path=...`
- `docker-compose.yml` 将 stage package 根只读挂载到 `/annojoin-data`。
- 当前 Docker 运行面：
  - 容器：`foldbridge-foldbridge-web-1`
  - 镜像：`foldbridge-site:dev`
  - 状态：healthy
  - 端口：`55832 -> 8080`
  - 当前入口：`http://127.0.0.1:55832/dist/#annojoin-atlas`

### 前端代码

- `src/annojoinAtlasData.js`：ANNOJOIN 表形数据到浏览器 state 的归一化层。
- `src/annojoinAtlasStore.js`：加载 index、case asset、route page 的懒加载 store。
- `src/annojoinAtlasView.js`：当前单页渲染实现。
- `src/annojoinStructureViewer.js`：轻量 mmCIF parser + residue coloring canvas。
- `src/main.js` 和 `src/router.js`：接入 `annojoin-atlas` hash route。

### 已验证约束

当前 manifest 约束：

```json
{
  "entryRoot": "ANNOJOIN",
  "annotationRoot": "ANNOCONFIDENCE",
  "browserLoadsAnnoconfidenceBigTables": false
}
```

当前实现没有把 ANNOCONFIDENCE 大表复制成浏览器直接加载的 TSV；case JSON 中的 `annotationPayloadRowsCopied` 应保持为 `0`。这条约束必须在后续拆页重构中继续保留。

## 需要纠正的设计问题

当前 `src/annojoinAtlasView.js` 是一个大页面，把以下能力都放在同一页：

- searchable web interface
- RNA family / probe type / PDB ID / motif / structure class search
- 1D reactivity profile
- 2D paired/unpaired view
- 3D residue coloring
- mapped residue table
- confidence view builder
- conflict / discordance candidate viewer
- download current-filter result

这个做法需要改。后续目标不是继续增强单页，而是拆成两套网页：

### 总表页

总表页是网站中心入口，负责总览所有数据。表格最小单位是 `case / child 类`，每个 `case / child 类` 占一行。

每行最少展示：

- 生物学分子名
- PDB 分子名
- confidence

总表页应承担全局搜索、筛选和当前筛选导出。`download current-filter result` 应主要归属于总表页，因为它依赖当前全局筛选条件。

### 详情页

详情页是一 case 一个页面，从总表页进入。详情页展示该 case 的细节，不再承担全局总览职责。

详情页应承载：

- RNA family / probe type / PDB ID / motif / structure class 信息
- 1D reactivity profile
- 2D paired/unpaired view
- 3D residue coloring
- mapped residue table
- confidence view builder
- conflict / discordance candidate viewer

详情页可以保留 case-level 下载或 route 链接，但不应把全局 current-filter export 作为主要能力。

## 后续并行推进边界

### 任务 A：路由和页面拆分

建议新增两个清晰路由：

```text
#annojoin-atlas
#annojoin-case?caseId=<case_id>
```

其中 `#annojoin-atlas` 只做总表页；`#annojoin-case` 做详情页。也可以改名为更直观的 `#annojoin-table` / `#annojoin-detail`，但需要同时更新 router、链接和测试。

### 任务 B：总表页字段真实性

总表页最小列必须来自明确字段，不要用占位 fallback 伪造语义：

| 总表列 | 优先来源 |
| --- | --- |
| 生物学分子名 | ANNOJOIN search index 中的 RNA family / motif / structure class 字段；若这些字段为空，应显式显示「未注释」，不要用 PDB ID 冒充 |
| PDB 分子名 | `pdb_id` 以及可用的 PDB title / entry metadata；当前 ANNOJOIN index 可能不足，需要确认是否已有上游字段或需要 join PDB metadata |
| confidence | FEC claim ceiling / recommended preset / evidence summary；必须定义清楚是展示 claim ceiling、view preset，还是聚合 confidence label |

如果上游缺少「生物学分子名」或「PDB 分子名」的可靠字段，后续任务应先补数据适配，不要在 UI 层 fallback 造字段。

### 任务 C：详情页分模块

详情页应拆成独立组件或渲染函数，避免再形成一个巨大模板：

- identity / facet summary
- 1D panel
- 2D panel
- 3D panel
- mapped residue table
- confidence view builder
- conflict candidate table

每个模块都应明确自己的输入资产和缺失数据状态。缺失状态要说明「无上游字段 / 未注释 / 未生成 preview」，不要把其它字段挪来当替代值。

### 任务 D：测试更新

现有测试中有一部分验证「一个页面包含 9 个 capability section」。拆页后应改为：

- 总表页测试：验证一行一个 case、必需列、全局筛选、current-filter export。
- 详情页测试：验证一个 case 页面包含 1D / 2D / 3D / mapped residue / confidence / conflict 模块。
- 数据契约测试：继续验证 `entryRoot=ANNOJOIN`、`browserLoadsAnnoconfidenceBigTables=false`、`annotationPayloadRowsCopied=0`。

## 当前验证命令

最近一轮验证过的命令：

```bash
npm test
npm run build:annojoin-atlas
npm run build:static
npm run verify:annojoin-atlas -- --sample-size 20
FOLDBRIDGE_PORT=55832 docker compose up --build -d foldbridge-web
```

后续重构完成前，不要把这些旧验证结果当作新页面拆分已经完成的证据。拆页后需要重新跑完整验证，并新增总表页 / 详情页对应测试。

## 剩余工作树注意事项

当前仓库还有一批与本分支目标无关的旧 `rmdb-pdb-cases` 生成资产脏改，主要位于：

```text
scripts/build-rmdb-cases.mjs
scripts/lib/rmdb-case-corpus.mjs
src/assets/generated/rmdb-pdb-cases/
```

这些不是 ANNOJOIN Atlas 拆页任务的一部分。后续并行开发时不要误提交、不要回滚，除非另有明确任务要求。

## 推荐下一步

下一步应先写一个小规格或计划，锁定：

1. 总表页路由名、详情页路由名和 URL 参数。
2. 总表三列的真实数据来源，尤其是「生物学分子名」「PDB 分子名」「confidence」。
3. 详情页各模块的输入资产和缺失数据状态表达。
4. 旧单页测试如何迁移为总表页测试和详情页测试。

确认后再改代码，避免继续沿用当前大单页结构。
