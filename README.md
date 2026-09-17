# FoldBridge Site

Static website for the FoldBridge RNA probing-to-structure demo. The site is plain ES modules under `src/`.

## Docker status

The historical Dockerfile still calls `npm run build` and `npm run serve`, but
their entry scripts are absent from the current `main` branch. Do not use the
Docker path for development or production release until the build toolchain is
restored in a separate, reviewed change.

## Local development

```bash
npm ci
npm test
```

The current `main` branch no longer contains several legacy entry scripts still
named in `package.json`, including `scripts/build.mjs`, `scripts/build-pages.mjs`,
and `scripts/verify-mvp.mjs`. Do not use `npm run build:pages` or
`npm run verify:mvp` as production acceptance until those scripts are restored in
a separate, reviewed change.

## Production release

Production GitHub Pages publishes directly from the repository root of
`ghhttps/main`. The checked-in `.github/workflows/pages.yml` workflow is disabled
and is not the production acceptance signal. Verify the remote SHA, native Pages
build, public URL, and browser behavior as described in the handbook below.

## Maintenance and release

Use [`docs/网站更新手册_DEPLOYMENT_HANDBOOK.md`](docs/网站更新手册_DEPLOYMENT_HANDBOOK.md)
as the canonical maintenance runbook. Unless a task explicitly names another
target, GitHub Pages work uses `ghhttps/main`; Case and training-data assets use
the separate Cloudflare Tunnel docroot documented there.

## Build outputs

Generated outputs are intentionally ignored:

- `dist/`
- `_site/`

Runtime data is kept in source control:

- `src/assets/data/`

ANNOJOIN Atlas assets under `src/assets/generated/annojoin-atlas/` are generated
from the stage package and can be large. The historical
`scripts/build-annojoin-atlas.mjs` entry is absent from current `main`; see
[`docs/annojoin-atlas-web-handoff-20260618.md`](docs/annojoin-atlas-web-handoff-20260618.md)
for the historical data-entry contract and verification gates.

## Included pages

- Home: project overview, bundled RNA database links, and visualization modules.
- Browse: search, facets, and result tables.
- Sequence / Structure / Probing: FoldBridge demo records and downloadable assets.
  Probing is a science hub: mechanism-family index, a 34-technology comparison
  table (family / targetable bases / threshold basis), a glossary, plus the
  carousel and in-depth article collection.
- About / Help: methodology and help page (the `help` route redirects here). Covers
  data sources (RMDB / RASP / PDB), how probing data is collected and aligned to PDB
  chains, how structure truth is computed (paired state from DBN, SASA via
  Shrake-Rupley with auth→label remap, spatial contacts), the ANNOJOIN build
  pipeline, how confidence is scored per (profile, pdb_id, chain) segment (the A–F
  measurement families, LSS, evaluability gates, permutation calibration, and the
  STRONG/MODERATE/WEAK/DISCORDANT/UNDERPOWERED/NOT_SUPPORTED tiers), threshold-honesty
  notes, key terms, and how to cite. Content is data-driven from
  `src/assets/data/about-content.json`.
- Stats: global overview with real, build-derived numbers and inline SVG charts
  (structure-linked records, source cases, confidence-tier distribution, and more).
- Search: Pagefind-backed full-site search with type/tag filters and saved queries.
- ANNOJOIN Atlas: ANNOCONFIDENCE / ANNOJOIN search, 1D/2D/3D evidence previews,
  mapped residue tables, confidence presets, conflicts, and current-filter
  downloads.

## Verification

`npm test` checks the available source-level contracts. The historical
`npm run verify:mvp` entry is currently unavailable because
`scripts/verify-mvp.mjs` is absent. Use the scoped checks and production
acceptance gates in the maintenance handbook.
