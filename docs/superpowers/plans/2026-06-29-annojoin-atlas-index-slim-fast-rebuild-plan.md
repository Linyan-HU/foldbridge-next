# ANNOJOIN Atlas — Index Slimming + Fast Index-Only Rebuild — Implementation Plan

**Date:** 2026-06-29
**Spec:** `docs/superpowers/specs/2026-06-29-annojoin-atlas-index-slim-fast-rebuild-design.md` (Approved)
**Repo:** `~/docs/foldbridge` (static, hash-routed pure-ESM SPA, Node 22; no framework, no bundler)

## Goal

Implement the two modules from the approved design with **zero behavior change** to the master table, the detail page, links, search, grouping, or confidence display:

- **Module A — Fast index-only rebuild** (spec §3): a new `--index-only` CLI flag on `scripts/build-annojoin-atlas.mjs` plus an `npm run build:annojoin-atlas:index` script. It rebuilds `index.json` and `detail-route-index.json` while **skipping** the ~126k per-case detail-file write loop. This is the fast path for the molecule-name / parent-class folding edits the user makes frequently, which land **only** in `index.json` (spec §2.3).
- **Module B — Write-time index slimming** (spec §4): a new pure function `slimAtlasIndexForWrite(index)` applied **only** at the `writeJson('index.json', …)` call site. It strips the browser-dead top-level `cases` array (−16.94 MB, spec §2.1) and the never-rendered per-row `profilePreview` / `profilePreviewIsComplete` fields (−5.78 MB, spec §2.2), taking the written `index.json` from ~33.4 MB to ~10.7 MB (−68%, spec §4.4). The in-memory `index` object is **not** mutated, so `buildDetailRouteIndexAsset` and every existing `buildAtlasIndexAsset` unit test stay green.

## Architecture (verified facts the plan relies on)

- `buildAtlasIndexAsset` (`scripts/lib/annojoin-atlas-corpus.mjs:927-985`) returns `{ schemaVersion, version, generatedAt, source, totalCaseCount, totalSourceCaseCount, caseHierarchy, displayCases, cases, facets, presets, downloads }`. `cases` = 4070 normalized source rows; `displayCases` = 3610 merged display rows. `totalSourceCaseCount` is the independent scalar that drives the dual-count display, so dropping `cases` does **not** change counts (spec §2.1).
- The browser never reads the top-level `cases` array: `buildAtlasSearchState` (`src/annojoinAtlasData.js:550`) uses `cases` **only** as a fallback when `displayCases` is empty, and `displayCases` always has 3610 rows (spec §2.1).
- `profilePreview` / `profilePreviewIsComplete` are parsed in the data layer (`src/annojoinAtlasData.js:260-262`) and set on merged display rows in `buildDisplayCases` (`scripts/lib/annojoin-atlas-corpus.mjs:~417`), but **no `src/*.js` view renders `row.profilePreview`** — only `profileTracePreview` reaches the DOM (`src/annojoinAtlasView.js:377`). Confirmed by grep (spec §2.2).
- `scripts/build-annojoin-atlas.mjs` boundary (spec §2.4):
  - L353-354: `await rm(OUT_ROOT, …)` then `mkdir` — **index-only must NOT run the `rm`**, or it deletes the 126k per-case files we want to keep.
  - L464-475: in-memory confidence-sidecar label patch on `tables.cases` (no file side-effect) — **must run** in index-only mode (it feeds labels into the index).
  - L477-487: `buildAtlasIndexAsset(...)` → `writeJson('index.json', index, manifest)` — the slimming insertion point.
  - L490-539: the per-case write loop — the **only** thing index-only skips.
  - L541-555: `buildDetailRouteIndexAsset({ cases: index.cases, displayCases: index.displayCases, … })` → `detail-route-index.json`. Reads the **in-memory** `index` object (full `cases`), so it is unaffected by write-time slimming and by index-only mode. It carries only key/id/path + compressed descriptor — no molecule names or class labels — so it is insensitive to folding and we rebuild it in both modes.
- `detail-route-index.json`'s `compressed` descriptor is **not** consumed by the browser store: `src/annojoinAtlasStore.js` `loadCompressedJson` (L83) probes `${relPath}.br`/`.gz` by convention and falls back to raw. So even in index-only mode (where `compressedAssetsByPath` is empty and descriptors become `null`), detail loading is unaffected.
- Link integrity (spec §5): `annojoinCasePage()` (`src/main.js:2171`) resolves the asset via `detailRouteEntry?.asset?.caseAssetPath` (from `detail-route-index.json`) **or** `findAnnojointIndexRowByKey(caseKey)?.caseAssetPath` (which searches `displayCases`, not the dropped `cases` array). `caseAssetPath` is kept on every surviving row.
- Generated-asset directory `src/assets/generated/annojoin-atlas/` is **gitignored** (`.gitignore:19`). Assets are rebuilt locally, not committed — so no "rebuild and commit assets" step is needed; the regression task rebuilds locally and verifies, nothing is staged.

## Tech stack & conventions

