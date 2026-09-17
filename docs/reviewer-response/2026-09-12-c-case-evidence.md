# C 类 Case 修复验收证据

- 日期：2026-09-12
- 候选代码基准：`7d3c22ceec4025ac43a24621a2fc536a6dc48728`
- 分支：`codex/reviewer-c-fixes`
- 覆盖项：C1.5、C1.7、C1.8、C1.9、C3.2
- 状态：**候选通过；Case/Tunnel 已于 2026-09-13 上线并复验**
- 候选目录：本机临时候选（对外路径省略）
- 生产目录：Tunnel Case document root（对外路径省略）；2026-09-12 候选验收阶段只读，
  2026-09-13 按维护手册发布 17 个共享资产

2026-09-12 的验收只在临时候选目录完成静态资源闭包、自动测试和真实浏览器测量；原始
测量仍只证明候选字节。2026-09-13 另按维护手册将同一组候选字节发布到生产目录，并完成
本机、公网和真实浏览器复验。下文保留候选阶段的复现协议，以便 reviewer 回复材料能区分
“候选证据”与“线上发布证据”。

## 发布状态更新（2026-09-13）

- 发布版本：`20260912-reviewer-c-1`。
- 发布范围：12 个新增指纹资产、5 个无版本共享入口，共 17 个精确路径；未替换任何
  `entry-cases/cases/<PDB>` 数据目录，也未删除旧指纹资产。
- 发布方式：先在与生产目录同卷的隔离候选中验证闭包和逐文件字节，再对 17 个目标逐文件
  使用同目录临时文件与原子重命名。
- 回滚：发布前无版本入口和旧指纹均已保留；本机带 UTC 时间戳的运维清单记录每个目标的
  发布前后 SHA-256、大小和新增/替换状态。精确本机路径不作为对外 reviewer 证据公开。
- 静态闭包：生产目录执行版本检查得到 `checkedFiles=13`、`changedFiles=0`；17 个生产文件
  与仓库候选逐文件 `cmp` 一致。
- 公网字节：仓库、本机生产服务和公网返回的 `workbench.js` SHA-256 均为
  `33818f44eda0ad4236080174532f48e441ec136577994526fb476eded997f721`；公网当前指纹
  `case-shell.20260912-reviewer-c-1.css` SHA-256 为
  `c3add5e9df990f8f2e69dfeae3ed7b53c4f901a94a778989911dcef430e4a7f0`。
- 服务边界：本机与公网 8SQ9/P 均返回 HTTP 200；公网 CORS OPTIONS 返回 HTTP 204，
  `Access-Control-Allow-Origin: https://foldbridge.ribocentre.org`。
- 线上交互：8SQ9/P 达到 `Case ready`；选择 DMS 后提示
  `匹配 1 个 Profile；请在 Profile 下拉列表中选择`，Profile、1D、VARNA、Mol* 保持不变，
  清空后恢复 `显示全部 2 个 Profile`。VARNA 从 100% 的 `537 × 374` 放大到 140% 时，
  内容为 `731 × 502`、容器为 `522 × 359`，两轴均可滚动；1:1 后回到
  `537 × 374` 且滚动位置为 `0 / 0`。
- 线上三状态：10FZ/A 显式选择 Profile 1 后，统计和 1D、VARNA 实际填充均为
  `missing=1488`、`measured <= 0=3`、`positive=51`，各自节点数为 1,542。
- 线上网络边界：发布后 8SQ9/P 冷启动访问日志按 URL `pathname` 检查，没有 `.rdat`、
  `/api/` 或 RMDB 资源路径；`profileId=...rdat#...` 只出现在页面查询参数中，不计为资源请求。

## 复现实验协议

以下命令只在新建的临时候选写入。执行者先把干净工作树和私有生产根目录分别赋给
`FOLDBRIDGE_CLEAN_WORKTREE` 与 `FOLDBRIDGE_CASE_DOCROOT`；生产目录仅作为 `rsync` 源目录
读取，不使用 `--delete`，也不写回生产。九项全局依赖由仓库的
`PREVIEW_GLOBAL_FILES` 精确列出，复制后检查指纹闭包与 fixture 字节：

