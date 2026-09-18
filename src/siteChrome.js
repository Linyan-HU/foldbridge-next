import { emptyStatsFilters, summarizeStatsFacet, summarizeStatsRows } from './statsDashboard.js';
import { renderScientificProse } from './scientificProse.js';

// 站点骨架纯渲染片段。从 main.js 抽出以便 node --test 可 import 测试。
// 所有函数必须是纯函数：入参 → 返回 HTML 字符串，禁止访问模块级 window/route/mode。
// main.js 负责把这些片段接回并绑定 DOM 事件。

const PRIMARY_NAV_ITEMS = [
  { route: 'home', label: 'Home', activeRoutes: ['home'] },
  {
    route: 'entry',
    label: 'Entry',
    activeRoutes: [
      'entry',
      'sequence',
      'pdb-case',
      'annojoin-atlas',
      'annojoin-case',
      'annojoin-confidence'
    ]
  },
  { route: 'search', label: 'Search', activeRoutes: ['search'] },
  { route: 'probing', label: 'Probing', activeRoutes: ['probing', 'detail'] },
  { route: 'stats', label: 'Stats', activeRoutes: ['stats'] },
  { route: 'download', label: 'Download', activeRoutes: ['download'] },
  { route: 'help', label: 'Help', activeRoutes: ['help'] }
];

export function renderPrimaryNav(activeRoute = 'home') {
  const buttons = PRIMARY_NAV_ITEMS.map((item) => {
    const isActive = item.activeRoutes.includes(activeRoute);
    return `<button type="button" class="nav-btn${isActive ? ' active' : ''}" data-route="${item.route}">${item.label}</button>`;
  }).join('\n          ');
  return `<nav class="bundle-home-route-nav" aria-label="Primary navigation">
          ${buttons}
        </nav>`;
}

function dashboardMetricState(dashboardView, source, value) {
  const statusKey = source === 'entry' ? 'entryStatus' : 'probingStatus';
  const sourceLabel = source === 'entry' ? 'Entry statistics' : 'Probing methods';
  const requestedStatus = dashboardView?.[statusKey];
  const validCount = typeof value === 'number' && Number.isInteger(value) && value >= 0;
  if (requestedStatus === 'ready' && validCount) {
    return { status: 'ready', value: value.toLocaleString('en-US'), message: '' };
  }
  if (requestedStatus === 'error' || requestedStatus === 'ready') {
    return { status: 'error', value: '—', message: `${sourceLabel} unavailable` };
  }
  return { status: 'loading', value: '—', message: `${sourceLabel} loading` };
}

function dashboardStatusClass(metric) {
  return `dashboard-metric--${metric.status}`;
}

export function renderHomeHero(dashboardView) {
  const rnaChains = dashboardMetricState(dashboardView, 'entry', dashboardView?.entryMetrics?.rnaChains);
  const pdbStructures = dashboardMetricState(dashboardView, 'entry', dashboardView?.entryMetrics?.pdbStructures);
  const probingMethods = dashboardMetricState(dashboardView, 'probing', dashboardView?.probingOverview?.methodCount);
  return `<section class="bundle-hero-card bundle-wide-card">
        <div class="bundle-hero-copy">
          <p class="bundle-kicker">RNA structure-linked database</p>
          <h2>FoldBridge</h2>
          <p class="bundle-hero-summary">
            A curated database that links RNA chemical probing data with experimentally resolved tertiary structures.
          </p>
          <div class="bundle-hero-actions">
            <button type="button" class="bundle-hero-primary" data-route="entry">Browse Entry table &rarr;</button>
            <button type="button" class="ghost" data-route="probing">Explore probing methods</button>
          </div>
        </div>

        <aside class="bundle-hero-metrics">
          <article class="bundle-metric-card bundle-metric-large ${dashboardStatusClass(rnaChains)}">
            <p>RNA chains</p>
            <strong>${rnaChains.value}</strong>
            <span>${rnaChains.message || 'Canonical chain records'}</span>
          </article>
          <article class="bundle-metric-card ${dashboardStatusClass(pdbStructures)}">
            <p>PDB structures</p>
            <strong>${pdbStructures.value}</strong>
            <span>${pdbStructures.message || 'Distinct deposited structures'}</span>
          </article>
          <article class="bundle-metric-card ${dashboardStatusClass(probingMethods)}">
            <p>Probing methods</p>
            <strong>${probingMethods.value}</strong>
            <span>${probingMethods.message || 'Curated method guides'}</span>
          </article>
        </aside>
      </section>`;
}

