import { displayMoleculeName } from './moleculeNameOverrides.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value) {
  return String(value ?? '').trim();
}

function formatNumber(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : 'n/a';
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function defaultEvidence(bundle) {
  const rows = bundle?.evidence?.rows || [];
  return rows.find((row) => row.selectedByDefault) || rows[0] || null;
}

function workbenchBaseHref(caseAsset) {
  const caseId = text(caseAsset?.case?.caseId);
  const family = text(caseAsset?.case?.assetFamily);
  if (caseId === '5GAG' && family === 'RMDB2PDB') return 'annojoin-smoke/5gag/index.html';
  return '';
}

function renderMetric(label, value) {
  return `<article class="annojoin-case-metric">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  </article>`;
}

function renderTierChips(summary = {}) {
  const counts = Object.entries(summary.tierCounts || {});
  if (!counts.length) return '<span class="mini-note">No calibrated evidence rows in the current build.</span>';
  return counts
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([tier, count]) => `<span class="annojoin-tier-chip" data-tier="${escapeHtml(tier)}">${escapeHtml(tier)} · ${escapeHtml(count)}</span>`)
    .join('');
}

function renderFamilyFilters(summary = {}) {
  const families = ['all', ...(summary.availableFamilies || [])];
  return families.map((family, index) => {
    const label = family === 'all' ? 'All' : family;
    return `<button
      type="button"
      class="annojoin-family-filter${index === 0 ? ' is-active' : ''}"
      data-annojoin-family-filter="${escapeHtml(family)}"
    >${escapeHtml(label)}</button>`;
  }).join('');
}

function renderEvidenceRows(bundle = {}) {
  const rows = bundle?.evidence?.rows || [];
  if (!rows.length) {
    return `<div class="annojoin-evidence-empty">
      <strong>Confidence sidecar unavailable</strong>
      <p>当前构建还没有为这个 case 物化 RMDB calibrated confidence rows。</p>
    </div>`;
  }
  return rows.map((row) => `<button
    type="button"
    class="annojoin-evidence-row${row.selectedByDefault ? ' is-selected' : ''}"
    data-evidence-id="${escapeHtml(row.evidenceId)}"
    data-evidence-family="${escapeHtml(row.family)}"
    aria-pressed="${row.selectedByDefault ? 'true' : 'false'}"
  >
    <span class="annojoin-evidence-family">${escapeHtml(row.family || 'NA')}</span>
    <span class="annojoin-evidence-tier">${escapeHtml(row.lssTierCalibrated || 'LSS_NOT_SUPPORTED')}</span>
    <strong>${escapeHtml(text(row.trackProfileId || row.profileKey || row.pairId))}</strong>
    <small>${escapeHtml(`${row.technology || 'unknown'} · chain ${row.chain || 'NA'} · n=${row.nEvaluable ?? 'n/a'} · auc=${formatNumber(row.aucDirectional)} · p=${formatNumber(row.aucEmpiricalPValue, 6)}`)}</small>
  </button>`).join('');
}

function renderFocusGrid(evidence) {
  if (!evidence) {
    return `<div class="annojoin-focus-empty">
      <strong>No selected evidence</strong>
      <p>Wait for the RMDB calibrated confidence sidecar or choose a materialized evidence row.</p>
    </div>`;
  }
  return `<dl class="annojoin-focus-grid">
    <div><dt>Calibrated tier</dt><dd>${escapeHtml(evidence.lssTierCalibrated || 'n/a')}</dd></div>
    <div><dt>Family</dt><dd>${escapeHtml(evidence.family || 'n/a')}</dd></div>
    <div><dt>Technology</dt><dd>${escapeHtml(evidence.technology || 'n/a')}</dd></div>
    <div><dt>Track profile</dt><dd>${escapeHtml(evidence.trackProfileId || 'n/a')}</dd></div>
    <div><dt>Pair ID</dt><dd>${escapeHtml(evidence.pairId || 'n/a')}</dd></div>
    <div><dt>AUC directional</dt><dd>${escapeHtml(formatNumber(evidence.aucDirectional))}</dd></div>
    <div><dt>Empirical p</dt><dd>${escapeHtml(formatNumber(evidence.aucEmpiricalPValue, 6))}</dd></div>
    <div><dt>Conflict fraction</dt><dd>${escapeHtml(formatNumber(evidence.conflictFraction))}</dd></div>
    <div><dt>Partner inside</dt><dd>${escapeHtml(formatNumber(evidence.partnerInsideFraction))}</dd></div>
    <div><dt>Evaluable</dt><dd>${escapeHtml(String(evidence.nEvaluable ?? 'n/a'))}</dd></div>
    <div><dt>Route bridge</dt><dd>${escapeHtml(evidence.bridgeStatus || 'n/a')}</dd></div>
  </dl>`;
}