- Pure ES modules, Node 22. Tests use `node --test` (`import test from 'node:test'; import assert from 'node:assert/strict';`). **No jsdom.**
- Test runner: `npm test` (= `node --test`). Single file: `node --test test/<file>.test.js`.
- Commits: Chinese Conventional Commits, e.g. `feat(ANNOJOIN Atlas): …`, `test(ANNOJOIN Atlas): …`, `build(ANNOJOIN Atlas): …`.
- DRY / YAGNI: `slimAtlasIndexForWrite` lives beside `buildAtlasIndexAsset` in the same corpus module (same domain, shared field knowledge); no new module, no speculative options. Commit after each green task.

## Note for AI-agent implementers

- Do all work with the dedicated Read/Edit/Write/Grep tools; reserve Bash for running tests and the real rebuild.
- Follow TDD strictly: write the failing test, run it, confirm it fails for the expected reason, write the minimal implementation, run it, confirm green, then commit. Do not batch multiple tasks into one commit.
- Never mutate the in-memory `index` object in Module B — return a new object. The detail-route builder downstream depends on the full `cases` array still being present.
- Never edit source files other than the three listed below plus their test files. Do not touch generated assets, `src/search/`, or the first-page Pagefind pipeline.

## File structure (what changes and why)

| File | Change | Responsibility |
|---|---|---|
| `scripts/lib/annojoin-atlas-corpus.mjs` | **Add + export** `slimAtlasIndexForWrite(index)` (Module B); **add + export** `shouldWritePerCaseAssets(argv)` (Module A decision) | Pure functions. Slim: return a shallow-cloned index with `cases` removed and `profilePreview`/`profilePreviewIsComplete` stripped from each `displayCases` row. Decision: `!argv.includes('--index-only')`. |
| `scripts/build-annojoin-atlas.mjs` | Parse `--index-only`; gate `rm(OUT_ROOT)` + per-case loop on `shouldWritePerCaseAssets`; wrap the `index.json` write in `slimAtlasIndexForWrite`; print skip notice | IO shell. Index-only changes nothing upstream of the per-case loop. |
| `package.json` | Add `"build:annojoin-atlas:index": "node scripts/build-annojoin-atlas.mjs --index-only"` | New fast-rebuild entry. |
| `test/annojoin-atlas-corpus.test.js` | Add `slimAtlasIndexForWrite` + `shouldWritePerCaseAssets` unit tests | Module B + Module A decision coverage. |
| `test/annojoin-atlas.test.js` | Add link-resolution-after-slimming test | Confirms slimmed index still resolves merged + single keys with non-empty `caseAssetPath`. |
| `test/annojoin-atlas-index-only-build.test.js` (new) | End-to-end spawn test against a minimal fixture ANNOJOIN root | Asserts index-only writes `index.json` + `detail-route-index.json`, writes **zero** `cases/*.json`, and produces a `generatedAt`-stripped `index.json` byte-identical to the full build. |

## Module A test strategy (chosen — with rationale)

**Hybrid: a pure decision function unit test + one lightweight end-to-end spawn test.**

Rationale:
- `build-annojoin-atlas.mjs` is a thin IO shell whose `main()` is auto-invoked at module load (`main().catch(...)` at L562). Importing it to unit-test `main` would execute a real build, so `main` is not directly unit-testable. The clean way to exercise the actual skip behavior is to **spawn the script as a subprocess** (`node:child_process`) against a temp fixture root, which needs no jsdom and matches the "no framework" house style.
- To keep the branch logic itself fast and deterministically testable in isolation, the skip decision is extracted into the pure `shouldWritePerCaseAssets(argv)` helper (unit-tested directly). The build script calls it, so the unit test pins the contract while the spawn test proves the real IO.
- The fixture is light: `readTable` requires only the 11 ANNOJOIN TSVs (`anno_case_search_index.tsv`, `anno_facet_catalog.tsv`, `anno_case_evidence_summary.tsv`, `anno_detail_route_index.tsv`, `anno_case_profile_membership.tsv`, `anno_residue_track_route_index.tsv`, `anno_2d_pair_context_route_index.tsv`, `anno_3d_residue_coloring_route_index.tsv`, `anno_conflict_candidate_index.tsv`, `atlas_preset_view_definitions.tsv`, `atlas_download_manifest.tsv`); every other table is read via `readOptionalTable`, which **degrades gracefully to `[]`** when absent. So a 2-case fixture with 11 tiny TSVs builds end-to-end without ANNOCONFIDENCE/FEC inputs.
- `generatedAt` (`new Date().toISOString()`) is the only non-deterministic field in `index.json` and has no env override. Rather than add an env knob (out of scope), the spawn test compares the two builds' parsed `index.json` **with `generatedAt` deleted** (spec §6.3 "compare with it stripped").

---

## Task 1 — Module B pure function `slimAtlasIndexForWrite` (spec §4, §6.1)

Add and export a pure helper in `scripts/lib/annojoin-atlas-corpus.mjs` that returns a slimmed copy of an index object for writing: drop the top-level `cases` array, and strip `profilePreview` + `profilePreviewIsComplete` from every `displayCases` row. It must not mutate the input.

### Step 1.1 — Write the failing tests

