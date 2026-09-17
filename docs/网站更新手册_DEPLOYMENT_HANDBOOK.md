# FoldBridge 网站维护与发布手册

> 最后核对：2026-09-11
>
> 适用仓库：`chichaumiao-openclaw/foldbridge`
>
> 默认远端与主线：`ghhttps/main`

本手册是 FoldBridge 网站维护的默认操作契约。除非用户明确指定其他远端、分支或发布目标，否则所有 GitHub Pages 相关工作均按本文执行，不再重复询问是否使用 `ghhttps/main`。

## 零、默认发布契约（强制）

### 0.1 Git 默认值

| 项目 | 默认值 |
|---|---|
| GitHub 仓库 | `https://github.com/chichaumiao-openclaw/foldbridge.git` |
| 读写远端 | `ghhttps` |
| 主分支 | `main` |
| 基线引用 | `ghhttps/main` |
| 推送目标 | `git push ghhttps HEAD:main` |
| GitHub Pages 源 | `main` 分支根目录 `/` |

执行规则：

- 用户只说「基于 main」「更新主线」时，默认指 `ghhttps/main`。
- 用户明确说「推送」或「发布 SPA」后，默认推送到 `ghhttps/main`，无需再询问远端和分支。
- 提交并不自动授权推送；只有用户明确要求推送或发布时才执行外部写入。
- 不使用 `origin/main` 判断最新主线，不使用 `origin` 推送。当前 `origin` 是 SSH remote，本机 SSH 凭据不作为生产发布路径。
- 推送前必须刷新 `ghhttps/main`，确认目标 diff，并以 fast-forward 方式集成最新主线。
- 禁止 force-push、覆盖远端新提交，或把 `_staging`/脏工作树的无关修改带入主线。

标准远端检查（已存在的 `ghhttps` 也必须精确匹配生产仓库）：

```bash
cd /Users/joseperezmartinez/docs/foldbridge

EXPECTED_GHHTTPS=https://github.com/chichaumiao-openclaw/foldbridge.git
CURRENT_GHHTTPS=$(git remote get-url ghhttps 2>/dev/null || true)
if test -z "$CURRENT_GHHTTPS"; then
  git remote add ghhttps "$EXPECTED_GHHTTPS"
elif test "$CURRENT_GHHTTPS" != "$EXPECTED_GHHTTPS"; then
  echo "ERROR: ghhttps points to unexpected URL: $CURRENT_GHHTTPS" >&2
  exit 1
fi

git fetch ghhttps main
git rev-parse ghhttps/main
git ls-remote ghhttps refs/heads/main
```

### 0.2 两条发布链不可混用

| 内容 | 源与发布目标 | 生效方式 | 验收地址 |
|---|---|---|---|
| SPA、Entry、Search、Stats、Download、生成索引 | Git 仓库 → `ghhttps/main` | GitHub Pages 从 `main /` 发布 | `https://foldbridge.ribocentre.org/` |
| Case HTML、Case 共享 bundle、Case 数据、训练数据 | `/Volumes/tianyi/Server/public` | 本机 CORS server → Cloudflare Tunnel | `https://foldbridge.sunhao.uk/` |

`ghhttps/main` 不是 Tunnel docroot。反过来，把文件写入 `/Volumes/tianyi/Server/public` 也不等于完成了 GitHub Pages 发布。

## 一、当前生产架构

```text
ghhttps/main
    │
    ├─ GitHub Pages（source: main /）
    │    └─ https://foldbridge.ribocentre.org/
    │         └─ #entry-case?pdb=<PDB>&chain=<CHAIN>[&family=E|F]
    │
    └─ SPA iframe
         └─ https://foldbridge.sunhao.uk/entry-cases/cases/<PDB>/index.html
              └─ Cloudflare Tunnel
                   └─ 127.0.0.1:8888
                        └─ /Volumes/tianyi/Server/public
```

生产 Case docroot 只有一个：

```text
/Volumes/tianyi/Server/public
```

`/Users/joseperezmartinez/docs/foldbridge/public` 是本机工作副本，不是线上 Tunnel 源。它可以用于比较或生成候选文件，但不能作为线上已发布的证据，也不要求每次机械式双向同步。

## 二、2026-09-11 已核对基线

### 2.1 GitHub Pages

