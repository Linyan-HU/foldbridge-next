import { deriveEntryStatsContract } from './statsDashboard.js';

export const DEFAULT_ASSET_BASE = './src/assets/generated/site-stats';
export const DEFAULT_ENTRY_TABLE_URL = './src/assets/generated/entry-table/entry-table.json';

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

async function fetchJson(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error(`${label} request failed: ${error.message}`);
  }
  if (!response?.ok) {
    throw new Error(`${label} HTTP ${response?.status ?? 'error'} at ${url}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error.message}`);
  }
}

function validateBundle(stats, entryTable) {
  requireObject(stats, 'stats asset');
  if (stats.schema_version !== 'site-stats.v2') {
    throw new Error(`stats asset schema is incompatible: ${stats.schema_version}`);
  }
  requireObject(stats.entry_contract, 'stats entry contract');
  requireObject(stats.entry_contract.metrics, 'stats entry contract metrics');
  requireObject(stats.entry_contract.distributions, 'stats entry contract distributions');
  requireObject(stats.metrics, 'stats metrics');
  requireObject(stats.distributions, 'stats distributions');
  for (const key of ['rna_chains', 'pdb_structures', 'chains_with_probing_profiles', 'pdbs_with_high_confidence_chain']) {
    if (stats.metrics[key] !== stats.entry_contract.metrics[key]) {
      throw new Error(`stats metrics do not match entry contract for ${key}`);
    }
  }
  for (const key of ['registered_technologies', 'explainer_articles']) {
    if (!Number.isInteger(stats.metrics[key]) || stats.metrics[key] < 0) {
      throw new Error(`stats metric ${key} must be a non-negative integer`);
    }
  }
  if (JSON.stringify(stats.distributions) !== JSON.stringify(stats.entry_contract.distributions)) {
    throw new Error('stats distributions do not match entry contract');
  }
  requireObject(entryTable, 'entry table asset');
  if (entryTable.schemaVersion !== 'entry-table.v1' || stats.entry_schema_version !== entryTable.schemaVersion) {
    throw new Error(`entry table schema does not match stats: ${entryTable.schemaVersion}`);
  }
  if (!Array.isArray(entryTable.rows)) throw new Error('entry table rows must be an array');
  if (!Number.isInteger(entryTable.rowCount) || entryTable.rowCount !== entryTable.rows.length) {
    throw new Error(`entry table rowCount must equal rows length (${entryTable.rows.length})`);
  }
  const currentContract = deriveEntryStatsContract(entryTable.rows);
  if (JSON.stringify(currentContract) !== JSON.stringify(stats.entry_contract)) {
    throw new Error('entry table contract does not match stats asset');
  }
  return { stats, rows: entryTable.rows };
}

export function createSiteStatsStore({
  assetBase = DEFAULT_ASSET_BASE,
  entryTableUrl = DEFAULT_ENTRY_TABLE_URL,
  fetchImpl
} = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  let cached;
  let pending;

  return {
    async loadDashboard() {
      if (cached !== undefined) return cached;
      if (pending) return pending;
      pending = Promise.all([
        fetchJson(doFetch, `${assetBase}/stats.json`, 'stats asset'),
        fetchJson(doFetch, entryTableUrl, 'entry table asset')
      ]).then(([stats, entryTable]) => {
        cached = validateBundle(stats, entryTable);
        return cached;
      }).finally(() => {
        pending = undefined;
      });
      return pending;
    },
    peek() {
      return cached;
    }
  };
}