Append to `test/annojoin-atlas-corpus.test.js`. Add `slimAtlasIndexForWrite` to the existing import from `'../scripts/lib/annojoin-atlas-corpus.mjs'` (line 3-9 import block).

```js
test('slimAtlasIndexForWrite drops the browser-dead cases array', () => {
  const index = buildAtlasIndexAsset({
    cases: [
      { case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: '16S ribosomal RNA', profile_ids: 'p1', profile_count: '1' }
    ]
  });
  assert.ok(Array.isArray(index.cases), 'precondition: full index has cases');
  const slim = slimAtlasIndexForWrite(index);
  assert.equal('cases' in slim, false);
});

test('slimAtlasIndexForWrite strips profilePreview/profilePreviewIsComplete from every displayCases row', () => {
  const index = buildAtlasIndexAsset({
    cases: [
      { asset_family: 'RMDB2PDB', case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: 'm', profile_ids: 'p1;p2', profile_count: '2', profile_ids_complete: 'true' },
      { asset_family: 'RASP2PDB', case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: 'm', profile_ids: 'p3', profile_count: '1', profile_ids_complete: 'true' }
    ]
  });
  const merged = index.displayCases.find((row) => row.isMergedDisplayRow);
  assert.ok(merged, 'precondition: a merged display row exists with a profilePreview');
  assert.ok('profilePreview' in merged);
  const slim = slimAtlasIndexForWrite(index);
  for (const row of slim.displayCases) {
    assert.equal('profilePreview' in row, false);
    assert.equal('profilePreviewIsComplete' in row, false);
  }
});

test('slimAtlasIndexForWrite preserves link-critical and rendered fields on a sample row', () => {
  const index = buildAtlasIndexAsset({
    cases: [
      {
        asset_family: 'RMDB2PDB', case_id: '10ZT', pdb_id: '10ZT',
        biological_molecule_name: '16S ribosomal RNA',
        biological_molecule_name_source: 'PDB/biological_layer/pdb_child_identity_index.tsv',
        pdb_molecule_name: '30S ribosomal subunit RNA',
        parent_class_label: 'Ribosome', child_class_label: '16S rRNA',
        profile_count: '1', profile_ids: 'p1', search_text: '10ZT ribosome'
      }
    ],
    summaries: [{ case_id: '10ZT', recommended_default_preset: 'balanced_segment_view' }],
    routes: [{ case_id: '10ZT', detail_route_id: '/atlas/rmdb2pdb/10ZT' }]
  });
  const slim = slimAtlasIndexForWrite(index);
  const row = slim.displayCases[0];
  for (const key of ['atlasCaseKey', 'caseId', 'pdbId', 'assetFamily', 'caseAssetPath',
    'sourceCaseAssetPaths', 'profileTracePreview', 'searchText', 'moleculeDisplayName',
    'biologicalMoleculeName', 'biologicalMoleculeNameSource']) {
    assert.ok(key in row, `expected ${key} preserved`);
  }
  assert.equal(row.caseAssetPath, 'cases/RMDB2PDB%3A10ZT.json');
  assert.equal(row.biologicalMoleculeName, '16S ribosomal RNA');
});

test('slimAtlasIndexForWrite keeps scalars and top-level structures', () => {
  const index = buildAtlasIndexAsset({
    cases: [{ case_id: '10ZT', pdb_id: '10ZT', biological_molecule_name: 'm', parent_class_label: 'Ribosome', child_class_label: '16S rRNA' }],
    facets: [{ facet_name: 'PDB ID', source_column: 'pdb_id', display_label: 'PDB ID' }],
    presets: [{ preset_id: 'p', preset_name: 'P' }],
    downloads: [{ download_id: 'd', download_label: 'D', file_path: 'x.tsv', row_count: '1' }]
  });
  const slim = slimAtlasIndexForWrite(index);
  assert.equal(slim.totalSourceCaseCount, index.totalSourceCaseCount);
  assert.equal(slim.totalCaseCount, index.totalCaseCount);
  assert.equal(slim.displayCases.length, index.displayCases.length);
  assert.deepEqual(slim.caseHierarchy, index.caseHierarchy);
  assert.deepEqual(slim.facets, index.facets);
  assert.deepEqual(slim.presets, index.presets);
  assert.deepEqual(slim.downloads, index.downloads);
  assert.equal(slim.schemaVersion, index.schemaVersion);
  assert.equal(slim.version, index.version);
  assert.equal(slim.generatedAt, index.generatedAt);
  assert.deepEqual(slim.source, index.source);
});

test('slimAtlasIndexForWrite does not mutate its input', () => {
  const index = buildAtlasIndexAsset({
    cases: [
      { asset_family: 'RMDB2PDB', case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: 'm', profile_ids: 'p1;p2', profile_count: '2', profile_ids_complete: 'true' },
      { asset_family: 'RASP2PDB', case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: 'm', profile_ids: 'p3', profile_count: '1', profile_ids_complete: 'true' }
    ]
  });
  const before = JSON.stringify(index);
  slimAtlasIndexForWrite(index);
  assert.equal(JSON.stringify(index), before, 'input index must be unchanged');
  assert.ok(Array.isArray(index.cases));
  assert.ok(index.displayCases.some((row) => 'profilePreview' in row));
});
```

