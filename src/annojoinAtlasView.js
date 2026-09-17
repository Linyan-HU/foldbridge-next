import {
  ANNOJOIN_TABLE_COLUMNS,
  buildAnnojointTableGroups,
  isAnnojointSearchActive,
  moleculeName,
  rowCaseId,
  rowCaseKey,
  searchAnnojointRows,
  sortAnnojointCases
} from './annojoinAtlasTableModel.js';
import { resolveLocalPagesBridgeDetailHref } from './localPagesBridgeLinks.js';
import {
  buildMechanismFilterModel,
  mechanismFamiliesForRow,
  MECHANISM_FAMILIES
} from './techniqueFilterModel.js';

const DEFAULT_GROUP_ROW_LIMIT = 5;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function atlasHref(routeName = 'annojoin-atlas', params = {}) {
  const route = routeName || 'annojoin-atlas';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return `#${route}${suffix ? `?${suffix}` : ''}`;
}

function detailPageHref(detail = {}) {
  const { atlasCaseKey = '', caseId = '' } = detail;
  const bridgeHref = resolveLocalPagesBridgeDetailHref(detail);
  if (bridgeHref) return bridgeHref;
  return atlasHref('annojoin-case', caseId && atlasCaseKey ? { caseId, caseKey: atlasCaseKey } : { caseId });
}

// 字段点击链接必须保留当前表格的过滤/分页状态，否则点击会把已过滤的表重置为全量。
function buildPreservedParams(filters = {}, page = 1) {
  const preserved = {};
  if (filters.query) preserved.q = filters.query;
  if (Number(page) > 1) preserved.page = String(page);
  if (filters.rnaFamily) preserved.rnaFamily = filters.rnaFamily;
  // technique filters are array-valued; not preserved on field-click links (see Task 13).
  // atlasHref serializes preserved via URLSearchParams.set(String(v)), which cannot
  // represent multi-valued params, so pushing arrays here would corrupt the link.
  if (filters.pdbId) preserved.pdbId = filters.pdbId;
  if (filters.motif) preserved.motif = filters.motif;
  if (filters.structureClass) preserved.structureClass = filters.structureClass;
  return preserved;
}

function sourceTitle(source = '') {
  return source ? ` title="${escapeHtml(source)}"` : '';
}

function sourceValue(value = '', source = '') {
  return `<span${sourceTitle(source)}>${escapeHtml(value || 'not annotated')}</span>`;
}

function profileValue(row = {}) {
  const count = Number(row.profileCount) || 0;
  return `${count} ${count === 1 ? 'profile' : 'profiles'}`;
}

// confidence 复合标签分段呈现且不截断；完整原文保留在 title，便于追溯与对比。
function renderConfidenceSegments(label = '') {
  const full = String(label ?? '');
  if (!full.trim()) {
    return `<span class="annojoin-confidence" title="not annotated"><span class="annojoin-confidence-seg">not annotated</span></span>`;
  }
  const parts = full.includes(';') ? full.split(';') : [full];
  const segs = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => `<span class="annojoin-confidence-seg">${escapeHtml(part)}</span>`)
    .join('');
  return `<span class="annojoin-confidence" title="${escapeHtml(full)}">${segs || `<span class="annojoin-confidence-seg">${escapeHtml(full)}</span>`}</span>`;
}

function renderTechniqueBadges(row) {
  const families = mechanismFamiliesForRow(row)
    .map((id) => MECHANISM_FAMILIES.find((family) => family.id === id))
    .filter(Boolean);
  if (!families.length) return '<span class="annojoin-technique-empty">—</span>';
  const names = (row.techniqueNames || []).join(' · ');
  const badges = families
    .map((family) => `<span class="annojoin-family-badge annojoin-family-badge-${escapeHtml(family.id)}">${escapeHtml(family.shortLabel)}</span>`)
    .join('');
  return `<span class="annojoin-technique-badges" title="${escapeHtml(names)}">${badges}</span>`;
}

