# CI 自动部署 release-public → public 设计（办法 A）

**日期：** 2026-07-10
**状态：** 设计待审查
**关联：** Phase A 部署计划 `docs/superpowers/plans/2026-07-10-deploy-release-public-to-public.md`（本设计复用其任务 2 的 orphan-free 重建配方）；设计 `docs/superpowers/specs/2026-07-10-deploy-release-public-to-public-design.md`。

## 背景与动机

线上站点 `foldbridge.ribocentre.org` 走 GitHub Pages classic「从分支根托管」，服务分支 = `public`。当前部署是**纯手动**：在 worktree 里手工跑 Phase A 任务 2 的整树替换 + 构建 + push。手动流程的痛点（Phase A 设计已记录）：产物入 git、功能开发漏到部署分支、大 push 分块漏文件。

**Phase C 原方案** = 让 CI 从 `public` 用 Actions 原生出站，但前置依赖「仓库 admin 把 Pages 源 classic→Actions」。**用户拿不到该 admin 权限**，Phase C 原路径被阻塞。

**办法 A（本设计）** 绕开 Pages 源切换：保持 classic「从分支托管」不变，改为让 **CI 在每次 push `release-public` 时自动重建并 push 到 `public`**。Pages 见到 `public` 更新即自动重新部署（classic 模式固有行为，无需改任何 Pages 设置）。所需权限仅 = 仓库 Actions 的 `GITHUB_TOKEN` 写权限（`permissions: contents: write`），远弱于 admin Pages 源切换。

## 目标

- 消除手动 shuttle：push `release-public` → 线上自动更新。
- 复用已验证的 orphan-free 重建配方（Phase A 任务 2），不引入新的部署语义。
- 保持零回归门（`node --test` + `verify:mvp`）在部署前把关。
- 提供无新权限的本地退路（办法 B），以防 CI 无写权限。

## 非目标

- 不切换 GitHub Pages 源（classic→Actions）——那是被阻塞的 Phase C 原路径。
- 不改 `public` 的托管方式或 CNAME。
- 不动现有 `pages.yml`（它触发于 `main`，与本部署路径正交，保留不管）。
- 不做 `.env` 治理（Phase A 遗留观察，范围外）。

## 触发策略（用户已定）

**每次 push `release-public` 自动触发** + `workflow_dispatch` 手动逃生口。

**已知权衡（用户知情选择）：** `release-public` 会收到频繁的 WIP / subagent-dev 提交；每次 push 自动部署意味着**每个半成品提交都会立即上线**。用户明确接受此风险。未来若要安全阀，最干净的是把触发改成 `on: push: tags: ["deploy-*"]`（只在打部署 tag 时出站）——属未来变更，本设计不含。

## 架构：两个产物

### 产物 1：`scripts/deploy-to-public.sh`（承重逻辑）

把 Phase A 任务 2 的步骤固化成脚本，CI 与本地共用。**门禁内置在脚本里**（而非拆成 CI 独立 step），这样本地退路运行也享有同样的 test/verify 保护。核心序列（`set -euo pipefail`）：

```bash
# ── 前置安全门（CI 里恒真；本地退路的救命护栏）──────────────
# clean-tree 前置：git rm -rf . 是破坏性操作，脏工作树会丢未提交改动。
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: worktree not clean; commit/stash before deploying" >&2
  exit 1
fi

git fetch origin
git checkout release-public
git pull --ff-only origin release-public     # 本地对齐 origin，杜绝 stale 部署（CI 里已是 pushed ref）
SHA=$(git rev-parse release-public)          # 唯一可复现锚点

# ── orphan-free 整树重建（顺序不可重排）──────────────────────
rm -rf dist                                  # 清未跟踪 dist，否则 checkout public 会因同名冲突中止
git checkout public 2>/dev/null || git checkout -b public origin/public
git reset --hard origin/public               # 本地 public 对齐 origin（防落后于并发部署）
git rm -rf .                                 # 清空 public 树（含旧 dist/pagefind）
git checkout release-public -- .             # 取整棵 reconciled 树

# ── 构建（必须在整树替换之后）+ 门禁 ─────────────────────────
npm ci
npm run build:site                           # 重新生成 fresh dist/pagefind
node --test                                  # 门：现 363 pass / 0 fail（依赖 c3dfbc78a5 删除 3 个 5GAG 测试）
npm run verify:mvp                           # CI sanity gate

# ── 部署产物完整性 assert（构建后、提交前，测的就是将要发布的树）──
test -s dist/pagefind/pagefind.js            # pagefind 索引存在且非空
test -f CNAME                                # 自定义域名文件在树里（丢失=线上域名断）
grep -qx "foldbridge.ribocentre.org" CNAME   # CNAME 值正确
test -f .nojekyll                            # 关闭 Jekyll 处理

# ── 强制加 pagefind + 空提交判定 ─────────────────────────────
git add -f dist/pagefind                     # pagefind 被 gitignore，须 -f
if git diff --cached --quiet; then
  echo "No changes vs current public; skipping commit/push." >&2
  exit 0                                      # 无实质变化：正常退出，不误红 CI
fi

git commit -m "deploy(public): rebuild from release-public ${SHA}"
git push origin public
test "$(git rev-parse origin/public)" = "$(git rev-parse HEAD)"   # push 后 sha 校验
```