### Step 1.2 — Run, confirm failure

```bash
node --test test/annojoin-atlas-corpus.test.js
```
Expect: the five new tests fail with `slimAtlasIndexForWrite is not a function` (or `not exported`). Existing tests still pass.

### Step 1.3 — Minimal implementation

Add to `scripts/lib/annojoin-atlas-corpus.mjs`, immediately after `buildAtlasIndexAsset` (after line 985):

```js
// Write-time slimming (display-only): strip browser-dead fields from the index
// before it is written to disk. NEVER mutates the input; the in-memory index
// keeps its full `cases` array for buildDetailRouteIndexAsset. (See design §4.)
export function slimAtlasIndexForWrite(index = {}) {
  const { cases, displayCases, ...rest } = index;
  const slimDisplayCases = Array.isArray(displayCases)
    ? displayCases.map((row) => {
        const { profilePreview, profilePreviewIsComplete, ...keep } = row;
        return keep;
      })
    : displayCases;
  return { ...rest, displayCases: slimDisplayCases };
}
```

Note: destructuring `cases` out of `rest` removes the key entirely (so `'cases' in slim === false`), and destructuring the two fields out of each row removes them per-row. `rest` shallow-copies all other top-level keys verbatim.

### Step 1.4 — Run, confirm green

```bash
node --test test/annojoin-atlas-corpus.test.js
```
Expect: all tests pass (existing + 5 new).

### Step 1.5 — Commit

```bash
git add scripts/lib/annojoin-atlas-corpus.mjs test/annojoin-atlas-corpus.test.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 写时索引瘦身纯函数 slimAtlasIndexForWrite

剥离 browser-dead 的 cases 数组与每行 profilePreview/profilePreviewIsComplete，
不可变输入，保留 displayCases 存活字段与全部标量。
EOF
)"
```

---

## Task 2 — Apply slimming at the `index.json` write site (spec §4.1, §5, §6.2)

Wrap the `writeJson('index.json', …)` call in `slimAtlasIndexForWrite`, leaving the in-memory `index` (and therefore the downstream `buildDetailRouteIndexAsset` call which reads `index.cases` / `index.displayCases`) untouched. Add a link-resolution regression test proving the slimmed index still resolves detail-page links.

### Step 2.1 — Write the failing link-resolution test

Append to `test/annojoin-atlas.test.js`. Add `slimAtlasIndexForWrite` to the imports — it lives in the corpus module, so add a new import line:

```js
import { buildAtlasIndexAsset, slimAtlasIndexForWrite } from '../scripts/lib/annojoin-atlas-corpus.mjs';
```

Then the test (builds an index with one single-source PDB and one merged PDB, slims it, and confirms `buildAtlasSearchState` still resolves both keys with a usable `caseAssetPath`):

```js
test('a slimmed index still resolves merged and single detail-page links', () => {
  const index = buildAtlasIndexAsset({
    cases: [
      // single-source PDB
      { asset_family: 'RMDB2PDB', case_id: '10ZT', pdb_id: '10ZT', biological_molecule_name: 'm', profile_count: '1', profile_ids: 'p1', search_text: '10ZT' },
      // merged PDB (two source families, same pdb_id)
      { asset_family: 'RMDB2PDB', case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: 'm', profile_count: '2', profile_ids: 'a;b', search_text: '10FZ rmdb' },
      { asset_family: 'RASP2PDB', case_id: '10FZ', pdb_id: '10FZ', biological_molecule_name: 'm', profile_count: '3', profile_ids: 'c', search_text: '10FZ rasp' }
    ],
    summaries: [
      { asset_family: 'RMDB2PDB', case_id: '10ZT', recommended_default_preset: 'balanced_segment_view' },
      { asset_family: 'RMDB2PDB', case_id: '10FZ', recommended_default_preset: 'rmdb-view' },
      { asset_family: 'RASP2PDB', case_id: '10FZ', recommended_default_preset: 'rasp-view' }
    ],
    routes: [
      { asset_family: 'RMDB2PDB', case_id: '10ZT', detail_route_id: 'detail:10ZT' },
      { asset_family: 'RMDB2PDB', case_id: '10FZ', detail_route_id: 'detail:rmdb' },
      { asset_family: 'RASP2PDB', case_id: '10FZ', detail_route_id: 'detail:rasp' }
    ]
  });
  const slim = slimAtlasIndexForWrite(index);
  // browser reads displayCases via buildAtlasSearchState(...).cases
  const state = buildAtlasSearchState(slim, {});
  // Single-source rows keep their original family-prefixed atlasCaseKey
  // (buildDisplayCases L398-407 spreads the row verbatim); ONLY merged rows
  // (≥2 sources, same pdb_id) are rekeyed to `PDB:<pdbId>` (L435).
  const single = state.cases.find((row) => row.atlasCaseKey === 'RMDB2PDB:10ZT');
  const merged = state.cases.find((row) => row.atlasCaseKey === 'PDB:10FZ');
  assert.ok(single, 'single-source PDB row resolvable');
  assert.ok(merged, 'merged PDB row resolvable');
  // single row keeps a direct caseAssetPath
  assert.equal(single.caseAssetPath, 'cases/RMDB2PDB%3A10ZT.json');
  // merged row keeps explicit sub-links for "Open detail page"
  assert.ok(Array.isArray(merged.sourceCaseAssetPaths) && merged.sourceCaseAssetPaths.length === 2);
  for (const entry of merged.sourceCaseAssetPaths) {
    assert.ok(entry.caseAssetPath && entry.caseAssetPath.length > 0);
  }
});
```