export function renderHomeModuleCards(dashboardView) {
  const pdbStructures = dashboardMetricState(dashboardView, 'entry', dashboardView?.entryMetrics?.pdbStructures);
  const probingMethods = dashboardMetricState(dashboardView, 'probing', dashboardView?.probingOverview?.methodCount);
  const probingFamilies = dashboardMetricState(dashboardView, 'probing', dashboardView?.probingOverview?.familyCount);
  const probingModuleStatus = probingMethods.status === 'ready' && probingFamilies.status === 'ready'
    ? 'ready'
    : (probingMethods.status === 'error' || probingFamilies.status === 'error' ? 'error' : 'loading');
  const cards = [
    {
      route: 'entry',
      title: 'Entry table',
      summary: pdbStructures.status === 'ready'
        ? `${pdbStructures.value} structure-linked PDB entries with search, grouping and export.`
        : `${pdbStructures.message}.`,
      status: pdbStructures.status,
      action: 'Open Entry table'
    },
    {
      route: 'probing',
      title: 'Probing methods',
      summary: probingMethods.status === 'ready' && probingFamilies.status === 'ready'
        ? `${probingMethods.value} probing methods across ${probingFamilies.value} mechanism families.`
        : `Probing methods ${probingModuleStatus === 'loading' ? 'loading' : 'unavailable'}.`,
      status: probingModuleStatus,
      action: 'Explore probing methods'
    },
    {
      route: 'search',
      title: 'Search',
      summary: 'Search probing articles and PDB cases across the whole site.',
      status: 'ready',
      action: 'Open search'
    }
  ];
  const items = cards.map((card) => `
    <article class="bundle-site-card dashboard-metric--${card.status}">
      <div class="bundle-site-copy">
        <h3>${card.title}</h3>
        <p>${card.summary}</p>
      </div>
      <div class="bundle-site-footer">
        <button type="button" class="bundle-site-link" data-route="${card.route}">${card.action}</button>
      </div>
    </article>`).join('');
  return `<section class="bundle-site-grid" aria-label="Core modules">${items}
  </section>`;
}

const PROBING_ASSET_BASE = './src/assets/generated/probing-articles/assets';

// 主页探针文章轮播：纯函数，入参 articles → 静态 HTML。
// 无 DOM、无定时器、无 window；翻页/自动轮换的行为层在 main.js。
// 每张 slide = 代表图 + 家族徽标 + 标题，整张是跳详情页的链接。
export function renderHomeProbingCarousel(articles = []) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return `<section class="home-probing-carousel home-probing-carousel-empty" aria-label="Probing method articles">
      <p class="home-probing-empty-note">Probing articles are loading…</p>
    </section>`;
  }

  const slides = articles.map((a, i) => {
    const activeClass = i === 0 ? ' active' : '';
    const img = a.rep_figure
      ? `<img class="home-probing-slide-img" src="${PROBING_ASSET_BASE}/${a.slug}/${a.rep_figure}" alt="${a.title || ''}" loading="lazy" />`
      : `<div class="home-probing-slide-img home-probing-slide-noimg" aria-hidden="true"></div>`;
    // 注意属性顺序：data-carousel-slide 在 class 之前，以匹配 active-slide 测试正则
    // （/data-carousel-slide="0"[^>]*class="[^"]*active/，[^>]* 不跨越 '>'）。
    return `<a data-carousel-slide="${i}" class="home-probing-slide${activeClass}" href="#probing?tech=${encodeURIComponent(a.slug)}">
        ${img}
        <div class="home-probing-slide-copy">
          <span class="home-probing-slide-family">${a.family_title || ''}</span>
          <h3 class="home-probing-slide-title">${a.title || ''}</h3>
        </div>
      </a>`;
  }).join('\n      ');

  const dots = articles.map((_a, i) =>
    // 同上：data-carousel-dot 在 class 之前，匹配 active-dot 测试正则。
    `<button type="button" data-carousel-dot="${i}" class="home-probing-dot${i === 0 ? ' active' : ''}" aria-label="Go to slide ${i + 1}"></button>`
  ).join('\n        ');

  return `<section class="home-probing-carousel" aria-label="Probing method articles" aria-roledescription="carousel">
      <div class="home-probing-track" data-carousel-track>
        ${slides}
      </div>
      <button type="button" class="home-probing-nav home-probing-prev" data-carousel-prev aria-label="Previous article"><img src="./src/assets/home-pagination-arrow.svg" alt="" aria-hidden="true" /></button>
      <button type="button" class="home-probing-nav home-probing-next" data-carousel-next aria-label="Next article"><img src="./src/assets/home-pagination-arrow.svg" alt="" aria-hidden="true" /></button>
      <div class="home-probing-dots">
        ${dots}
      </div>
    </section>`;
}

// 反应性色标（单一权威）：0 冷绿 #174B3A → .5 金 #E6C260 → 1 暖橙 #E8743E。
// 1D 实时着色与 2D/3D 离线快照共用同一组锚点（见 home-scroll-story/README.md）。
const HSS_COLOR_STOPS = [[23, 75, 58], [230, 194, 96], [232, 116, 62]];
// 无反应性数据的残基中性灰（spec §3：禁色标外推，与 2D/3D 渲染器一致）。
const HSS_NEUTRAL = '#E9EDEA';

