# Case detail-page shell enrichment — design

Date: 2026-06-30
Branch: release-public (worktree `~/docs/foldbridge-release`)
Status: approved design, pending spec-review + implementation

## Problem

The case detail page shell is sparse and scaffold-like. Every case page
(`public/{rasp-v3,rmdb-v3}/cases/*/index.html`) shows only:

- a `<section class="hero">` with the PDB id, a `RASP2PDB:<id>` / `RMDB2PDB:<id>`
  subtitle, and a few `.chip` metadata tags;
- a `<section class="layout">` whose entire body is a `Chain` status panel plus a
  full-height `<iframe id="chainFrame">` embedding the chain workbench.

All the rich confidence data — per-evidence AUC / Spearman, empirical p-values, tiers,
measurement families, technologies, evaluable counts — is **already inlined** in each
page's `family-case-bootstrap` JSON (`evidenceRows`), but **none of it is surfaced on the
shell**. A visitor sees a near-empty page wrapped around an iframe; the evidence that
makes the case meaningful is invisible until the iframe finishes loading its internal
viewer.

Goal: enrich the shell so it presents the confidence story directly — without touching
the iframe, and without re-running the (other-repo) page generator.

## Scope

In scope:
- Top-level **case pages** in both universes: `public/rasp-v3/cases/*/index.html` (1671)
  and `public/rmdb-v3/cases/*/index.html` (715) = 2386 pages, reached entirely through the
  two shared `case-shell.js` + `case-shell.css` files (one pair per universe).
- Render, from the already-inlined `evidenceRows`: a richer hero (tier badge + metadata
  chips), a confidence scoreboard (family badges + tier-count pills + best-evidence
  summary), and an expandable full evidence table.

Out of scope:
- The **iframe-embedded chain workbench** (`cases/*/chains/*/index.html`, `workbench.js`).
  The user handles the iframe / its eventual removal separately ("on the other side").
  This change must not depend on the iframe's internal behavior.
- The detail nav header (separate, already-landed change).
- The case-list pages (`public/{rasp-v3,rmdb-v3}/index.html`).
- Any change to the page generator in the rmdb2pdb repo (see Durability caveat).

## Verified baseline facts

- **Both universes' `case-shell.js` are byte-identical** (82 lines each; `diff` empty).
  Plain top-level classic script (not a module), runs at parse time, shared by every case
  page in the bundle. The top IIFE injects `site-nav.js`; the rest parses
  `family-case-bootstrap` and drives the iframe. The current evidence/chain logic is:
  `state = {activeChainId, selectedEvidenceId}`; `evidenceById`, `defaultEvidenceForChain`;
  `updateFrame()` computes the active evidence from `state` and sets BOTH `frame.src` AND
  `chainStatus.textContent`; chain-button clicks reset `state` and call `syncUi()`
  (which toggles `.is-active` on chain buttons then calls `updateFrame()`); a
  reconciliation block (current lines 71–81) fixes up `state.selectedEvidenceId` so it
  belongs to `state.activeChainId` before the final `syncUi()`.
- **The bootstrap JSON inlines everything needed.** Keys: `caseId`, `caseKey`,
  `defaultChainId`, `defaultEvidenceId`, `chainPageById` (chainId→relative chain-page
  href), `evidenceChainMap` (evidenceId→chainId), and `evidenceRows` (array). Each
  evidence row carries: `evidenceId`, `family` (A/B/D…), `technology`, `chain`,
  `lssTierCalibrated`, `lssTierUncalibrated`, `aucDirectional`, `aucEmpiricalPValue`,
  `aucEffectSizeZ`, `nEvaluable`, `conflictFraction`, `partnerInsideFraction`,
  `directionalMetricKind` (`auc_unpaired_vs_paired` | `spearman_rho`),
  `directionalMetricLabel`, `signalDirection`, `sasaReferenceStatus`, `profileKey`,
  `trackProfileId`, `selectedByDefault`, `bridgeStatus`, `recallPath`, `pairId`,
  `pairSegmentId`. RMDB cases typically have **1** row; RASP cases have up to **31** rows
  across families A/B/D.
