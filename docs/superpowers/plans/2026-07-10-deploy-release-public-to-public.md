# release-public → public 部署实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 把 `release-public` 上的 Plan 1 + Plan 2 成果安全、可复现地部署到线上服务分支 `public`，不回归 `public` 上已有的 6 个直接提交。

**架构：** 两阶段——(A1) 逐个核对 6 个 public-only 提交、漏的回迁 `release-public`；(A2) orphan-free 快照重建（先清树取整树 → 构建 → 强制加 pagefind → 单个可回退提交 → push+sha 校验）落到 `public`。Phase C（CI 从 public 自动出站）本计划不含。

**技术栈：** git（worktree `~/docs/foldbridge-release`）、Node 22、npm、pagefind。

**设计文档：** `docs/superpowers/specs/2026-07-10-deploy-release-public-to-public-design.md`

**⚠️ 环境铁律：** 所有命令都在 worktree `~/docs/foldbridge-release` 内执行，每条命令前缀 `cd /Users/joseperezmartinez/docs/foldbridge-release && `（shell cwd 每条命令后会重置）。测试零回归口径：`node --test` 仅容许 3 个已知 5GAG 失败（「5GAG smoke consumes linked-view contract assets for residue semantics」/「5GAG DMS loop recall uses mapped AC positive signal positions only」/「5GAG 3D target display defaults to DMS reactivity colors on the cropped target chain」）。

---

## 文件结构

**核对涉及的源文件（各提交触碰）：**
- `693c556882` (nav Help)：`src/main.js`、`src/siteChrome.js`、`src/helpContentStore.js`、`src/assets/data/help-content.json`、`public/{rasp,rmdb}-v3/__*_site__/site-nav.js`、`test/site-chrome.test.js`
- `1fe8fb6c2b` (VARNA viewBox + profile dropdown)：`public/{rasp,rmdb}-v3/__*_site__/workbench.js`
- `c718bea839` (3D reactivity coloring)：`public/{rasp,rmdb}-v3/__*_site__/workbench.js`
- `0003b4d993` (stats recompute)：`scripts/build-site-stats.mjs`、`src/assets/generated/site-stats/stats.json`、`src/siteChrome.js`、`src/styles.css`、`test/site-stats-build.test.js`、`test/stats-page.test.js`
- `6b410709ee` (stats entry-caliber)：同上 stats 文件子集
- `24c61c9011` (Mol* race guard)：`public/{annojoin-smoke/5gag,rasp-v3/__rasp_v3_site__,rmdb-v3/__rmdb_v3_site__}/workbench.js`

**部署产物：** `dist/pagefind/`（构建生成，强制提交到 `public`）。

---

## 任务 1：Reconciliation（核对 6 个 public-only 提交）

**目的：** 重建前确认 `public` 上 6 个直接提交的功能/修复，在 `release-public` 里已被同等或更新实现覆盖；漏的先回迁 `release-public`，保证它是完整权威源。

**文件：**
- 只读核对：上文「文件结构」列出的各提交触碰文件
- 可能修改（仅当判定「漏了」）：对应源文件 in `release-public`
- 产出：reconciliation 对照表（写进本任务的完成记录 / commit message）

- [ ] **步骤 1：切到 release-public、确认干净且远端最新**

先抓远端：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git fetch origin
```
**显式切到 release-public**（不要只检查——cherry-pick 必须落在 release-public，落错分支会让权威源静默不完整）：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git checkout release-public
```
确认工作树干净 + 远端对齐：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git status && git rev-parse release-public origin/release-public origin/public
```
预期：当前分支 = `release-public`，`git status` 干净（无未提交改动）；打印 3 个 sha。若本地 release-public 落后 origin，先 `git pull --ff-only` 对齐再继续；若工作树有未提交改动，先处理（stash/commit）再进步骤 4 的 cherry-pick。

- [ ] **步骤 2：逐个 diff 6 提交触碰的文件**

对每个提交，逐文件比对 release-public 与 public 两侧内容差异。逐条运行（每条独立、无复合命令）：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- src/main.js
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- src/siteChrome.js
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- src/helpContentStore.js
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- src/assets/data/help-content.json
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- src/styles.css
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- scripts/build-site-stats.mjs
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- src/assets/generated/site-stats/stats.json
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- public/rasp-v3/__rasp_v3_site__/workbench.js
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git diff origin/release-public origin/public -- public/rasp-v3/__rasp_v3_site__/site-nav.js
```
预期：每条打印差异（或为空=两侧字节相同=该文件已覆盖）。RMDB 侧 workbench.js/site-nav.js 与 RASP 侧字节相同（跨宇宙不变量），核对 RASP 一侧即可代表两侧；若不放心可加跑 `rmdb-v3/__rmdb_v3_site__/` 对应文件。

- [ ] **步骤 3：对每个提交做三选一判定，填对照表**

