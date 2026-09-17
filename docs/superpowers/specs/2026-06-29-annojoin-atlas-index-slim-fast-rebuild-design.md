# ANNOJOIN Atlas — Index Slimming + Fast Index-Only Rebuild — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorming), pending spec review
**Repo:** `~/docs/foldbridge` (static, hash-routed pure-ESM SPA, Node 22)

## 1. Purpose

The ANNOJOIN master table (`#annojoin-atlas` / `#entry` / `#sequence`) loads a
single browser-facing asset: `src/assets/generated/annojoin-atlas/index.json`,
currently **33.4 MB**. Two pain points:

1. **Every display-name / parent-class edit forces a full rebuild.** The molecule-name
   and parent/child-class folding the user changes frequently lands **only** in
   `index.json`. But `npm run build:annojoin-atlas` always also rewrites the
   ~126k per-case detail files (the slow part), even though those files carry
   raw provenance that folding never touches.
2. **The index is heavier than it needs to be.** Just under half of it
   (16.94 MB) is a `cases` array the browser never reads, plus a 5.78 MB
   per-row `profilePreview` field that no view renders.

This design adds (A) a fast **index-only** rebuild entry and (B) **write-time
index slimming**, with zero behavior change to the master table, the detail
page, links, search, grouping, or confidence display.

## 2. Verified facts (grounding)

Measured on the committed `index.json` (33.4 MB, displayCases 3610, cases 4070,
totalSourceCaseCount 4070):

| Top-level key | Bytes | % | Browser reads it? |
|---|---|---|---|
| `displayCases` (3610) | 17.36 MB | 49.6% | **Yes** — the only array the master table renders |
| `cases` (4070 raw) | 16.94 MB | 48.4% | **No** (see §2.1) |
| `caseHierarchy` | 0.70 MB | 2.0% | No current render consumer |
| `facets`/`presets`/`downloads`/scalars | <0.02 MB | ~0% | Yes |

Per-row contributors inside `displayCases`:

| Field | Total MB | Rendered by a view? |
|---|---|---|
| `profilePreview` (+`profilePreviewIsComplete`) | 5.78 | **No** (see §2.2) |
| `sourceCaseAssetPaths` | 1.72 | **Yes** — merged-row "Open detail page" sub-links (`annojoinAtlasView.js:230,256`) |
| `profileTracePreview` | 1.71 | **Yes** — profile-trace sidebar panel (`annojoinAtlasView.js:377`) |
| `searchText` | 0.66 | **Yes** — search/filter target (`annojoinAtlasData.js:507`) |
| `*Source` provenance (`biologicalMoleculeNameSource`, `parentClassSource`, …) | ~1.0 | **Yes** — sidebar provenance lines |

### 2.1 The `cases` array is browser-dead

`buildAtlasSearchState(tables, filters)` (`src/annojoinAtlasData.js:550`) computes:

```js
const displayRows = asArray(tables.displayCases).length ? asArray(tables.displayCases) : sourceRows;
```

`tables.cases` is used **only** as a fallback when `displayCases` is empty. Since
`displayCases` always carries 3610 rows, `cases` is never read in the browser.
The browser-side `findAnnojointIndexRowByKey` (`src/main.js:2160`) likewise reads
`buildAtlasSearchState(...).cases`, which resolves to `displayCases`, **not** the
raw `cases` array. `totalSourceCaseCount: 4070` is a separate top-level scalar,
so dropping the `cases` array does not affect the dual-count display.

### 2.2 `profilePreview` is loaded but never rendered

`profilePreview` is parsed in `normalizeCase` (`src/annojoinAtlasData.js:260`)
but no `src/*.js` view ever renders `row.profilePreview`. Only
`profileTracePreview` reaches the DOM (`annojoinAtlasView.js:377`). Confirmed by
grepping `src/*.js` for `profilePreview` — the only hits are the data-layer
parse, never a view. So it can be dropped from the browser index without any
render change.

### 2.3 Folding products land only in `index.json`