**顺序铁律（继承 Phase A）：** 构建必须在整树替换**之后**。若先构建再切分支/清树，`dist/pagefind` 会被 `git checkout public` + `git rm -rf .` 连环清掉。脚本严格按上序，不可重排。

**空提交处理（C1）：** 若重建后树相对当前 `public` 字节相同，`git commit` 会因无暂存变化在 `set -e` 下中止误红。故 `git add -f` 后用 `git diff --cached --quiet` 判定：无暂存差异则打印说明并 `exit 0` 正常退出，跳过 commit/push。（注：pagefind 索引可能含非确定内容，实践中这一分支未必常触发；它是防误红的安全网，不是优化。）

**本地退路安全前置（C2）：** 脚本首行的 clean-tree 门 + `git pull --ff-only`（release-public）+ `git reset --hard origin/public`（public 侧）三重护栏，使这段破坏性配方在**持久化本地 worktree** 里也安全：脏树直接拒跑（防丢未提交改动），两分支都对齐 origin（防 stale 部署 / 防落后于并发部署）。这也是 CI↔本地行为一致的前提。

**非快进 push（I4）：** 若 `origin/public` 在 checkout 与 push 之间被推进（CI-vs-本地竞争，或手动办法 B 并发），`git push` 会被拒、`set -e` 中止。脚本**不自动 rebase/force**（force push 到线上服务分支违反前向安全铁律）；由操作者重跑脚本（重跑会 `git reset --hard origin/public` 重新对齐后再重建）。concurrency group（`cancel-in-progress: true`）对并发 CI 是**取消去重**（非排队串行），故 CI-vs-CI 不会撞 push；CI-vs-本地竞争靠重跑收敛。

**幂等 / 可重跑：** 脚本每次从 `git fetch` + `reset --hard origin/public` + 整树替换重建，不依赖上次残留状态；中途失败重跑安全（未 push 前 `git reset --hard origin/public` 零风险）。

### 产物 2：`.github/workflows/deploy-to-public.yml`（薄包装）

```yaml
name: Deploy release-public to public
on:
  push:
    branches: ["release-public"]
  workflow_dispatch:
permissions:
  contents: write
concurrency:
  group: deploy-public
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0            # 需要两个分支 + 全历史
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Configure git identity
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
      - name: Rebuild and deploy
        run: bash scripts/deploy-to-public.sh
```

## 关键设计决策

