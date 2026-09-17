import { LOCAL_PAGES_PUBLISHED_CASE_KEYS } from './assets/generated/published_case_keys.js';

const PUBLISHED_CASE_KEYS = new Set(LOCAL_PAGES_PUBLISHED_CASE_KEYS || []);

function encodeCaseKey(caseKey = '') {
  // Case directories on disk are named with a literal percent-encoded colon
  // (e.g. `RASP2PDB%3A10FZ`). A static file server decodes the URL once, so the
  // href must be double-encoded for the request to resolve to that literal name.
  const trimmed = String(caseKey || '').trim();
  return encodeURIComponent(encodeURIComponent(trimmed));
}

function normalizeCaseKey({ atlasCaseKey = '', assetFamily = '', caseUid = '', caseId = '', pdbId = '' } = {}) {
  const normalizedCaseKey = String(atlasCaseKey || '').trim();
  if (normalizedCaseKey.startsWith('RMDB2PDB:') || normalizedCaseKey.startsWith('RASP2PDB:')) {
    return normalizedCaseKey;
  }
  const normalizedCaseUid = String(caseUid || '').trim();
  if (normalizedCaseUid.startsWith('RMDB2PDB|')) {
    const [, suffix = ''] = normalizedCaseUid.split('|', 2);
    return suffix ? `RMDB2PDB:${String(suffix).trim().toUpperCase()}` : normalizedCaseKey;
  }
  const normalizedAssetFamily = String(assetFamily || '').trim();
  if (!['RMDB2PDB', 'RASP2PDB'].includes(normalizedAssetFamily)) return normalizedCaseKey;
  const suffix = String(caseId || pdbId || '').trim().toUpperCase();
  return suffix ? `${normalizedAssetFamily}:${suffix}` : normalizedCaseKey;
}

function universeDir(caseKey = '') {
  if (String(caseKey).startsWith('RMDB2PDB:')) return 'rmdb-v3';
  if (String(caseKey).startsWith('RASP2PDB:')) return 'rasp-v3';
  return '';
}

export function resolveLocalPagesBridgeDetailHref(input = '') {
  const normalizedCaseKey = typeof input === 'string'
    ? normalizeCaseKey({ atlasCaseKey: input })
    : normalizeCaseKey(input);
  const dir = universeDir(normalizedCaseKey);
  if (!dir) return '';
  if (!PUBLISHED_CASE_KEYS.has(normalizedCaseKey)) return '';
  return `public/${dir}/cases/${encodeCaseKey(normalizedCaseKey)}/index.html`;
}

export function hasLocalPagesBridgeDetailPage(atlasCaseKey = '') {
  return Boolean(resolveLocalPagesBridgeDetailHref(atlasCaseKey));
}
