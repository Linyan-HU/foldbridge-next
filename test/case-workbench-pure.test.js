import assert from 'node:assert/strict';
import test from 'node:test';

import * as sourcePure from '../public/entry-cases/__entry_v3_site__/workbench-pure.mjs';

function reactivityApi(pure) {
  assert.equal(typeof pure.normalizeReactivityProfile, 'function', 'export normalizeReactivityProfile(values)');
  assert.deepEqual(pure.REACTIVITY_STATES, {
    MISSING: 'missing',
    NONPOSITIVE: 'nonpositive',
    POSITIVE: 'positive',
  });
  return pure.normalizeReactivityProfile;
}

function displayedRows(normalized) {
  if (Array.isArray(normalized.rows)) return normalized.rows;
  if (normalized.byPosition instanceof Map) return [...normalized.byPosition.values()];
  assert.fail('normalization must expose displayed rows or a byPosition Map');
}

function rgb(color) {
  assert.match(color, /^#[\da-f]{6}$/i, '3D requires a solid six-digit hex color');
  return [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
}

function verifyThreeStates(pure) {
  const normalize = reactivityApi(pure);
  const rows = displayedRows(normalize([NaN, Infinity, -Infinity, -1, 0, 1]));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row.state), [
    'missing', 'missing', 'missing', 'nonpositive', 'nonpositive', 'positive',
  ]);
  assert.equal(Number.isNaN(rows[0].raw), true, 'NaN must not be replaced by zero');
  assert.equal(rows[1].raw, Infinity);
  assert.equal(rows[2].raw, -Infinity);
  assert.equal(rows[3].raw, -1);
  assert.equal(rows[4].raw, 0);

  const missingRgb = rgb(rows[0].color);
  assert.ok(Math.max(...missingRgb) - Math.min(...missingRgb) <= 16,
    'missing uses a neutral gray rather than the positive gradient');
  for (const row of rows.slice(1, 3)) assert.equal(row.color, rows[0].color);
  const nonpositiveRgb = rgb(rows[3].color);
  assert.ok(nonpositiveRgb[2] > nonpositiveRgb[0], 'measured <=0 uses light blue, not gray');
  assert.ok(nonpositiveRgb.every((channel) => channel >= 150), 'measured <=0 stays light');
  assert.equal(rows[4].color, rows[3].color);
  assert.notEqual(rows[5].color, rows[3].color);
}

function verifyPositiveScale(pure) {
  const normalize = reactivityApi(pure);
  const normalized = normalize([NaN, Infinity, -Infinity, -1, 0, 1, 2, 3, 4, 100]);
  const rows = displayedRows(normalized);
  assert.equal(rows.length, 10);
  assert.ok(Math.abs(normalized.cap - 80.8) < 1e-9, 'P95 is interpolated from positive values only');
  assert.deepEqual(
    [normalized.missingCount, normalized.nonpositiveCount, normalized.positiveCount],
    [3, 2, 5],
  );
  assert.equal(
    normalized.missingCount + normalized.nonpositiveCount + normalized.positiveCount,
    rows.length,
  );
  assert.equal(normalized.mappedCount, 7, 'only finite measurements count as mapped');
  assert.equal(normalized.cappedCount, 1, 'only the extreme positive reaches the P95 cap');
  assert.equal(rows[9].norm, 1, 'extreme is capped at the positive P95');
  assert.equal(rows[9].color.toLowerCase(), '#d7191c', 'high positive retains the existing red endpoint');
  assert.ok(rows[5].norm > 0 && rows[5].norm < rows[8].norm);
  for (const row of rows) rgb(row.color);
  assert.ok(rows.slice(5).every((row) => row.state === 'positive'));

  const scale = displayedRows(normalize([0.01, 0.5, 1, 1]));
  const [low, middle, high] = [scale[0], scale[1], scale[2]];
  assert.deepEqual([low.norm, middle.norm, high.norm], [0.01, 0.5, 1]);
  assert.equal(new Set([low.color, middle.color, high.color]).size, 3,
    'low, middle, and high positives need distinct scale colors');
  assert.deepEqual([low.color, middle.color, high.color].map((color) => color.toLowerCase()),
    ['#fff000', '#eb860e', '#d7191c'],
    'positive values retain the existing #fff200-to-#d7191c interpolation');
}

