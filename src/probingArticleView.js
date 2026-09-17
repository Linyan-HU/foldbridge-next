// probingArticleView.js — RNA 探针科普文章的渲染层（纯函数，返回 HTML 字符串）。
// 复用站点既有 design tokens / card / technology-kicker 视觉语言；
// 文章正文用专门的 article-* class 控制阅读排版（行宽、行高、图注）。
//
// 三个入口：
//   buildProbingOverviewModel(index)        — 公开方法总览模型（5 个家族 / 28 个方法）
//   renderProbingArticleIndex(index)        — 方法总览（按机制家族分组的卡片墙）
//   renderProbingUnavailablePage(error)     — 索引不可用时的明确错误边界
//   renderProbingArticlePage(detail, index) — 单篇阅读页（标题 + 有序 block + 图注）

import { renderScientificProse } from './scientificProse.js';

const ENLARGED_FIGURE_ARTICLE_SLUGS = new Set([
  'structure-seq',
  'structure-seq2',
  'mod-seq',
  'dim-2p-seq'
]);

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortArticleName(article) {
  const title = String(article?.title || '');
  const colonIndex = title.indexOf(':');
  if (colonIndex > 0) return title.slice(0, colonIndex).trim();
  if (article?.slug === 'parte') return 'PARTE';
  return title;
}

