import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const STYLES = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function extractBalancedBlock(source, openingBrace) {
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  throw new Error('Unclosed CSS block');
}

function mediaBlocks(maxWidth) {
  const pattern = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g');
  return [...STYLES.matchAll(pattern)].map((match) => {
    const openingBrace = match.index + match[0].lastIndexOf('{');
    return extractBalancedBlock(STYLES, openingBrace);
  });
}

function ruleBodies(source, selector) {
  const bodies = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((item) => item.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies;
}

function mediaRuleBodies(maxWidth, selector) {
  return mediaBlocks(maxWidth).flatMap((block) => ruleBodies(block, selector));
}

function declarations(ruleBody) {
  return ruleBody
    .split(';')
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator < 0) return null;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      return { property, value };
    })
    .filter((declaration) => declaration !== null);
}

function declarationValues(ruleBody, property) {
  return declarations(ruleBody)
    .filter((declaration) => declaration.property === property)
    .map((declaration) => declaration.value);
}

test('desktop full-width header uses document width without scrollbar-sensitive viewport units', () => {
  const allHeaderRules = ruleBodies(STYLES, '.bundle-home-header');
  const allWidthDeclarations = allHeaderRules.flatMap((body) => declarationValues(body, 'width'));
  const allMarginLeftDeclarations = allHeaderRules.flatMap((body) => declarationValues(body, 'margin-left'));
  const responsiveHeaderRules = mediaRuleBodies(1100, '.bundle-home-header');
  const responsiveWidths = responsiveHeaderRules.flatMap((body) => declarationValues(body, 'width'));
  const responsiveMargins = responsiveHeaderRules.flatMap((body) => declarationValues(body, 'margin-left'));

  assert.deepEqual(
    allWidthDeclarations,
    ['100%', '100%'],
    'desktop and 1100px header widths must follow the document box rather than include the scrollbar gutter',
  );
  assert.deepEqual(
    allMarginLeftDeclarations,
    ['0', '0'],
    'desktop and 1100px headers must not use a viewport-unit full-bleed offset',
  );
  assert.deepEqual(responsiveWidths, ['100%']);
  assert.deepEqual(responsiveMargins, ['0']);
});

test('desktop navigation offset and width are reset by the ordered 1100px declarations', () => {
  const allNavRules = ruleBodies(STYLES, '.bundle-home-route-nav');
  const allLeftDeclarations = allNavRules.flatMap((body) => declarationValues(body, 'left'));
  const allWidthDeclarations = allNavRules.flatMap((body) => declarationValues(body, 'width'));
  const navRules = mediaRuleBodies(1100, '.bundle-home-route-nav');
  const leftDeclarations = navRules.flatMap((body) => declarationValues(body, 'left'));
  const widthDeclarations = navRules.flatMap((body) => declarationValues(body, 'width'));

  assert.deepEqual(
    allLeftDeclarations,
    ['220px', '0'],
    'the complete navigation cascade must keep desktop left: 220px before the 1100px left: 0 reset',
  );
  assert.ok(navRules.length > 0, 'expected a .bundle-home-route-nav rule in the 1100px breakpoint');
  assert.deepEqual(
    leftDeclarations,
    ['0'],
    'the 1100px breakpoint must contain one explicit left: 0 reset and no conflicting offset',
  );
  assert.deepEqual(
    allWidthDeclarations,
    ['calc(100% - 220px)', '100%'],
    'the complete navigation cascade must subtract the desktop offset before restoring width: 100%',
  );
  assert.deepEqual(
    widthDeclarations,
    ['100%'],
    'the 1100px breakpoint must contain one explicit width: 100% reset and no conflicting width',
  );
});

test('720px Search form uses a single-column layout', () => {
  const selector = '.site-search-form';
  const searchFormRules = mediaRuleBodies(720, selector);
  const layoutDeclarations = searchFormRules.flatMap((body) => [
    ...declarationValues(body, 'grid-template-columns').map((value) => ({
      property: 'grid-template-columns',
      value,
      singleColumn: value === '1fr',
    })),
    ...declarationValues(body, 'flex-direction').map((value) => ({
      property: 'flex-direction',
      value,
      singleColumn: value === 'column',
    })),
  ]);

  assert.ok(searchFormRules.length > 0, `expected a ${selector} rule in the 720px breakpoint`);
  assert.ok(
    layoutDeclarations.some(({ singleColumn }) => singleColumn),
    'the Search page form must collapse to exactly one column',
  );
  assert.deepEqual(
    layoutDeclarations.filter(({ singleColumn }) => !singleColumn),
    [],
    'no later or duplicate Search form rule may override the single-column layout',
  );
});