This test passes against the pure functions already shipped in Task 1, so it is a **characterization/regression** test that locks the link contract; it would fail if a future change to `slimAtlasIndexForWrite` accidentally stripped `caseAssetPath` or `sourceCaseAssetPaths`. Run it now to confirm it is green against Task 1's implementation:

```bash
node --test test/annojoin-atlas.test.js
```

### Step 2.2 — Make the build-script change visible via a failing assertion (the wiring)

The build wiring itself is exercised end-to-end in Task 3's spawn test (which asserts the written `index.json` has no `cases` key). To keep Task 2 self-contained, the build-script edit below is verified by Task 3; here we only perform the minimal source edit and rely on the full `npm test` to confirm nothing regressed.

### Step 2.3 — Edit the build script

In `scripts/build-annojoin-atlas.mjs`:

1. Add `slimAtlasIndexForWrite` to the import from `'./lib/annojoin-atlas-corpus.mjs'` (the import block at L7-14):

```js
import {
  atlasCaseKeyFor,
  buildAtlasCaseAsset,
  buildAtlasIndexAsset,
  groupByAtlasCaseKey,
  groupByCaseId,
  parseTsv,
  slimAtlasIndexForWrite
} from './lib/annojoin-atlas-corpus.mjs';
```

2. Change the `index.json` write (L487) from:

```js
  await writeJson('index.json', index, manifest);
```

to:

```js
  await writeJson('index.json', slimAtlasIndexForWrite(index), manifest);
```

Leave L541-555 (`buildDetailRouteIndexAsset({ … cases: index.cases, displayCases: index.displayCases … })`) **unchanged** — it must keep reading the full in-memory `index`.

### Step 2.4 — Run the full suite

```bash
npm test
```
Expect: all tests pass, including the new link-resolution test. (The known pre-existing `5GAG smoke` failure documented for this branch is unrelated and not introduced here.)

Note: this `npm test` only confirms no regression from the source edit. The actual `index.json` write-site wiring (that the written file has no `cases` key) is asserted end-to-end by Task 3's spawn test, not here.

### Step 2.5 — Commit

```bash
git add scripts/build-annojoin-atlas.mjs test/annojoin-atlas.test.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): index.json 写出处接入瘦身

写盘前套 slimAtlasIndexForWrite，内存 index 不变，
detail-route-index 仍读完整 cases；新增瘦身后链接解析回归测试。
EOF
)"
```

---

## Task 3 — Module A: `--index-only` fast rebuild (spec §3, §6.3)

Add the `--index-only` flag. When set: skip the `rm(OUT_ROOT)` cleanup and the per-case write loop, still write `index.json` (slimmed) and `detail-route-index.json`, and print a skip notice. Extract the skip decision into the pure, unit-tested `shouldWritePerCaseAssets(argv)`.

### Step 3.1 — Write the failing decision unit test

Append to `test/annojoin-atlas-corpus.test.js`. Add `shouldWritePerCaseAssets` to the corpus import.

```js
test('shouldWritePerCaseAssets is false only when --index-only is present', () => {
  assert.equal(shouldWritePerCaseAssets([]), true);
  assert.equal(shouldWritePerCaseAssets(['--some-other-flag']), true);
  assert.equal(shouldWritePerCaseAssets(['--index-only']), false);
  assert.equal(shouldWritePerCaseAssets(['node', 'build.mjs', '--index-only']), false);
});
```

### Step 3.2 — Write the failing end-to-end spawn test

Create `test/annojoin-atlas-index-only-build.test.js`. It writes a 2-case fixture ANNOJOIN root (only the 11 required TSVs; optional tables degrade to `[]`), runs the build twice (full, then `--index-only`) into separate temp out-dirs via `FOLDBRIDGE_ANNOJOIN_ATLAS_OUT`, and asserts the skip behavior + index equivalence.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const buildScript = path.join(repoRoot, 'scripts/build-annojoin-atlas.mjs');

