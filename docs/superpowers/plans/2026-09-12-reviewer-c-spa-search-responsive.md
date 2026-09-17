# 评审 C 类主站修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成 C1.5 中主站 Home、Search、Entry 与 Entry Case 外层页面的响应式修复，并让 C1.6 的既有四字符 PDB ID 扩展写法在 Pagefind 搜索中与原 ID 等价。

**架构：** 查询规范化只发生在 `searchService` 调用 Pagefind 前，页面输入框和返回模型继续保留用户原始查询。响应式修复只收紧现有主站 CSS 的偏移、宽度和断点规则；Entry 表保留局部横向滚动，Entry Case 保留现有跨源高度同步，不改 iframe 协议。

**技术栈：** 原生 JavaScript ES modules、Pagefind、CSS、Node.js `node:test`、浏览器视口验收。

---

## 依据与边界

- 设计规格：`docs/superpowers/specs/2026-09-12-reviewer-c-fixes-and-d-assessment-design.md`
- 发布手册：`/Users/joseperezmartinez/docs/foldbridge/.worktrees/update-deployment-handbook/docs/网站更新手册_DEPLOYMENT_HANDBOOK.md`
- 工作树：`/Users/joseperezmartinez/docs/foldbridge/.worktrees/ef-unified-main-sparse`
- 本计划只处理 Pages 源码；不改 `/Volumes/tianyi/Server/public`，不发布、不推送。
- 当前分支不含 `scripts/build.mjs`、`scripts/dev.mjs`、`scripts/build-pages.mjs` 和 `scripts/verify-mvp.mjs`；不运行对应的 `npm run build`、`npm run dev`、`npm run build:pages` 或 `npm run verify:mvp`，也不声称本地已重建 Pages 产物。
- 两份 C 类计划在同一分支上串行执行：先完成本计划，再执行 Case 计划；禁止并行修改两者共用的 `test/entry-case-embed.test.js`。

## 文件结构

- 修改：`src/search/searchService.js`——新增严格的 Extended PDB 查询规范化，并仅把规范化结果传给 Pagefind。
- 修改：`src/styles.css`——修复主站导航偏移、窄屏卡片/表单/Entry Case 外层宽度；保留表格局部滚动。
- 新建：`test/search-service.test.js`——覆盖查询规范化和 Pagefind 实际入参。
- 新建：`test/responsive-layout-contract.test.js`——锁定主站关键响应式规则，防止固定偏移和全页横向溢出回归。
- 修改：`test/entry-case-embed.test.js`——补充 Entry Case 外层宽度与高度桥接不回归的断言。
- 新建：`docs/reviewer-response/2026-09-12-c1.5-c1.6-spa-evidence.md`——记录复现、修改、测试和浏览器验收；发布前线上状态必须写为“未发布”。

### 任务 1：建立主站基线并固定失败用例

**文件：**

- 新建：`test/search-service.test.js`
- 新建：`test/responsive-layout-contract.test.js`
- 修改：`test/entry-case-embed.test.js:179-200`

- [ ] **步骤 1：确认分支和工作树没有意外修改**

运行：

```bash
cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/ef-unified-main-sparse
git status --short --branch
git merge-base --is-ancestor ghhttps/main HEAD
```

预期：位于 `codex/reviewer-c-fixes`；除计划/规格文档外没有不相关改动；第二条命令退出码为 0。

- [ ] **步骤 2：为 Extended PDB 查询写失败测试**

在 `test/search-service.test.js` 写入以下行为：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchService, normalizeSearchQuery } from '../src/search/searchService.js';

