# D3.6 一主多比较 Profile 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框跟踪进度。

**目标：** 支持 1 个主 Profile 加最多 3 个自选比较 Profile，共同坐标视觉比较，不进行差异统计。

**架构：** 复用公开 index、shard 缓存、既有选择器与 SVG rail。比较状态独立于主项 lastRender，只有主项控制 2D/3D；纯函数和可注入 loader 的控制器提供可执行的行为测试。

**技术栈：** 原生 JavaScript ES modules、SVG、CSS、Node.js 内置测试。

---

## 工作区与文件

以下路径相对 `/Users/joseperezmartinez/docs/foldbridge/.worktrees/d36-profile-comparison`，命令均在该目录运行。基线 `de1aa1c51c`，分支 `codex/d36-profile-comparison`。不修改 D3.3 工作树，不推送或部署。

规格：`docs/superpowers/specs/2026-09-13-d36-two-profile-comparison-design.md`，文件名保留，内容为 1+3。

| 文件 | 职责 |
| --- | --- |
| `public/entry-cases/__entry_v3_site__/workbench-pure.mjs` | 资格、覆盖与异步比较控制器，复用归一化 |
| `public/entry-cases/__entry_v3_site__/workbench.js` | loader、控件、共同坐标行和主项变化通知 |
| `public/entry-cases/__entry_v3_site__/workbench.css` | 标签换行、状态、键盘焦点、局部滚动 |
| `test/case-profile-comparison.test.js`（新建） | 纯数据及真实异步状态行为 |
| `test/case-workbench-ui.test.js`、`test/case-workbench-responsive.test.js` | 入口和布局回归 |
| `scripts/version-ef-entry-assets.mjs`、`tests/ef-asset-version.test.mjs` | 候选版本与依赖闭包 |
| `docs/reviewer-response/2026-09-13-d36-profile-comparison-evidence.md`（新建） | 候选证据和验证边界 |

## 任务 1：资格、覆盖与独立尺度

- [x] 新测试导入 `comparisonCoverage(primary, comparison)`，加入以下用例、长度不等拒绝、非法输入拒绝、全缺失；运行 `node --test test/case-profile-comparison.test.js`，确认因缺少功能失败。

```js
assert.deepEqual(
  comparisonCoverage([0, -1, NaN, 2], [NaN, 0, 3, 4]),
  { length: 4, primaryFinite: 3, comparisonFinite: 3, sharedFinite: 2 },
);
```

- [x] 实现函数：只接受数组或非 DataView 的 TypedArray，验证等长，以 Number.isFinite 逐位计数，不转换字符串或补零。每个比较分别与主项求交集，不计算全体交集。
- [x] 为 `eligibleComparisonProfiles({profiles, primary, selectedIds, strandId})` 写失败测试：同 strand/映射/长度，严格链大小写，排除主项和已选项，非 index 成员拒绝。核对实际字段，不假设 index 提供未确认字段；映射以当前 Case strand 为准，不推断跨链等价。
- [x] 实现最小资格函数；分别调用已有 normalizeReactivityProfile，测试各项 P95 独立、保存值不变、零负值计入、全缺失无伪信号。
- [x] 运行 `node --test test/case-profile-comparison.test.js test/case-workbench-pure.test.js`，预期全通过。精确暂存上述纯模块与新测试，提交 `feat(比较): 增加 Profile 资格与覆盖计算`。

## 任务 2：最多三项的独立异步状态

- [x] 测试 `createProfileComparisonController({load, onChange})`，接口为 setContext、add、remove、snapshot、dispose。context 包含 Case/chain、已加载主项、strand 与 index；snapshot 是有序快照，不暴露可变内部集合。先运行新测试确认失败。
- [x] 实现最多 3 项，按添加顺序，pending/error 也占位。拒绝重复/第四项，独立移除；主项改变保留合格项、移除失效项并提供原因，不自动替换。加载新主项时暂停添加并避免新旧摘要混用。
- [x] 使用可控 Promise 写红灯测试：B/C/D 以 D/B/C 顺序返回；移除重加 B 后旧 B 返回；切换主项、Case 或 dispose 后旧响应；单项失败其余保留。实现上下文代次和每项 token，旧响应不得重绘或复活；一项完成不能使其他项失效。
- [x] 在 loadShard 增加进行中 Promise 去重，缓存限定 Case 上下文；finally 清除请求槽，不自动重试。提取可注入 loader 的小 helper 到纯模块以测试同 shard 并发只读取一次、失败后仅用户再次选择才重读。
- [x] 在读取边界先写失败测试，再校验 row_index 为非负整数、行边界、strand_length、profile_count、Float32 数据总长和身份；不以短 subarray、截断或补齐作为成功。loader 失败只影响本项，主项及其他比较不变。
- [x] 运行任务 1 命令，预期全通过；精确暂存本任务文件，提交 `feat(比较): 隔离多 Profile 加载状态与竞态`。