function columnValue(row = {}, columnId, routeName = 'annojoin-atlas', groupLabels = [], preserved = {}) {
  const caseId = rowCaseId(row);
  const moleculeHref = detailPageHref({
    caseId,
    atlasCaseKey: rowCaseKey(row),
    assetFamily: row.assetFamily,
    caseUid: row.caseUid,
    pdbId: row.pdbId || caseId
  });
  const pdbId = String(row.pdbId || caseId || '').trim();
  const pdbHref = `https://www.rcsb.org/structure/${encodeURIComponent(pdbId)}`;
  const values = {
    pdbId: `<a class="annojoin-pdb-link" href="${escapeHtml(pdbHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pdbId)}</a>`,
    moleculeName: `<a class="annojoin-field-link annojoin-molecule-detail-link" href="${escapeHtml(moleculeHref)}">${sourceValue(moleculeName(row), row.biologicalMoleculeNameSource || row.pdbMoleculeNameSource)}</a>`,
    confidenceDisplayLabel: renderConfidenceSegments(row.confidenceDisplayLabel || row.fecClaimCeilingDistribution),
    profileCount: `<span title="profile_count; profile preview, not a representative profile">${escapeHtml(profileValue(row))}</span>`,
    chains: escapeHtml((row.chains || []).join(', ') || 'not annotated'),
    techniqueFamilies: renderTechniqueBadges(row)
  };
  return values[columnId] ?? escapeHtml(row[columnId] || '');
}

function renderCaseRow({ row, visibleColumns, routeName, rowClass = '', groupLabels = [], preserved = {} }) {
  const caseKey = rowCaseKey(row);
  const pdbId = String(row.pdbId || row.caseId || '').trim();
  return `<tr class="annojoin-case-row${rowClass ? ` ${rowClass}` : ''}" data-annojoin-case-row="${escapeHtml(caseKey)}" data-pdb-id="${escapeHtml(pdbId)}">
      ${visibleColumns.map((column) => `<td>${columnValue(row, column.id, routeName, groupLabels, preserved)}</td>`).join('')}
    </tr>`;
}

function renderFlatRows({ rows, visibleColumns, routeName, preserved = {} }) {
  if (!rows.length) return '';
  return rows.map((row) => renderCaseRow({ row, visibleColumns, routeName, preserved })).join('');
}

function renderTableBody({
  groups,
  visibleColumns,
  expandedGroupIds,
  uncappedGroupIds,
  routeName,
  preserved = {},
  groupRowLimit = DEFAULT_GROUP_ROW_LIMIT
}) {
  if (!groups.length) {
    return `<tr><td colspan="${visibleColumns.length}">No ANNOJOIN cases match the current filters.</td></tr>`;
  }
  const rows = [];
  const renderRow = (row, rowClass = '', groupLabels = []) => renderCaseRow({ row, visibleColumns, routeName, rowClass, groupLabels, preserved });
  const renderExpandedRows = (caseRows = [], groupToggleId, groupLabels = []) => {
    const isUncapped = uncappedGroupIds.has(groupToggleId);
    const visibleRows = isUncapped ? caseRows : caseRows.slice(0, groupRowLimit);
    for (const row of visibleRows) {
      rows.push(renderRow(row, 'is-in-expanded-group', groupLabels));
    }
    if (caseRows.length > groupRowLimit) {
      rows.push(`<tr class="annojoin-group-overflow-row">
        <td colspan="${visibleColumns.length}">
          <button type="button" class="download-outline-btn" data-annojoin-group-page-toggle="${escapeHtml(groupToggleId)}">${isUncapped ? 'Show less' : 'Show all in group'}</button>
          <span>${isUncapped ? `Showing all ${escapeHtml(caseRows.length)} cases in this group` : `Showing ${escapeHtml(groupRowLimit)} of ${escapeHtml(caseRows.length)} cases in this group`}</span>
        </td>
      </tr>`);
    }
  };
  for (const parent of groups) {
    if (parent.count <= 1) {
      parent.children.forEach((child) => child.rows.forEach((row) => rows.push(renderRow(row))));
      continue;
    }
    const parentToggleId = `parent:${parent.id}`;
    const parentExpanded = expandedGroupIds.has(parentToggleId);
    rows.push(`<tr class="annojoin-parent-group-row${parentExpanded ? ' is-expanded-group' : ''}" data-annojoin-parent-group="${escapeHtml(parent.id)}" data-annojoin-group-state="${parentExpanded ? 'expanded' : 'collapsed'}">
      <td colspan="${visibleColumns.length}">
        <div class="annojoin-group-row-inner">
          <button type="button" data-annojoin-group-toggle="${escapeHtml(parentToggleId)}" aria-expanded="${parentExpanded ? 'true' : 'false'}">${parentExpanded ? '-' : '+'}</button>
          <strong>${escapeHtml(parent.label)}</strong>
          <span>${escapeHtml(parent.count)} cases</span>
        </div>
      </td>
    </tr>`);
    if (!parentExpanded) continue;
    if (parent.children.length === 1) {
      renderExpandedRows(parent.children[0].rows, parentToggleId, [parent.label, parent.children[0].label]);
      continue;
    }
    for (const child of parent.children) {
      if (child.count <= 1) {
        child.rows.forEach((row) => rows.push(renderRow(row, 'is-in-expanded-group', [parent.label, child.label])));
        continue;
      }
      const childToggleId = `child:${child.id}`;
      const childExpanded = expandedGroupIds.has(childToggleId);
      rows.push(`<tr class="annojoin-child-group-row${childExpanded ? ' is-expanded-group' : ''}" data-annojoin-child-group="${escapeHtml(child.id)}" data-annojoin-group-state="${childExpanded ? 'expanded' : 'collapsed'}">
        <td colspan="${visibleColumns.length}">
          <div class="annojoin-group-row-inner">
            <button type="button" data-annojoin-group-toggle="${escapeHtml(childToggleId)}" aria-expanded="${childExpanded ? 'true' : 'false'}">${childExpanded ? '-' : '+'}</button>
            <span>${escapeHtml(child.label)}</span>
            <small>${escapeHtml(child.count)} cases</small>
          </div>
        </td>
      </tr>`);
      if (!childExpanded) continue;
      renderExpandedRows(child.rows, childToggleId, [parent.label, child.label]);
    }
  }
  return rows.join('');
}

