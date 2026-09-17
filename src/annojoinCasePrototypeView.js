function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function colorForBin(bin) {
  if (bin === 'high') return '#b54b3a';
  if (bin === 'mid') return '#d9a441';
  if (bin === 'low') return '#2f8f6b';
  return '#9aa5a0';
}

function previewPoints(caseAsset) {
  return caseAsset?.visualPreview?.reactivity1d?.points || [];
}

function baseFromResidue(point) {
  const residue = String(point?.pdbResidue || '').trim();
  const token = residue.split(/\s+/).at(-1) || '';
  return token.replace('T', 'U').replace(/[^ACGU]/gi, '').toUpperCase() || 'N';
}

function buildVarnaInput(caseAsset) {
  const points = previewPoints(caseAsset).slice(0, 48);
  const sequence = points.map(baseFromResidue).join('');
  const length = sequence.length;
  const chars = Array.from({ length }, () => '.');
  const stemSize = Math.min(8, Math.floor(length / 3));
  for (let index = 0; index < stemSize; index += 1) {
    chars[index + 2] = '(';
    chars[length - index - 3] = ')';
  }
  return {
    sequence,
    dotBracket: chars.join(''),
    segmentLabel: caseAsset?.visualPreview?.pairArcs?.[0]?.segmentLabel || 'case preview segment',
    lssStatus: caseAsset?.visualPreview?.pairArcs?.[0]?.lssStatus || 'LSS route-backed'
  };
}

function renderVarnaPrototype(caseAsset) {
  const points = previewPoints(caseAsset).slice(0, 48);
  const varna = buildVarnaInput(caseAsset);
  const centerX = 260;
  const centerY = 162;
  const radius = 114;
  const coords = points.map((point, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / Math.max(points.length, 1));
    return {
      point,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });
  const pairLines = coords.slice(2, 10).map((coord, index) => {
    const partner = coords[coords.length - 3 - index];
    if (!partner) return '';
    return `<line class="annojoin-varna-pair" x1="${coord.x.toFixed(1)}" y1="${coord.y.toFixed(1)}" x2="${partner.x.toFixed(1)}" y2="${partner.y.toFixed(1)}" />`;
  }).join('');
  const residues = coords.map(({ point, x, y }, index) => `<g class="annojoin-varna-residue" data-reactivity-bin="${escapeAttr(point.colorBin)}">
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${colorForBin(point.colorBin)}" />
    <text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${escapeHtml(baseFromResidue(point))}</text>
    <title>${escapeHtml(`${point.pdbResidue || index + 1}: ${point.reactivityValue ?? 'missing'}`)}</title>
  </g>`).join('');

  return `<section class="annojoin-case-panel" data-annojoin-varna-prototype>
    <div class="annojoin-case-panel-head">
      <p class="technology-kicker">2D prototype</p>
      <h2>VARNA-compatible secondary view</h2>
      <span>${escapeHtml(varna.lssStatus)}</span>
    </div>
    <div class="annojoin-varna-layout">
      <figure class="annojoin-varna-frame">
        <svg viewBox="0 0 520 330" role="img" aria-label="VARNA-compatible secondary structure prototype">
          <path class="annojoin-varna-backbone" d="${coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(' ')} Z" />
          ${pairLines}
          ${residues}
        </svg>
      </figure>
      <div class="annojoin-varna-meta">
        <div>
          <span>Segment</span>
          <strong>${escapeHtml(varna.segmentLabel)}</strong>
        </div>
        <div>
          <span>Sequence</span>
          <code>${escapeHtml(varna.sequence || 'not generated')}</code>
        </div>
        <div>
          <span>Dot-bracket</span>
          <code>${escapeHtml(varna.dotBracket || 'not generated')}</code>
        </div>
      </div>
    </div>
  </section>`;
}

