function text(value) {
  return String(value ?? '').trim();
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[,;]/).map(text).filter(Boolean);
}

export function buildEntryExport(rows = [], { generatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Entry export rows must be an array');
  return {
    schema_version: 'foldbridge-entry-export.v1',
    generated_at: generatedAt,
    row_count: rows.length,
    rows: rows.map((row) => ({
      entry: {
        pdb_id: text(row.pdbId),
        chain: text(row.auth),
        molecule: text(row.sciName),
        rna_class: text(row.partition),
        technique: text(row.probingCategory),
        profiles: Number(row.nProfiles) || 0,
        confidence: text(row.confidenceClass),
        source: text(row.sourceLanes),
      },
      profile_meta: {
        profile_count: Number(row.nProfiles) || 0,
        chain_key: text(row.chainKey),
        technique_names: stringList(row.techniqueNames),
        technique_families: stringList(row.techniqueFamilies),
        source_databases: stringList(row.sourceLanes),
        has_geo: text(row.hasGeo).toLowerCase() === 'yes',
      },
    })),
  };
}
