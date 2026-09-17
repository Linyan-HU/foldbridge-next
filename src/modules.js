import { aptamerMultiSelectRows, browseRows, detailEvidenceRows, provenanceHistory } from './data.js';

export function renderGlobalSearch() {
  return '';
}




export function renderFacetPanel() {
  return `<aside class="card"><h3>C-FACET-001 Facet Panel</h3><ul><li>Type</li><li>Species</li><li>Evidence</li><li>Date</li><li>Source</li></ul></aside>`;
}

export function renderResultList() {
  const rows = browseRows
    .map(
      (row) =>
        `<tr><td>${row.id}</td><td>${row.name}</td><td><em>${row.species}</em></td><td>${row.ligand}</td><td>${row.evidence}</td></tr>`
    )
    .join('');

  return `<section class="card"><h3>C-RESULT-002 Result List</h3><table><thead><tr><th>ID</th><th>Name</th><th>Species</th><th>Ligand</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderEvidenceTable() {
  const rows = detailEvidenceRows
    .map((row) => `<tr><td>${row.method}</td><td>${row.metric}</td><td>${row.score}</td></tr>`)
    .join('');

  return `<section class="card"><h3>C-EVID-001 Evidence Table</h3><table><thead><tr><th>Method</th><th>Metric</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderProvenanceSummary() {
  return `<section class="card"><h3>C-PROV-001 Provenance Summary</h3><p>Source: curated release 2026.03 • Snapshot: v1.0.0 • Confidence: reviewed</p></section>`;
}

export function renderProvenanceHistory() {
  const items = provenanceHistory.map((event) => `<li>${event}</li>`).join('');
  return `<section class="card"><h3>C-PROV-002 Provenance History</h3><ol>${items}</ol></section>`;
}

export function renderVisualizationShowcase() {
  return `
  <section class="card">
    <h2>Visualization Module Showcase (example page)</h2>
    <p>Combined module inventory inspired by RiboCentre / Riboswitch / Aptamer / GZNL Data Portal / RNA-Puzzles.</p>
  </section>

  <section class="card" id="V-MULTISELECT-001">
    <div class="dashboard-section">
      <h3 style="text-align:center; margin-bottom: 8px;">Aptamer-style Multi-selection Module</h3>
      <h4 style="text-align:center; margin-bottom: 20px;">Data Statistics Dashboard</h4>

      <div class="amir-container">
        <div class="chart-container two">
          <div class="chart-wrapper" id="V-HIST-001">
            <div class="chart-header">
              <h4 class="chart-title">Year Distribution</h4>
              <div class="chart-controls"><span class="chart-info">Click bars for multi-selection</span></div>
            </div>
            <div class="chart-content"><div id="yearChart" class="amir-chart"></div></div>
          </div>

          <div class="chart-wrapper" id="V-PIE-001">
            <div class="chart-header">
              <h4 class="chart-title">Category Distribution</h4>
              <div class="chart-controls"><span class="chart-info">Click sectors for multi-selection</span></div>
            </div>
            <div class="chart-content"><div id="ligandChart" class="amir-chart"></div></div>
          </div>
        </div>

        <section class="filter-controls" id="V-SEARCH-001">
          <div class="filter-header">
            <h4 class="filter-title">Data Filtering</h4>
            <div class="filter-actions">
              <button class="filter-btn reset-btn" id="resetAllFilters">Reset All</button>
            </div>
          </div>
          <div class="filter-tags" id="filterTags"></div>
        </section>

        <section class="data-table-section" id="V-TABLE-001">
          <div class="chart-header">
            <h4 class="chart-title">Data Details</h4>
            <div class="chart-controls"><span class="chart-info" id="tableInfo">Showing all entries</span></div>
          </div>
          <div class="table-container">
            <div class="table-responsive">
              <table id="dataTable" class="table table-striped table-hover">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Sequence Name</th>
                    <th>Aptamer Name</th>
                    <th>Discovery Year</th>
                    <th>Category</th>
                    <th>Sequence (5'-3')</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody id="tableBody"></tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="data-summary">
          <div class="summary-cards">
            <div class="summary-card">
              <span class="summary-label">Currently Showing</span>
              <span class="summary-count" id="currentCount">0</span>
              <span class="summary-unit">entries</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">Filter Ratio</span>
              <span class="summary-percentage" id="filterPercentage">0%</span>
              <span class="summary-unit">visible</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>

  <section class="viz-grid">
    <article class="card viz-card" id="V-RNA3D-001">
      <h3>RNA 3D Structure Viewer (Mol*)</h3>
      <p>Using PDBe Mol* style integration (as on Aptamer structure pages).</p>
      <div class="search-row">
        <input id="molstar-pdb" value="8K7W" aria-label="PDB ID" />
        <button id="molstar-load" class="ghost">Load PDB</button>
      </div>
      <div id="molstar-status" class="mini-note">Viewer loading…</div>
      <div class="structure-table">
        <div class="viewerSection1">
          <div id="myViewer1"></div>
        </div>
      </div>
    </article>

    <article class="card viz-card" id="V-SECONDARY-001">
      <h3>RNA Secondary Structure Viewer (Forna)</h3>
      <p>Forna module with custom nucleotide colors (aptamer-style).</p>
      <div id="custom_colors" class="forna-host"></div>
      <form onsubmit="return false" class="optionsform">
        <textarea id="CustomColorText" name="hide" style="display:none;">1-5:#68AF31 56:blue 40:red 59-63:#68AF31 7-12:#18529A 14:#18529A 17-25:#18529A 29-34:#18529A 42-45:#C06D23 52-55:#C06D23</textarea>
      </form>
      <div id="forna-status" class="mini-note">Forna loading…</div>
    </article>

  </section>`;
}

function aggregate(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    map.set(value, (map.get(value) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function toPiePaths(entries) {
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  let angle = -Math.PI / 2;
  const cx = 90;
  const cy = 90;
  const r = 75;

  return entries.map(([label, value], idx) => {
    const portion = (value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + portion;
    angle = end;

    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = portion > Math.PI ? 1 : 0;

    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { label, value, path, idx };
  });
}

export function initHeaderSearch() {
  const input = document.getElementById('search-box-header');
  const button = document.getElementById('search-button-header');
  const results = document.getElementById('search-results-header');
  if (!input || !button || !results) return;

  function performSearch() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.style.display = 'none';
      results.innerHTML = '';
      return;
    }

    const matched = aptamerMultiSelectRows.filter((row) => {
      const text = `${row.sequenceName} ${row.aptamerName} ${row.category} ${row.description} ${row.pdbId}`.toLowerCase();
      return text.includes(q);
    });

    results.innerHTML = matched.length
      ? matched
          .slice(0, 8)
          .map(
            (row) => `<a class="search-result-item" href="#probing"><strong>${row.aptamerName}</strong> · ${row.category} · ${row.year} <span>${row.pdbId}</span></a>`
          )
          .join('')
      : '<div class="search-result-item muted">No results found.</div>';

    results.style.display = 'block';
  }

  if (input.dataset.boundSearch !== 'true') {
    input.addEventListener('input', performSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
      }
    });
    button.addEventListener('click', performSearch);
    input.dataset.boundSearch = 'true';
  }

  if (!window.__headerSearchDocBound) {
    document.addEventListener('click', (e) => {
      const liveResults = document.getElementById('search-results-header');
      const liveInput = document.getElementById('search-box-header');
      const liveButton = document.getElementById('search-button-header');
      if (!liveResults || !liveInput || !liveButton) return;
      if (!liveResults.contains(e.target) && e.target !== liveInput && e.target !== liveButton && !liveButton.contains(e.target)) {
        liveResults.style.display = 'none';
      }
    });
    window.__headerSearchDocBound = true;
  }
}

export function initAptamerMultiSelect() {
  const yearChart = document.getElementById('yearChart');
  const ligandChart = document.getElementById('ligandChart');
  const tableBody = document.getElementById('tableBody');
  const tableInfo = document.getElementById('tableInfo');
  const filterTags = document.getElementById('filterTags');
  const resetBtn = document.getElementById('resetAllFilters');
  const currentCount = document.getElementById('currentCount');
  const filterPercentage = document.getElementById('filterPercentage');

  if (!yearChart || !ligandChart || !tableBody) return;

  const totalRows = aptamerMultiSelectRows.length;
  const selectedYears = new Set();
  const selectedCategories = new Set();

  const yearAgg = aggregate(aptamerMultiSelectRows, 'year');
  const categoryAgg = aggregate(aptamerMultiSelectRows, 'category');

  function applyFilters() {
    return aptamerMultiSelectRows.filter((row) => {
      const yearPass = selectedYears.size === 0 || selectedYears.has(row.year);
      const catPass = selectedCategories.size === 0 || selectedCategories.has(row.category);
      return yearPass && catPass;
    });
  }

  function renderYearChart() {
    const max = Math.max(...yearAgg.map(([, n]) => n), 1);
    yearChart.innerHTML = `<div class="bar-chart">${yearAgg
      .map(([year, count]) => {
        const active = selectedYears.has(year);
        const h = Math.round((count / max) * 100);
        return `<button class="bar ${active ? 'active' : ''}" data-year="${year}" title="${year}: ${count}">
          <span class="bar-fill" style="height:${h}%"></span>
          <span class="bar-label">${year}</span>
        </button>`;
      })
      .join('')}</div>`;

    yearChart.querySelectorAll('.bar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const year = Number(btn.dataset.year);
        if (selectedYears.has(year)) selectedYears.delete(year);
        else selectedYears.add(year);
        refresh();
      });
    });
  }

  function renderPieChart() {
    const sectors = toPiePaths(categoryAgg);
    const colors = ['var(--primary)', 'var(--accent)', 'var(--primarySoft)', '#7c3aed', '#16a34a'];

    ligandChart.innerHTML = `
      <div class="pie-layout">
        <svg viewBox="0 0 180 180" class="pie-svg" aria-label="category pie chart">
          ${sectors
            .map(
              (s, i) => `<path d="${s.path}" data-category="${s.label}" fill="${colors[i % colors.length]}" class="pie-sector ${
                selectedCategories.has(s.label) ? 'active' : ''
              }"></path>`
            )
            .join('')}
        </svg>
        <div class="pie-legend">
          ${categoryAgg
            .map(
              ([label, count], i) => `<button class="legend-item ${selectedCategories.has(label) ? 'active' : ''}" data-category="${label}">
              <span class="dot" style="background:${colors[i % colors.length]}"></span>${label} (${count})</button>`
            )
            .join('')}
        </div>
      </div>`;

    const toggle = (cat) => {
      if (selectedCategories.has(cat)) selectedCategories.delete(cat);
      else selectedCategories.add(cat);
      refresh();
    };

    ligandChart.querySelectorAll('[data-category]').forEach((el) => {
      el.addEventListener('click', () => toggle(el.dataset.category));
    });
  }

  function renderFilterTags() {
    const tags = [
      ...[...selectedYears].map((y) => ({ kind: 'year', value: y })),
      ...[...selectedCategories].map((c) => ({ kind: 'category', value: c }))
    ];

    filterTags.innerHTML = tags.length
      ? tags
          .map(
            (t) => `<button class="chip" data-kind="${t.kind}" data-value="${t.value}">${t.kind}: ${t.value} ×</button>`
          )
          .join('')
      : '<span class="mini-note">No active filters</span>';

    filterTags.querySelectorAll('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.kind;
        const value = btn.dataset.value;
        if (kind === 'year') selectedYears.delete(Number(value));
        if (kind === 'category') selectedCategories.delete(value);
        refresh();
      });
    });
  }

  function renderTable() {
    const rows = applyFilters();
    tableBody.innerHTML = rows
      .map(
        (row, idx) => `<tr>
      <td>${idx + 1}</td>
      <td>${row.sequenceName}</td>
      <td>${row.aptamerName}</td>
      <td>${row.year}</td>
      <td>${row.category}</td>
      <td>${row.sequence}</td>
      <td>${row.description}</td>
    </tr>`
      )
      .join('');

    tableInfo.textContent = `Showing ${rows.length} of ${totalRows} entries`;
    currentCount.textContent = String(rows.length);
    filterPercentage.textContent = `${Math.round((rows.length / totalRows) * 100)}%`;
  }

  function refresh() {
    renderYearChart();
    renderPieChart();
    renderFilterTags();
    renderTable();
  }

  resetBtn?.addEventListener('click', () => {
    selectedYears.clear();
    selectedCategories.clear();
    refresh();
  });

  refresh();
}

async function loadMolstarAssets() {
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

const MOLSTAR_SEGMENT_PALETTE = [
  { r: 184, g: 50, b: 51 },
  { r: 46, g: 161, b: 3 },
  { r: 241, g: 125, b: 7 },
  { r: 8, g: 69, b: 149 },
  { r: 180, g: 72, b: 181 },
  { r: 17, g: 138, b: 178 },
  { r: 214, g: 81, b: 118 },
  { r: 120, g: 99, b: 197 }
];

function normalizeRnaSequence(sequence) {
  return String(sequence || '')
    .toUpperCase()
    .replace(/[^ACGUT]/g, '')
    .replace(/T/g, 'U');
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shufflePalette(randomizer) {
  const colors = [...MOLSTAR_SEGMENT_PALETTE];
  for (let index = colors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomizer() * (index + 1));
    [colors[index], colors[swapIndex]] = [colors[swapIndex], colors[index]];
  }
  return colors;
}

function buildRandomMolstarSelections(sequence, seedLabel = 'RNA', chainId = 'A') {
  const normalizedSequence = normalizeRnaSequence(sequence);
  if (!normalizedSequence) return [];

  const randomizer = createSeededRandom(hashString(`${seedLabel}:${normalizedSequence.length}`));
  const palette = shufflePalette(randomizer);
  const selections = [];
  let residueNumber = 1;
  let colorIndex = 0;

  while (residueNumber <= normalizedSequence.length) {
    const residuesLeft = normalizedSequence.length - residueNumber + 1;
    const segmentSize = Math.min(
      residuesLeft,
      Math.max(1, Math.round((normalizedSequence.length / 6) * (0.55 + randomizer() * 0.9)))
    );

    selections.push({
      struct_asym_id: chainId,
      start_residue_number: residueNumber,
      end_residue_number: residueNumber + segmentSize - 1,
      color: palette[colorIndex % palette.length]
    });

    residueNumber += segmentSize;
    colorIndex += 1;
  }

  return selections;
}

function applyMolstarColoring(viewer, sequence, seedLabel, chainId = 'A', attempt = 0) {
  const selections = buildRandomMolstarSelections(sequence, seedLabel, chainId);
  if (!viewer?.visual?.select || !selections.length) return;

  window.setTimeout(() => {
    try {
      if (viewer.visual.clearSelection) {
        viewer.visual.clearSelection();
      }
      viewer.visual.select({
        data: selections,
        nonSelectedColor: { r: 255, g: 255, b: 255 }
      });
    } catch (_error) {
      if (attempt < 8) {
        applyMolstarColoring(viewer, sequence, seedLabel, chainId, attempt + 1);
      }
    }
  }, attempt === 0 ? 450 : 250);
}

async function loadFornaAssets() {
  if (!document.getElementById('forna-css')) {
    const css = document.createElement('link');
    css.id = 'forna-css';
    css.rel = 'stylesheet';
    css.type = 'text/css';
    css.href = 'https://www.ribocentre.org/css/fornac.css';
    css.media = 'screen';
    document.head.appendChild(css);
  }

  if (!window.jQuery) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.ribocentre.org/js/jquery.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  if (!window.d3) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.ribocentre.org/js/d3.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  if (!window.fornac) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://www.ribocentre.org/js/demo/rsvfornac.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
}

export async function initSecondaryStructureModule() {
  const status = document.getElementById('forna-status');
  const host = document.getElementById('custom_colors');
  const text = document.getElementById('CustomColorText');
  if (!status || !host || !text) return;

  try {
    await loadFornaAssets();
    host.innerHTML = '';
    const container = new window.fornac.FornaContainer('#custom_colors', {
      applyForce: 1,
      editable: 'true',
      initialSize: [450, 400]
    });

    const options = {
      structure: '(((((.((((((.(..(((()))))...)))))).......((((......))))...)))))',
      sequence: 'GGCGUCCUGGUAUCCAAUCCGGAUGUACUACCAGCUGAUGAGUCCCAAAUAGGACGAAACGCC'
    };

    container.addRNA(options.structure, options);
    container.addCustomColorsText(text.value);
    status.textContent = 'Forna secondary structure loaded.';
  } catch (_e) {
    status.textContent = 'Forna failed to load (remote scripts blocked).';
  }
}

export async function initMolstarModule() {
  const container = document.getElementById('myViewer1');
  const status = document.getElementById('molstar-status');
  const loadBtn = document.getElementById('molstar-load');
  const pdbInput = document.getElementById('molstar-pdb');
  if (!container || !status || !loadBtn || !pdbInput) return;

  let viewer = null;
  const basePath = getGithubPagesBasePath();
  const localPdbUrl = `${basePath}/src/assets/pdb/8k7w_RNA_only.pdb`;

  function renderLocalPdbTextFallback() {
    container.innerHTML = `<div class="mini-note">Mol* script unavailable. Local PDB path:</div><pre class="pdb-fallback">${localPdbUrl}</pre>`;
  }

  async function loadStructureWithViewer(pdbId) {
    const remoteCif = `https://files.rcsb.org/download/${pdbId}.cif`;
    const customData = pdbId === '8K7W' ? { url: localPdbUrl, format: 'pdb' } : { url: remoteCif, format: 'cif' };

    if (!viewer) {
      viewer = new window.PDBeMolstarPlugin();
      viewer.render(container, {
        customData,
        expanded: false,
        hideControls: true,
        bgColor: { r: 255, g: 255, b: 255 }
      });
      return;
    }

    viewer.visual.update({ customData }, true);
  }

  async function loadPdb() {
    const pdbId = (pdbInput.value || '8K7W').trim().toUpperCase();
    status.textContent = `Loading Mol* for ${pdbId}…`;

    try {
      await loadMolstarAssets();
      await loadStructureWithViewer(pdbId);
      status.textContent = pdbId === '8K7W' ? 'Loaded Mol* in #myViewer1 from /src/assets/pdb/8k7w_RNA_only.pdb' : `Loaded Mol* in #myViewer1 for ${pdbId}`;
    } catch (_e) {
      status.textContent = 'Mol* CDN blocked; cannot instantiate viewer. Local path is ready.';
      renderLocalPdbTextFallback();
    }
  }

  loadBtn.addEventListener('click', loadPdb);
  await loadPdb();
}

