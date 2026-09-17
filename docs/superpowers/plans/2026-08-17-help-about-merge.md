# Help / About 单页合并实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 在当前会话逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 恢复 `#help` 为正式页面，并将 Help 与 About 内容合并为单一内容源。

**架构：** 路由层只保留 `help`；页面层只加载 `help-content.json`；渲染层复用现有 About 卡片、表格和 pipeline 渲染函数。保留历史 About 文件但退出运行时路径，避免扩大快速修复范围。

**技术栈：** 原生 ES modules、hash router、静态 JSON 内容、Node.js `node:test`、npm 静态构建、GitHub Actions 部署。

---

## 文件结构

- 修改 `test/router.test.js`：锁定 `help` 规范路由并确认 `about` 不再受支持。
- 修改 `test/site-chrome.test.js`：锁定 Help 导航、合并内容和 pipeline SVG。
- 修改 `src/router.js`：恢复 `help` 并移除 `about` 路由。
- 修改 `src/siteChrome.js`：导航指向 Help，Help 支持 pipeline section。
- 修改 `src/main.js`：只保留 Help Store 和 `helpPage()` 运行时路径。
- 修改 `src/assets/data/help-content.json`：吸收 About 方法学章节，成为单一内容源。

### 任务 1：建立路由与合并内容回归测试

**文件：**
- 修改：`test/router.test.js`
- 修改：`test/site-chrome.test.js`

- [ ] **步骤 1：编写失败的路由测试**

将旧断言改为：

```js
assert.equal(normalizeRoute('help'), 'help');
assert.equal(normalizeRoute('about'), 'home');
assert.equal(routeFromHash('#help'), 'help');
assert.equal(routeFromHash('#about'), 'home');
```

导航测试断言 `data-route="help"`，`renderPrimaryNav('help')` 激活 Help，且不存在 `data-route="about"`。

- [ ] **步骤 2：编写失败的合并内容测试**

从 `src/assets/data/help-content.json` 读取发布内容，断言页面包含 `About FoldBridge`、`Data sources`、`ANNOJOIN pipeline`、`Confidence labels`、`How to contact us` 和 `Group Members`，并断言 pipeline 输出带 `aria-label="ANNOJOIN pipeline"` 的 SVG。

- [ ] **步骤 3：运行测试验证红灯**

运行：

```bash
node --test test/router.test.js test/site-chrome.test.js
```

预期：FAIL；失败原因分别是当前 `help → about`、导航仍指向 `about`、Help JSON 缺少 About 章节、Help renderer 不支持 pipeline。

### 任务 2：实现规范 Help 路由和单一运行时入口

**文件：**
- 修改：`src/router.js`
- 修改：`src/siteChrome.js`
- 修改：`src/main.js`

- [ ] **步骤 1：实现最小路由修复**

在允许路由中加入 `help`，删除 `about` 和旧的 `help → about` 规则。

- [ ] **步骤 2：修复导航与页面分发**

导航项改为：

```js
{ route: 'help', label: 'Help', activeRoutes: ['help'] }
```

把当前错误命名的 `aboutPage()` 改为 `helpPage()`，并让 `pageFor()` 在 `safeRoute === 'help'` 时调用它。

- [ ] **步骤 3：清理失效运行时依赖**

从 `main.js` 移除 `renderAboutPage`、`createAboutContentStore`、`aboutContentStore`、`aboutContentState` 和 `loadAboutContent()`；不删除历史文件。

### 任务 3：合并内容并支持 pipeline

**文件：**
- 修改：`src/assets/data/help-content.json`
- 修改：`src/siteChrome.js`

- [ ] **步骤 1：合并 About 方法学章节**

把 `about-content.json` 中十个方法学章节复制到 Help 的 `Interactive visualisation` 后、`How to make a feedback` 前，保持规格定义顺序；不复制 About 的第二个 Hero。

- [ ] **步骤 2：让 Help 渲染 pipeline**

在 `renderHelpSection()` 中增加：

```js
case 'pipeline': inner = renderAboutPipeline(section); break;
```

- [ ] **步骤 3：运行相关测试验证绿灯**

运行：

```bash
node --test test/router.test.js test/site-chrome.test.js test/about-page.test.js test/about-content-store.test.js
```

预期：全部通过、0 fail。

### 任务 4：完整验证与发布

**文件：**
- 验证所有本次修改文件；不暂存现有生成 JSON 和未跟踪文档。

- [ ] **步骤 1：运行完整测试**

运行 `npm test`，预期 0 fail。

- [ ] **步骤 2：运行生产构建与门禁**

运行 `npm run build` 和 `npm run verify:mvp`，预期退出码 0；若构建生成 `dist`，不将无关生成产物纳入源码提交。

- [ ] **步骤 3：核对 diff 并提交**

仅暂存计划、测试、路由、页面运行时、Help 内容和渲染器，提交：

```bash
git commit -m "fix(help): restore and merge Help page"
```

- [ ] **步骤 4：推送并监控部署**

推送 `release-public`，等待 GitHub Actions 的 `Deploy release-public to public` 成功；核对远端 `public` 提交信息引用本次 `release-public` SHA。

- [ ] **步骤 5：发布后验证**

确认 `#help` 显示合并页面，Help 导航活跃态正确，方法学、联系、反馈和团队内容均可见。