- **No fetch needed.** Family counts, tier counts, total evidence count, and the
  best/default evidence are all derivable from `evidenceRows` + `defaultEvidenceId`
  client-side. (The sibling `case.json` / `confidence-summary.json` files exist but the
  shell will NOT read them — deriving from the already-parsed `evidenceRows` avoids async,
  works offline, and keeps a single source of truth.)
- Current case HTML body: `<main class="shell">` → `<section class="hero">` (with `<h1>`,
  `<p>`, `.meta` chips) → `<section class="layout">` → `<section class="viewer">`
  (`.panel` with `#chainStatus` + `<iframe id="chainFrame">`). `case-shell.css` is loaded
  in `<head>` and already styles `.hero`, `.chip`, `.meta`, `.panel`, `.layout`,
  `.viewer-frame`, plus the already-landed `.fb-detail-nav` block.
- **The hero `.meta` chips are STATIC per-case markup, baked into each `index.html`.** E.g.
  RASP `10FZ` already has `source RASP2PDB / families A,B,D / default chain A / chains 1`;
  RMDB `10ZT` has `default chain A / chains 1`. Per-case HTML is out of scope to edit, so
  the JS must **replace the contents of the existing `.meta` node in place** (clear it,
  then append the computed chips) rather than append a second row — otherwise families /
  chains render twice. This is the only mutation of pre-existing hero DOM.
- **The two bundles have disjoint `:root` token NAMES** (rasp: `--surface`/`--textPrimary`
  /`--textSecondary`/`--primarySoft`; rmdb: `--panel`/`--text`/`--muted`/`--accent-soft`).
  Values currently coincide (warm cream + green accent `#2F8F6B`), but a style block keyed
  on one set of names renders unstyled in the other bundle. New enrichment CSS must use
  **self-contained literal values** (same precedent as the `.fb-detail-nav` block), so one
  identical block works in both bundles.

## Design

### Architecture: the viewer is a replaceable slot behind one function

The single coupling point between the (data-driven) shell and the (swappable) viewer is
the action "load this evidence's profile into the viewer." Today `updateFrame()` sets
`frame.src`. The refactor extracts that into one named seam:

```
function loadEvidence(evidenceId) {
  // 1. set state.selectedEvidenceId = evidenceId
  // 2. if the evidence belongs to a different chain (evidenceChainMap[id] !==
  //    state.activeChainId), set state.activeChainId to that chain too
  // 3. call syncUi() — which toggles chain-button .is-active, then drives the viewer
  //    and refreshes the evidence-table highlight (see below).
}
```

This is the existing `updateFrame()` flow, re-pivoted around an explicit evidence id
instead of being recomputed only from chain state. Concretely, the refactor:

- **Preserves** `state`, `evidenceById`, `defaultEvidenceForChain`, and the
  reconciliation block (current lines 71–81) verbatim.
- **Keeps `updateFrame()` as the viewer-driving body** (it still sets `frame.src` +
  `chainStatus.textContent` from `state`). `updateFrame()` is the one place that names the
  iframe — it is the future swap point (today: iframe src; future: whatever replaces the
  iframe). `loadEvidence` is the public entry the table calls; it mutates `state` then
  calls `syncUi()`, which calls `updateFrame()`.
- **Extends `syncUi()`** to also refresh the evidence-table active-row highlight from
  `state.selectedEvidenceId`, so BOTH a table-row click AND a chain-button click keep the
  table highlight, chain buttons, and viewer in sync (closes the one-directional gap).
- **Chain-button handlers stay as-is** (they reset `state` to that chain's default
  evidence and call `syncUi()`); because `syncUi()` now also repaints the table highlight,
  no extra wiring is needed on the chain buttons.

