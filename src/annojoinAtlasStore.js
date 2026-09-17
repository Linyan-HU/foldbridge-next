export const DEFAULT_ANNOJOIN_ATLAS_BASE = './src/assets/generated/annojoin-atlas';
export const DETAIL_ROUTE_INDEX_PATH = 'detail-route-index.json';
export const DEFAULT_BROTLI_DECODER_URL = './third-party/brotli-wasm/index.web.js';

function joinAssetUrl(baseUrl, relPath) {
  const encodedPath = String(relPath)
    .replace(/^\//, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${String(baseUrl).replace(/\/$/, '')}/${encodedPath}`;
}

export function createAnnojointAtlasStore({
  baseUrl = DEFAULT_ANNOJOIN_ATLAS_BASE,
  fetcher = globalThis.fetch?.bind(globalThis),
  brotliDecoder = null,
  brotliDecoderUrl = DEFAULT_BROTLI_DECODER_URL
} = {}) {
  if (!fetcher) {
    throw new Error('[annojoinAtlasStore] fetch is not available');
  }

  let indexPromise = null;
  let detailRouteIndexPromise = null;
  let brotliDecoderPromise = null;
  const caseCache = new Map();
  const routePageCache = new Map();

  async function loadJson(relPath) {
    const url = joinAssetUrl(baseUrl, relPath);
    const response = await fetcher(url);
    if (!response?.ok) {
      throw new Error(`[annojoinAtlasStore] failed to load ${url} (${response?.status || 'no-response'})`);
    }
    return response.json();
  }

  async function fetchArrayBuffer(relPath) {
    const url = joinAssetUrl(baseUrl, relPath);
    const response = await fetcher(url);
    if (!response?.ok) return null;
    return response.arrayBuffer();
  }

  async function resolveBrotliDecoder() {
    if (brotliDecoder) return brotliDecoder;
    if (!brotliDecoderPromise) {
      brotliDecoderPromise = import(brotliDecoderUrl)
        .catch(() => import('brotli-wasm'))
        .then(async (mod) => {
          const loaded = typeof mod.default?.then === 'function'
            ? await mod.default
            : mod.default || mod;
          return loaded.decompress || mod.decompress || loaded.BrotliDecode || mod.BrotliDecode || null;
        })
        .catch(() => null);
    }
    return brotliDecoderPromise;
  }

  async function decodeBrotli(bytes) {
    const decoder = await resolveBrotliDecoder();
    if (!decoder) throw new Error('[annojoinAtlasStore] Brotli decoder is not available');
    return decoder(bytes);
  }

  async function decodeGzip(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('[annojoinAtlasStore] DecompressionStream(gzip) is not available');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }

  function parseDecodedJson(decoded) {
    const text = typeof decoded === 'string'
      ? decoded
      : new TextDecoder().decode(decoded);
    return JSON.parse(text);
  }

  async function loadCompressedJson(relPath) {
    const brotliBytes = await fetchArrayBuffer(`${relPath}.br`);
    if (brotliBytes) {
      try {
        return parseDecodedJson(await decodeBrotli(brotliBytes));
      } catch (error) {
        console.warn('[annojoinAtlasStore] Brotli decode failed, falling back', relPath, error);
      }
    }

    const gzipBytes = await fetchArrayBuffer(`${relPath}.gz`);
    if (gzipBytes) {
      try {
        return parseDecodedJson(await decodeGzip(gzipBytes));
      } catch (error) {
        console.warn('[annojoinAtlasStore] gzip decode failed, falling back', relPath, error);
      }
    }

    return loadJson(relPath);
  }

  function loadJsonMaybeCompressed(relPath, { compressed = false } = {}) {
    return compressed ? loadCompressedJson(relPath) : loadJson(relPath);
  }

  async function loadIndex() {
    if (!indexPromise) indexPromise = loadJson('index.json');
    return indexPromise;
  }

  async function loadDetailRouteIndex() {
    if (!detailRouteIndexPromise) {
      detailRouteIndexPromise = loadCompressedJson(DETAIL_ROUTE_INDEX_PATH);
    }
    return detailRouteIndexPromise;
  }

  async function loadCase(caseId, options = {}) {
    const normalizedCaseId = String(caseId ?? '').trim();
    if (!normalizedCaseId) throw new Error('[annojoinAtlasStore] caseId is required');
    const cacheKey = `${options.compressed ? 'compressed' : 'raw'}:${normalizedCaseId}`;
    if (!caseCache.has(cacheKey)) {
      caseCache.set(cacheKey, loadJsonMaybeCompressed(`cases/${encodeURIComponent(normalizedCaseId)}.json`, options));
    }
    return caseCache.get(cacheKey);
  }

  async function loadCaseAssetPath(caseAssetPath, options = {}) {
    const normalizedPath = String(caseAssetPath ?? '').trim();
    if (!normalizedPath) throw new Error('[annojoinAtlasStore] caseAssetPath is required');
    return loadAssetPath(normalizedPath, options);
  }

  async function loadAssetPath(assetPath, options = {}) {
    const normalizedPath = String(assetPath ?? '').trim();
    if (!normalizedPath) throw new Error('[annojoinAtlasStore] assetPath is required');
    const cacheKey = `${options.compressed ? 'compressed' : 'raw'}:${normalizedPath}`;
    if (!caseCache.has(cacheKey)) {
      caseCache.set(cacheKey, loadJsonMaybeCompressed(normalizedPath, options));
    }
    return caseCache.get(cacheKey);
  }

  async function loadRoutePage(path, options = {}) {
    const normalizedPath = String(path ?? '').trim();
    if (!normalizedPath) throw new Error('[annojoinAtlasStore] route page path is required');
    const cacheKey = `${options.compressed ? 'compressed' : 'raw'}:${normalizedPath}`;
    if (!routePageCache.has(cacheKey)) {
      routePageCache.set(cacheKey, loadJsonMaybeCompressed(normalizedPath, options));
    }
    return routePageCache.get(cacheKey);
  }

  return { loadIndex, loadDetailRouteIndex, loadCase, loadCaseAssetPath, loadAssetPath, loadRoutePage };
}
