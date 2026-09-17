const CONFIDENCE_VALUES = ['high', 'low', 'not_supported'];
const SOURCE_VALUES = ['rmdb', 'geo', 'rasp'];

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireString(value, label, { allowEmpty = false, trim = false } = {}) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }
  if (!trim && value !== value.trim()) {
    throw new Error(`${label} must not contain surrounding whitespace`);
  }
  const normalized = trim ? value.trim() : value;
  if (!allowEmpty && !normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

export function normalizeStatsEntryRow(row, index = 0) {
  requireObject(row, `entry row ${index}`);
  const pdbId = requireString(row.pdb_id, `entry row ${index} pdb_id`);
  const chainKey = requireString(row.chain_key, `entry row ${index} chain_key`);
  const partitionValue = requireString(row.partition, `entry row ${index} partition`, { allowEmpty: true });
  const confidence = requireString(row.entry_confidence_class, `entry row ${index} entry_confidence_class`);
  if (!CONFIDENCE_VALUES.includes(confidence)) {
    throw new Error(`entry row ${index} entry_confidence_class has unsupported value: ${confidence}`);
  }
  if (!Number.isInteger(row.n_profiles) || row.n_profiles < 0) {
    throw new Error(`entry row ${index} n_profiles must be a non-negative integer`);
  }
  const sourceText = requireString(row.source_lanes, `entry row ${index} source_lanes`, { allowEmpty: true, trim: true });
  const sourceLanes = [...new Set(sourceText.split(',').map((value) => value.trim()).filter(Boolean))];
  for (const source of sourceLanes) {
    if (!SOURCE_VALUES.includes(source)) {
      throw new Error(`entry row ${index} source_lanes has unsupported value: ${source}`);
    }
  }
  return {
    pdb_id: pdbId,
    chain_key: chainKey,
    partition: partitionValue || 'Unclassified RNA',
    n_profiles: row.n_profiles,
    entry_confidence_class: confidence,
    source_lanes: sourceLanes
  };
}

function sortedCountObject(counts) {
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
  );
}

export function deriveEntryStatsContract(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('entry table rows must be a non-empty array');
  }

  const seenRows = new Set();
  const pdbIds = new Set();
  const highConfidencePdbIds = new Set();
  const rnaClassCounts = new Map();
  const confidenceCounts = { high: 0, low: 0, not_supported: 0 };
  const sourceCounts = { rmdb: 0, geo: 0, rasp: 0 };
  let chainsWithProfiles = 0;

  rows.forEach((rawRow, index) => {
    const row = normalizeStatsEntryRow(rawRow, index);
    const rowKey = `${row.pdb_id}\u0000${row.chain_key}`;
    if (seenRows.has(rowKey)) {
      throw new Error(`duplicate pdb_id + chain_key row: ${row.pdb_id} ${row.chain_key}`);
    }
    seenRows.add(rowKey);
    pdbIds.add(row.pdb_id);
    if (row.n_profiles > 0) chainsWithProfiles += 1;
    if (row.entry_confidence_class === 'high') highConfidencePdbIds.add(row.pdb_id);
    confidenceCounts[row.entry_confidence_class] += 1;
    rnaClassCounts.set(row.partition, (rnaClassCounts.get(row.partition) || 0) + 1);
    row.source_lanes.forEach((source) => { sourceCounts[source] += 1; });
  });

  return {
    metrics: {
      rna_chains: rows.length,
      pdb_structures: pdbIds.size,
      chains_with_probing_profiles: chainsWithProfiles,
      pdbs_with_high_confidence_chain: highConfidencePdbIds.size
    },
    distributions: {
      rna_class: sortedCountObject(rnaClassCounts),
      chain_confidence: confidenceCounts,
      source_coverage: sourceCounts
    }
  };
}

export function emptyStatsFilters() {
  return { rna_class: null, source: null };
}

export function clearStatsFilters() {
  return emptyStatsFilters();
}

const FILTER_DIMENSIONS = ['rna_class', 'source'];

function validateFilterValue(dimension, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${dimension} filter value must be a non-empty string`);
  }
  const normalized = value.trim();
  if (dimension === 'source' && !SOURCE_VALUES.includes(normalized)) {
    throw new Error(`source filter has unsupported value: ${normalized}`);
  }
  return normalized;
}

function validateStatsFilters(filters) {
  requireObject(filters, 'stats filters');
  for (const key of Object.keys(filters)) {
    if (!FILTER_DIMENSIONS.includes(key)) throw new Error(`unknown stats filter dimension: ${key}`);
  }
  const validated = emptyStatsFilters();
  FILTER_DIMENSIONS.forEach((dimension) => {
    if (filters[dimension] != null) validated[dimension] = validateFilterValue(dimension, filters[dimension]);
  });
  return validated;
}

export function toggleStatsFilter(filters, dimension, value) {
  const current = validateStatsFilters(filters);
  if (!FILTER_DIMENSIONS.includes(dimension)) {
    throw new Error(`unknown stats filter dimension: ${dimension}`);
  }
  const normalized = validateFilterValue(dimension, value);
  return {
    ...current,
    [dimension]: current[dimension] === normalized ? null : normalized
  };
}

export function filterStatsRows(rows, filters = emptyStatsFilters()) {
  if (!Array.isArray(rows)) throw new Error('stats rows must be an array');
  const validatedFilters = validateStatsFilters(filters);
  return rows
    .map((row, index) => normalizeStatsEntryRow(row, index))
    .filter((row) => {
      if (validatedFilters.rna_class && row.partition !== validatedFilters.rna_class) return false;
      if (validatedFilters.source && !row.source_lanes.includes(validatedFilters.source)) return false;
      return true;
    });
}

export function summarizeStatsFacet(rows, filters = emptyStatsFilters(), dimension) {
  const validatedFilters = validateStatsFilters(filters);
  if (!FILTER_DIMENSIONS.includes(dimension)) {
    throw new Error(`unknown stats filter dimension: ${dimension}`);
  }

  const contextRows = filterStatsRows(rows, { ...validatedFilters, [dimension]: null });
  const counts = new Map();
  contextRows.forEach((row) => {
    if (dimension === 'rna_class') {
      counts.set(row.partition, (counts.get(row.partition) || 0) + 1);
      return;
    }
    row.source_lanes.forEach((source) => {
      counts.set(source, (counts.get(source) || 0) + 1);
    });
  });

  return {
    total_chains: contextRows.length,
    distribution: sortedCountObject(counts)
  };
}

export function summarizeStatsRows(rows, filters = emptyStatsFilters()) {
  const filtered = filterStatsRows(rows, filters);
  return {
    chain_count: filtered.length,
    pdb_count: new Set(filtered.map((row) => row.pdb_id)).size
  };
}
