// homeScrollStoryStore.js — 浏览器侧主页招牌滚动叙事 story.json 资产加载层。
// 与 probingArticleStore 同构：相对路径基址 + 内存缓存 + 可注入 fetch，
// 使其可 node --test 而不触真实网络。
// story.json（含 cases 数组）由构建期任务生成。

export const DEFAULT_ASSET_BASE = './src/assets/generated/home-scroll-story';

/**
 * 创建主页滚动叙事 story 资产 store。
 * @param {object} [opts]
 * @param {string} [opts.assetBase] 生成资产根路径（默认相对路径，剥尾斜杠）
 * @param {Function} [opts.fetchImpl] 注入的 fetch（测试用）；默认全局 fetch
 */
export function createHomeScrollStoryStore({ assetBase = DEFAULT_ASSET_BASE, fetchImpl } = {}) {
  const base = String(assetBase).replace(/\/$/, '');
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  let cached = null;

  async function loadStory() {
    if (cached) return cached;
    const url = `${base}/story.json`;
    const res = await doFetch(url);
    if (!res || !res.ok) {
      throw new Error(`[homeScrollStoryStore] 加载失败 ${url}（状态 ${res ? res.status : 'no-response'}）`);
    }
    cached = await res.json();
    return cached;
  }

  return {
    loadStory,
    assetBase: base
  };
}