function renderProvenance(provenance = {}) {
  const sourceTables = provenance?.sourceTables || {};
  const totals = provenance?.totals || {};
  return `<details class="annojoin-case-provenance" open>
    <summary>Confidence provenance</summary>
    <div class="annojoin-provenance-grid">
      <div><span>Strategy</span><strong>${escapeHtml(provenance.bridgeStrategy || 'not materialized')}</strong></div>
      <div><span>Calibrated rows</span><strong>${escapeHtml(totals.calibratedRows ?? 0)}</strong></div>
      <div><span>Materialized evidence</span><strong>${escapeHtml(totals.materializedEvidenceCount ?? 0)}</strong></div>
      <div><span>Bridge misses</span><strong>${escapeHtml(totals.bridgeMissingCount ?? 0)}</strong></div>
    </div>
    <ul class="annojoin-provenance-list">
      <li><code>${escapeHtml(sourceTables.calibratedPath || 'not configured')}</code></li>
      <li><code>${escapeHtml(sourceTables.membershipsPath || 'not configured')}</code></li>
      <li><code>${escapeHtml(sourceTables.tracksPath || 'not configured')}</code></li>
      <li><code>${escapeHtml(sourceTables.pairContextPath || 'not configured')}</code></li>
      <li><code>${escapeHtml(sourceTables.structurePath || 'not configured')}</code></li>
    </ul>
  </details>`;
}

function renderChainIdentityRow(chain, { verified }) {
  const chainId = escapeHtml(text(chain?.chainId) || '—');
  const displayName = escapeHtml(text(chain?.displayName) || 'Unnamed RNA');
  const metaParts = [
    text(chain?.rnaClass),
    Number.isFinite(chain?.lengthNt) ? `${chain.lengthNt} nt` : '',
    text(chain?.authAsymId) ? `chain ${text(chain.authAsymId)}` : '',
  ].filter(Boolean);
  const meta = metaParts.length
    ? `<span class="annojoin-chain-meta">${escapeHtml(metaParts.join(' · '))}</span>`
    : '';
  let ids;
  if (verified) {
    const idParts = [text(chain?.ursId), text(chain?.genbank)].filter(Boolean);
    ids = idParts.length
      ? idParts.map((part) => escapeHtml(part)).join('<br>')
      : '—';
  } else {
    ids = text(chain?.genbank) ? escapeHtml(text(chain.genbank)) : '—';
  }
  return `<tr>
    <td class="annojoin-chain-id"><b>${chainId}</b></td>
    <td class="annojoin-chain-name"><b>${displayName}</b>${meta}</td>
    <td class="annojoin-chain-ids">${ids}</td>
  </tr>`;
}

