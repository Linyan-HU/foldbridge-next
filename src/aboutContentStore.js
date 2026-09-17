// aboutContentStore.js — 浏览器侧 About / 方法学页策展内容加载层。
// 与 probingArticleStore 同构：相对路径基址 + 内存缓存，避免重复 fetch。
// 内容由入 git 的静态资产 src/assets/data/about-content.json 提供（构建期可信）。

const ABOUT_CONTENT_PATH = 'assets/data/about-content.json';

/**
 * 创建 About 内容 store。
 * @param {object} [opts]
 * @param {string} [opts.assetBase] 资产根路径（默认相对路径 './'）
 * @param {Function} [opts.fetchImpl] 注入的 fetch（测试用）；默认全局 fetch
 */
export function createAboutContentStore({ assetBase = './', fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? ((...a) => fetch(...a)) : null);
  let cache = null;

  async function loadContent() {
    if (cache) return cache;
    if (!doFetch) return null;
    try {
      const res = await doFetch(`${assetBase}${ABOUT_CONTENT_PATH}`);
      if (!res || !res.ok) return null;
      cache = await res.json();
      return cache;
    } catch (_e) {
      return null;
    }
  }

  return { loadContent, peek: () => cache };
}
