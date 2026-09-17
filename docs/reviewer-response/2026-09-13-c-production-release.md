# 2026-09-13 C 类生产发布记录

## 结论

C 类第一批修复已分别通过主站 GitHub Pages 与 Case/Tunnel 两条生产链上线。主站搜索、
主站布局、Case 筛选反馈、VARNA 双轴滚动和反应性三状态均完成线上复验。D 类本次只完成
范围评估，没有实现或发布 D3.3、D3.4、D3.6。

## 主站 GitHub Pages

- 首次上线应用提交：`747ba87d398af4128a09422047a5cd53302a1f54`。
- Pages run：`34736893873`；build 与 deploy 均成功。
- Pages source：`main` 分支仓库根目录；run `34736893873` 的 head 与首次上线应用提交一致。
- 公网根页面：`https://foldbridge.ribocentre.org/`，HTTP 200。
- 搜索源码 SHA-256：
  `de5f970b621161d46abec1496bf3fa6b741dab7d597e0c1e01f9e4cf88415665`，仓库与公网一致。
- 样式源码 SHA-256：
  `eb0483eee296e7993ad6a6d949120e4a3d407a2784dd2725c6a2e8776cb59d11`，仓库与公网一致。
- 真实浏览器：`pdb_00001ddy` 与 `1DDY` 都返回同一组 4 条链结果 A/G/E/C；实测文档宽度
  `1265/1265`，没有页面级横向滚动。
- 已知限制：首次公网 Pagefind 冷启动的结果等待曾超过 60 秒，随后正常显示 4 条结果；
  缓存后的查询立即完成。本次只证明结果正确与等价，不宣称冷启动性能已经达标。

## Case/Tunnel

- 发布版本：`20260912-reviewer-c-1`。
- 发布范围：12 个新增指纹资产、5 个无版本入口，共 17 个精确文件；不修改 Case 数据目录。
- 回滚：本机保留带 UTC 时间戳的回滚点和逐文件运维清单，记录发布前后 SHA-256、大小和
  文件状态；精确本机路径不进入对外 reviewer 证据。
- 生产闭包：`checkedFiles=13`、`changedFiles=0`；17 个文件与候选逐字节一致。
- `workbench.js` SHA-256：
  `33818f44eda0ad4236080174532f48e441ec136577994526fb476eded997f721`，仓库、本机服务和公网一致。
- 当前指纹 `case-shell.20260912-reviewer-c-1.css` SHA-256：
  `c3add5e9df990f8f2e69dfeae3ed7b53c4f901a94a778989911dcef430e4a7f0`，仓库与公网一致。
- 本机与公网 8SQ9/P 均返回 HTTP 200；公网 CORS OPTIONS 为 HTTP 204，且允许来源为
  `https://foldbridge.ribocentre.org`。
- 8SQ9/P：DMS 筛选提示命中 1 个 Profile，不切换 Profile 或重绘 1D、VARNA、Mol*；
  清空后恢复全部 2 个。VARNA 140% 的内容大于容器宽高，1:1 复位后滚动位置归零。
- 10FZ/A Profile 1：1D 与 VARNA 均为 `missing=1488`、`measured <= 0=3`、
  `positive=51`，每个视图 1,542 个节点。
- 8SQ9/P 冷启动访问日志按 URL `pathname` 检查 35 条请求，`.rdat`、`/api/`、RMDB
  资源路径为 0；Profile ID 中的 `.rdat` 只位于查询参数。

## 测试与发布边界

- C 类定向套件：102/102 通过。
- 完整 `npm test`：342 项，336 通过、6 失败；失败集合与既有基线一致，包括 1 个 sealed v2
  provenance commands 漂移和 5 个沙箱对私有外接卷 staging 根的 `EPERM`。
- 指纹闭包检查：13 项全部一致，`changedFiles=0`。
- `git diff --check`：通过。
- Case 回滚点和旧指纹保留；未使用强制推送，未删除生产 Case、RDAT 或旧资源。

## Reviewer 回复边界

可以据此说明 C 类修复已上线，并引用对应的自动测试、候选复现协议、生产哈希和浏览器结果。
D 类只能说明已经完成实现范围、数据覆盖、依赖、科学风险和工作量评估；不能声称功能已上线。
