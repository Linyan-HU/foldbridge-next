import { MECHANISM_FAMILIES } from '../techniqueFilterModel.js';

const SEARCH_FILTER_KEYS = ['type', 'tag', 'technique'];
const LEGACY_EXTENDED_PDB_ID = /^pdb_0000([0-9a-z]{4})$/i;

export function normalizeSearchQuery(value = '') {
  const query = String(value || '').trim();
  const match = LEGACY_EXTENDED_PDB_ID.exec(query);
  return match ? match[1].toUpperCase() : query;
}

const PAGEFIND_TECHNIQUE_FACETS = {
  dms: ['dms-based-probing'],
  shape: ['shape-based-probing'],
  cleavage: ['enzymatic-probing', 'cleavage-footprinting'],
  nucleotide: ['carbodiimide', 'guanine-specific-probing'],
  interaction: ['rna-protein-interaction']
};

const TECHNIQUE_FILTER_OPTIONS = MECHANISM_FAMILIES.map(({ id, label }) => {
  const facets = PAGEFIND_TECHNIQUE_FACETS[id];
  if (!facets) throw new Error(`Missing Pagefind facets for mechanism family: ${id}`);
  return { value: id, label, facets };
});

const RNA_TYPE_FILTER_OPTIONS = [
  { value: 'rrna', label: 'rRNA' },
  { value: 'trna', label: 'tRNA' },
  { value: 'mrna', label: 'mRNA' },
  { value: 'other_rna', label: 'Other RNA' },
  { value: 'ribozyme', label: 'Ribozyme' },
  { value: 'riboswitch', label: 'Riboswitch' },
  { value: 'snrna', label: 'snRNA' },
  { value: 'viral', label: 'Viral RNA' },
  { value: 'aptamer', label: 'Aptamer' },
  { value: 'synthetic_rna', label: 'Synthetic RNA' },
  { value: 'srp_rna', label: 'SRP RNA' },
  { value: 'designed_rna', label: 'Designed RNA' }
];

export const SEARCH_FILTER_GROUPS = [
  { key: 'technique', options: TECHNIQUE_FILTER_OPTIONS },
  { key: 'tag', options: RNA_TYPE_FILTER_OPTIONS },
  { key: 'type' }
];

const TECHNIQUE_FILTER_BY_VALUE = new Map(TECHNIQUE_FILTER_OPTIONS.map((option) => [option.value, option]));
const RNA_TYPE_FILTER_VALUES = new Set(RNA_TYPE_FILTER_OPTIONS.map((option) => option.value));

export function visibleSearchFilterEntries(filters = {}, key = '') {
  const group = SEARCH_FILTER_GROUPS.find((item) => item.key === key);
  const counts = filters?.[key] ?? {};
  if (group?.options) {
    return group.options.map((option) => ({
      value: option.value,
      label: option.label,
      count: (option.facets ?? [option.value]).reduce((sum, facet) => sum + (Number(counts[facet]) || 0), 0)
    }));
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([value, count]) => ({ value, label: value, count }));
}

export function searchParamsFromHash(hashValue = '') {
  const hash = String(hashValue || '');
  const queryString = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(queryString);
}

export function filtersFromSearchParams(params) {
  const filters = {};

  for (const key of SEARCH_FILTER_KEYS) {
    const values = params.getAll(key).filter(Boolean);
    if (values.length === 1) filters[key] = values[0];
    if (values.length > 1) filters[key] = values;
  }

  return filters;
}

export function pageFromSearchParams(params) {
  const page = Number(params?.get?.('page'));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function buildSearchHash({ q = '', filters = {}, page = 1 } = {}) {
  const params = new URLSearchParams();
  const query = String(q || '').trim();
  if (query) params.set('q', query);

  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of values.filter(Boolean)) {
      params.append(key, item);
    }
  }

  const normalizedPage = Number(page);
  if (Number.isSafeInteger(normalizedPage) && normalizedPage > 1) {
    params.set('page', String(normalizedPage));
  }

  const queryString = params.toString();
  return queryString ? `#search?${queryString}` : '#search';
}

