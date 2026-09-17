import { RMDB2PDB_AB_V3_PAGES_MANIFEST } from './assets/generated/rmdb2pdb_ab_v3_pages_manifest.js';

const BUILT_CASE_KEYS = new Set(RMDB2PDB_AB_V3_PAGES_MANIFEST.builtCaseKeys || []);

function encodeCaseKey(caseKey = '') {
  return encodeURIComponent(String(caseKey || '').trim());
}

function normalizeRmdbCaseKey({ atlasCaseKey = '', assetFamily = '', caseUid = '', caseId = '', pdbId = '' } = {}) {
  const normalizedCaseKey = String(atlasCaseKey || '').trim();
  if (normalizedCaseKey.startsWith('RMDB2PDB:')) return normalizedCaseKey;
  const normalizedCaseUid = String(caseUid || '').trim();
  if (normalizedCaseUid.startsWith('RMDB2PDB|')) {
    const [, suffix = ''] = normalizedCaseUid.split('|', 2);
    return suffix ? `RMDB2PDB:${String(suffix).trim().toUpperCase()}` : normalizedCaseKey;
  }
  if (String(assetFamily || '').trim() !== 'RMDB2PDB') return normalizedCaseKey;
  const suffix = String(caseId || pdbId || '').trim().toUpperCase();
  return suffix ? `RMDB2PDB:${suffix}` : normalizedCaseKey;
}

export function resolveRmdb2pdbAbV3DetailHref(input = '') {
  const normalizedCaseKey = typeof input === 'string'
    ? normalizeRmdbCaseKey({ atlasCaseKey: input })
    : normalizeRmdbCaseKey(input);
  if (!normalizedCaseKey.startsWith('RMDB2PDB:')) return '';
  if (!BUILT_CASE_KEYS.has(normalizedCaseKey)) return '';
  const baseHref = String(RMDB2PDB_AB_V3_PAGES_MANIFEST.baseHref || '').replace(/\/$/, '');
  if (!baseHref) return '';
  return `${baseHref}/cases/${encodeCaseKey(normalizedCaseKey)}/index.html`;
}

export function hasRmdb2pdbAbV3DetailPage(atlasCaseKey = '') {
  return Boolean(resolveRmdb2pdbAbV3DetailHref(atlasCaseKey));
}