## 任务 3：选择控件与共享 SVG 行

- [x] UI/响应式测试先增加缺失功能的红灯：普通模式专属；默认无比较请求；添加、移除、满额、无候选状态；比较不得调用 renderProfile 或结构着色。状态行为以任务 2 的可执行测试为主，不用正则代替异步验证。
- [x] 在现有 Profile 选择器附近复用公开标签/ID 搜索模式添加 Add comparison；候选排除主项和已选项，不随 Technique 隐式变化。每项有 Remove、loading/error 状态，安全文本赋值，满额提示 3/3。
- [x] 主项成功建立 lastRender 后更新 controller context；切换开始暂停添加，失败保留与实际主项一致的上下文。离页/Case 切换清空。比较操作只调用比较重绘，不能重新初始化 VARNA/Molstar。
- [x] 为 renderProfile 自身增加主项请求代次：每次开始生成 token，在每个 await 后及任何 UI/state 写入前验证；过期成功或失败均不得改写 VARNA、lastRender、selector、Molstar、比较 context 或恢复添加状态。用可控 Promise 测试 A→B、B 先完成、A 后成功/失败时最终仍为 B；先确认红灯再实现，不能只依赖比较 controller 的 token。
- [x] renderTrackRail 按已加载比较数扩展 rows/height；主行坐标与事件不变，新增行使用相同 xForIndex/cellWidth。保留 scrollLeft；复用 C 三状态填色/缺失纹理，各行独立 normalized 值。loading/error 不画伪数据。
- [x] 比较行提供自身位点、保存值、显示值、缺失状态的 hover/focus；不绑定修改主选择或 inspector 的 handler。显示 Primary/Comparison 编号、完整 ID、方法、P95、coverage、与主项 shared。无正值时不制造有效尺度；长 ID 换行，独立尺度警告可见。
- [x] 运行 `node --test test/case-profile-comparison.test.js test/case-workbench-pure.test.js test/case-workbench-ui.test.js test/case-workbench-responsive.test.js`。指纹断言需要下一任务刷新后作最终判断，不把旧运行时通过当作新源码生效。

## 任务 4：候选指纹、浏览器及证据

- [ ] 采用未占用的 `20260913-reviewer-d36-1`，若已占用则检查后选新后缀，不覆盖旧指纹。更新版本常量、静态 imports、动态 E/F URL 的同版引用。单写者运行 `node scripts/version-ef-entry-assets.mjs public` 和 `node scripts/version-ef-entry-assets.mjs public --check`，预期成功；不改变 per-case index 或数据。
- [ ] 运行 `node --test test/case-profile-comparison.test.js test/case-workbench-pure.test.js test/case-workbench-ui.test.js test/case-workbench-responsive.test.js test/entry-case-embed.test.js tests/ef-workbench-integration.test.mjs tests/ef-asset-version.test.mjs`，记录真实数量；失败先诊断，不删测试绕过。
- [ ] 建立本地候选预览：共享资产来自本工作树，Case 数据只读映射自生产数据。先核对现有 dev 路由；稀疏树不支持完整预览时使用独立临时只读映射服务，不复制覆盖生产树。记录实际端口、资源版本与数据路径。
- [ ] 浏览器核验 8SQ9/P 跨方法；10FZ/A 或 1GID/A 普通模式选满 3 个比较、删除中间再补入；7UPH/I 长链窄屏。核对各项 ID、shard 保存值、P95、逐项 shared、同位置 x、共享滚动、键盘、主项 2D/3D 不变和控制台。不能以 E/F 截图代替普通模式。
- [ ] 回归 C 三状态、Technique 提示、E/F 无比较控件及 D3.4 下载。按 @requesting-code-review 审查，按 @verification-before-completion 复验后填写证据文件；明确候选与线上边界，不宣称全部源实验缺少重复。
- [ ] `git diff --check`；精确暂存本功能源码、测试、指纹和文档，提交 `feat(比较): 支持一主三比较的对齐轨道`，不推送。

## 完成与集成边界

2026-09-13：任务 1–3 已实现，任务 1/2 的纯函数与控制器合并为一个本地提交 `ce6336fc9c`，避免将紧密依赖的新测试拆为不完整提交。任务 4 已完成候选版本生成、102/102 相关回归、真实样本操作及代码复审；浏览器 Molstar 逐位颜色对照、全部下载落盘及非零滚动自动断言尚未完成，详见 `docs/reviewer-response/2026-09-13-d36-profile-comparison-evidence.md`。不是全量 npm test，也没有部署。新增独立 UI 行为测试放在 `test/case-comparison-ui.test.js`，未扩写原大测试文件。

与 D3.3 集成前核对最新提交，逐块合并共享文件，重新生成统一指纹并重跑回归，不能用旧文件覆盖。上线需另获授权，按更新维护手册执行 Case/Tunnel 精确发布、回滚与 iframe 验证，不以 Pages 构建作为必要条件。