// 行内 markdown：先转义，再恢复 `code` 与 **bold**。
function renderInline(text) {
  return String(text ?? '').split(/(`[^`]+`)/g).map((part) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return `<code class="article-code">${escapeHtml(part.slice(1, -1))}</code>`;
    }
    return renderScientificProse(part).replace(/\*\*([^*]+)\*\*/g, (_m, c) => `<strong>${c}</strong>`);
  }).join('');
}

function renderFigureLegend(text) {
  const legend = String(text == null ? '' : text);
  const titleMatch = legend.match(/^\*\*([^*]+)\*\*(.*)$/s);
  if (!titleMatch) return renderInline(legend);
  const title = `<strong>${renderInline(titleMatch[1])}</strong>`;
  const description = titleMatch[2].trimStart();
  return description ? `${title}<br />${renderInline(description)}` : title;
}

const DMS_METHOD_DESCRIPTIONS = [
  {
    slug: 'dms',
    title: 'DMS',
    description: 'Chemical probing of RNA secondary structures through selective base modification.'
  },
  {
    slug: 'dms-seq',
    title: 'DMS-seq',
    description: 'Transcriptome-wide RNA structure profiling by coupling DMS modification with sequencing.'
  },
  {
    slug: 'structure-seq',
    title: 'Structure-seq',
    description: 'In vivo transcriptome-wide RNA structure profiling using DMS.'
  },
  {
    slug: 'structure-seq2',
    title: 'Structure-seq2',
    description: 'Improved transcriptome-wide RNA structure mapping through optimized DMS probing and sequencing.'
  },
  {
    slug: 'mod-seq',
    title: 'Mod-seq',
    description: 'Genome-wide RNA structure profiling through modification-induced mutation detection.'
  },
  {
    slug: 'dms-mapseq',
    title: 'DMS-MaPseq',
    description: 'Quantitative RNA structure profiling through mutation-based DMS detection.'
  },
  {
    slug: 'dim-2p-seq',
    title: 'DIM-2P-seq',
    description: 'Mapping mRNA 3′-end RNA structures and their regulatory roles in polyadenylation.'
  }
];

const SHAPE_METHOD_DESCRIPTIONS = [
  {
    slug: 'shape',
    title: 'SHAPE',
    description: 'RNA structure probing through selective 2′-hydroxyl acylation of flexible nucleotides.',
    figure_count: 3,
    rep_pmid: '15783204'
  },
  {
    slug: 'shape-seq',
    title: 'SHAPE-Seq',
    description: 'Multiplexed RNA structure profiling by coupling SHAPE chemistry with high-throughput sequencing.',
    figure_count: 4,
    rep_pmid: '21642531'
  },
  {
    slug: 'shape-map',
    title: 'SHAPE-MaP',
    description: 'Mutation-based RNA structure profiling through SHAPE chemical probing.'
  },
  {
    slug: 'icshape',
    title: 'icSHAPE',
    description: 'In vivo transcriptome-wide RNA structure profiling using selective 2′-hydroxyl acylation.'
  },
  {
    slug: 'icshape-map',
    title: 'icSHAPE-MaP',
    description: 'In vivo RNA structure profiling using selective 2′-hydroxyl acylation and mutation detection by reverse transcription.'
  },
  {
    slug: 'nai-map',
    title: 'NAI-MaP',
    description: 'NAI-based mutational profiling for nucleotide-resolution RNA structure probing.'
  },
  {
    slug: 'smartshape',
    title: 'SmartSHAPE',
    description: 'Ultra-low-input SHAPE profiling for transcriptome-wide RNA structure analysis.'
  }
];

const CLEAVAGE_METHOD_DESCRIPTIONS = [
  {
    slug: 'pars',
    title: 'PARS',
    description: 'Parallel Analysis of RNA Structure by Enzymatic Cleavage.'
  },
  {
    slug: 'parte',
    title: 'PARTE',
    description: 'Parallel Analysis of RNA structures with Temperature Elevation.'
  },
  {
    slug: 'hrf-seq',
    title: 'HRF-seq',
    description: 'Sequencing-based mapping of RNA solvent accessibility by hydroxyl radical cleavage.'
  }
];

const NUCLEOTIDE_METHOD_DESCRIPTIONS = [
  {
    slug: 'keth-seq',
    title: 'Keth-seq',
    description: 'Sequencing-based mapping of guanine accessibility using N3-kethoxal modification.'
  },
  {
    slug: 'edc-probing',
    title: 'EDC probing',
    description: 'In-cell mapping of G and U base-pairing interactions.'
  },
  {
    slug: 'laser-seq',
    title: 'LASER-seq',
    description: 'Transcriptome-wide RNA solvent accessibility mapping using photoactivated chemical probing.'
  }
];

const RNA_INTERACTION_METHOD_DESCRIPTIONS = [
  {
    slug: 'paris',
    title: 'PARIS',
    description: 'Psoralen-based mapping of RNA duplex structures and RNA–RNA interactions.'
  },
  {
    slug: 'splash',
    title: 'SPLASH',
    description: 'Transcriptome-wide mapping of RNA–RNA interactions through psoralen-mediated proximity ligation.'
  },
  {
    slug: 'ligr-seq',
    title: 'LIGR-seq',
    description: 'Ligation-based RNA–RNA interaction mapping by in vivo crosslinking and proximity ligation.'
  },
  {
    slug: 'mario',
    title: 'MARIO',
    description: 'Global mapping of protein-mediated RNA–RNA interactions in living cells.'
  },
  {
    slug: 'ric-seq',
    title: 'RIC-seq',
    description: 'In situ mapping of RNA–RNA spatial interactions and higher-order RNA architecture.'
  },
  {
    slug: 'comrades',
    title: 'COMRADES',
    description: 'Targeted mapping of RNA–RNA interactions and RNA structures in living cells.'
  },
  {
    slug: 'mca',
    title: 'MOHCA/MOHCA-seq (MCA)',
    description: 'Tertiary proximity restraint.'
  },
  {
    slug: 'mutate-and-map',
    title: 'Mutate-and-map (M²)',
    description: 'Perturbational structural coupling.'
  }
];

const CURATED_METHODS_BY_FAMILY_ID = Object.freeze({
  dms: DMS_METHOD_DESCRIPTIONS,
  shape: SHAPE_METHOD_DESCRIPTIONS,
  'in-cell-shape': CLEAVAGE_METHOD_DESCRIPTIONS,
  footprinting: NUCLEOTIDE_METHOD_DESCRIPTIONS,
  'carbodiimide-special': RNA_INTERACTION_METHOD_DESCRIPTIONS
});

const PUBLIC_FAMILY_COPY_BY_ID = Object.freeze({
  dms: {
    title: 'DMS-based methods',
    summary: 'DMS methylates the Watson–Crick faces of adenine (N1) and cytosine (N3), reporting base accessibility and pairing-dependent protection.'
  },
  shape: {
    title: 'SHAPE-based methods',
    summary: 'SHAPE reagents acylate the ribose 2′-hydroxyl of conformationally flexible nucleotides, reporting backbone flexibility.'
  },
  'in-cell-shape': {
    title: 'Cleavage-based methods',
    summary: 'Selective cleavage of the RNA backbone generates accessibility footprints that reveal RNA structural features.'
  },
  footprinting: {
    title: 'Nucleotide-specific chemical probing methods',
    summary: 'Chemical reagents selectively modify specific nucleobases or base-pairing environments, providing nucleotide identity–specific information on RNA structure and interactions.'
  },
  'carbodiimide-special': {
    title: 'RNA–RNA interaction mapping methods',
    summary: 'Crosslinking and proximity ligation capture RNA–RNA contacts and higher-order RNA organization.'
  }
});

// ---- 总览页 ----

export function buildProbingOverviewModel(index) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    throw new Error('probing index must be an object');
  }
  if (!Array.isArray(index.families)) {
    throw new Error('probing index families must be an array');
  }

  const indexFamilies = index.families;
  for (const familyId of Object.keys(CURATED_METHODS_BY_FAMILY_ID)) {
    const matches = indexFamilies.filter((family) => family?.id === familyId);
    if (matches.length === 0) {
      throw new Error(`probing index is missing curated public family: ${familyId}`);
    }
    if (matches.length > 1) {
      throw new Error(`probing index has duplicate curated public family: ${familyId}`);
    }
  }

  const indexArticlesBySlug = new Map(
    (Array.isArray(index.articles) ? index.articles : [])
      .map((article) => [article.slug, article])
  );
  const families = indexFamilies
    .filter((family) => family.id !== 'inference'
      && Object.hasOwn(CURATED_METHODS_BY_FAMILY_ID, family.id))
    .map((family) => {
      const familyArticlesBySlug = new Map(
        (Array.isArray(family.articles) ? family.articles : [])
          .map((article) => [article.slug, article])
      );
      return {
        ...family,
        ...PUBLIC_FAMILY_COPY_BY_ID[family.id],
        methods: CURATED_METHODS_BY_FAMILY_ID[family.id].map((method) => ({
          ...(familyArticlesBySlug.get(method.slug)
            || indexArticlesBySlug.get(method.slug)
            || {}),
          ...method
        }))
      };
    });

  return {
    families,
    methodCount: families.reduce((total, family) => total + family.methods.length, 0),
    familyCount: families.length
  };
}

export function renderProbingArticleIndex(index, headerHtml = '') {
  const model = buildProbingOverviewModel(index);

  const familySections = model.families.map((family) => {
    const cards = family.methods.map((a) => {
      const meta = [];
      if (a.figure_count) meta.push(`${a.figure_count} figures`);
      if (a.rep_pmid) meta.push(`PMID ${escapeHtml(a.rep_pmid)}`);
      return `
        <a class="probing-article-card" href="#probing?tech=${encodeURIComponent(a.slug)}">
          <div class="probing-article-card-head">
            <h3>${escapeHtml(a.title)}</h3>
          </div>
          <p class="probing-article-card-summary">${renderScientificProse(a.description || a.summary)}${a.description ? '' : '…'}</p>
          <div class="probing-article-card-meta">
            ${meta.map((m) => `<span>${m}</span>`).join('')}
          </div>
        </a>`;
    }).join('');

    return `
      <details id="probing-family-${escapeHtml(family.id)}" class="technology-section-card" data-probing-family="${escapeHtml(family.id)}">
        <summary class="technology-section-summary">
          <div class="technology-section-heading">
            <div class="probing-method-section-title">
              <h2>${escapeHtml(family.title)}</h2>
              <span class="probing-method-section-count">${family.methods.length} methods</span>
            </div>
            <p>${renderScientificProse(family.summary)}</p>
            <span class="probing-method-section-action" aria-hidden="true">→</span>
          </div>
        </summary>
        <div class="probing-article-grid">${cards}</div>
      </details>`;
  }).join('');

  return `${headerHtml}
  <main class="page-detail page-probing-index">
    <section class="card bundle-wide-card technology-hero-card probing-hero-card">
      <div class="technology-hero-copy">
        <h1>Chemical probing methods</h1>
        <p class="technology-intro">Browse RNA structure probing methods by the chemical event they measure.</p>
      </div>
      <aside class="probing-hero-summary" aria-label="${model.methodCount} probing methods across ${model.familyCount} mechanism families">
        <div class="probing-hero-metric">
          <strong>${model.methodCount}</strong>
          <span>probing methods</span>
        </div>
        <div class="probing-hero-metric">
          <strong>${model.familyCount}</strong>
          <span>families</span>
        </div>
      </aside>
    </section>
    <section class="card bundle-wide-card probing-overview-card" aria-label="Probing mechanism families and methods">
      <div class="probing-method-directory-heading">
        <h2>Browse by mechanism</h2>
        <p>Select a family to view its methods.</p>
      </div>
      <div class="probing-family-collection">
        ${familySections}
      </div>
    </section>
  </main>`;
}

export function renderProbingUnavailablePage(error, headerHtml = '') {
  const message = error instanceof Error ? error.message : error;
  return `${headerHtml}
  <main class="page-detail page-probing-index">
    <section class="card bundle-wide-card technology-hero-card technology-hero-card-solo">
      <div class="technology-hero-copy">
        <h1>Chemical probing methods</h1>
        <p class="technology-intro">Probing methods unavailable</p>
        <p class="technology-intro technology-intro-secondary">${escapeHtml(message || 'The probing method index could not be loaded.')}</p>
      </div>
    </section>
  </main>`;
}

// ---- 单篇阅读页 ----

function renderBlock(block, assetBase) {
  if (block.type === 'heading') {
    return `<h2 class="article-section-heading">${renderInline(block.text)}</h2>`;
  }
  if (block.type === 'paragraph') {
    return `<p class="article-paragraph">${renderInline(block.text)}</p>`;
  }
  if (block.type === 'figure') {
    const cite = [];
    if (block.pmid) cite.push(`PMID ${escapeHtml(block.pmid)}`);
    if (block.doi) cite.push(`DOI ${escapeHtml(block.doi)}`);
    const citeLine = cite.length
      ? `<p class="article-figure-cite">${cite.join(' · ')}</p>` : '';
    const bodyParas = (block.body || [])
      .map((t) => `<p class="article-paragraph">${renderInline(t)}</p>`)
      .join('');
    const src = `${assetBase}/${block.srcBasename}`;
    return `
      <figure class="article-figure" id="${escapeHtml(block.anchor || '')}">
        <img src="${src}" alt="${escapeHtml(block.alt || block.label || '')}" loading="lazy" />
        <figcaption class="article-figure-legend">${renderFigureLegend(block.legend || '')}</figcaption>
        ${citeLine}
      </figure>
      ${bodyParas}`;
  }
  return '';
}

function isRealCaseHeading(block) {
  return block?.type === 'heading'
    && /^a real (case|example)\b/i.test(String(block.text || '').trim());
}

function withoutRealCaseSections(blocks) {
  let skipping = false;
  return blocks.filter((block) => {
    if (block.type === 'heading') {
      if (isRealCaseHeading(block)) {
        skipping = true;
        return false;
      }
      if (skipping) skipping = false;
    }
    return !skipping;
  });
}

function renderPptOverview(detail, assetBase, introHtml = '', footerHtml = '') {
  const items = Array.isArray(detail.ppt_overview) ? detail.ppt_overview : [];
  if (!items.length) return '';
  return `
    <section class="card bundle-wide-card article-ppt-overview">
      ${introHtml}
      <div class="article-ppt-grid">
        ${items.map((item) => `
          <article class="article-ppt-item">
            <h2>${renderInline(item.title || '')}</h2>
            <img src="${assetBase}/${escapeHtml(item.srcBasename || '')}" alt="${escapeHtml(item.alt || item.title || '')}" loading="lazy" />
          <p>${item.captionTitle ? `<strong>${renderScientificProse(item.captionTitle)}</strong><br />` : ''}${renderInline(item.text || '')}</p>
          </article>`).join('')}
      </div>
      ${footerHtml}
    </section>`;
}

export function renderProbingArticlePage(detail, index, headerHtml = '') {
  const assetBase = detail.asset_base || `./src/assets/generated/probing-articles/assets/${detail.slug}`;
  const enlargedFigureClass = ENLARGED_FIGURE_ARTICLE_SLUGS.has(detail.slug)
    ? ' page-probing-article--enlarged-figures'
    : '';

  // 家族归属（用于面包屑 / 上下篇导航）。
  let siblings = [];
  if (index && index.families) {
    for (const fam of index.families) {
      const found = fam.articles.find((a) => a.slug === detail.slug);
      if (found) {
        const order = Array.isArray(fam.article_order) ? new Map(fam.article_order.map((slug, position) => [slug, position])) : null;
        siblings = order
          ? fam.articles
              .filter((article) => order.has(article.slug))
              .sort((a, b) => order.get(a.slug) - order.get(b.slug))
          : fam.articles;
        break;
      }
    }
  }

  const meta = [];
  if (detail.date) meta.push(`<div><dt>Date</dt><dd>${escapeHtml(detail.date)}</dd></div>`);
  if (detail.rep_doi) {
    const doi = escapeHtml(detail.rep_doi);
    const doiHref = encodeURIComponent(detail.rep_doi);
    meta.push(`<div class="technology-detail-primary-source"><dt>Primary source:</dt><dd><a href="https://doi.org/${doiHref}" target="_blank" rel="noopener noreferrer">DOI ${doi}</a></dd></div>`);
  }

  const allBlocks = Array.isArray(detail.blocks) ? detail.blocks : [];
  const startIndex = detail.body_start_heading
    ? allBlocks.findIndex((block) => block.type === 'heading' && block.text === detail.body_start_heading)
    : -1;
  const visibleBlocks = withoutRealCaseSections(
    startIndex >= 0 ? allBlocks.slice(startIndex) : allBlocks
  );
  const body = visibleBlocks.map((b) => renderBlock(b, assetBase)).join('\n');

  // 同家族上下篇导航。
  let siblingNav = '';
  if (detail.sibling_navigation && typeof detail.sibling_navigation === 'object') {
    const configured = detail.sibling_navigation;
    siblings = [
      ...(configured.previous ? [{ slug: configured.previous.slug, title: configured.previous.title }] : []),
      { slug: detail.slug, title: detail.title },
      ...(configured.next ? [{ slug: configured.next.slug, title: configured.next.title }] : [])
    ];
  }
  if (siblings.length > 1) {
    const idx = siblings.findIndex((a) => a.slug === detail.slug);
    if (idx !== -1) {
      const prev = idx > 0 ? siblings[idx - 1] : null;
      const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;
      const siblingMode = prev && next ? '' : (next ? ' next-only' : ' prev-only');
      siblingNav = `
        <nav class="article-sibling-nav${siblingMode}" aria-label="Articles in the same family">
          ${prev ? `<a class="article-sibling-link prev" href="#probing?tech=${encodeURIComponent(prev.slug)}"><span>Previous</span><strong>${escapeHtml(shortArticleName(prev))}</strong></a>` : '<span class="article-sibling-spacer"></span>'}
          ${next ? `<a class="article-sibling-link next" href="#probing?tech=${encodeURIComponent(next.slug)}"><span>Next</span><strong>${escapeHtml(shortArticleName(next))}</strong></a>` : '<span class="article-sibling-spacer"></span>'}
        </nav>`;
    }
  }

  const keyInnovation = detail.key_innovation ? `
      <section class="article-key-innovation">
        <h2>Key innovation</h2>
        <p>${renderScientificProse(detail.key_innovation)}</p>
      </section>` : '';
  const hasPptOverview = Array.isArray(detail.ppt_overview) && detail.ppt_overview.length > 0;
  const readingBody = body ? `
      <div class="article-reading-body">
        ${body}
      </div>` : '';
  const readingSection = body ? `
    <article class="card bundle-wide-card article-reading-card">
      ${hasPptOverview ? '' : keyInnovation}
      ${readingBody}
      ${siblingNav}
    </article>` : '';
  const pptOverview = renderPptOverview(
    detail,
    assetBase,
    keyInnovation,
    body ? '' : siblingNav
  );
  const keyInnovationOnlySection = !body && !hasPptOverview && keyInnovation ? `
    <article class="card bundle-wide-card article-reading-card">
      ${keyInnovation}
      ${siblingNav}
    </article>` : '';

  return `${headerHtml}
  <main class="page-detail page-probing-article${enlargedFigureClass}">
    <section class="card bundle-wide-card technology-detail-hero">
      <a class="technology-back-link" href="#probing">← Back to probing methods overview</a>
      <div class="technology-detail-header">
        <div>
          <h1>${escapeHtml(detail.title)}</h1>
        </div>
        ${meta.length ? `<dl class="technology-detail-meta">${meta.join('')}</dl>` : ''}
      </div>
    </section>
    ${pptOverview}

    ${readingSection}
    ${keyInnovationOnlySection}
    ${body || hasPptOverview || keyInnovation ? '' : siblingNav}
  </main>`;
}