- `ghhttps/main`：`13917125c23088cfa22fcf544e0408950307c765`
- Pages 状态：`built`
- Pages source：`main /`
- 原生工作流 `pages-build-deployment`：`active`
- 自定义 `.github/workflows/pages.yml`：`disabled_manually`
- `.github/workflows/deploy-to-public.yml`：由 `release-public` 或手动 `workflow_dispatch` 触发，不是当前 SPA 的默认发布入口。
- `package.json` 仍保留若干历史构建命令，但当前 main 已没有 `scripts/build.mjs`、`scripts/build-pages.mjs`、`scripts/verify-mvp.mjs` 等入口。

因此，不能用 `gh run list --workflow pages.yml` 判断当前生产 Pages 是否发布成功。生产判据是 Pages API、远端 SHA、公共响应和浏览器行为。

当前不能运行 `npm run build:pages` 或 `npm run verify:mvp` 并声称完成生产构建；这些命令会因入口脚本缺失而失败。恢复构建工具属于独立任务，不得在普通内容发布中临时拼装替代脚本。

### 2.2 Entry 与 Case 数据快照

以下数字是 2026-09-11 的只读实测快照，不是永久常量。每次全量发布后必须重新统计。

| 指标 | 当前值 |
|---|---:|
| Entry PDB × chain 行 | 17,843 |
| Entry 唯一 PDB | 5,321 |
| 线上四字符 Case 目录 | 5,321 |
| 线上 Chain 页面 | 14,952 |
| `profile-index.json.gz` | 14,952 |
| `profile-public-techniques.json.gz` | 12,577 |
| `ef-matrix.json.gz` | 695（463 个 PDB） |
| 空 profile Chain 标记 | 272（210 个 PDB） |

注意：Technique sidecar 数量低于 profile index 数量。发布时必须按 PDB × chain 精确键审计，不能把历史计数或两个总数相减当作最终修复清单。

### 2.3 Reference 索引快照

当前 `pdb-primary-citations.v2` 索引：

| 指标 | 当前值 |
|---|---:|
| 索引请求 Case | 4,948 |
| 有 `structure.cif.gz` | 3,843 |
| 成功抽取主文献 | 2,990 |
| mmCIF 无可用主文献 | 853 |
| 缺少结构文件 | 1,105 |

线上 Case 已扩展到 5,321 个 PDB，而当前 Reference 索引仍覆盖旧的 4,948 个 Case。当任务新增/删除 Case，或修改 `structure.cif.gz` / Reference 时，必须把「Case 目录数 = Reference 分类总数」作为该任务的发布门槛。与 Reference 无关的 UI、Technique 或单个静态资产发布不因这一已知差距被阻断，但必须如实记录，不得将其误报为全量 Reference 已覆盖。

2026-09-11 使用现有生成器对线上 Case 树做只读重建验证，得到：5,321 个请求 Case、4,206 条主文献、1,115 个 unavailable、0 个缺结构。该结果只用于验证维护命令和确认当前差距，本次手册更新不发布新的 Reference 数据。

## 三、开始一次维护任务

### 3.1 禁止直接在 `_staging` 或脏工作树修改

先检查全部 worktree：

```bash
cd /Users/joseperezmartinez/docs/foldbridge
git worktree list
git status --short --branch
```

内置盘大小写不敏感，而 Case 数据可能同时包含 `chains/A` 和 `chains/a`。不要在内置盘创建包含完整 `public/entry-cases` 的普通 worktree，否则检出后可能立即出现大量伪修改。

SPA、脚本和文档任务使用 sparse worktree：

```bash
cd /Users/joseperezmartinez/docs/foldbridge
git fetch ghhttps main

TASK=update-example
BRANCH="codex/$TASK"
WORKTREE=".worktrees/$TASK"

git worktree add --no-checkout "$WORKTREE" -b "$BRANCH" ghhttps/main
git -C "$WORKTREE" sparse-checkout init --cone
git -C "$WORKTREE" sparse-checkout set .github docs scripts src test
git -C "$WORKTREE" checkout
```

如任务必须处理完整 Case 树，应在大小写敏感卷上创建 worktree，并先确认剩余空间、目标分支和发布范围。

### 3.2 基线检查

```bash
cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/update-example
npm ci
npm test
```

完整测试可能依赖 `/Volumes/tianyi` 上的已封存运行。权限型失败与真实断言失败必须分开报告；文档任务不得顺手修复无关数据管线问题。

