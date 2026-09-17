# FoldBridge Stats Dashboard Design

## Goal

Replace the stale, constant-backed Stats page with a small interactive dashboard inspired by the RiboCentre Aptamer dashboard, while preserving FoldBridge's current visual language and avoiding new runtime dependencies.

## Scope

- Keep the existing `#stats` route and site chrome.
- Replace the six stale metric cards with build-derived metrics.
- Add three lightweight, clickable distributions for RNA class, chain confidence, and source coverage.
- Add active-filter chips, a reset action, and a live “showing chains / PDB structures” summary.
- Keep detailed rows in the existing Entry page; do not duplicate a data table or export subsystem on Stats.
- Do not add Plotly, D3, a framework, a CDN asset, or a second dashboard bundle.

## Canonical data and metric grain

The build script reads and validates these published assets:

- `src/assets/generated/entry-table/entry-table.json`: canonical chain-grain rows and PDB identifiers.
- `src/assets/data/probe-technology-registry.json`: registered technology count and registry metadata.
- `src/assets/generated/probing-articles/index.json`: published explainer article count.

The headline metrics are:

1. RNA chains: number of canonical entry-table rows.
2. PDB structures: distinct `pdb_id` values.
3. Chains with probing profiles: rows with `n_profiles > 0`.
4. PDBs with ≥1 high-confidence chain: distinct PDBs whose strongest chain confidence is `high`.
5. Registered technologies: number of technology registry entries.
6. Explainer articles: article index count, cross-checked against the indexed article list.

Dashboard distributions use the chain grain so filters compose without hidden grain changes:

- RNA class: `partition`.
- Confidence: `entry_confidence_class`.
- Source coverage: membership in `source_lanes`; sources overlap and the UI says so.

Entry rows are normalized narrowly before aggregation:

- `source_lanes` is split on commas, trimmed, de-duplicated, and restricted to `geo`, `rasp`, and `rmdb`; an empty string means no source.
- The one allowed missing annotation is `partition === ''`, which maps to `Unclassified RNA`; non-string values still fail validation.
- Rows must be unique by the compound key `pdb_id + chain_key`.

## Interaction model

The browser loads the generated Stats summary plus the already-published entry-table asset. Clicking a value in any distribution toggles a single selection for that dimension. Selections across dimensions combine with AND logic. The three charts retain global baseline counts and update their selected state, while the current chain/PDB summary recomputes from filtered rows; the six headline cards remain global reference totals. Reset clears every selection. Keeping chart counts stable avoids misleading zero-value categories after selecting a value in that same chart.

Controls are native buttons with visible focus, `aria-pressed`, and text labels. Charts are HTML/CSS bars and segmented controls rather than a canvas dependency, so keyboard and screen-reader behavior remain direct.

## Visual adaptation

- Reuse existing FoldBridge typography, mustard/olive palette, borders, radii, spacing, and card shadows.
- Follow the Aptamer dashboard's information hierarchy: metric strip, filter controls, responsive chart grid, summary.
- Use two columns on wide screens and one column on narrow screens; RNA class spans the full width because it has more categories.
- Keep motion limited to existing hover/focus transitions and honor reduced-motion preferences.

## Data flow and failure behavior

`scripts/build-site-stats.mjs` derives every value from the three canonical assets and writes `src/assets/generated/site-stats/stats.json`. It validates schema shape, required fields, compound row uniqueness, row counts, allowed confidence and source values, registry uniqueness, and article counts. Missing or incompatible sources throw and fail the build; there are no numeric fallbacks.

The generated file carries `schema_version`, the source entry-table schema version, and a complete entry-derived contract: the four entry-backed headline metrics plus all three baseline distributions. The build script and browser share one pure contract-derivation function. At runtime, `siteStatsStore` fetches both generated Stats data and entry rows, derives the same contract from the fetched rows, and deep-compares it before exposing the bundle. This catches confidence, profile, class, and source changes even when row and PDB counts stay constant. A fetch, validation, or contract mismatch renders an explicit unavailable state with the failed source instead of retaining stale or mixed-version numbers.

## Verification

- Unit-test derivation, strongest-confidence PDB aggregation, source overlaps, and fail-closed validation.
- Unit-test filtering and AND composition independently of the DOM.
- Assert rendered controls, labels, accessibility state, reset behavior, and explicit error state.
- Run `node scripts/build-site-stats.mjs`, then the focused Node test files for derivation, filtering, storage, and rendering. This `main` Pages snapshot does not contain the `scripts/build.mjs` or `scripts/verify-mvp.mjs` files referenced by its legacy package scripts, so those commands are not acceptance criteria for this worktree.
- Inspect `#stats` in the local browser at desktop and narrow widths; click each chart and reset, and confirm the console is clean.