对 6 个提交逐一判定：
- **已覆盖**（release-public 有同等或更新实现）→ 无动作，记录判定依据（如「Plan 1 任务 X commit `<sha>` 已实现同等 Help 页 + nav」）。
- **漏了**（release-public 没有）→ 进步骤 4 移植。
- **过时**（功能已被 Plan1/2 有意取代/改掉）→ 有意丢弃，记录原因。

判定依据（基于 memory codemap 的先验，执行时用步骤 2 的实际 diff 复核）：
- `693c556882` nav Help：Plan 1 任务 13/14 已重排 nav + 加 About（`c6ad17c4ff`/`8fef9e88b7`），site-nav.js Plan 2 任务 2/3 已 iframe-safe 注入（`ffbb77be21`/`c156bbb63f`）。预判**已覆盖**，用 diff 确认 help-content.json / helpContentStore.js 无遗漏。
- `1fe8fb6c2b` VARNA viewBox + profile dropdown：Plan 2 任务 5 自建彩色 family-badge 下拉（`389ffcfbe3`）覆盖 profile dropdown。预判**已覆盖/过时**，diff 确认 VARNA viewBox 逻辑不缺。
- `c718bea839` 3D reactivity coloring：当前分支名 `feature/3d-coloring-l2-fix` 正是此主题，且有诊断报告 commit `fc69ee9`。**重点核对**——diff workbench.js 确认 3D 染色修复在 release-public 已就位；缺则判**漏了**。
- `0003b4d993` + `6b410709ee` stats recompute / entry-caliber：核对 `build-site-stats.mjs` + `stats.json` + siteChrome.js。这两个是 stats 数值口径，Plan1/2 未见明确覆盖 → **重点核对**，很可能判**漏了**需回迁。
- `24c61c9011` Mol* race guard：memory 载明「已部署产物已含 loadComplete 竞态修复、超越 5gag」。预判**已覆盖**，diff workbench.js 确认 guard 在 release-public 已存在。

- [ ] **步骤 4：（仅当有「漏了」）移植该提交到 release-public**

对判定「漏了」的提交，优先 cherry-pick；有冲突则手动移植改动到对应文件。逐个：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git cherry-pick <commit-sha>
```
若 cherry-pick 冲突：手动编辑冲突文件 → `git add <file>` → `git cherry-pick --continue`。若该提交在 public 上的实现与 release-public 结构差异过大无法干净移植，改为按 diff 手动把功能改动写进 release-public 对应文件。

- [ ] **步骤 5：（仅当有移植）跑测试确认零回归**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && node --test
```
预期：仅 3 个已知 5GAG 失败（按名认，见环境铁律），其余全 pass。若有其它失败，修复后重跑，绝不带失败继续。

- [ ] **步骤 6：（仅当有移植）push release-public**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git push origin release-public
```
预期：push 成功；`git rev-parse origin/release-public` == 本地 HEAD。**若无移植（6 个全「已覆盖/过时」）跳过步骤 4-6，release-public 已是完整权威源。**

- [ ] **步骤 7：产出 reconciliation 对照表**

产出一张 6 行表（提交 / 判定 / 依据 / 动作），写进任务完成记录。此表是进入任务 2 的前置门：任何「漏了」都已落地 release-public 且 push 完成，才可进入任务 2。

---

## 任务 2：快照重建 + 部署到 `public`

**前提：** 任务 1 完成，`release-public` 已是完整权威源（漏的都已回迁 + push）。

> ⚠️ **顺序铁律：** 构建必须在整树替换**之后**做。若先构建再切分支/清树，`dist/pagefind` 会被 `git checkout public`（用 public 旧索引覆盖被 gitignore 的工作树文件）+ `git rm -rf .`（public 跟踪 dist/pagefind，会删掉）连环清掉，导致提交里带的是旧索引或没有索引——正是根因 #3。步骤严格按下列顺序，不可重排。

**文件：**
- 修改（分支级整树替换，非逐文件）：`public` 分支工作树
- 强制新增：`dist/pagefind/`（gitignore，`-f` 强制加）
- 产出：`public` 上单个 `deploy(public): rebuild from release-public <sha>` 提交

- [ ] **步骤 1：锁定源 sha**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git rev-parse release-public
```
预期：打印 40 位 sha。**记下此 sha**，它必须写进步骤 7 的部署提交信息 `deploy(public): rebuild from release-public <sha>`，作为唯一可复现锚点。

- [ ] **步骤 2：切到 public 分支**

**先清掉可能存在的未跟踪 `dist/`**（否则 `git checkout public` 会因 public 跟踪 `dist/pagefind`、而工作树有同名未跟踪文件而报错中止；首次干净跑没有，重试时可能有）：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && rm -rf dist
```
再切分支：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git checkout public
```
预期：切到本地 `public`（跟踪 origin/public，保留其历史）。若本地无 public，先 `git checkout -b public origin/public`。切换后 `git status` 应干净。

- [ ] **步骤 3：整树替换（orphan-free 配方，是「替换」不是「合并」）**

