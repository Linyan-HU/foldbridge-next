# D3.6 一主多比较：本地候选证据

## 状态与边界

2026-09-13，本地候选版本 `20260913-reviewer-d36-1`，分支 `codex/d36-profile-comparison`，基于 `de1aa1c51c`。实现已写入独立工作树；没有推送、部署或覆盖 D3.3 工作树。本文不是线上验证记录。

候选预览使用本工作树共享资产，Case 数据只读来自 `/Volumes/tianyi/Server/public`，服务为 `http://127.0.0.1:53436`。临时服务脚本 `/private/tmp/foldbridge-d36-preview.cjs` 仅监听本机。

## 实现范围

同日 UI 简化：自选比较操作区默认折叠为 `Compare profiles (0/3)`，点击展开。折叠不删除选项、不隐藏比较轨道；存在比较时独立尺度说明仍显示。8SQ9/P 浏览器复验：展开添加 DMS 后再折叠，选择器不可见、35 个比较标记仍在，入口计数为 1/3。新增回归后相关测试为 103/103。

普通 Profile 支持 1 个主项和最多 3 个自选比较项，可搜索、逐项添加/移除。共同 SVG 坐标及滚动容器，各自 P95 显示尺度。主项继续控制 2D/3D 与 inspector；比较位点提供自己的保存值、显示值与缺失说明。Technique 筛选不隐式改变比较集合。

每项显示有限值覆盖及与主项的共同有限值覆盖。零值、负值计入，非有限值不计入。没有共同有效位点时明确提示，不计算差值、相关或显著性，也不进行跨技术统一标定。保存值指 shard 输入值，不能据此宣称源实验无重复或无误差信息。

## 自动验证

```bash
node --test test/case-comparison-ui.test.js test/case-profile-comparison.test.js test/case-workbench-pure.test.js test/case-workbench-ui.test.js test/case-workbench-responsive.test.js test/entry-case-embed.test.js tests/ef-workbench-integration.test.mjs tests/ef-asset-version.test.mjs
node scripts/version-ef-entry-assets.mjs public --check
git diff --check
```

相关回归 102/102 通过，资产闭包检查 13 个文件、0 变更。不是全量 npm test 结论。

新测试经红绿流程覆盖：三项上限、去重、独立删除与重加、每项失败、主项/Case 变化、过期响应与 dispose、同 shard 并发去重、身份/行界/长度拒绝、有限覆盖、独立尺度。直接执行抽取的 renderProfile 测试验证 A→B 乱序成功/失败不能覆盖 B。

独立代码审查发现 index.length 校验遗漏；补充先失败测试并在资格与读取两处修复后，复审无待处理 Critical/Important。浏览器发现移除后旧位点提示残留，已增加清理及回归断言。

## 真实浏览器及 shard 对照

| 样本 | 已观察结果 |
| --- | --- |
| 8SQ9/P | 默认无比较；DMS 比较可添加/移除，共 35 个比较标记；主项与比较首位点 x 均为 210.5。P95 分别 7.877619779 与 4.003799915，finite/shared 均 35/35，与直接读取 shard 计算一致 |
| 8SQ9/P 键盘/主项 | Tab 聚焦后显示 position 2、stored 0、display 0、nonpositive。切主项至已选 DMS 后自动移除重复比较，并说明原因 |
| 10FZ/A | 3 项产生 4626 个标记，添加控件禁用；移除中间项后可补入，保持添加顺序。比较覆盖/共同覆盖分别 63、54、60 /1542；P95 为 1.571089995、1.411700010、2.845474899，与 shard 对照一致 |
| 10FZ/A 窄屏 | 390×844 截图中标签换行、Remove 可操作，信号行在局部滚动容器，2D 区域仍在下方；测试后已恢复默认视口 |
| 7UPH/I | 4438 个比较标记；主项 finite 109/4438，比较 finite 108/4438，shared 0/4438，显示 No common finite positions。各自 P95 1.232622427、1.192669988，与 shard 对照一致 |
| 1GID/A 普通模式 | 下拉含占位项共 6226 项（6225 个候选，排除主项）；搜索 #853 后唯一命中，实际加载 finite/shared 70/158、P95 1.228 |
| 1GID/A E 模式 | 比较控件数为 0；Download heatmap (SVG) 与 Download matrix data 入口仍显示。已检查页面错误日志，无新增错误 |

浏览器操作在长链一次返回超时，但后续读取确认比较已完成，4438 标记和覆盖摘要可见，没有据超时直接重复添加。

## 不夸大的验收边界

- 2D/3D 主项所有权经代码和连线测试检查；本轮未完成浏览器中 Molstar 颜色逐残基前后逐项对照，不把它称为完整三维视觉验收。
- 本轮验证 E 下载入口和 E/F 自动回归，未重新完成 E/F 下载文件落盘验收；沿用 D3.4 已有记录，不新增下载成功声明。
- 共享滚动结构和窄屏已检查，尚未建立自动化“非零 scrollLeft 在所有异步更新后不变”的浏览器断言。
- 后续与 D3.3 集成需逐块合并共享文件并生成统一新指纹，重新回归；不能直接覆盖另一工作树。
- 上线另获授权后按维护手册执行 Case/Tunnel 精确发布及主站 iframe 验证，不以 Pages 构建为 Case 生效前提。
