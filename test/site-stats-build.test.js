import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveStats } from '../scripts/build-site-stats.mjs';

function fixtures() {
  return {
    entryTable: {
      schemaVersion: 'entry-table.v1',
      rowCount: 4,
      rows: [
        { pdb_id: '1AAA', chain_key: 'A[A]', partition: 'rRNA', n_profiles: 3, entry_confidence_class: 'high', source_lanes: 'geo, rmdb, geo' },
        { pdb_id: '1AAA', chain_key: 'B[B]', partition: 'rRNA', n_profiles: 0, entry_confidence_class: 'low', source_lanes: 'rmdb' },
        { pdb_id: '2BBB', chain_key: 'A[A]', partition: '', n_profiles: 2, entry_confidence_class: 'not_supported', source_lanes: 'geo,rasp' },
        { pdb_id: '3CCC', chain_key: 'A[A]', partition: 'tRNA', n_profiles: 0, entry_confidence_class: 'low', source_lanes: '' }
      ]
    },
    technologyRegistry: {
      schema_version: 'probe-tech-registry.v1',
      technologies: [
        { technology: 'DMS', family: 'A' },
        { technology: 'SHAPE', family: 'B' }
      ]
    },
    articleIndex: {
      schema_version: 'probing-articles.v1',
      article_count: 2,
      articles: [
        { slug: 'dms', title: 'DMS' },
        { slug: 'shape', title: 'SHAPE' }
      ]
    }
  };
}

test('deriveStats builds every public metric from canonical assets', () => {
  const data = fixtures();
  const stats = deriveStats(data);

  assert.equal(stats.schema_version, 'site-stats.v2');
  assert.equal(stats.entry_schema_version, 'entry-table.v1');
  assert.deepEqual(stats.metrics, {
    rna_chains: 4,
    pdb_structures: 3,
    chains_with_probing_profiles: 2,
    pdbs_with_high_confidence_chain: 1,
    registered_technologies: 2,
    explainer_articles: 2
  });
  assert.deepEqual(stats.distributions, {
    rna_class: { rRNA: 2, tRNA: 1, 'Unclassified RNA': 1 },
    chain_confidence: { high: 1, low: 2, not_supported: 1 },
    source_coverage: { rmdb: 2, geo: 2, rasp: 1 }
  });
  assert.deepEqual(stats.entry_contract, {
    metrics: {
      rna_chains: 4,
      pdb_structures: 3,
      chains_with_probing_profiles: 2,
      pdbs_with_high_confidence_chain: 1
    },
    distributions: {
      rna_class: { rRNA: 2, tRNA: 1, 'Unclassified RNA': 1 },
      chain_confidence: { high: 1, low: 2, not_supported: 1 },
      source_coverage: { rmdb: 2, geo: 2, rasp: 1 }
    }
  });
});

test('deriveStats rejects duplicate PDB and chain compound keys', () => {
  const data = fixtures();
  data.entryTable.rows[1].chain_key = 'A[A]';
  assert.throws(() => deriveStats(data), /duplicate.*pdb_id.*chain_key/i);
});

test('deriveStats rejects unknown source lanes instead of coercing them', () => {
  const data = fixtures();
  data.entryTable.rows[0].source_lanes = 'rmdb, mystery';
  assert.throws(() => deriveStats(data), /source_lanes.*mystery/i);
});

test('deriveStats rejects invalid confidence values', () => {
  const data = fixtures();
  data.entryTable.rows[0].entry_confidence_class = 'medium';
  assert.throws(() => deriveStats(data), /entry_confidence_class.*medium/i);
});

test('deriveStats rejects padded canonical identifiers and confidence values', () => {
  const paddedConfidence = fixtures();
  paddedConfidence.entryTable.rows[0].entry_confidence_class = ' high ';
  assert.throws(() => deriveStats(paddedConfidence), /entry_confidence_class.*whitespace/i);

  const paddedPdb = fixtures();
  paddedPdb.entryTable.rows[0].pdb_id = ' 1AAA';
  assert.throws(() => deriveStats(paddedPdb), /pdb_id.*whitespace/i);
});

test('deriveStats rejects duplicate technology names', () => {
  const data = fixtures();
  data.technologyRegistry.technologies[1].technology = 'DMS';
  assert.throws(() => deriveStats(data), /duplicate.*technology/i);
});

test('deriveStats rejects article_count drift', () => {
  const data = fixtures();
  data.articleIndex.article_count = 3;
  assert.throws(() => deriveStats(data), /article_count.*articles/i);
});
