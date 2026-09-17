import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSearchHash,
  createSearchService,
  normalizeSearchQuery,
  pageFromSearchParams,
} from '../src/search/searchService.js';

test('normalizeSearchQuery canonicalizes only complete padded PDB identifiers', () => {
  assert.equal(normalizeSearchQuery(' pdb_00001ddy '), '1DDY');
  assert.equal(normalizeSearchQuery('PDB_00001DDY'), '1DDY');
  assert.equal(normalizeSearchQuery('1DDY'), '1DDY');

  for (const query of ['pdb_00001dd', 'pdb_00001ddyy', 'pdb_000012345']) {
    assert.equal(normalizeSearchQuery(query), query);
  }
});

function createPagefindHarness() {
  const queries = [];
  const pdbResult = {
    id: 'pdb-case:1DDY',
    score: 1,
    words: ['1ddy'],
    locations: [],
    weighted_locations: [],
    async data() {
      return {
        url: '#entry-case?pdb=1DDY',
        excerpt: 'PDB case 1DDY',
        meta: {
          title: 'PDB 1DDY',
          href: '#entry-case?pdb=1DDY',
          type: 'pdb-case',
          tags: 'riboswitch,pdb',
        },
      };
    },
  };
  const riboswitchResult = {
    id: 'article:riboswitch',
    score: 0.9,
    words: ['riboswitch'],
    locations: [],
    weighted_locations: [],
    async data() {
      return {
        url: '#probing?article=riboswitch',
        excerpt: 'Riboswitch probing article',
        meta: {
          title: 'Riboswitch probing',
          href: '#probing?article=riboswitch',
          type: 'article',
          tags: 'riboswitch',
        },
      };
    },
  };

  const pagefind = {
    async init() {},
    async filters() {
      return {};
    },
    async search(query) {
      queries.push(query);
      const results = query === '1DDY'
        ? [pdbResult]
        : query === 'riboswitch'
          ? [riboswitchResult]
          : [];
      return {
        results,
        unfilteredResultCount: results.length,
        filters: {},
        totalFilters: {},
      };
    },
  };

  return {
    queries,
    pagefindLoader: async () => pagefind,
  };
}

test('search normalizes padded PDB identifiers only at the Pagefind boundary', async () => {
  const harness = createPagefindHarness();
  const service = createSearchService({ pagefindLoader: harness.pagefindLoader });

  const pdbSearch = await service.search({ q: 'pdb_00001ddy' });
  const textSearch = await service.search({ q: 'riboswitch' });

  assert.equal(harness.queries[0], '1DDY');
  assert.equal(pdbSearch.query, 'pdb_00001ddy');
  assert.equal(harness.queries[1], 'riboswitch');
  assert.equal(textSearch.query, 'riboswitch');
});

test('prefixed and canonical PDB queries expose the same result set', async () => {
  const harness = createPagefindHarness();
  const service = createSearchService({ pagefindLoader: harness.pagefindLoader });

  const prefixed = await service.search({ q: 'pdb_00001ddy' });
  const canonical = await service.search({ q: '1DDY' });

  assert.deepEqual(prefixed.items, canonical.items);
  assert.equal(prefixed.total, canonical.total);
});

test('search pagination returns ten results per page and clamps an out-of-range page', async () => {
  const results = Array.from({ length: 12 }, (_, index) => ({
    async data() {
      return {
        excerpt: `Excerpt ${index + 1}`,
        meta: { title: `Result ${index + 1}`, href: `#entry-case?pdb=${index + 1}` },
      };
    },
  }));
  const service = createSearchService({
    pagefindLoader: async () => ({
      async init() {},
      async filters() { return {}; },
      async search() { return { results }; },
    }),
  });

  const secondPage = await service.search({ q: 'rna', page: 2, pageSize: 10 });
  const clampedPage = await service.search({ q: 'rna', page: 999, pageSize: 10 });

  assert.equal(secondPage.total, 12);
  assert.equal(secondPage.totalPages, 2);
  assert.equal(secondPage.page, 2);
  assert.deepEqual(secondPage.items.map((item) => item.title), ['Result 11', 'Result 12']);
  assert.equal(clampedPage.page, 2);
  assert.deepEqual(clampedPage.items.map((item) => item.title), ['Result 11', 'Result 12']);
});

test('search page is persisted in the hash only after page one', () => {
  assert.equal(buildSearchHash({ q: 'rna', page: 1 }), '#search?q=rna');
  assert.equal(buildSearchHash({ q: 'rna', page: 2 }), '#search?q=rna&page=2');
  assert.equal(pageFromSearchParams(new URLSearchParams('page=2')), 2);
  assert.equal(pageFromSearchParams(new URLSearchParams('page=0')), 1);
});