1. **循环安全：** workflow 触发于 `release-public`，push 到 `public`。`public` 的 push 不触发本 workflow（触发白名单只有 `release-public`）→ 无无限循环。
2. **门禁在脚本内：** test/verify 写进 `deploy-to-public.sh`，本地退路与 CI 走同一保护，不在 YAML 里重复。**注意 CI↔本地是「功能等价」非「字节一致」（I1 修正）**：CI = ubuntu-latest + pinned node 22，本地 = macOS + 用户本机 node；pagefind 是平台相关 native/wasm 二进制，跨 OS/arch/node 版本索引产物可能有字节差异。两条路径产出**功能等价**（同一 reconciled 源树、同一门禁），但不保证 pagefind 索引逐字节相同。若日后需严格一致，需固定本地 node 版本或统一在容器里构建。
3. **两文件都提交在 `release-public`：** 脚本在 `git rm -rf . && git checkout release-public -- .` 后仍在树里（因它属 release-public 树），能自我存活。workflow 文件也随整树带到 `public`，在 `public` 上无害（`public` 的 push 不触发它）。
4. **`GITHUB_TOKEN` 写权限 caveat：** `permissions: contents: write` 请求写权限，但若仓库 org / Settings→Actions→Workflow permissions 被强制只读，push step 会失败。**首次 CI 运行即验证**。若失败 → 本地跑 `bash scripts/deploy-to-public.sh`（办法 B），零代码改动。
5. **首次 push 巨大：** ~11.4 万 case 页文件 + pagefind + structure.cif.gz 二进制。GitHub Actions 能处理大 push，但首跑慢。
6. **fetch-depth: 0：** 默认浅克隆只检出触发 ref、拿不到 `origin/public`；整树替换需要 `public` 分支在本地。严格说只需 `public` ref，但 depth:0（全历史）是有效超集，且回退（`git revert`）与历史保留也受益，故取 0。
7. **concurrency `cancel-in-progress: true`（I5 分析）：** 部署场景 newer-wins 通常正确（旧的半成品被新提交取代）。但与「每次 push 触发」+「首次 ~11.4 万文件大 push」叠加时，密集连续 push 可能反复取消进行中的部署，突发期内线上可能短时得不到更新。收敛条件：突发停止后最后一次 push 会跑完整流程落地。若日后突发频繁导致线上饥饿，可改 `cancel-in-progress: false`（排队串行，代价是延迟累积）。本轮取 `true`。

## 办法 B 退路（无新权限）

`scripts/deploy-to-public.sh` 本身就是退路：CI 若因写权限失败，在本地 worktree `~/docs/foldbridge-release` 直接 `bash scripts/deploy-to-public.sh` 即完成同样部署，用本地 git 凭证 push，不需要任何新权限。脚本是 CI 与本地的单一真相源，两条路径**功能等价**（同源树 + 同门禁；pagefind 二进制索引跨平台可能有字节差异，见决策 2）。脚本首行 clean-tree 门 + `git pull --ff-only` + `git reset --hard origin/public` 三重前置（C2）保证本地持久 worktree 里跑也安全——脏树拒跑、两分支对齐 origin。

## 风险与回退

- **半成品上线**（每次 push 触发）：用户知情接受；未来可切 tag 触发。
- **CI 无写权限**：首跑暴露 → 立即回落办法 B，无返工。
- **部署出错**：`public` 历史线性保留，`git revert <deploy-sha>` + `git push origin public` 前向回退，不需 force push。
- **构建/测试失败**：门禁在整树替换之后、commit 之前跑；失败即 `set -e` 中止，不会 push 坏树。未 push 前本地状态可 `git reset --hard origin/public` 复原。
- **`.env` 自动上线（I3）：** `.env` 在两分支均被跟踪、未 gitignore，整树替换会带到 `public` 并被 Pages 托管（Phase A 遗留观察）。手动部署时有人工检查点；**自动化后该检查点消失**——若日后有密钥落进 `release-public` 的 `.env`，CI 会自动把它 push 到 web 托管分支。当前 `.env` 仅含 `FOLDBRIDGE_PORT`、无密钥，无即时泄露风险；但自动化抬升了此风险，**强烈建议启用本 workflow 前先 `git rm --cached .env` + 加进 `.gitignore`**（本设计标为紧邻前置，非范围外）。
- **非快进 push（I4）：** 见脚本「非快进 push」说明——不 force，靠操作者重跑（重跑 `reset --hard origin/public` 后重建）收敛。

## 验证方式

- 脚本逻辑：本地 `bash scripts/deploy-to-public.sh` 首跑一遍（**即真部署**，非 dry-run，等价 Phase A 手动流程；用户确认后执行）。脚本内已 assert `dist/pagefind/pagefind.js` 非空、`CNAME` 存在且值正确、`.nojekyll` 存在（I2 恢复 Phase A 完整性检查）。
- workflow：合并到 `release-public` 后首次 push 触发，观察 Actions run 是否绿；push step 成败即判定写权限是否可用。
- 部署后：**先等 Pages classic 模式重新部署（push 后约 1-2 分钟；立刻访问可能看到旧内容，别误判失败，M5）**，再 `curl -sI https://foldbridge.ribocentre.org/` 期望 `HTTP/2 200` + 浏览器抽查首页/搜索/case 页。
