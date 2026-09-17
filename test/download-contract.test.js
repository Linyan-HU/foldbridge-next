import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { buildEntryExport } from '../src/downloadExport.js';
import { buildCaseProfileDownloadItems } from '../public/entry-cases/__entry_v3_site__/workbench-pure.mjs';
import { renderEntryTablePage } from '../src/entryTableView.js';

test('Entry export contains the filtered table rows and matching profile metadata', () => {
  const payload = buildEntryExport([
    {
      pdbId: '1ABC',
      auth: 'A',
      chainKey: 'A[A]',
      sciName: 'example RNA',
      partition: 'rRNA',
      probingCategory: 'shape-based-probing',
      nProfiles: 2,
      confidenceClass: 'high',
      sourceLanes: 'geo,rmdb',
      hasGeo: 'yes',
      techniqueNames: ['SHAPE', 'SHAPE-MaP'],
      techniqueFamilies: ['shape'],
    },
  ], { generatedAt: '2026-08-25T12:00:00.000Z' });

  assert.deepEqual(payload, {
    schema_version: 'foldbridge-entry-export.v1',
    generated_at: '2026-08-25T12:00:00.000Z',
    row_count: 1,
    rows: [{
      entry: {
        pdb_id: '1ABC',
        chain: 'A',
        molecule: 'example RNA',
        rna_class: 'rRNA',
        technique: 'shape-based-probing',
        profiles: 2,
        confidence: 'high',
        source: 'geo,rmdb',
      },
      profile_meta: {
        profile_count: 2,
        chain_key: 'A[A]',
        technique_names: ['SHAPE', 'SHAPE-MaP'],
        technique_families: ['shape'],
        source_databases: ['geo', 'rmdb'],
        has_geo: true,
      },
    }],
  });
});

test('Case profiles expose the compressed index, values, and metadata as direct downloads', () => {
  const profileIndex = {
    profile_count: 26088,
    profiles: [],
    shards: {
      '000001': { gzip_path: 'profiles/shards/000001.f32.bin.gz', meta_path: 'profiles/shards/000001.meta.json.gz' },
      '000000': { gzip_path: 'profiles/shards/000000.f32.bin.gz', meta_path: 'profiles/shards/000000.meta.json.gz' },
    },
  };
  assert.deepEqual(buildCaseProfileDownloadItems(profileIndex, './profiles/profile-index.json.gz'), [
    { kind: 'index', label: 'Profile index', href: './profiles/profile-index.json.gz', filename: 'profile-index.json.gz' },
    { kind: 'values', label: 'Profile values 000000', href: 'profiles/shards/000000.f32.bin.gz', filename: '000000.f32.bin.gz' },
    { kind: 'meta', label: 'Profile metadata 000000', href: 'profiles/shards/000000.meta.json.gz', filename: '000000.meta.json.gz' },
    { kind: 'values', label: 'Profile values 000001', href: 'profiles/shards/000001.f32.bin.gz', filename: '000001.f32.bin.gz' },
    { kind: 'meta', label: 'Profile metadata 000001', href: 'profiles/shards/000001.meta.json.gz', filename: '000001.meta.json.gz' },
  ]);
});

test('Entry page exposes one native Export link and no row-selection export controls', () => {
  const html = renderEntryTablePage({ rows: [{ pdbId: '1ABC', auth: 'A' }] });
  assert.match(html, /<a[^>]+id="export-entry"[^>]+download/);
  assert.equal((html.match(/>Export</g) || []).length, 1);
  assert.doesNotMatch(html, /data-entry-select|export-selected-entry|clear-selected-entry/);
});