function normalizeFilters(filters = {}) {
  const normalized = {};
  for (const key of SEARCH_FILTER_KEYS) {
    const value = filters[key];
    const values = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
    let cleaned = values;
    if (key === 'technique') {
      cleaned = values.flatMap((item) => {
        const option = TECHNIQUE_FILTER_BY_VALUE.get(item);
        if (!option) throw new Error(`Unsupported technique filter: ${item}`);
        return option.facets;
      });
    }
    if (key === 'tag') {
      const unsupported = values.find((item) => !RNA_TYPE_FILTER_VALUES.has(item));
      if (unsupported) throw new Error(`Unsupported RNA tag filter: ${unsupported}`);
    }
    if (cleaned.length) {
      if (cleaned.length === 1) normalized[key] = cleaned[0];
      if (cleaned.length > 1) normalized[key] = cleaned;
    }
  }
  return normalized;
}

function getPagefindBundlePath() {
  if (typeof window === 'undefined') return '/dist/pagefind/pagefind.js';
  const marker = '/dist/';
  const path = window.location.pathname;
  const index = path.indexOf(marker);
  if (index >= 0) return `${path.slice(0, index + marker.length)}pagefind/pagefind.js`;
  return '/dist/pagefind/pagefind.js';
}

async function defaultPagefindLoader() {
  return import(getPagefindBundlePath());
}

function mapResult(data) {
  const tags = String(data.meta?.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    title: data.meta?.title ?? data.title ?? 'Untitled result',
    href: data.meta?.href ?? data.url,
    summary: data.meta?.summary ?? '',
    details: data.meta?.details ?? '',
    type: data.meta?.type,
    tags
  };
}

export function createSearchService({ pagefindLoader = defaultPagefindLoader } = {}) {
  let pagefindPromise = null;
  let availableFiltersPromise = null;

  async function getPagefind() {
    if (!pagefindPromise) {
      pagefindPromise = pagefindLoader().then((pagefind) => {
        pagefind.init?.();
        return pagefind;
      });
    }
    return pagefindPromise;
  }

  async function getFilters() {
    if (!availableFiltersPromise) {
      availableFiltersPromise = getPagefind().then((pagefind) => pagefind.filters?.() ?? {});
    }
    return availableFiltersPromise;
  }

  async function search({ q = '', filters = {}, page = 1, pageSize = 10 } = {}) {
    const query = String(q || '').trim();
    const pagefindQuery = normalizeSearchQuery(query);
    const normalizedFilters = normalizeFilters(filters);
    const hasFilters = Object.keys(normalizedFilters).length > 0;
    const normalizedPageSize = Math.max(1, Number(pageSize) || 10);
    const availableFilters = await getFilters();

    if (!query && !hasFilters) {
      return {
        query,
        filters: normalizedFilters,
        items: [],
        total: 0,
        page: 1,
        pageSize: normalizedPageSize,
        totalPages: 0,
        unfilteredTotal: 0,
        availableFilters,
        resultFilters: {}
      };
    }

    const pagefind = await getPagefind();
    const raw = await pagefind.search(pagefindQuery || null, { filters: normalizedFilters });
    const total = raw.results.length;
    const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
    const requestedPage = Number(page);
    const currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, totalPages)
      : 1;
    const start = (currentPage - 1) * normalizedPageSize;
    const end = start + normalizedPageSize;
    const items = await Promise.all(raw.results.slice(start, end).map(async (result) => mapResult(await result.data())));

    return {
      query,
      filters: normalizedFilters,
      items,
      total,
      page: currentPage,
      pageSize: normalizedPageSize,
      totalPages,
      unfilteredTotal: raw.unfilteredResultCount ?? total,
      availableFilters,
      resultFilters: raw.filters ?? {},
      totalFilters: raw.totalFilters ?? {}
    };
  }

  return {
    getFilters,
    search,
    warm: () => getPagefind()
  };
}
