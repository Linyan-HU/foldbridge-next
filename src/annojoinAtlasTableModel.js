const MISSING_LABELS = new Set(['', '未注释', 'not annotated', 'missing source']);

export const ANNOJOIN_TABLE_COLUMNS = [
  { id: 'moleculeName', label: 'Molecule name' },
  { id: 'pdbId', label: 'PDB' },
  { id: 'chains', label: 'Chains' },
  { id: 'profileCount', label: 'Probing profiles' },
  { id: 'techniqueFamilies', label: 'Probing category' }
];

function cleanLabel(value) {
  const label = String(value ?? '').trim();
  return MISSING_LABELS.has(label) ? '' : label;
}

export function groupSlug(label = '') {
  return cleanLabel(label)
    .replace(/[^0-9A-Za-z]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unlabeled';
}

export function rowCaseId(row = {}) {
  return String(row.caseId || row.pdbId || '').trim();
}

export function rowCaseKey(row = {}) {
  return String(row.atlasCaseKey || row.caseKey || row.caseId || row.pdbId || '').trim();
}

export function moleculeName(row = {}) {
  return cleanLabel(row.moleculeDisplayName) || cleanLabel(row.biologicalMoleculeName) || cleanLabel(row.pdbMoleculeName) || rowCaseId(row) || 'not annotated';
}

export function parentGroupLabel(row = {}) {
  return cleanLabel(row.moleculeDisplayName)
    || cleanLabel(row.biologicalMoleculeName)
    || cleanLabel(row.pdbMoleculeName)
    || rowCaseId(row)
    || 'Unlabeled';
}

export function childGroupLabel(row = {}) {
  return cleanLabel(row.moleculeDisplayName)
    || cleanLabel(row.moleculeDisplayName)
    || cleanLabel(row.biologicalMoleculeName)
    || cleanLabel(row.pdbMoleculeName)
    || parentGroupLabel(row);
}

export function primaryPlacement(row = {}) {
  const placements = Array.isArray(row.chainPlacements) ? row.chainPlacements : [];
  return placements[0] || { classLabel: '', nameLabel: '' };
}

export function sortAnnojointCases(cases = []) {
  return [...cases].sort((a, b) => {
    const pa = primaryPlacement(a);
    const pb = primaryPlacement(b);
    const values = [
      String(pa.classLabel).localeCompare(String(pb.classLabel)),
      String(pa.nameLabel).localeCompare(String(pb.nameLabel)),
      String(a.pdbId || a.caseId || '').localeCompare(String(b.pdbId || b.caseId || '')),
      rowCaseKey(a).localeCompare(rowCaseKey(b))
    ];
    return values.find((value) => value !== 0) || 0;
  });
}

function placementsFor(row = {}) {
  const placements = Array.isArray(row.chainPlacements) ? row.chainPlacements : [];
  if (!placements.length) return [{ classLabel: 'Unclassified RNA', nameLabel: moleculeName(row) }];
  return placements;
}

export function buildAnnojointTableGroups(cases = []) {
  const parentMap = new Map();
  for (const row of cases) {
    for (const placement of placementsFor(row)) {
      const parentLabel = String(placement.classLabel || 'Unclassified RNA');
      const childLabel = String(placement.nameLabel || parentLabel);
      const parentId = groupSlug(parentLabel);
      const childId = `${parentId}::${groupSlug(childLabel)}`;
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, { id: parentId, label: parentLabel, count: 0, children: new Map() });
      }
      const parent = parentMap.get(parentId);
      if (!parent.children.has(childId)) {
        parent.children.set(childId, { id: childId, parentId, label: childLabel, count: 0, rows: [] });
      }
      const child = parent.children.get(childId);
      child.rows.push(row);
      child.count += 1;
      parent.count += 1;
    }
  }
  return [...parentMap.values()].map((parent) => ({
    ...parent,
    children: [...parent.children.values()]
  }));
}

export function paginateAnnojointRows(rows = [], { page = 1, pageSize = 50 } = {}) {
  const normalizedPageSize = Math.max(1, Number(pageSize) || 50);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const pageRows = rows.slice(startIndex, startIndex + normalizedPageSize);
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    pageCount,
    total,
    start: total ? startIndex + 1 : 0,
    end: startIndex + pageRows.length,
    rows: pageRows
  };
}

function foldText(value) {
  return String(value ?? '').trim().toLowerCase();
}

// 匹配度：4=PDB 精确, 3=PDB 前缀, 2=molecule 子串, 1=PDB 子串, 0=无
export function scoreAnnojointMatch(row = {}, query = '') {
  const q = foldText(query);
  if (!q) return 0;
  const pdb = foldText(row.pdbId || row.caseId);
  const mol = foldText(moleculeName(row));
  if (pdb && pdb === q) return 4;
  if (pdb && pdb.startsWith(q)) return 3;
  if (mol && mol.includes(q)) return 2;
  if (pdb && pdb.includes(q)) return 1;
  return 0;
}

export function searchAnnojointRows(rows = [], query = '') {
  const q = foldText(query);
  if (!q) return [...rows];
  return rows
    .map((row, index) => ({ row, index, score: scoreAnnojointMatch(row, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.row);
}

export function isAnnojointSearchActive(query = '') {
  return foldText(query).length > 0;
}

// family 激活态默认：RMDB 激活、RASP 未激活（positive_confidence_active_now=false）。
// 将来 RASP 激活后，传入 activationOverride={ RASP2PDB: true } 即可翻转，无需改渲染。
const FAMILY_BADGE_LABELS = { RMDB2PDB: 'RMDB', RASP2PDB: 'RASP' };
const DEFAULT_FAMILY_ACTIVATION = { RMDB2PDB: true, RASP2PDB: false };

export function familyBadgeDescriptor(family = '', activationOverride = {}) {
  const key = String(family || '').trim();
  const label = FAMILY_BADGE_LABELS[key] || key || 'unknown';
  const active = key in activationOverride
    ? Boolean(activationOverride[key])
    : Boolean(DEFAULT_FAMILY_ACTIVATION[key]);
  return { family: key, label, active, note: active ? '' : 'not active' };
}

export function annojoinExportRow(row = {}) {
  const out = {
    case_id: row.caseId,
    pdb_id: row.pdbId,
    chain_class_labels: (row.chainPlacements || []).map((p) => p.classLabel).join(';'),
    chain_name_labels: (row.chainPlacements || []).map((p) => p.nameLabel).join(';'),
    biological_molecule_name: row.biologicalMoleculeName,
    pdb_molecule_name: row.pdbMoleculeName,
    confidence_display_label: row.confidenceDisplayLabel,
    profile_count: row.profileCount,
    assay_family_set: (row.assayFamilies || []).join(';'),
    pdb_chain_ids: (row.chains || []).join(';'),
    conflict_candidate_count: row.conflictCandidateCount
  };
  if (row.atlasCaseKey) out.atlas_case_key = row.atlasCaseKey;
  if (row.assetFamily) out.asset_family = row.assetFamily;
  if (Array.isArray(row.sourceFamilies) && row.sourceFamilies.length) out.source_families = row.sourceFamilies.join(';');
  if (Array.isArray(row.sourceCaseKeys) && row.sourceCaseKeys.length) out.source_case_keys = row.sourceCaseKeys.join(';');
  return out;
}
