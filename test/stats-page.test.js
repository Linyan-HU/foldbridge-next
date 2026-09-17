import assert from 'node:assert/strict';
import test from 'node:test';

import { renderStatsPage } from '../src/siteChrome.js';
import { emptyStatsFilters } from '../src/statsDashboard.js';

const ROWS = [
  { pdb_id: '1AAA', chain_key: 'A[A]', partition: 'rRNA', n_profiles: 3, entry_confidence_class: 'high', source_lanes: 'geo,rmdb' },
  { pdb_id: '1AAA', chain_key: 'B[B]', partition: 'rRNA', n_profiles: 0, entry_confidence_class: 'low', source_lanes: 'rmdb' },
  { pdb_id: '2BBB', chain_key: 'A[A]', partition: 'tRNA', n_profiles: 2, entry_confidence_class: 'not_supported', source_lanes: 'rasp' }
];

const DASHBOARD_VIEW = {
  entryStatus: 'ready',
  entryError: null,
  entryMetrics: {
    rnaChains: 17843,
    pdbStructures: 5321,
    chainsWithProbingProfiles: 14953
  },
  probingStatus: 'ready',
  probingError: null,
  probingOverview: { methodCount: 28, familyCount: 5 }
};

function withStatuses(entryStatus, probingStatus) {
  return {
    ...DASHBOARD_VIEW,
    entryStatus,
    entryError: entryStatus === 'error' ? 'entry table contract does not match stats' : null,
    entryMetrics: entryStatus === 'ready' ? DASHBOARD_VIEW.entryMetrics : null,
    probingStatus,
    probingError: probingStatus === 'error' ? 'probing overview could not be built' : null,
    probingOverview: probingStatus === 'ready' ? DASHBOARD_VIEW.probingOverview : null
  };
}

function panel(html, dimension) {
  const match = html.match(new RegExp(`<section[^>]*data-stats-panel="${dimension}"[\\s\\S]*?<\\/section>`));
  assert.ok(match, `${dimension} panel should be present`);
  return match[0];
}

test('renderStatsPage renders only the four public dashboard metrics', () => {
  const html = renderStatsPage({ dashboardView: DASHBOARD_VIEW, rows: ROWS, filters: emptyStatsFilters() });

  for (const label of ['RNA chains', 'PDB structures', 'Chains with probing profiles', 'Probing methods']) {
    assert.match(html, new RegExp(label));
  }
  for (const value of ['17,843', '5,321', '14,953', '28']) assert.match(html, new RegExp(value));
  assert.equal((html.match(/class="stats-metric(?: |")/g) || []).length, 4);
  assert.doesNotMatch(html, /PDBs with ≥1 high-confidence chain|Registered technologies|Explainer articles|Chemical probing entries|Measurement families/i);
});

test('renderStatsPage exposes only RNA class and source facets', () => {
  const html = renderStatsPage({ dashboardView: DASHBOARD_VIEW, rows: ROWS, filters: emptyStatsFilters() });

  assert.match(html, /data-stats-panel="rna_class"/);
  assert.match(html, /data-stats-panel="source"/);
  assert.doesNotMatch(html, /data-stats-panel="confidence"|data-stats-filter-dimension="confidence"|Chain confidence/i);
  assert.equal((html.match(/data-stats-panel=/g) || []).length, 2);
  assert.match(html, /Source categories overlap/);
});

test('selecting an RNA class recalculates source counts, percentages, and bar lengths', () => {
  const filters = { rna_class: 'rRNA', source: null };
  const html = renderStatsPage({ dashboardView: DASHBOARD_VIEW, rows: ROWS, filters });
  const source = panel(html, 'source');

  assert.match(source, /data-stats-filter-value="geo"[\s\S]*?>1 <small>50\.0%<\/small>[\s\S]*?--stats-bar-width:50\.00%/);
  assert.match(source, /data-stats-filter-value="rmdb"[\s\S]*?>2 <small>100\.0%<\/small>[\s\S]*?--stats-bar-width:100\.00%/);
  assert.doesNotMatch(source, /data-stats-filter-value="rasp"/);
  assert.match(html, /Showing <strong>2<\/strong> of 17,843 RNA chains across <strong>1<\/strong> of 5,321 PDB structures/);
});

