import { readFileSync } from 'node:fs';
import { moleculeName, rowCaseId, rowCaseKey } from '../annojoinAtlasTableModel.js';

const ANNOJOIN_ATLAS_BASE = new URL('../assets/generated/annojoin-atlas/', import.meta.url);
const PROBING_ARTICLES_BASE = new URL('../assets/generated/probing-articles/', import.meta.url);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const CLEAN_TOKEN_PLACEHOLDERS = new Set(['', '未注释', 'not annotated', 'missing source']);
const CLEAN_TOKEN_NULLISH = new Set(['none', 'null', 'nan']);
const SEARCH_METHOD_LABELS = {
  'carbodiimide': 'Carbodiimide',
  'cleavage-footprinting': 'Cleavage',
  'dms-based-probing': 'DMS',
  'enzymatic-probing': 'Cleavage',
  'guanine-specific-probing': 'Guanine-specific',
  'rna-protein-interaction': 'RNA interaction',
  'shape-based-probing': 'SHAPE'
};

function cleanToken(value) {
  const token = String(value ?? '').trim();
  if (CLEAN_TOKEN_PLACEHOLDERS.has(token)) return '';
  if (CLEAN_TOKEN_NULLISH.has(token.toLowerCase())) return '';
  return token;
}

function summaryMethods(row) {
  const methods = Array.isArray(row.techniqueFamilies)
    ? row.techniqueFamilies
    : (Array.isArray(row.assayFamilies) ? row.assayFamilies : []);
  return [...new Set(methods.map((method) => SEARCH_METHOD_LABELS[cleanToken(method)]).filter(Boolean))].slice(0, 2);
}

function caseDocId(caseKey, caseId) {
  const raw = String(caseKey || caseId || '').trim();
  const slug = raw.toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-+|-+$/g, '');
  const identity = Buffer.from(raw, 'utf8').toString('hex');
  return `pdb-case-${slug}-${identity}`;
}

// 与 Entry 表保持同一条已部署的 chain-grain case 路由。
function caseDetailHref(caseId, chain) {
  const query = new URLSearchParams();
  if (caseId) query.set('pdb', caseId);
  if (chain) query.set('chain', chain);
  const suffix = query.toString();
  return `#entry-case${suffix ? `?${suffix}` : ''}`;
}

function tagForCase(row) {
  const structureClass = cleanToken(row.structureClass).toLowerCase();
  return [
    'rna',
    'structure',
    'pdb',
    cleanToken(row.assetFamily).toLowerCase(),
    structureClass.replace(/\s+/g, '-')
  ].filter(Boolean);
}

// pdb-case 文档来自新的 annojoin-atlas index.json（displayCases，链身份口径）。
// 资产缺失时静默降级为空集，搜索语料仍可构建。
// 标题/摘要/正文各司其职、互不重复：title=分子名，summary=PDB+结构类别，
// content=可检索 token（PDB id、RNA family、motif、assay 等），避免 pagefind 摘要堆叠。
function buildPdbCaseDocs() {
  let index;
  try {
    index = JSON.parse(readFileSync(new URL('index.json', ANNOJOIN_ATLAS_BASE), 'utf8'));
  } catch {
    return [];
  }
  return (index.displayCases || []).map((row) => {
    const caseId = rowCaseId(row);
    const caseKey = rowCaseKey(row);
    const title = moleculeName(row);
    const structureClass = cleanToken(row.structureClass);
    const rnaFamily = cleanToken(row.rnaFamily);
    const summaryParts = [
      caseId ? `PDB ${caseId}` : '',
      Array.isArray(row.chains) && row.chains[0] ? `Chain ${row.chains[0]}` : '',
      structureClass || rnaFamily
    ].filter(Boolean);
    const detailParts = [
      row.profileCount ? `${row.profileCount} profiles` : '',
      summaryMethods(row).join(' / '),
      (Array.isArray(row.sourceDatabases) ? row.sourceDatabases.map(cleanToken).filter(Boolean) : []).join(' / ')
    ].filter(Boolean);
    const contentTokens = [
      caseId,
      cleanToken(row.pdbId),
      cleanToken(row.assetFamily),
      rnaFamily,
      cleanToken(row.motif),
      structureClass,
      ...(Array.isArray(row.assayFamilies) ? row.assayFamilies.map(cleanToken) : []),
      ...(Array.isArray(row.sourceDatabases) ? row.sourceDatabases.map(cleanToken) : []),
      row.profileCount ? `profiles ${row.profileCount}` : ''
    ].filter((part) => part != null && String(part).trim() !== '');
    return {
      id: caseDocId(caseKey, caseId),
      type: 'pdb-case',
      title,
      href: caseDetailHref(caseId, Array.isArray(row.chains) ? row.chains[0] : ''),
      tags: tagForCase(row),
      techniques: (Array.isArray(row.techniqueFamilies) && row.techniqueFamilies.length
        ? row.techniqueFamilies
        : (Array.isArray(row.assayFamilies) ? row.assayFamilies : [])
      ).map((t) => cleanToken(t)).filter(Boolean),
      summary: summaryParts.join(' · '),
      details: detailParts.join(' · '),
      content: [...new Set(contentTokens)].join(' ')
    };
  });
}

function buildProbingArticleDocs() {
  let index;
  try {
    index = JSON.parse(readFileSync(new URL('index.json', PROBING_ARTICLES_BASE), 'utf8'));
  } catch {
    return [];
  }
  const slugToFamily = {};
  for (const family of index.families || []) {
    for (const art of family.articles || []) {
      slugToFamily[art.slug] = { id: family.id, title: family.title };
    }
  }
  return (index.articles || []).map((art) => {
    const fam = slugToFamily[art.slug] || { id: 'probing', title: '' };
    return {
      id: `probing-article-${art.slug}`,
      type: 'probing-article',
      title: art.title,
      href: `#probing?tech=${art.slug}`,
      tags: ['probing', fam.id].filter(Boolean),
      summary: art.summary || '',
      content: [art.title, art.summary, fam.title].filter(Boolean).join(' ')
    };
  });
}

export function buildSearchDocuments() {
  return [...buildPdbCaseDocs(), ...buildProbingArticleDocs()];
}

export function renderSearchDocumentHtml(doc) {
  const tags = (doc.tags ?? [])
    .map((tag) => `<span data-pagefind-filter="tag:${escapeHtml(tag)}"></span>`)
    .join('');

  const techniqueFacets = (doc.techniques ?? [])
    .map((t) => `<span data-pagefind-filter="technique:${escapeHtml(t)}"></span>`)
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(doc.title)}</title>
  </head>
  <body>
    <main
      data-pagefind-body
      data-pagefind-filter="type:${escapeHtml(doc.type)}"
      data-pagefind-meta="href:${escapeHtml(doc.href)}"
    >
      ${tags}
      ${techniqueFacets}
      <span data-pagefind-meta="type:${escapeHtml(doc.type)}"></span>
      <span data-pagefind-meta="tags:${escapeHtml((doc.tags ?? []).join(','))}"></span>
      <h1 data-pagefind-meta="title">${escapeHtml(doc.title)}</h1>
      <p data-pagefind-meta="summary">${escapeHtml(doc.summary)}</p>
      <p data-pagefind-meta="details">${escapeHtml(doc.details)}</p>
      <p>${escapeHtml(doc.content)}</p>
    </main>
  </body>
</html>
`;
}
