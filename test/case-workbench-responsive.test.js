import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const css = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/workbench.css', import.meta.url), 'utf8');
const shellCss = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/case-shell.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/entry-cases/__entry_v3_site__/workbench.js', import.meta.url), 'utf8');

function ruleBodies(source, selector) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].split(',').some((part) => part.trim() === selector))
    .map((match) => match[2]);
}

function values(bodies, property) {
  return bodies.flatMap((body) => body.split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${property}:`))
    .map((part) => part.slice(property.length + 1).trim().replace(/\s*!important$/, '')));
}

function displayedAs(selector, narrow = '') {
  return values(ruleBodies(narrow, selector), 'display').at(-1)
    || values(ruleBodies(css, selector), 'display').at(-1)
    || '';
}

function assertNarrowControlLayout(narrow, selector) {
  const display = displayedAs(selector, narrow);
  const narrowRules = ruleBodies(narrow, selector);
  assert.ok(narrowRules.length > 0, `${selector} needs a narrow-screen override`);
  if (display === 'flex' || display === 'inline-flex') {
    assert.equal(values(narrowRules, 'flex-wrap').at(-1), 'wrap', `${selector} is flex and must finally wrap`);
    return;
  }
  if (display === 'grid' || display === 'inline-grid') {
    const templates = values(narrowRules, 'grid-template-columns');
    const finalTemplate = templates.at(-1) || '';
    assert.ok(/^(?:1fr|minmax\(0,\s*1fr\))$/.test(finalTemplate)
      || /minmax\(0,/.test(finalTemplate), `${selector} is grid and needs a final single-column or shrinkable grid template`);
    return;
  }
  assert.fail(`${selector} has unsupported display:${display}`);
}

function effectiveOverflowAxes(bodies) {
  const axes = { x: null, y: null };
  for (const body of bodies) {
    for (const part of body.split(';')) {
      const separator = part.indexOf(':');
      if (separator < 0) continue;
      const property = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim().replace(/\s*!important$/, '');
      if (property === 'overflow') {
        [axes.x, axes.y] = value.split(/\s+/).length === 1 ? [value, value] : value.split(/\s+/);
      } else if (property === 'overflow-x') axes.x = value;
      else if (property === 'overflow-y') axes.y = value;
    }
  }
  return axes;
}

function mediaBodies(maxWidth, source = css) {
  const pattern = new RegExp(`@media\\s*\\(max-width:\\s*${maxWidth}px\\)\\s*\\{`, 'g');
  const bodies = [];
  for (const match of source.matchAll(pattern)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}' && --depth === 0) {
        bodies.push({ index: match.index, body: source.slice(open + 1, index) });
        break;
      }
    }
  }
  assert.ok(bodies.length > 0, `expected ${maxWidth}px Case media query`);
  return bodies;
}

function functionSource(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = js.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < js.length; index += 1) {
    if (js[index] === '{') depth += 1;
    if (js[index] === '}' && --depth === 0) return js.slice(start, index + 1);
  }
  assert.fail(`unclosed ${name}`);
}

test('Case shell portal header uses document width without scrollbar-gutter overflow', () => {
  const selector = '.fb-detail-nav .bundle-home-header';
  const rules = ruleBodies(shellCss, selector);
  assert.ok(rules.length > 0, 'Case shell must style the shared portal header');
  assert.deepEqual(values(rules, 'width'), ['100%'], 'desktop header must use the document content width');
  assert.deepEqual(values(rules, 'margin-left'), ['0'], 'desktop header must not use a viewport-centering offset');
});

test('Case shell switch pills form one shrinkable column at the phone breakpoint', () => {
  const narrow = mediaBodies(720, shellCss).map(({ body }) => body).join('\n');
  const switches = ruleBodies(narrow, '.fb-detail-nav .bundle-home-switches');
  const pills = ruleBodies(narrow, '.fb-detail-nav .bundle-switch-pill');
  assert.equal(values(switches, 'flex-direction').at(-1), 'column');
  assert.equal(values(switches, 'flex-wrap').at(-1), 'nowrap',
    'column switches must not wrap into horizontal columns');
  assert.equal(values(pills, 'flex').at(-1), '0 0 auto',
    'the 1100px half-width basis must be reset on phones');
  assert.equal(values(pills, 'width').at(-1), '100%');
});

test('VARNA has one fixed-height native two-axis scroll viewport, not nested scrollers', () => {
  const viewport = ruleBodies(css, '.varna-viewport');
  const frame = ruleBodies(css, '.varna-frame');
  assert.ok(viewport.length > 0);
  assert.ok(frame.length > 0);
  assert.deepEqual(values(viewport, 'block-size'), ['clamp(220px, 32vw, 404px)']);
  assert.ok(values(viewport, 'overflow').includes('auto'));
  assert.deepEqual(effectiveOverflowAxes(viewport), { x: 'auto', y: 'auto' },
    'later overflow-x/y declarations cannot hide or clip either VARNA scroll axis');
  for (const property of ['overflow', 'overflow-x', 'overflow-y']) {
    assert.ok(values(frame, property).every((value) => !/\b(auto|scroll)\b/.test(value)),
      `the wrapper cannot set ${property} to a second scroll container`);
  }
  assert.deepEqual(values(ruleBodies(css, '.track-viewport'), 'overflow-x'), ['auto'],
    '1D rail retains only its own local horizontal scroll');
});

test('the oversized 1D SVG is paint-contained by its local horizontal scroller', () => {
  const viewport = ruleBodies(css, '.track-viewport');
  assert.equal(values(viewport, 'overflow-x').at(-1), 'auto');
  assert.equal(values(viewport, 'overflow-y').at(-1), 'hidden');
  assert.equal(values(viewport, 'contain').at(-1), 'paint',
    'SVG descendant ink must not enlarge the workbench document');
});

test('the Profile dropdown and trigger cannot widen a narrow controls track', () => {
  for (const selector of ['.profile-dropdown', '.profile-dropdown-trigger']) {
    const rules = ruleBodies(css, selector);
    assert.equal(values(rules, 'min-width').at(-1), '0', `${selector} must opt out of intrinsic min-width`);
    assert.equal(values(rules, 'width').at(-1), '100%');
    assert.equal(values(rules, 'max-width').at(-1), '100%', `${selector} must remain within the controls track`);
  }
  const text = ruleBodies(css, '.profile-dropdown-text');
  assert.equal(values(text, 'min-width').at(-1), '0');
  assert.equal(values(text, 'overflow').at(-1), 'hidden');
  assert.equal(values(text, 'text-overflow').at(-1), 'ellipsis');
  assert.equal(values(text, 'white-space').at(-1), 'nowrap');
});

test('VARNA zoom grows both axes at 140% and 1:1 restores both scroll offsets', () => {
  const svg = { style: {} };
  const viewport = {
    clientWidth: 320,
    clientHeight: 220,
    get scrollWidth() { return 320 * Number.parseFloat(svg.style.width || '100%') / 100; },
    get scrollHeight() { return 220 * Number.parseFloat(svg.style.height || '100%') / 100; },
    scrollLeft: 0,
    scrollTop: 0,
    querySelector(selector) { return selector === 'svg' ? svg : null; },
  };
  const sandbox = {
    state: { varnaZoom: 1 },
    el: { varnaViewport: viewport, varnaZoomStatus: { textContent: '' } },
    VARNA_ZOOM_MIN: 1,
    VARNA_ZOOM_MAX: 6,
    Math,
  };
  vm.runInNewContext(`${functionSource('applyVarnaZoom')}\n${functionSource('setVarnaZoom')}`, sandbox);
  sandbox.setVarnaZoom(1.4);
  assert.equal(svg.style.width, '140%');
  assert.equal(svg.style.height, '140%');
  assert.ok(viewport.scrollWidth > viewport.clientWidth);
  assert.ok(viewport.scrollHeight > viewport.clientHeight);
  viewport.scrollLeft = 48;
  viewport.scrollTop = 35;
  sandbox.setVarnaZoom(1);
  assert.equal(svg.style.width, '100%');
  assert.equal(svg.style.height, '100%');
  assert.equal(viewport.scrollLeft, 0, 'reset should return to the left edge after sizing');
  assert.equal(viewport.scrollTop, 0, 'reset should return to the top edge after sizing');
});

test('narrow Case controls shrink or wrap while Technique chips remain within the panel', () => {
  const blocks = mediaBodies(900);
  assert.ok(blocks.length >= 3, 'all existing 900px blocks participate in the ordered narrow cascade');
  assert.deepEqual(blocks.map(({ index }) => index), [...blocks].map(({ index }) => index).sort((a, b) => a - b));
  const narrow = blocks.map(({ body }) => body).join('\n');
  assert.equal(values(ruleBodies(narrow, '.controls'), 'grid-template-columns').at(-1), 'minmax(0, 1fr)',
    'the final narrow controls track must opt out of grid auto-min overflow');
  assertNarrowControlLayout(narrow, '.viewport-controls');
  assertNarrowControlLayout(narrow, '.varna-zoom-controls');
  assert.equal(displayedAs('.technique-chip-row', narrow), 'flex');
  assert.equal(displayedAs('.technique-chip-sublevel', narrow), 'flex');
  assert.equal(values(ruleBodies(css, '.technique-chip-row'), 'flex-wrap').at(-1), 'wrap');
  assert.equal(values(ruleBodies(css, '.technique-chip-sublevel'), 'flex-wrap').at(-1), 'wrap');
  assert.equal(values(ruleBodies(narrow, '.technique-chip'), 'max-width').at(-1), '100%');
  assert.equal(values(ruleBodies(narrow, '.technique-chip'), 'white-space').at(-1), 'normal');
});