function renderChainIdentityGroup(chains, { verified, label }) {
  if (!chains.length) return '';
  const modifier = verified ? 'is-verified' : 'is-declared';
  const rows = chains.map((chain) => renderChainIdentityRow(chain, { verified })).join('');
  return `<div class="annojoin-chain-group">
    <div class="annojoin-chain-group-head ${modifier}">${escapeHtml(`${label} (${chains.length})`)}</div>
    <table class="annojoin-chain-table">
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderChainIdentityPanel(chainIdentities) {
  if (!Array.isArray(chainIdentities) || !chainIdentities.length) return '';
  const verified = chainIdentities.filter((chain) => chain?.verified === true);
  const declared = chainIdentities.filter((chain) => chain?.verified !== true);
  const groups = [
    renderChainIdentityGroup(verified, { verified: true, label: 'Sequence-verified identity' }),
    renderChainIdentityGroup(declared, { verified: false, label: 'Author-declared (unverified)' }),
  ].filter(Boolean).join('');
  return `<section class="annojoin-case-panel annojoin-chain-identity">
    <div class="annojoin-case-panel-head">
      <p class="technology-kicker">per-chain identity</p>
      <h2>RNA chain identities</h2>
      <span>${escapeHtml(`${chainIdentities.length} chains`)}</span>
    </div>
    ${groups}
  </section>`;
}

function citationJournalLine(citation = {}) {
  const journal = text(citation.journal);
  const volume = text(citation.volume);
  const first = text(citation.pageFirst);
  const last = text(citation.pageLast);
  const pages = first && last ? `${first}–${last}` : first || last;
  const issue = [journal, volume].filter(Boolean).join(' ');
  const publication = [issue, pages].filter(Boolean).join(', ');
  return citation.year && publication ? `${publication} (${citation.year})` : publication || citation.year;
}

function citationHref(citation = {}, pdbId = '') {
  const doi = text(citation.doi);
  if (doi) return `https://doi.org/${encodeURIComponent(doi).replace(/%2F/g, '/')}`;
  const pubmedId = text(citation.pubmedId);
  if (pubmedId) return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pubmedId)}/`;
  return `https://www.rcsb.org/structure/${encodeURIComponent(text(pdbId).toUpperCase())}`;
}