export function reactivityColor(norm) {
  const t = Math.max(0, Math.min(1, Number(norm) || 0));
  const [a, b, c] = HSS_COLOR_STOPS;
  let lo, hi, f;
  if (t < 0.5) { lo = a; hi = b; f = t / 0.5; }
  else { lo = b; hi = c; f = (t - 0.5) / 0.5; }
  const mix = lo.map((v, i) => Math.round(v + (hi[i] - v) * f));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

// 单格着色：每残基一个格。无反应性数据 → 中性灰（数据诚实，spec §3）。
// null/undefined/非有限 视为缺失；Number(null)===0 是有限值，须显式判 null。
function alignmentCellHtml(base, datum, ceiling) {
  const raw = Number(datum);
  if (datum == null || !Number.isFinite(raw)) {
    return `<span class="hss-cell hss-cell-nodata" style="background:${HSS_NEUTRAL}">${base}</span>`;
  }
  const norm = Math.min(1, raw / ceiling);
  return `<span class="hss-cell" style="background:${reactivityColor(norm)}">${base}</span>`;
}

// 单根信号柱：柱高 = 归一化反应性，颜色同色标。无数据 → 中性灰矮桩（数据诚实，spec §3）。
const HSS_BAR_TRACK_PX = 40;
function alignmentBarHtml(datum, ceiling) {
  const raw = Number(datum);
  if (datum == null || !Number.isFinite(raw)) {
    return `<div class="hss-bar hss-bar-nodata" style="height:3px;background:${HSS_NEUTRAL}"></div>`;
  }
  const norm = Math.min(1, raw / ceiling);
  const h = Math.max(3, Math.round(norm * HSS_BAR_TRACK_PX));
  return `<div class="hss-bar" style="height:${h}px;background:${reactivityColor(norm)}"></div>`;
}

// 1D alignment 态：每个残基一列（信号柱 / 连接竖线 / PDB 链格 垂直堆叠）。
// 顶行是 per-base 反应性柱状图（量级），底行是结构链着色格；连线锁定在同一残基
// 柱与格之间——换行时整列一起换，对齐永不错位。柱与格共用同一色标。
// 无 DOM / 无 window。色标与缺数据中性灰保持单一权威。
export function renderReactivityAlignment(caseData = {}) {
  const seq = Array.isArray(caseData.sequence) ? caseData.sequence : [];
  const react = Array.isArray(caseData.reactivity) ? caseData.reactivity : [];
  const ceiling = Number(caseData.norm_ceiling) || 1;
  const pdbId = caseData.pdb_id || '';
  const chain = caseData.chain || '';
  const pdbLabel = `PDB ${pdbId} · chain ${chain}`.replace(/\s+$/,'').replace(/·\s*chain\s*$/,'· chain');
  const columns = seq.map((base, i) => {
    const bar = alignmentBarHtml(react[i], ceiling);
    const cell = alignmentCellHtml(base, react[i], ceiling);
    return `<div class="hss-aln-col"><div class="hss-bar-track">${bar}</div><span class="hss-match-tick">|</span>${cell}</div>`;
  }).join('');
  return `<div class="hss-alignment" role="img" aria-label="Per-base probing reactivity (bars) aligned to the PDB chain residues">
    <div class="hss-aln-key">
      <span class="hss-aln-label">Probing signal (reactivity)</span>
      <span class="hss-aln-label hss-aln-label-pdb">${pdbLabel}</span>
    </div>
    <div class="hss-aln-columns">${columns}</div>
  </div>`;
}

// 确定性按访问次序选主角案例。空/非数组 → null；visitIndex 非有限数 → 0。
export function pickFeaturedCase(cases, visitIndex) {
  if (!Array.isArray(cases) || cases.length === 0) return null;
  const idx = Number.isFinite(Number(visitIndex)) ? Math.abs(Math.trunc(Number(visitIndex))) : 0;
  return cases[idx % cases.length];
}

// 招牌滚动叙事区。左侧三态层 + 右侧三场景 + 图例。无 DOM/无 window/无定时器。
// 资产基址由调用方注入（与 probing 轮播一致），渲染层只拼 src。
export function renderHomeScrollStory(caseData, opts = {}) {
  const base = String(opts.assetBase || '.').replace(/\/$/, '');
  if (!caseData || !Array.isArray(caseData.scenes) || caseData.scenes.length === 0) {
    return `<section class="home-scroll-story hss-placeholder" aria-hidden="true"></section>`;
  }
  const meta = `${caseData.molecule_label || ''} · PDB ${caseData.pdb_id || ''} · ${caseData.confidence_label || ''}`;
  const layer0 = `<div class="hss-layer is-active" data-stage="0"><div class="hss-tag">1 · Alignment</div>${renderReactivityAlignment(caseData)}</div>`;
  const layer1 = caseData.svg_2d
    ? `<div class="hss-layer" data-stage="1"><div class="hss-tag">2 · Secondary structure</div><img class="hss-snapshot" src="${base}/${caseData.svg_2d}" alt="${caseData.pdb_id || ''} secondary structure, reactivity-colored" loading="lazy"></div>`
    : `<div class="hss-layer" data-stage="1"><div class="hss-tag">2 · Secondary structure</div><div class="hss-missing">2D snapshot unavailable</div></div>`;
  const layer2 = caseData.png_3d
    ? `<div class="hss-layer" data-stage="2"><div class="hss-tag">3 · Tertiary structure</div><img class="hss-snapshot" src="${base}/${caseData.png_3d}" alt="${caseData.pdb_id || ''} tertiary structure, reactivity-colored" loading="lazy"></div>`
    : `<div class="hss-layer" data-stage="2"><div class="hss-tag">3 · Tertiary structure</div><div class="hss-missing">3D snapshot unavailable</div></div>`;
  const scenes = caseData.scenes.map((s, i) => {
    const chip = s.chip ? `\n      <span class="hss-chip">${s.chip}</span>` : '';
    return `
    <div class="hss-scene${i === 0 ? ' is-active' : ''}" data-scene="${i}">
      <div class="hss-scene-num">${s.n || ''}</div>
      <h3 class="hss-scene-title">${s.title || ''}</h3>
      <p class="hss-scene-body">${s.body || ''}</p>${chip}
    </div>`;
  }).join('');
  const legend = `<div class="hss-legend"><span>low</span><span class="hss-legend-bar"></span><span>high reactivity</span></div>`;
  const records = dashboardMetricState(opts.dashboardView, 'entry', opts.dashboardView?.entryMetrics?.pdbStructures);
  const intro = `<header class="hss-intro">
      <h1 class="hss-headline">Follow one RNA from probing signal to 3D fold</h1>
      <p class="hss-lede">The same reactivity colors travel with every nucleotide — from the raw alignment, into the secondary structure, and onto the deposited tertiary structure. Scroll to watch it transform.</p>
      <p class="hss-scrollcue">↓ Scroll</p>
    </header>`;
  const closing = `<footer class="hss-closing ${dashboardStatusClass(records)}">
      <h2>Every record in FoldBridge tells this story</h2>
      <p>${records.status === 'ready' ? `${records.value} structure-linked records, each with calibrated confidence.` : `${records.message}.`}</p>
    </footer>`;
  return `<section class="home-scroll-story" aria-label="From probing signal to 3D fold">
    ${intro}
    <div class="hss-grid">
      <div class="hss-sticky"><div class="hss-card"><div class="hss-meta">${meta}</div>${layer0}${layer1}${layer2}${legend}</div></div>
      <div class="hss-scenes">${scenes}</div>
    </div>
    ${closing}
    ${opts.carouselHtml || ''}
  </section>`;
}

// === ABOUT PAGE (W-A 在此追加 renderAboutPage) ===

// About / 方法学页纯渲染。入参 content（about-content.json 解析对象）→ HTML 字符串。
// content 为空（未加载 / 加载失败）时降级为最小壳，含 <h1>About</h1>，绝不产出 undefined。
// 所有字段缺失用空串兜底；about-content.json 是入 git 的静态可信数据，无需 escape。
const aboutText = (v) => (v == null ? '' : String(v));

function renderAboutCards(section) {
  const items = (section.items || []).map((item) => `
        <article class="card about-source-card">
          <h3>${aboutText(item.name)}</h3>
          <p>${aboutText(item.body)}</p>
        </article>`).join('');
  return `<div class="about-card-grid">${items}
      </div>`;
}

function renderAboutPipeline(section) {
  const steps = Array.isArray(section.steps) ? section.steps : [];
  const nodeW = 150;
  const gap = 44;
  const h = 64;
  const stepW = nodeW + gap;
  const width = steps.length > 0 ? steps.length * stepW - gap : nodeW;
  const cy = h / 2;
  const parts = steps.map((step, i) => {
    const x = i * stepW;
    const rect = `<rect class="about-pipe-node" x="${x}" y="8" rx="12" ry="12" width="${nodeW}" height="${h - 16}"></rect>`;
    const label = `<text class="about-pipe-label" x="${x + nodeW / 2}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${aboutText(step)}</text>`;
    const arrow = i < steps.length - 1
      ? `<line class="about-pipe-arrow" x1="${x + nodeW}" y1="${cy}" x2="${x + nodeW + gap}" y2="${cy}" marker-end="url(#about-arrow)"></line>`
      : '';
    return `${rect}${label}${arrow}`;
  }).join('');
  return `<div class="about-pipeline-figure">
        <svg viewBox="0 0 ${width} ${h}" role="img" aria-label="ANNOJOIN pipeline" class="about-pipeline-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="about-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z"></path>
            </marker>
          </defs>
          ${parts}
        </svg>
        ${section.body ? `<p class="about-pipeline-note">${aboutText(section.body)}</p>` : ''}
      </div>`;
}

function renderAboutProse(section) {
  return `<p class="about-prose">${aboutText(section.body)}</p>`;
}

function renderHelpContact(section) {
  const email = aboutText(section.email);
  if (!email) return renderAboutProse(section);
  return `<p class="about-prose">${aboutText(section.body)} <a class="help-contact-link" href="mailto:${email}">${email}</a>.</p>`;
}

function renderAboutTable(section) {
  const rows = (section.items || []).map((item) => `
        <dt>${aboutText(item.term)}</dt>
        <dd>${aboutText(item.body)}</dd>`).join('');
  return `<dl class="about-terms">${rows}
      </dl>`;
}

function renderAboutSection(section) {
  let inner = '';
  switch (section.kind) {
    case 'cards': inner = renderAboutCards(section); break;
    case 'pipeline': inner = renderAboutPipeline(section); break;
    case 'table': inner = renderAboutTable(section); break;
    case 'prose':
    default: inner = renderAboutProse(section); break;
  }
  const id = section.id ? ` id="about-${aboutText(section.id)}"` : '';
  return `<section class="card bundle-wide-card about-section"${id}>
      <h2>${aboutText(section.title)}</h2>
      ${inner}
    </section>`;
}

export function renderAboutPage(content) {
  if (!content || typeof content !== 'object') {
    return `<section class="card bundle-wide-card about-section">
      <h1>About</h1>
      <p>About content is unavailable right now.</p>
    </section>`;
  }
  const hero = content.hero || {};
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const heroHtml = `<section class="about-hero">
      ${hero.kicker ? `<p class="about-hero-kicker">${aboutText(hero.kicker)}</p>` : ''}
      <h1>${aboutText(hero.title) || 'About'}</h1>
      ${hero.summary ? `<p class="about-hero-summary">${aboutText(hero.summary)}</p>` : ''}
      ${hero.detail ? `<p class="about-hero-detail">${aboutText(hero.detail)}</p>` : ''}
    </section>`;
  const sectionsHtml = sections.map(renderAboutSection).join('\n    ');
  return `${heroHtml}
    ${sectionsHtml}`;
}

// Help / 使用指南页纯渲染。与 About 复用同一套 section 渲染器（cards/pipeline/
// table/prose），入参 content（help-content.json 解析对象）→ HTML 字符串。
// content 为空（未加载 / 加载失败）时降级为最小壳，含 <h1>Help</h1>，绝不产出
// undefined。help-content.json 是入 git 的静态可信数据，无需 escape。
function renderHelpMemberDetail(detail) {
  if (typeof detail === 'string') return aboutText(detail);
  if (!detail || typeof detail !== 'object') return '';
  const prefix = detail.prefix ? `${aboutText(detail.prefix)} · ` : '';
  const organization = aboutText(detail.organization);
  if (!organization) return prefix;
  if (!detail.url) return `${prefix}${organization}`;
  return `${prefix}<a class="help-member-link" href="${aboutText(detail.url)}" target="_blank" rel="noopener noreferrer">${organization}</a>`;
}

function renderHelpMemberRole(role) {
  if (typeof role === 'string') return aboutText(role);
  if (!role || typeof role !== 'object') return '';
  const prefix = role.prefix ? `${aboutText(role.prefix)} ` : '';
  const organization = aboutText(role.organization);
  if (!organization) return prefix;
  if (!role.url) return `${prefix}<span class="help-member-label">${organization}</span>`;
  return `${prefix}<a class="help-member-link" href="${aboutText(role.url)}" target="_blank" rel="noopener noreferrer">${organization}</a>`;
}

function renderHelpGuide(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `<div class="help-guide-steps">
    ${items.map((item, index) => `<article class="help-guide-step">
      <div class="help-guide-step-number">${index + 1})</div>
      <div>
        <h3>${aboutText(item.term || item.title).replace(/^\d+\)\s*/, '')}</h3>
        <p>${aboutText(item.body)}</p>
        ${item.route ? `<a class="help-guide-link" href="${aboutText(item.route)}">${aboutText(item.linkLabel || 'Open this page')} →</a>` : ''}
      </div>
    </article>`).join('')}
  </div>`;
}