// 11 required ANNOJOIN tables (TABLES map in build-annojoin-atlas.mjs).
// Two source rows under one shared pdb_id so a merged display row is produced.
function writeFixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'annojoin-fixture-'));
  const tsv = (rows) => rows.map((cols) => cols.join('\t')).join('\n') + '\n';
  writeFileSync(path.join(root, 'anno_case_search_index.tsv'), tsv([
    ['asset_family', 'case_id', 'pdb_id', 'biological_molecule_name', 'parent_class_label', 'child_class_label', 'confidence_display_label', 'profile_count', 'profile_ids', 'profile_ids_complete', 'search_text'],
    ['RMDB2PDB', '10FZ', '10FZ', '16S ribosomal RNA', 'Ribosome', '16S rRNA', 'B_CONTEXT_STRATIFIED (1)', '2', 'a;b', 'true', '10FZ rmdb'],
    ['RASP2PDB', '10FZ', '10FZ', '16S ribosomal RNA', 'RASP public current', 'raw-hit case', 'RASP public current; positive confidence not active', '1', 'c', 'true', '10FZ rasp']
  ]));
  writeFileSync(path.join(root, 'anno_facet_catalog.tsv'), tsv([
    ['facet_name', 'source_table', 'source_column', 'display_label'],
    ['PDB ID', 'anno_case_search_index.tsv', 'pdb_id', 'PDB ID']
  ]));
  writeFileSync(path.join(root, 'anno_case_evidence_summary.tsv'), tsv([
    ['asset_family', 'case_id', 'recommended_default_preset'],
    ['RMDB2PDB', '10FZ', 'rmdb-view'],
    ['RASP2PDB', '10FZ', 'rasp-view']
  ]));
  writeFileSync(path.join(root, 'anno_detail_route_index.tsv'), tsv([
    ['asset_family', 'case_id', 'detail_route_id'],
    ['RMDB2PDB', '10FZ', 'detail:rmdb'],
    ['RASP2PDB', '10FZ', 'detail:rasp']
  ]));
  // remaining tables can be header-only (parseTsv yields [])
  writeFileSync(path.join(root, 'anno_case_profile_membership.tsv'), 'asset_family\tcase_id\tpair_id\tprofile_id\n');
  writeFileSync(path.join(root, 'anno_residue_track_route_index.tsv'), 'asset_family\tcase_id\ttrack_route_id\n');
  writeFileSync(path.join(root, 'anno_2d_pair_context_route_index.tsv'), 'asset_family\tcase_id\tcontext_route_id\n');
  writeFileSync(path.join(root, 'anno_3d_residue_coloring_route_index.tsv'), 'asset_family\tcase_id\tstructure_file_path\n');
  writeFileSync(path.join(root, 'anno_conflict_candidate_index.tsv'), 'asset_family\tcase_id\tconflict_candidate_id\n');
  writeFileSync(path.join(root, 'atlas_preset_view_definitions.tsv'), 'preset_id\tpreset_name\n');
  writeFileSync(path.join(root, 'atlas_download_manifest.tsv'), 'download_id\tdownload_label\tfile_path\trow_count\n');
  return root;
}

function runBuild(annojoinRoot, outRoot, extraArgs = []) {
  // Point optional-table envs at a non-existent path so they degrade to [].
  const result = spawnSync('node', [buildScript, ...extraArgs], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FOLDBRIDGE_ANNOJOIN_ROOT: annojoinRoot,
      FOLDBRIDGE_ANNOJOIN_ATLAS_OUT: outRoot,
      FOLDBRIDGE_ANNOCONFIDENCE_ROOT: path.join(annojoinRoot, '__missing_annoconfidence__'),
      FOLDBRIDGE_FEC_EVIDENCE_ROOT: path.join(annojoinRoot, '__missing_fec__'),
      FOLDBRIDGE_PDB_CHAIN_IDENTITY: path.join(annojoinRoot, '__missing_identity__.tsv'),
      FOLDBRIDGE_PDB_GOVERNED_MAP: path.join(annojoinRoot, '__missing_governed__.tsv'),
      FOLDBRIDGE_RMDB_ABC_LSS_ROOT: '',
      FOLDBRIDGE_RASP_D_LSS_ROOT: ''
    },
    encoding: 'utf8'
  });
  return result;
}

function stripGeneratedAt(jsonText) {
  const obj = JSON.parse(jsonText);
  delete obj.generatedAt;
  return JSON.stringify(obj);
}

test('--index-only writes index.json + detail-route-index.json but no per-case files', () => {
  const root = writeFixtureRoot();
  const fullOut = mkdtempSync(path.join(tmpdir(), 'annojoin-full-out-'));
  const indexOut = mkdtempSync(path.join(tmpdir(), 'annojoin-index-out-'));

  const full = runBuild(root, fullOut);
  assert.equal(full.status, 0, `full build failed: ${full.stderr}`);
  // full build writes per-case assets
  assert.ok(existsSync(path.join(fullOut, 'cases')), 'full build wrote cases/ dir');
  assert.ok(readdirSync(path.join(fullOut, 'cases')).length > 0);

  const indexOnly = runBuild(root, indexOut, ['--index-only']);
  assert.equal(indexOnly.status, 0, `index-only build failed: ${indexOnly.stderr}`);
  assert.ok(existsSync(path.join(indexOut, 'index.json')), 'index.json written');
  assert.ok(existsSync(path.join(indexOut, 'detail-route-index.json')), 'detail-route-index.json written');
  // index-only writes NO per-case files
  assert.equal(existsSync(path.join(indexOut, 'cases')), false, 'index-only wrote no cases/ dir');

  // written index.json is slimmed (no cases key)
  const slim = JSON.parse(readFileSync(path.join(indexOut, 'index.json'), 'utf8'));
  assert.equal('cases' in slim, false);
  assert.equal(slim.totalSourceCaseCount, 2);
  assert.equal(slim.displayCases.length, 1);

  // index-only index.json == full-build index.json (modulo generatedAt)
  assert.equal(
    stripGeneratedAt(readFileSync(path.join(indexOut, 'index.json'), 'utf8')),
    stripGeneratedAt(readFileSync(path.join(fullOut, 'index.json'), 'utf8'))
  );
});
```

### Step 3.3 — Run, confirm failure

```bash
node --test test/annojoin-atlas-corpus.test.js test/annojoin-atlas-index-only-build.test.js
```
Expect: `shouldWritePerCaseAssets` test fails (not exported); the spawn test fails because today `--index-only` still runs the per-case loop (so `indexOut/cases` exists) and still runs `rm(OUT_ROOT)`.

### Step 3.4 — Implement

**(a)** Export the decision helper in `scripts/lib/annojoin-atlas-corpus.mjs` (near `slimAtlasIndexForWrite`):

```js
// Module A skip decision: per-case assets are written unless --index-only is set.
export function shouldWritePerCaseAssets(argv = []) {
  return !argv.includes('--index-only');
}
```

Add it to the same import in the build script's corpus import block.

**(b)** In `scripts/build-annojoin-atlas.mjs`, near the top of `main()` (after L313's root check is fine; before the cleanup), compute the flag once:

```js
  const writePerCaseAssets = shouldWritePerCaseAssets(process.argv);
