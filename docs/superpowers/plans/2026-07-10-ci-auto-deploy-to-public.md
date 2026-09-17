# CI 自动部署 release-public → public 实现计划（办法 A）

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 落地两个产物——承重脚本 `scripts/deploy-to-public.sh`（orphan-free 整树重建 + 门禁 + 破坏性操作前置护栏）和薄包装 workflow `.github/workflows/deploy-to-public.yml`（push release-public 触发），使 push `release-public` 即自动重建并 push 到线上服务分支 `public`。

**架构：** 门禁与部署逻辑全部固化进单一 shell 脚本（CI 与本地退路办法 B 共用同一真相源）；workflow 只做 checkout + setup-node + git identity + 调脚本。脚本继承已执行的 Phase A 任务 2 orphan-free 配方（构建严格在整树替换之后），加 clean-tree/`--ff-only`/`reset --hard origin/public` 三重前置使其在持久本地 worktree 里也安全。

**技术栈：** bash（`set -euo pipefail`）、git、Node 22、npm、pagefind、GitHub Actions。

**设计文档：** `docs/superpowers/specs/2026-07-10-ci-auto-deploy-to-public-design.md`

**⚠️ 环境铁律：**
- 所有命令在 worktree `/Users/joseperezmartinez/docs/foldbridge-release` 内执行，每条命令前缀 `cd /Users/joseperezmartinez/docs/foldbridge-release && `（shell cwd 每条命令后会重置）。当前分支必须是 `release-public`。
- **绝不 push**。两个产物 commit 到 release-public 即止——一旦启用 workflow，push release-public 会立即触发线上部署。push 与否由用户在计划执行完后单独决定。
- **紧邻前置已完成**：`.env` 已 `git rm --cached` + 加进 `.gitignore`（commit `365bac6b75`），本计划不再处理。
- **测试工具现状**：本机无 `shellcheck`、无 `actionlint`；有 `bash`（语法检查 `bash -n`）+ `python3` 的 `yaml`（YAML 解析）。故本计划的"测试"= 静态验证（语法解析 + 结构 grep 断言安全关键护栏存在）。真正的集成测试 = 首次真实部署运行，由用户单独 gate，不在本计划内。

---

## 文件结构

**创建：**
- `scripts/deploy-to-public.sh` — 承重部署脚本。职责：从 release-public orphan-free 重建整树 → 构建 → 门禁 → 完整性 assert → 单个可回退提交 → push public + sha 校验。内置全部门禁 + 破坏性操作前置护栏，CI 与办法 B 共用。设为可执行（`chmod +x`），虽然 `bash scripts/...` 调用不强制需要。
- `.github/workflows/deploy-to-public.yml` — 薄包装 workflow。职责：`push: release-public` + `workflow_dispatch` 触发；`permissions: contents: write`；concurrency 取消去重；checkout（fetch-depth 0）+ setup-node 22 + git identity + `bash scripts/deploy-to-public.sh`。

**验证辅助（临时，不提交）：**
- 用 `bash -n` 校验脚本语法
- 用 `python3 -c "import yaml; yaml.safe_load(...)"` 校验 workflow YAML
- 用 `grep` 断言安全关键行存在

两个文件都是自包含产物，无跨文件耦合。脚本先写（workflow 依赖它存在），workflow 后写。

---

## 任务 1：承重脚本 `scripts/deploy-to-public.sh`

**目的：** 把设计文档产物 1 的核心序列固化成可执行脚本，含全部门禁与破坏性操作前置护栏。

**文件：**
- 创建：`scripts/deploy-to-public.sh`

- [ ] **步骤 1：写脚本文件**

写入 `scripts/deploy-to-public.sh`，完整内容如下（逐字取自设计文档产物 1，加 shebang + `set -euo pipefail` + 顶部注释）：

```bash
#!/usr/bin/env bash
#
# deploy-to-public.sh — 从 release-public orphan-free 重建整树并部署到线上服务分支 public。
#
# CI（.github/workflows/deploy-to-public.yml）与本地退路（办法 B）共用此单一真相源。
# 门禁内置在脚本内，两条路径享有同样的 test/verify 保护。
# 设计文档：docs/superpowers/specs/2026-07-10-ci-auto-deploy-to-public-design.md
#
# 顺序铁律：构建必须在整树替换之后（否则 fresh dist/pagefind 会被 checkout/rm 连环清掉）。
#
set -euo pipefail

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

- [ ] **步骤 2：设为可执行**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && chmod +x scripts/deploy-to-public.sh
```

- [ ] **步骤 3：bash 语法校验（静态测试，不执行）**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && bash -n scripts/deploy-to-public.sh
```
预期：无输出、退出码 0（语法合法）。**绝不真跑脚本**——它会真部署到线上。

- [ ] **步骤 4：结构断言（grep 安全关键护栏存在）**

逐条运行，每条预期打印匹配行（非空）：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'set -euo pipefail' scripts/deploy-to-public.sh
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'git status --porcelain' scripts/deploy-to-public.sh
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'git pull --ff-only origin release-public' scripts/deploy-to-public.sh
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'git reset --hard origin/public' scripts/deploy-to-public.sh
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'git diff --cached --quiet' scripts/deploy-to-public.sh
```
预期：5 条都打印各自的行。这些是设计文档 C1/C2 护栏的可执行落地。

