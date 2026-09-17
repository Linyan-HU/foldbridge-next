// entry 浏览入口表：纯数据/纯函数层（无 DOM、无 fetch）。
// 读 build-entry-table.py 产出的 entry-table.json（pdb_id x chain 粒度），
// 归一化为视图行，并拼指向静态 case 页 cases/<PDB>/index.html?chain=<auth> 的跳转链接。

import { classifyTechniqueFilter, matchesTechniqueFilter } from './techniqueFilterModel.js';

// 展示列顺序（源自论文 Fig 2C：molecule / PDB / chain / profiles / technique /
// confidence / class / source）。锁死列序。
export const ENTRY_TABLE_COLUMNS = [
  { id: 'pdbId', label: 'PDB' },
  { id: 'auth', label: 'Chain' },
  { id: 'sciName', label: 'Molecule' },
  { id: 'partition', label: 'RNA class' },
  { id: 'probingCategory', label: 'Technique' },
  { id: 'nProfiles', label: 'Profiles' },
  { id: 'confidenceClass', label: 'Confidence' },
  { id: 'sourceLanes', label: 'Source' }
];

function text(value) {
  return String(value ?? '').trim();
}

const ENTRY_TABLE_SCHEMA_VERSION = 'entry-table.v1';
const ANNOJOIN_ATLAS_SCHEMA_VERSION = 'annojoin-atlas.v2';
const EXPECTED_ENTRY_ROW_COUNT = 17843;

function entryRowKey(row = {}) {
  return `${text(row.pdbId)}\t${text(row.auth)}`;
}

function evidenceRowKey(row = {}, index = 0) {
  const pdbId = text(row.pdbId);
  if (!pdbId || !Array.isArray(row.chains) || row.chains.length !== 1 || !text(row.chains[0])) {
    throw new Error(`Invalid Entry technique evidence row at index ${index}`);
  }
  if (!Array.isArray(row.techniqueFamilies) || !Array.isArray(row.techniqueNames)) {
    throw new Error(`Invalid Entry technique evidence fields for ${pdbId}`);
  }
  return `${pdbId}\t${text(row.chains[0])}`;
}

export function mergeEntryTechniqueEvidence(rows = [], evidenceRows = []) {
  const entryKeys = new Set();
  for (const row of rows) {
    const key = entryRowKey(row);
    if (entryKeys.has(key)) throw new Error(`Duplicate Entry row: ${key}`);
    entryKeys.add(key);
  }

  const evidenceByKey = new Map();
  evidenceRows.forEach((evidence, index) => {
    const key = evidenceRowKey(evidence, index);
    if (evidenceByKey.has(key)) throw new Error(`Duplicate technique evidence: ${key}`);
    if (!entryKeys.has(key)) throw new Error(`Unexpected technique evidence: ${key}`);
    evidenceByKey.set(key, evidence);
  });

  return rows.map((row) => {
    const key = entryRowKey(row);
    const evidence = evidenceByKey.get(key);
    if (!evidence) throw new Error(`Missing technique evidence: ${key}`);
    return {
      ...row,
      techniqueFamilies: [...evidence.techniqueFamilies],
      techniqueNames: [...evidence.techniqueNames]
    };
  });
}

