# 全站绿调三色统一设计

> 设计日期：2026-06-30
> 范围：FoldBridge 主站 CSS（`src/styles.css` + `src/design-tokens.css`），深浅两种模式。
> 内嵌 iframe 生成器模板（`public/rasp-v3` / `rmdb-v3` / `annojoin-smoke`）不在本次范围。

## 1. 背景与问题

`src/styles.css`（6325 行）当前散落着 **70 个 distinct 硬编码字色（`color: #xxx`）**，横跨绿色系、金黄系、蓝灰系、中性黑灰白四类色相。深色模式不是通过重定义 token 实现，而是靠 **45 处 `body[data-mode="dark"]` 逐选择器硬编码覆盖**。

结果：颜色失控、难以维护、视觉不统一。

用户目标：把字体颜色压缩到**最多三种**，对应三个语义角色（正文 / 次要 / 状态）。配色走**绿调**，金黄退场，营造夏日清凉清新感，同时保留现有品牌识别度。

## 2. 目标三色（方案 A：墨绿 + 灰绿 + 翠绿强调）

| 语义角色 | Token | 浅色 | 深色 |
|---------|-------|------|------|
| 正文 | `--textPrimary` | `#13241B` 墨绿近黑 | `#EAF3ED` 薄荷白 |
| 次要 | `--textSecondary` | `#5C6F65` 灰绿 | `#8FA89A` 中灰绿 |
| 状态/链接强调 | `--textAccent` | `#1F8A5B` 翠绿 | `#4FD49A` 亮翠绿 |

选择理由：方案 A 最接近现有品牌色（`--primary #174B3A`），降温清新又不丢识别度。

### 2.1 `--textMuted` 第四字色 token 的裁决

`design-tokens.css:21` 现有 `--textMuted: #7B8A82`，被 styles.css 9 处 `color: var(--textMuted)` 消费（行 494/752/1403/1751/1915/2016/2444/2552/6266）。它经 `var()` 实际产出**第四种字色**，与「最多三种」目标冲突。

**裁决：`--textMuted` 折叠进 `--textSecondary`。** textMuted 当前是「更弱化的次要文字」，语义上属于「次要」角色。做法：

- **不再单独定义 `--textMuted` 的值**——在 `design-tokens.css` 把 `--textMuted` 别名为 `--textSecondary`：`--textMuted: var(--textSecondary);`。这样 9 处 `var(--textMuted)` 引用无需逐个改动即自动收敛到次要色，深色模式也随 `--textSecondary` 重定义一起生效。
- 保留 `--textMuted` 这个名字（仅改其值为别名）是为了避免改动 9 个消费点，降低 diff 面积与回归风险。最终全站字色仍只有三个**取值**（textPrimary / textSecondary / textAccent）。

## 3. 架构策略：收敛到 token，而非逐个改 hex

核心思路是把 70 个硬编码字色**映射**到上述三个语义 token 之一，并把深色模式从「45 处逐选择器覆盖」改为「在 `body[data-mode="dark"]` 重定义 3 个 token」——一处定义，全站生效。

### 3.1 token 定义（`design-tokens.css`）

```css
:root {
  --textPrimary:   #13241B;   /* 改：墨绿近黑（原 #14221C） */
  --textSecondary: #5C6F65;   /* 改：灰绿（原 #5D6C64） */
  --textMuted:     var(--textSecondary);  /* 改：别名折叠进次要（原 #7B8A82） */
  --textAccent:    #1F8A5B;   /* 新增：字色专用翠绿强调 */
}
```

```css
/* styles.css 内，紧邻现有 body[data-mode="dark"] 规则 */
body[data-mode="dark"] {
  --textPrimary:   #EAF3ED;
  --textSecondary: #8FA89A;
  --textAccent:    #4FD49A;
}
```

### 3.2 为什么新建 `--textAccent` 而不复用 `--accent`

经核查，`--accent (#2F8F6B)` 被 **13+ 处背景 / 边框 / 渐变**消费（`background: var(--accent)`、`linear-gradient(..., var(--accent))`、`box-shadow inset ... var(--accent)`、`border-left ... var(--accent)`）。若直接改 `--accent` 会污染所有这些背景/装饰。因此：

- **`--accent` 保持不变**（继续驱动背景/边框/渐变）。
- **新建 `--textAccent`** 专供字色强调使用，浅 `#1F8A5B` / 深 `#4FD49A`。
- 同理 `--primary #174B3A` 是品牌主色（大量背景/边框引用），**保持不变**。

