import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildEntryRowsWithTechniqueEvidence,
  filterEntryRowsByTechniqueSelection,
  mergeEntryTechniqueEvidence,
  normalizeEntryRows
} from '../src/entryTable.js';
import { renderEntryTablePage } from '../src/entryTableView.js';
import {
  buildMechanismFilterModel,
  buildTechniqueClassifierRegistry,
  buildTechniqueTaxonomySnapshot,
  classifyTechniqueFilter
} from '../src/techniqueFilterModel.js';

const entryRows = [
  { pdbId: '1DMS', auth: 'A', probingCategory: 'dms-based-probing' },
  { pdbId: '1SHP', auth: 'A', probingCategory: 'shape-based-probing' },
  { pdbId: '1CLV', auth: 'A', probingCategory: 'cleavage-footprinting' }
];

const evidenceRows = [
  { pdbId: '1DMS', chains: ['A'], techniqueFamilies: ['dms-based-probing'], techniqueNames: ['DMS', 'DMS-seq'] },
  { pdbId: '1SHP', chains: ['A'], techniqueFamilies: ['shape-based-probing'], techniqueNames: ['SHAPE', 'SHAPE-MaP'] },
  { pdbId: '1CLV', chains: ['A'], techniqueFamilies: ['cleavage-footprinting'], techniqueNames: ['Lead-seq', 'PARS'] }
];

test('shared classifier owns tokenization, aliases, canonical labels, and category order', () => {
  const result = classifyTechniqueFilter('MCA;mutate-and-map;structureseq;CIRS-seq');
  assert.deepEqual(result.methods, [
    { label: 'MOHCA', mappingStatus: 'mapped', categoryId: 'interaction', categoryLabel: 'RNA–RNA interaction mapping methods', categoryShortLabel: 'RNA–RNA interaction' },
    { label: 'Mutate-and-map methods', mappingStatus: 'mapped', categoryId: 'interaction', categoryLabel: 'RNA–RNA interaction mapping methods', categoryShortLabel: 'RNA–RNA interaction' },
    { label: 'Structure-seq', mappingStatus: 'mapped', categoryId: 'dms', categoryLabel: 'DMS-based methods', categoryShortLabel: 'DMS' },
    { label: 'CIRS-seq', mappingStatus: 'unmapped', categoryId: null, categoryLabel: null, categoryShortLabel: null },
  ]);
  assert.deepEqual(result.categoryIds, ['dms', 'interaction']);
  assert.equal(result.classificationStatus, 'partially_mapped');
});

test('shared classifier leaves missing/background policy to callers', () => {
  const result = classifyTechniqueFilter('');
  assert.deepEqual(result, {
    methods: [],
    categoryIds: [],
    classificationStatus: 'empty'
  });
  assert.equal('background' in result, false);
  assert.equal('missing' in result, false);
  assert.equal(classifyTechniqueFilter('CIRS-seq').classificationStatus, 'unmapped');
});

test('shared classifier deduplicates aliases and canonical tokens by canonical method', () => {
  const result = classifyTechniqueFilter('MCA,MOHCA;MAP;mutate-and-map;Mutate-and-map methods');
  assert.deepEqual(result.methods.map((method) => method.label), ['MOHCA', 'Mutate-and-map methods']);
  assert.deepEqual(result.categoryIds, ['interaction']);
  assert.equal(result.classificationStatus, 'mapped');
});

test('shared classifier deduplicates unmapped methods only by their trimmed label', () => {
  const result = classifyTechniqueFilter('CIRS-seq;CIRS seq;CIRS-seq');
  assert.deepEqual(result.methods.map((method) => method.label), ['CIRS-seq', 'CIRS seq']);
  assert.deepEqual(result.methods.map((method) => method.mappingStatus), ['unmapped', 'unmapped']);
});