`buildAtlasIndexAsset` (`scripts/lib/annojoin-atlas-corpus.mjs:959-964`) writes
`moleculeDisplayName`, `parentClassLabel`, `childClassLabel` onto the normalized
rows that become `index.displayCases`. The per-case detail files
(`buildAtlasCaseAsset`) store **raw** provenance and do **not** carry these
folded fields. Therefore re-folding requires rebuilding **only** `index.json`,
not the 126k per-case files.

### 2.4 Build-script boundary (`scripts/build-annojoin-atlas.mjs`)

- L464-475: in-memory confidence-sidecar label patch on `tables.cases` (no file
  side-effect) — **must run** in index-only mode (it feeds the labels into the
  index).
- L477-487: `buildAtlasIndexAsset(...)` → `writeJson('index.json', …)`.
- **L490-539: the per-case write loop (126k files).** This is the slow part and
  the **only** thing index-only mode skips.
- L541-555: `buildDetailRouteIndexAsset({ cases: index.cases, displayCases: index.displayCases, … })`
  → `detail-route-index.json`. Reads the **in-memory** `index` object, so it is
  unaffected by write-time slimming.

## 3. Module A — Fast index-only rebuild

**Goal:** rebuild `index.json` (and `detail-route-index.json`) without rewriting
the 126k per-case files.

### 3.1 Flag + npm script

- New CLI flag `--index-only` parsed in `scripts/build-annojoin-atlas.mjs`.
- New `package.json` script: `"build:annojoin-atlas:index": "node scripts/build-annojoin-atlas.mjs --index-only"`.
- Environment, root resolution, table loading, and the confidence-sidecar patch
  (L464-475) are **identical** to a full build — index-only changes nothing
  upstream of the per-case loop.

### 3.2 Behavior

When `--index-only` is set:

1. Run everything through `writeJson('index.json', …)` exactly as today
   (including the slimming step from Module B).
2. **Skip** the per-case write loop (L490-539) entirely — no `cases/*.json`,
   no route pages, no confidence sidecars written.
3. Still build and write `detail-route-index.json` (L541-555) from the in-memory
   `index`, so the detail-route lookup stays current with any new/renamed rows.
4. Print a one-line notice that per-case assets were skipped and instruct the
   reader to run the full `build:annojoin-atlas` when case assets change.

### 3.3 Red line

Index-only mode is **only** safe when the change is display-name/class folding
or other index-level edits. If case *content* changes (new cases, new evidence,
new routes), the full build is required. The skip notice states this; we do not
attempt to auto-detect staleness.

## 4. Module B — Write-time index slimming

**Goal:** shrink the written `index.json` from ~33.4 MB to ~10.7 MB without
changing the in-memory `index` object (so `buildDetailRouteIndexAsset` and all
existing `buildAtlasIndexAsset` unit tests stay green).

### 4.1 Where it applies

A new pure helper `slimAtlasIndexForWrite(index)` is applied **only** at the
`writeJson('index.json', …)` call site in `scripts/build-annojoin-atlas.mjs`.
`buildAtlasIndexAsset`'s return value is unchanged; the detail-route builder
keeps reading the full in-memory object.

### 4.2 What it strips

1. The entire top-level `cases` array (−16.94 MB). `totalSourceCaseCount` is
   preserved as a scalar.
2. Per-row `profilePreview` and `profilePreviewIsComplete` from every
   `displayCases` row (−5.78 MB).

Everything else in each `displayCases` row is preserved verbatim, including the
link-critical and rendered fields:
`atlasCaseKey, caseId, pdbId, assetFamily, caseAssetPath, moleculeDisplayName,
biologicalMoleculeName(+Source), pdbMoleculeName(+Source), parentClassLabel(+Source),
childClassLabel(+Source), confidenceDisplayLabel(+Source), profileCount, chains,
searchText, profileTracePreview, sourceCaseAssetPaths, sourceCaseCount,
sourceFamilies, sourceCaseKeys, isMergedDisplayRow, fecClaimCeilingDistribution,
coverageShapeDistribution, conflictCandidateCount, hasContextAnnotation,
hasLssAnnotation, …`.

`caseHierarchy`, `facets`, `presets`, `downloads`, `source`, `schemaVersion`,
`version`, `generatedAt`, `totalCaseCount`, `totalSourceCaseCount` are all kept.

### 4.3 `sourceCaseAssetPaths` decision (approved)