export async function initSequenceDetailMolstar() {
  const container = document.getElementById('sequence-detail-molstar');
  const status = document.getElementById('sequence-detail-molstar-status');
  if (!container || !status) return;

  const structureUrl = container.dataset.structureUrl;
  const structureFormat = container.dataset.structureFormat || 'cif';
  const structureLabel = container.dataset.structureLabel || 'local structure';
  const sequence = container.dataset.structureSequence || '';
  if (!structureUrl) return;

  try {
    await loadMolstarAssets();
    const viewer = new window.PDBeMolstarPlugin();
    viewer.render(container, {
      customData: { url: structureUrl, format: structureFormat },
      expanded: false,
      hideControls: true,
      bgColor: { r: 255, g: 255, b: 255 }
    });
    applyMolstarColoring(viewer, sequence, structureLabel);

    status.textContent = `Interactive Mol* view loaded from ${structureLabel} with random segmented coloring.`;
  } catch (_e) {
    status.textContent = '3D viewer unavailable right now.';
  }
}

export async function initHomeStructureShowcase() {
  const container = document.getElementById('home-structure-viewer');
  const secondary = document.getElementById('home-secondary-viewer');
  const status = document.getElementById('home-structure-status');
  const meta = document.getElementById('home-structure-meta');
  const chips = Array.from(document.querySelectorAll('.dashboard-structure-chip'));
  if (!container || !status || !chips.length) return;

  let viewer = null;
  const split = secondary?.closest('.dashboard-structure-split');

  function buildSecondaryConfig(pdbName, sequence, structureText = '') {
    const fallbackStructures = {
      '5KPY': '.......................................................................',
      '1AM0': '((((((...........((((((....)))))).))))))',
      '4L81': '................................................................................................',
      '5TPY': '....(((((((((....)))).(((((((.[[[[..)))))))..)))))...]]]](((((....)))))'
    };
    const normalizedSequence = String(sequence || '')
      .replace(/\s+/g, '')
      .toUpperCase()
      .replace(/T/g, 'U');
    const normalizedStructure = String(structureText || '')
      .replace(/\s+/g, '')
      .trim();
    const fallbackStructure = fallbackStructures[pdbName] || '';
    const selectedStructure =
      normalizedStructure && normalizedStructure.length === normalizedSequence.length
        ? normalizedStructure
        : fallbackStructure && fallbackStructure.length === normalizedSequence.length
          ? fallbackStructure
          : '';

    if (!normalizedSequence || !selectedStructure || normalizedSequence.length !== selectedStructure.length) {
      return null;
    }

    return {
      sequence: normalizedSequence,
      structure: selectedStructure
    };
  }

  function buildCustomColorsText(sequence) {
    const nucleotideColors = {
      A: '#68AF31',
      U: '#18529A',
      G: '#C06D23',
      C: '#DA4E6D'
    };

    return sequence
      .split('')
      .map((base, index) => {
        const color = nucleotideColors[base];
        return color ? `${index + 1}:${color}` : '';
      })
      .filter(Boolean)
      .join(' ');
  }

  function renderSecondary(pdbName, sequence, structureText = '') {
    if (!secondary) return false;

    const config = buildSecondaryConfig(pdbName, sequence, structureText);
    if (!config) {
      secondary.innerHTML = '';
      secondary.hidden = true;
      split?.classList.add('secondary-missing');
      return false;
    }

    secondary.hidden = false;
    split?.classList.remove('secondary-missing');

    const hostId = `home-secondary-forna-${String(pdbName || 'rna').toLowerCase()}`;
    secondary.innerHTML = `
      <section class="home-secondary-forna-panel">
        <div class="home-secondary-forna-copy">
          <h3>RNA Secondary Structure Viewer (Forna)</h3>
          <p>Forna module with custom nucleotide colors (aptamer-style).</p>
        </div>
        <div class="home-secondary-forna-frame">
          <div id="${hostId}" class="home-secondary-forna-host"></div>
        </div>
        <div class="home-secondary-forna-note">Secondary structure viewer reserved for future rendering.</div>
      </section>
    `;
    const host = document.getElementById(hostId);
    if (host) {
      host.innerHTML = '';
    }
    return true;
  }

  async function loadStructure(url, label, name, sequence, structureText) {
    status.textContent = `Loading ${label}…`;

    try {
      await loadMolstarAssets();

      if (!viewer) {
        viewer = new window.PDBeMolstarPlugin();
        viewer.render(container, {
          customData: { url, format: 'cif' },
          expanded: false,
          hideControls: true,
          bgColor: { r: 255, g: 255, b: 255 }
        });
      } else {
        viewer.visual.update(
          {
            customData: { url, format: 'cif' },
            bgColor: { r: 255, g: 255, b: 255 }
          },
          true
        );
      }

      applyMolstarColoring(viewer, sequence, label);

      if (meta) {
        meta.innerHTML = `<strong>${name}</strong><span>${label}</span>`;
      }
      renderSecondary(label, sequence, structureText);
      status.textContent = `Interactive Mol* view loaded from ${label} with random segmented coloring.`;
    } catch (_e) {
      renderSecondary(label, sequence, structureText);
      status.textContent = '3D viewer unavailable right now.';
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', async () => {
      chips.forEach((node) => node.classList.remove('active'));
      chip.classList.add('active');
      await loadStructure(
        chip.dataset.homeStructureUrl,
        chip.dataset.homeStructureLabel,
        chip.dataset.homeStructureName,
        chip.dataset.homeStructureSequence,
        chip.dataset.homeStructureStructure
      );
    });
  });

  const first = chips[0];
  await loadStructure(
    first.dataset.homeStructureUrl,
    first.dataset.homeStructureLabel,
    first.dataset.homeStructureName,
    first.dataset.homeStructureSequence,
    first.dataset.homeStructureStructure
  );
}