2026-09-11 在允许读取测试所需外接卷后，当前 main 的 `npm test` 结果为 312 项中 311 项通过、1 项失败。既有失败是 `verifier replays committed taxonomy for both sealed v2 Task 5 runs`，原因为已封存 source manifest 的 `commands` provenance 与当前独立重放不一致。维护者应在新基线上重新核对，不能把这条 dated baseline 永久当作允许失败列表。

## 四、SPA / GitHub Pages 发布流程

### 4.1 修改前

```bash
git fetch ghhttps main
git rebase ghhttps/main
git status --short --branch
```

只修改用户要求的文件。生成资产变更必须同时提交生成脚本、产物和相应测试；不能只改 `dist/` 或 `_site/`。

### 4.2 本地验证

按修改范围选择可运行的测试。当前 main 的历史 Pages 构建入口缺失，因此推送前至少执行：

```bash
git diff --check
npm test
```

如果完整测试存在已确认的基线失败，必须记录失败名称，并补跑与本次改动直接相关的测试；不能把基线失败说成本次通过，也不能顺手扩大修复范围。例如：

```bash
node --test test/build-pdb-primary-citations.test.js
node --test test/entry-empty-profiles.test.js
```

需要 `public/entry-cases` fixture 的 Case 测试不能在仅含 `docs/src/scripts/test` 的 sparse worktree 中直接运行。应在大小写敏感卷上的完整干净 worktree 验证，或明确报告 fixture 缺失；不能把 `ENOENT public/entry-cases/...` 误报为产品回归。

### 4.3 提交与推送

```bash
git status --short
git diff --stat
git diff --check

git add <本次文件>
git commit -m "docs: 更新 FoldBridge 网站维护手册"

git fetch ghhttps main
git rebase ghhttps/main
git log --oneline ghhttps/main..HEAD
git diff --stat ghhttps/main...HEAD
git push ghhttps HEAD:main
```

不要使用无参数 `git push`，不要推到 `origin`，不要直接依赖陈旧的 tracking ref。

### 4.4 Pages 验收

```bash
# 1. 远端 main 必须等于本地 HEAD
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git ls-remote ghhttps refs/heads/main | awk '{print $1}')
test "$LOCAL_SHA" = "$REMOTE_SHA"

# 2. Pages source 与最新构建
gh api repos/chichaumiao-openclaw/foldbridge/pages \
  --jq '{status,source,html_url}'
gh api repos/chichaumiao-openclaw/foldbridge/pages/builds/latest \
  --jq '{status,commit,error,created_at,updated_at}'

# 3. 公共站点
curl -fsSI "https://foldbridge.ribocentre.org/?cb=$(date +%s)" | head
```

最后必须用真实浏览器打开受影响路由。完成条件是：远端 SHA 正确、Pages 构建对应该 SHA、公共 URL 返回正确内容、浏览器行为正确。只完成 push 不算上线。

## 五、Case / Tunnel 发布流程

### 5.1 生产边界

线上文件根目录：

```text
/Volumes/tianyi/Server/public
```

主要子目录：

```text
/Volumes/tianyi/Server/public/
├── entry-cases/
│   ├── __entry_v3_site__/
│   ├── __entry_ef_site__/
│   └── cases/<PDB>/
├── src/
│   ├── portalChrome.js
│   ├── siteChrome.js
│   └── assets/generated/pdb-primary-citations/index.json
└── training-data/
    ├── alignment/
    ├── profiles/
    └── reactivity/
```

### 5.2 安全发布原则

- 发布前记录目标文件的路径、大小和 SHA-256。
- 在同一大小写敏感卷上生成候选目录，不直接覆盖生产目录。
- 验证候选后使用同目录临时文件加原子重命名，或对完整目录做带回滚点的原子替换。
- 只替换本次批准的文件；禁止为了修一个页面重建、删除或覆盖整个 Case 树。
- `A` 与 `a` 是不同 Chain，任何清单、复制和验收都必须保留大小写。
- 本机仓库的 `public/` 不是线上验收目标。

单文件发布模板：

