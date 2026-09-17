import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildDashboardViewModel } from '../src/dashboardViewModel.js';
import { buildProbingOverviewModel } from '../src/probingArticleView.js';

const PROBING_INDEX = JSON.parse(readFileSync(
  new URL('../src/assets/generated/probing-articles/index.json', import.meta.url),
  'utf8'
));

const SITE_READY = {
  status: 'ready',
  stats: {
    metrics: {
      rna_chains: 17843,
      pdb_structures: 5321,
      chains_with_probing_profiles: 14953,
      pdbs_with_high_confidence_chain: 2861,
      registered_technologies: 34,
      explainer_articles: 37
    }
  },
  rows: []
};

const ENTRY_READY = {
  entryStatus: 'ready',
  entryError: null,
  entryMetrics: {
    rnaChains: 17843,
    pdbStructures: 5321,
    chainsWithProbingProfiles: 14953
  }
};

const PROBING_READY = {
  probingStatus: 'ready',
  probingError: null,
  probingOverview: buildProbingOverviewModel(PROBING_INDEX)
};

test('buildDashboardViewModel maps ready Entry and ready Probing independently', () => {
  assert.deepEqual(buildDashboardViewModel(SITE_READY, PROBING_INDEX), {
    ...ENTRY_READY,
    ...PROBING_READY
  });
});

test('buildDashboardViewModel preserves ready Entry when Probing fails', () => {
  assert.deepEqual(buildDashboardViewModel(SITE_READY, 'error'), {
    ...ENTRY_READY,
    probingStatus: 'error',
    probingError: 'error',
    probingOverview: null
  });
});

test('buildDashboardViewModel preserves ready Probing when Entry fails', () => {
  assert.deepEqual(buildDashboardViewModel(
    { status: 'error', error: 'entry table contract does not match stats asset' },
    PROBING_INDEX
  ), {
    entryStatus: 'error',
    entryError: 'entry table contract does not match stats asset',
    entryMetrics: null,
    ...PROBING_READY
  });
});

test('buildDashboardViewModel keeps two failures and their errors separate', () => {
  assert.deepEqual(buildDashboardViewModel(
    { status: 'error', error: 'entry failed' },
    { status: 'error', error: 'probing failed' }
  ), {
    entryStatus: 'error',
    entryError: 'entry failed',
    entryMetrics: null,
    probingStatus: 'error',
    probingError: 'probing failed',
    probingOverview: null
  });
});

test('buildDashboardViewModel maps idle and loading sources to renderer loading state', () => {
  assert.deepEqual(buildDashboardViewModel({ status: 'idle' }, null), {
    entryStatus: 'loading',
    entryError: null,
    entryMetrics: null,
    probingStatus: 'loading',
    probingError: null,
    probingOverview: null
  });

  assert.deepEqual(buildDashboardViewModel({ status: 'loading' }, 'loading'), {
    entryStatus: 'loading',
    entryError: null,
    entryMetrics: null,
    probingStatus: 'loading',
    probingError: null,
    probingOverview: null
  });
});

test('a Probing overview derivation failure does not throw away ready Entry metrics', () => {
  const brokenIndex = new Proxy({}, {
    get(_target, property) {
      if (property === 'families') throw new Error('probing index families are unreadable');
      return undefined;
    }
  });

  assert.deepEqual(buildDashboardViewModel(SITE_READY, brokenIndex), {
    ...ENTRY_READY,
    probingStatus: 'error',
    probingError: 'probing index families are unreadable',
    probingOverview: null
  });
});

test('an explicitly ready but empty Probing index becomes an isolated Probing error', () => {
  assert.deepEqual(buildDashboardViewModel(SITE_READY, { status: 'ready', data: {} }), {
    ...ENTRY_READY,
    probingStatus: 'error',
    probingError: 'probing index families must be an array',
    probingOverview: null
  });
});

test('a ready Probing index missing a curated family becomes an isolated error', () => {
  const indexMissingShape = {
    ...PROBING_INDEX,
    families: PROBING_INDEX.families.filter((family) => family.id !== 'shape')
  };

  assert.deepEqual(buildDashboardViewModel(
    SITE_READY,
    indexMissingShape
  ), {
    ...ENTRY_READY,
    probingStatus: 'error',
    probingError: 'probing index is missing curated public family: shape',
    probingOverview: null
  });
});

test('ready Probing preserves the shared overview families and filters raw extra families', () => {
  const indexWithExtraFamily = {
    ...PROBING_INDEX,
    families: [
      ...PROBING_INDEX.families,
      { id: 'extra-family', title: 'Extra family', summary: 'Raw only', articles: [] }
    ]
  };

  const view = buildDashboardViewModel(SITE_READY, indexWithExtraFamily);

  assert.equal(view.probingStatus, 'ready');
  assert.equal(view.probingOverview.methodCount, 28);
  assert.equal(view.probingOverview.familyCount, 5);
  assert.equal(view.probingOverview.families.length, 5);
  assert.deepEqual(
    view.probingOverview.families.map((family) => family.id),
    ['dms', 'shape', 'in-cell-shape', 'footprinting', 'carbodiimide-special']
  );
});