```

**(c)** Gate the cleanup (L353-354) so index-only does **not** wipe the existing per-case files:

```js
  if (writePerCaseAssets) {
    await rm(OUT_ROOT, { recursive: true, force: true });
  }
  await mkdir(OUT_ROOT, { recursive: true });
```

**(d)** Gate the per-case write loop (L490-539). Wrap the entire `for (const row of tables.cases) { … }` loop:

```js
  if (writePerCaseAssets) {
    for (const row of tables.cases) {
      // … unchanged loop body …
    }
  } else {
    console.log('[build-annojoin-atlas] --index-only: skipped per-case asset writes (cases/*.json, route pages, confidence sidecars). Run `npm run build:annojoin-atlas` when case content changes.');
  }
```

The `detail-route-index.json` build/write (L541-555) stays **outside** the gate and runs in both modes (it reads the in-memory `index`, and `compressedAssetsByPath` is simply empty in index-only mode — harmless per the store's by-convention `.br/.gz` probing).

**(e)** Optional: reflect the mode in the final summary log (L559), e.g. append ` (index-only)` when `!writePerCaseAssets`.

### Step 3.5 — Run, confirm green

```bash
node --test test/annojoin-atlas-corpus.test.js test/annojoin-atlas-index-only-build.test.js
```
Expect: all pass. Then full suite:

```bash
npm test
```

### Step 3.6 — Commit

```bash
git add scripts/lib/annojoin-atlas-corpus.mjs scripts/build-annojoin-atlas.mjs test/annojoin-atlas-corpus.test.js test/annojoin-atlas-index-only-build.test.js
git commit -m "$(cat <<'EOF'
feat(ANNOJOIN Atlas): 新增 --index-only 快速重建模式

index-only 跳过输出目录清理与 126k per-case 写循环，仍重建
index.json(瘦身)与 detail-route-index.json；决策抽成纯函数
shouldWritePerCaseAssets，附最小 fixture 端到端 spawn 测试。
EOF
)"
```

---

## Task 4 — `package.json` script (spec §3.1)

Add the fast-rebuild entry next to the existing `build:annojoin-atlas` (package.json L9).

### Step 4.1 — Edit

In `package.json`, after the `"build:annojoin-atlas"` line:

```json
    "build:annojoin-atlas": "node scripts/build-annojoin-atlas.mjs",
    "build:annojoin-atlas:index": "node scripts/build-annojoin-atlas.mjs --index-only",
```

### Step 4.2 — Verify it parses

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')"
npm run build:annojoin-atlas:index --silent --dry-run 2>/dev/null || echo "(script registered)"
```
(The script will only run a real build with the proper env; this step just confirms the JSON is valid and the script name resolves.)

### Step 4.3 — Commit

```bash
git add package.json
git commit -m "$(cat <<'EOF'
build(ANNOJOIN Atlas): 新增 build:annojoin-atlas:index 快速重建脚本
EOF
)"
```

---

## Task 5 — Regression: full suite + real index-only rebuild + smoke verify (spec §6.4, §8)

This task is verification only — no code changes. It proves the red lines hold against the real combined view root.

### Step 5.1 — Full unit suite green

```bash
npm test
```
Expect all green except the **known unrelated** pre-existing failure on this branch: `5GAG smoke resource provenance manifest` in `test/annojoin-5gag-linked-smoke.test.js` (documented WIP, not touched by this work). No new failures.

### Step 5.2 — Real index-only rebuild

**Precondition:** index-only does **not** wipe `OUT_ROOT`, so a prior **full** build must already exist in `src/assets/generated/annojoin-atlas/` (the 126k per-case files plus a previous `index.json`). If the directory is empty, run a full `npm run build:annojoin-atlas` first (with the same env), or the detail pages will have no per-case assets. The whole directory is gitignored, so this is a local-only operation.