```bash
cd "$FOLDBRIDGE_CLEAN_WORKTREE"
FOLDBRIDGE_C_CANDIDATE="$(mktemp -d "${TMPDIR%/}/foldbridge-reviewer-c-repro.XXXXXX")"
mkdir -p "$FOLDBRIDGE_C_CANDIDATE/entry-cases/cases"
rsync -a "$FOLDBRIDGE_CASE_DOCROOT/entry-cases/cases/8SQ9" \
  "$FOLDBRIDGE_CASE_DOCROOT/entry-cases/cases/10FZ" \
  "$FOLDBRIDGE_C_CANDIDATE/entry-cases/cases/"
mkdir -p "$FOLDBRIDGE_C_CANDIDATE/entry-cases/__entry_v3_site__" \
  "$FOLDBRIDGE_C_CANDIDATE/entry-cases/__entry_ef_site__"
rsync -a public/entry-cases/__entry_v3_site__/ \
  "$FOLDBRIDGE_C_CANDIDATE/entry-cases/__entry_v3_site__/"
rsync -a public/entry-cases/__entry_ef_site__/ \
  "$FOLDBRIDGE_C_CANDIDATE/entry-cases/__entry_ef_site__/"
node --input-type=module - "$FOLDBRIDGE_C_CANDIDATE" <<'JS'
import { mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PREVIEW_GLOBAL_FILES } from './scripts/case-public-techniques-lib.mjs';
const root = process.argv[2];
if (PREVIEW_GLOBAL_FILES.length !== 9) throw new Error('global dependency list drift');
for (const relative of PREVIEW_GLOBAL_FILES) {
  const destination = join(root, relative);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(relative, destination);
}
JS
cp docs/reviewer-response/fixtures/2026-09-12-case-zero-hit.html \
  "$FOLDBRIDGE_C_CANDIDATE/zero-hit-fixture.html"
shasum -a 256 "$FOLDBRIDGE_C_CANDIDATE/zero-hit-fixture.html"
node scripts/version-ef-entry-assets.mjs "$FOLDBRIDGE_C_CANDIDATE" --check
```

fixture 的仓库路径为
`docs/reviewer-response/fixtures/2026-09-12-case-zero-hit.html`，SHA-256 为
`e56fa48c9d2ee53e5e3462960b6f2b54a784bbc4d6d92e386f26d1c57dcff65b`。
运行时同时服务 Case shell、workbench 与 fixture（保持终端运行）：

```bash
python3 -m http.server 8903 --bind 127.0.0.1 --directory "$FOLDBRIDGE_C_CANDIDATE"
```

在浏览器分别打开以下完整 URL，并在开发者工具中设置下表的四个视口：

- 8SQ9/P shell：`http://127.0.0.1:8903/entry-cases/cases/8SQ9/index.html?chain=P`
- 10FZ/A shell：`http://127.0.0.1:8903/entry-cases/cases/10FZ/index.html?chain=A`
- zero-hit DOM fixture：`http://127.0.0.1:8903/zero-hit-fixture.html`

每次测量先等待至多 60 秒，要求 shell 的 `#chainFrame.contentDocument` 中
`#profileSelect` 已有 `options`，且 `#track-viewport svg`、`#varnaViewport svg`、
`.technique-filter-status` 同时存在；超时直接判失败，不以固定睡眠替代就绪条件。
下段脚本可直接粘贴在 shell 页的浏览器控制台；它返回本次视口的 shell / iframe / 1D
尺寸、控件重叠面积，以及 VARNA 100%、140%、末端实达与 1:1 复位数值：

```js
await (async () => {
  const frame = document.querySelector('#chainFrame');
  if (!frame) throw new Error('missing #chainFrame');
  const deadline = performance.now() + 60_000;
  let child;
  while (performance.now() < deadline) {
    child = frame.contentDocument;
    if (child?.querySelector('#profileSelect')?.options.length
      && child.querySelector('#track-viewport svg')
      && child.querySelector('#varnaViewport svg')
      && child.querySelector('.technique-filter-status')) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!child?.querySelector('.technique-filter-status')
    || !child.querySelector('#track-viewport svg')
    || !child.querySelector('#varnaViewport svg')
    || !child.querySelector('#profileSelect')?.options.length) {
    throw new Error('Case readiness timed out after 60 s');
  }
  const dimensions = (node) => ({
    client: [node.clientWidth, node.clientHeight],
    scroll: [node.scrollWidth, node.scrollHeight],
  });
  const rect = (node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  };
  const technique = child.querySelector('.technique-filter');
  const profile = child.querySelector('.profile-dropdown');
  const a = rect(technique), b = rect(profile);
  const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const viewport = child.querySelector('#varnaViewport');
  const zoom = () => ({ ...dimensions(viewport),
    at: [viewport.scrollLeft, viewport.scrollTop],
    status: child.querySelector('#varna-zoom-status')?.textContent });
  child.querySelector('#varna-zoom-reset').click();
  const at100 = zoom();
  child.querySelector('#varna-zoom-in').click();
  const at140 = zoom();
  const max = [viewport.scrollWidth - viewport.clientWidth,
    viewport.scrollHeight - viewport.clientHeight];
  viewport.scrollLeft = max[0];
  viewport.scrollTop = max[1];
  const reached = zoom();
  child.querySelector('#varna-zoom-reset').click();
  const reset = zoom();
  return {
    shell: dimensions(document.documentElement),
    iframe: dimensions(child.documentElement),
    track: dimensions(child.querySelector('#track-viewport')),
    techniqueProfileOverlapPx2: overlap,
    varna: { at100, at140, max, reached, reset },
  };
})();
```

