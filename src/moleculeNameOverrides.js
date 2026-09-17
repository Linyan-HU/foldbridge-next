const MOLECULE_NAME_OVERRIDES = Object.freeze({
  'PDB:2L1V': 'preQ₁ riboswitch aptamer domain (36 nt)',
  'RMDB2PDB:2L1V': 'preQ₁ riboswitch aptamer domain (36 nt)'
});

function value(input) {
  return String(input ?? '').trim();
}

export function moleculeDisplayNameOverride(caseInfo = {}) {
  const assetFamily = value(caseInfo.assetFamily || caseInfo.asset_family);
  const pdbId = value(caseInfo.pdbId || caseInfo.pdb_id || caseInfo.caseId || caseInfo.case_id);
  const atlasCaseKey = value(caseInfo.atlasCaseKey || caseInfo.atlas_case_key);
  return MOLECULE_NAME_OVERRIDES[atlasCaseKey]
    || MOLECULE_NAME_OVERRIDES[assetFamily && pdbId ? `${assetFamily}:${pdbId}` : '']
    || MOLECULE_NAME_OVERRIDES[pdbId ? `PDB:${pdbId}` : '']
    || '';
}

export function displayMoleculeName(caseInfo = {}, fallback = '') {
  return moleculeDisplayNameOverride(caseInfo) || value(caseInfo.moleculeDisplayName) || value(fallback);
}