Run the fast rebuild against the local combined view root (machine paths):

```bash
FOLDBRIDGE_ANNOJOIN_ROOT="/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/fec_lss_rc3_release_20260623/local_stage/annojoin_three_table_json_20260625/view_roots/combined" \
FOLDBRIDGE_RMDB_ABC_LSS_ROOT="/Volumes/tianyi/foldbridgeAssessert/confidence注册表/RMDB_ABC_LSS" \
FOLDBRIDGE_RASP_D_LSS_ROOT="/Volumes/tianyi/foldbridgeAssessert/confidence注册表/RASP_D_LSS" \
FOLDBRIDGE_ANNOJOIN_ATLAS_VIEW_ID=combined \
FOLDBRIDGE_ANNOJOIN_ATLAS_ASSET_FAMILIES=RMDB2PDB,RASP2PDB \
npm run build:annojoin-atlas:index
```

This should finish in seconds (no per-case loop) and print the index-only skip notice.

### Step 5.3 — Assert red-line invariants on the written index

```bash
node -e '
const fs = require("fs");
const p = "src/assets/generated/annojoin-atlas/index.json";
const idx = JSON.parse(fs.readFileSync(p, "utf8"));
const bytes = fs.statSync(p).size;
console.log("displayCases", idx.displayCases.length);          // expect 3610
console.log("totalSourceCaseCount", idx.totalSourceCaseCount); // expect 4070
console.log("has cases key", "cases" in idx);                  // expect false
const fam = {};
for (const r of idx.displayCases) for (const f of (r.sourceFamilies||[])) fam[f] = (fam[f]||0)+1;
console.log("index.json MiB", (bytes/1024/1024).toFixed(2));   // expect ~10.7
const anyPreview = idx.displayCases.some((r) => "profilePreview" in r);
console.log("any profilePreview survived", anyPreview);        // expect false
'
```

Expected: `displayCases 3610`, `totalSourceCaseCount 4070`, `has cases key false`, `index.json MiB` ≈ `10.7`, `any profilePreview survived false`.

To confirm the family composition `{RMDB2PDB:666, merged:460, RASP2PDB:2484}` and that RASP is rendered `not active`, run the smoke verifier (it walks the written assets and resolves a sample of detail links — this exercises the post-slim, post-index-only assets):

```bash
npm run verify:annojoin-atlas
```

Expect `status: pass` (the 6 known pre-existing visual-preview "missing visual preview" notices are unchanged and unrelated, per project memory). Spot-check that a known governed case (e.g. `8XT0`) still resolves and its molecule display name is unchanged, and that no RASP row shows active positive confidence.

### Step 5.4 — Build the static site to confirm browser load path

```bash
npm run build:static
```
Optionally serve and click through: `npm run serve -- --port 8080`, open `#annojoin-atlas`, confirm the master table renders 3610 rows, the dual count reads `3610 PDB entries (4070 source cases)`, and a detail-page link (single and merged) opens correctly. Alternatively `npm run dev -- --port 5173` for the no-dist dev path.

No commit (generated assets are gitignored; this task only verifies).

---

## Red lines (spec §8 — must hold through every task)

1. **`displayCases` length stays 3610; `totalSourceCaseCount` stays 4070.** Slimming touches neither: it drops the `cases` array (a separate key) and per-row `profilePreview`/`profilePreviewIsComplete` only; `totalSourceCaseCount` is an independent scalar. Index-only changes no upstream computation. Asserted in Task 1 (`totalSourceCaseCount`/`totalCaseCount`/`displayCases.length` preserved), Task 3 spawn test, and Task 5.3.
2. **Molecule names never truncated.** This work removes no name fields and runs no truncation; `moleculeDisplayName`, `biologicalMoleculeName`, `pdbMoleculeName` are all preserved verbatim (Task 1 sample-row assertions).
3. **RASP never rendered as active positive confidence.** Confidence labels are computed upstream (L464-475 patch) and pass through unchanged; slimming and index-only never touch `confidenceDisplayLabel`. Verified by `verify:annojoin-atlas` in Task 5.3.
4. **Raw provenance (`biologicalMoleculeName`, `pdbMoleculeName`, all `*Source`) never overwritten.** Slimming only **drops browser-dead fields** (`cases`, `profilePreview`, `profilePreviewIsComplete`) and never edits a surviving value. Task 1 asserts `*Source` and raw name fields survive intact; the no-mutation test guarantees the in-memory object is unchanged.
5. **Generated assets stay deterministic.** No ordering or tie-break logic is added; slimming preserves array order and key order (object spread keeps insertion order, with `cases` simply absent). The index-only path produces a `generatedAt`-stripped `index.json` byte-identical to the full build (Task 3), proving determinism. Code-point tie-break in the existing folding logic is untouched.

## Out of scope (spec §7)

No change to per-case asset schema or the detail page; no change to master-table rendering, search scoring, grouping, or confidence; `caseHierarchy` kept; no new colors/fonts; no touch to first-page Pagefind (`src/search/`); no auto-detection of when a full rebuild is required (operator's judgment, per the skip notice).