在 8SQ9/P 的 shell 控制台，以下脚本单独验证 Technique 筛选不会改变已选 Profile 或重绘
1D、VARNA、Mol*。`select.value`、两个 SVG 的 `outerHTML`、Mol* dataset 与选中状态文本
在 DMS 命中和清空后应与基准完全相等；只有状态文案与可见选项变化：

```js
await (async () => {
  const child = document.querySelector('#chainFrame')?.contentDocument;
  if (!child?.querySelector('.technique-filter-status')) throw new Error('run readiness check first');
  const status = () => child.querySelector('.technique-filter-status').textContent.trim();
  const snapshot = () => ({
    select: child.querySelector('#profileSelect').value,
    track: child.querySelector('#track-viewport svg').outerHTML,
    varna: child.querySelector('#varnaViewport svg').outerHTML,
    molDataset: JSON.stringify({ ...child.querySelector('#molstar-host').dataset }),
    molSelection: child.querySelector('#molstar-selection-status')?.textContent,
  });
  const visible = () => [...child.querySelectorAll('.profile-dropdown-list li')]
    .filter((item) => !item.hidden && child.defaultView.getComputedStyle(item).display !== 'none')
    .map((item) => item.textContent.trim());
  const dms = child.querySelector('.technique-chip[data-category="dms"]');
  if (!dms || dms.disabled) throw new Error('DMS chip unavailable');
  const baseline = snapshot();
  const initial = { status: status(), visible: visible() };
  dms.click();
  const matched = { status: status(), visible: visible(), unchanged:
    JSON.stringify(snapshot()) === JSON.stringify(baseline) };
  dms.click();
  const cleared = { status: status(), visible: visible(), unchanged:
    JSON.stringify(snapshot()) === JSON.stringify(baseline) };
  return { initial, matched, cleared };
})();
```

zero-hit fixture 页只有一个 `#case` iframe，且该 fixture 会在目标 disabled chip 出现后
解除其 disabled 状态；不是用户可达 UI。等待 `document.title` 以 `ready:` 开头，再把上段
脚本中的 `document.querySelector('#chainFrame')?.contentDocument` 改为
`document.querySelector('#case')?.contentDocument`，将 DMS selector 改为
`.technique-chip[data-zero-hit-fixture="enabled"]`；点击后应为 `无匹配 Profile` 且 snapshot
不变，第二次点击后应回到 `显示全部 2 个 Profile`。

在 10FZ/A 的 shell 控制台，等待同一就绪条件后，以下脚本显式选择 Profile 1 并统计
1D 和 VARNA 的实际填充；灰纹理只用于 missing，淡蓝和黄红均为实色。两组计数应相同，
均为 `missing=1488`、`nonpositive=3`、`positive=51`：