```bash
set -euo pipefail

DOCROOT=/Volumes/tianyi/Server/public
SOURCE=/absolute/path/to/verified-file
TARGET="$DOCROOT/path/to/file"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELATIVE_TARGET=${TARGET#"$DOCROOT"/}
ROLLBACK_ROOT=/Volumes/tianyi/Server/rollback/foldbridge/$STAMP
BACKUP="$ROLLBACK_ROOT/$RELATIVE_TARGET"
TMP="${TARGET}.tmp.$$"

test -f "$SOURCE"
test "$SOURCE" != "$TARGET"
if test -e "$TARGET" || test -L "$TARGET"; then
  test -f "$TARGET"
  test ! -L "$TARGET"
fi
python3 - "$DOCROOT" "$TARGET" "$TMP" "$ROLLBACK_ROOT" "$BACKUP" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve(strict=True)
for label, raw in (("TARGET", sys.argv[2]), ("TMP", sys.argv[3])):
    path = Path(raw)
    if not path.is_absolute():
        raise SystemExit(f"{label} is not absolute: {raw}")
    resolved = path.resolve(strict=False)
    try:
        relative = resolved.relative_to(root)
    except ValueError:
        raise SystemExit(f"{label} escapes docroot: {resolved}")
    if not relative.parts:
        raise SystemExit(f"{label} cannot be the docroot itself")

rollback_root = Path(sys.argv[4]).resolve(strict=False)
backup = Path(sys.argv[5]).resolve(strict=False)
try:
    backup_relative = backup.relative_to(rollback_root)
except ValueError:
    raise SystemExit(f"BACKUP escapes rollback root: {backup}")
if not backup_relative.parts:
    raise SystemExit("BACKUP cannot be the rollback root itself")
PY

cleanup_tmp() {
  if test -e "$TMP"; then
    rm -f "$TMP"
  fi
}
trap cleanup_tmp EXIT HUP INT TERM

if test -f "$TARGET"; then
  mkdir -p "$(dirname "$BACKUP")"
  cp -p "$TARGET" "$BACKUP"
  cmp -s "$TARGET" "$BACKUP"
fi
mkdir -p "$(dirname "$TARGET")"
cp "$SOURCE" "$TMP"
shasum -a 256 "$SOURCE" "$TMP"
cmp -s "$SOURCE" "$TMP"
mv "$TMP" "$TARGET"
cmp -s "$SOURCE" "$TARGET"
```

目录发布必须先建立带时间戳的回滚点，并在替换前、替换后分别核对清单。不要用未解析的 glob 或宽泛的递归删除命令。

### 5.3 Tunnel 验收

```bash
# 本机源
curl -fsSI http://127.0.0.1:8888/entry-cases/cases/28NT/index.html

# 公共 GET
curl -fsSI \
  "https://foldbridge.sunhao.uk/entry-cases/cases/28NT/index.html?cb=$(date +%s)"

# 公共 CORS 预检
curl -fsS -o /dev/null -D - -X OPTIONS \
  -H 'Origin: https://foldbridge.ribocentre.org' \
  -H 'Access-Control-Request-Method: GET' \
  "https://foldbridge.sunhao.uk/entry-cases/cases/28NT/index.html?cb=$(date +%s)"
```

必须同时验证 GET、OPTIONS 和真实 SPA iframe。HTTP 200 只能证明文件可达，不能证明 Chain 选择、Profile、2D/3D 联动或 Reference 正常。

## 六、Case 页面加载与资产契约

### 6.1 当前加载链

```text
Entry 行
  → #entry-case?pdb=<PDB>&chain=<CHAIN>[&family=E|F]
  → src/main.js 保留 chain 与 family 参数
  → foldbridge.sunhao.uk/entry-cases/cases/<PDB>/index.html
  → case-shell.js 校验 Chain，并把参数传给 chains/<CHAIN>/index.html
  → workbench.js 加载 Profile、Technique sidecar、2D、3D、EF matrix 和 Reference
```

旧手册所述「chain 参数会丢失」已不成立。当前主站会把请求的 Chain 传入 Case iframe，Case shell 只接受自身 manifest 中存在的 Chain。

### 6.2 共享 bundle

`entry-cases/__entry_v3_site__/` 的关键文件：

- `case-shell.css`、`case-shell.js`
- `workbench.css`、`workbench.js`
- `workbench-pure.mjs`
- `technique-filter-model.mjs`
- `ef-workbench-shell.mjs`
- `residue-linkage.mjs`、`residue-rail.mjs`
- `site-nav.js`

