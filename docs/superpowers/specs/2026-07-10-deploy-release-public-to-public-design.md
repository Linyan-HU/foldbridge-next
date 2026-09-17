# 部署设计：release-public → public 分支

**日期**：2026-07-10
**状态**：设计已经用户逐节批准，待 spec 审查

---

## 背景与根因

FoldBridge 是 vanilla-JS（ESM）hash 路由静态 SPA + 已部署 case 页资产（RASP + RMDB 两宇宙），线上服务于 `foldbridge.ribocentre.org`。

### 部署拓扑（实测）
- **`release-public`** = 开发权威源。所有 Plan 1（16 任务）+ Plan 2（6 任务）成果在此。**不跟踪 `dist/`**（`.gitignore` 含 `dist/` 与 `_site/`）。case 页在 `public/rasp-v3/`、`public/rmdb-v3/` 下，git 跟踪。
- **`public`** = 线上服务分支。**不是** CI 的 `_site` 产物，而是 **release-public 的源码树放在根目录 + 额外提交了 `dist/pagefind` 搜索索引**。站点用 GitHub Pages classic 模式从 `public` 根直接托管：SPA 从 `src/` 实时运行，pagefind 运行期从 `/dist/pagefind` 取索引。

### 为什么部署一直很麻烦（结构性根因）
1. **构建产物被提交进 git，还单独占一个长期分支**：`release-public`（无 dist）与 `public`（含 dist/pagefind + 11.4 万 case 页文件 + structure.cif.gz 二进制）是两个真相源，每次部署变成手动在两分支间搬运。
2. **功能开发漏到了部署分支上**：`public` 上有 6 个直接提交的功能/修复，导致两边持续分叉（166 ahead / 34 behind、merge 冲突严重）。
3. **产物量大 → 被迫分块 push → 分块漏文件 → 补 restore 提交**：历史里 `restore pagefind index dropped by sync`、`restore iframe shells` 等就是这条链的末端症状。

---

## 目标与范围

**目标**：把 `release-public` 上已完成的 Plan 1 + Plan 2 成果，安全、可复现地部署到线上服务分支 `public`，且不回归 `public` 上已有的 6 个直接提交。

**本轮范围（Phase A）**：一次干净的快照重建 + 部署到 `public`。

**记录为后续（Phase C）**：把 CI 改成从 `public` 触发 + 出站（产物由 CI 生成、推 `public` 自动部署），根治手动搬运。本轮只写路径、不执行。

**不在范围**：用户新 case pages 的引入（独立话题）；Phase C 的实际执行。

**决策记录**：
- 构建产物处理 = 本地构建后推送产物（沿用现状），`public` 保持"带产物的托管分支"。
- 6 个 public-only 提交 = 先逐个核对再重建。
- 路线 = 先 A 再 C。
- CI 出站分支 = `public`（不再涉及 main）。
- `public` 历史保留，往前加一个 rebuild 提交（可回退）。

---

## Phase A — 步骤一：Reconciliation（核对 6 个 public-only 提交）

**目的**：重建前确认 `public` 上 6 个直接提交的功能/修复，在 `release-public` 里已被同等或更新的实现覆盖；漏的先回迁到 `release-public`，保证它是完整权威源。

**待核对的 6 个提交**：
1. `693c556882` feat(nav): standalone Help page + Stats/Help in detail-page nav
2. `1fe8fb6c2b` fix(detail-page): VARNA viewBox from content + restore full profile dropdown
3. `c718bea839` fix(detail-page): repair 3D reactivity coloring + click-to-focus, drop 1D FEC/LSS axis
4. `0003b4d993` feat(stats): recompute LSS tiers / SASA coverage / RNA biology at entry caliber
5. `6b410709ee` feat(stats): surface entry-caliber metrics (4,664 probing / 510 high-conf / 176 strong)
6. `24c61c9011` fix(workbench): guard Mol* visual calls against uninitialized-plugin race

**核对方法（逐个）**：
- 取每个提交触碰的文件（`src/main.js` / `src/siteChrome.js` / `src/styles.css` / `searchCorpus.js` / `router.js` 等），用 `git diff origin/release-public origin/public -- <file>` 看差异。
- 判定三选一：
  - **已覆盖**（release-public 里有同等或更新实现）→ 无需动作，记录判定依据。
  - **漏了**（release-public 没有）→ cherry-pick 或手动移植该提交到 `release-public`，跑测试确认零回归。
  - **过时**（该功能已被 Plan1/2 取代/有意改掉）→ 有意丢弃，记录原因。

**产出**：一张 reconciliation 对照表（6 行：提交/判定/依据/动作）。任何"漏了"的先落地 `release-public` 并 push，才进入步骤二。

**验证**：回迁后 `node --test` 跑一遍，仅容许 3 个已知 5GAG 失败（按名认：「5GAG smoke consumes linked-view contract assets for residue semantics」/「5GAG DMS loop recall uses mapped AC positive signal positions only」/「5GAG 3D target display defaults to DMS reactivity colors on the cropped target chain」）。

---

## Phase A — 步骤二：快照重建 + 部署到 `public`

**前提**：步骤一完成，`release-public` 已是完整权威源（漏的都已回迁 + push）。

**执行（全在 worktree `~/docs/foldbridge-release`，每条命令需先 `cd` 进去）**：

> ⚠️ **顺序关键**：构建必须在整树替换**之后**做。若先构建再切分支/清树，`dist/pagefind` 会被 `git checkout public`（用 public 旧索引覆盖被 gitignore 的工作树文件）+ `git rm -rf .`（public 跟踪 dist/pagefind，会删掉）连环清掉，导致提交里带的是旧索引或没有索引——正是根因 #3。