function renderCitationLink(href, label) {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function renderPdbReferencePanel({ citation, status, pdbId }) {
  const normalizedPdbId = text(pdbId).toUpperCase();
  const rcsbHref = `https://www.rcsb.org/structure/${encodeURIComponent(normalizedPdbId)}`;
  let body;

  if (citation) {
    const titleHref = citationHref(citation, normalizedPdbId);
    const authors = citation.authors?.length ? citation.authors.join('; ') : '';
    const journalLine = citationJournalLine(citation);
    const links = [
      citation.pubmedId
        ? renderCitationLink(`https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(citation.pubmedId)}/`, `PubMed ${citation.pubmedId}`)
        : '',
      citation.doi
        ? renderCitationLink(`https://doi.org/${encodeURIComponent(citation.doi).replace(/%2F/g, '/')}`, `DOI ${citation.doi}`)
        : '',
      renderCitationLink(rcsbHref, `View ${normalizedPdbId} in PDB`),
    ].filter(Boolean).join('');
    body = `<article class="annojoin-reference-citation">
      <h3><a href="${escapeHtml(titleHref)}" target="_blank" rel="noreferrer">${escapeHtml(citation.title)}</a></h3>
      ${authors ? `<p class="annojoin-reference-authors">${escapeHtml(authors)}</p>` : ''}
      ${journalLine ? `<p class="annojoin-reference-journal">${escapeHtml(journalLine)}</p>` : ''}
      <div class="annojoin-reference-links">${links}</div>
    </article>`;
  } else if (status === 'loading' || status === 'idle') {
    body = `<p class="annojoin-case-copy">Loading the primary literature record for PDB ${escapeHtml(normalizedPdbId)}…</p>`;
  } else {
    body = `<p class="annojoin-case-copy">The PDB primary literature record is unavailable for this entry. ${renderCitationLink(rcsbHref, `View ${normalizedPdbId} in PDB`)}</p>`;
  }

  return `<section class="annojoin-case-panel annojoin-case-reference">
    <div class="annojoin-case-panel-head">
      <p class="technology-kicker">PDB primary literature</p>
      <h2>Reference</h2>
      <span>${escapeHtml(normalizedPdbId)}</span>
    </div>
    ${body}
  </section>`;
}

export function renderAnnojointCasePage({
  caseAsset,
  caseId,
  caseKey,
  confidenceBundle = null,
  confidenceStatus = 'idle',
  pdbCitation = null,
  pdbCitationStatus = 'idle',
  headerHtml = '',
} = {}) {
  const selectedCaseId = caseAsset?.case?.caseId || caseId || '10ZT';
  const selectedCaseKey = caseAsset?.case?.atlasCaseKey || caseKey || selectedCaseId;
  if (!caseAsset) {
    return `${headerHtml}
    <main class="page-annojoin-case">
      <section class="annojoin-case-hero">
        <p class="technology-kicker">ANNOJOIN case</p>
        <h1>${escapeHtml(selectedCaseId)}</h1>
        <p class="pdb-case-lede">Loading case-level assets from the generated ANNOJOIN atlas bundle...</p>
      </section>
    </main>`;
  }

  const summary = confidenceBundle?.summary || {};
  const evidence = defaultEvidence(confidenceBundle);
  const bootstrap = confidenceBundle ? {
    caseKey: selectedCaseKey,
    summary: confidenceBundle.summary,
    evidence: confidenceBundle.evidence?.rows || [],
    provenance: confidenceBundle.provenance,
    defaultEvidenceId: summary.defaultEvidenceId || evidence?.evidenceId || '',
    workbenchBaseHref: workbenchBaseHref(caseAsset),
  } : null;

  const chainIdentityPanel = renderChainIdentityPanel(caseAsset.case?.chainIdentities);
  const pdbId = caseAsset.case?.pdbId || selectedCaseId;

  return `${headerHtml}
    <main class="page-annojoin-case">
      <section class="annojoin-case-hero">
        <p class="technology-kicker">ANNOJOIN case detail</p>
        <h1>${escapeHtml(displayMoleculeName(caseAsset.case, caseAsset.case?.biologicalMoleculeName || selectedCaseId))}</h1>
        <div class="annojoin-case-hero-meta">
        ${renderMetric('Atlas case', selectedCaseKey)}
        ${renderMetric('PDB', caseAsset.case?.pdbId || selectedCaseId)}
        ${renderMetric('Source', caseAsset.case?.assetFamily || 'unknown')}
        ${renderMetric('Profiles', caseAsset.summary?.profileCount ?? caseAsset.case?.profileCount ?? '0')}
      </div>
      <div class="annojoin-case-hero-note">
        <strong>Legacy ANNOJOIN summary</strong>
        <span>${escapeHtml(caseAsset.case?.confidenceDisplayLabel || 'not annotated')}</span>
      </div>
    </section>

    <section class="annojoin-case-shell-grid" data-annojoin-case-app>
      <div class="annojoin-case-shell-main">
        ${chainIdentityPanel}
        <section class="annojoin-case-panel">
          <div class="annojoin-case-panel-head">
            <p class="technology-kicker">confidence-first</p>
            <h2>Default evidence focus</h2>
            <span>${escapeHtml(summary.defaultSelectionRuleVersion || 'tier_auc_p_n_v1')}</span>
          </div>
          <div id="annojoin-case-focus">${renderFocusGrid(evidence)}</div>
        </section>

        <section class="annojoin-case-panel">
          <div class="annojoin-case-panel-head">
            <p class="technology-kicker">alignment explainer</p>
            <h2>Why this row is the default</h2>
            <span>Family remains a light filter only</span>
          </div>
          <p class="annojoin-case-copy">The selector is flattened across the case. Default focus is the strongest calibrated evidence row after sorting by tier, AUC, empirical p-value, and evaluable size. Route bridging stays explicit: profile membership first, then pair-level 1D/2D/3D routes.</p>
          <div class="annojoin-case-chip-row">${renderTierChips(summary)}</div>
        </section>

        <section class="annojoin-case-panel">
          <div class="annojoin-case-panel-head">
            <p class="technology-kicker">provenance</p>
            <h2>Build-time source ledger</h2>
            <span>No browser-side big-table reads</span>
          </div>
          ${renderProvenance(confidenceBundle?.provenance || {})}
        </section>
      </div>

      <aside class="annojoin-case-evidence-panel">
        <section class="annojoin-case-panel">
          <div class="annojoin-case-panel-head">
            <p class="technology-kicker">selector</p>
            <h2>Calibrated evidence rows</h2>
            <span>${escapeHtml(summary.totalEvidenceCount ?? 0)} rows</span>
          </div>
          <div class="annojoin-family-filter-row">${renderFamilyFilters(summary)}</div>
          <div class="annojoin-evidence-list" id="annojoin-evidence-list">
            ${renderEvidenceRows(confidenceBundle)}
          </div>
        </section>
      </aside>
    </section>

    ${renderPdbReferencePanel({ citation: pdbCitation, status: pdbCitationStatus, pdbId })}

    ${bootstrap ? `<script id="annojoin-case-bootstrap" type="application/json">${jsonForScript(bootstrap)}</script>` : ''}
  </main>`;
}

function readBootstrapPayload() {
  const node = document.getElementById('annojoin-case-bootstrap');
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent);
  } catch (_error) {
    return null;
  }
}