Contract: **the enrichment UI (hero / scoreboard / table) never touches the iframe or any
viewer internal.** It only computes from `evidenceRows` and, on a row click, calls
`loadEvidence(evidenceId)`. The single function that references the iframe is
`updateFrame()`. This makes shell-beautification and iframe-removal fully independent work
streams — the seam is pre-cut. This is why the work can ship now without waiting on the
iframe decision.

### Rendering (in `case-shell.js`, after bootstrap parse)

A single `renderEnrichment(bootstrap)` builds DOM (no innerHTML of untrusted data; all
case/evidence strings are inserted via `textContent` / escaped) and inserts it between the
hero and the existing `.layout`. It is a **pure function of `evidenceRows`**:

1. **Hero augmentation** — keep `<h1>` + subtitle. Add a tier badge (rendered into the
   `.hero`, after the subtitle) derived from the default/best evidence row
   (`family · <tier label>`, e.g. `A · WEAK`). Then **replace the contents of the existing
   `.meta` node in place** (clear, then append) with computed chips: chains (distinct
   `chain` count), profiles/evidence (= `evidenceRows.length` — one chip, not two), and
   families (distinct `family`, joined). Replacing in place avoids duplicating the static
   chips already in the per-case HTML (see baseline facts). For RMDB single-row cases this
   degrades to one family / one tier — still correct.
2. **Confidence scoreboard** card:
   - **Family badges**: for each distinct `family`, a labeled count (e.g.
     `A · WC-face base-specific ×13`). Family→human label is a small fixed lookup
     (A=WC-face base-specific, B=SHAPE flexibility, C=enzymatic, D=SASA solvent access,
     E=contact-map, F=pair-set); unknown families fall back to the bare letter.
   - **Tier-count pills** (user-approved option B): one pill per distinct
     `lssTierCalibrated`, with a count. The tier display lookup is the fixed table below;
     unknown tokens fall back to the raw token stripped of the `LSS_` prefix, with the
     neutral `not-supported` colour treatment.
   - **Best-evidence summary**: the default evidence row (resolved per "Best/default
     selection" below), shown with its technology, directional metric (using
     `directionalMetricLabel` so AUC vs Spearman is labeled correctly), empirical p,
     `nEvaluable`, and tier — plus the one-line tier meaning from the lookup table below.
3. **Expandable evidence table** — a `<details>` (collapsed by default; user may later flip
   to open) listing all rows: Family, Technology, Tier, directional metric value, p, n,
   profile. Each row is clickable; clicking calls `loadEvidence(row.evidenceId)`. The row
   matching `state.selectedEvidenceId` gets the active highlight; the highlight is repainted
   by `syncUi()` so it stays correct on both row clicks and chain-button clicks.

### Tier display lookup (fixed table)

Keyed on the raw `lssTierCalibrated` token. `label` is shown on the pill / badge;
`meaning` is the one-line plain-language sentence used in the best-evidence summary;
`tone` selects the CSS colour class.

| token | label | tone | meaning |
|---|---|---|---|
| `LSS_STRONG_CALIBRATED` | STRONG | strong | Directional signal clears the bar and passes all secondary gates (self-containment, conflict, size) under permutation. |
| `LSS_MODERATE_CANDIDATE` | MODERATE | moderate | Directional signal is supported but calibration is pending, so it is held below STRONG. |
| `LSS_WEAK` | WEAK | weak | Directional signal clears the bar but a secondary gate (self-containment / conflict / size) does not — directional but not yet self-contained. |
| `LSS_NOT_SUPPORTED` | NOT SUPPORTED | not-supported | Signal does not clear the bar / is not better than chance under permutation. |
| `LSS_DISCORDANT` | DISCORDANT | discordant | Signal runs counter to the structure (negative / conflicting), not merely absent. |
| `LSS_UNDERPOWERED` | UNDERPOWERED | underpowered | Too few evaluable residues (or too few paired/unpaired) to judge. |

