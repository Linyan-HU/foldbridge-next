# FoldBridge 首页、Stats 与 Probing 口径联动设计

## 目标

修正当前首页与 Stats 页面之间的统计口径漂移，并把 Stats 从“只更新摘要”的筛选器改成真正的轻量交叉联动 Dashboard。Probing 方法数量以 `#probing` 页面实际展示的方法集合为唯一口径，不与 Entry 行级数据或技术注册表强行对齐。

本次保持现有 FoldBridge 视觉体系和原生 JavaScript 架构，不引入图表库、框架或新的运行时依赖。

## 已确认的产品决策

1. 首页不展示 High confidence 指标。
2. Stats 不展示 High confidence 指标卡。
3. Stats 删除整个 Chain confidence 图表和 confidence 筛选维度。
4. 首页和 Stats 展示 Probing methods 数量，并与 `#probing` 页面保持一致。
5. 当前 `#probing` 页面实际展示 26 个方法，分属 5 个机制家族。
6. Probing methods 数量暂不与 Entry 行级数据、34 条技术注册表或 37 条生成文章索引对齐。
7. Stats 保留 RNA class 与 Evidence source 两个分布图，并实现真正的交叉联动。
8. 暂不把 Stats 筛选条件传递到 Entry 页面，也不增加跨页面全局筛选状态。

## 当前问题

### 首页

首页指标仍由 `HOME_METRICS` 硬编码，公开显示的 `4,664`、`2,386`、`510` 和 `26` 来自不同历史口径。相同常量还进入首页模块卡、滚动故事结尾和 Probing 总览文案，数据更新时容易再次漂移。

### Stats

Stats 当前只对顶部 “Showing …” 摘要应用筛选。两个未选中的图表仍读取构建期全量 `stats.distributions`，因此点击图表后柱长、数量和百分比不变化。现有测试明确锁定了全局图表计数，所以测试通过不代表实现了图表联动。

### Probing

`#probing` 的公开方法卡不是技术注册表的 34 行，也不是生成索引顶层的 37 篇文章。页面通过 5 组策展方法定义渲染 26 个可见方法，但标题中的 `26` 仍来自首页常量。当前“卡片集合”和“显示计数”只是碰巧一致，尚未共享同一派生模型。

## 单一口径模型

### Entry 口径

首页与 Stats 的 Entry 相关指标继续来自已经校验的 Stats bundle：

- RNA chains：17,843 条 canonical chain rows。
- PDB structures：5,321 个不同 `pdb_id`。
- Chains with probing profiles：14,953 条 `n_profiles > 0` 的 chain rows，仅在 Stats 展示。

这些值仍由 `entry-table.json` 派生，并由 `siteStatsStore` 校验 Stats 与 Entry 资产契约。

### Probing 口径

新增无 DOM 的 Probing overview model。该模型使用与 `#probing` 卡片墙相同的 5 组策展方法定义，输出：

```text
methodCount = 26
familyCount = 5
families     = 页面实际渲染的 5 个机制家族及其方法
```

以下界面只消费该模型，不再自行维护数字：

- `#probing` 页标题和方法卡片。
- 首页 Probing methods 指标卡。
- 首页 Probing methods 模块卡文案。
- Stats 顶部 Probing methods 指标卡。

这三个公开页面统一使用 “26 Probing methods” 或等价的 methods 表述，不再把 26 写成 articles、explainer articles 或 in-depth explainers。文章仍是方法详情页的内容形态，但 26 的统计对象始终是 `#probing` 当前展示的方法卡。

技术注册表中的 34 条记录和生成索引中的 37 条文章可以继续用于各自内部功能与资产校验，但不再作为这三个公开页面的 Probing methods 数量。

## 页面设计

### 首页

首页 Hero 保留 3 张指标卡，改为：

1. RNA chains：17,843。
2. PDB structures：5,321。
3. Probing methods：26。

删除 Chemical probing entries 和 High-confidence paired 的旧标签与数字。Entry 模块卡使用同一 Entry 口径；Probing methods 模块卡使用同一 Probing overview model。滚动故事结尾的结构数量也改用当前 PDB structures。

首页原有导航行为保持不变：Entry 入口仍进入 `#entry`，Probing 入口仍进入 `#probing`。

### Stats 顶部指标

Stats 顶部只展示 4 张指标卡：

1. RNA chains。
2. PDB structures。
3. Chains with probing profiles。
4. Probing methods。

不展示以下公开指标：

- PDBs with ≥1 high-confidence chain。
- Registered technologies。
- Explainer articles。

上述字段可暂时保留在生成资产和内部校验合同中，以避免无关 schema 迁移；前端不再渲染。

### Stats 图表

保留 2 个图表：

- RNA class distribution。
- Evidence source coverage。

删除 Chain confidence 图表、confidence chip、confidence filter state 和相关 UI 文案。

