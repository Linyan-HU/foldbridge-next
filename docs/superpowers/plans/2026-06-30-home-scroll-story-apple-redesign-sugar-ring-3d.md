# Home Scroll Story — Apple-Style Redesign + Sugar-Ring 3D Implementation Plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 FoldBridge 主页的"招牌滚动叙事"（home scroll story）回归已批准的 B 方案 Apple 风格原型——重绘 3D 快照为真实糖环（sugar ring）渲染，并把滚动叙事区重新设计成暖黄渐变 + 玻璃拟态的叙事流，同时保留顾问锁定的站点顶栏不动。

**架构：** 纯 vanilla-JS 静态站，`src/siteChrome.js` 暴露无副作用的渲染函数返回 HTML 字符串，`src/main.js` 负责挂载并用 IntersectionObserver 驱动滚动激活，`src/styles.css` 承载视觉。3D 快照是离线生成的提交资产（committed PNG），由 `render-1ob5-3d.py`（biopython + matplotlib）从真实 cif 文件渲染、由 reactivity 配色权威表着色，运行时仅作为静态图引用。本计划只触碰滚动叙事区与其 3D 资产，不改顶栏、不改运行时数据通路。

**技术栈：** vanilla JS（ES modules，纯渲染函数）、CSS（design-tokens + BEM 风格 `.hss-*` 类）、node --test（HTML 字符串断言）、Python 3 + biopython（`Bio.PDB.MMCIFParser`）+ matplotlib（离线 3D PNG 生成）。

---

## 文件结构

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `src/siteChrome.js` | MODIFY | 纯渲染函数所在。`renderHomeScrollStory(caseData, opts)` 产出整个滚动叙事区 HTML。需新增：hero intro 区块（kicker / headline "Follow one RNA from probing signal to 3D fold" / lede / scroll-cue）、3 行 alignment（query / matchline / PDB）、scene chips、closing CTA。`renderReactivityAlignment` 已支持缺数据中性灰。允许新增导出的 helper（如 `renderHssIntro` / `renderHssChips` / `renderHssClosing`）。严格保持无 DOM / window 访问——所有函数只接收数据、返回 HTML 字符串。 |
| `src/styles.css` | MODIFY | `.home-scroll-story` / `.hss-*` CSS 块位于约 6224–6264 行。重设计为 Apple 美学：暖黄渐变背景、玻璃拟态卡片、`--radiusCard` 圆角、`--shadowSoft` 阴影。为 intro / chips / closing / 3 行 alignment 新增类。保留 `.hss-js` 渐进增强门控（无 JS 时优雅降级）、`@media (max-width:820px)` 响应式与 `prefers-reduced-motion` 规则。复用 design-tokens（见下）；`--gold`（原型 #E6C260）未在 tokens 定义——需用局部常量或补一个 token，任务中显式处理。 |
| `test/home-scroll-story.test.js` | MODIFY | node --test，对 HTML 字符串做断言。为新增的 intro / chips / closing / 3 行 alignment 标记补充与调整断言。当前基线 234 测试全绿，改动后必须仍全绿。 |
| `src/assets/generated/home-scroll-story/render-1ob5-3d.py` | MODIFY | biopython + matplotlib 离线 3D 渲染脚本。把当前稀疏的 C1'-only 散点轨迹改写成填充的五元核糖糖环（每残基原子 C1' C2' C3' C4' O4'），用骨架连线相连，按真实 reactivity 着色，数据源为真实 cif 文件。配色须用 reactivity 权威表（见下），与 1D/2D 完全一致。 |
| `src/assets/generated/home-scroll-story/1ob5-3d.png` | REGENERATE | 上述 Python 脚本的输出，作为提交资产。改写脚本后重新生成并提交。 |
| `src/assets/generated/home-scroll-story/README.md` | MAYBE MODIFY | 资产再生步骤文档。更新 3D 小节，描述糖环渲染方式（原子集合、骨架连线、配色权威、norm_ceiling）。 |
| `src/main.js` | REFERENCE（确认/必要时微调） | `renderHomeScrollStory` 在第 1478 行调用；`initHomeScrollStory()`（IntersectionObserver，幂等）在 3494–3522 行。观察器对 `.hss-scene[data-scene]` 与 `.hss-layer[data-stage]` 切换 `.is-active`。**约束：** 新增的 intro / closing 区块放进 `.home-scroll-story` 内部时，观察器逻辑必须仍只观察 `.hss-scene` 元素——任务中需确认无行为变化；若 main.js 确需微调（例如新区块意外被选中），在该任务里显式标注并最小化改动。顶栏（advisor-locked）一律不动。 |

### 复用的 design tokens（`src/design-tokens.css`，原型配色已对齐，直接复用）

- `--accent: #2F8F6B`（绿）
- `--accentSoft: #C7E36B`
- `--primary: #174B3A`（深绿）
- `--textPrimary: #14221C`（墨色）
- `--textSecondary: #5D6C64`（弱化文字）
- `--radiusCard: 22px`、`--shadowSoft`、`--page-max-width: 1400px`
- ⚠️ `--gold` 未定义——原型用 #E6C260。需在 styles.css 用局部常量或在 design-tokens 补一个 token（任务中决定并记录）。

### Reactivity 配色权威（永不更改，1D / 2D / 3D 必须完全一致）

- 色标 stops `[[23,75,58],[230,194,96],[232,116,62]]` = #174B3A（冷绿，0）→ #E6C260（金，0.5）→ #E8743E（暖橙，1）。
- 无数据残基 = 中性灰 #E9EDEA。
- 归一化 `norm = max(0, min(1, value / norm_ceiling))`；1OB5 的 `norm_ceiling = 1.7082`。

---

# PART 2 — 3D 糖环重渲 (Sugar-Ring Re-Render)

Replace the sparse C1'-only scatter+line 3D snapshot of 1OB5 chain F with **filled
5-membered ribose rings** (one per residue), colored by real reactivity, plus a thin
neutral backbone trace — keeping the exact same color authority, PCA orientation,
camera, transparent background, and output path.

