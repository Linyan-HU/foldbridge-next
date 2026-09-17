import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  applyEntryCaseHeightMessage,
  ENTRY_CASE_HEIGHT_MESSAGE,
  mountEntryCaseHeightListener,
  mountEntryCaseLoadingIndicator,
  parseEntryCaseMatrixFamily,
} from '../src/entryCaseEmbed.js';

test('entry Case matrix family parser distinguishes absence from invalid query values', () => {
  assert.equal(parseEntryCaseMatrixFamily('pdb=1C2X&chain=C'), null);
  assert.equal(parseEntryCaseMatrixFamily('pdb=1C2X&chain=C&family=E'), 'E');
  assert.equal(parseEntryCaseMatrixFamily('family=F'), 'F');
  assert.throws(() => parseEntryCaseMatrixFamily('family='), /invalid.*family/i);
  assert.throws(() => parseEntryCaseMatrixFamily('family=A'), /invalid.*family/i);
  assert.throws(() => parseEntryCaseMatrixFamily('family=E&family=E'), /exactly once/i);
  assert.throws(() => parseEntryCaseMatrixFamily('family=E&family=F'), /exactly once/i);
});

test('entry Case loading indicator stays visible until the iframe loads', () => {
  const handlers = new Set();
  const frame = {
    addEventListener(type, handler) {
      if (type === 'load') handlers.add(handler);
    },
    removeEventListener(type, handler) {
      if (type === 'load') handlers.delete(handler);
    },
  };
  const indicator = { hidden: true };

  const dispose = mountEntryCaseLoadingIndicator({ frame, indicator });
  assert.equal(indicator.hidden, false);
  assert.equal(handlers.size, 1);

  for (const handler of handlers) handler();
  assert.equal(indicator.hidden, true);

  indicator.hidden = false;
  dispose();
  for (const handler of handlers) handler();
  assert.equal(indicator.hidden, false);
});

test('entry Case iframe accepts a valid height only from its own trusted child', () => {
  const childWindow = {};
  const attributes = new Map();
  const frame = {
    contentWindow: childWindow,
    style: {},
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };

  const applied = applyEntryCaseHeightMessage({
    event: {
      origin: 'https://foldbridge.sunhao.uk',
      source: childWindow,
      data: { type: ENTRY_CASE_HEIGHT_MESSAGE, height: 1234.2 },
    },
    frame,
    expectedOrigin: 'https://foldbridge.sunhao.uk',
  });

  assert.equal(applied, true);
  assert.equal(frame.style.height, '1237px');
  assert.equal(attributes.get('scrolling'), 'no');
});

test('entry Case iframe rejects untrusted, unrelated, and unreasonable height messages', () => {
  const childWindow = {};
  const frame = {
    contentWindow: childWindow,
    style: { height: '640px' },
    setAttribute() {
      throw new Error('rejected messages must not mutate the iframe');
    },
  };
  const baseEvent = {
    origin: 'https://foldbridge.sunhao.uk',
    source: childWindow,
    data: { type: ENTRY_CASE_HEIGHT_MESSAGE, height: 900 },
  };

  const rejected = [
    { ...baseEvent, origin: 'https://example.com' },
    { ...baseEvent, source: {} },
    { ...baseEvent, data: { ...baseEvent.data, type: 'other-message' } },
    { ...baseEvent, data: { ...baseEvent.data, height: Number.NaN } },
    { ...baseEvent, data: { ...baseEvent.data, height: 200_000 } },
  ];

  for (const event of rejected) {
    assert.equal(applyEntryCaseHeightMessage({
      event,
      frame,
      expectedOrigin: 'https://foldbridge.sunhao.uk',
    }), false);
  }
  assert.equal(frame.style.height, '640px');
});

