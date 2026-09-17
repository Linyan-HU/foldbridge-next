# Help / About 单页合并设计

## 背景

`release-public` 当前把 `#help` 归一化为 `#about`，导航上的 Help 也实际指向 `about`。Help 内容仍然存在，但独立 Help 路由和页面身份在刷新提交中丢失。与此同时，About 的方法学内容仍保存在 `about-content.json`，却不再被当前页面加载。

## 目标

- 恢复 `#help` 作为唯一正式 Help 页面和导航目标。
- 将现有 Help 使用指南与 About 方法学内容合并为一个连续页面。
- 保留现有 Help 截图、联系、反馈和团队信息。

## 路由设计

- `help` 加回允许路由集合。
- 主导航 Help 使用 `data-route="help"`，Help 活跃态对应 `help`。
- 页面分发只保留 `helpPage()`；不再通过名为 `aboutPage()` 的函数渲染 Help。
- `about` 不保留路由或跳转逻辑，按普通未知路由处理。

## 内容与页面结构

`src/assets/data/help-content.json` 成为合并页面的单一内容源，页面顺序固定为：

1. Help Hero
2. About FoldBridge
3. Search channels
4. Interactive visualisation
5. Data sources
6. Data collection and alignment
7. Structural ground truth
8. ANNOJOIN pipeline
9. Confidence labels
10. Measurement families
11. LSS confidence calculation
12. Tier calibration
13. Recall tiers
14. Thresholds
15. How to make a feedback
16. How to contact us
17. Group Members

About 中与 Help 的简短产品介绍重复的部分不重复增加第二个 Hero；保留 Help 的 `About FoldBridge` 作为面向用户的入口说明，再接方法学内容。

## 渲染与加载

- `renderHelpSection()` 增加 `pipeline` 类型支持，复用现有 `renderAboutPipeline()`。
- Help 页面继续使用现有 Help 样式和团队卡片。
- `main.js` 只加载 Help 内容 Store；移除失去运行时用途的 About Store 导入、状态和加载函数。
- 保留现有 `about-content.json`、About Store 和 About 渲染器文件，避免本次快速修复扩大到历史资产删除；它们不再参与正式页面运行时。
- Help 内容加载失败时继续显示现有最小 Help 错误壳，不进入无限重试。

## 测试

- 路由测试断言 `help` 保持为 `help`，`about` 不再是支持的路由。
- 导航测试断言 Help 指向 `data-route="help"`，不再指向 `about`。
- Help 渲染测试覆盖合并后的 About 方法学章节及 ANNOJOIN pipeline SVG。
- 现有 Help 使用流程、反馈、联系和团队渲染测试保持通过。
- 运行相关单元测试、完整测试套件和生产构建。

## 非目标

- 不重新设计 Help 页面视觉。
- 不修改生成的 atlas/entry 数据。
- 不重写 About 方法学文案或重新校准科学阈值。
- 不删除历史 About 文件和测试；清理可在后续独立任务中完成。

## 发布

验证通过后仅提交本次相关文件，推送 `release-public`，由现有 GitHub Actions 流程重建 `public`。发布后核对远端 `release-public` 和 `public` 提交，以及正式站点的 `#help` 路由行为。