function renderHelpSourceList(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `<div class="help-source-list">
    ${items.map((item) => `<article class="help-source-row">
      <p><span class="help-source-name">${aboutText(item.name)}</span><span aria-hidden="true"> — </span>${aboutText(item.body)}</p>
    </article>`).join('')}
  </div>`;
}

function renderHelpVisuals(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `<div class="help-visual-grid">
    ${items.map((item, index) => `<article class="help-visual-card">
      <div class="help-visual-card-heading">
        <span>${index + 1}</span>
        <h3>${aboutText(item.term || item.title)}</h3>
      </div>
      ${item.image ? `<figure><img src="${aboutText(item.image)}" alt="${aboutText(item.alt || item.term || item.title)}" loading="lazy"></figure>` : ''}
      <p>${aboutText(item.body)}</p>
    </article>`).join('')}
  </div>`;
}

function renderHelpUsage(section) {
  const items = Array.isArray(section.items) ? section.items : [];
  return `<div class="help-usage-flow">
    ${items.map((item, index) => `<article class="help-usage-step">
      <div class="help-usage-copy">
        <span class="help-usage-step-number">${index + 1}</span>
        <div>
          <h3>${aboutText(item.title || item.term || `Step ${index + 1}`)}</h3>
          ${item.body ? `<p>${aboutText(item.body)}</p>` : ''}
        </div>
      </div>
      ${item.image ? `<figure class="help-usage-screenshot"><img src="${aboutText(item.image)}" alt="${aboutText(item.alt || item.title || `Usage step ${index + 1}`)}" loading="lazy"></figure>` : ''}
    </article>`).join('')}
  </div>`;
}