Unknown token → label = token with `LSS_` prefix removed and `_`→space; tone =
`not-supported`; meaning = empty (omit the meaning line).

If `evidenceRows` is empty or missing, `renderEnrichment` renders nothing (leaves the
static hero/`.meta` untouched) and the page falls back to today's behavior (defensive, not
expected for materialized pages).

### Numeric / display rules

- **Directional metric**: show `aucDirectional` rounded to 2 dp, labeled by
  `directionalMetricLabel`. Spearman rows (`directionalMetricKind === "spearman_rho"`) may
  be negative — display the signed value as-is; do not coerce to an AUC-style 0–1 frame.
- **p-value**: show `aucEmpiricalPValue` to 3 dp.
- **null fields**: `conflictFraction` / `partnerInsideFraction` are `null` for Family D
  (Spearman path) — render as `—`, never `null`/`NaN`.
- **Best/default selection**: prefer the row whose `evidenceId === defaultEvidenceId`;
  fall back to the first `selectedByDefault === true` row; else the first row.

### Styling (in `case-shell.css`, both bundles)

Add one self-contained enrichment block (literal values, no `var(--…)`, per baseline
facts) styling: the tier badge, metadata chips, scoreboard card, family badges, tier
pills, best-evidence box, and the expandable table. Tier pills/badges carry one CSS class
per `tone` from the tier lookup table (`strong`, `moderate`, `weak`, `not-supported`,
`discordant`, `underpowered`) with a distinct colour each. Mirror the warm-cream +
green-accent portal language already used by `.hero` / `.fb-detail-nav`. Responsive:
chips/pills wrap; table stays horizontally scrollable on narrow viewports. Both bundles
get the **same** block (byte-identical).

### Files touched (4)

Per bundle (×2):
- edit `__<bundle>__/case-shell.js` — extract `loadEvidence` seam + add
  `renderEnrichment`, called once after bootstrap parse. (Both files stay byte-identical.)
- edit `__<bundle>__/case-shell.css` — add the enrichment style block (identical in both).

No per-case HTML is touched; all 2386 pages pick up the change through the shared files.

## Durability caveat

Everything under `public/` is materialized output of the page generator in the *other*
repo (rmdb2pdb), not this worktree. These edits will be overwritten the next time that
generator runs. This lands foldbridge-side now; porting the enrichment render + CSS into
the generator is a tracked follow-up, out of scope here (same posture as the nav-header
change).

## Non-goals

- No iframe change; no dependency on the iframe's internal viewer.
- No fetch of sibling JSON; everything derives from inlined `evidenceRows`.
- No generator port in this change (follow-up).
- No change to list pages or portal SPA.
- Evidence table default state stays **collapsed** (user may revisit; option E deferred).

## Verification

- `node --check` on both modified `case-shell.js`.
- Open a dense RASP case (`RASP2PDB%3A10FZ`, 31 rows / families A·B·D) and a single-row
  RMDB case; confirm: hero tier badge + chips correct, the static per-case `.meta` chips
  are **replaced not duplicated** (families / chains appear once), scoreboard family badges
  + tier pills counts match `evidenceRows`, best-evidence summary matches the resolved
  default row, expandable table lists every row, row click drives the viewer (iframe src
  updates) and highlights the active row, no console errors.
- Confirm null `conflictFraction` / Spearman rows render `—` / signed values, not `NaN`.
- If a multi-chain case is available, confirm clicking an evidence row whose chain differs
  from the active chain switches `state.activeChainId`, repaints the chain-button
  `.is-active`, and keeps the table highlight in sync (the cross-chain reconciliation path
  the single-chain verification cases cannot exercise).
- Confirm the enrichment renders identically in both bundles (shared block) and degrades
  gracefully on a hypothetical empty `evidenceRows` (static hero/`.meta` left untouched).