1. **锁定源 sha**：记录当前 `release-public` HEAD sha（`git rev-parse release-public`）。此 sha 必须写进步骤 6 的部署提交信息 `deploy(public): rebuild from release-public <sha>`，作为唯一可复现锚点。
2. **切到 `public` 分支**（本地跟踪 origin/public，保留其历史）。
3. **整树替换（orphan-free 配方，是"替换"不是"合并"）**：
   - `git rm -rf .`（清空 `public` 工作树的所有跟踪文件，确保 release-public 上已删除的文件不会作为孤儿残留，也删掉 public 旧的 `dist/pagefind`）；
   - `git checkout release-public -- .`（把 reconciled 的 release-public 整棵树取过来：`index.html` / `src/` / `public/` 含全部 case 页 / `scripts/` / `test/` / `package*.json` / `.github/` / `CNAME` / `.nojekyll` 等，全部随之带入，无需逐一手动列举）。
   - 这个"先清空再取整树"的配方，才真正兑现"从根上杜绝漏文件/孤儿"的安全属性；单纯 `git checkout ... -- <path>` 只增改不删，无法保证。此时工作树 = 纯 release-public 树，`dist/` 尚不存在（被 gitignore 且 release-public 不跟踪）。
4. **本地全量构建（在替换后的树上）**：`npm ci` → `npm run build:site`（= `build:static && build:search-docs && build:search-index`，链式；此时 package.json/lock 已随步骤 3 就位）。产出完整 `dist/`，其中 `dist/pagefind/` 是本次新生成、基于 reconciled 树的索引。**注意**：`build:search-docs` 若无 `dist/` 会直接报错退出，所以必须走 `build:site` 全链，不能只跑 `build:search-docs`/`build:search-index`。`dist/` 其余内容仍被 gitignore、不提交。
5. **提交 pagefind 产物**：`git add -f dist/pagefind`（`dist/` 被 gitignore，必须 `-f` 强制加；此时索引是步骤 4 刚生成的新文件，无旧哈希孤儿——旧索引已在步骤 3 的 `git rm -rf .` 中随 public 树一并清除）。
6. **一次提交**：`deploy(public): rebuild from release-public <sha>`（单原子提交 = 单可部署状态；`public` 历史线性往前，旧 deploy 历史保留，可回退）。
7. **push `public`**：首次是大 push（源码树 + 11.4 万 case 页文件 + structure.cif.gz 二进制 + pagefind）。若单次 push 触发 HTTP/pack 上限被迫分块，**必须在 push 完成后核对** `git rev-parse origin/public` == 本地 rebuild 提交 sha，确认远端树完整（防止再次出现分块漏文件）。
8. **CI 不会自动触发**：当前 `pages.yml` 触发条件是 `on: push: branches: ["main"]`，推 `public` 不会跑 CI——这是本轮预期行为（Phase A 是纯手动部署 + classic 托管），实施者不要因"没有 CI 自动跑"而困惑。

**验证（在步骤 4 构建之后、步骤 6 提交之前，测的就是将要发布的树）**：
- `node --test` 仅 3 个已知 5GAG 失败；
- `npm run verify:mvp` 通过（CI 里的真实 sanity gate，本轮沿用）；
- 抽查 `dist/pagefind/` 存在且是本次新生成、非空；
- 抽查一个 RASP + 一个 RMDB case 页文件在树里；
- `git status` 干净（整树替换后无意外残留/未跟踪文件，除强制加的 `dist/pagefind`）。

**验证（部署后）**：抽查首页、搜索、一个 case 页线上可访问；核对 `CNAME` = `foldbridge.ribocentre.org`。

**风险与回退**：整树替换 + 提交前，`public` 旧状态即 `origin/public`；未 push 前 `git reset --hard origin/public` 零风险，已 push 后可 `git revert` 该 rebuild 提交回退。

**CNAME / .nojekyll**：两文件在 release-public 上已跟踪且与 public 字节相同，步骤 3 的整树取过程已自动带入，无需额外动作，仅部署后核对。

**遗留观察（本轮范围外，仅记录）**：`.env` 在两分支均被跟踪且未 gitignore（当前仅含 `FOLDBRIDGE_PORT`、无密钥，无泄露风险），整树替换会带到 public 并被 Pages 托管。建议后续单独 `git rm --cached .env` + 加进 `.gitignore`，防止将来误存密钥泄露。

---

## Phase C（记录为后续路径，本轮不执行）

**目标**：根治手动搬运——推 `public` 就自动构建 + 部署，构建产物由 CI 生成、不再手工搬。

**三个前置（都满足才动 C）**：
1. **处理 3 个已知失败的 5GAG 测试**：CI 的 `pages.yml` 先跑 `npm test`，`node --test` 有任一失败即红灯不部署。要么修复，要么正式 quarantine（skip 标记 + 注明原因）。
2. **仓库 admin 权限**：把 GitHub Pages 来源从"classic 从 public 根托管"切到"GitHub Actions"。
3. **reconciliation 已完成**（Phase A 已做，C 复用）。

**改动要点**：
- 工作流触发改为 `on: push: branches: ["public"]`；
- 构建步骤已有（`npm run build:pages` → `_site` → upload-pages-artifact → deploy-pages），CI 内现生成 `dist/pagefind`，产物不再进 git；
- 切换后 `public` 只放源码、不再带 `dist/pagefind`（由 CI 生成），仓库瘦身。

**记录，本轮不执行。** 等 Phase A 上线稳定、有 admin 权限、3 个测试处理完，再单开一轮做 C。