test('technique taxonomy snapshot is stable and fully serializable', () => {
  const snapshot = buildTechniqueTaxonomySnapshot();
  assert.equal(snapshot.taxonomyVersion, 'entry-technique-taxonomy.v1');
  assert.equal(snapshot.tokenSeparator, '[;,]');
  assert.deepEqual(snapshot.families, [
    {
      id: 'dms',
      label: 'DMS-based methods',
      shortLabel: 'DMS',
      techniques: ['DMS', 'DMS-seq', 'Structure-seq', 'Structure-seq2', 'Mod-seq', 'DMS-MaPseq', 'DIM-2P-seq', 'tNet-MaPseq'],
      filterTechniques: ['DMS', 'DMS-seq', 'Structure-seq', 'Structure-seq2', 'Mod-seq', 'DMS-MaPseq', 'DIM-2P-seq']
    },
    {
      id: 'shape',
      label: 'SHAPE-based methods',
      shortLabel: 'SHAPE',
      techniques: ['SHAPE', 'SHAPE-Seq', 'SHAPE-MaP', '1M7', 'BzCN', '2A3', 'NAI-MaP', 'icSHAPE', 'icSHAPE-MaP', 'smartSHAPE', 'ChemModSeq', 'Cotranscriptional_SHAPE-seq', 'Nuc-SHAPE-Structure-Seq'],
      filterTechniques: ['SHAPE', 'SHAPE-Seq', 'SHAPE-MaP', 'icSHAPE', 'icSHAPE-MaP', 'NAI-MaP', 'smartSHAPE']
    },
    {
      id: 'cleavage',
      label: 'Cleavage-based methods',
      shortLabel: 'Cleavage',
      techniques: ['PARS', 'PARTE', 'HRF-seq', 'Lead-seq', 'RL-Seq', 'tNet-RNase-seq'],
      filterTechniques: ['PARS', 'PARTE', 'HRF-seq']
    },
    {
      id: 'nucleotide',
      label: 'Nucleotide-specific chemical probing methods',
      shortLabel: 'Nucleotide-specific',
      techniques: ['Keth-seq', 'EDC probing', 'LASER-seq', 'icLASER'],
      filterTechniques: ['Keth-seq', 'EDC probing', 'LASER-seq']
    },
    {
      id: 'interaction',
      label: 'RNA–RNA interaction mapping methods',
      shortLabel: 'RNA–RNA interaction',
      techniques: ['PARIS', 'SPLASH', 'LIGR-seq', 'MARIO', 'RIC-seq', 'COMRADES', 'MOHCA', 'Mutate-and-map methods'],
      filterTechniques: ['PARIS', 'SPLASH', 'LIGR-seq', 'MARIO', 'RIC-seq', 'COMRADES', 'MOHCA', 'Mutate-and-map methods']
    }
  ]);
  assert.deepEqual(snapshot.aliases, [
    { normalizedToken: 'structureseq', canonicalLabel: 'Structure-seq' },
    { normalizedToken: 'cotranscriptionalshapeseq', canonicalLabel: 'SHAPE-Seq' },
    { normalizedToken: 'nucshapestructureseq', canonicalLabel: 'SHAPE-Seq' },
    { normalizedToken: 'iclaser', canonicalLabel: 'LASER-seq' },
    { normalizedToken: 'map', canonicalLabel: 'Mutate-and-map methods' },
    { normalizedToken: 'mca', canonicalLabel: 'MOHCA' },
    { normalizedToken: 'mutateandmap', canonicalLabel: 'Mutate-and-map methods' }
  ]);
  assert.deepEqual(snapshot.canonicalTechniques[0], {
    normalizedToken: 'dms',
    label: 'DMS',
    categoryId: 'dms',
    categoryLabel: 'DMS-based methods',
    categoryShortLabel: 'DMS'
  });
  assert.deepEqual(snapshot.canonicalTechniques.find((technique) => technique.normalizedToken === 'iclaser'), {
    normalizedToken: 'iclaser',
    label: 'LASER-seq',
    categoryId: 'nucleotide',
    categoryLabel: 'Nucleotide-specific chemical probing methods',
    categoryShortLabel: 'Nucleotide-specific'
  });
  assert.equal(snapshot.canonicalTechniques.length,
    snapshot.families.reduce((count, family) => count + family.techniques.length, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test('snapshot canonical techniques and aliases match runtime single-token classification', () => {
  const snapshot = buildTechniqueTaxonomySnapshot();
  const normalized = (label) => String(label).toLowerCase().replace(/[^a-z0-9]+/g, '');

  for (const canonical of snapshot.canonicalTechniques) {
    const method = classifyTechniqueFilter(canonical.label).methods[0];
    assert.deepEqual(method, {
      label: canonical.label,
      mappingStatus: 'mapped',
      categoryId: canonical.categoryId,
      categoryLabel: canonical.categoryLabel,
      categoryShortLabel: canonical.categoryShortLabel
    });
  }

  for (const alias of snapshot.aliases) {
    const targets = snapshot.canonicalTechniques.filter((canonical) =>
      canonical.normalizedToken === normalized(alias.canonicalLabel));
    assert.equal(targets.length, 1, `${alias.canonicalLabel} must have one canonical target`);
    const method = classifyTechniqueFilter(alias.normalizedToken).methods[0];
    assert.deepEqual(method, {
      label: alias.canonicalLabel,
      mappingStatus: 'mapped',
      categoryId: targets[0].categoryId,
      categoryLabel: targets[0].categoryLabel,
      categoryShortLabel: targets[0].categoryShortLabel
    });
  }
});

test('registry builder fails loudly for invalid families, missing alias targets, and token conflicts', () => {
  const families = [
    { id: 'one', label: 'One methods', shortLabel: 'One', techniques: ['Alpha'], filterTechniques: ['Alpha'] },
    { id: 'two', label: 'Two methods', shortLabel: 'Two', techniques: ['Beta'], filterTechniques: ['Beta'] }
  ];

  assert.throws(
    () => buildTechniqueClassifierRegistry({ families: [{ ...families[0], id: '' }], aliases: {} }),
    /invalid family id/i
  );
  assert.throws(
    () => buildTechniqueClassifierRegistry({ families, aliases: { ghost: 'Missing' } }),
    /alias target.*does not exist/i
  );
  assert.throws(
    () => buildTechniqueClassifierRegistry({ families, aliases: { alpha: 'Beta' } }),
    /conflicting technique registration/i
  );
  assert.throws(
    () => buildTechniqueClassifierRegistry({
      families,
      aliases: { 'same-token': 'Alpha', sametoken: 'Beta' }
    }),
    /conflicting alias normalized token/i
  );
});

test('Entry renders the original five-family filter with detailed techniques', () => {
  const model = buildMechanismFilterModel();
  const techniqueCount = model.families.reduce((sum, family) => sum + family.techniques.length, 0);
  const html = renderEntryTablePage({
    rows: entryRows,
    techniqueSelection: {
      families: new Set(['cleavage']),
      techniques: new Set(['PARS'])
    }
  });

  assert.equal((html.match(/data-technique-family=/g) || []).length, 5);
  assert.equal((html.match(/data-technique-name=/g) || []).length, techniqueCount);
  for (const family of model.families) {
    assert.match(html, new RegExp(family.label));
    for (const technique of family.techniques) assert.match(html, new RegExp(`>${technique}<`));
  }
  assert.match(html, /data-technique-family="cleavage" checked/);
  assert.match(html, /data-technique-name="PARS" checked/);
});

test('Entry reuses original family and detailed-technique OR filtering', () => {
  const rows = mergeEntryTechniqueEvidence(entryRows, evidenceRows);

  assert.deepEqual(
    filterEntryRowsByTechniqueSelection(rows, { families: new Set(['dms']), techniques: new Set() }).map((row) => row.pdbId),
    ['1DMS']
  );
  assert.deepEqual(
    filterEntryRowsByTechniqueSelection(rows, { families: new Set(), techniques: new Set(['SHAPE-MaP']) }).map((row) => row.pdbId),
    ['1SHP']
  );
  assert.deepEqual(
    filterEntryRowsByTechniqueSelection(rows, { families: new Set(['dms']), techniques: new Set(['PARS']) }).map((row) => row.pdbId),
    ['1DMS', '1CLV']
  );
});

test('Entry technique evidence join fails on missing, duplicate, or extra chain rows', () => {
  assert.throws(
    () => mergeEntryTechniqueEvidence(entryRows, evidenceRows.slice(0, 2)),
    /missing technique evidence/i
  );
  assert.throws(
    () => mergeEntryTechniqueEvidence(entryRows, [...evidenceRows, evidenceRows[0]]),
    /duplicate technique evidence/i
  );
  assert.throws(
    () => mergeEntryTechniqueEvidence(entryRows, [...evidenceRows, { pdbId: '9EXT', chains: ['A'], techniqueFamilies: [], techniqueNames: [] }]),
    /unexpected technique evidence/i
  );
});

test('Entry production asset contract rejects empty or synchronously truncated inventories', () => {
  assert.throws(
    () => buildEntryRowsWithTechniqueEvidence(
      { schemaVersion: 'entry-table.v1', rowCount: 0, rows: [] },
      { schemaVersion: 'annojoin-atlas.v2', totalCaseCount: 0, totalSourceCaseCount: 0, displayCases: [] }
    ),
    /17,843/
  );
  assert.throws(
    () => buildEntryRowsWithTechniqueEvidence(
      { schemaVersion: 'entry-table.v1', rowCount: 1, rows: [{ pdb_id: '1DMS', auth: 'A' }] },
      { schemaVersion: 'annojoin-atlas.v2', totalCaseCount: 1, totalSourceCaseCount: 1, displayCases: [evidenceRows[0]] }
    ),
    /17,843/
  );
});

test('published Entry and ANNOJOIN assets satisfy the strict 17,843-row contract', () => {
  const entryPayload = JSON.parse(fs.readFileSync('src/assets/generated/entry-table/entry-table.json', 'utf8'));
  const atlasIndex = JSON.parse(fs.readFileSync('src/assets/generated/annojoin-atlas/index.json', 'utf8'));
  assert.equal(buildEntryRowsWithTechniqueEvidence(entryPayload, atlasIndex).length, 17843);
});

// 现网路径：normalizeEntryRows 直接从 entry-table.json 的 tech_filter 派生 techniqueNames/
// techniqueFamilies，两级 filter（filterEntryRowsByTechniqueSelection）在其上工作。这是
// 线上真实数据链，与上面的 evidence-join 路径无关。
test('normalizeEntryRows derives technique families/names from tech_filter', () => {
  const rows = normalizeEntryRows({
    schemaVersion: 'entry-table.v1',
    rows: [
      { pdb_id: '1MIX', auth: 'A', tech_filter: 'DMS;SHAPE;PARS;MCA;mutate-and-map;CIRS-seq' },
      { pdb_id: '1EMP', auth: 'B', tech_filter: '' }
    ]
  });
  // MOHCA / Mutate-and-map 归 interaction；CIRS-seq 不入五类（保留在 names，不进 families）。
  assert.deepEqual(rows[0].techniqueNames,
    ['DMS', 'SHAPE', 'PARS', 'MOHCA', 'Mutate-and-map methods', 'CIRS-seq']);
  assert.deepEqual([...rows[0].techniqueFamilies].sort(),
    ['cleavage', 'dms', 'interaction', 'shape']);
  assert.deepEqual(rows[1].techniqueNames, []);
  assert.deepEqual(rows[1].techniqueFamilies, []);
});

test('two-level filter over tech_filter-derived rows (family + detail OR)', () => {
  const rows = normalizeEntryRows({
    schemaVersion: 'entry-table.v1',
    rows: [
      { pdb_id: '1DMS', auth: 'A', tech_filter: 'DMS;DMS-seq' },
      { pdb_id: '1SHP', auth: 'A', tech_filter: 'SHAPE;SHAPE-MaP' },
      { pdb_id: '1CLV', auth: 'A', tech_filter: 'Lead-seq;PARS' },
      { pdb_id: '1INT', auth: 'A', tech_filter: 'MOHCA;Mutate-and-map methods' },
      { pdb_id: '1OFF', auth: 'A', tech_filter: 'CIRS-seq;Glyoxal;Terbium' }
    ]
  });
  assert.deepEqual(
    filterEntryRowsByTechniqueSelection(rows, { families: new Set(['dms']), techniques: new Set() }).map((r) => r.pdbId),
    ['1DMS']
  );
  // MOHCA/Mutate-and-map 归 interaction。
  assert.deepEqual(
    filterEntryRowsByTechniqueSelection(rows, { families: new Set(['interaction']), techniques: new Set() }).map((r) => r.pdbId),
    ['1INT']
  );
  // 只在五类之外的行不被任一 family 命中（但空筛选时仍全量展示）。
  assert.deepEqual(
    filterEntryRowsByTechniqueSelection(rows, { families: new Set(['dms', 'shape', 'cleavage', 'nucleotide', 'interaction']), techniques: new Set() }).map((r) => r.pdbId),
    ['1DMS', '1SHP', '1CLV', '1INT']
  );
  assert.equal(filterEntryRowsByTechniqueSelection(rows, {}).length, 5);
});

// 行链接：PDB → RCSB 结构页外链（新窗口）；Molecule(sciName) → 站内 case 详情页。
const LINK_ROW = { pdbId: '7SYS', auth: 'z', sciName: 'E. coli 16S rRNA', partition: 'rRNA', nProfiles: 3, techFilter: 'SHAPE;DMS' };

test('PDB cell links to RCSB structure page in a new tab', () => {
  const html = renderEntryTablePage({ rows: [LINK_ROW] });
  assert.match(html, /href="https:\/\/www\.rcsb\.org\/structure\/7SYS"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
});

test('Molecule cell links to the in-app case detail page', () => {
  const html = renderEntryTablePage({ rows: [LINK_ROW] });
  assert.match(html, /href="#entry-case\?pdb=7SYS&amp;chain=z"[^>]*>E\. coli 16S rRNA<\/a>/);
});

test('missing PDB degrades Molecule link to plain text but keeps RCSB link', () => {
  const html = renderEntryTablePage({ rows: [LINK_ROW], missingPdbs: ['7SYS'] });
  assert.match(html, /href="https:\/\/www\.rcsb\.org\/structure\/7SYS"/);
  assert.ok(!html.includes('#entry-case?pdb=7SYS'));
  assert.match(html, />E\. coli 16S rRNA</);
});