```js
await (async () => {
  const child = document.querySelector('#chainFrame')?.contentDocument;
  if (!child?.querySelector('#profileSelect')?.options.length) throw new Error('run readiness check first');
  const select = child.querySelector('#profileSelect');
  select.value = '1';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const deadline = performance.now() + 60_000;
  while (performance.now() < deadline) {
    const metrics = [...child.querySelectorAll('#stats .metric')]
      .map((item) => [item.querySelector('span')?.textContent, item.querySelector('b')?.textContent]);
    const byName = new Map(metrics);
    if (select.value === '1'
      && byName.get('missing bases') === '1488'
      && byName.get('measured <= 0') === '3'
      && byName.get('positive bases') === '51'
      && child.querySelectorAll('#track-viewport [data-track-kind="profile_value"]').length === 1542
      && child.querySelectorAll('#varnaViewport [data-reactivity-fill]').length === 1542) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const count = (nodes, readFill) => [...nodes].reduce((result, node) => {
    const fill = readFill(node).toLowerCase();
    if (fill.startsWith('url(#reactivity-missing-pattern-')) result.missing += 1;
    else if (fill === '#dbeef8' || fill === 'rgb(86%, 93%, 97%)') result.nonpositive += 1;
    else result.positive += 1;
    return result;
  }, { missing: 0, nonpositive: 0, positive: 0 });
  const track = child.querySelectorAll('#track-viewport [data-track-kind="profile_value"]');
  const varna = child.querySelectorAll('#varnaViewport [data-reactivity-fill]');
  if (track.length !== 1542 || varna.length !== 1542
    || !child.querySelector('#stats')?.textContent.includes('1488')) {
    throw new Error('Profile 1 render timed out');
  }
  return {
    selectedProfile: select.value,
    track: count(track, (node) => node.getAttribute('fill') || ''),
    varna: count(varna, (node) => node.getAttribute('fill') || ''),
    legend: child.querySelector('.legend')?.textContent.trim(),
    molDataset: { ...child.querySelector('#molstar-host')?.dataset },
  };
})();
```

冷启动网络需另用端口 8904，避免复用 8903 页面的已加载连接与性能条目：

```bash
python3 -m http.server 8904 --bind 127.0.0.1 --directory "$FOLDBRIDGE_C_CANDIDATE"
```

在新的浏览器标签打开
`http://127.0.0.1:8904/entry-cases/cases/8SQ9/index.html?chain=P`，禁用缓存、清空该
origin 的 Performance 记录，等待上述 60 秒条件成立后，在 shell 控制台运行：

```js
(() => {
  const frame = document.querySelector('#chainFrame');
  const child = frame?.contentWindow;
  if (!child?.document.querySelector('.technique-filter-status')) {
    throw new Error('wait for the same 60 s Case readiness condition');
  }
  const requests = [performance, child.performance]
    .flatMap((timeline) => timeline.getEntriesByType('resource'))
    .map(({ name }) => ({ name, pathname: new URL(name).pathname }));
  const forbidden = requests.filter(({ pathname }) => /rdat|\/api\/|rmdb/i.test(pathname));
  return { requestCount: requests.length, forbiddenCount: forbidden.length, forbidden };
})();
```

这里仅检查资源 URL 的 `pathname`，先通过 `new URL(name).pathname` 去除 query 和 hash；
Profile ID 中的 `.rdat#...` 是数据标识符，不是被请求资源的 pathname，不应误计为 RDAT
网络请求。

## 验收结论

| 项目 | 验收结果 | 关键证据 |
| --- | --- | --- |
| C1.5 Case 响应式 | 通过 | 4 个视口下 shell 与 iframe 均无页面级横向溢出，Technique / Profile 控件交叠面积为 0；宽 1D 轨道只在自身容器横滚 |
| C1.7 VARNA 原生滚动 | 通过 | 100%、140%、1:1 复位均实测；140% 同时产生横纵滚动，复位后 `scrollLeft / scrollTop = 0 / 0` |
| C1.8 Technique 反馈 | 通过 | 命中、清空、零命中状态文案正确；筛选不自动切换 Profile，也不重绘 1D、VARNA 或 Mol* |
| C1.9 废弃 RDAT / 冷启动网络 | 通过 | 8SQ9/P 冷启动仅请求候选静态资源；RDAT、API、RMDB 路径请求均为 0 |
| C3.2 三状态反应性 | 通过 | 10FZ/A Profile 1 精确得到 missing 1488、`<= 0` 3、positive 51；1D、VARNA、图例与 Mol* 使用同一分类 |

## 自动测试与静态闭包

### 完整测试

在候选代码基准上运行：

```text
npm test
```

结果为 342 项测试、336 项通过、6 项失败、0 项跳过。6 项失败与既有基线一致：

| 失败类别 | 数量 | 原因 |
| --- | ---: | --- |
| sealed v2 provenance commands 漂移 | 1 | 已封存运行的 `commands` 声明与当前独立重放结果不一致 |
| 外接卷权限失败 | 5 | 测试尝试在私有外接卷 staging 根执行 `mkdtemp`，当前只读权限返回 `EPERM` |