test('selecting a source recalculates RNA class counts, percentages, and bar lengths', () => {
  const filters = { rna_class: null, source: 'rmdb' };
  const html = renderStatsPage({ dashboardView: DASHBOARD_VIEW, rows: ROWS, filters });
  const rnaClass = panel(html, 'rna_class');

  assert.match(rnaClass, /data-stats-filter-value="rRNA"[\s\S]*?>2 <small>100\.0%<\/small>[\s\S]*?--stats-bar-width:100\.00%/);
  assert.doesNotMatch(rnaClass, /data-stats-filter-value="tRNA"/);
  assert.match(html, /data-stats-filter-chip="source"/);
  assert.match(html, /data-stats-filter-value="rmdb"[\s\S]*aria-pressed="true"/);
});

test('an empty facet context renders an explicit empty state and finite HTML', () => {
  const filters = { rna_class: 'missing class', source: null };
  const html = renderStatsPage({ dashboardView: DASHBOARD_VIEW, rows: ROWS, filters });
  const source = panel(html, 'source');

  assert.match(source, /No chains match this filter context/);
  assert.doesNotMatch(html, /NaN|Infinity|undefined/);
});

for (const [entryStatus, probingStatus] of [
  ['ready', 'ready'],
  ['ready', 'error'],
  ['error', 'ready'],
  ['error', 'error']
]) {
  test(`renderStatsPage keeps Entry ${entryStatus} and Probing ${probingStatus} independent`, () => {
    const dashboardView = withStatuses(entryStatus, probingStatus);
    const html = renderStatsPage({ dashboardView, rows: ROWS, filters: emptyStatsFilters() });

    assert.match(html, /<h1>Statistics<\/h1>/);
    assert.match(html, /RNA chains/);
    assert.match(html, /Probing methods/);
    if (entryStatus === 'ready') {
      assert.match(html, /17,843|5,321|14,953/);
      assert.match(html, /data-stats-panel="rna_class"/);
      assert.doesNotMatch(html, /Entry statistics unavailable/);
    } else {
      assert.match(html, /Entry statistics unavailable/);
      assert.match(html, /stats-charts-status--error/);
      assert.doesNotMatch(html, /17,843|5,321|14,953|data-stats-panel=/);
    }
    if (probingStatus === 'ready') {
      assert.match(html, />28<\/span>[\s\S]*Probing methods/);
      assert.doesNotMatch(html, /Probing methods unavailable/);
    } else {
      assert.match(html, /Probing methods unavailable/);
      assert.doesNotMatch(html, />28<\/span>[\s\S]*Probing methods/);
    }
    assert.doesNotMatch(html, /4,664|2,386|510|undefined/);
  });
}

test('renderStatsPage keeps the full loading shell without undefined values', () => {
  const dashboardView = withStatuses('loading', 'loading');
  const html = renderStatsPage({ dashboardView, rows: [], filters: emptyStatsFilters() });

  assert.match(html, /<h1>Statistics<\/h1>/);
  assert.equal((html.match(/class="stats-metric(?: |")/g) || []).length, 4);
  assert.match(html, /Entry statistics loading/);
  assert.match(html, /Probing methods loading/);
  assert.match(html, /stats-charts-status--loading/);
  assert.doesNotMatch(html, /undefined|NaN|Infinity|4,664|2,386|510/);
});

test('renderStatsPage loading state does not hide the other ready data source', () => {
  const entryReady = renderStatsPage({
    dashboardView: withStatuses('ready', 'loading'),
    rows: ROWS,
    filters: emptyStatsFilters()
  });
  assert.match(entryReady, /17,843/);
  assert.match(entryReady, /data-stats-panel="rna_class"/);
  assert.match(entryReady, /Probing methods loading/);

  const probingReady = renderStatsPage({
    dashboardView: withStatuses('loading', 'ready'),
    rows: ROWS,
    filters: emptyStatsFilters()
  });
  assert.match(probingReady, />28<\/span>[\s\S]*Probing methods/);
  assert.match(probingReady, /stats-charts-status--loading/);
  assert.doesNotMatch(probingReady, /data-stats-panel=/);
});

test('ready Entry state with a null metric makes charts unavailable, not loading', () => {
  const dashboardView = {
    ...DASHBOARD_VIEW,
    entryMetrics: { ...DASHBOARD_VIEW.entryMetrics, pdbStructures: null }
  };
  const html = renderStatsPage({ dashboardView, rows: ROWS, filters: emptyStatsFilters() });

  assert.match(html, /Entry statistics unavailable/);
  assert.match(html, /stats-charts-status--error/);
  assert.doesNotMatch(html, /stats-charts-status--loading|data-stats-panel=/);
  assert.match(html, />28<\/span>[\s\S]*Probing methods/);
});