function renderFocusPanel(host, evidence) {
  if (!host) return;
  host.innerHTML = renderFocusGrid(evidence);
}

function postWorkbenchSelection(frame, baseHref, evidence) {
  if (!frame || !baseHref || !evidence?.trackProfileId) return;
  const payload = {
    type: 'annojoin:set-profile',
    profileId: evidence.trackProfileId,
    pairId: evidence.pairId,
    pairSegmentId: evidence.pairSegmentId,
  };
  frame.contentWindow?.postMessage(payload, '*');
}

export async function initAnnojointCasePage() {
  const bootstrap = readBootstrapPayload();
  if (!bootstrap) return;
  const evidenceRows = bootstrap.evidence || [];
  if (!evidenceRows.length) return;

  const focusHost = document.getElementById('annojoin-case-focus');
  const frame = document.getElementById('annojoin-case-workbench-frame');
  const filterButtons = [...document.querySelectorAll('[data-annojoin-family-filter]')];
  const rowButtons = [...document.querySelectorAll('[data-evidence-id]')];
  let activeFamily = 'all';
  let selectedEvidenceId = bootstrap.defaultEvidenceId || evidenceRows[0]?.evidenceId || '';

  function visibleRows() {
    return evidenceRows.filter((row) => activeFamily === 'all' || row.family === activeFamily);
  }

  function evidenceById(evidenceId) {
    return evidenceRows.find((row) => row.evidenceId === evidenceId) || null;
  }

  function syncSelection() {
    const visible = visibleRows();
    if (!visible.some((row) => row.evidenceId === selectedEvidenceId)) {
      selectedEvidenceId = visible[0]?.evidenceId || '';
    }
    const selected = evidenceById(selectedEvidenceId);
    for (const button of rowButtons) {
      const evidenceId = button.getAttribute('data-evidence-id') || '';
      const family = button.getAttribute('data-evidence-family') || '';
      const isVisible = activeFamily === 'all' || family === activeFamily;
      const isSelected = evidenceId === selectedEvidenceId;
      button.hidden = !isVisible;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
    for (const button of filterButtons) {
      const family = button.getAttribute('data-annojoin-family-filter') || '';
      button.classList.toggle('is-active', family === activeFamily);
    }
    renderFocusPanel(focusHost, selected);
    postWorkbenchSelection(frame, bootstrap.workbenchBaseHref, selected);
  }

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      activeFamily = button.getAttribute('data-annojoin-family-filter') || 'all';
      syncSelection();
    });
  }

  for (const button of rowButtons) {
    button.addEventListener('click', () => {
      selectedEvidenceId = button.getAttribute('data-evidence-id') || '';
      syncSelection();
    });
  }

  frame?.addEventListener('load', () => {
    postWorkbenchSelection(frame, bootstrap.workbenchBaseHref, evidenceById(selectedEvidenceId));
  });

  syncSelection();
}