## 4. 70 个硬编码字色的映射规则

金色不是粗暴全删，而是按其**原本的明度语义角色**（深=正文 / 中=次要 / 亮=强调）分别并入三色。

### 4.1 → `--textPrimary`（正文，墨绿近黑）
当深色字、标题、强调正文用的颜色：
- 深色正文（绿/蓝灰深相）：`#173224 #173349 #143041 #14221c #10281f #21463d #30463a`
- 蓝灰深色：`#163041 #132331 #102333 #213647 #20384a #2b3a45 #183344`
- 金黄最深（原当深色正文）：`#4f3800 #5f4305 #57462a #5b4b31`
- 纯黑：`#000000`
- 深色模式正文反白：`#edf4ef`（行 874/4764，深色模式下标题/nav/metric strong 反白，走深色 `--textPrimary #EAF3ED`）

### 4.2 → `--textSecondary`（次要，灰绿）
弱化 / 元数据 / 次要说明用的中等明度色：
- 灰绿/蓝灰中明度：`#536678 #344a45 #466173 #5d6f7f #5c6f80 #596b7b #617485 #6a7a89 #4d6575 #4c6678 #4b6678 #516979 #3a4a55`
- 中性灰：`#b5b5bf #b8c8bf #5f7467 #5c6f63 #61746b`
- 金黄中明度（原当次要文字）：`#8e6a16 #9a6f11 #8a6513 #8a5a07 #7f5c0e #7c5b13 #c18a18`
- tooltip 浅灰字：`#d7dbe0`（行 3187，深色 tooltip 背景上的次要文字）

### 4.3 → `--textAccent`（状态/链接，翠绿）
品牌强调 / 链接 / 状态高亮 / 激活色：
- 品牌绿字：`#207f4c #2f8f6b #1d5f3c #195f3b`
- 亮金黄强调（原做高亮）：`#b07a12 #d4a21f #c99612 #e6c260 #f0c44a`
- 青绿点缀：`#156d7d #104f5d`

### 4.4 上下文判断（浅绿/rgba）
浅绿 `#7dd4aa #a3e4c2` 及深色模式专属 `rgba(125,212,170,...)` 系列：在深色背景上当强调字时走 `--textAccent`，逐处按上下文判断。

## 5. 明确保留（不在压缩范围）

| 保留项 | 原因 |
|--------|------|
| `.nucleotide-a/u/g/c`（`#e76f51` `#3b82f6` `#2a9d55` `#f4a261`） | ACGU 四碱基功能色，科学语义 |
| `.dashboard-filter-*` 等按钮**背景色**（export 绿 / reset 红 `#2cab49 #e83e4f` 等） | 是 `background`/`border` 不是字色 |
| 白色反白文字 `#fff` `#ffffff` | 深底/彩底上的文字，第四类「反白」，不算进三种有彩字色 |
| `--primary #174B3A`、`--accent #2F8F6B` | 品牌主色，驱动背景/边框/渐变 |

## 6. 执行机制（保证安全、可回滚）

1. **只替换 `color:` 上下文的 hex**，`background`/`border`/`box-shadow` 上的同色 hex 不动。对每个颜色先 grep 确认用途：纯字色用途的 `replace_all`，混用的逐行 `Edit`。
2. **清理冗余深色覆盖**：token 在深色 `body` 重定义后，那 45 处中「仅为改字色」的 `body[data-mode="dark"] ... color: #xxx` 规则变冗余，删除使其继承重定义后的 token；保留改背景/边框/阴影的深色规则。
3. **已是 token 引用的**（如 `var(--accent, var(--textPrimary))`）不动。

## 7. 验证

- `npm test`（基线 250 pass / 4 pre-existing fail，与本任务无关，需确认数量不增）
- `npm run build:static` 重建 dist
- 构建后 grep 确认 `--textMuted` 不再持有独立 hex 值、仅为 `var(--textSecondary)` 别名（验证「最多三种取值」目标达成）
- 浏览器肉眼核对浅色 + 深色两模式：正文/次要/状态三层级清晰；金色确实退场；ACGU 碱基色与反白文字完好；链接/状态强调可辨识。

## 8. 本次范围外

- 内嵌 iframe 生成器模板 CSS（`public/rasp-v3` / `rmdb-v3` / `annojoin-smoke`，~2600 行）。
- 背景色 / 边框色 / 阴影的压缩（仅压缩字色）。
- `--primary` / `--accent` 的调整。
