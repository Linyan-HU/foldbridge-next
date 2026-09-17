// probingArticleStore.js — 浏览器侧 RNA 探针科普文章资产加载层。
// 与 rmdbCaseStore 同构：相对路径基址 + 内存缓存，避免重复 fetch。
// index.json（家族分组 + 卡片）与每篇 <slug>.json（有序 block）由
// scripts/build-probing-articles.mjs 在构建期生成。

export const DEFAULT_ASSET_BASE = './src/assets/generated/probing-articles';

/**
 * 创建探针文章资产 store。
 * @param {object} [opts]
 * @param {string} [opts.assetBase] 生成资产根路径（默认相对路径）
 * @param {Function} [opts.fetchImpl] 注入的 fetch（测试用）；默认全局 fetch
 */
export function createProbingArticleStore({ assetBase = DEFAULT_ASSET_BASE, fetchImpl } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const cache = new Map();

  async function loadJson(relPath) {
    if (cache.has(relPath)) return cache.get(relPath);
    const url = `${assetBase}/${relPath}`;
    const res = await doFetch(url);
    if (!res || !res.ok) {
      throw new Error(`[probingArticleStore] 加载失败 ${url}（状态 ${res ? res.status : 'no-response'}）`);
    }
    const data = await res.json();
    cache.set(relPath, data);
    return data;
  }

  return {
    loadIndex() {
      return loadJson('index.json');
    },
    loadArticle(slug) {
      return loadJson(`${slug}.json`);
    },
    // 同步缓存读取（供同步渲染路径命中已加载资产）
    peek(relPath) {
      return cache.get(relPath);
    }
  };
}