其中唯一非权限失败为 `verifier replays committed taxonomy for both sealed v2 Task 5 runs`；
其余 5 项均在 fixture 创建阶段因私有外接卷的 `EPERM` 失败。失败集合没有新增
Case UI、响应式、三状态、Technique 或网络边界回归。

定向自包含套件运行：

```text
node --test test/case-workbench-pure.test.js \
  test/case-workbench-responsive.test.js \
  test/case-workbench-ui.test.js \
  test/entry-case-embed.test.js
```

结果为 37 / 37 通过。版本闭包检查：

```text
node scripts/version-ef-entry-assets.mjs public --check
```

结果为 `checkedFiles=13`、`changedFiles=0`。

## C1.5：4 × 4 Case 响应式验收

真实浏览器为 Codex in-app browser，最终候选通过本地静态服务加载。表中 shell、iframe 和
1D 轨道均按 `clientWidth / scrollWidth` 记录；只有 1D 轨道允许 `scrollWidth` 大于
`clientWidth`。文档通过条件为 `scrollWidth <= clientWidth`。

| 浏览器视口 | shell 文档 | iframe 文档 | 1D 轨道 | Technique / Profile 交叠面积 | 结果 |
| --- | --- | --- | --- | ---: | --- |
| 1440 × 900 | `1425 / 1425` | `1278 / 1278` | `1242 / 1242` | 0 | 无页面级横溢出 |
| 1024 × 768 | `1009 / 1009` | `918 / 918` | `882 / 1028` | 0 | 仅 1D 局部横滚 |
| 768 × 1024 | `753 / 753` | `662 / 662` | `638 / 1028` | 0 | 仅 1D 局部横滚 |
| 390 × 844 | `375 / 375` | `284 / 284` | `260 / 1028` | 0 | 仅 1D 局部横滚 |

全部视口中，Profile 位于 Technique 下方。手机视口的 Case shell switches 为单列，长
Profile 文本在 trigger 内省略，不再扩大 grid track；1D SVG 的宽内容由
`.track-viewport` 局部承接，没有泄漏为 iframe 或 shell 文档横向滚动。

## C1.7：VARNA 双轴滚动与复位

下表尺寸和位置均为 `宽 × 高`。100% 与复位尺寸的 client / scroll 相等；140% 的
`scroll` 同时大于 `client`，证明横纵两轴均可滚动。「最大位置」横轴为
`scrollWidth - clientWidth`、纵轴为 `scrollHeight - clientHeight`；「实达位置」为浏览器
把两轴滚动到末端后的实际 `scrollLeft × scrollTop`。

| 视口 | 100% client / scroll | 140% client | 140% scroll | 最大位置 | 实达位置 | 1:1 复位尺寸 |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 × 900 | `589 × 402 / 589 × 402` | `574 × 387` | `804 × 542` | `230 × 155` | `229.5 × 155` | `589 × 402` |
| 1024 × 768 | `409 × 292 / 409 × 292` | `394 × 277` | `552 × 387` | `158 × 110` | `157.5 × 110.5` | `409 × 292` |
| 768 × 1024 | `612 × 218 / 612 × 218` | `597 × 203` | `836 × 284` | `239 × 81` | `239 × 81` | `612 × 218` |
| 390 × 844 | `234 × 218 / 234 × 218` | `219 × 203` | `307 × 284` | `88 × 81` | `87.5 × 81` | `234 × 218` |

四个视口均验证 1:1 复位在重新应用 SVG 尺寸后执行，并将
`scrollLeft / scrollTop` 恢复为 `0 / 0`。普通非 E/F Case 只有 `.varna-viewport` 是双轴
滚动容器；frame 不产生第二层滚动。E/F 的既有固定尺寸与 non-scroll 覆盖保持不变。

## C1.8：Technique 筛选反馈与状态保持

真实浏览器在 8SQ9/P 页面覆盖初始、DMS 命中和清空状态；该页面共有 2 个 Profile：

| 操作 | 可见 Profile | `aria-live` 状态文本 | 其他视图状态 |
| --- | --- | --- | --- |
| 初始 | DMS、SHAPE | `显示全部 2 个 Profile` | 基准状态 |
| 选择 DMS | 仅 DMS；SHAPE 隐藏 | `匹配 1 个 Profile；请在 Profile 下拉列表中选择` | Profile select、1D、VARNA、Mol* 不变 |
| 清空筛选 | DMS、SHAPE | `显示全部 2 个 Profile` | Profile select、1D、VARNA、Mol* 不变 |

