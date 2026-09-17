// rmdbCaseStore.js — 浏览器侧 RMDB→PDB case 资产加载层。
// 只通过静态 index/case 中的资产路径调度静态小资产；带内存缓存，避免重复 fetch。
// 路径基址用相对路径，与现有 dataAssetPath 约定一致，避免部署到子路径时解析错误。

export const DEFAULT_ASSET_BASE = './src/assets/generated/rmdb-pdb-cases';

/**
 * 创建一个 case 资产 store。
 * @param {object} [opts]
 * @param {string} [opts.assetBase] 生成资产根路径（默认相对路径）
 * @param {Function} [opts.fetchImpl] 注入的 fetch（测试用）；默认全局 fetch
 */
export function createCaseStore({ assetBase = DEFAULT_ASSET_BASE, fetchImpl } = {}) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  const cache = new Map();

  async function loadJson(relPath) {
    if (cache.has(relPath)) return cache.get(relPath);
    const url = `${assetBase}/${relPath}`;
    const res = await doFetch(url);
    if (!res || !res.ok) {
      throw new Error(`[rmdbCaseStore] 加载失败 ${url}（状态 ${res ? res.status : 'no-response'}）`);
    }
    const data = await res.json();
    cache.set(relPath, data);
    return data;
  }

  return {
    loadCaseIndex() {
      return loadJson('index.json');
    },
    loadCase(pdbId) {
      return loadJson(`cases/${pdbId}/case.json`);
    },
    loadProfiles(pdbId) {
      return loadJson(`cases/${pdbId}/profiles.json`);
    },
    loadAlignmentPage(pdbId, page) {
      const name = String(page).padStart(4, '0');
      return loadJson(`cases/${pdbId}/alignments/page-${name}.json`);
    },
    loadReactivitySummary(pdbId, profileKey) {
      return loadJson(`cases/${pdbId}/reactivity/${profileKey}/summary.json`);
    },
    loadReactivityWindow(pdbId, profileKey, start, end) {
      return loadJson(`cases/${pdbId}/reactivity/${profileKey}/pdb-pos-${start}-${end}.json`);
    },
    // 同步缓存读取（供同步渲染路径命中已加载资产）
    peek(relPath) {
      return cache.get(relPath);
    }
  };
}