function sidebarField(label, value, source = '') {
  return `<dt>${escapeHtml(label)}</dt><dd>${sourceValue(value, source)}</dd>`;
}

function renderPanelList(items = []) {
  if (!items.length) return '<p class="mini-note">Current index asset does not provide row-level entries for this field.</p>';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function sourceCaseEntries(row = {}) {
  return Array.isArray(row.sourceCaseAssetPaths) ? row.sourceCaseAssetPaths.filter((entry) => entry?.atlasCaseKey) : [];
}

function sourceCaseCountLabel(row = {}) {
  const count = Number(row.sourceCaseCount) || sourceCaseEntries(row).length || 0;
  if (!count) return '';
  return `${count} ${count === 1 ? 'source case' : 'source cases'}`;
}

function renderSourceCaseLinks(row = {}) {
  const entries = sourceCaseEntries(row);
  if (!entries.length) return '';
  return `<section class="annojoin-source-case-section">
    <h3>Source cases</h3>
    <ul class="annojoin-source-case-list">
      ${entries.map((entry) => {
        const caseId = entry.caseId || rowCaseId(row);
        const family = entry.familyLabel || entry.assetFamily || 'source';
        const confidence = entry.compactConfidenceLabel || entry.confidenceDisplayLabel || 'confidence not annotated';
        const profiles = Number(entry.profileCount) || 0;
        return `<li>
          <div>
            <strong>${escapeHtml(family)}</strong>
            <span>${escapeHtml(entry.atlasCaseKey)}</span>
            <small>${escapeHtml(`${profiles} ${profiles === 1 ? 'profile' : 'profiles'}; ${confidence}`)}</small>
          </div>
          <a class="download-outline-btn" href="${escapeHtml(detailPageHref({ caseId, atlasCaseKey: entry.atlasCaseKey, assetFamily: entry.assetFamily, caseUid: entry.caseUid, pdbId: entry.pdbId || caseId }))}">Open detail page</a>
        </li>`;
      }).join('')}
    </ul>
  </section>`;
}

function renderEmptySidebar() {
  return '';
}

function renderMoleculePanel(row, routeName) {
  const caseId = rowCaseId(row);
  const caseKey = rowCaseKey(row);
  const entries = sourceCaseEntries(row);
  const isMergedDisplayRow = row.isMergedDisplayRow || entries.length > 1;
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN index row detail">
    <div class="annojoin-detail-sidebar-head">
      <div>
        <p class="technology-kicker">Index row detail</p>
        <h2>${escapeHtml(moleculeName(row))}</h2>
      </div>
      ${isMergedDisplayRow
    ? `<span class="mini-note">${escapeHtml(sourceCaseCountLabel(row))}</span>`
    : `<a class="download-outline-btn" href="${escapeHtml(detailPageHref({ caseId, atlasCaseKey: caseKey, assetFamily: row.assetFamily, caseUid: row.caseUid, pdbId: row.pdbId || caseId }))}">Open detail page</a>`}
    </div>
    <dl>
      ${sidebarField('Molecule name', moleculeName(row), row.biologicalMoleculeNameSource || row.pdbMoleculeNameSource)}
      ${sidebarField('Biological source value', row.biologicalMoleculeName, row.biologicalMoleculeNameSource)}
      ${sidebarField('PDB source value', row.pdbMoleculeName, row.pdbMoleculeNameSource)}
      ${sidebarField('Confidence distribution', row.confidenceDisplayLabel || row.fecClaimCeilingDistribution, row.confidenceSource || 'fec_claim_ceiling_distribution')}
      <dt>Profiles</dt><dd>${escapeHtml(profileValue(row))}</dd>
      <dt>Chains</dt><dd>${escapeHtml((row.chains || []).join(', ') || 'not annotated')}</dd>
    </dl>
    ${isMergedDisplayRow ? renderSourceCaseLinks(row) : ''}
  </aside>`;
}

const LEGACY_COVERAGE_POINTERS = [
  /^see\s+annoconfidence\/coverage_topology_annotation\.tsv$/i,
  /coverage_topology_annotation\.tsv/i
];

function coverageTopologyValue(row = {}) {
  const value = String(row.coverageShapeDistribution ?? '').trim();
  if (!value || LEGACY_COVERAGE_POINTERS.some((pattern) => pattern.test(value))) {
    return 'Coverage topology distribution is summarized at the case level; see the linked route assets for per-segment detail.';
  }
  return value;
}

// per-profile LSS 证据：只渲染对外友好字段。内部向字段（evidenceId/calibrationNote/
// bridgeStatus/pairId/pairSegmentId/rankedSetEligible/selectedByDefault/lssTierUncalibrated
// 及所有 route/profile 内部标识）绝不进入渲染产物。
function fmtEvidenceValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function renderLssEvidenceRow(row = {}) {
  const items = [];
  const push = (label, raw) => {
    const value = fmtEvidenceValue(raw);
    if (value !== '') items.push([label, value]);
  };
  push('Probe technology', row.technology);
  push('Measurement family', row.family);
  push('LSS tier (calibrated)', row.lssTierCalibrated);
  const metricLabel = fmtEvidenceValue(row.directionalMetricLabel) || 'Directional metric';
  push(metricLabel, row.aucDirectional);
  push('Permutation p-value', row.aucEmpiricalPValue);
  push('Effect size (z)', row.aucEffectSizeZ);
  push('Evaluable units', row.nEvaluable);
  if (!items.length) return '';
  const dl = items.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
  return `<div class="annojoin-lss-evidence-row"><dl>${dl}</dl></div>`;
}

const LSS_EVIDENCE_EMPTY = '<p class="mini-note">No per-profile LSS evidence is available for this case.</p>';

export function renderLssEvidenceContent(evidence) {
  const rows = Array.isArray(evidence?.rows) ? evidence.rows : [];
  const status = String(evidence?.status || '').trim();
  if (status !== 'materialized' || !rows.length) return LSS_EVIDENCE_EMPTY;
  const rendered = rows.map(renderLssEvidenceRow).filter(Boolean);
  if (!rendered.length) return LSS_EVIDENCE_EMPTY;
  return `<h3>Per-profile LSS evidence</h3>
    <p class="mini-note">Each row is one profile's calibrated LSS recall evidence for this case.</p>
    ${rendered.join('')}`;
}

function findLssEvidenceSlot(root, caseKey) {
  if (!root || !caseKey) return null;
  const slots = root.querySelectorAll('[data-lss-evidence-slot]');
  for (const el of slots) {
    if (el.getAttribute('data-lss-evidence-slot') === caseKey) return el;
  }
  return null;
}

// 异步把 per-profile 证据填进同步渲染的占位节点。侧栏切走（caseKey 不再匹配）则丢弃过期响应。
export async function hydrateLssEvidence({ store, root = document, caseKey, getCurrentCaseKey } = {}) {
  if (!store || typeof store.loadAssetPath !== 'function') return;
  const key = String(caseKey || '').trim();
  if (!key) return;
  if (!findLssEvidenceSlot(root, key)) return;
  let evidence = null;
  try {
    evidence = await store.loadAssetPath(`cases/${key}/confidence-evidence.json`, { compressed: true });
  } catch {
    evidence = null;
  }
  if (typeof getCurrentCaseKey === 'function' && getCurrentCaseKey() !== key) return;
  const liveSlot = findLssEvidenceSlot(root, key);
  if (!liveSlot) return;
  liveSlot.innerHTML = evidence ? renderLssEvidenceContent(evidence) : LSS_EVIDENCE_EMPTY;
}

function helpTooltip(text) {
  return `<span class="annojoin-help-tooltip"><span class="annojoin-help-icon" tabindex="0" role="img" aria-label="${escapeHtml(text)}">ⓘ</span><span class="annojoin-help-bubble" role="tooltip">${escapeHtml(text)}</span></span>`;
}

const COLUMN_HELP = {
  moleculeName: 'Biological molecule name for this structure; click it to open the case detail page.',
  pdbId: 'RCSB Protein Data Bank identifier for the deposited structure.',
  chains: 'RNA chain identifiers carrying chemical-probing evidence in this case.',
  profileCount: 'Number of source chemical-probing signal records (profiles) mapped onto this structure.',
  techniqueFamilies: 'One or more of the five Probing-page categories contributing evidence; hover a badge for full technique names.'
};

function renderConfidencePanel(row) {
  const hasContext = row.hasContextAnnotation ? 'context annotation present' : 'context annotation not present';
  const hasLss = row.hasLssAnnotation ? 'LSS annotation present' : 'LSS annotation not present';
  const entries = sourceCaseEntries(row);
  const caseKey = rowCaseKey(row);
  const evidenceSlot = row.hasLssAnnotation && caseKey
    ? `<div class="annojoin-lss-evidence-slot" data-lss-evidence-slot="${escapeHtml(caseKey)}"><p class="mini-note">Loading per-profile LSS evidence…</p></div>`
    : '';
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN confidence explanation">
    <p class="technology-kicker">Confidence classification${helpTooltip('Confidence tiers summarize annotation support: A/B labels are context-stratified; C-level labels are exploratory hints to review against the underlying route assets.')}</p>
    <h2>${escapeHtml(row.confidenceDisplayLabel || 'not annotated')}</h2>
    <p>This is a case-level distribution, not a best-profile confidence score.</p>
    <dl>
      ${sidebarField('Current case', row.confidenceDisplayLabel || row.fecClaimCeilingDistribution, row.confidenceSource || 'fec_claim_ceiling_distribution')}
      <dt>Annotation coverage</dt><dd>${escapeHtml(`${hasContext}; ${hasLss}`)}</dd>
      <dt>Coverage topology</dt><dd>${escapeHtml(coverageTopologyValue(row))}</dd>
    </dl>
    ${entries.length > 1 ? renderSourceCaseLinks(row) : ''}
    ${evidenceSlot}
    <p class="mini-note">A/B/C labels summarize confidence-relevant annotation support. C-level labels are exploratory hints and should be reviewed with the underlying route assets.</p>
  </aside>`;
}

function renderPdbPanel(row) {
  const pdbId = row.pdbId || rowCaseId(row);
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN PDB metadata">
    <p class="technology-kicker">PDB metadata</p>
    <h2>${escapeHtml(pdbId)}</h2>
    <dl>
      ${sidebarField('Author-provided molecule name', row.pdbMoleculeName, row.pdbMoleculeNameSource)}
      <dt>Published article</dt><dd>Current index asset does not provide citation metadata.</dd>
      <dt>Chains</dt><dd>${escapeHtml((row.chains || []).join(', ') || 'not annotated')} (${escapeHtml((row.chains || []).length)} chains listed)</dd>
    </dl>
    <p><a class="download-outline-btn" href="https://www.rcsb.org/structure/${escapeHtml(pdbId)}" target="_blank" rel="noreferrer">Open in RCSB</a></p>
  </aside>`;
}

function profileHitsByFamily(row = {}) {
  const entries = sourceCaseEntries(row);
  const counts = { RMDB2PDB: 0, RASP2PDB: 0 };
  if (entries.length) {
    for (const entry of entries) {
      const family = String(entry.assetFamily || '').trim();
      if (family in counts) counts[family] += Number(entry.profileCount) || 0;
    }
  } else {
    // Single-source rows that did not materialize sourceCaseAssetPaths fall
    // back to the row's own family + total profile count.
    const family = String(row.assetFamily || '').trim();
    if (family in counts) counts[family] = Number(row.profileCount) || 0;
  }
  return counts;
}

function profileFamilyBreakdownRows(row = {}) {
  const counts = profileHitsByFamily(row);
  const lines = [
    { label: 'RMDB', count: counts.RMDB2PDB },
    { label: 'RASP', count: counts.RASP2PDB }
  ];
  return lines
    .map(({ label, count }) => {
      const noun = count === 1 ? 'profile' : 'profiles';
      return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(`${count} ${noun} hit`)}</dd>`;
    })
    .join('');
}