状态区域使用 `aria-live="polite"` 与 `aria-atomic="true"`。每次 refilter 只更新 Profile
选项可见性和状态文案；命中与清空后，当前 Profile 值均不被自动改变，1D、VARNA、Mol*
和已渲染图例也不发生切换或重绘。

零命中另在同一个 8SQ9/P 页面使用受控 DOM fixture 验收：测试解除正常 UI 中不可达的
Cleavage chip 后，状态文本为 `无匹配 Profile`，Profile select、1D、VARNA、Mol* 均不变；
清空后恢复 DMS、SHAPE 两个 Profile，并再次显示 `显示全部 2 个 Profile`。Cleavage chip
解除隐藏只发生在测试 DOM 中，因此零命中不是当前用户可达流程。自动化纯逻辑测试另有
独立计数 fixture，但本文浏览器结论只采用上述真实 2-Profile 页面数据。

## C3.2：10FZ/A Profile 1 三状态一致性

数据来源为候选与只读生产目录中相同的三项 profile 资产：

- `profiles/profile-index.json.gz`
- `profiles/shards/000000.meta.json.gz`
- `profiles/shards/000000.f32.bin.gz`

重算目标为 `data-eterna/ETERNA_R74_0000.rdat#908`，row index 为 1，总长度为 1542。
候选与只读生产输入字节的 SHA-256 一致，重算结果如下：

| 状态 | 数量 | 可视语义 |
| --- | ---: | --- |
| missing | 1488 | 中性灰；1D / VARNA 使用稳定灰纹理，Mol* 使用对应灰色 hex 实色 |
| finite `<= 0` | 3 | 淡蓝实色 |
| positive | 51 | 仅正值参与 P95；沿用黄到红色带 |
| 合计 | 1542 | `1488 + 3 + 51 = 1542` |

profile index 映射数为 54，等于 `3 + 51`；未映射数为 1488。非有限原始值保持
missing，不会被改写为 0。1D、VARNA、三态图例与 Mol* 消费同一状态归一化结果；其中
SVG 视图只为 missing 使用纹理，Mol* 按 3D 渲染约束始终使用对应 hex 实色，分类语义一致。

## C1.9：废弃 RDAT 与冷启动网络边界

对 8SQ9/P 执行清空缓存后的冷启动，监视从 shell 到首个 Profile 完成渲染的全部请求：

- 请求来源均为本地候选静态服务；
- 允许的请求为候选内 HTML、CSS、JavaScript、JSON / gzip、SVG、结构与 Profile shard
  等静态资源；
- `.rdat` / RDAT 路径请求：0；
- `/api/` 路径请求：0；
- RMDB raw heatmap / RMDB API 路径请求：0。

初始化、Profile change 和 Technique refilter 均未触达已退役的 raw RDAT / RMDB heatmap
入口。该结果只证明候选冷启动边界，未对生产目录执行写入或替换。

## 候选资产完整性与回滚边界

候选与仓库中的 unversioned / 当前指纹 Case shell、workbench CSS 已逐文件执行 `cmp`，
结果均为字节一致。当前资产 SHA-256 为：

| 资产 | SHA-256 |
| --- | --- |
| `case-shell.css` 与 `case-shell.20260912-reviewer-c-1.css` | `c3add5e9df990f8f2e69dfeae3ed7b53c4f901a94a778989911dcef430e4a7f0` |
| `workbench.css` 与 `workbench.20260912-reviewer-c-1.css` | `f1e21725ef8d52b25a8699a0818d34b512439c842d4e8ebd0c0077b0b35a3f50` |

旧指纹资产仍保留，未被生成器覆盖：

| 回滚资产 | SHA-256 |
| --- | --- |
| `case-shell.20260828-case-taxonomy-1.css` | `119c2a26994a1b78eb4c33779ca71e4ffea3b1f323ec1f8be87ca636258bc759` |
| `workbench.20260828-case-taxonomy-1.css` | `2511d03f06d45ff342ccc6068137d4caa5d79472ced9bfe216726d26e57b25cd` |

因此，候选阶段结论为「候选通过，生产未替换」；2026-09-13 的独立发布记录把结论更新为
「同一候选字节已上线并复验」。上一版本指纹和发布前无版本入口均已保留，可按本机运维
清单恢复。