test('720px header switches stay in one unwrapped vertical column', () => {
  const switchRules = mediaRuleBodies(720, '.bundle-home-switches');
  const flexDirections = switchRules.flatMap((body) => declarationValues(body, 'flex-direction'));
  const flexWraps = switchRules.flatMap((body) => declarationValues(body, 'flex-wrap'));

  assert.ok(switchRules.length > 0, 'expected a .bundle-home-switches rule in the 720px breakpoint');
  assert.deepEqual(
    flexDirections,
    ['column'],
    'the 720px header switches must use one vertical main axis without conflicting directions',
  );
  assert.deepEqual(
    flexWraps,
    ['nowrap'],
    'the 720px header switches must override wider flex-wrap rules so pills cannot form extra columns',
  );
});

test('Entry page can shrink while its wide table keeps local horizontal scrolling', () => {
  const entryPageRules = ruleBodies(STYLES, '.entry-table-page');
  const entryTableRules = ruleBodies(STYLES, '.entry-table-wrap');
  const wideTableRules = [
    ...ruleBodies(STYLES, '.entry-table'),
    ...ruleBodies(STYLES, '.entry-table-page .entry-table'),
  ];
  const entryPageMinWidths = entryPageRules.flatMap((body) => declarationValues(body, 'min-width'));
  const entryPageWidths = entryPageRules.flatMap((body) => declarationValues(body, 'width'));
  const overflowXDeclarations = entryTableRules.flatMap((body) => declarationValues(body, 'overflow-x'));
  const tableMinWidths = wideTableRules.flatMap((body) => declarationValues(body, 'min-width'));

  assert.ok(entryPageRules.length > 0, 'expected at least one .entry-table-page rule');
  assert.ok(entryTableRules.length > 0, 'expected at least one .entry-table-wrap rule');
  assert.deepEqual(
    entryPageMinWidths,
    ['0'],
    'the Entry page flex item must override its wide table min-content size',
  );
  assert.deepEqual(
    entryPageWidths,
    ['100%'],
    'the Entry page flex item must be sized to its container before the wide table scrolls locally',
  );
  assert.ok(overflowXDeclarations.includes('auto'), 'Entry tables need a local overflow-x: auto container');
  assert.deepEqual(
    overflowXDeclarations.filter((value) => value !== 'auto'),
    [],
    'no Entry table wrapper rule may conflict with the local overflow-x: auto behavior',
  );
  assert.ok(tableMinWidths.includes('980px'), 'the inner Entry table must retain its wide scrollable layout');
  assert.deepEqual(
    tableMinWidths.filter((value) => value !== '980px'),
    [],
    'no Entry table rule may replace the local 980px minimum width',
  );
});

test('entry Case embed uses its container width without viewport-width sizing', () => {
  const embedRules = ruleBodies(STYLES, '.entry-case-embed');
  const frameRules = ruleBodies(STYLES, '.entry-case-embed-frame');
  const embedWidths = embedRules.flatMap((body) => declarationValues(body, 'width'));
  const frameWidths = frameRules.flatMap((body) => declarationValues(body, 'width'));
  const allowedEmbedWidths = new Set([
    'var(--feature-card-width)',
    'min(var(--feature-card-width), 100%)',
    'min(100%, var(--feature-card-width))',
  ]);
  const allWidthDeclarations = [...embedRules, ...frameRules]
    .flatMap((body) => declarations(body))
    .filter(({ property }) => /^(?:min-|max-)?width$/.test(property));

  assert.ok(embedRules.length > 0, 'expected at least one .entry-case-embed rule');
  assert.ok(frameRules.length > 0, 'expected at least one .entry-case-embed-frame rule');
  assert.ok(
    embedWidths.some((value) => allowedEmbedWidths.has(value)),
    'the Case embed must use the shared feature-card container width',
  );
  assert.deepEqual(
    embedWidths.filter((value) => !allowedEmbedWidths.has(value)),
    [],
    'no Case embed width may conflict with the shared container width',
  );
  assert.ok(frameWidths.includes('100%'), 'the Case iframe must fill its embed container');
  assert.deepEqual(
    frameWidths.filter((value) => value !== '100%'),
    [],
    'no Case iframe width may conflict with width: 100%',
  );
  for (const { property, value } of allWidthDeclarations) {
    assert.doesNotMatch(value, /100vw/, `${property} must not use viewport-width sizing`);
  }
});

test('body does not impose a fixed minimum page width', () => {
  const bodyRules = ruleBodies(STYLES, 'body');
  assert.ok(bodyRules.length > 0, 'expected at least one body rule');
  for (const body of bodyRules) {
    assert.doesNotMatch(body, /(?:^|;)\s*min-width\s*:/);
  }
});