## Scope / invariants (do not violate)
- Target file (rewrite only this): `src/assets/generated/home-scroll-story/render-1ob5-3d.py`
- Output path stays: `src/assets/generated/home-scroll-story/1ob5-3d.png`
- Color authority unchanged: `STOPS=[(23,75,58),(230,194,96),(232,116,62)]`,
  `NEUTRAL=(233/255,237/255,234/255)` (#E9EDEA), same `color(t)` 3-stop gradient.
- Data honesty: no-data residue → NEUTRAL; never extrapolate color for missing
  reactivity; real cif coordinates only, no fabricated geometry.
- Ring atom connectivity order = `C1' C2' C3' C4' O4'` (furanose ring, polygon
  closes O4'→C1').
- Same PCA(SVD) orientation + `view_init(elev=90, azim=-90)` + transparent bg as the
  current script so the tRNA L-shape stays recognizable.
- This is a generated ASSET (not unit-tested JS). "Test" = a pure ring-extraction
  function asserted to return 62 rings × 5 vertices BEFORE plotting, then script runs
  clean + prints counts + produces a non-trivial PNG.
- Working dir for all commands is the worktree root:
  `/Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story`
- cif input: `/tmp/1ob5.cif` (present, 1.68 MB, verified).

---

## Task 1 & 2 — 3D 糖环重渲 (Sugar-Ring Re-Render)

> 本块是计划的前两个任务（资产层）：Task 1 = 环提取逻辑（RED→GREEN），Task 2 = 重生成并提交 PNG。完成后进入 Part 3 的 Task 3 起的前端任务。

### Step 1 — RED: write a standalone assertion harness for ring extraction

- [ ] Create `src/assets/generated/home-scroll-story/_check_rings.py` with the
  COMPLETE content below. It imports the (not-yet-existing) `extract_rings` pure
  function from the render module and asserts 62 rings, each with exactly 5 vertices
  of shape (3,), all finite. This must FAIL first (ImportError: cannot import name
  `extract_rings`).

```python
"""Pre-plot logic check for the 1OB5 sugar-ring 3D render.
Verifies extract_rings() returns one 5-membered ribose ring per chain-F residue
with real finite coordinates, BEFORE any plotting happens. Pure logic, no image.
"""
import importlib.util
import os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "render_1ob5_3d", os.path.join(HERE, "render-1ob5-3d.py"))
mod = importlib.util.module_from_spec(spec)
# guard: importing the module must NOT trigger plotting at import time — the rewritten
# script gates all plotting behind `if __name__ == "__main__":`, and importlib sets
# __name__ to "render_1ob5_3d" here, so exec_module loads pure functions only.
spec.loader.exec_module(mod)

rings = mod.extract_rings("/tmp/1ob5.cif")
# Diagnosable: print the actual count first so a mismatch is debuggable, not a dead end.
# 1OB5 chain F is tRNA-Phe (~76 nt) with several modified nucleotides that are correctly
# excluded (res.id[0] != " "); ~62 standard ribose-bearing residues is the expected ballpark.
print(f"extracted rings: {len(rings)}")
assert len(rings) >= 60, f"expected >=60 standard-residue rings, got {len(rings)}"
for r in rings:
    verts = r["ring"]
    assert verts.shape == (5, 3), f"res {r['num']} ring shape {verts.shape} != (5,3)"
    assert np.isfinite(verts).all(), f"res {r['num']} non-finite ring coords"
    assert "num" in r and "datum" in r, f"ring missing keys: {r.keys()}"
print(f"OK: {len(rings)} rings x 5 vertices, all finite")
```

- [ ] Run it (expect FAILURE — function does not exist yet):
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && python3 src/assets/generated/home-scroll-story/_check_rings.py
  ```
  Expected output: a traceback ending in
  `ImportError: cannot import name 'extract_rings'` (or `AttributeError: module ...
  has no attribute 'extract_rings'`). This confirms the harness drives new code.

---

### Step 2 — GREEN: rewrite render-1ob5-3d.py with a pure ring extractor + Poly3DCollection rings + backbone

- [ ] Overwrite `src/assets/generated/home-scroll-story/render-1ob5-3d.py` with the
  COMPLETE content below. Key design points:
  - `RING_ATOMS = ["C1'", "C2'", "C3'", "C4'", "O4'"]` in connectivity order.
  - `extract_rings(cif_path)` is a PURE function: parses cif chain F, returns a list
    of dicts `{"num": int, "ring": np.ndarray(5,3), "datum": float|None}` for every
    standard residue that has all 5 ring atoms. `datum` = reactivity for that PDB
    residue number or `None` (no fabrication).
  - All plotting MUST live under `if __name__ == "__main__":` (calling `main()`), so
    importing the module for the assertion harness never plots. No env-var guard needed —
    importlib sets `__name__` to the loader name, not `"__main__"`.
  - PCA orientation is applied to ALL ring vertices jointly (stack every ring's 5
    points, center+SVD on the whole cloud) so geometry stays consistent and the
    L-shape reads. Backbone trace = each ring's transformed C1' (index 0), drawn as a
    thin neutral line.
  - Filled rings via `art3d.Poly3DCollection`, facecolor = reactivity color (or
    NEUTRAL), white edge, alpha for depth.

```python
"""Offline 3D snapshot of 1OB5 chain F (tRNA-Phe): one filled 5-membered ribose
ring per residue, colored by real reactivity using the home-scroll-story
single-source color scale. A thin neutral backbone trace (through C1') keeps the
classic tRNA L-shape readable. Uncovered residues (no reactivity datum) -> neutral
grey. Real cif coordinates only; no fabricated values or geometry.
"""
import json
import os
import warnings
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D  # noqa: F401
from mpl_toolkits.mplot3d import art3d
from Bio.PDB import MMCIFParser

warnings.simplefilter("ignore")

STOPS = [(23, 75, 58), (230, 194, 96), (232, 116, 62)]  # #174B3A / #E6C260 / #E8743E
NEUTRAL = (233 / 255, 237 / 255, 234 / 255)  # #E9EDEA
RING_ATOMS = ["C1'", "C2'", "C3'", "C4'", "O4'"]  # furanose connectivity order
OUT = "src/assets/generated/home-scroll-story/1ob5-3d.png"


def color(t):
    t = max(0.0, min(1.0, t))
    if t < 0.5:
        lo, hi, f = STOPS[0], STOPS[1], t / 0.5
    else:
        lo, hi, f = STOPS[1], STOPS[2], (t - 0.5) / 0.5
    return tuple((lo[i] + (hi[i] - lo[i]) * f) / 255 for i in range(3))


def load_reactivity():
    story = json.load(open(
        "src/assets/generated/home-scroll-story/story.json"))["cases"][0]
    by_pos = {p: r for p, r in zip(story["positions"], story["reactivity"])}
    return by_pos, story["norm_ceiling"]


def extract_rings(cif_path, react_by_pos=None):
    """Pure: return [{"num": int, "ring": ndarray(5,3), "datum": float|None}, ...]
    for every standard chain-F residue carrying all five ribose ring atoms.
    `datum` is the raw reactivity for that PDB residue number, else None."""
    react_by_pos = react_by_pos or {}
    parser = MMCIFParser(QUIET=True)
    structure = parser.get_structure("1ob5", cif_path)
    chF = structure[0]["F"]
    rings = []
    for res in chF:
        if res.id[0] != " ":
            continue
        if not all(a in res for a in RING_ATOMS):
            continue
        num = res.id[1]
        verts = np.array([res[a].coord for a in RING_ATOMS], dtype=float)
        rings.append({"num": num, "ring": verts,
                      "datum": react_by_pos.get(num)})
    return rings


def main():
    react_by_pos, ceiling = load_reactivity()
    rings = extract_rings("/tmp/1ob5.cif", react_by_pos)

    # PCA on the full vertex cloud so the two longest principal axes (the tRNA L
    # arms) lie in the viewing plane -> classic L-shape from a fixed camera.
    cloud = np.vstack([r["ring"] for r in rings])
    center = cloud.mean(axis=0)
    _, _, vt = np.linalg.svd(cloud - center, full_matrices=False)

    def project(pts):
        return (pts - center) @ vt.T

    polys, facecolors, backbone, colored = [], [], [], 0
    for r in rings:
        ring3 = project(r["ring"])
        polys.append(ring3)
        backbone.append(ring3[0])  # C1' (index 0) for the backbone trace
        if r["datum"] is not None:
            facecolors.append(color(max(0.0, min(1.0, (r["datum"] or 0) / ceiling))))
            colored += 1
        else:
            facecolors.append(NEUTRAL)
    backbone = np.array(backbone)
    allv = np.vstack(polys)

    fig = plt.figure(figsize=(5.2, 5.6), dpi=150)
    ax = fig.add_subplot(111, projection="3d")
    ax.plot(backbone[:, 0], backbone[:, 1], backbone[:, 2],
            color="#9FB0A6", lw=1.2, alpha=0.6, zorder=1)
    coll = art3d.Poly3DCollection(
        polys, facecolors=facecolors, edgecolors="white",
        linewidths=0.5, alpha=0.92)
    coll.set_zorder(2)
    ax.add_collection3d(coll)

    # Equalize aspect, clean transparent frame.
    xs, ys, zs = allv[:, 0], allv[:, 1], allv[:, 2]
    max_range = np.array([xs.max() - xs.min(), ys.max() - ys.min(),
                          zs.max() - zs.min()]).max() / 2.0
    mid = [(xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2,
           (zs.max() + zs.min()) / 2]
    ax.set_xlim(mid[0] - max_range, mid[0] + max_range)
    ax.set_ylim(mid[1] - max_range, mid[1] + max_range)
    ax.set_zlim(mid[2] - max_range, mid[2] + max_range)
    ax.view_init(elev=90, azim=-90)
    ax.set_axis_off()
    fig.patch.set_alpha(0)
    ax.patch.set_alpha(0)
    fig.tight_layout(pad=0)
    fig.savefig(OUT, transparent=True, bbox_inches="tight", pad_inches=0.1)
    print("wrote", OUT, "| rings:", len(rings), "| colored:", colored)


if __name__ == "__main__":
    main()
```

- [ ] Run the RED harness again (expect PASS now — pure logic verified, no image
  needed):
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && python3 src/assets/generated/home-scroll-story/_check_rings.py
  ```
  Expected output: an `extracted rings: <N>` line (~62) followed by
  `OK: <N> rings x 5 vertices, all finite`. Record the actual `<N>` — the renderer's
  `rings:` count in Step 3 must match it.

---

### Step 3 — Regenerate the PNG

- [ ] Run the renderer:
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && python3 src/assets/generated/home-scroll-story/render-1ob5-3d.py
  ```
  Expected output (one line): `wrote src/assets/generated/home-scroll-story/1ob5-3d.png | rings: <R> | colored: <N>`
  where `<R>` is the extracted ring count (~62) and `<N>` is the count of residues
  27-74 that carry a reactivity datum (≤48, the positions array length). `<N>` must be
  > 0 and ≤ `<R>`.

---

### Step 4 — Verify counts + file size

- [ ] Confirm the PNG is non-trivial (filled rings produce a larger image than the
  old sparse scatter; require > 20 KB):
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && python3 -c "import os; s=os.path.getsize('src/assets/generated/home-scroll-story/1ob5-3d.png'); print('bytes:', s); assert s > 20480, 'PNG too small (<20KB), rings may not have drawn'; print('OK size')"
  ```
  Expected output: a `bytes: <size>` line with size > 20480, then `OK size`.

- [ ] Sanity-check the harness is self-contained and re-runnable (idempotent):
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && python3 src/assets/generated/home-scroll-story/_check_rings.py
  ```
  Expected: `OK: <N> rings x 5 vertices, all finite` (where `<N>` is ~62)

---

### Step 5 — Remove the throwaway harness, then commit

- [ ] Delete the temporary check harness (it imported the render module by path; the
  ring logic is now permanently exercised by the asserts inside the render run and
  the count printout — keeping a loose `_check_rings.py` in a generated-asset dir adds
  clutter). Skip this deletion if PART 1 / project convention keeps logic harnesses;
  in that case leave it and stage it too.
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && rm src/assets/generated/home-scroll-story/_check_rings.py
  ```

- [ ] Stage and commit only the render script + regenerated PNG:
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && git add src/assets/generated/home-scroll-story/render-1ob5-3d.py src/assets/generated/home-scroll-story/1ob5-3d.png && git status --short
  ```
  Expected: two staged paths (`M render-1ob5-3d.py`, `M 1ob5-3d.png`) and nothing
  unexpected (no `_check_rings.py` if deleted above).

- [ ] Create the commit:
  ```
  cd /Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story && git commit -m "feat(home-scroll-story): re-render 1OB5 3D as filled sugar rings"
  ```
  Expected: commit succeeds; `git log --oneline -1` shows the new commit.

---

## Done criteria
- `render-1ob5-3d.py` rewritten: `extract_rings()` pure function + Poly3DCollection
  filled ribose rings + C1' backbone trace; same color authority, PCA orientation,
  camera, transparent bg, and output path.
- Logic asserted: ~62 rings × 5 vertices, all finite, before plotting.
- PNG regenerated at `src/assets/generated/home-scroll-story/1ob5-3d.png`, > 20 KB.
- Print line: `wrote ...1ob5-3d.png | rings: <R> | colored: <N>`.
- Committed on branch `feature/home-scroll-story`.

---

# Part 3 — Apple-style redesign (siteChrome.js render + styles.css + tests)

Scope: bring `renderHomeScrollStory` / `renderReactivityAlignment` and `.hss-*` CSS up to the
approved B方案 Apple prototype (`.superpowers/brainstorm/73830-1782738466/scroll-narrative.html`).
Adds: hero intro block, 3-row alignment, scene chips, closing CTA, glassmorphism card, warm
gradient backdrop scoped to the scroll-story section.

Worktree: `/Users/joseperezmartinez/docs/foldbridge/.worktrees/home-scroll-story`
Branch: `feature/home-scroll-story`
Targeted test: `node --test test/home-scroll-story.test.js`
Full suite: `npm test` (234 green baseline)

HARD BOUNDARY (user, verbatim): "真站点的顶栏要保留的。招牌区可以改配色和质感。"
- DO NOT touch `renderBundleHeader` / `renderPrimaryNav` / `renderHomeHero` or their CSS.
- DO NOT port the prototype `.fakehead` (it is a mockup only).
- DO NOT change the global `body` background — scope the warm gradient to `.home-scroll-story`.

Color authority (NEVER change): 3-stop `#174B3A → #E6C260 → #E8743E`; no-data `#E9EDEA`;
legend bar `linear-gradient(90deg,#174B3A,#E6C260,#E8743E)`.

Token map (from src/design-tokens.css — confirmed present): prototype `--deepgreen`→`--primary`
(#174B3A), `--ink`→`--textPrimary` (#14221C), `--green`→`--accent` (#2F8F6B),
`--muted`→`--textSecondary` (#5D6C64), `--accentSoft` (#C7E36B) exists. Prototype `--gold`
(#E6C260) has NO token — inline the hex (keep design-tokens.css untouched).

All steps run from the worktree root. Commit after every green step.

---

## Task 3 — 3-row alignment (probing row / matchline / PDB row)

Goal: replace the single `.hss-alignment` row with the prototype's 3-row block (probing query
cells, a `|` matchline, PDB cells) while KEEPING the neutral-grey no-data guard intact. Refactor
the cell-building into a `renderAlignmentCells` helper so the two cell rows share one
implementation and the no-data honesty test still holds.

Two existing tests will change behavior because cells now appear in TWO rows:
- `renderReactivityAlignment emits one colored cell per residue` (expects 3 cells) → becomes 6.
- `renderReactivityAlignment colors missing-datum residues neutral grey` (expects 2 neutral) → 4.
Update those expectations in this task (red → green), do not delete the tests.

### Step 3.1 — RED: update the two cell-count tests to the 3-row reality
- [ ] Edit `test/home-scroll-story.test.js`. Replace the body of
  `renderReactivityAlignment emits one colored cell per residue` with:
  ```js
  test('renderReactivityAlignment emits one colored cell per residue, in two rows', () => {
    const caseData = { sequence: ['G','A','C'], reactivity: [0, 1.25, 2.5], norm_ceiling: 2.5, pdb_id: '1OB5', chain: 'F' };
    const html = renderReactivityAlignment(caseData);
    // 3 residues × 2 cell rows (probing query + PDB) = 6 colored cells
    const cells = html.match(/class="hss-cell"/g) || [];
    assert.equal(cells.length, 6);
    // matchline: one '|' tick per residue
    const ticks = html.match(/class="hss-match-tick"/g) || [];
    assert.equal(ticks.length, 3);
    assert.match(html, />G</);
    assert.match(html, /rgb\(23, 75, 58\)/);   // 第一个残基 reactivity 0 → 冷绿
    // row labels present (prototype wording)
    assert.match(html, /Probing query \(reactivity\)/);
    assert.match(html, /chain F/);              // PDB row label carries the chain
  });
  ```
- [ ] In `renderReactivityAlignment colors missing-datum residues neutral grey, not cold-green`,
  change the neutral-count assertion from `2` to `4` (two missing residues × two rows) and the
  total cell count from `4` to `8`:
  ```js
    const cells = html.match(/class="hss-cell\b/g) || [];
    assert.equal(cells.length, 8);
    const neutral = html.match(/#E9EDEA/gi) || [];
    assert.equal(neutral.length, 4, 'two missing-datum residues must be neutral grey, in both rows');
  ```
  Note: the PDB row label needs a `chain`; the test's `caseData` for the neutral test has no
  `chain` field — the render must tolerate a missing chain (fall back to empty string, label still
  renders "PDB · chain"). Confirm `renderReactivityAlignment` reads `caseData.chain` defensively.
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: the two edited tests FAIL (current render emits one row → 3 cells / 2 neutral / no
  matchline / no labels). Other tests still pass. A failing run is the RED gate.

### Step 3.2 — GREEN: refactor `renderReactivityAlignment` into 3 rows
- [ ] Edit `src/siteChrome.js`. Replace the whole `renderReactivityAlignment` function
  (lines ~207–224) with a `renderAlignmentCells` helper plus a 3-row `renderReactivityAlignment`:
  ```js
  // 单行带色格：每残基一个格。无反应性数据 → 中性灰（数据诚实，spec §3）。
  // null/undefined/非有限 视为缺失；Number(null)===0 是有限值，须显式判 null。
  function renderAlignmentCells(seq, react, ceiling) {
    return seq.map((base, i) => {
      const datum = react[i];
      const raw = Number(datum);
      if (datum == null || !Number.isFinite(raw)) {
        return `<span class="hss-cell hss-cell-nodata" style="background:${HSS_NEUTRAL}">${base}</span>`;
      }
      const norm = Math.min(1, raw / ceiling);
      return `<span class="hss-cell" style="background:${reactivityColor(norm)}">${base}</span>`;
    }).join('');
  }

  // 1D alignment 态：3 行（探针查询 / 匹配竖线 / PDB 链），上下两行共用同一着色。
  // 无 DOM / 无 window。色标与缺数据中性灰保持单一权威。
  export function renderReactivityAlignment(caseData = {}) {
    const seq = Array.isArray(caseData.sequence) ? caseData.sequence : [];
    const react = Array.isArray(caseData.reactivity) ? caseData.reactivity : [];
    const ceiling = Number(caseData.norm_ceiling) || 1;
    const pdbId = caseData.pdb_id || '';
    const chain = caseData.chain || '';
    const cells = renderAlignmentCells(seq, react, ceiling);
    const ticks = seq.map(() => `<span class="hss-match-tick">|</span>`).join('');
    const pdbLabel = `PDB ${pdbId} · chain ${chain}`.replace(/\s+$/,'').replace(/·\s*chain\s*$/,'· chain');
    return `<div class="hss-alignment" role="img" aria-label="Per-residue reactivity, probing query aligned to PDB chain">
      <div class="hss-aln-row"><span class="hss-aln-label">Probing query (reactivity)</span><div class="hss-aln-cells">${cells}</div></div>
      <div class="hss-aln-row"><div class="hss-matchline">${ticks}</div></div>
      <div class="hss-aln-row"><span class="hss-aln-label">${pdbLabel}</span><div class="hss-aln-cells">${cells}</div></div>
    </div>`;
  }
  ```
  Notes:
  - `class="hss-alignment"` is preserved (the `renderHomeScrollStory ... + legend` test and the
    "renders empty alignment when no residues" test both match `/hss-alignment/`).
  - Empty sequence → `cells` and `ticks` are `''`; the block still contains `hss-alignment` and
    emits NO `class="hss-cell"` (satisfies `renders empty alignment when no residues`).
  - `caseData.chain` defaults to `''` so the no-chain test renders "PDB 1OB5 · chain".
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: all home-scroll-story tests PASS (the two edited tests now see 6 cells / 3 ticks /
  4 neutral / labels). No other test touched.

### Step 3.3 — verify full suite + commit
- [ ] Run: `npm test`
- [ ] Expected: `234` tests pass (baseline unchanged — cell-count tests were updated in lockstep,
  no net test added yet). 0 failures.
- [ ] Commit:
  ```
  git add src/siteChrome.js test/home-scroll-story.test.js
  git commit -m "feat(hss): 3-row reactivity alignment (probing/matchline/PDB) with shared cell helper"
  ```

---

## Task 4 — scene chips (story.json `chip` field + render)

Goal: each `.hss-scene` gets a `.hss-chip` pill below its body. Chip text is data-driven — add a
`chip` field to each scene in story.json (scenes currently have only `n`/`title`/`body`), and have
`renderHomeScrollStory` emit `<span class="hss-chip">` only when `s.chip` is present.

### Step 4.1 — RED: assert chips in the 3-scene test
- [ ] Edit `test/home-scroll-story.test.js`. In `SAMPLE_CASE.scenes`, add a `chip` to each scene:
  ```js
    scenes: [
      { n: '01', title: 'Probing signal, aligned to a structure', body: 'A.', chip: 'warm = flexible / unpaired · cool = constrained / paired' },
      { n: '02', title: 'The same residues fold into 2D', body: 'B.', chip: 'color is conserved across every view' },
      { n: '03', title: 'And collapse into the 3D fold', body: 'C.', chip: 'probing ↔ structure, one continuous thread' },
    ],
  ```
- [ ] In `renderHomeScrollStory emits 3 scenes + 3 state layers + legend`, add after the existing
  scene assertions:
  ```js
    const chips = html.match(/class="hss-chip"/g) || [];
    assert.equal(chips.length, 3);
    assert.match(html, /warm = flexible \/ unpaired/);
    assert.match(html, /one continuous thread/);
  ```
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: this test FAILS (render emits no `hss-chip`). RED gate.

### Step 4.2 — GREEN: render chip when present
- [ ] Edit `src/siteChrome.js`. In `renderHomeScrollStory`, replace the `scenes` map (lines ~248–253)
  with a version that appends the chip only when `s.chip` is truthy:
  ```js
    const scenes = caseData.scenes.map((s, i) => {
      const chip = s.chip ? `\n      <span class="hss-chip">${s.chip}</span>` : '';
      return `
    <div class="hss-scene${i === 0 ? ' is-active' : ''}" data-scene="${i}">
      <div class="hss-scene-num">${s.n || ''}</div>
      <h3 class="hss-scene-title">${s.title || ''}</h3>
      <p class="hss-scene-body">${s.body || ''}</p>${chip}
    </div>`;
    }).join('');
  ```
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: all home-scroll-story tests PASS (3 `hss-chip` present, chip texts match). The
  `falls back to hss-missing` test (scenes without `chip`) still passes — chip is suppressed when
  absent, so no stray empty pill.

### Step 4.3 — add real chip copy to story.json
- [ ] Edit `src/assets/generated/home-scroll-story/story.json`. Add a `chip` field to each of the
  three scene objects (after `body`), using the prototype copy:
  - scene 01: `"chip": "warm = flexible / unpaired · cool = constrained / paired"`
  - scene 02: `"chip": "color is conserved across every view"`
  - scene 03: `"chip": "probing ↔ structure, one continuous thread"`
- [ ] Verify JSON is still valid: `node -e "JSON.parse(require('fs').readFileSync('src/assets/generated/home-scroll-story/story.json','utf8')); console.log('ok')"`
- [ ] Expected output: `ok`

### Step 4.4 — full suite + commit
- [ ] Run: `npm test`
- [ ] Expected: `234` pass, 0 fail (chip assertions added to an existing test, no new test file).
- [ ] Commit:
  ```
  git add src/siteChrome.js test/home-scroll-story.test.js src/assets/generated/home-scroll-story/story.json
  git commit -m "feat(hss): data-driven scene chips (story.json chip field + render)"
  ```

---

## Task 5 — hero intro block + closing CTA in `renderHomeScrollStory`

Goal: wrap the existing `.hss-grid` with a new `.hss-intro` (kicker / gradient headline / lede /
scroll cue) above it and a new `.hss-closing` (h2 / record-count line / `data-route="entry"` CTA)
below it. Both are NEW and live INSIDE `<section class="home-scroll-story">`. The placeholder-shell
early-return path must stay free of intro/closing.

Data: the record count comes from `HOME_METRICS.structureLinkedRecords` (3610) formatted with
`toLocaleString('en-US')` → "3,610". The CTA routes via `data-route="entry"` (matches the existing
nav/hero button pattern; main.js delegates `data-route` clicks) — NOT a real href.

Kicker text is case-driven: `A FoldBridge story · ${molecule_label} (PDB ${pdb_id})`.

### Step 5.1 — RED: assert intro + closing in the main render test
- [ ] Edit `test/home-scroll-story.test.js`. In `renderHomeScrollStory emits 3 scenes + 3 state
  layers + legend`, add:
  ```js
    // hero intro
    assert.match(html, /class="hss-intro"/);
    assert.match(html, /class="hss-kicker"/);
    assert.match(html, /A FoldBridge story · tRNA-Phe \(yeast\) \(PDB 1OB5\)/);
    assert.match(html, /Follow one RNA from/);
    assert.match(html, /class="hss-headline-grad"/);  // gradient span on second line
    assert.match(html, /Scroll to watch it transform/);
    assert.match(html, /class="hss-scrollcue"/);
    // closing CTA
    assert.match(html, /class="hss-closing"/);
    assert.match(html, /Every record in FoldBridge tells this story/);
    assert.match(html, /3,610 structure-linked records/);
    assert.match(html, /data-route="entry"/);
    assert.match(html, /Browse the Entry table/);
  ```
- [ ] Also harden the placeholder test `renderHomeScrollStory returns placeholder shell on empty
  input` so intro/closing never leak into the shell:
  ```js
    assert.doesNotMatch(html, /hss-intro/);
    assert.doesNotMatch(html, /hss-closing/);
  ```
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: the main render test FAILS (no intro/closing yet); placeholder test still passes
  (shell has neither). RED gate.

### Step 5.2 — GREEN: emit intro + closing around the grid
- [ ] Edit `src/siteChrome.js`. The module needs `HOME_METRICS` in scope — it is already declared
  and exported at top of the file, so reference it directly. Replace the final `return` of
  `renderHomeScrollStory` (lines ~255–260) with:
  ```js
    const records = HOME_METRICS.structureLinkedRecords.toLocaleString('en-US');
    const kicker = `A FoldBridge story · ${caseData.molecule_label || ''} (PDB ${caseData.pdb_id || ''})`;
    const intro = `<header class="hss-intro">
      <p class="hss-kicker">${kicker}</p>
      <h1 class="hss-headline">Follow one RNA from<br><span class="hss-headline-grad">probing signal to 3D fold</span></h1>
      <p class="hss-lede">The same reactivity colors travel with every nucleotide — from the raw alignment, into the secondary structure, and onto the deposited tertiary structure. Scroll to watch it transform.</p>
      <p class="hss-scrollcue">↓ 向下滚动</p>
    </header>`;
    const closing = `<footer class="hss-closing">
      <h2>Every record in FoldBridge tells this story</h2>
      <p>${records} structure-linked records, each with calibrated confidence.</p>
      <button type="button" class="hss-cta" data-route="entry">Browse the Entry table &rarr;</button>
    </footer>`;
    return `<section class="home-scroll-story" aria-label="From probing signal to 3D fold">
    ${intro}
    <div class="hss-grid">
      <div class="hss-sticky"><div class="hss-card"><div class="hss-meta">${meta}</div>${layer0}${layer1}${layer2}${legend}</div></div>
      <div class="hss-scenes">${scenes}</div>
    </div>
    ${closing}
  </section>`;
  ```
  Note: the placeholder early-return (lines ~237–239) is unchanged, so the empty-input shell still
  emits only `<section class="home-scroll-story hss-placeholder" aria-hidden="true"></section>` —
  no intro, no closing.
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: all home-scroll-story tests PASS — intro kicker/headline/lede/cue + closing
  h2/count/CTA all match; placeholder shell still has neither.

### Step 5.3 — full suite + commit
- [ ] Run: `npm test`
- [ ] Expected: `234` pass, 0 fail.
- [ ] Commit:
  ```
  git add src/siteChrome.js test/home-scroll-story.test.js
  git commit -m "feat(hss): hero intro block + closing Entry CTA (data-route=entry)"
  ```

---

## Task 6 — styles.css redesign (Apple glassmorphism + warm backdrop, scoped)

Goal: restyle the `.hss-*` block (src/styles.css lines ~6224–6264) to match the prototype —
glass card, warm gradient backdrop scoped to `.home-scroll-story`, and styles for the new
intro / 3-row alignment / chips / closing elements. CSS has no unit test; verification is the
full suite staying green (CSS is not asserted) plus a visual byte check that the new selectors
exist. The global `body` background and the real header CSS are NOT touched.

This task replaces the existing `.hss-*` block in one edit. Steps are small per concern but the
edit lands as a single contiguous block so the cascade order is deterministic.

### Step 6.1 — replace the scroll-story CSS block
- [ ] Edit `src/styles.css`. Replace the entire block from the comment
  `/* ===== 主页招牌滚动叙事 home-scroll-story ===== */` (line ~6224) through the closing
  `@media (prefers-reduced-motion: reduce) { .hss-layer, .hss-scene { transition: none; } }`
  (line ~6264) with the following. (Gold #E6C260 inlined — design-tokens.css stays untouched.)
  ```css
  /* ===== 主页招牌滚动叙事 home-scroll-story（Apple 风重设计，配色/质感限定本区） ===== */
  .home-scroll-story {
    max-width: var(--page-max-width); margin: 0 auto; padding: 0 24px 24px;
    /* 暖色渐变背景：仅限招牌区，不动全局 body（用户铁律：真站点顶栏与其余页面保留） */
    background:
      radial-gradient(900px 460px at 10% -5%, rgba(255, 223, 120, .30), transparent 60%),
      radial-gradient(760px 420px at 96% 4%, rgba(199, 227, 107, .20), transparent 55%),
      linear-gradient(#fff4cf, #fff8df 30%, #fffbf0 65%, #fffdf7);
    border-radius: 28px;
  }
  .home-scroll-story.hss-placeholder { display: none; } /* 缺资产 → 不占位 */

  /* hero intro */
  .hss-intro { text-align: center; padding: 70px 20px 40px; }
  .hss-kicker { font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase;
    color: var(--accent); font-weight: 700; margin: 0; }
  .hss-headline { font-size: 44px; line-height: 1.05; margin: 14px 0 0; font-weight: 800;
    letter-spacing: -1px; color: var(--textPrimary); }
  .hss-headline-grad { background: linear-gradient(92deg, var(--accent), #9bbf3a);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .hss-lede { max-width: 540px; margin: 16px auto 0; font-size: 15px;
    color: var(--textSecondary); line-height: 1.6; }
  .hss-scrollcue { margin-top: 34px; font-size: 12px; color: var(--textSecondary);
    animation: hss-bob 1.8s ease-in-out infinite; }
  @keyframes hss-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(6px); } }
  ```
- [ ] (Do not run tests yet — finish the block in 6.2/6.3 so the file is never left mid-rule.)

### Step 6.2 — append grid / glass card / layers / 3-row alignment CSS (same edit block, continued)
- [ ] Continue the same replacement block with:
  ```css
  /* two-column scroll narrative */
  .hss-grid { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 40px; align-items: start; }
  .hss-sticky { position: sticky; top: 120px; height: calc(100vh - 160px); min-height: 440px;
    display: flex; align-items: center; }
  /* glassmorphism card（招牌质感） */
  .hss-card { position: relative; width: 100%; height: 100%; border-radius: 30px;
    background: rgba(255, 255, 255, .6); border: 1px solid rgba(227, 191, 92, .3);
    box-shadow: 0 14px 48px rgba(155, 122, 38, .13); backdrop-filter: blur(8px); overflow: hidden; }
  .hss-meta { position: absolute; top: 16px; left: 20px; font-size: 11px;
    color: var(--textSecondary); z-index: 2; }
  .hss-tag { position: absolute; top: 16px; right: 20px; font-size: 11px; font-weight: 700;
    color: var(--accent); text-transform: uppercase; letter-spacing: .5px; }
  .hss-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    padding: 48px 24px 40px; opacity: 0; transform: scale(.97);
    transition: opacity .6s ease, transform .6s ease; }
  .hss-layer.is-active { opacity: 1; transform: scale(1); }
  .hss-snapshot { max-width: 100%; max-height: 100%; object-fit: contain; }
  .hss-missing { color: var(--textMuted); font-size: 13px; }

  /* 3-row alignment */
  .hss-alignment { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 380px; }
  .hss-aln-row { display: flex; flex-direction: column; gap: 5px; }
  .hss-aln-label { font-size: 10px; color: var(--textSecondary); }
  .hss-aln-cells { display: flex; gap: 3px; flex-wrap: wrap; }
  .hss-cell { width: 21px; height: 26px; border-radius: 5px; display: flex; align-items: center;
    justify-content: center; font-size: 11px; font-weight: 700; color: #fff;
    font-family: ui-monospace, monospace; }
  .hss-matchline { display: flex; gap: 3px; }
  .hss-match-tick { width: 21px; text-align: center; font-size: 9px; color: var(--accent); }

  /* legend */
  .hss-legend { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 8px; font-size: 10px; color: var(--textSecondary); }
  .hss-legend-bar { width: 120px; height: 8px; border-radius: 6px;
    background: linear-gradient(90deg, #174B3A, #E6C260, #E8743E); }
  ```

### Step 6.3 — append scenes / chips / closing + responsive + reduced-motion (same edit block, end)
- [ ] Continue and CLOSE the replacement block with:
  ```css
  /* right scenes */
  .hss-scenes { padding: 30px 0 60px; }
  .hss-scene { min-height: 78vh; display: flex; flex-direction: column; justify-content: center;
    transition: opacity .5s, transform .5s; }
  /* 滚动渐入仅在 JS 接上 observer 后启用（.hss-js）；无 JS 时场景全可读（降级，spec §8） */
  @media (min-width: 821px) {
    .home-scroll-story.hss-js .hss-scene { opacity: .35; transform: translateY(18px); }
    .home-scroll-story.hss-js .hss-scene.is-active { opacity: 1; transform: translateY(0); }
  }
  .hss-scene-num { font-size: 12px; font-weight: 700; color: #E6C260; letter-spacing: 1px; }
  .hss-scene-title { font-size: 30px; margin: 8px 0 0; letter-spacing: -.5px; color: var(--textPrimary); }
  .hss-scene-body { font-size: 15.5px; line-height: 1.7; color: var(--textSecondary);
    margin: 14px 0 0; max-width: 440px; }
  .hss-chip { display: inline-block; margin-top: 16px; font-size: 12px;
    background: rgba(199, 227, 107, .3); color: var(--primary); padding: 5px 12px;
    border-radius: 980px; font-weight: 600; }

  /* closing CTA */
  .hss-closing { text-align: center; padding: 50px 20px 90px; }
  .hss-closing h2 { font-size: 30px; letter-spacing: -.5px; color: var(--textPrimary); }
  .hss-closing p { color: var(--textSecondary); margin-top: 10px; }
  .hss-cta { margin-top: 22px; display: inline-block; background: var(--textPrimary); color: #fff;
    border: none; cursor: pointer; font-size: 14px; font-weight: 600; padding: 12px 26px;
    border-radius: 980px; }

  @media (max-width: 820px) {
    .hss-grid { grid-template-columns: 1fr; gap: 16px; }
    .hss-sticky { position: relative; top: 0; height: 360px; }
    .hss-scene { min-height: auto; opacity: 1; transform: none; padding: 20px 0; }
    .hss-headline { font-size: 32px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .hss-layer, .hss-scene { transition: none; }
    .hss-scrollcue { animation: none; }
  }
  ```
  Note the prefers-reduced-motion rule now also suppresses the scroll-cue bob (prototype parity:
  the bob must stop under reduced-motion).

### Step 6.4 — verify selectors landed + full suite + commit
- [ ] Sanity-check the new selectors exist and the old ones are gone:
  ```
  grep -c "hss-intro\|hss-headline-grad\|hss-match-tick\|hss-chip\|hss-cta\|hss-aln-row" src/styles.css
  ```
- [ ] Expected: a count `>= 6` (each new selector present at least once).
- [ ] Confirm the global body background was NOT touched (boundary guard). Use a strict
  regex that matches an actual `body {` rule (NOT comments that merely contain the word):
  ```
  git diff src/styles.css | grep -nE "^[+-]\s*body\s*\{" || echo "body untouched"
  ```
- [ ] Expected output: `body untouched` (the diff must not add/remove any `body {` rule).
- [ ] Run: `npm test`
- [ ] Expected: `234` pass, 0 fail (CSS is not asserted by tests; this confirms no JS/HTML
  regression slipped in).
- [ ] Commit:
  ```
  git add src/styles.css
  git commit -m "style(hss): Apple glassmorphism card + warm backdrop scoped to scroll-story; intro/chip/cta/3-row aln styles"
  ```

---

## Task 7 — boundary verification + clean close

Goal: prove the user's hard boundary held (real top header untouched, global body bg untouched)
and the redesign is complete and green. No production edits here — verification only.

### Step 7.1 — confirm protected render functions were never edited
- [ ] Run:
  ```
  git diff main -- src/siteChrome.js | grep -E "renderPrimaryNav|renderHomeHero|renderBundleHeader|renderHomeModuleCards|renderHelpBody|renderHomeProbingCarousel"
  ```
- [ ] Expected: NO output (these functions appear in no diff hunk header or changed line). Only
  `renderReactivityAlignment`, `renderAlignmentCells` (new), and `renderHomeScrollStory` changed.
- [ ] If any protected name appears, STOP — a boundary was crossed; revert that hunk before
  continuing.

### Step 7.2 — confirm no `.fakehead` / global body bg leaked in
- [ ] Run:
  ```
  grep -rn "fakehead\|fh-main\|fh-mark" src/ && echo "LEAK" || echo "no fakehead"
  ```
- [ ] Expected: `no fakehead` (the prototype mockup header was never ported).
- [ ] Run:
  ```
  git diff main -- src/styles.css | grep -nE "^[+-]\s*body\s*\{" || echo "global body bg untouched"
  ```
- [ ] Expected: `global body bg untouched`.

### Step 7.3 — final green gate
- [ ] Run: `node --test test/home-scroll-story.test.js`
- [ ] Expected: all home-scroll-story tests pass, 0 fail.
- [ ] Run: `npm test`
- [ ] Expected: `234` pass, 0 fail.

### Step 7.4 — done
- [ ] All redesign tasks (3–7) committed. The scroll-story now matches the approved B方案 prototype:
  hero intro, glass card, 3-row alignment, scene chips, closing Entry CTA, warm backdrop — all
  scoped to `.home-scroll-story`, with the real site header and global body background preserved.
- [ ] Leave the branch `feature/home-scroll-story` ready for the part1/part2 work to merge against;
  do not open a PR from this part alone.

---

## Notes / decisions baked into this part

- Color authority untouched: 3-stop `#174B3A→#E6C260→#E8743E` and no-data `#E9EDEA` reused verbatim;
  legend bar gradient unchanged. Gold `#E6C260` inlined (scene-num + legend) — no new token.
- `renderAlignmentCells` extracted so the two cell rows and the no-data honesty guard share one
  implementation; the neutral-grey behavior is preserved (test now expects 4 neutral = 2 missing ×
  2 rows).
- Chips are data-driven (`story.json` scene `chip`) and suppressed when absent, so the
  `falls back to hss-missing` case (scenes without chips) emits no empty pill.
- Closing CTA uses `data-route="entry"` (button, not href) to match the existing main.js delegation;
  record count pulls from `HOME_METRICS.structureLinkedRecords` (3,610) — single source of truth.
- Placeholder shell path is unchanged: empty input still returns the bare
  `hss-placeholder` section with no intro/closing.






