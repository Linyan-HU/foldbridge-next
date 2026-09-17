# E1.3 / E1.4 网站一致性修复

## 状态与边界

本地候选，尚未推送或上线。分支：`codex/e-consistency`；起点：`eb9c01ffb070665d314a030448aad23dcdea9bc4`。
不包含 E0.1 维护政策，不修改 D3.6，也不修改稿件。后续按用户指定补充了 E0.1 数据提交联系入口，见下文。

## E0.1 数据提交联系入口

Help 新增独立的 Data submission 区块，说明用户可邮件联系苗智超研究员沟通数据提交；显示邮箱 `miao_zhichao@gzlab.ac.cn`，链接为对应 `mailto:`。保留原通用联系邮箱，不自动发送邮件。

此项只补充数据提交沟通渠道，不表示已建立自动提交系统，也不承诺维护周期或审核时限。E0.1 中维护与更新计划仍需另行说明。本项同样尚未上线。

新增回归测试验证提交区块、邮箱链接、联系人及原通用邮箱；连同原相关测试共 44 项通过。

## 已实现

- E1.4：正式名称为 Ribocentre-FoldBridge，简称为 FoldBridge。浏览器标题和共享页头显示正式名称；首页和 Help 首次介绍定义简称；导航、按钮继续使用简称。
- E1.3：在 Probing 的人工说明、卡片摘要、正文、PPT 标题与图注中渲染科学术语斜体。有限词表包括 in vivo、in vitro、in situ、in silico、ex vivo、de novo、E. coli、Escherichia coli、Arabidopsis thaliana、Saccharomyces cerevisiae。
- 渲染前转义文本；代码片段、标识符、DOI、链接和原始文章 JSON 保持不变。图片内嵌文字不在本次范围内。
- E1.3 原意见针对 manuscript；网站修复不能替代稿件全文格式核查。

## 验证

2026-09-13：新增测试先失败，再完成修复。以下相关测试共 43 项通过，`git diff --check` 通过；未运行全仓测试或生产构建。

```sh
node --test test/site-consistency.test.js test/probing-overview.test.js test/home-stats.test.js test/responsive-layout-contract.test.js
git diff --check
```

独立审查发现图注标题与 PPT 小标题遗漏，已补齐，并加入 5 篇现有文章的渲染测试。
本地浏览器在端口 53438 验证：Help 标题为 Ribocentre-FoldBridge，共享页头有正式名称，Help 正文定义简称；DMS-seq 页面的小标题包含 `<em>in vivo</em>`。

## 后续发布验收

获得发布授权后按网站维护手册发布。主站需包含新增 `src/scientificProse.js` 模块；共享页头 `src/portalChrome.js` 还需核对 Case/Tunnel 的实际服务版本。分别验证公开标题、首次介绍及文章斜体，不能用本地结果代替线上证据。