- [ ] **步骤 5：顺序断言（构建在整树替换之后）**

运行（取关键行的行号，人工核对 `git rm -rf .` < `git checkout release-public -- .` < `npm run build:site`）：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n -e 'git rm -rf \.' -e 'git checkout release-public -- \.' -e 'npm run build:site' scripts/deploy-to-public.sh
```
预期：三行按此行号顺序出现（rm 树 → 取整树 → 构建）。顺序错则铁律被违反。

- [ ] **步骤 6：Commit**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git add scripts/deploy-to-public.sh && git commit -m "feat(deploy): add deploy-to-public.sh orphan-free rebuild + gates script"
```
预期：单文件提交成功。**不 push。**

---

## 任务 2：workflow `.github/workflows/deploy-to-public.yml`

**目的：** 薄包装，push release-public 时在 GitHub Actions 里调脚本。

**前提：** 任务 1 完成（脚本已存在于 release-public 树，workflow 调用它才有意义）。

**文件：**
- 创建：`.github/workflows/deploy-to-public.yml`

- [ ] **步骤 1：写 workflow 文件**

写入 `.github/workflows/deploy-to-public.yml`，完整内容如下（逐字取自设计文档产物 2）：

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

- [ ] **步骤 2：YAML 语法校验（静态测试）**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/deploy-to-public.yml')); print('parsed ok:', list(d.keys()))"
```
预期：`parsed ok: ['name', True, 'permissions', 'concurrency', 'jobs']` 或类似（注意 YAML 把裸 `on:` 解析成布尔 `True` 键——这是 YAML 1.1 的已知行为，`yaml.safe_load` 按插入序返回故 `True` 在第二位，GitHub Actions 仍正确识别 `on`，不是 bug）。退出码 0 = YAML 合法。

- [ ] **步骤 3：结构断言（grep 触发白名单 + 权限 + 脚本调用）**

逐条运行，每条预期打印匹配行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'branches: \["release-public"\]' .github/workflows/deploy-to-public.yml
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'contents: write' .github/workflows/deploy-to-public.yml
```
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && grep -n 'bash scripts/deploy-to-public.sh' .github/workflows/deploy-to-public.yml
```
预期：3 条都打印。**循环安全的关键断言**：触发白名单只有 `release-public`（不含 `public`），故 push public 不会重触发。

- [ ] **步骤 4：确认不触碰既有 pages.yml**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git status --porcelain .github/workflows/
```
预期：只有 `?? .github/workflows/deploy-to-public.yml`（新增），`pages.yml` 无改动（它触发于 main，与本部署路径正交，本计划不动它）。

- [ ] **步骤 5：Commit**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git add .github/workflows/deploy-to-public.yml && git commit -m "feat(deploy): add CI workflow to auto-deploy release-public to public"
```
预期：单文件提交成功。**不 push。**

---

## 任务 3：自存活验证（脚本随整树替换能自我保留）

**目的：** 设计决策 3 声称脚本 + workflow 在 `git rm -rf . && git checkout release-public -- .` 后仍在树里（因它们属 release-public 树）。静态验证这个不变量——不真跑破坏性配方。

**文件：** 无（纯验证任务，无产出文件）。

- [ ] **步骤 1：确认两文件已在 release-public 的跟踪树里**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git ls-files scripts/deploy-to-public.sh .github/workflows/deploy-to-public.yml
```
预期：两个路径都打印（= 已被 git 跟踪，属 release-public 树）。因 `git checkout release-public -- .` 会把整棵 release-public 跟踪树取回，这两文件必随之保留 → 脚本能自我存活、workflow 也随整树带到 public（在 public 上无害，因触发白名单不含 public）。这是决策 3 的静态证明，无需执行破坏性配方即可确认。

- [ ] **步骤 2：确认脚本可执行位已提交**

运行：
```bash
cd /Users/joseperezmartinez/docs/foldbridge-release && git ls-files -s scripts/deploy-to-public.sh
```
预期：mode = `100755`（可执行）。若是 `100644`，回任务 1 步骤 2 `chmod +x` 后 `git add` 重提。

---

## 完成后

所有任务完成后，**产物已 commit 在 release-public，未 push**。向用户交接以下决策（本计划不代为执行）：

1. **是否 push release-public** — 一旦 workflow 文件进入 release-public 并 push，首次 push 即触发线上自动部署。用户需明确授权。
2. **首次运行即验证写权限** — push 后观察 Actions run 是否绿；push step 成败判定 `GITHUB_TOKEN` 写权限是否可用。若失败 → 本地跑 `bash scripts/deploy-to-public.sh`（办法 B），零代码改动。
3. **部署后核对** — 先等 Pages classic 重新部署（push 后 1-2 分钟），再 `curl -sI https://foldbridge.ribocentre.org/` 期望 HTTP 200 + 浏览器抽查首页/搜索/case 页。

收尾用 `superpowers:finishing-a-development-branch`（本计划工作在 worktree `/Users/joseperezmartinez/docs/foldbridge-release`，产物 = release-public 上的脚本 + workflow + 前置的 `.env` untrack 提交）。