function parseRdatMatrix(text) {
  const lines = text.split(/\r?\n/);
  const rowLabels = [];
  const reactivityRows = [];
  const errorRows = [];
  let colLabels = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    if (line.startsWith('ANNOTATION_DATA:')) {
      const [, indexPart = ''] = line.split(':');
      const cols = line.split('\t').filter(Boolean);
      const mutationCol = cols.find((entry) => entry.startsWith('mutation:'));
      const index = Number(indexPart.split(/\s+/)[0]);
      rowLabels[index - 1] = mutationCol ? mutationCol.replace('mutation:', '') : `Row ${index}`;
    } else if (line.startsWith('SEQPOS')) {
      colLabels = line.split('\t').slice(1).filter(Boolean);
    } else if (line.startsWith('REACTIVITY_ERROR:')) {
      const [, indexPart = ''] = line.split(':');
      const index = Number(indexPart.split(/\s+/)[0]);
      errorRows[index - 1] = line
        .split('\t')
        .slice(1)
        .filter(Boolean)
        .map((value) => Number.parseFloat(value));
    } else if (line.startsWith('REACTIVITY:')) {
      const [, indexPart = ''] = line.split(':');
      const index = Number(indexPart.split(/\s+/)[0]);
      reactivityRows[index - 1] = line
        .split('\t')
        .slice(1)
        .filter(Boolean)
        .map((value) => Number.parseFloat(value));
    }
  }

  return { rowLabels, colLabels, reactivityRows, errorRows };
}

