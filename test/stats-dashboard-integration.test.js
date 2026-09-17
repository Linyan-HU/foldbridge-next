import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const MAIN_SOURCE = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const DASHBOARD_VIEW_MODEL_SOURCE = fs.readFileSync(new URL('../src/dashboardViewModel.js', import.meta.url), 'utf8');
const STYLES_SOURCE = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function functionSource(name, nextName) {
  const start = MAIN_SOURCE.indexOf(`function ${name}(`);
  const end = MAIN_SOURCE.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} should exist in main.js`);
  assert.notEqual(end, -1, `${nextName} should follow ${name} in main.js`);
  return MAIN_SOURCE.slice(start, end);
}

test('the pure dashboard view model owns probing derivation and main imports only the combined builder', () => {
  assert.match(DASHBOARD_VIEW_MODEL_SOURCE, /import\s*\{\s*buildProbingOverviewModel\s*\}\s*from\s*['"]\.\/probingArticleView\.js['"]/);
  assert.match(MAIN_SOURCE, /import\s*\{\s*buildDashboardViewModel\s*\}\s*from\s*['"]\.\/dashboardViewModel\.js['"]/);
  assert.doesNotMatch(MAIN_SOURCE, /buildProbingOverviewModel/);
});

test('home builds one dashboard view after ensuring both source loads and shares it with all dashboard renderers', () => {
  const source = functionSource('homePage', 'renderBundleHeader');

  assert.match(source, /probingArticleIndexState\s*===\s*null[\s\S]*loadProbingArticleIndex\(\)/);
  assert.match(source, /siteStatsState\.status\s*===\s*['"]idle['"][\s\S]*loadSiteStats\(\)/);
  assert.match(source, /const\s+dashboardView\s*=\s*buildDashboardViewModel\(siteStatsState,\s*probingArticleIndexState\)/);
  assert.match(source, /renderHomeHero\(dashboardView\)/);
  assert.doesNotMatch(source, /renderHomeModuleCards\(dashboardView\)/);
  assert.match(source, /renderHomeScrollStory\([\s\S]*\{[\s\S]*dashboardView[\s\S]*\}\)/);
});

test('stats ensures both source loads and passes one dashboard view with rows and filters', () => {
  const source = functionSource('statsPage', 'annojoinConfidencePage');

  assert.match(source, /siteStatsState\.status\s*===\s*['"]idle['"][\s\S]*loadSiteStats\(\)/);
  assert.match(source, /probingArticleIndexState\s*===\s*null[\s\S]*loadProbingArticleIndex\(\)/);
  assert.match(source, /const\s+dashboardView\s*=\s*buildDashboardViewModel\(siteStatsState,\s*probingArticleIndexState\)/);
  assert.match(source, /renderStatsPage\(\{[\s\S]*dashboardView,[\s\S]*rows:\s*siteStatsState\.rows\s*\|\|\s*\[\],[\s\S]*filters:\s*statsDashboardFilters[\s\S]*\}\)/);
});

test('dashboard loaders rerender every route that consumes their completed state', () => {
  const probingLoader = functionSource('loadProbingArticleIndex', 'loadHelpContent');
  const statsLoader = functionSource('loadSiteStats', 'initStatsDashboard');

  for (const routeName of ['home', 'stats', 'probing', 'detail']) {
    assert.match(probingLoader, new RegExp(`route === ['"]${routeName}['"]`));
  }
  for (const routeName of ['home', 'stats']) {
    assert.match(statsLoader, new RegExp(`route === ['"]${routeName}['"]`));
  }
});

test('the Probing loader validates a local index through the shared dashboard view before publishing it', () => {
  const source = functionSource('loadProbingArticleIndex', 'loadHelpContent');
  const loadIndexAt = source.indexOf('await probingArticleStore.loadIndex()');
  const validateAt = source.indexOf('buildDashboardViewModel(siteStatsState, loadedIndex)');
  const publishAt = source.indexOf('probingArticleIndexState = loadedIndex');

  assert.notEqual(loadIndexAt, -1, 'the loaded index should remain local initially');
  assert.notEqual(validateAt, -1, 'the shared dashboard view should validate the loaded index');
  assert.notEqual(publishAt, -1, 'a validated index should be published to route state');
  assert.ok(loadIndexAt < validateAt, 'loading must happen before validation');
  assert.ok(validateAt < publishAt, 'validation must happen before route state is ready');
  assert.match(source, /probingStatus\s*!==\s*['"]ready['"][\s\S]*throw\s+new\s+Error/);
  assert.doesNotMatch(source, /probingArticleIndexState\s*=\s*await\s+probingArticleStore\.loadIndex\(\)/);
});

test('the Probing hub consumes only families from the validated shared overview', () => {
  const source = functionSource('buildProbingHubSections', 'readHomeScrollVisitIndex');

  assert.match(source, /buildDashboardViewModel\(siteStatsState,\s*probingArticleIndexState\)/);
  assert.match(source, /probingStatus\s*===\s*['"]ready['"]/);
  assert.match(source, /probingOverview\?\.families/);
  assert.doesNotMatch(source, /probingArticleIndexState\.families/);
  assert.match(source, /renderProbingFamilyIndex\(families,\s*\{\s*embedded:\s*true\s*\}\)/);
});

test('detailPage renders the probing unavailable shell before any legacy overview fallback on index error', () => {
  const source = functionSource('detailPage', 'renderProbingArticleLoadingPage');
  const unavailableAt = source.indexOf('renderProbingUnavailablePage');
  const legacyOverviewAt = source.indexOf('renderTechnologyOverviewPage');

  assert.notEqual(unavailableAt, -1, 'detailPage should render the probing error shell');
  assert.notEqual(legacyOverviewAt, -1, 'the normal loading path should retain its legacy placeholder');
  assert.ok(unavailableAt < legacyOverviewAt, 'the error boundary must run before the legacy fallback');
  assert.match(
    source,
    /probingArticleIndexState\s*===\s*['"]error['"][\s\S]*return\s+renderProbingUnavailablePage\(/
  );
});

test('Stats event wiring does not manufacture a confidence filter value', () => {
  const source = functionSource('initStatsDashboard', 'buildProbingHubSections');
  assert.doesNotMatch(source, /confidence/i);
});

test('main wires dashboard loading, filter toggles, chips, and reset', () => {
  assert.match(MAIN_SOURCE, /siteStatsStore\.loadDashboard\(/);
  assert.match(MAIN_SOURCE, /function initStatsDashboard\(/);
  assert.match(MAIN_SOURCE, /\[data-stats-filter-dimension\]/);
  assert.match(MAIN_SOURCE, /\[data-stats-filter-chip\]/);
  assert.match(MAIN_SOURCE, /\[data-stats-reset\]/);
  assert.match(MAIN_SOURCE, /toggleStatsFilter\(/);
  assert.match(MAIN_SOURCE, /clearStatsFilters\(/);
});

test('styles provide the required responsive and accessible dashboard states', () => {
  assert.match(STYLES_SOURCE, /\.stats-chart-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(STYLES_SOURCE, /\.stats-chart-panel--wide\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(STYLES_SOURCE, /\.stats-chart-row\.is-selected/);
  assert.match(STYLES_SOURCE, /\.stats-chart-row:focus-visible/);
  assert.match(STYLES_SOURCE, /@media\s*\(max-width:\s*760px\)[\s\S]*\.stats-chart-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