Kept whole. It is rendered by the 460 merged rows' "Open detail page" sub-links
(`annojoinAtlasView.js:256`); the 3150 single rows carry a reconstructable
1-element array, but at 1.72 MB (after the two big cuts) the simplicity of
keeping it as-is outweighs special-casing single rows. No trimming.

### 4.4 Net effect

~33.4 MB → ~10.7 MB written `index.json` (−68%). Brotli/gzip siblings shrink
proportionally. `displayCases` length stays 3610; `totalSourceCaseCount` stays
4070.

## 5. Link integrity (answering "B做了之后，会不会无法和 case 页链接？")

No link breaks. The master→detail chain:

- Hrefs built from `atlasCaseKey / caseId / pdbId / assetFamily` (all kept).
- `annojoinCasePage()` (`src/main.js:2171`) resolves the asset via
  `detailRouteEntry?.asset?.caseAssetPath` (from `detail-route-index.json`, a
  separate file we still rebuild) **or** the fallback
  `findAnnojointIndexRowByKey(caseKey)?.caseAssetPath`. That fallback searches
  `displayCases`, not the dropped `cases` array, and `caseAssetPath` is kept on
  every row. Merged rows keep their explicit `caseAssetPath` plus
  `sourceCaseAssetPaths`.

## 6. Testing

All TDD, `node --test`, no jsdom (pure functions + a build-script harness).

### 6.1 Module B unit tests (`test/annojoin-atlas-corpus.test.js`)

- `slimAtlasIndexForWrite` removes the `cases` key.
- It removes `profilePreview` / `profilePreviewIsComplete` from every
  `displayCases` row.
- It **preserves** `caseAssetPath`, `atlasCaseKey`, `caseId`, `pdbId`,
  `assetFamily`, `sourceCaseAssetPaths`, `profileTracePreview`, `searchText`,
  and `*Source` fields on a sample row.
- It preserves the scalars (`totalSourceCaseCount` = 4070, `totalCaseCount`,
  `displayCases.length`) and top-level `caseHierarchy`/`facets`/`presets`/`downloads`.
- The input `index` object is **not mutated** (slimming returns a new object;
  `buildDetailRouteIndexAsset` still sees full `cases`).

### 6.2 Link-resolution test (`test/annojoin-atlas.test.js`)

- After slimming, `buildAtlasSearchState({ ...slimmedIndex }, {}).cases`
  resolves a known merged key and a known single key, and each resolved row
  still exposes a non-empty `caseAssetPath`.

### 6.3 Module A build-script test

- A small fixture build with `--index-only`: asserts `index.json` and
  `detail-route-index.json` are written and **zero** `cases/*.json` files are
  created.
- Asserts the `--index-only` `index.json` is byte-identical to the same
  fixture's full-build `index.json` (slimming applies equally in both paths).
  **Freeze `generatedAt`** (pass a fixed value, or compare with it stripped) so
  the timestamp does not cause a false mismatch — it is the only non-deterministic
  field in the index.

### 6.4 Regression

`npm test` (full suite) and `npm run verify:annojoin-atlas` after a real
index-only rebuild against the local combined view root, confirming
displayCases=3610 / totalSourceCaseCount=4070, family {666,460,2484}, RASP still
`not active`, and the 6 known pre-existing visual-preview failures unchanged.

## 7. Out of scope

- No change to the per-case asset schema or the detail page.
- No change to master-table rendering, search scoring, grouping, or confidence.
- No removal of `caseHierarchy` (kept; small, and may gain a consumer later).
- No new colors/fonts; no touch to first-page Pagefind search.
- No auto-detection of when a full rebuild is required (operator's judgment).

## 8. Red lines (must hold)

1. `displayCases` length stays **3610**; `totalSourceCaseCount` stays **4070**.
2. Molecule names never truncated.
3. RASP never rendered as active positive confidence.
4. Raw provenance (`biologicalMoleculeName`, `pdbMoleculeName`, all `*Source`)
   never overwritten — only display-only derived fields are produced, and
   slimming only **drops browser-dead fields**, never edits surviving values.
5. Generated assets stay deterministic (code-point tie-break; no locale-sensitive
   ordering) so git diffs are clean.