test('normalizes only strict legacy-width Extended PDB IDs', () => {
  assert.equal(normalizeSearchQuery(' pdb_00001ddy '), '1DDY');
  assert.equal(normalizeSearchQuery('PDB_00001DDY'), '1DDY');
  assert.equal(normalizeSearchQuery('1DDY'), '1DDY');
  assert.equal(normalizeSearchQuery('pdb_00001dd'), 'pdb_00001dd');
  assert.equal(normalizeSearchQuery('pdb_00001ddyy'), 'pdb_00001ddyy');
  assert.equal(normalizeSearchQuery('pdb_000012345'), 'pdb_000012345');
});
```

再用一个假的 `pagefindLoader` 记录 `pagefind.search()` 的第一个参数，断言：

- `search({ q: 'pdb_00001ddy' })` 传给 Pagefind 的是 `1DDY`；
- 返回对象中的 `query` 仍为 `pdb_00001ddy`；
- 普通文本 `riboswitch` 原样传入；
- `pdb_00001ddy` 和 `1DDY` 在同一假结果集下得到相同 `items` 与 `total`。

- [ ] **步骤 3：为响应式规则写失败测试**

在 `test/responsive-layout-contract.test.js` 读取 `src/styles.css`，断言：

- `@media (max-width: 1100px)` 内 `.bundle-home-route-nav` 明确复位 `left: 0`；
- `@media (max-width: 720px)` 内 Search 表单和布局为单列；
- `.entry-table-wrap` 保持 `overflow-x: auto`，而不是把 980px 表格宽度泄漏到页面；
- `.entry-case-embed` 与 `.entry-case-embed-frame` 使用容器宽度，且不引入 `100vw`；
- `body` 不依赖新增的宽屏固定 `min-width`。

在 `test/entry-case-embed.test.js` 的布局测试中补充：iframe 仍是 `width: 100%`，且继续通过 `mountEntryCaseHeightListener()` 处理高度，不恢复 `height: calc(100vh...)`。

- [ ] **步骤 4：运行测试，确认红灯原因正确**

运行：

```bash
node --test test/search-service.test.js test/responsive-layout-contract.test.js test/entry-case-embed.test.js
```

预期：新测试因 `normalizeSearchQuery` 尚未导出、1100px 断点未复位 `left` 等明确原因失败；既有高度桥接断言仍通过。

### 任务 2：实现 C1.6 Extended PDB ID 搜索

**文件：**

- 修改：`src/search/searchService.js:59-117`
- 修改：`src/search/searchService.js:168-200`
- 测试：`test/search-service.test.js`

- [ ] **步骤 1：增加严格纯函数**

在 `src/search/searchService.js` 导出 `normalizeSearchQuery(value)`：

```js
const LEGACY_EXTENDED_PDB_ID = /^pdb_0000([0-9a-z]{4})$/i;