function formatHeatmapLabel(label) {
  if (!label) return '';
  if (label === 'WT') return 'WT';
  const match = label.match(/^([AUGC])(\d+)([AUGC])$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : label;
}

export async function initSequenceDetailSecondaryHeatmap() {
  const host = document.getElementById('sequence-secondary-heatmap');
  const status = document.getElementById('sequence-secondary-heatmap-status');
  if (!host || !status) return;

  const rdatUrl = host.dataset.rdatUrl;
  if (!rdatUrl) return;

  try {
    const response = await fetch(rdatUrl);
    if (!response.ok) throw new Error('Failed to load RDAT');
    const text = await response.text();
    const parsed = parseRdatMatrix(text);
    const labelGap = 10;
    const leftLabelBand = 28;
    const rightLabelBand = 64;
    const topLabelBand = 58;
    const bottomLabelBand = 28;
    const rows = parsed.reactivityRows.length;
    const cols = parsed.colLabels.length;
    const hostWidth = Math.floor(host.getBoundingClientRect().width || host.clientWidth || 0);
    const availableWidth = Math.min(760, Math.max(620, hostWidth - 28));
    const cellSize = Math.min(12, Math.max(8, Math.floor((availableWidth - leftLabelBand - rightLabelBand) / cols)));
    const width = leftLabelBand + cols * cellSize + rightLabelBand;
    const height = topLabelBand + rows * cellSize + bottomLabelBand;

    host.innerHTML = `
      <div class="sequence-secondary-heatmap-scroll">
        <div class="sequence-secondary-heatmap-stage">
          <canvas class="sequence-secondary-heatmap-canvas"></canvas>
          <div class="sequence-secondary-heatmap-tooltip" hidden></div>
        </div>
      </div>
    `;

    const canvas = host.querySelector('canvas');
    const tooltip = host.querySelector('.sequence-secondary-heatmap-tooltip');
    const stage = host.querySelector('.sequence-secondary-heatmap-stage');
    const ctx = canvas?.getContext('2d');
    if (!ctx || !tooltip || !stage) throw new Error('Canvas unavailable');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const flatValues = parsed.reactivityRows.flat().filter((value) => Number.isFinite(value));
    const maxValue = Math.max(...flatValues, 1);
    const font = `${Math.max(10, cellSize - 2)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
    const monoFont = `${Math.max(10, cellSize - 2)}px Menlo, Consolas, monospace`;

    function paint(activeCell = null) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        const y = topLabelBand + row * cellSize;
        ctx.fillStyle = '#69d9ca';
        ctx.font = `italic ${Math.max(10, cellSize - 1)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(row + 1), leftLabelBand - labelGap, y + cellSize / 2);

        ctx.fillStyle = '#101010';
        ctx.font = font;
        ctx.textAlign = 'left';
        ctx.fillText(formatHeatmapLabel(parsed.rowLabels[row]), leftLabelBand + cols * cellSize + labelGap, y + cellSize / 2);

        for (let col = 0; col < cols; col += 1) {
          const x = leftLabelBand + col * cellSize;
          const value = parsed.reactivityRows[row]?.[col] ?? 0;
          const normalized = Math.max(0, Math.min(1, value / maxValue));
          const shade = Math.round(255 - normalized * 255);
          ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
          ctx.fillRect(x, y, cellSize, cellSize);
          ctx.strokeStyle = '#202020';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cellSize, cellSize);
        }
      }

      for (let col = 0; col < cols; col += 1) {
        const x = leftLabelBand + col * cellSize + cellSize / 2;
        const label = parsed.colLabels[col];
        const base = label.match(/^([AUGC])(\d+)$/);
        const nt = base?.[1] ?? '';
        const pos = base?.[2] ?? label;

        ctx.save();
        ctx.translate(x, topLabelBand - labelGap);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = monoFont;
        ctx.fillStyle = nt === 'A' ? '#ff8c42' : nt === 'U' ? '#4b9cff' : nt === 'G' ? '#ff5a36' : '#4dbb63';
        ctx.fillText(nt, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(x, topLabelBand - labelGap - 16);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = font;
        ctx.fillStyle = '#101010';
        ctx.fillText(pos, 0, 0);
        ctx.restore();

        ctx.save();
        ctx.translate(x, height - bottomLabelBand + labelGap);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = `italic ${Math.max(9, cellSize - 3)}px system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = '#7fe5d9';
        ctx.fillText(String(col + 1), 0, 0);
        ctx.restore();
      }

      if (activeCell) {
        const { row, col } = activeCell;
        const x = leftLabelBand + col * cellSize;
        const y = topLabelBand + row * cellSize;
        ctx.strokeStyle = '#b892ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.strokeStyle = 'rgba(184, 146, 255, 0.65)';
        ctx.beginPath();
        ctx.moveTo(leftLabelBand, y + cellSize / 2);
        ctx.lineTo(leftLabelBand + cols * cellSize, y + cellSize / 2);
        ctx.moveTo(x + cellSize / 2, topLabelBand);
        ctx.lineTo(x + cellSize / 2, topLabelBand + rows * cellSize);
        ctx.stroke();
      }
    }

    paint();

    stage.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const col = Math.floor((x - leftLabelBand) / cellSize);
      const row = Math.floor((y - topLabelBand) / cellSize);

      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        tooltip.hidden = true;
        paint();
        return;
      }

      const activeCell = { row, col };
      paint(activeCell);

      const rowLabel = formatHeatmapLabel(parsed.rowLabels[row]);
      const colLabel = formatHeatmapLabel(parsed.colLabels[col]);
      const base = colLabel.match(/^([AUGC])\d+$/)?.[1] ?? '';
      const value = parsed.reactivityRows[row]?.[col];
      const error = parsed.errorRows[row]?.[col];

      tooltip.innerHTML = `
        <div><span>ROW</span><strong>${row + 1}: ${rowLabel}</strong></div>
        <div><span>COLUMN</span><strong>${col + 1}: ${colLabel}</strong></div>
        <div><span>SEQUENCE</span><strong>${base || '—'}</strong></div>
        <div><span>REACTIVITY</span><strong>${Number.isFinite(value) ? value.toFixed(3) : '—'}</strong></div>
        <div><span>ERROR</span><strong>${Number.isFinite(error) ? error.toFixed(3) : '—'}</strong></div>
      `;
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(x + 22, width - 210)}px`;
      tooltip.style.top = `${Math.min(y + 22, height - 150)}px`;
    });

    stage.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
      paint();
    });

    status.textContent = 'Hover any cell to inspect mutation, position, reactivity, and error.';
  } catch (_error) {
    status.textContent = 'Heatmap data could not be loaded.';
  }
}