test('entry Case height listener detaches cleanly when the route rerenders', () => {
  const handlers = new Set();
  const fakeWindow = {
    addEventListener(type, handler) {
      if (type === 'message') handlers.add(handler);
    },
    removeEventListener(type, handler) {
      if (type === 'message') handlers.delete(handler);
    },
    dispatch(event) {
      for (const handler of handlers) handler(event);
    },
  };
  const childWindow = {};
  const frame = {
    contentWindow: childWindow,
    style: {},
    setAttribute() {},
  };
  const event = {
    origin: 'https://foldbridge.sunhao.uk',
    source: childWindow,
    data: { type: ENTRY_CASE_HEIGHT_MESSAGE, height: 880 },
  };

  const dispose = mountEntryCaseHeightListener({
    windowObject: fakeWindow,
    frame,
    expectedOrigin: 'https://foldbridge.sunhao.uk',
  });
  fakeWindow.dispatch(event);
  assert.equal(frame.style.height, '882px');
  assert.equal(handlers.size, 1);

  dispose();
  frame.style.height = '640px';
  fakeWindow.dispatch(event);
  assert.equal(frame.style.height, '640px');
  assert.equal(handlers.size, 0);
});

test('Case shell reports its stable content height to a cross-origin parent', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const context = {
    module: { exports: {} },
    Number,
    Math,
  };
  vm.runInNewContext(source, context);
  const { measureEmbeddedCaseHeight, postEmbeddedCaseHeight } = context.module.exports;
  const shell = {
    getBoundingClientRect() {
      return { bottom: 987.1 };
    },
  };

  assert.equal(measureEmbeddedCaseHeight(shell, 12, 28), 1028);

  const calls = [];
  const parentWindow = {
    postMessage(...args) {
      calls.push(args);
    },
  };
  assert.equal(postEmbeddedCaseHeight(parentWindow, 1028), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].type, ENTRY_CASE_HEIGHT_MESSAGE);
  assert.equal(calls[0][0].height, 1028);
  assert.equal(calls[0][1], '*');
});

