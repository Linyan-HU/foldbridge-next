const ALLOWED_ROUTES = new Set([
  'home',
  'browse',
  'entry',
  'sequence',
  'structure',
  'probing',
  'help',
  'stats',
  'download',
  'pdb-downloads',
  'search',
  'detail',
  'publications',
  'sequence-detail',
  'pdb-case',
  'entry-case',
  'annojoin-atlas',
  'annojoin-case',
  'annojoin-confidence'
]);

export function normalizeRoute(value) {
  if (typeof value !== 'string') return 'home';
  const lowered = value.trim().toLowerCase();
  return ALLOWED_ROUTES.has(lowered) ? lowered : 'home';
}

export function parseHashRoute(hashValue) {
  if (typeof hashValue !== 'string' || hashValue.length === 0) {
    return { route: 'home', params: new URLSearchParams() };
  }

  const withoutHash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
  const [routeOnly = 'home', queryString = ''] = withoutHash.split('?');
  // 探针家族同页锚点（#probing-family-<id>）：解析成 probing 总览路由，
  // 使无 JS / 直达链接时也落在探针页并由浏览器原生跳到对应 section，而非归一化回 home。
  if (/^probing-family-/i.test(routeOnly)) {
    return { route: 'probing', params: new URLSearchParams(queryString) };
  }
  return {
    route: normalizeRoute(routeOnly),
    params: new URLSearchParams(queryString)
  };
}

export function routeFromHash(hashValue) {
  return parseHashRoute(hashValue).route;
}

export function buildPdbCaseHash({ pdbId, pdbReferenceId, bundleProfileId, rmdbUniqueId } = {}) {
  const normalizedPdbId = String(pdbId ?? '').trim().toUpperCase();
  const params = new URLSearchParams();
  if (normalizedPdbId) params.set('pdbId', normalizedPdbId);
  if (pdbReferenceId) params.set('pdbReferenceId', String(pdbReferenceId).trim());
  if (bundleProfileId) params.set('bundleProfileId', String(bundleProfileId).trim());
  if (rmdbUniqueId) params.set('rmdbUniqueId', String(rmdbUniqueId).trim());
  const query = params.toString();
  return query ? `#pdb-case?${query}` : '#pdb-case';
}