export function buildEntryRowsWithTechniqueEvidence(entryPayload, atlasIndex) {
  if (entryPayload?.schemaVersion !== ENTRY_TABLE_SCHEMA_VERSION) {
    throw new Error(`Entry table schema must be ${ENTRY_TABLE_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(entryPayload.rows)
      || entryPayload.rowCount !== EXPECTED_ENTRY_ROW_COUNT
      || entryPayload.rows.length !== EXPECTED_ENTRY_ROW_COUNT) {
    throw new Error('Entry table must contain exactly 17,843 rows');
  }
  if (atlasIndex?.schemaVersion !== ANNOJOIN_ATLAS_SCHEMA_VERSION) {
    throw new Error(`ANNOJOIN atlas schema must be ${ANNOJOIN_ATLAS_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(atlasIndex.displayCases)
      || atlasIndex.totalCaseCount !== EXPECTED_ENTRY_ROW_COUNT
      || atlasIndex.totalSourceCaseCount !== EXPECTED_ENTRY_ROW_COUNT
      || atlasIndex.displayCases.length !== EXPECTED_ENTRY_ROW_COUNT) {
    throw new Error('ANNOJOIN atlas must contain exactly 17,843 Entry cases');
  }
  return mergeEntryTechniqueEvidence(normalizeEntryRows(entryPayload), atlasIndex.displayCases);
}

export function filterEntryRowsByTechniqueSelection(rows = [], selection = {}) {
  const filters = {
    families: selection.families instanceof Set ? selection.families : new Set(selection.families || []),
    techniques: selection.techniques instanceof Set ? selection.techniques : new Set(selection.techniques || [])
  };
  return rows.filter((row) => matchesTechniqueFilter(row, filters));
}

export function normalizeEntryRows(payload) {
  const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
  return rows.map((row) => {
    const techFilter = text(row.tech_filter);
    const classified = classifyTechniqueFilter(techFilter);
    const techniqueNames = classified.methods.map((method) => method.label);
    const techniqueFamilies = classified.categoryIds;
    return {
      pdbId: text(row.pdb_id),
      auth: text(row.auth),
      chainKey: text(row.chain_key),
      sciName: text(row.sci_name),
      partition: text(row.partition),
      nProfiles: Number(row.n_profiles) || 0,
      confidenceClass: text(row.entry_confidence_class),
      probingCategory: text(row.probing_category),
      techFilter,
      techniqueNames,
      techniqueFamilies,
      sourceLanes: text(row.source_lanes),
      hasGeo: text(row.has_geo),
      hasEfE: row.has_ef_e === true,
      hasEfF: row.has_ef_f === true,
      // 空 profile 降级：该链所有 profile 在目标链窗口内全空（全 NaN 源 / 信号落在
      // BLAST 对齐窗口外）。据此视图层置灰整行 + 详情链接降级为纯文本（进去也看不到反应强度）。
      // 判定源=LIVE case shard 扫描，见 scripts/annotate-entry-table-empty-profiles.py。
      emptyProfiles: row.empty_profiles === true,
      emptyProfileType: text(row.empty_profile_type)
    };
  });
}

// entry 行 → 静态 case 页链接。PDB 进路径段（对齐 render shell 输出 cases/<PDB>/），
// chain(auth) 作 query（对齐 bundle chains/<auth>）。pdb 或 auth 缺失 → 空串（不可跳）。
// 详情页链接现挂在 Molecule(sciName) 列；缺页由 missingPdbs 降级为纯文本。
export function entryCaseHref(base, row, family = null) {
  const pdb = text(row && row.pdbId);
  const chain = text(row && row.auth);
  if (!pdb || !chain) return '';
  const fam = family === 'E' || family === 'F' ? `&family=${family}` : '';
  return `#entry-case?pdb=${encodeURIComponent(pdb)}&chain=${encodeURIComponent(chain)}${fam}`;
}

// entry 行 → E/F 2D 热图 case 链接。按产物存在性(has_ef_e/has_ef_f，由
// annotate-entry-table-ef.py 依线上产物集写入)决定给哪些链接，非按 tech_filter 文本，
// 后者会造大量死链。E=MOHCA，F=M2(Mutate-and-map/MAPseq)。
export function entryEfLinks(base, row) {
  const out = [];
  if (row && row.hasEfE) out.push({ family: 'E', label: 'MOHCA', href: entryCaseHref(base, row, 'E') });
  if (row && row.hasEfF) out.push({ family: 'F', label: 'M2', href: entryCaseHref(base, row, 'F') });
  return out;
}

// PDB 列外链：指向 RCSB 该结构的具体页面。RCSB 对任何有效 PDB 均有页面，
// 故此链接永不缺页（无需 missingPdbs 降级）。pdb 缺失 → 空串（纯文本）。
export function rcsbStructureHref(row) {
  const pdb = text(row && row.pdbId);
  if (!pdb) return '';
  return `https://www.rcsb.org/structure/${encodeURIComponent(pdb)}`;
}

// 稳定 slug：小写、非字母数字折成单个连字符、去首尾连字符。用于折叠分组的稳定 id。
export function entryGroupSlug(label = '') {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'na';
}

// 两层折叠分组：外层 partition(RNA class)，内层 sciName(分子名)。
// chain 行全保留、不漏行、不改行内容——只是把已有归一化行按现有字段包进分组结构。
// 空 partition → 'Unclassified RNA'；空 sciName → 回退到 partition label。
// 排序：parent/child 按 label 升序，组内行按 pdbId→auth 升序（稳定、确定，避免部署 churn）。
export function buildEntryTableGroups(rows = []) {
  const parentMap = new Map();
  for (const row of rows) {
    const parentLabel = text(row.partition) || 'Unclassified RNA';
    const childLabel = text(row.sciName) || parentLabel;
    const parentId = entryGroupSlug(parentLabel);
    const childId = `${parentId}::${entryGroupSlug(childLabel)}`;
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

  const byLabel = (a, b) => String(a.label).localeCompare(String(b.label));
  const byRow = (a, b) =>
    String(a.pdbId).localeCompare(String(b.pdbId)) || String(a.auth).localeCompare(String(b.auth));

  return [...parentMap.values()]
    .sort(byLabel)
    .map((parent) => ({
      ...parent,
      children: [...parent.children.values()]
        .sort(byLabel)
        .map((child) => ({ ...child, rows: [...child.rows].sort(byRow) }))
    }));
}