test('entry Case layout uses the shared centered width and content-driven height bridge', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const heightBridge = readFileSync(new URL('../src/entryCaseEmbed.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const shellStyles = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.css', import.meta.url), 'utf8');
  const embedRules = [...styles.matchAll(/\.entry-case-embed\s*\{[^}]+\}/gs)].map((match) => match[0]);
  const frameRules = [...styles.matchAll(/\.entry-case-embed-frame\s*\{[^}]+\}/gs)].map((match) => match[0]);
  const embedStyles = embedRules.join('\n');
  const frameStyles = frameRules.join('\n');
  const heightListener = heightBridge.match(/export function mountEntryCaseHeightListener[\s\S]*?(?=export function mountEntryCaseLoadingIndicator)/)?.[0] || '';

  assert.ok(embedRules.length > 0);
  assert.ok(frameRules.length > 0);
  assert.match(embedStyles, /width:\s*var\(--feature-card-width\)/);
  assert.match(embedStyles, /max-width:\s*var\(--feature-card-width\)/);
  assert.match(embedStyles, /margin:\s*0 auto/);
  assert.match(frameStyles, /width:\s*100%/);
  assert.doesNotMatch(embedStyles, /(?:min-|max-)?width:\s*[^;]*100vw/);
  assert.doesNotMatch(frameStyles, /(?:min-|max-)?width:\s*[^;]*100vw/);
  assert.doesNotMatch(frameStyles, /height:\s*calc\(100vh/);
  assert.match(heightListener, /applyEntryCaseHeightMessage\(\{ event, frame, expectedOrigin \}\)/);
  assert.match(heightBridge, /frame\.style\.height\s*=\s*`\$\{height\}px`/);
  assert.doesNotMatch(heightBridge, /calc\(100vh/);
  assert.match(main, /mountEntryCaseHeightListener\(\{/);
  assert.match(main, /mountEntryCaseLoadingIndicator\(\{/);
  assert.match(main, /class="entry-case-loading"/);
  assert.match(styles, /\.entry-case-loading-track/);
  assert.match(styles, /@keyframes entry-case-loading-slide/);
  assert.match(shell, /classList\.add\("is-embedded"\)/);
  assert.match(shellStyles, /html\.is-embedded \.shell\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/s);
  assert.match(shell, /ResizeObserver/);
  assert.match(shell, /foldbridge-case-height/);
});

test('main-site entry route forwards the requested chain into the case iframe', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /entryCaseParams\s*=\s*getEntryCaseParamsFromHash\(\)/);
  assert.match(main, /const \{ pdb, chain, family \} = entryCaseParams/);
  assert.match(main, /family:\s*parseEntryCaseMatrixFamily\(queryString\)/);
  assert.match(main, /try\s*\{\s*entryCaseParams\s*=\s*getEntryCaseParamsFromHash\(\);\s*\}\s*catch/s);
  assert.match(main, /searchParams\.set\(['"]chain['"],\s*safeChain\)/);
  // 选项 C：所有 case（含 EF）走无版本 index.html；不再有 per-case 版本化白名单。
  assert.match(main, /cases\/\$\{encodeURIComponent\(safePdb\)\}\/index\.html/);
  assert.doesNotMatch(main, /EF_ENTRY_CASE_IDS/);
  // family(E|F) 透传给 case 壳，供其选 E/F 2D 产物。
  assert.match(main, /searchParams\.set\(['"]family['"],\s*family\)/);
});

test('Case shell accepts only a chain present in its own manifest', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math, URLSearchParams };
  vm.runInNewContext(source, context);
  const { initialChainId } = context.module.exports;
  const bootstrap = { defaultChainId: 'b', chainPageById: { a: 'chains/a/index.html', b: 'chains/b/index.html' } };
  assert.equal(initialChainId(bootstrap, '?chain=a'), 'a');
  assert.equal(initialChainId(bootstrap, '?chain=missing'), 'b');
  assert.equal(initialChainId(bootstrap, ''), 'b');
});

test('Case shell forwards one valid matrix family and rejects invalid or repeated values', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math, URLSearchParams };
  vm.runInNewContext(source, context);
  const { requestedMatrixFamily } = context.module.exports;
  assert.equal(requestedMatrixFamily('?chain=C'), null);
  assert.equal(requestedMatrixFamily('?family=E'), 'E');
  assert.equal(requestedMatrixFamily('?family=F'), 'F');
  assert.throws(() => requestedMatrixFamily('?family='), /invalid.*family/i);
  assert.throws(() => requestedMatrixFamily('?family=A'), /invalid.*family/i);
  assert.throws(() => requestedMatrixFamily('?family=E&family=E'), /exactly once/i);
  assert.match(source, /const matrixFamily\s*=\s*requestedMatrixFamily\(window\.location\.search\)/);
  assert.match(source, /if\s*\(matrixFamily\)\s*params\.set\(["']family["'],\s*matrixFamily\)/);
});

test('Case shell removes internal Family and Tier chrome without changing routing data', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.css', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math, URLSearchParams };
  vm.runInNewContext(source, context);
  const { suppressInternalCaseChrome } = context.module.exports;
  assert.equal(typeof suppressInternalCaseChrome, 'function');

  const removed = [];
  const nodes = new Map([
    ['.hero .meta', { remove() { removed.push('.hero .meta'); } }],
    ['.fb-enrichment', { remove() { removed.push('.fb-enrichment'); } }],
  ]);
  suppressInternalCaseChrome({ querySelector: (selector) => nodes.get(selector) || null });
  assert.deepEqual(removed, ['.hero .meta', '.fb-enrichment']);
  assert.match(source, /suppressInternalCaseChrome\(document\)/);
  assert.doesNotMatch(source, /function renderEnrichment\s*\(/);
  assert.doesNotMatch(source, /\["Family",\s*"Technology",\s*"Tier"/);
  assert.match(styles, /\.hero\s+\.meta\s*\{[^}]*display:\s*none/s);
});

test('Case workbench never creates the RMDB raw reactivity heatmap', () => {
  const currentWorkbench = readFileSync(
    new URL('../public/entry-cases/__entry_v3_site__/workbench.js', import.meta.url),
    'utf8',
  );
  const assetVersion = currentWorkbench.match(/const EF_ASSET_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  assert.ok(assetVersion, 'current workbench must declare its generated asset version');
  const assetNames = [
    'workbench.js',
    `workbench.${assetVersion}.js`,
  ];

  for (const assetName of assetNames) {
    const workbench = readFileSync(
      new URL(`../public/entry-cases/__entry_v3_site__/${assetName}`, import.meta.url),
      'utf8',
    );
    const profileRenderer = workbench.match(/async function renderProfile\([\s\S]*?\n}\n\nfunction profileIndexForId/)?.[0] || '';
    const init = workbench.match(/async function init\([\s\S]*?\nel\.select\.addEventListener\("change"/)?.[0] || '';
    const profileChange = workbench.match(/el\.select\.addEventListener\("change"[\s\S]*?\nel\.zoomIn\?\.addEventListener/)?.[0] || '';
    const filterMount = workbench.match(/function mountTechniqueFilter\([\s\S]*?\n\/\/ Choose the default profile/)?.[0] || '';
    const refilter = filterMount.match(/const refilter = \(\) => \{[\s\S]*?\n  };/)?.[0] || '';

    for (const [entrypoint, source] of [
      ['init', init],
      ['renderProfile', profileRenderer],
      ['Profile change', profileChange],
      ['Technique refilter', refilter],
    ]) {
      assert.ok(source, `${assetName} exposes ${entrypoint}`);
      assert.doesNotMatch(
        source,
        /\brenderRmdbHeatmap\s*\(|\bfetchRmdbRdatText\s*\(|PDB130_DMS_0000\.rdat|\/api\/rmdb\/rdat\//,
        `${assetName} ${entrypoint}`,
      );
    }
  }
});

test('Case shell shows staged loading progress until the first profile is ready', () => {
  const shell = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const shellStyles = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.css', import.meta.url), 'utf8');
  const workbench = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/workbench.js', import.meta.url), 'utf8');
  const initStart = workbench.indexOf('async function init()');
  const initEnd = workbench.indexOf('\nel.select.addEventListener', initStart);
  const initBody = workbench.slice(initStart, initEnd);

  assert.match(shell, /foldbridge-workbench-progress/);
  assert.match(shell, /event\.source !== frame\?\.contentWindow/);
  assert.match(shell, /event\.origin !== window\.location\.origin/);
  assert.match(shell, /fb-case-progress/);
  assert.match(shellStyles, /\.fb-case-progress/);
  assert.match(shellStyles, /prefers-reduced-motion:\s*reduce/);

  const loadingAt = initBody.indexOf('reportWorkbenchProgress(45');
  const assetsAt = initBody.indexOf('reportWorkbenchProgress(80');
  const readyAt = initBody.indexOf('reportWorkbenchProgress(100');
  const molstarAt = initBody.indexOf('initMolstarViewer()');
  assert.ok(loadingAt >= 0 && loadingAt < assetsAt);
  assert.ok(assetsAt < readyAt && readyAt < molstarAt);
  assert.match(workbench, /reportWorkbenchProgress\(80, "Case data failed to load\.", "error"\)/);
});

test('Case shell hydrates deferred evidence without changing the active chain contract', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math, URLSearchParams, TypeError };
  vm.runInNewContext(source, context);
  const { initialChainId, mergeDeferredEvidence } = context.module.exports;
  const bootstrap = {
    defaultChainId: 'b',
    chainPageById: { a: 'chains/a/index.html', b: 'chains/b/index.html' },
    evidenceRows: [],
    evidenceChainMap: {},
  };

  mergeDeferredEvidence(bootstrap, {
    rows: [
      { evidenceId: 'ev-a', chain: 'a', trackProfileId: 'profile-a' },
      { evidenceId: 'ev-b', chain: 'b', trackProfileId: 'profile-b' },
    ],
  });

  assert.equal(bootstrap.evidenceRows.length, 2);
  assert.deepEqual({ ...bootstrap.evidenceChainMap }, { 'ev-a': 'a', 'ev-b': 'b' });
  assert.equal(initialChainId(bootstrap, '?chain=a'), 'a');
});

test('Case shell resolves deferred evidence before the first ordinary frame navigation', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  assert.match(source, /async function loadDeferredEvidence\s*\(/);
  assert.match(
    source,
    /if\s*\(bootstrap\.evidenceUrl\s*&&\s*frame\s*&&\s*!matrixFamily\)\s*\{[\s\S]*loadDeferredEvidence\(\)\.catch[\s\S]*\}\s*else\s*\{\s*syncUi\(\)/,
  );
  assert.doesNotMatch(
    source,
    /frame\?\.addEventListener\(\s*["']load["'],\s*\(\)\s*=>\s*\{\s*loadDeferredEvidence/,
  );
});

test('Deferred evidence preserves the materialized map last-row-wins duplicate semantics', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math, URLSearchParams, TypeError };
  vm.runInNewContext(source, context);
  const bootstrap = { evidenceRows: [], evidenceChainMap: {} };

  context.module.exports.mergeDeferredEvidence(bootstrap, {
    rows: [
      { evidenceId: 'shared', chain: 'Y' },
      { evidenceId: 'shared', chain: 'Z' },
    ],
  });

  assert.equal(bootstrap.evidenceChainMap.shared, 'Z');
});

test('9WNR-style deferred evidence drives the first A/a frame URL without cross-chain fallback', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const context = { module: { exports: {} }, Number, Math, URLSearchParams, TypeError };
  vm.runInNewContext(source, context);
  const { mergeDeferredEvidence, resolveCaseFrameHref } = context.module.exports;
  assert.equal(typeof resolveCaseFrameHref, 'function');
  const bootstrap = {
    chainPageById: { A: 'chains/A/index.html', a: 'chains/a/index.html' },
    evidenceRows: [],
    evidenceChainMap: {},
  };
  mergeDeferredEvidence(bootstrap, {
    rows: [
      { evidenceId: 'ev-A', chain: 'A', trackProfileId: 'data-upper/profile.rdat#1' },
      { evidenceId: 'ev-a', chain: 'a', trackProfileId: 'data-lower/profile.rdat#2' },
    ],
  });

  assert.equal(
    resolveCaseFrameHref(bootstrap, { activeChainId: 'A', selectedEvidenceId: 'ev-A', matrixFamily: null }),
    'chains/A/index.html?profileId=data-upper%2Fprofile.rdat%231',
  );
  assert.equal(
    resolveCaseFrameHref(bootstrap, { activeChainId: 'a', selectedEvidenceId: 'ev-A', matrixFamily: null }),
    'chains/a/index.html?profileId=data-lower%2Fprofile.rdat%232',
  );
  assert.throws(
    () => resolveCaseFrameHref(bootstrap, { activeChainId: '__proto__', selectedEvidenceId: '', matrixFamily: null }),
    /selected chain/i,
  );
  assert.match(source, /frame\.src\s*=\s*resolveCaseFrameHref\(bootstrap/);
});

test('Deferred evidence propagates the selected profile without depending on internal status copy', () => {
  const source = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function loadDeferredEvidence');
  const end = source.indexOf('\n  function syncUi', start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /mergeDeferredEvidence\(bootstrap,\s*await response\.json\(\)\)/);
  assert.match(body, /syncUi\(\)/);
  assert.ok(body.indexOf('mergeDeferredEvidence') < body.indexOf('syncUi()'));
  assert.doesNotMatch(source, /EF assets linked|loadDeferredEvidenceWhenReady|new MutationObserver/);
});