先清空 public 工作树所有跟踪文件（含 public 旧 `dist/pagefind`），运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git rm -rf .
```
预期：删除所有跟踪文件（暂存为删除）。

再把 reconciled 的 release-public 整棵树取过来，运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git checkout release-public -- .
```
预期：`index.html` / `src/` / `public/`（含全部 case 页）/ `scripts/` / `test/` / `package*.json` / `.github/` / `CNAME` / `.nojekyll` 全部随之带入。此时工作树 = 纯 release-public 树，`dist/` 尚不存在（被 gitignore 且 release-public 不跟踪）。「先清空再取整树」才真正兑现「从根杜绝漏文件/孤儿」——单纯 `git checkout ... -- <path>` 只增改不删。

- [ ] **步骤 4：本地全量构建（在替换后的树上）**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && npm ci
```
预期：依赖装好（package.json/lock 已随步骤 3 就位）。

再运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && npm run build:site
```
预期：链式跑 `build:static && build:search-docs && build:search-index`，产出完整 `dist/`，其中 `dist/pagefind/` 是本次新生成、基于 reconciled 树的索引。**注意**：`build:search-docs` 若无 `dist/` 会直接报错退出，所以必须走 `build:site` 全链，不能只跑 `build:search-docs`/`build:search-index`。`dist/` 其余内容仍被 gitignore、不提交。

- [ ] **步骤 5：验证（构建之后、提交之前，测的就是将要发布的树）**

运行测试：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && node --test
```
预期：仅 3 个已知 5GAG 失败（按名认）。

运行 CI sanity gate：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && npm run verify:mvp
```
预期：通过（CI 里的真实 gate，本轮沿用）。

抽查 pagefind 产物存在且非空：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && ls -la dist/pagefind
```
预期：有 `pagefind.js` + 索引分片文件，非空。

抽查一个 RASP + 一个 RMDB case 页在树里：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && ls public/rasp-v3/cases | head -1
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && ls public/rmdb-v3/cases | head -1
```
预期：各打印一个 case 目录名。（若 `cases` 子目录名与实际不符，退而查 `ls public/rasp-v3/` / `ls public/rmdb-v3/` 确认 case 页目录存在。）

- [ ] **步骤 6：强制加 pagefind 产物**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git add -f dist/pagefind
```
预期：`dist/pagefind` 被暂存（`dist/` 被 gitignore，必须 `-f`）。此时索引是步骤 4 刚生成的新文件，无旧哈希孤儿——旧索引已在步骤 3 的 `git rm -rf .` 中随 public 树一并清除。

检查暂存状态：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git status
```
预期：整树替换后无意外残留/未跟踪文件，除强制加的 `dist/pagefind`。

- [ ] **步骤 7：单个可回退提交**

运行（`<sha>` 换成步骤 1 记下的 release-public sha）：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git commit -m "deploy(public): rebuild from release-public <sha>"
```
预期：单原子提交（= 单可部署状态）；`public` 历史线性往前，旧 deploy 历史保留，可回退。

- [ ] **步骤 8：push public + sha 校验**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git push origin public
```
预期：首次是大 push（源码树 + 11.4 万 case 页文件 + structure.cif.gz 二进制 + pagefind）。**push 完成后必须核对远端树完整**：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git rev-parse origin/public HEAD
```
预期：两 sha 相等，确认远端 == 本地 rebuild 提交（防止分块 push 漏文件）。若单次 push 触发 HTTP/pack 上限被迫分块，push 完成后此校验仍必须通过。

**CI 不会自动触发**：当前 `pages.yml` 触发条件是 `on: push: branches: ["main"]`，推 `public` 不会跑 CI——这是本轮预期行为（Phase A 是纯手动部署 + classic 托管），不要因「没有 CI 自动跑」而困惑。

- [ ] **步骤 9：部署后核对（线上）**

**先等 GitHub Pages 完成重新部署**（classic 模式 push 后通常 1-2 分钟；立刻访问可能看到旧内容）。核对本地 `CNAME` 值：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && cat CNAME
```
预期：`foldbridge.ribocentre.org`。

抽查线上可访问（首页 200）：
```bash
curl -sI https://foldbridge.ribocentre.org/
```
预期：`HTTP/2 200`。再在浏览器抽查首页、搜索、一个 case 页可访问渲染正常。

**风险与回退：** 整树替换 + 提交前，`public` 旧状态即 `origin/public`；未 push 前 `git reset --hard origin/public` 零风险，已 push 后可 `git revert` 该 rebuild 提交回退。

**遗留观察（本轮范围外，仅记录）：** `.env` 在两分支均被跟踪且未 gitignore（当前仅含 `FOLDBRIDGE_PORT`、无密钥，无泄露风险），整树替换会带到 public 并被 Pages 托管。建议后续单独 `git rm --cached .env` + 加进 `.gitignore`。

---

## 完成后

所有任务完成后：使用 `superpowers:finishing-a-development-branch` 收尾（本计划工作在 worktree `~/docs/foldbridge-release`，主要产物是 release-public 上的 reconciliation 移植 + public 上的 rebuild 部署提交）。Phase C（CI 从 public 自动出站）记录在设计文档，本轮不执行。