function renderHelpFeedback(section) {
  const route = section.route ? aboutText(section.route) : '#help-contact';
  const label = aboutText(section.linkLabel || 'Submit feedback');
  const externalAttributes = /^https?:\/\//.test(route) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<div class="help-feedback">
      <p>${aboutText(section.body)}</p>
      <a class="help-feedback-button" href="${route}"${externalAttributes}>${label}</a>
    </div>`;
}

function renderHelpSection(section) {
  let inner = '';
  switch (section.kind) {
    case 'guide': inner = renderHelpGuide(section); break;
    case 'visuals': inner = renderHelpVisuals(section); break;
    case 'usage': inner = renderHelpUsage(section); break;
    case 'feedback': inner = renderHelpFeedback(section); break;
    case 'cards': inner = section.id === 'data-sources' ? renderHelpSourceList(section) : renderAboutCards(section); break;
    case 'pipeline': inner = renderAboutPipeline(section); break;
    case 'table': inner = renderAboutTable(section); break;
    case 'prose':
    default: inner = section.id === 'contact' ? renderHelpContact(section) : renderAboutProse(section); break;
  }
  const id = section.id ? ` id="help-${aboutText(section.id)}"` : '';
  const className = section.kind === 'usage'
    ? 'help-guide-section help-guide-section--workflow'
    : 'help-guide-section';
  return `<section class="${className}"${id}>
      <header class="help-guide-section-header"><h2>${aboutText(section.title)}</h2></header>
      <div class="help-guide-section-body">${inner}</div>
    </section>`;
}

export function renderHelpPage(content) {
  if (!content || typeof content !== 'object') {
    return `<section class="card bundle-wide-card about-section">
      <h1>Help</h1>
      <p>Help content is unavailable right now.</p>
    </section>`;
  }
  const hero = content.hero || {};
  const sections = Array.isArray(content.sections) ? content.sections : [];
  const contactSection = sections.find((section) => section?.id === 'contact');
  const nonContactSections = sections.filter((section) => section?.id !== 'contact');
  const heroHtml = `<section class="help-guide-hero">
      ${hero.kicker ? `<p class="about-hero-kicker">${aboutText(hero.kicker)}</p>` : ''}
      <h1>${aboutText(hero.title) || 'Help'}</h1>
      ${hero.summary ? `<p class="about-hero-summary">${aboutText(hero.summary)}</p>` : ''}
      ${hero.detail ? `<p class="about-hero-detail">${aboutText(hero.detail)}</p>` : ''}
    </section>`;
  const sectionsHtml = nonContactSections.map(renderHelpSection).join('\n    ');
  const contactHtml = contactSection ? renderHelpSection(contactSection) : '';
  const members = Array.isArray(content.group_members) ? content.group_members : [];
  const membersHtml = members.length > 0 ? `<section class="help-guide-section help-group-members" aria-labelledby="help-group-members-title">
      <div class="help-group-members-heading">
        <h2 id="help-group-members-title">Group Members</h2>
      </div>
      <div class="help-group-members-grid">
        ${members.map((member) => {
          const details = Array.isArray(member.details) ? member.details : [];
          return `<article class="help-member-card">
            <div class="help-member-portrait">
              ${member.photo
                ? `<img src="${aboutText(member.photo)}" alt="${aboutText(member.name)}" loading="lazy">`
                : aboutText(member.initials)}
            </div>
            <div class="help-member-copy">
              <h3>${aboutText(member.name)}</h3>
              ${member.role ? `<p class="help-member-role">${renderHelpMemberRole(member.role)}</p>` : ''}
              <div class="help-member-details">${details.map((detail) => `<p>${renderHelpMemberDetail(detail)}</p>`).join('')}</div>
            </div>
            </article>`;
        }).join('')}
      </div>
    </section>` : '';
  return `<div class="help-page-shell">
    ${heroHtml}
    ${sectionsHtml}
    ${contactHtml}
    ${membersHtml}
  </div>`;
}

// === STATS PAGE ===

function statsNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US') : '—';
}

function statsText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statsMetricCard(metric, label) {
  return `<span class="stats-metric ${dashboardStatusClass(metric)}">
      <span class="stats-metric-value">${metric.value}</span>
      <span class="stats-metric-label">${label}</span>
      ${metric.message ? `<span class="stats-metric-status">${statsText(metric.message)}</span>` : ''}
    </span>`;
}

const STATS_VALUE_LABELS = {
  rRNA: 'rRNA',
  tRNA: 'tRNA',
  other_RNA: 'Other RNA',
  mRNA: 'mRNA',
  ribozyme: 'Ribozyme',
  riboswitch: 'Riboswitch',
  snRNA: 'snRNA',
  viral: 'Viral RNA',
  aptamer: 'Aptamer',
  synthetic_RNA: 'Synthetic RNA',
  SRP_RNA: 'SRP RNA',
  designed_RNA: 'Designed RNA',
  'Unclassified RNA': 'Unclassified RNA',
  high: 'High confidence',
  low: 'Low confidence',
  not_supported: 'Not supported',
  rmdb: 'RMDB',
  geo: 'GEO',
  rasp: 'RASP'
};

const STATS_DIMENSION_LABELS = {
  rna_class: 'RNA class',
  source: 'Source'
};

function statsValueLabel(value) {
  return STATS_VALUE_LABELS[value] || String(value).replaceAll('_', ' ');
}

function renderStatsBarPanel({ dimension, title, lede, facet, filters }) {
  const totalChains = Number(facet?.total_chains);
  const finiteTotal = Number.isFinite(totalChains) && totalChains > 0 ? totalChains : 0;
  const entries = Object.entries(facet?.distribution || {}).filter(([, count]) => Number(count) > 0);
  const rows = entries.map(([value, rawCount]) => {
    const count = Number(rawCount);
    const width = finiteTotal ? (count / finiteTotal) * 100 : 0;
    const pct = finiteTotal ? ((count / finiteTotal) * 100).toFixed(1) : '0.0';
    const selected = filters[dimension] === value;
    return `<button type="button" class="stats-chart-row${selected ? ' is-selected' : ''}"
        data-stats-filter-dimension="${dimension}" data-stats-filter-value="${statsText(value)}" aria-pressed="${selected}">
        <span class="stats-chart-row-copy"><span class="stats-chart-label">${statsText(statsValueLabel(value))}</span><span class="stats-chart-value">${statsNumber(count)} <small>${pct}%</small></span></span>
        <span class="stats-chart-track" aria-hidden="true"><span class="stats-chart-fill" style="--stats-bar-width:${width.toFixed(2)}%"></span></span>
      </button>`;
  }).join('\n      ');
  const body = finiteTotal && rows
    ? rows
    : '<p class="stats-empty">No chains match this filter context.</p>';
  return `<section class="stats-chart-panel stats-chart-panel--wide" data-stats-panel="${dimension}">
      <header><h2>${title}</h2><p>${lede}</p></header>
      <div class="stats-chart-list">${body}</div>
    </section>`;
}

function renderStatsFilterChips(filters) {
  const chips = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([dimension, value]) => `<button type="button" class="stats-filter-chip" data-stats-filter-chip="${dimension}"
        data-stats-filter-dimension="${dimension}" data-stats-filter-value="${statsText(value)}"
        aria-label="Remove ${statsText(STATS_DIMENSION_LABELS[dimension])} filter ${statsText(statsValueLabel(value))}">
        <span>${statsText(STATS_DIMENSION_LABELS[dimension])}: ${statsText(statsValueLabel(value))}</span><span aria-hidden="true">×</span>
      </button>`)
    .join('');
  return chips || '<span class="stats-filter-none">All published chains</span>';
}

export function renderStatsPage(state = {}) {
  const dashboardView = state.dashboardView || {};
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const filters = state.filters || emptyStatsFilters();
  const rnaChains = dashboardMetricState(dashboardView, 'entry', dashboardView.entryMetrics?.rnaChains);
  const pdbStructures = dashboardMetricState(dashboardView, 'entry', dashboardView.entryMetrics?.pdbStructures);
  const chainsWithProfiles = dashboardMetricState(dashboardView, 'entry', dashboardView.entryMetrics?.chainsWithProbingProfiles);
  const probingMethods = dashboardMetricState(dashboardView, 'probing', dashboardView.probingOverview?.methodCount);
  const entryMetricStates = [rnaChains, pdbStructures, chainsWithProfiles];
  const entryReady = entryMetricStates.every((metric) => metric.status === 'ready');
  const entryLoading = !entryReady && entryMetricStates.some((metric) => metric.status === 'loading');
  const summary = entryReady ? summarizeStatsRows(rows, filters) : null;
  const hasFilters = Object.values(filters).some(Boolean);
  const rnaClassFacet = entryReady ? summarizeStatsFacet(rows, filters, 'rna_class') : null;
  const sourceFacet = entryReady ? summarizeStatsFacet(rows, filters, 'source') : null;
  const busy = entryLoading || probingMethods.status === 'loading';
  const pdbTotalAttribute = entryReady ? ` data-pdb-total="${dashboardView.entryMetrics.pdbStructures}"` : '';
  const toolbar = entryReady
    ? `<div class="stats-dashboard-toolbar">
        <p class="stats-match-summary" aria-live="polite">Showing <strong>${statsNumber(summary.chain_count)}</strong> of ${rnaChains.value} RNA chains across <strong>${statsNumber(summary.pdb_count)}</strong> of ${pdbStructures.value} PDB structures.</p>
        <div class="stats-filter-actions"><div class="stats-filter-chips">${renderStatsFilterChips(filters)}</div>
          <button type="button" class="stats-reset" data-stats-reset${hasFilters ? '' : ' disabled'}>Reset filters</button>
          <a href="#entry" class="stats-entry-link" data-route="entry">Open Entry table</a>
        </div>
      </div>`
    : '';
  const charts = entryReady
    ? `<div class="stats-chart-grid">
        ${renderStatsBarPanel({ dimension: 'rna_class', title: 'RNA class distribution', lede: 'Select a class to narrow the catalogue summary.', facet: rnaClassFacet, filters })}
        ${renderStatsBarPanel({ dimension: 'source', title: 'Evidence source coverage', lede: 'Source categories overlap; one chain can appear in more than one source.', facet: sourceFacet, filters })}
      </div>`
    : `<div class="stats-charts-status stats-charts-status--${entryLoading ? 'loading' : 'error'}"${entryLoading ? ' aria-busy="true"' : ' role="alert"'}>
        <h2>${entryLoading ? 'Entry statistics loading' : 'Entry statistics unavailable'}</h2>
        <p>${entryLoading
          ? 'Loading RNA class and evidence source distributions…'
          : statsText(dashboardView.entryError || 'The published Entry statistics could not be validated.')}</p>
      </div>`;

  return `<section class="card bundle-wide-card stats-page"${pdbTotalAttribute}${busy ? ' aria-busy="true"' : ''}>
      <header class="stats-head">
        <div><h1>Statistics</h1></div>
        <p>Explore the current FoldBridge catalogue by RNA class and evidence source.</p>
      </header>

      <div class="stats-metric-grid">
        ${statsMetricCard(rnaChains, 'RNA chains')}
        ${statsMetricCard(pdbStructures, 'PDB structures')}
        ${statsMetricCard(chainsWithProfiles, 'Chains with probing profiles')}
        ${statsMetricCard(probingMethods, 'Probing methods')}
      </div>

      ${toolbar}
      ${charts}
    </section>`;
}

// === PROBING HUB (W-C 在此追加 renderProbingFamilyIndex/TechTable/Glossary) ===

function escapeProbingHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// 机制家族索引：每张卡片链回 #probing 总览的对应家族锚点，并展开对应的方法组。
export function renderProbingFamilyIndex(families, { embedded = false } = {}) {
  const list = Array.isArray(families) ? families : [];
  if (!list.length) {
    const emptyTag = embedded ? 'div' : 'section';
    return `<${emptyTag} class="${embedded ? 'probing-family-index probing-family-index--embedded' : 'card bundle-wide-card probing-family-index'} probing-family-index--empty">
      <p class="probing-hub-empty">Mechanism families are not available yet.</p>
    </${emptyTag}>`;
  }
  const visibleFamilies = list.filter((fam) => fam.id !== 'inference');
  const cards = visibleFamilies.map((fam) => {
    const id = escapeProbingHtml(fam.id);
    const isDmsFamily = fam.id === 'dms';
    const isShapeFamily = fam.id === 'shape';
    const isCleavageFamily = fam.id === 'in-cell-shape';
    const isNucleotideFamily = fam.id === 'footprinting';
    const isInteractionFamily = fam.id === 'carbodiimide-special';
    const title = isDmsFamily
      ? 'DMS-based methods'
      : (isShapeFamily
        ? 'SHAPE-based methods'
        : (isCleavageFamily
          ? 'Cleavage-based methods'
          : (isNucleotideFamily
            ? 'Nucleotide-specific chemical probing methods'
            : (isInteractionFamily ? 'RNA–RNA interaction mapping methods' : fam.title))));
    const summary = isInteractionFamily
      ? 'Crosslinking and proximity ligation capture RNA–RNA contacts and higher-order RNA organization.'
      : fam.summary;
    const methods = Array.isArray(fam.methods) ? fam.methods : [];
    const featuredMethods = methods.slice(0, 3)
      .map((method) => `<span>${escapeProbingHtml(method.title)}</span>`)
      .join('');
    return `<a class="probing-family-card" href="#probing-family-${id}" data-probing-family-link="${id}">
        <div class="probing-family-card-topline">
          <span class="probing-family-card-count">${methods.length} methods</span>
          <span class="probing-family-card-arrow" aria-hidden="true">→</span>
        </div>
        <h3 class="probing-family-card-title">${escapeProbingHtml(title)}</h3>
        <p class="probing-family-card-summary">${renderScientificProse(summary)}</p>
        <div class="probing-family-method-list">${featuredMethods}</div>
        <span class="probing-family-card-action">Explore methods <span aria-hidden="true">→</span></span>
      </a>`;
  }).join('');
  const tag = embedded ? 'div' : 'section';
  const className = embedded
    ? 'probing-family-index probing-family-index--embedded'
    : 'card bundle-wide-card probing-family-index';
  return `<${tag} class="${className}" aria-label="Probing mechanism families">
      <div class="probing-hub-heading">
        <h2>Browse by mechanism</h2>
        <p>Select a family to view its methods.</p>
      </div>
      <div class="probing-family-grid">${cards}</div>
    </${tag}>`;
}

// 34 行技术对照表：可按列排序（data-sort），无 JS 时仍可读（默认 registry 顺序）。
const PROBING_FAMILY_MEANING = {
  A: 'WC-face base-specific',
  B: 'SHAPE flexibility-proxy',
  C: 'enzymatic (REVERSED)',
  D: 'SASA dual-ref',
  E: 'contact-map',
  F: 'pair-set F1'
};

export function renderProbingTechTable(registry) {
  const rows = (registry && Array.isArray(registry.technologies)) ? registry.technologies : [];
  if (!rows.length) {
    return `<section class="card bundle-wide-card probing-tech-table probing-tech-table--empty">
      <p class="probing-hub-empty">The probe technology registry is not available yet.</p>
    </section>`;
  }
  const body = rows.map((row) => {
    const tech = escapeProbingHtml(row.technology);
    const fam = escapeProbingHtml(row.family);
    const famMeaning = escapeProbingHtml(PROBING_FAMILY_MEANING[row.family] || '');
    const bases = escapeProbingHtml(row.targetable_bases);
    const techCell = row.article_slug
      ? `<a class="probing-tech-article-link" href="#probing?tech=${encodeURIComponent(row.article_slug)}">${tech}</a>`
      : `<span class="probing-tech-name">${tech}</span>`;
    return `<tr data-tech-row>
        <td data-col="technology">${techCell}</td>
        <td data-col="family"><span class="probing-family-tag" title="${famMeaning}">${fam}</span> <span class="probing-family-meaning">${famMeaning}</span></td>
        <td data-col="bases">${bases}</td>
      </tr>`;
  }).join('');
  return `<section class="card bundle-wide-card probing-tech-table" aria-label="Probe technology comparison">
      <div class="probing-hub-heading">
        <p class="technology-kicker">technology registry</p>
        <h2>34 RNA probing technologies at a glance</h2>
        <p class="probing-tech-caption">In this table, <strong>family</strong> labels the physical quantity each method measures (A–F) — it is <strong>not a quality ranking</strong>. Technologies with an in-depth explainer are linked by name.</p>
      </div>
      <div class="probing-tech-table-scroll">
        <table class="probing-tech-grid">
          <thead>
            <tr>
              <th scope="col" data-sort="technology">Technology</th>
              <th scope="col" data-sort="family">Family</th>
              <th scope="col" data-sort="bases">Targetable bases</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}