## 交叉联动语义

两个图表采用常见的分面计数（faceted counts）语义：计算某个图表时应用其他维度的筛选，但排除该图表自己的筛选。

示例：

1. 选择 `rRNA` 后，Evidence source 图表按 rRNA 子集重新计算；RNA class 图表保留可切换的类别。
2. 再选择 `RMDB` 后，RNA class 图表按 RMDB 子集重新计算；Evidence source 图表按 rRNA 子集保留可切换来源。
3. 顶部 “Showing …” 摘要应用所有筛选，显示最终交集的 chain 与 PDB 数量。
4. 再次点击已选值、删除 chip 或点击 Reset 时，重新计算两个图表和摘要。

RNA class 每条 chain 只属于一个类别。Evidence source 允许重叠，因此来源百分比之和可以超过 100%；页面继续明确说明这一点。

每个图表的动态数量、百分比和柱长使用同一上下文分母：先应用其他维度筛选并排除自身维度筛选，得到该图表的 context rows；分母为 context rows 的 chain 数。每个类别的百分比和柱长均为 `category chain count / context chain count`。context rows 为空时分母按 0 处理，百分比与柱长均为 0，并显示空状态，不继续使用全局 17,843 作为分母。

## 数据流

```text
entry-table.json
  -> siteStatsStore 校验
  -> Entry metrics + Stats 行级筛选

Probing 策展方法定义 + probing-articles index
  -> Probing overview model
  -> #probing 卡片与计数
  -> 首页 Probing methods
  -> Stats Probing methods

Stats filters (rna_class, source)
  -> 最终交集摘要
  -> 排除自身维度后的两个动态分布
  -> Stats 重新渲染
```

首页进入时同时启动所需的 Stats 与 Probing 现有加载流程。Stats 页面也复用已加载的 Probing overview model，不增加第三份计数资产。

## 加载与失败行为

- 不保留旧硬编码数字作为 fallback。
- Entry Stats bundle 未就绪时，首页和 Stats 的 Entry 指标显示加载状态；失败时显示明确 unavailable 状态。
- Probing overview 未就绪时，Probing methods 指标显示加载状态；加载失败时不退回 34、37 或硬编码 26。
- 一个数据源失败不应阻塞另一个独立口径。例如 Entry Stats 失败时，已经成功派生的 Probing methods 仍可显示。
- 页面其余导航、轮播和滚动故事不得因为统计加载失败而消失。

## 实现边界

### 包含

- 提取或新增共享的 Probing overview model。
- 首页指标、模块卡和滚动故事数字改为注入数据。
- Stats 顶部指标改版。
- 删除 Stats confidence UI 与 filter state。
- 新增两个图表的分面计数与真实联动。
- 更新相关单元测试、渲染测试、集成测试和浏览器验收。

### 不包含

- 不修改 Entry 页面数据口径。
- 不把 Stats 筛选传递到 Entry。
- 不把 Probing 26 个方法与 Entry 行级数据对齐。
- 不删除技术注册表或生成文章索引中的内部记录。
- 不新增 Plotly、D3、框架、后端 API 或新的 Dashboard bundle。
- 不重设计首页布局、配色、字体或主导航。

## 测试与验收

### 纯函数测试

- Probing overview model 派生 26 个方法和 5 个家族。
- `#probing` 实际渲染的方法卡数量等于 model 的 `methodCount`。
- RNA class 与 source 筛选使用 AND 逻辑。
- 每个图表的分面计数排除自身维度，但应用其他维度。
- Reset 恢复全量摘要与全量分布。

### 渲染测试

- 首页不再包含 `4,664`、`2,386`、`510` 或 High confidence 文案。
- 首页展示 RNA chains、PDB structures 和 Probing methods。
- Stats 不包含 High confidence 指标卡、Chain confidence 图表、Registered technologies 或 Explainer articles。
- Stats 只渲染 RNA class 与 Evidence source 两个图表。
- Probing、首页和 Stats 展示相同的 Probing methods 数量。
- Probing、首页和 Stats 不把 26 描述成 articles、explainer articles 或 in-depth explainers。

### 浏览器验收

- `#home` 显示 17,843、5,321 和 26，模块卡及滚动故事口径一致。
- `#probing` 显示 26 个方法、5 个机制家族，无 Chain confidence。
- `#stats` 显示 4 张指标卡、2 个图表，无 confidence UI。
- 点击 RNA class 后 Evidence source 数量、百分比和柱长变化。
- 继续点击 Evidence source 后 RNA class 数量、百分比和柱长变化。
- chip 删除与 Reset 正确恢复状态。
- 桌面与窄屏布局正常，浏览器控制台无错误。

## 预计改动规模

- 6 至 8 个源文件与测试文件。
- 约 200 至 350 行有效改动。
- 不增加运行时依赖，不新增大型静态资产。