`entry-cases/__entry_ef_site__/` 的关键文件：

- `ef-heatmap-core.js`
- `ef-heatmap.js`
- `ef-case.js`

无版本入口会加载带版本指纹的依赖。修改共享资产后必须更新完整指纹闭包：

```bash
node scripts/version-ef-entry-assets.mjs \
  /Volumes/tianyi/Server/public \
  --repo-root /absolute/path/to/clean/foldbridge-worktree \
  --check
```

写入版本前要求单写者：运行期间不得有其他任务修改仓库源文件或生产 `entry-cases` 树。发布时使用隔离候选树；不要直接对线上目录运行未经审查的写模式。

### 6.3 单个 Case 目录

```text
entry-cases/cases/<PDB>/
├── index.html
├── browser-manifest.json
├── case.json
├── structure.cif.gz
└── chains/<CHAIN>/
    ├── index.html
    ├── case-2d-structure.json.gz
    ├── varna-template.svg.gz
    ├── profiles/
    │   ├── profile-index.json.gz
    │   ├── profile-public-techniques.json.gz
    │   └── shards/*.gz
    ├── linked-view/
    └── ef-matrix.json.gz（有 E/F 矩阵时）
```

`.gz` 文件由浏览器端 `DecompressionStream` 解压。排查时必须请求代码实际使用的 `.gz` 路径；裸文件 404 不代表线上故障。

### 6.4 当前公开语义

- 普通 Profile 与 E/F matrix 共用 Workbench 外壳和残基联动模型。
- Case 顶部 Technique 分类使用完整名称，例如 `DMS-based methods`、`SHAPE-based methods`、`Cleavage-based methods`、`Nucleotide-specific chemical probing methods`、`RNA–RNA interaction mapping methods`。
- Methods 保留具体方法名称，分类与方法之间采用跨层 OR 筛选。
- 内部 Family 字母、Tier、confidence/LSS 等内部术语不显示；不要把公开 Technique 分类误删。
- RMDB raw reactivity heatmap 已永久停用。旧备份中仍可能含相关 DOM 或函数，不得通过复制旧 bundle 把它恢复到线上。
- Entry 中 272 条空 profile Chain 已置灰，Molecule 详情链接降级为纯文本；RCSB 链接和 E/F 标记保留。

## 七、Reference 文献维护

### 7.1 三个位置

| 角色 | 路径 |
|---|---|
| 生成逻辑 | `scripts/build-pdb-primary-citations.mjs` |
| Git/Pages 资产 | `src/assets/generated/pdb-primary-citations/index.json` |
| Tunnel 运行时资产 | `/Volumes/tianyi/Server/public/src/assets/generated/pdb-primary-citations/index.json` |

`workbench.js` 从自身 origin 请求：

```text
/src/assets/generated/pdb-primary-citations/index.json
```

因此，Case iframe 实际读取的是 `foldbridge.sunhao.uk` 对应的 Tunnel 文件，而不是 GitHub Pages 上的同名文件。当任务范围包含 Reference 时，两处都必须更新，但验收目标不同；与 Reference 无关的发布不强制重建该索引。

### 7.2 从线上 Case mmCIF 重建

生成器读取每个四字符 Case 目录中的 `structure.cif.gz`，解析 `_citation` 和 `_citation_author`。它不修改 Case 输入。

```bash
cd /absolute/path/to/clean/foldbridge-worktree

CASE_ROOT=/Volumes/tianyi/Server/public/entry-cases/cases \
OUTPUT=src/assets/generated/pdb-primary-citations/index.json \
node --input-type=module <<'NODE'
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCitationPayload } from './scripts/build-pdb-primary-citations.mjs';

const payload = await buildCitationPayload({ caseRoot: process.env.CASE_ROOT });
await fs.mkdir(path.dirname(process.env.OUTPUT), { recursive: true });
await fs.writeFile(process.env.OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({
  requestedCaseCount: payload.requestedCaseCount,
  citationCount: payload.citationCount,
  unavailableCount: payload.unavailableCount,
  missingStructureCount: payload.missingStructureCount,
}));
NODE

node --test test/build-pdb-primary-citations.test.js
```