function renderProfilesPanel(row) {
  const entries = sourceCaseEntries(row);
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN profile hits">
    <p class="technology-kicker">Profile hits</p>
    <h2>${escapeHtml(profileValue(row))}</h2>
    <p>A profile is a single source chemical-probing signal record (one RMDB RDAT measurement or one RASP probing profile) that maps onto this PDB structure. Profiles are membership evidence — every hit linked to the case — not a representative best profile.</p>
    <h3>Hits by source</h3>
    <dl class="annojoin-profile-family-counts">
      ${profileFamilyBreakdownRows(row)}
    </dl>
    ${entries.length > 1 ? renderSourceCaseLinks(row) : ''}
  </aside>`;
}

function renderChainsPanel(row) {
  const chains = Array.isArray(row.chains) ? row.chains.filter(Boolean) : [];
  const count = chains.length;
  const countLabel = `${count} ${count === 1 ? 'chain' : 'chains'} listed`;
  const pdb = encodeURIComponent(String(row.pdbId || rowCaseId(row)).toUpperCase());
  const rcsbHref = `https://www.rcsb.org/sequence/${pdb}`;
  const body = count
    ? chains.map((chain) => `<details class="annojoin-chain-seq">
        <summary>${escapeHtml(chain)}</summary>
        <a class="download-outline-btn" href="${escapeHtml(rcsbHref)}" target="_blank" rel="noopener noreferrer">View sequence on RCSB →</a>
      </details>`).join('')
    : '<p class="mini-note">No PDB chain identifiers are annotated for this case in the current index asset.</p>';
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN chain definitions">
    <p class="technology-kicker">Chain definitions</p>
    <h2>${escapeHtml(countLabel)}</h2>
    <p>Chains are PDB chain identifiers associated with this ANNOJOIN case.</p>
    <div class="annojoin-chain-scroll" role="region" aria-label="PDB chain identifiers" tabindex="0">
      ${body}
    </div>
    <p class="mini-note">Residue sequences open on RCSB (entry-level).</p>
  </aside>`;
}

function renderConflictsPanel(row) {
  const count = Number(row.conflictCandidateCount) || 0;
  return `<aside class="annojoin-detail-sidebar" aria-label="ANNOJOIN conflict candidates">
    <p class="technology-kicker">Conflict candidates</p>
    <h2>${escapeHtml(count)} conflict candidates</h2>
    <p>Conflicts mark cases where annotation or evidence routes may need review before interpretation.</p>
    <p class="mini-note">${count ? 'This case has at least one review candidate in the ANNOJOIN conflict index.' : 'No review candidate is listed for this case in the current index.'}</p>
  </aside>`;
}

function renderDetailSidebar({ row, routeName, selectedField }) {
  if (!row || !selectedField) return renderEmptySidebar();
  if (selectedField === 'moleculeName') return renderMoleculePanel(row, routeName);
  if (selectedField === 'confidenceDisplayLabel') return renderConfidencePanel(row);
  if (selectedField === 'pdbId') return renderPdbPanel(row);
  if (selectedField === 'profileCount') return renderProfilesPanel(row);
  if (selectedField === 'chains') return renderChainsPanel(row);
  if (selectedField === 'conflictCandidateCount') return renderConflictsPanel(row);
  return renderEmptySidebar();
}

const ANNOJOIN_FILTER_CHIP_KEYS = ['rnaFamily', 'pdbId', 'motif', 'structureClass'];

function renderFilterChip(removeKey, label) {
  return `<span class="annojoin-filter-chip">${escapeHtml(label)} <button type="button" data-annojoin-chip-remove="${escapeHtml(removeKey)}">×</button></span>`;
}

export function renderTechniqueFilterControls(cases = [], filters = {}) {
  const model = buildMechanismFilterModel();
  if (!model.families.length) return '';
  const selectedFamilies = new Set(filters.techniqueFamilies || []);
  const selectedNames = new Set(filters.techniqueNames || []);
  const familyBlocks = model.families.map((family) => {
    const familyActive = selectedFamilies.has(family.id);
    const techOptions = family.techniques.map((name) => `
      <label class="annojoin-technique-option">
        <input type="checkbox" data-technique-name="${escapeHtml(name)}"${selectedNames.has(name) ? ' checked' : ''} />
        <span>${escapeHtml(name)}</span>
      </label>`).join('');
    return `<section class="annojoin-technique-family-group" aria-label="${escapeHtml(family.label)}">
        <label class="annojoin-technique-family-summary">
          <input type="checkbox" data-technique-family="${escapeHtml(family.id)}"${familyActive ? ' checked' : ''} />
          <span class="annojoin-technique-family-heading">
            <span class="annojoin-family-badge annojoin-family-badge-${escapeHtml(family.id)}">${escapeHtml(family.label)}</span>
          </span>
        </label>
        <div class="annojoin-technique-names">${techOptions}</div>
      </section>`;
  }).join('');
  return `<section class="annojoin-technique-filter" aria-label="Technique filter">
    <div class="annojoin-technique-filter-heading">
      <div>
        <strong>Filter by probing technique</strong>
      </div>
      <span class="mini-note">All five categories and their methods are shown</span>
    </div>
    <div class="annojoin-technique-family-list">${familyBlocks}</div>
  </section>`;
}

function renderActiveConditionChips(filters = {}, query = '') {
  const chips = [];
  if (query) chips.push(renderFilterChip('q', `"${query}"`));
  for (const key of ANNOJOIN_FILTER_CHIP_KEYS) {
    const value = filters[key];
    if (value) chips.push(renderFilterChip(key, value));
  }
  for (const fam of filters.techniqueFamilies || []) {
    const label = MECHANISM_FAMILIES.find((family) => family.id === fam)?.label || fam;
    chips.push(renderFilterChip(`techniqueFamilies:${fam}`, label));
  }
  for (const name of filters.techniqueNames || []) {
    chips.push(renderFilterChip(`techniqueNames:${name}`, name));
  }
  if (!chips.length) return '';
  return `<section class="annojoin-filter-chips" aria-label="Active conditions">
      ${chips.join('')}
      <button type="button" data-annojoin-clear-all>Clear all</button>
    </section>`;
}

export function renderAnnojointAtlasPage({
  state,
  routeName = 'annojoin-atlas',
  expandedGroupIds,
  uncappedGroupIds = new Set(),
  page = 1,
  pageSize = 50,
  selectedCaseId = '',
  selectedCaseKey = '',
  selectedField = '',
  statusMessage = null,
  headerHtml = ''
} = {}) {
  const atlasState = state || { cases: [], source: {}, totalCaseCount: 0, filters: {} };
  const expanded = expandedGroupIds instanceof Set ? expandedGroupIds : new Set(expandedGroupIds || []);
  const uncapped = uncappedGroupIds instanceof Set ? uncappedGroupIds : new Set(uncappedGroupIds || []);
  const visibleColumns = ANNOJOIN_TABLE_COLUMNS;
  const sortedRows = sortAnnojointCases(atlasState.cases);
  const query = atlasState.filters?.query || '';
  const searchActive = isAnnojointSearchActive(query);
  const preserved = buildPreservedParams(atlasState.filters || {}, page);
  const baseRows = searchActive ? searchAnnojointRows(sortedRows, query) : sortedRows;
  const groups = searchActive ? [] : buildAnnojointTableGroups(baseRows);
  const searchModeNote = searchActive && baseRows.length
    ? `<section class="annojoin-search-mode-banner" role="status">
      <p class="annojoin-search-mode-note">Search results — grouping is paused. Clear the filter to return to grouped browsing.</p>
      <button type="button" class="download-outline-btn" data-annojoin-clear-search>Clear search</button>
    </section>`
    : '';

  const emptySearchRow = searchActive && !baseRows.length
    ? `<tr class="annojoin-empty-search-row"><td colspan="${visibleColumns.length}">
      <p>No entries match "${escapeHtml(query)}". Check the PDB ID, or try a molecule name.</p>
      <button type="button" class="download-outline-btn" data-annojoin-clear-search>Clear search</button>
    </td></tr>`
    : '';

  const tableBody = searchActive
    ? (emptySearchRow || renderFlatRows({ rows: baseRows, visibleColumns, routeName, preserved }))
    : (statusMessage && !atlasState.cases.length
      ? `<tr class="annojoin-status-row"><td colspan="${visibleColumns.length}">${escapeHtml(statusMessage.text || '')}</td></tr>`
      : renderTableBody({ groups, visibleColumns, expandedGroupIds: expanded, uncappedGroupIds: uncapped, routeName, preserved }));

  const statusBanner = statusMessage
    ? `<section class="annojoin-table-status" role="status" data-status-tone="${escapeHtml(statusMessage.tone || 'info')}">
      <p>${escapeHtml(statusMessage.text || '')}</p>
    </section>`
    : '';

  const displayCount = atlasState.totalCaseCount || atlasState.cases.length;
  const placementCount = atlasState.totalPlacementCount || 0;
  const sourceCount = atlasState.totalSourceCaseCount;
  const metaCountText = searchActive
    ? `Showing ${escapeHtml(baseRows.length)} of ${escapeHtml(displayCount)} entries matching "${escapeHtml(query)}"`
    : `${escapeHtml(displayCount)} PDBs${placementCount ? ` · ${escapeHtml(placementCount)} entries` : ''}${sourceCount && sourceCount !== displayCount ? ` (${escapeHtml(sourceCount)} source cases)` : ''}`;

  return `${headerHtml}
  <main class="page-annojoin-atlas page-annojoin-master-table">
    <section class="annojoin-table-heading">
      <h1>Entry table</h1>
      <p class="pdb-case-lede">Browse RNA structures, probing profiles, and confidence summaries.</p>
    </section>

    <section class="annojoin-table-toolbar" aria-label="ANNOJOIN table controls">
      <input type="search" id="annojoin-search-input" placeholder="Filter this table by PDB ID or molecule name" value="${escapeHtml(atlasState.filters?.query || '')}" />
      <button id="expand-all-annojoin-groups" type="button" class="download-outline-btn">Expand All</button>
      <button id="collapse-all-annojoin-groups" type="button" class="download-outline-btn">Collapse All</button>
      <a class="download-outline-btn" href="${escapeHtml(atlasHref(routeName))}">Reset</a>
    </section>

    ${renderTechniqueFilterControls(atlasState.unfilteredCases || atlasState.cases, atlasState.filters)}
    ${renderActiveConditionChips(atlasState.filters, query)}
    ${searchModeNote}
    ${statusBanner}

    <section class="annojoin-table-meta">
      <span>${metaCountText}</span>
      <span>Case-level profile/confidence summary</span>
    </section>

    <section class="annojoin-table-layout">
      <div class="annojoin-scroll-hint" role="note" data-annojoin-scroll-hint-note>
        Scroll sideways to see more columns
        <button type="button" class="annojoin-scroll-hint-dismiss" data-annojoin-scroll-hint-dismiss aria-label="Dismiss">×</button>
      </div>
      <div class="annojoin-master-table-wrap annojoin-table-scroll" data-annojoin-scroll-hint="foldbridge.entryTableScrollHintSeen">
        <table class="annojoin-master-table">
          <thead>
            <tr>
              ${visibleColumns.map((column) => `<th>${escapeHtml(column.label)}${COLUMN_HELP[column.id] ? helpTooltip(COLUMN_HELP[column.id]) : ''}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${tableBody}</tbody>
        </table>
      </div>
    </section>
  </main>`;
}