test('Case shell exposes only alignment mmCIF and profiles download links', () => {
  const shell = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  assert.match(shell, /Download alignment mmCIF/);
  assert.match(shell, /Download profiles/);
  assert.doesNotMatch(shell, /Download entry|Download profile"|Download 3D structure/);
  assert.doesNotMatch(shell, /annojoin:download-profile|annojoin:download-3d/);
});

test('Case download messages are bound to the active case and chain without a load-reset race', () => {
  const shell = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const workbench = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/workbench.js', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math };
  vm.runInNewContext(shell, context);
  const { matchesCaseDownloadMessage } = context.module.exports;

  assert.equal(matchesCaseDownloadMessage({ caseId: '10FZ', chainId: 'A' }, '10FZ', 'A'), true);
  assert.equal(matchesCaseDownloadMessage({ caseId: '10FZ', chainId: 'B' }, '10FZ', 'A'), false);
  assert.equal(matchesCaseDownloadMessage({ caseId: '11AA', chainId: 'A' }, '10FZ', 'A'), false);
  assert.equal(matchesCaseDownloadMessage({}, '10FZ', 'A'), false);

  const loadHandler = shell.match(/frame\?\.addEventListener\("load",[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.doesNotMatch(loadHandler, /resetCaseDownloadActions/);
  assert.match(workbench, /foldbridge-case-download-ready", kind, caseId, chainId/);
});

test('legacy download and export controls are absent outside Entry and Case', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const atlasView = readFileSync(new URL('../src/annojoinAtlasView.js', import.meta.url), 'utf8');
  const modules = readFileSync(new URL('../src/modules.js', import.meta.url), 'utf8');

  for (const legacyId of [
    'download-selected-rdat',
    'export-selected-sequences',
    'export-all-sequences',
    'download-entry-catalog',
    'download-structure-catalog',
    'download-structure-files',
    'download-data-manifest',
    'home-dashboard-export',
  ]) {
    assert.ok(!main.includes(legacyId), `legacy control remains: ${legacyId}`);
  }
  assert.doesNotMatch(main, /Download RDAT|Download XLS/);
  assert.doesNotMatch(atlasView, /Export Selected|Export All Results|\/api\/annojoin\/export-current-filter/);
  assert.doesNotMatch(atlasView, /select-all-annojoin-cases|clear-selected-annojoin-cases|annojoin-case-select|selected<\/span>/);
  assert.doesNotMatch(modules, /id="exportData"|aptamer_filtered_data\.csv/);
});

test('Download page links the primary archives and every GEO series in the current atlas', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const expectedGeoSeries = [
    'GSE22393', 'GSE45803', 'GSE54106', 'GSE67667', 'GSE97609', 'GSE103421',
    'GSE110516', 'GSE111962', 'GSE118309', 'GSE118387', 'GSE122286', 'GSE132099',
    'GSE140048', 'GSE146952', 'GSE149767', 'GSE151327', 'GSE154171', 'GSE158052',
    'GSE189259', 'GSE226865', 'GSE239954', 'GSE246246', 'GSE250290', 'GSE254361',
    'GSE255779', 'GSE255783', 'GSE262014', 'GSE262888', 'GSE266263', 'GSE266872',
    'GSE270001', 'GSE271825', 'GSE278422', 'GSE285333', 'GSE285334', 'GSE286293',
    'GSE288618', 'GSE302505', 'GSE310313', 'GSE331520', 'GSE338022',
  ];
  const declaredSeries = main.match(/const DOWNLOAD_GEO_SERIES = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const actualGeoSeries = [...declaredSeries.matchAll(/'GSE\d+'/g)].map(([value]) => value.slice(1, -1));

  assert.doesNotMatch(main, /Figshare archive link will be added here/);
  assert.match(main, /https:\/\/rmdb\.stanford\.edu\/about\/#download-all-data/);
  assert.match(main, /https:\/\/rasp2\.zhanglab\.net\/download\//);
  assert.deepEqual(actualGeoSeries, expectedGeoSeries);
  assert.match(main, /https:\/\/www\.ncbi\.nlm\.nih\.gov\/geo\/query\/acc\.cgi\?acc=\$\{encodeURIComponent\(accession\)\}/);
  assert.doesNotMatch(main, /function bindDownloadPageControls/);
});

test('Download page exposes the public processed training registries and the PDB CIF catalogue', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const section = main.match(/<section class="download-center-section download-center-section--training">([\s\S]*?)<\/section>/)?.[1] || '';

  assert.match(section, /<h2>Processed data<\/h2>/);
  assert.match(section, /href="https:\/\/foldbridge\.sunhao\.uk\/training-data\/alignment\/"/);
  assert.match(section, /href="https:\/\/foldbridge\.sunhao\.uk\/training-data\/profiles\/"/);
  assert.match(section, /href="https:\/\/foldbridge\.sunhao\.uk\/training-data\/reactivity\/"/);
  assert.match(section, /href="#pdb-downloads">PDB<\/a>/);
  assert.match(section, /Profiles[\s\S]*?PDB[\s\S]*?Reactivity registration[\s\S]*?Alignment/);
  assert.match(section, />Alignment<\/a>/);
  assert.match(section, />Profiles<\/a>/);
  assert.match(section, />Reactivity registration<\/a>/);
  assert.doesNotMatch(section, /quality|threshold|tier|schema|version|hash|manifest|processing|conversion/i);
});

test('PDB CIF catalogue uses the current Entry PDB list and sends downloads directly to RCSB', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const router = readFileSync(new URL('../src/router.js', import.meta.url), 'utf8');

  assert.match(router, /'pdb-downloads'/);
  assert.match(main, /function renderPdbDownloadsPage\(\)/);
  assert.match(main, /getPdbDownloadRecords\(entryTableState\)/);
  assert.match(main, /https:\/\/files\.rcsb\.org\/download\/\$\{encodeURIComponent\(record\.pdbId\)\}\.cif/);
  assert.match(main, /PDB_DOWNLOAD_PAGE_SIZE = 48/);
});