重建后必须检查：

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
const index = JSON.parse(fs.readFileSync(
  'src/assets/generated/pdb-primary-citations/index.json',
  'utf8',
));
const total = index.citationCount + index.unavailableCount + index.missingStructureCount;
if (total !== index.requestedCaseCount) throw new Error('Reference coverage is not closed');
console.log({
  requestedCaseCount: index.requestedCaseCount,
  total,
  example28NT: index.citations['28NT'],
});
NODE
```

随后：

1. 把 Git 资产提交并推送到 `ghhttps/main`。
2. 用单文件原子发布模板把同一字节发布到 Tunnel 路径。
3. 对两份文件执行 `shasum -a 256`，哈希必须一致。
4. 公共 JSON 必须返回 200。
5. 在真实浏览器中打开至少一个有文献、一个无文献和一个新增 Case。

有 mmCIF 但没有可用主文献时，页面应明确显示 unavailable。索引中完全没有该 PDB 时，Workbench 也会用 unavailable 保持页面可用，但这是显示降级，不是“mmCIF 已确认无主文献”的数据结论。在 Reference 发布任务中，该缺项仍须修复；在无关任务中只需记录已知差距。

## 八、Technique sidecar 与 E/F matrix

### 8.1 Technique sidecar

`profile-public-techniques.json.gz` 必须与同 Chain 的 `profile-index.json.gz` 保持 Profile ID、顺序和数量一致。发布审计以 PDB × Chain 精确键为准。

主要实现与校验工具：

```text
scripts/build-case-public-techniques.mjs
scripts/verify-case-public-techniques.mjs
scripts/build-case-public-techniques-preview.mjs
scripts/version-ef-entry-assets.mjs
```

全量构建必须使用已封存的 source manifest、独立 verifier 和隔离输出目录。不要直接在生产 Case 树中生成 sidecar。

### 8.2 E/F matrix

E/F 已不是「6 个独立页面」。当前线上有 695 个 `ef-matrix.json.gz`，覆盖 463 个 PDB；它们通过普通 Case 路由的 `family=E|F` 参数进入统一 Workbench。

验收至少覆盖：

- family 参数保留；
- 1D、matrix、2D、3D 与 inspector 联动；
- E/F 数据值语义来自 `value_kind`，不从 Family 字母猜测；
- 公开页面不泄露内部分类或原始错误诊断；
- 浏览器控制台无错误。

## 九、Download 与训练数据

SPA Download 页面由 `src/main.js` 渲染。原始数据/GEO 链接在 GitHub Pages 侧，处理后训练数据由 Tunnel 提供：

```text
https://foldbridge.sunhao.uk/training-data/alignment/
https://foldbridge.sunhao.uk/training-data/profiles/
https://foldbridge.sunhao.uk/training-data/reactivity/
```

对应生产目录：

```text
/Volumes/tianyi/Server/public/training-data/alignment/
/Volumes/tianyi/Server/public/training-data/profiles/
/Volumes/tianyi/Server/public/training-data/reactivity/
```

更新 Download 卡片属于 SPA 发布；更新训练数据文件属于 Tunnel 发布。两条链必须分别验收。

## 十、Tunnel 与 CORS 服务

### 10.1 当前服务

2026-09-11 实测：

- `cloudflared`：1 个进程；
- CORS 服务：LaunchAgent `com.foldbridge.cors-static`，状态 `running`；
- 监听：`127.0.0.1:8888`；
- docroot：`/Volumes/tianyi/Server/public`；
- Python 可执行文件：`/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python`；
- LaunchAgent：`/Users/joseperezmartinez/Library/LaunchAgents/com.foldbridge.cors-static.plist`；
- 服务脚本：`/Users/joseperezmartinez/docs/foldbridge/cors_static_server.py`；
- 日志：`/private/tmp/foldbridge-cors-static.log`。

当前 `cors_static_server.py` 和 LaunchAgent plist 都不由 `ghhttps/main` 恢复；脚本是主工作树的未跟踪运行时文件。因此：

- 不得在清理工作树、重新 clone、迁移服务或替换 LaunchAgent 时删除/覆盖这两个文件。
- 上述操作前，必须先把脚本与 plist 备份到 `/Volumes/tianyi/Server/rollback/foldbridge/service-<UTC 时间戳>/`，并保存 `shasum -a 256` 输出。
- 2026-09-11 已核对哈希：脚本 `d7964f3756d90a72a98287395ce4e7a9e08a5419ba8c9df9a0c3e40634378948`，plist `7c8cbc6cab74301f9695db6003ac780f13044b73ba3923867329058e5bed41df`。哈希仅标识当时实测文件，不替代备份。
- 在完成受审查的版本化之前，新 clone 不具备自动恢复该服务的能力；不得根据本手册自行拼凑替代脚本。

检查命令：

```bash
pgrep -x cloudflared
pgrep -fl cors_static_server.py
launchctl print gui/$(id -u)/com.foldbridge.cors-static
```

不要输出 cloudflared token，不要用 `killall cloudflared`。诊断时先确认进程数、端口、docroot、本机 GET，再检查 Tunnel 与公共响应。

### 10.2 macOS TCC

外接卷读取依赖 macOS Full Disk Access。授权对象应是 LaunchAgent 实际执行的 `Python.app`，不是泛指 `/usr/bin/python3`。

典型症状：OPTIONS 仍返回 204，但文件 GET 返回 404，且日志显示无法列出或读取 `/Volumes/tianyi/Server/public`。这时应先检查 TCC 和实际 executable，不要修改 iframe/CSP。

## 十一、故障定位表

| 症状 | 优先检查 | 不要先做 |
|---|---|---|
| SPA 内容仍旧 | `ghhttps/main` SHA、Pages latest build、公共缓存绕过 | 重推 `origin` |
| Case 404 | 生产文件、127.0.0.1:8888、TCC、Tunnel | 修改 Pages |
| Case 样式/脚本 404 | 指纹闭包、`site-nav.js`、`src/portalChrome.js`、`src/siteChrome.js` | 重建全部 Case |
| Reference 空或 unavailable | 公共索引 200、PDB 是否存在于索引、mmCIF `_citation` | 删除 Case 或写假文献 |
| A/a Chain 内容相同 | 大小写敏感卷、manifest 和 URL Chain | 在内置盘重铺 Case 树 |
| Technique 筛选不全 | sidecar 与 profile index 精确键、分类器版本 | 用总数差生成清单 |
| E/F 打不开 | family 参数、matrix 文件、指纹版 EF 资产 | 恢复旧 6-page 逻辑 |
| Download 卡片有但文件 404 | 分别检查 SPA main 与 Tunnel training-data | 只看 Pages 状态 |
| `pages.yml` 没有成功 run | Pages API、原生 `pages-build-deployment` | 启用旧工作流或重复推送 |

## 十二、完成检查清单

### Git / SPA

- [ ] 基线来自最新 `ghhttps/main`。
- [ ] 使用干净且合适的 worktree；内置盘任务避免完整 Case 检出。
- [ ] diff 只包含本次文件，`git diff --check` 通过。
- [ ] 当前可运行的相关测试和静态校验有新鲜输出；未声称缺失的历史 build 脚本已通过。
- [ ] 提交已 rebase 到最新 `ghhttps/main`。
- [ ] 用户已授权推送后，执行 `git push ghhttps HEAD:main`。
- [ ] 远端 main SHA 与本地 HEAD 一致。
- [ ] Pages latest build 对应目标 SHA，状态为 `built`。
- [ ] 公共 URL 和真实浏览器验收通过。

### Case / Tunnel

- [ ] 修改目标是 `/Volumes/tianyi/Server/public` 下的准确路径。
- [ ] 发布前已记录基线哈希和回滚点。
- [ ] 候选在隔离目录验证，没有直接重建生产树。
- [ ] 大小写 Chain 身份保持不变。
- [ ] 本机 GET、公共 GET、OPTIONS 均通过。
- [ ] iframe、Profile、Technique、2D/3D、Reference 等受影响行为已在浏览器验证。
- [ ] 没有把本机 `public/` 副本误报为线上发布。

## 十三、常用工具

| 工具 | 用途 |
|---|---|
| Git / `gh` | `ghhttps/main` 同步、GitHub Pages 状态与构建查询 |
| Node.js 22+ / npm | SPA 构建、索引生成和测试 |
| Python 3 | Case 数据提取与 CORS 静态服务 |
| `curl` / `jq` | HTTP、CORS 和 JSON 验收 |
| `shasum -a 256` | 候选、生产与公共资产一致性 |

---

**文档版本：** v3.0

**文档位置：** `docs/网站更新手册_DEPLOYMENT_HANDBOOK.md`
