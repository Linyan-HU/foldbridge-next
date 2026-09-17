import { buildProbingOverviewModel } from './probingArticleView.js';

function errorText(error) {
  return error instanceof Error ? error.message : String(error ?? 'error');
}

function buildEntryView(siteStatsState) {
  if (siteStatsState?.status === 'error') {
    return {
      entryStatus: 'error',
      entryError: errorText(siteStatsState.error),
      entryMetrics: null
    };
  }

  if (siteStatsState?.status !== 'ready') {
    return {
      entryStatus: 'loading',
      entryError: null,
      entryMetrics: null
    };
  }

  try {
    const metrics = siteStatsState.stats.metrics;
    return {
      entryStatus: 'ready',
      entryError: null,
      entryMetrics: {
        rnaChains: metrics.rna_chains,
        pdbStructures: metrics.pdb_structures,
        chainsWithProbingProfiles: metrics.chains_with_probing_profiles
      }
    };
  } catch (error) {
    return {
      entryStatus: 'error',
      entryError: errorText(error),
      entryMetrics: null
    };
  }
}

function buildProbingView(probingArticleIndexState) {
  if (probingArticleIndexState === 'error' || probingArticleIndexState?.status === 'error') {
    return {
      probingStatus: 'error',
      probingError: errorText(probingArticleIndexState?.error ?? probingArticleIndexState),
      probingOverview: null
    };
  }

  if (
    probingArticleIndexState == null
    || probingArticleIndexState === 'idle'
    || probingArticleIndexState === 'loading'
    || probingArticleIndexState?.status === 'idle'
    || probingArticleIndexState?.status === 'loading'
  ) {
    return {
      probingStatus: 'loading',
      probingError: null,
      probingOverview: null
    };
  }

  try {
    const overview = buildProbingOverviewModel(probingArticleIndexState);
    return {
      probingStatus: 'ready',
      probingError: null,
      probingOverview: overview
    };
  } catch (error) {
    return {
      probingStatus: 'error',
      probingError: errorText(error),
      probingOverview: null
    };
  }
}

export function buildDashboardViewModel(siteStatsState, probingArticleIndexState) {
  return {
    ...buildEntryView(siteStatsState),
    ...buildProbingView(probingArticleIndexState)
  };
}