function verifyTechniqueStatus(pure) {
  assert.equal(typeof pure.publicTechniqueFilterStatus, 'function', 'export publicTechniqueFilterStatus(options)');
  const status = pure.publicTechniqueFilterStatus;
  assert.equal(status({ active: true, hitCount: 1, totalCount: 17, metadataAvailable: true }),
    '匹配 1 个 Profile；请在 Profile 下拉列表中选择');
  assert.equal(status({ active: true, hitCount: 12, totalCount: 17, metadataAvailable: true }),
    '匹配 12 个 Profile；请在 Profile 下拉列表中选择');
  assert.equal(status({ active: true, hitCount: 0, totalCount: 17, metadataAvailable: true }),
    '无匹配 Profile');
  const cleared = status({ active: false, hitCount: 0, totalCount: 17, metadataAvailable: true });
  assert.equal(cleared, '显示全部 17 个 Profile');
  assert.equal(status({ active: true, hitCount: 0, totalCount: 17, metadataAvailable: false }),
    'Technique metadata unavailable');
  assert.equal(status({ active: false, hitCount: 0, totalCount: 17, metadataAvailable: false }),
    'Technique metadata unavailable');
}

test('reactivity: non-finite raw values stay missing and finite <=0 values are distinct', () => {
  verifyThreeStates(sourcePure);
});

test('reactivity: positive-only P95 caps the extreme and preserves the positive color scale', () => {
  verifyPositiveScale(sourcePure);
});

test('Technique feedback covers hits, clear, and unavailable metadata', () => {
  verifyTechniqueStatus(sourcePure);
});

test('reactivity rejects non-array inputs and accepts Float32Array without losing length', () => {
  const normalize = sourcePure.normalizeReactivityProfile;
  for (const invalid of [undefined, null, 7, {}, { length: 2, 0: 1 }, '1,2', new DataView(new ArrayBuffer(8))]) {
    assert.throws(() => normalize(invalid), TypeError);
  }
  const typed = normalize(new Float32Array([NaN, -1, 0, 1]));
  assert.deepEqual([...typed.byPosition.values()].map((row) => row.state),
    ['missing', 'nonpositive', 'nonpositive', 'positive']);
  assert.equal(typed.byPosition.size, 4);
});

test('reactivity empty and all-missing inputs keep zero cap and consistent counts', () => {
  const normalize = sourcePure.normalizeReactivityProfile;
  const empty = normalize([]);
  assert.equal(empty.byPosition.size, 0);
  assert.deepEqual([
    empty.cap, empty.mappedCount, empty.missingCount,
    empty.nonpositiveCount, empty.positiveCount, empty.cappedCount,
  ], [0, 0, 0, 0, 0, 0]);

  const allMissing = normalize([NaN, Infinity, -Infinity]);
  assert.equal(allMissing.byPosition.size, 3);
  assert.deepEqual([
    allMissing.cap, allMissing.mappedCount, allMissing.missingCount,
    allMissing.nonpositiveCount, allMissing.positiveCount, allMissing.cappedCount,
  ], [0, 0, 3, 0, 0, 0]);
  assert.ok([...allMissing.byPosition.values()].every((row) => row.state === 'missing' && row.norm === 0));
});

test('Technique feedback rejects invalid or inconsistent counts even when metadata is unavailable', () => {
  const status = sourcePure.publicTechniqueFilterStatus;
  for (const [hitCount, totalCount] of [
    [-1, 17], [NaN, 17], [1.5, 17], [1, -1], [1, NaN], [1, Infinity], [18, 17],
  ]) {
    for (const metadataAvailable of [true, false]) {
      assert.throws(
        () => status({ active: true, hitCount, totalCount, metadataAvailable }),
        (error) => error instanceof TypeError || error instanceof RangeError,
        `invalid counts ${hitCount}/${totalCount} must never be rendered`,
      );
    }
  }
});