function renderMolstarPrototype(caseAsset) {
  const structure = caseAsset?.visualPreview?.structureColoring || {};
  const structureUrl = structure.structureUrl || caseAsset?.structureRoutes?.preview?.[0]?.structureUrl || '';
  const structureFilePath = structure.structureFilePath || caseAsset?.structureRoutes?.preview?.[0]?.structureFilePath || '';
  return `<section class="annojoin-case-panel" data-annojoin-molstar>
    <div class="annojoin-case-panel-head">
      <p class="technology-kicker">3D prototype</p>
      <h2>Molstar mmCIF viewer</h2>
      <span>coordinate-key coloring target</span>
    </div>
    <div id="annojoin-case-molstar-status" class="mini-note">Loading Molstar viewer...</div>
    <div
      id="annojoin-case-molstar"
      class="annojoin-case-molstar-host"
      data-structure-url="${escapeAttr(structureUrl)}"
      data-structure-format="cif"
    ></div>
    <p class="annojoin-case-route-note"><code>${escapeHtml(structureFilePath || 'No structure route loaded')}</code></p>
  </section>`;
}

export function renderAnnojointCasePrototypePage({ caseAsset, caseId } = {}) {
  const selectedCaseId = caseAsset?.case?.caseId || caseId || '10ZT';
  if (!caseAsset) {
    return `<main class="page-annojoin-case page-download-sequences">
      <section class="annojoin-case-hero">
        <p class="technology-kicker">ANNOJOIN case</p>
        <h1>${escapeHtml(selectedCaseId)}</h1>
        <p class="pdb-case-lede">Loading case-level visualization assets...</p>
      </section>
    </main>`;
  }

  return `<main class="page-annojoin-case page-download-sequences">
    <section class="annojoin-case-hero">
      <p class="technology-kicker">ANNOJOIN case prototype</p>
      <h1>${escapeHtml(selectedCaseId)}</h1>
      <p class="pdb-case-lede">Example detail page using a VARNA-compatible 2D panel and a Molstar 3D panel from the generated ANNOJOIN case asset.</p>
      <div class="pdb-case-status-grid">
        <article class="annojoin-metric"><span>PDB</span><strong>${escapeHtml(caseAsset.case?.pdbId || selectedCaseId)}</strong></article>
        <article class="annojoin-metric"><span>Preset</span><strong>${escapeHtml(caseAsset.summary?.recommendedDefaultPreset || 'not set')}</strong></article>
        <article class="annojoin-metric"><span>Preview residues</span><strong>${escapeHtml(previewPoints(caseAsset).length)}</strong></article>
        <article class="annojoin-metric"><span>Big-table browser load</span><strong>${caseAsset.annotationPayloadRowsCopied === 0 ? 'off' : 'check'}</strong></article>
      </div>
    </section>
    <section class="annojoin-case-prototype-grid">
      ${renderVarnaPrototype(caseAsset)}
      ${renderMolstarPrototype(caseAsset)}
    </section>
  </main>`;
}

async function loadPdbeMolstarAssets() {
  if (!document.getElementById('pdbe-molstar-css')) {
    const css = document.createElement('link');
    css.id = 'pdbe-molstar-css';
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/pdbe-molstar@3.3.0/build/pdbe-molstar.css';
    document.head.appendChild(css);
  }

  if (!window.PDBeMolstarPlugin) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pdbe-molstar@3.3.0/build/pdbe-molstar-plugin.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
}

export async function initAnnojointCasePrototype() {
  const host = document.getElementById('annojoin-case-molstar');
  const status = document.getElementById('annojoin-case-molstar-status');
  if (!host || !status) return;
  const structureUrl = host.dataset.structureUrl;
  if (!structureUrl) {
    status.textContent = 'No structure route is available for this case.';
    return;
  }

  try {
    await loadPdbeMolstarAssets();
    const viewer = new window.PDBeMolstarPlugin();
    viewer.render(host, {
      customData: { url: structureUrl, format: host.dataset.structureFormat || 'cif' },
      expanded: false,
      hideControls: true,
      bgColor: { r: 255, g: 255, b: 255 }
    });
    status.textContent = 'Molstar loaded from ANNOJOIN structure API.';
  } catch (_error) {
    status.textContent = 'Molstar script unavailable; structure API route is ready.';
    host.innerHTML = `<pre class="pdb-fallback">${escapeHtml(structureUrl)}</pre>`;
  }
}
