import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderHomeHero,
  renderHomeModuleCards,
  renderHomeScrollStory
} from '../src/siteChrome.js';

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

const CASE_DATA = {
  molecule_label: 'Test RNA',
  pdb_id: '1ABC',
  chain: 'A',
  confidence_label: 'supported',
  sequence: ['A'],
  reactivity: [0.5],
  scenes: [{ n: '01', title: 'Signal', body: 'One representative record.' }]
};

function withStatuses(entryStatus, probingStatus) {
  return {
    ...DASHBOARD_VIEW,
    entryStatus,
    entryError: entryStatus === 'error' ? 'entry metrics failed' : null,
    entryMetrics: entryStatus === 'ready' ? DASHBOARD_VIEW.entryMetrics : null,
    probingStatus,
    probingError: probingStatus === 'error' ? 'probing overview failed' : null,
    probingOverview: probingStatus === 'ready' ? DASHBOARD_VIEW.probingOverview : null
  };
}

test('renderHomeHero uses the current Entry and Probing dashboard metrics', () => {
  const html = renderHomeHero(DASHBOARD_VIEW);

  for (const value of ['17,843', '5,321', '28']) assert.match(html, new RegExp(value));
  for (const label of ['RNA chains', 'PDB structures', 'Probing methods']) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /4,664|2,386|510|High confidence|high-confidence/i);
});

test('renderHomeModuleCards describes the current PDB and probing method coverage', () => {
  const html = renderHomeModuleCards(DASHBOARD_VIEW);

  assert.match(html, /5,321 structure-linked PDB entries/);
  assert.match(html, /28 probing methods across 5 mechanism families/);
  assert.doesNotMatch(html, /4,664|2,386|510|explainer articles|High confidence/i);
});

test('renderHomeScrollStory uses the current PDB structure count in its closing', () => {
  const html = renderHomeScrollStory(CASE_DATA, { dashboardView: DASHBOARD_VIEW });

  assert.match(html, /5,321 structure-linked records/);
  assert.doesNotMatch(html, /2,386|510|High confidence/i);
});

for (const [entryStatus, probingStatus] of [
  ['ready', 'ready'],
  ['ready', 'error'],
  ['error', 'ready'],
  ['error', 'error']
]) {
  test(`home renderers keep Entry ${entryStatus} and Probing ${probingStatus} independent`, () => {
    const dashboardView = withStatuses(entryStatus, probingStatus);
    const html = [
      renderHomeHero(dashboardView),
      renderHomeScrollStory(CASE_DATA, { dashboardView })
    ].join('\n');

    assert.match(html, /Follow one RNA from/);
    assert.match(html, /Browse Entry table/);
    if (entryStatus === 'ready') {
      assert.match(html, /17,843/);
      assert.match(html, /5,321/);
      assert.doesNotMatch(html, /Entry statistics unavailable/);
    } else {
      assert.match(html, /Entry statistics unavailable/);
      assert.doesNotMatch(html, /17,843|5,321|4,664|2,386|510/);
    }
    if (probingStatus === 'ready') {
      assert.match(html, /<strong>28<\/strong>/);
      assert.doesNotMatch(html, /Probing methods unavailable/);
    } else {
      assert.match(html, /Probing methods unavailable/);
      assert.doesNotMatch(html, /<strong>28<\/strong>/);
    }
  });
}

test('home loading metrics render explicit placeholders without stale values', () => {
  const dashboardView = withStatuses('loading', 'loading');
  const html = `${renderHomeHero(dashboardView)}${renderHomeModuleCards(dashboardView)}`;

  assert.match(html, /dashboard-metric--loading/);
  assert.match(html, /Entry statistics loading/);
  assert.match(html, /Probing methods loading/);
  assert.match(html, />—</);
  assert.doesNotMatch(html, /undefined|4,664|2,386|510/);
});

test('home loading state does not hide the other ready data source', () => {
  const entryReady = renderHomeHero(withStatuses('ready', 'loading'));
  assert.match(entryReady, /17,843/);
  assert.match(entryReady, /Probing methods loading/);
  assert.doesNotMatch(entryReady, /Entry statistics loading/);

  const probingReady = renderHomeHero(withStatuses('loading', 'ready'));
  assert.match(probingReady, /28/);
  assert.match(probingReady, /Entry statistics loading/);
  assert.doesNotMatch(probingReady, /Probing methods loading/);
});

test('ready sources with null metrics render unavailable instead of zero', () => {
  const dashboardView = {
    ...DASHBOARD_VIEW,
    entryMetrics: { ...DASHBOARD_VIEW.entryMetrics, pdbStructures: null },
    probingOverview: { ...DASHBOARD_VIEW.probingOverview, familyCount: null }
  };
  const html = `${renderHomeHero(dashboardView)}${renderHomeModuleCards(dashboardView)}`;

  assert.match(html, /Entry statistics unavailable/);
  assert.match(html, /Probing methods unavailable/);
  assert.doesNotMatch(html, /0 structure-linked PDB entries|across 0 mechanism families/);
});

for (const invalidMetric of [' ', true, false, -1, 1.5]) {
  test(`ready sources reject invalid public metric ${JSON.stringify(invalidMetric)}`, () => {
    const dashboardView = {
      ...DASHBOARD_VIEW,
      entryMetrics: { ...DASHBOARD_VIEW.entryMetrics, pdbStructures: invalidMetric },
      probingOverview: { ...DASHBOARD_VIEW.probingOverview, methodCount: invalidMetric }
    };
    const html = renderHomeHero(dashboardView);

    assert.match(html, /<p>PDB structures<\/p>\s*<strong>—<\/strong>\s*<span>Entry statistics unavailable<\/span>/);
    assert.match(html, /<p>Probing methods<\/p>\s*<strong>—<\/strong>\s*<span>Probing methods unavailable<\/span>/);
  });
}