export function normalizeSearchQuery(value = '') {
  const query = String(value || '').trim();
  const match = LEGACY_EXTENDED_PDB_ID.exec(query);
  return match ? match[1].toUpperCase() : query;
}
```

不要截断其他长度，不把未来真正超过四字符的 Extended ID 伪装成四字符 ID。

- [ ] **步骤 2：只规范化 Pagefind 入参**

在 `search()` 中同时保留：

- `query`：trim 后的原始查询，用于 UI、URL 和返回模型；
- `pagefindQuery`：`normalizeSearchQuery(query)`，仅用于 `pagefind.search()`。

把第 187 行附近调用改为 `pagefind.search(pagefindQuery || null, ...)`，其他筛选、分页和结果映射不变。

- [ ] **步骤 3：运行定向测试**

运行：

```bash
node --test test/search-service.test.js test/search-corpus-route.test.js
```

预期：全部通过；`test/search-corpus-route.test.js` 仍报告 17,843 个唯一 PDB×chain 搜索文档。

- [ ] **步骤 4：提交查询修复**

```bash
git add src/search/searchService.js test/search-service.test.js
git commit -m "fix(搜索): 支持旧式 Extended PDB ID 查询"
```

### 任务 3：实现 C1.5 主站响应式修复

**文件：**

- 修改：`src/styles.css:5116-5125`
- 修改：`src/styles.css:5482-5523`
- 修改：`src/styles.css:5534-5605`
- 修改：`src/styles.css:6702-6808`
- 修改：`src/styles.css:6992-7008`
- 修改：`src/styles.css:8433-8499`
- 测试：`test/responsive-layout-contract.test.js`
- 测试：`test/entry-case-embed.test.js`

- [ ] **步骤 1：移除平板宽度下的残留水平偏移**

保留桌面 `.bundle-home-route-nav { left: 220px; }` 的现有构图，但在 `@media (max-width: 1100px)` 中明确写入 `left: 0`。不要用 `body { overflow-x: hidden }` 掩盖超出视口的导航。

- [ ] **步骤 2：收紧窄屏容器和表单**

在现有 720px 断点中：

- Search 标题、表单、筛选和结果继续单列；按钮/输入允许收缩且不超出卡片；
- Entry 页面缩小左右 padding，但 `.entry-table-wrap` 保持局部 `overflow-x: auto`；
- `.entry-case-embed` 使用 `width: min(var(--feature-card-width), 100%)` 或等价容器约束，iframe 保持 `width: 100%`；
- 不修改 `entryCaseEmbed.js` 的可信来源校验、高度上限和 `scrolling="no"` 协议。

只有浏览器复现确认某条规则实际导致溢出时才增加对应 CSS；不要顺手重做全站断点。

- [ ] **步骤 3：运行定向测试**

运行：

```bash
node --test test/responsive-layout-contract.test.js test/entry-case-embed.test.js test/entry-technique-filter.test.js
```

预期：全部通过，Entry 表仍是局部横向滚动，Case 高度同步断言不变。

- [ ] **步骤 4：提交响应式修复**

```bash
git add src/styles.css test/responsive-layout-contract.test.js test/entry-case-embed.test.js
git commit -m "fix(布局): 修复主站关键页面窄屏溢出"
```

### 任务 4：静态预览与四视口浏览器验收

**文件：**

- 新建：`docs/reviewer-response/2026-09-12-c1.5-c1.6-spa-evidence.md`

- [ ] **步骤 1：运行可用的主站验证**

```bash
git diff --check
npm test
```

预期：`git diff --check` 退出码 0；本计划的新增和相关测试通过。若 `npm test` 仍出现手册记录的既有 taxonomy provenance/外卷权限失败，必须记录精确测试名和当前输出，不能写成“全部通过”。由于构建入口不存在，本步没有“构建成功”结论。

- [ ] **步骤 2：启动本地站点**

```bash
git sparse-checkout add dist
python3 -m http.server 8898 --directory .
```

打开 `http://127.0.0.1:8898/index.html`。这个预览直接加载当前 `src/` 以验收布局和查询规范化，同时使用 Git 已跟踪的现有 `dist/pagefind/` 索引；它不是新构建产物，不用于证明 Pages 已发布。验收后在终端用 `Ctrl-C` 停止服务。

- [ ] **步骤 3：按 4 个视口逐页验收**

在 1440×900、1024×768、768×1024、390×844 下检查：

- `#home`
- `#search`
- `#entry`
- `#entry-case?pdb=8SQ9&chain=P`

每页确认 `document.documentElement.scrollWidth <= document.documentElement.clientWidth`；允许 `.entry-table-wrap` 自身横向滚动。检查导航、Search 表单、筛选控件、表格外框和 Case iframe 无裁切/重叠；Case 页面只有主页面纵向滚动，不出现双重纵向滚动条。

- [ ] **步骤 4：验收搜索等价性**

分别搜索 `1DDY` 与 `pdb_00001ddy`，记录结果总数和结果 href 列表；两者必须完全一致。再搜索 `riboswitch` 和一个相似但非法的 `pdb_00001ddyy`，确认普通查询未被改写。

- [ ] **步骤 5：写入 rebuttal 证据**

用 `apply_patch` 新建证据文档，按 C1.5、C1.6 分节记录：

- 原始复现；
- 最小修改；
- 自动测试命令与输出摘要；
- 4 个视口结果；
- 搜索等价样例；
- 当前线上状态：未获得推送/发布授权时明确写“未发布”。

- [ ] **步骤 6：提交证据**

```bash
git add docs/reviewer-response/2026-09-12-c1.5-c1.6-spa-evidence.md
git commit -m "docs(评审): 记录主站 C 类修复证据"
```

## 发布闸门（不在当前授权内）

到这里停止。只有用户另行明确授权推送/发布后，才按手册执行：同步最新 `ghhttps/main`、rebase、`git push ghhttps HEAD:main`，并核对远端 SHA、Pages build、公共字节和真实浏览器行为。不得推送 `origin`，不得把本地 `dist/` 当作线上验收。
