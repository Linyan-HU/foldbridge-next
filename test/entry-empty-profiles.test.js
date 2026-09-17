import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntryRows } from '../src/entryTable.js';
import { renderEntryTablePage } from '../src/entryTableView.js';

// 空 profile 链置灰降级：该链所有 profile 在目标链窗口内全空（全 NaN / 窗口内全 0）。
test('normalizeEntryRows reads empty_profiles / empty_profile_type flags', () => {
  const rows = normalizeEntryRows({
    rows: [
      { pdb_id: '8F0N', auth: 'B', empty_profiles: true, empty_profile_type: 'window_empty' },
      { pdb_id: '10FZ', auth: 'A' }
    ]
  });
  assert.equal(rows[0].emptyProfiles, true);
  assert.equal(rows[0].emptyProfileType, 'window_empty');
  assert.equal(rows[1].emptyProfiles, false);
  assert.equal(rows[1].emptyProfileType, '');
});

test('renderRow: empty-profile chain grays the row and degrades the Molecule link but keeps RCSB', () => {
  const row = {
    pdbId: '8F0N', auth: 'B', chainKey: 'B[B]', sciName: 'DNA/RNA hybrid',
    partition: 'p', nProfiles: 2, emptyProfiles: true, emptyProfileType: 'window_empty'
  };
  const html = renderEntryTablePage({ rows: [row] });
  // 整行置灰类 + 悬浮说明
  assert.match(html, /<tr class="entry-row-empty-profiles" title="[^"]*aligned chain window[^"]*">/);
  // Molecule(sciName) 详情链接降级为纯文本：无 #entry-case <a>
  assert.doesNotMatch(html, /href="[^"]*#entry-case[^"]*">DNA\/RNA hybrid<\/a>/);
  // RCSB 外链保留（RCSB 永不缺页）
  assert.match(html, /href="https:\/\/www\.rcsb\.org\/structure\/8F0N"/);
});

test('renderRow: normal chain keeps the Molecule detail link', () => {
  const row = {
    pdbId: '7SYS', auth: 'z', chainKey: 'I[z]', sciName: 'E. coli 16S rRNA',
    partition: 'rRNA', nProfiles: 3
  };
  const html = renderEntryTablePage({ rows: [row] });
  assert.match(html, /href="[^"]*#entry-case[^"]*">E\. coli 16S rRNA<\/a>/);
  assert.doesNotMatch(html, /entry-row-empty-profiles/);
});
