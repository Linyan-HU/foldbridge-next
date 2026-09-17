import assert from 'node:assert/strict';
import test from 'node:test';

import { createSiteStatsStore } from '../src/siteStatsStore.js';
import { deriveEntryStatsContract } from '../src/statsDashboard.js';

const ROWS = [
  { pdb_id: '1AAA', chain_key: 'A[A]', partition: 'rRNA', n_profiles: 3, entry_confidence_class: 'high', source_lanes: 'geo,rmdb' },
  { pdb_id: '2BBB', chain_key: 'A[A]', partition: 'tRNA', n_profiles: 0, entry_confidence_class: 'low', source_lanes: 'rmdb' }
];

function assets(rows = ROWS) {
  const entryContract = deriveEntryStatsContract(rows);
  return {
    stats: {
      schema_version: 'site-stats.v2',
      entry_schema_version: 'entry-table.v1',
      entry_contract: entryContract,
      metrics: { ...entryContract.metrics, registered_technologies: 2, explainer_articles: 2 },
      distributions: entryContract.distributions
    },
    entryTable: { schemaVersion: 'entry-table.v1', rowCount: rows.length, rows }
  };
}

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 404, json: async () => body };
}

test('loadDashboard fetches both assets once and caches the validated bundle', async () => {
  const data = assets();
  const calls = [];
  const store = createSiteStatsStore({
    fetchImpl: async (url) => {
      calls.push(url);
      return url.includes('entry-table') ? response(data.entryTable) : response(data.stats);
    }
  });
  assert.equal(typeof store.loadDashboard, 'function', 'loadDashboard should be exported by the store');

  const first = await store.loadDashboard();
  const second = await store.loadDashboard();
  assert.strictEqual(second, first);
  assert.equal(first.rows.length, 2);
  assert.deepEqual(calls, [
    './src/assets/generated/site-stats/stats.json',
    './src/assets/generated/entry-table/entry-table.json'
  ]);
});

test('loadDashboard rejects a stats HTTP failure with its source', async () => {
  const data = assets();
  const store = createSiteStatsStore({
    fetchImpl: async (url) => url.includes('entry-table') ? response(data.entryTable) : response({}, false)
  });
  assert.equal(typeof store.loadDashboard, 'function', 'loadDashboard should be exported by the store');
  await assert.rejects(store.loadDashboard(), /stats.*HTTP 404/i);
});

test('loadDashboard rejects incompatible schemas', async () => {
  const data = assets();
  data.stats.schema_version = 'site-stats.v1';
  const store = createSiteStatsStore({
    fetchImpl: async (url) => url.includes('entry-table') ? response(data.entryTable) : response(data.stats)
  });
  assert.equal(typeof store.loadDashboard, 'function', 'loadDashboard should be exported by the store');
  await assert.rejects(store.loadDashboard(), /stats.*schema/i);
});

test('loadDashboard rejects displayed metrics that drift from the validated entry contract', async () => {
  const data = assets();
  data.stats.metrics.pdb_structures = 99;
  const store = createSiteStatsStore({
    fetchImpl: async (url) => url.includes('entry-table') ? response(data.entryTable) : response(data.stats)
  });
  await assert.rejects(store.loadDashboard(), /stats metrics.*entry contract/i);
});

test('loadDashboard rejects missing registry-backed headline metrics', async () => {
  const data = assets();
  delete data.stats.metrics.registered_technologies;
  const store = createSiteStatsStore({
    fetchImpl: async (url) => url.includes('entry-table') ? response(data.entryTable) : response(data.stats)
  });
  await assert.rejects(store.loadDashboard(), /registered_technologies/i);
});

test('loadDashboard rejects mixed-version assets when a statistical field changes', async () => {
  const data = assets();
  data.entryTable.rows = data.entryTable.rows.map((row, index) => index === 0 ? { ...row, n_profiles: 0 } : row);
  const store = createSiteStatsStore({
    fetchImpl: async (url) => url.includes('entry-table') ? response(data.entryTable) : response(data.stats)
  });
  assert.equal(typeof store.loadDashboard, 'function', 'loadDashboard should be exported by the store');
  await assert.rejects(store.loadDashboard(), /entry table.*contract.*stats/i);
});

test('loadDashboard rejects malformed entry table row counts', async () => {
  const data = assets();
  data.entryTable.rowCount = 99;
  const store = createSiteStatsStore({
    fetchImpl: async (url) => url.includes('entry-table') ? response(data.entryTable) : response(data.stats)
  });
  assert.equal(typeof store.loadDashboard, 'function', 'loadDashboard should be exported by the store');
  await assert.rejects(store.loadDashboard(), /entry table.*rowCount/i);
});
