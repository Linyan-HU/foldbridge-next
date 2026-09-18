import { cssVarsFor, themeTokens } from './theme.js';
import { renderBundleHeader as renderSharedBundleHeader, renderGlobalNav } from './portalChrome.js';
import {
  renderGlobalSearch,
  renderFacetPanel,
  renderResultList,
  renderEvidenceTable,
  renderProvenanceSummary,
  renderProvenanceHistory,
  initHeaderSearch,
  initAptamerMultiSelect,
  initSecondaryStructureModule,
  initMolstarModule,
  initHomeStructureShowcase,
  initSequenceDetailMolstar,
  initSequenceDetailSecondaryHeatmap
} from './modules.js';
import { renderPrimaryNav, renderHomeHero, renderHelpPage, renderHomeProbingCarousel, renderHomeScrollStory, pickFeaturedCase, renderStatsPage } from './siteChrome.js';
import {
  dataTypeCards,
  detailRecord,
  featuredRecords,
  portalMetrics,
  recentPublications,
  siteSummaries,
  stageDiseaseCards
} from './data.js';
import { normalizeRoute, parseHashRoute, routeFromHash } from './router.js';
import { renderPdbCaseIndexPage, renderPdbCasePage } from './pdbCaseView.js';
import { createCaseStore } from './rmdbCaseStore.js';
import { createProbingArticleStore } from './probingArticleStore.js';
import { createHelpContentStore } from './helpContentStore.js';
import { createHomeScrollStoryStore } from './homeScrollStoryStore.js';
import { createSiteStatsStore } from './siteStatsStore.js';
import { clearStatsFilters, emptyStatsFilters, toggleStatsFilter } from './statsDashboard.js';
import { renderProbingArticleIndex, renderProbingArticlePage, renderProbingUnavailablePage } from './probingArticleView.js';
import { buildDashboardViewModel } from './dashboardViewModel.js';
import { createPdbCitationStore } from './pdbCitationStore.js';
import {
  buildAtlasSearchState
} from './annojoinAtlasData.js';
import { renderAnnojointAtlasPage } from './annojoinAtlasView.js';
import { bindAnnojointAtlasTable } from './annojoinAtlasController.js';
import {
  buildAnnojointTableGroups,
  isAnnojointSearchActive,
  rowCaseId,
  rowCaseKey,
  searchAnnojointRows,
  sortAnnojointCases
} from './annojoinAtlasTableModel.js';
import { createAnnojointAtlasStore } from './annojoinAtlasStore.js';
import { normalizeEntryRows, filterEntryRowsByTechniqueSelection } from './entryTable.js';
import { renderEntryTablePage } from './entryTableView.js';
import { buildEntryExport } from './downloadExport.js';
import { toggleTechniqueSelection } from './techniqueFilterModel.js';
import {
  mountEntryCaseHeightListener,
  mountEntryCaseLoadingIndicator,
  parseEntryCaseMatrixFamily,
} from './entryCaseEmbed.js';
import { initAnnojointStructureViewers } from './annojoinStructureViewer.js';
import {
  initAnnojointCasePage,
  renderAnnojointCasePage
} from './annojoinCaseView.js';
import {
  buildSearchHash,
  createSearchService,
  filtersFromSearchParams,
  pageFromSearchParams,
  SEARCH_FILTER_GROUPS,
  searchParamsFromHash,
  visibleSearchFilterEntries
} from './search/searchService.js?v=20260917-search-index';
let sequenceRows = [];
let browseEntryRows = [];
let expandedAnnojointGroupIds = new Set();
let uncappedAnnojointGroupIds = new Set();
let annojoinGroupsDefaultedExpanded = false;
// RMDB→PDB case 资产懒加载层与浏览器侧渲染缓存。
// store 命中内存缓存避免重复 fetch；下面三类 state 缓存“已加载”结果，
// 让同步的 pageFor()/render() 路径命中即渲染数据，未命中则渲染 loading 占位并触发后台加载。
const pdbCaseStore = createCaseStore();
const annojoinAtlasStore = createAnnojointAtlasStore();
const probingArticleStore = createProbingArticleStore();
const homeScrollStoryStore = createHomeScrollStoryStore();
const helpContentStore = createHelpContentStore({ assetBase: './src/' });
let helpContentState = null; // null=未加载, 'loading', 'error', 或 help-content.json 对象
const siteStatsStore = createSiteStatsStore();
const pdbCitationStore = createPdbCitationStore();
let pdbCaseIndexState = null; // null=未加载, 'loading', 'error', 或 { cases: [...] }
const pdbCaseDetailState = new Map(); // pdbId -> 'loading' | 'error' | { detail, profiles, alignmentPage, reactivitySummary }
let annojoinAtlasIndexState = null; // null=未加载, 'loading', 'error', 或 index.json
let annojoinDetailRouteIndexState = null; // null=未加载, 'loading', 'error', 或 detail-route-index.json
const annojoinAtlasDetailState = new Map(); // caseKey/caseId -> 'loading' | 'error' | generated case asset
const annojoinCaseConfidenceState = new Map(); // caseKey/caseId -> 'loading' | 'error' | { summary, evidence, provenance }
const annojoinPdbCitationState = new Map(); // pdbId -> 'loading' | 'unavailable' | primary citation
let probingArticleIndexState = null; // null=未加载, 'loading', 'error', 或 index.json
let siteStatsState = { status: 'idle' };
let statsDashboardFilters = emptyStatsFilters();
let homeScrollStoryState = null; // null=未加载, 'loading', 'error', 或 story.json 对象
let homeScrollVisitIndex = 0; // 本次会话展示用的轮换序号（load 时捕获，bump 前的值）
const probingArticleDetailState = new Map(); // slug -> 'loading' | 'error' | detail.json
let entryTableState = null; // null=未加载, 'loading', 'error', 或归一化后的 rows 数组
let entryMissingPdbsState = new Set(); // 缺页 PDB 集合（降级：命中行只渲染纯文本，不渲染死链）；fetch 失败降级为空集合
let expandedEntryGroupIds = new Set(); // entry 表两层折叠（partition→分子名）已展开的分组 id：parent:<id> / child:<id>
let entryTechniqueSelection = { families: new Set(), techniques: new Set() }; // 旧版 family + detail technique 两级筛选
let pdbDownloadQuery = '';
let pdbDownloadPage = 1;
let entryExportObjectUrl = '';
let entryExportSignature = '';
let entryTableViewportHeight = null;
let homeProbingCarouselTimer = null; // 主页轮播自动轮换定时器句柄（幂等：每次 render 先清后起）
let homeScrollStoryObserver = null; // 招牌区滚动联动 observer（幂等：每次 render 先 disconnect 再建）
let disposeEntryCaseHeightListener = null;
let pdbCaseConfidenceFilter = 'all';
let pdbCaseAlignmentPageByPdb = new Map(); // pdbId -> 当前 alignment 页码（1-based）
let homeDashboardFilters = {
  years: [],
  categories: []
};
const technologyCategories = [
  {
    id: 'shape-based-probing',
    title: 'SHAPE-based probing',
    summary: '2\'-OH acylation workflows spanning targeted assays, MaP readouts, and in vivo profiling.',
    methods: ['shape', 'shape-seq', 'shape-map', 'nai-map', 'icshape', 'icshape-map', 'smartshape', 'cotranscriptional-shape-seq', 'nuc-shape-structure-seq', 'chemmodseq']
  },
  {
    id: 'dms-based-probing',
    title: 'DMS-based probing',
    summary: 'DMS-centered methods for in-cell accessibility and transcriptome-scale readout.',
    methods: ['dms-seq', 'structure-seq', 'structure-seq-cap', 'structure-seq2', 'cirs-seq', 'mod-seq', 'dim-2p-seq', 'dms-mapseq', 'rapid-mapseq', 'tnet-mapseq']
  },
  {
    id: 'enzymatic-probing',
    title: 'Enzymatic probing',
    summary: 'Nuclease-based strategies for accessibility and cleavage profiling.',
    methods: ['pars', 'parte', 'tnet-rnase-seq']
  },
  {
    id: 'guanine-specific-probing',
    title: 'Guanine-specific probing',
    summary: 'Specialized methods focused on guanine reactivity and G-rich structural signals.',
    methods: ['keth-seq']
  },
  {
    id: 'cleavage-footprinting',
    title: 'Cleavage / footprinting',
    summary: 'Cleavage-style and footprinting approaches for protection and structural transition mapping.',
    methods: ['lead-seq', 'rl-seq']
  },
  {
    id: 'rna-protein-interaction',
    title: 'RNA-protein interaction related',
    summary: 'Methods that connect structural probing with RNA-protein interaction landscapes.',
    methods: ['iclaser']
  }
];

function createTechnologyMethod({
  slug,
  title,
  category,
  subtitle,
  reagent,
  readout,
  bestFor,
  whatItReads,
  outputs,
  strengths,
  caveats,
  workflow,
  foldbridgeUse,
  references
}) {
  return {
    slug,
    title,
    category,
    subtitle: subtitle ?? `${title} within the ${category} family.`,
    reagent: reagent ?? 'See protocol-specific chemistry and library design',
    readout: readout ?? 'Sequencing-derived structure or accessibility signal',
    bestFor: bestFor ?? `Browsing ${category} workflows and expanding into a dedicated child page later`,
    whatItReads: whatItReads ?? 'Local RNA accessibility, flexibility, or protection signatures',
    outputs: outputs ?? [
      `${title} reactivity or cleavage profiles`,
      'Condition-to-condition comparison tables',
      'Structure interpretation summaries'
    ],
    strengths: strengths ?? [
      `Fits naturally inside the ${category} module`,
      'Provides a clear child-page entry for future expansion',
      'Can later hold figures, protocols, examples, and references'
    ],
    caveats: caveats ?? [
      'This page is currently a technology placeholder rather than a full protocol review',
      'Final interpretation depends on the exact experimental implementation',
      'Best understood together with complementary structural evidence'
    ],
    workflow: workflow ?? [
      `Introduce the core idea behind ${title}`,
      'Explain the chemistry or enzymatic logic used by the method',
      'Summarize how the sequencing readout is generated',
      'Show how the output is interpreted in structure analysis'
    ],
    foldbridgeUse: foldbridgeUse ?? `FoldBridge can use ${title} as a dedicated child page under ${category}, so users can browse by category first and then drill into method-specific details.`,
    references: references ?? [
      `${title} primary reference placeholder for project curation.`,
      `${category} overview reference placeholder for project curation.`
    ]
  };
}

const technologyMethods = [
  createTechnologyMethod({
    slug: 'pars',
    title: 'PARS',
    category: 'Enzymatic probing',
    subtitle: 'Parallel analysis of RNA structure using nuclease sensitivity.',
    reagent: 'Structure-specific RNases',
    readout: 'Sequencing counts from single- and double-strand cleavage products',
    bestFor: 'Transcriptome-scale secondary-structure profiling in vitro',
    whatItReads: 'Relative single-stranded versus double-stranded enzyme accessibility',
    references: [
      'Kertesz M et al. Genome-wide measurement of RNA secondary structure in yeast. Nature. 2010.',
      'Wan Y et al. Landscape and variation of RNA secondary structure across the human transcriptome. Nature. 2014.'
    ]
  }),
  createTechnologyMethod({
    slug: 'parte',
    title: 'PARTE',
    category: 'Enzymatic probing',
    subtitle: 'Parallel analysis of RNA structures with temperature elevation.',
    reagent: 'RNase probing across temperature series',
    readout: 'Temperature-dependent cleavage signatures by sequencing',
    bestFor: 'Tracking structural melting behavior and thermodynamic transitions',
    whatItReads: 'How nuclease accessibility changes as RNA structures are destabilized'
  }),
  createTechnologyMethod({
    slug: 'tnet-rnase-seq',
    title: 'tNet-RNase-seq',
    category: 'Enzymatic probing',
    subtitle: 'RNase-network style sequencing for enzymatic probing at scale.',
    reagent: 'RNase-driven cleavage with network-scale sequencing analysis',
    readout: 'RNase cleavage signatures across transcript sets',
    bestFor: 'Comparing RNase-sensitive structural patterns across large RNA collections',
    whatItReads: 'RNase-sensitive accessibility and protection relationships across transcripts'
  }),
  createTechnologyMethod({
    slug: 'dms-seq',
    title: 'DMS-seq',
    category: 'DMS-based probing',
    subtitle: 'Sequencing-based DMS probing for base accessibility profiling.',
    reagent: 'Dimethyl sulfate',
    readout: 'Reverse-transcription stop signatures at modified bases',
    bestFor: 'Transcriptome-wide accessibility mapping under native-like conditions',
    whatItReads: 'Exposure of A and C bases that are not base-paired or are locally accessible',
    references: [
      'Rouskin S et al. Genome-wide probing of RNA structure reveals active unfolding of mRNA structures in vivo. Nature. 2014.',
      'Spitale RC et al. Structural imprints in vivo decode RNA regulatory mechanisms. Nature. 2015.'
    ]
  }),
  createTechnologyMethod({ slug: 'structure-seq', title: 'Structure-seq', category: 'DMS-based probing', subtitle: 'In vivo DMS-guided structure sequencing across cellular transcriptomes.' }),
  createTechnologyMethod({ slug: 'structure-seq-cap', title: 'Structure-Seq', category: 'DMS-based probing', subtitle: 'Capitalized naming variant often used in literature and figure labels.' }),
  createTechnologyMethod({ slug: 'structure-seq2', title: 'Structure-seq2', category: 'DMS-based probing', subtitle: 'Updated Structure-seq workflow with improved transcriptome-scale handling.' }),
  createTechnologyMethod({ slug: 'cirs-seq', title: 'CIRS-seq', category: 'DMS-based probing', subtitle: 'Chemical inference of RNA structures by sequencing.' }),
  createTechnologyMethod({ slug: 'mod-seq', title: 'Mod-seq', category: 'DMS-based probing', subtitle: 'Modification sequencing workflow for RNA chemical probing readouts.' }),
  createTechnologyMethod({ slug: 'dim-2p-seq', title: 'DIM-2P-seq', category: 'DMS-based probing', subtitle: 'DMS-family sequencing workflow for differential structural profiling.' }),
  createTechnologyMethod({
    slug: 'dms-mapseq',
    title: 'DMS-MaPseq',
    category: 'DMS-based probing',
    subtitle: 'Mutational profiling readout for DMS-based RNA structure probing.',
    reagent: 'Dimethyl sulfate with MaP reverse transcription',
    readout: 'Mutation frequencies induced at modified A/C sites',
    bestFor: 'Robust in vivo probing with improved event capture through mutational profiling',
    whatItReads: 'Base accessibility encoded as mutation signatures instead of only RT stops',
    references: [
      'Zubradt M et al. DMS-MaPseq for genome-wide or targeted RNA structure probing in vivo. Nat Methods. 2017.',
      'Busan S, Weeks KM. Accurate detection of chemical modifications in RNA by mutational profiling. Example overview reference.'
    ]
  }),
  createTechnologyMethod({ slug: 'rapid-mapseq', title: 'RAPiD-MaPseq', category: 'DMS-based probing', subtitle: 'Fast DMS-family mutational profiling workflow for comparative structure analysis.' }),
  createTechnologyMethod({ slug: 'tnet-mapseq', title: 'tNet-MaPseq', category: 'DMS-based probing', subtitle: 'Network-scale MaPseq-style DMS analysis across transcript sets.' }),
  createTechnologyMethod({
    slug: 'shape',
    title: 'SHAPE',
    category: 'SHAPE-based probing',
    subtitle: '2\'-OH acylation for nucleotide flexibility profiling.',
    reagent: '1M7 / NMIA / NAI',
    readout: 'Stops, mutations, or normalized SHAPE reactivity',
    bestFor: 'General secondary-structure modeling across diverse RNAs',
    whatItReads: 'Local nucleotide flexibility at the ribose 2\'-hydroxyl',
    references: [
      'Weeks KM. Advances in RNA structure analysis by chemical probing. Curr Opin Struct Biol. 2010.',
      'Mortimer SA, Weeks KM. Time-resolved RNA SHAPE chemistry. Example overview reference.'
    ]
  }),
  createTechnologyMethod({ slug: 'shape-seq', title: 'SHAPE-seq', category: 'SHAPE-based probing', subtitle: 'Sequencing-enabled SHAPE workflow for high-throughput RNA structure analysis.' }),
  createTechnologyMethod({ slug: 'shape-map', title: 'SHAPE-MaP', category: 'SHAPE-based probing', subtitle: 'Mutational profiling implementation of SHAPE reactivity measurement.' }),
  createTechnologyMethod({ slug: 'nai-map', title: 'NAI-MaP', category: 'SHAPE-based probing', subtitle: 'NAI-based mutational profiling for structure probing in native-like settings.' }),
  createTechnologyMethod({ slug: 'icshape', title: 'icSHAPE', category: 'SHAPE-based probing', subtitle: 'In vivo click SHAPE workflow for transcriptome-wide structure profiling.' }),
  createTechnologyMethod({ slug: 'icshape-map', title: 'icSHAPE-MaP', category: 'SHAPE-based probing', subtitle: 'Combined icSHAPE and MaP-style workflow for in-cell structure analysis.' }),
  createTechnologyMethod({ slug: 'smartshape', title: 'smartSHAPE', category: 'SHAPE-based probing', subtitle: 'SHAPE workflow optimized for richer transcriptome-scale structure interpretation.' }),
  createTechnologyMethod({ slug: 'cotranscriptional-shape-seq', title: 'Cotranscriptional SHAPE-seq', category: 'SHAPE-based probing', subtitle: 'SHAPE-seq workflow designed to monitor cotranscriptional folding.' }),
  createTechnologyMethod({ slug: 'nuc-shape-structure-seq', title: 'Nuc-SHAPE-Structure-Seq', category: 'SHAPE-based probing', subtitle: 'SHAPE-family sequencing method focused on nuclear RNA structure landscapes.' }),
  createTechnologyMethod({ slug: 'chemmodseq', title: 'ChemModSeq', category: 'SHAPE-based probing', subtitle: 'Chemical modification sequencing workflow within the SHAPE-family module.' }),
  createTechnologyMethod({ slug: 'keth-seq', title: 'Keth-seq', category: 'Guanine-specific probing', subtitle: 'Guanine-focused sequencing method for specialized probing readout.' }),
  createTechnologyMethod({ slug: 'lead-seq', title: 'Lead-seq', category: 'Cleavage / footprinting', subtitle: 'Lead-dependent cleavage sequencing for RNA structure readout.' }),
  createTechnologyMethod({ slug: 'rl-seq', title: 'RL-seq', category: 'Cleavage / footprinting', subtitle: 'Cleavage-oriented sequencing workflow for structural accessibility analysis.' }),
  createTechnologyMethod({ slug: 'iclaser', title: 'icLASER', category: 'RNA-protein interaction related', subtitle: 'In-cell probing method linked to solvent accessibility and RNA-protein interaction context.' })
];

function subNav() {
  return `<div class="hero-subnav">
    <div class="hero-subnav-inner">
      <button
        class="subnav-menu-toggle"
        id="subnav-menu-toggle"
        type="button"
        aria-label="Toggle navigation menu"
        aria-expanded="${isSubnavMenuOpen ? 'true' : 'false'}"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    <nav class="${isSubnavMenuOpen ? 'open' : ''}">
      <button
        class="nav-btn ${isRouteActive('home') ? 'active' : ''}"
        data-route="home"
        aria-current="${isRouteActive('home') ? 'page' : 'false'}"
      >
        Home
      </button>

      <button
        class="nav-btn ${isRouteActive('browse') ? 'active' : ''}"
        data-route="browse"
        aria-current="${isRouteActive('browse') ? 'page' : 'false'}"
      >
        Browse
      </button>

      <button
        class="nav-btn ${isRouteActive('sequence', 'download-sequences') ? 'active' : ''}"
        data-route="sequence"
        aria-current="${isRouteActive('sequence', 'download-sequences') ? 'page' : 'false'}"
      >
        Sequence
      </button>

      <button
        class="nav-btn ${isRouteActive('structure', 'download-structures') ? 'active' : ''}"
        data-route="structure"
        aria-current="${isRouteActive('structure', 'download-structures') ? 'page' : 'false'}"
      >
        Structure
      </button>

      <button
        class="nav-btn ${isRouteActive('probing', 'detail') ? 'active' : ''}"
        data-route="probing"
        aria-current="${isRouteActive('probing', 'detail') ? 'page' : 'false'}"
      >
        Probing
      </button>

      <button
        class="nav-btn ${isRouteActive('download') ? 'active' : ''}"
        data-route="download"
        aria-current="${isRouteActive('download') ? 'page' : 'false'}"
      >
        Download
      </button>

      <button
        class="nav-btn ${isRouteActive('search') ? 'active' : ''}"
        data-route="search"
        aria-current="${isRouteActive('search') ? 'page' : 'false'}"
      >
        Search
      </button>

      <button
        class="nav-btn ${isRouteActive('help') ? 'active' : ''}"
        data-route="help"
        aria-current="${isRouteActive('help') ? 'page' : 'false'}"
      >
        Help
      </button>
    </nav>
    </div>
  </div>`;
}


function getSequenceIdFromHash() {
  const hash = window.location.hash || '';
  const [, queryString = ''] = hash.split('?');
  const params = new URLSearchParams(queryString);
  return params.get('sequenceId');
}

function getPdbNameFromHash() {
  const hash = window.location.hash || '';
  const [, queryString = ''] = hash.split('?');
  const params = new URLSearchParams(queryString);
  return params.get('pdbName');
}

function getTechnologySlugFromHash() {
  const hash = window.location.hash || '';
  const [, queryString = ''] = hash.split('?');
  const params = new URLSearchParams(queryString);
  return params.get('tech');
}

function getEntryCaseParamsFromHash() {
  const hash = window.location.hash || '';
  const [, queryString = ''] = hash.split('?');
  const params = new URLSearchParams(queryString);
  return {
    pdb: params.get('pdb'),
    chain: params.get('chain'),
    family: parseEntryCaseMatrixFamily(queryString),
  };
}

function getPdbCaseParamsFromHash() {
  const hash = window.location.hash || '';
  const [, queryString = ''] = hash.split('?');
  const params = new URLSearchParams(queryString);
  return {
    pdbId: params.get('pdbId'),
    pdbReferenceId: params.get('pdbReferenceId'),
    bundleProfileId: params.get('bundleProfileId'),
    rmdbUniqueId: params.get('rmdbUniqueId')
  };
}

function renderColoredSequence(sequence) {
  return String(sequence ?? '')
    .split('')
    .map((char) => {
      const upper = char.toUpperCase();
      if (!'AUGCT'.includes(upper)) return char;
      const cls = upper === 'T' ? 'nucleotide-u' : `nucleotide-${upper.toLowerCase()}`;
      const display = upper === 'T' ? 'U' : char;
      return `<span class="sequence-nucleotide ${cls}">${display}</span>`;
    })
    .join('');
}

function renderSequenceDetailTimeline() {
  const items = ['2004', '2009', '2013']
    .map((year) => `<article class="sequence-detail-timeline-item">
      <time>${year}</time>
      <div class="sequence-detail-timeline-card">
        <p>xxx</p>
      </div>
    </article>`)
    .join('');

  return `<section class="sequence-detail-panel sequence-detail-timeline-panel">
    <h2>Timeline</h2>
    <div class="sequence-detail-timeline">
      ${items}
    </div>
  </section>`;
}

function renderSequenceDetailFornaPanel() {
  return `<section class="sequence-secondary-card sequence-secondary-forna-card">
    <div class="sequence-detail-forna-copy">
      <h3>RNA Secondary Structure Viewer (Forna)</h3>
      <p>Forna module with custom nucleotide colors (aptamer-style).</p>
    </div>
    <div class="sequence-detail-forna-frame">
      <div class="sequence-detail-forna-host" aria-label="Blank Forna secondary structure viewer"></div>
    </div>
    <p class="sequence-detail-forna-note">Secondary structure viewer reserved for future rendering.</p>
  </section>`;
}

function renderSequenceDetailSecondaryContent(row) {
  if (row.pdbName === '8QO5') {
    return `<div class="sequence-secondary-layout">
      <div class="sequence-secondary-top">
        <div class="sequence-secondary-block">
          <span class="sequence-secondary-label">Sequence</span>
          <code class="sequence-secondary-code">${row.type ?? ''}</code>
        </div>
        <div class="sequence-secondary-block">
          <span class="sequence-secondary-label">Structure</span>
          <code class="sequence-secondary-code">${row.structureText ?? ''}</code>
        </div>
      </div>

      <section class="sequence-secondary-card sequence-secondary-figure-card">
        <div class="sequence-secondary-card-header">
          <h3>Secondary Structure Diagram</h3>
          <span class="mini-note">Annotated structure for the conserved SL5 region.</span>
        </div>
        <img
          class="sequence-secondary-image"
          src="./src/assets/references/8QO5-secondary-structure.png"
          alt="Secondary structure diagram for SARS-CoV-2-SL5"
        />
      </section>

      ${renderSequenceDetailFornaPanel()}
    </div>`;
  }

  if (row.pdbName !== '5KPY' && row.pdbName !== '1AM0' && row.pdbName !== '4L81' && row.pdbName !== '5TPY') {
    return `<div class="sequence-detail-placeholder">
      <p>Secondary structure content will be added here.</p>
    </div>`;
  }

  const is5kpy = row.pdbName === '5KPY';
  const is1am0 = row.pdbName === '1AM0';
  const is4l81 = row.pdbName === '4L81';
  const structureText = is5kpy
    ? '.......................................................................'
    : is1am0
      ? '((((((...........((((((....)))))).))))))'
      : is4l81
        ? '................................................................................................'
        : '....(((((((((....)))).(((((((.[[[[..)))))))..)))))...]]]](((((....)))))';
  const heatmapTitle = is5kpy ? 'Mutate-and-map Heatmap' : is1am0 ? 'ATP Titration Reactivity Map' : 'Mutate-and-map Heatmap';
  const rdatUrl = is5kpy
    ? './src/assets/data/RNAPZ9_1M7_0001.rdat'
    : is1am0
      ? './src/assets/data/ATPCON_TITR_0001.rdat'
      : is4l81
        ? './src/assets/data/RNAPZ8_1M7_0001.rdat'
        : './src/assets/data/RNAPZ18_1M7_0000.rdat';
  const summaryMarkup = is5kpy
    ? `<div><dt>Dataset</dt><dd>RNA Puzzle 9</dd></div>
          <div><dt>Modifier</dt><dd>SHAPE</dd></div>
          <div><dt>Ligand</dt><dd>5-hydroxytryptophan (8.5 mM)</dd></div>
          <div><dt>Buffer</dt><dd>50 mM Na-HEPES, pH 8.0</dd></div>
          <div><dt>MgCl2</dt><dd>10 mM</dd></div>
          <div><dt>Temperature</dt><dd>24 C</dd></div>`
    : is1am0
      ? `<div><dt>Dataset</dt><dd>control point ATP titration</dd></div>
          <div><dt>Assay</dt><dd>StandardState</dd></div>
          <div><dt>Ligand</dt><dd>ATP titration (0-5000 uM)</dd></div>
          <div><dt>Buffer</dt><dd>50 mM Na-HEPES, pH 8.0</dd></div>
          <div><dt>Temperature</dt><dd>24 C</dd></div>
          <div><dt>Processing</dt><dd>background subtraction, overmodification correction</dd></div>`
      : is4l81
        ? `<div><dt>Dataset</dt><dd>RNA Puzzle 8</dd></div>
          <div><dt>Modifier</dt><dd>SHAPE</dd></div>
          <div><dt>Ligand</dt><dd>S-adenosylmethionine (8.8 mM)</dd></div>
          <div><dt>Buffer</dt><dd>50 mM Na-HEPES, pH 8.0</dd></div>
          <div><dt>MgCl2</dt><dd>10 mM</dd></div>
          <div><dt>Temperature</dt><dd>24 C</dd></div>`
        : `<div><dt>Dataset</dt><dd>RNA Puzzle 18</dd></div>
          <div><dt>Experiment Type</dt><dd>Mutate and Map</dd></div>
          <div><dt>Modifier</dt><dd>1M7</dd></div>
          <div><dt>Buffer</dt><dd>50 mM Na-HEPES, pH 8.0</dd></div>
          <div><dt>MgCl2</dt><dd>10 mM</dd></div>
          <div><dt>Temperature</dt><dd>24 C</dd></div>
          <div><dt>Processing</dt><dd>background subtraction, overmodification correction, normalization GAGUA</dd></div>`;
  return `<div class="sequence-secondary-layout">
    <div class="sequence-secondary-top">
      <div class="sequence-secondary-block">
        <span class="sequence-secondary-label">Sequence</span>
        <code class="sequence-secondary-code">${row.type ?? ''}</code>
      </div>
      <div class="sequence-secondary-block">
        <span class="sequence-secondary-label">Structure</span>
        <code class="sequence-secondary-code">${structureText}</code>
      </div>
    </div>

    <div class="sequence-secondary-bottom">
      <div class="sequence-secondary-main">
      <section class="sequence-secondary-card sequence-secondary-heatmap-card">
        <div class="sequence-secondary-card-header">
          <h3>${heatmapTitle}</h3>
          <span id="sequence-secondary-heatmap-status" class="mini-note">Loading heatmap…</span>
        </div>
        <div
          id="sequence-secondary-heatmap"
          class="sequence-secondary-heatmap-host"
          data-rdat-url="${rdatUrl}"
        ></div>
      </section>

      ${renderSequenceDetailFornaPanel()}
      </div>

      <aside class="sequence-secondary-side">
      <div class="sequence-secondary-card">
        <h3>Experiment Summary</h3>
        <dl class="sequence-secondary-meta">
          ${summaryMarkup}
        </dl>
      </div>

      </aside>
    </div>
  </div>`;
}

function renderSequenceDetailTertiaryContent(row) {
  if (!row.structureFile) {
    return `<div class="sequence-detail-placeholder">
      <p>Tertiary structure content will be added here.</p>
    </div>`;
  }

  return `<div class="sequence-detail-media">
    <div id="sequence-detail-molstar-status" class="mini-note">Loading interactive 3D structure…</div>
    <div
      id="sequence-detail-molstar"
      class="sequence-detail-viewer"
      data-structure-url="./${row.structureFile}"
      data-structure-format="cif"
      data-structure-label="${row.pdbName ?? 'local structure'}"
      data-structure-sequence="${row.type ?? ''}"
    ></div>
  </div>`;
}

function getHomeSecondaryStructureMarkup(row) {
  const structureMap = {
    '8QO5': {
      image: './src/assets/references/8QO5-secondary-structure.png',
      alt: 'Secondary structure diagram for SARS-CoV-2-SL5',
      structure: row.structureText || '. . . . . . ( ( ( ( ( . ( ( ( ( ( . . . . ) ) ) ) ) . . ) ) ) ) ) . . . . . .'
    },
    '5KPY': {
      image: './src/assets/references/5KPY-secondary-heatmap.png',
      alt: 'Reference secondary map for 5-hydroxytryptophan RNA aptamer',
      structure: '.......................................................................'
    },
    '1AM0': {
      structure: '((((((...........((((((....)))))).))))))'
    },
    '4L81': {
      structure: '................................................................................................'
    },
    '5TPY': {
      structure: '....(((((((((....)))).(((((((.[[[[..)))))))..)))))...]]]](((((....)))))'
    }
  };

  const entry = structureMap[row.pdbName] || {};
  const structure = entry.structure || row.structureText || 'Secondary structure preview will be added here.';

  return `
    <div class="home-secondary-panel">
      <div class="home-secondary-header">
        <h3>Secondary Structure</h3>
        <span class="mini-note">${row.pdbName || 'N/A'}</span>
      </div>
      ${entry.image ? `
        <div class="home-secondary-figure-wrap">
          <img class="home-secondary-image" src="${entry.image}" alt="${entry.alt || 'Secondary structure preview'}" />
        </div>
      ` : `
        <div class="home-secondary-code-wrap">
          <span class="home-secondary-label">Dot-bracket preview</span>
          <code class="home-secondary-code">${structure}</code>
        </div>
      `}
      <div class="home-secondary-sequence">
        <span class="home-secondary-label">Sequence</span>
        <code class="home-secondary-code">${row.type ?? ''}</code>
      </div>
    </div>
  `;
}

function renderSequenceDetailReferenceContent(row) {
  if (row.pdbName === '8QO5') {
    return `<div class="sequence-detail-reference-card">
      <div class="sequence-detail-reference-list">
        <article class="sequence-detail-reference-item">
          <h3>[1] Conserved structures and dynamics in 5'-proximal regions of Betacoronavirus RNA genomes.</h3>
          <p class="sequence-detail-reference-authors">de Moura, T.R., Purta, E., Bernat, A., Martin-Cuevas, E.M., Kurkowska, M., Baulin, E.F., Mukherjee, S., Nowak, J., Biela, A.P., Rawski, M., Glatt, S., Moreno-Herrero, F., Bujnicki, J.M. (2024)</p>
          <p class="sequence-detail-reference-source">Nucleic Acids Research 52:3419-3432</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/38426934/" target="_blank" rel="noopener noreferrer">PubMed: 38426934</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1093/nar/gkae144" target="_blank" rel="noopener noreferrer">DOI: 10.1093/nar/gkae144</a>
          </div>
        </article>
      </div>
    </div>`;
  }

  if (row.pdbName === '5KPY') {
    return `<div class="sequence-detail-reference-card">
      <div class="sequence-detail-reference-list">
        <article class="sequence-detail-reference-item">
          <h3>[1] RNA-Puzzles Round IV: 3D structure predictions of four ribozymes and two aptamers.</h3>
          <p class="sequence-detail-reference-authors">Miao Z, Adamiak RW, Antczak M, Boniecki MJ, Bujnicki J, Chen SJ, Cheng CY, Cheng Y, Chou FC, Das R, Dokholyan NV, Ding F, Geniesse C, Jiang Y, Joshi A, Krokhotin A, Magnus M, Mailhot O, Major F, Mann TH, Piatkowski P, Pluta R, Popenda M, Sarzynska J, Sun L, Szachniuk M, Tian S, Wang J, Wang J, Watkins AM, Wiedemann J, Xiao Y, Xu X, Yesselman JD, Zhang D, Zhang Y, Zhang Z, Zhao C, Zhao P, Zhou Y, Zok T, Zyla A, Ren A, Batey RT, Golden BL, Huang L, Lilley DM, Liu Y, Patel DJ, Westhof E. (2020)</p>
          <p class="sequence-detail-reference-source">RNA (New York, N.Y.) 26(8):982-995</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/32371455/" target="_blank" rel="noopener noreferrer">PMID: 32371455</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1261/rna.075341.120" target="_blank" rel="noopener noreferrer">DOI: 10.1261/rna.075341.120</a>
          </div>
        </article>

        <article class="sequence-detail-reference-item">
          <h3>[2] Recurrent RNA motifs as scaffolds for genetically encodable small-molecule biosensors.</h3>
          <p class="sequence-detail-reference-authors">Porter, E.B., Polaski, J.T., Morck, M.M., Batey, R.T. (2017)</p>
          <p class="sequence-detail-reference-source">Nature Chemical Biology 13:295-301</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/28092358/" target="_blank" rel="noopener noreferrer">PubMed: 28092358</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1038/nchembio.2278" target="_blank" rel="noopener noreferrer">DOI: 10.1038/nchembio.2278</a>
          </div>
        </article>
      </div>
    </div>`;
  }

  if (row.pdbName === '1AM0') {
    return `<div class="sequence-detail-reference-card">
      <div class="sequence-detail-reference-list">
        <article class="sequence-detail-reference-item">
          <h3>[1] Computational design of three-dimensional RNA structure and function.</h3>
          <p class="sequence-detail-reference-authors">Yesselman JD, Eiler D, Carlson ED, Gotrik MR, d'Aquino AE, Ooms AN, Kladwang W, Carlson PD, Shi X, Costantino DA, Herschlag D, Lucks JB, Jewett MC, Kieft JS, Das R. (2019)</p>
          <p class="sequence-detail-reference-source">Nature Nanotechnology 14(9):866-873</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/31427748/" target="_blank" rel="noopener noreferrer">PMID: 31427748</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1038/s41565-019-0517-8" target="_blank" rel="noopener noreferrer">DOI: 10.1038/s41565-019-0517-8</a>
          </div>
        </article>

        <article class="sequence-detail-reference-item">
          <h3>[2] Structural Basis of RNA Folding and Recognition in an AMP-RNA Aptamer Complex.</h3>
          <p class="sequence-detail-reference-authors">Jiang, F., Kumar, R.A., Jones, R.A., Patel, D.J. (1996)</p>
          <p class="sequence-detail-reference-source">Nature 382:183-186</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/8700212/" target="_blank" rel="noopener noreferrer">PubMed: 8700212</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1038/382183a0" target="_blank" rel="noopener noreferrer">DOI: 10.1038/382183a0</a>
          </div>
        </article>
      </div>
    </div>`;
  }

  if (row.pdbName === '4L81') {
    return `<div class="sequence-detail-reference-card">
      <div class="sequence-detail-reference-list">
        <article class="sequence-detail-reference-item">
          <h3>[1] RNA-Puzzles Round III: 3D RNA structure prediction of five riboswitches and one ribozyme.</h3>
          <p class="sequence-detail-reference-authors">Miao Z, Adamiak RW, Antczak M, Batey RT, Becka AJ, Biesiada M, Boniecki MJ, Bujnicki JM, Chen SJ, Cheng CY, Chou FC, Ferre-D'Amare AR, Das R, Dawson WK, Ding F, Dokholyan NV, Dunin-Horkawicz S, Geniesse C, Kappel K, Kladwang W, Krokhotin A, Lach GE, Major F, Mann TH, Magnus M, Pachulska-Wieczorek K, Patel DJ, Piccirilli JA, Popenda M, Purzycka KJ, Ren A, Rice GM, Santalucia J Jr, Sarzynska J, Szachniuk M, Tandon A, Trausch JJ, Tian S, Wang J, Weeks KM, Williams B 2nd, Xiao Y, Xu X, Zhang D, Zok T, Westhof E. (2017)</p>
          <p class="sequence-detail-reference-source">RNA (New York, N.Y.) 23(5):655-672</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/28138060/" target="_blank" rel="noopener noreferrer">PMID: 28138060</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1261/rna.060368.116" target="_blank" rel="noopener noreferrer">DOI: 10.1261/rna.060368.116</a>
          </div>
        </article>

        <article class="sequence-detail-reference-item">
          <h3>[2] Structural basis for diversity in the SAM clan of riboswitches.</h3>
          <p class="sequence-detail-reference-authors">Trausch, J.J., Xu, Z., Edwards, A.L., Reyes, F.E., Ross, P.E., Knight, R., Batey, R.T. (2014)</p>
          <p class="sequence-detail-reference-source">Proceedings of the National Academy of Sciences of the United States of America 111:6624-6629</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/24753586/" target="_blank" rel="noopener noreferrer">PubMed: 24753586</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1073/pnas.1312918111" target="_blank" rel="noopener noreferrer">DOI: 10.1073/pnas.1312918111</a>
          </div>
        </article>
      </div>
    </div>`;
  }

  if (row.pdbName === '5TPY') {
    return `<div class="sequence-detail-reference-card">
      <div class="sequence-detail-reference-list">
        <article class="sequence-detail-reference-item">
          <h3>[1] Zika virus produces noncoding RNAs using a multi-pseudoknot structure that confounds a cellular exonuclease.</h3>
          <p class="sequence-detail-reference-authors">Akiyama, B.M., Laurence, H.M., Massey, A.R., Costantino, D.A., Xie, X., Yang, Y., Shi, P.Y., Nix, J.C., Beckham, J.D., Kieft, J.S. (2016)</p>
          <p class="sequence-detail-reference-source">Science 354:1148-1152</p>
          <div class="sequence-detail-reference-links">
            <a class="sequence-detail-reference-link" href="https://pubmed.ncbi.nlm.nih.gov/27934765/" target="_blank" rel="noopener noreferrer">PubMed: 27934765</a>
            <a class="sequence-detail-reference-link" href="https://doi.org/10.1126/science.aah3963" target="_blank" rel="noopener noreferrer">DOI: 10.1126/science.aah3963</a>
          </div>
        </article>
      </div>
    </div>`;
  }

  return `<div class="sequence-detail-reference-card">
    <p>This tertiary structure is based on the PDB entry <strong>${row.pdbName ?? ''}</strong>.</p>
    <div class="sequence-detail-reference-links">
      <a class="sequence-detail-reference-link" href="https://www.rcsb.org/structure/${encodeURIComponent(row.pdbName ?? '')}" target="_blank" rel="noopener noreferrer">Open PDB Entry</a>
    </div>
  </div>`;
}

function sequenceDetailPage() {
  const sequenceId = getSequenceIdFromHash();
  const pdbName = getPdbNameFromHash();
  const row = sequenceRows.find((item) => item.id === sequenceId)
    ?? sequenceRows.find((item) => item.pdbName === pdbName);

  if (!row) {
    return `${renderBundleHeader()}
    <main class="page-sequence-detail">
      <section class="card">
        <h1>Sequence Not Found</h1>
        <p>No sequence record matched this link.</p>
      </section>
    </main>`;
  }

  return `${renderBundleHeader()}
  <main class="page-sequence-detail">
    <section class="sequence-detail-card">
      <div class="sequence-detail-header">
        <a class="sequence-detail-back" href="#sequence">Back to Entry</a>
        <div class="sequence-detail-title-row">
          <div>
            <p class="sequence-detail-kicker">${row.category ?? 'RNA'} record</p>
            <h1>${row.sequenceName ?? ''}</h1>
            <p>${row.aptamerName ?? ''}</p>
          </div>
          <dl class="sequence-detail-meta">
            <div><dt>PDB</dt><dd>${row.pdbName ?? 'N/A'}</dd></div>
            <div><dt>Year</dt><dd>${row.article ?? 'N/A'}</dd></div>
            <div><dt>Coverage</dt><dd>${row.sequence ?? 'N/A'}</dd></div>
            <div><dt>Confidence</dt><dd>${row.confidence ?? 'N/A'}</dd></div>
          </dl>
        </div>
      </div>

      ${renderSequenceDetailTimeline()}

      <section class="sequence-detail-panel">
        <h2>Description</h2>
        <div class="sequence-detail-placeholder">
          <p>${row.aptamerName ?? 'Description content will be added here.'}</p>
        </div>
      </section>

      <section class="sequence-detail-panel">
        <h2>Primary Sequence</h2>
        <div class="sequence-secondary-block">
          <code class="sequence-secondary-code sequence-primary-code">${renderColoredSequence(row.type ?? '')}</code>
        </div>
      </section>

      <section class="sequence-detail-panel">
        <h2>Secondary Structure</h2>
        ${renderSequenceDetailSecondaryContent(row)}
      </section>

      <section class="sequence-detail-panel">
        <h2>Tertiary Structure</h2>
        ${renderSequenceDetailTertiaryContent(row)}
      </section>

      <section class="sequence-detail-panel">
        <h2>Reference</h2>
        ${renderSequenceDetailReferenceContent(row)}
      </section>
    </section>
  </main>`;
}



async function loadSequenceRows() {
  sequenceRows = [
    {
      id: '8QO5-SARS-COV-2-SL5',
      pdbName: '8QO5',
      sequenceName: 'SARS-CoV-2-SL5',
      aptamerName: "Conserved Structures and Dynamics in 5'-Proximal Regions of Betacoronavirus RNA Genomes",
      category: 'Virus',
      type: 'AUUAAAGGUUUAUACCUUCCCAGGUAACAAACCAACCAACUUUCGAUCUCUUGUAGAUCUGUUCUCUAAACGAACUUUAAAAUCUGUGUGGCUGUCACUCGGCUGCAUGCUUAGUGCACUCACGCAGUAUAAUUAAUAACUAAUUACUGUCGUUGACAGGACACGAGUAACUCGUCUAUCUUCUGCAGGCUGCUUACGGUUUCGUCCGUGUUGCAGCCGAUCAUCAGCACAUCUAGGUUUCGUCCGGGUGUGACCGAAAGGUAAGAUGGAGAGCCUUGUCCCUGGUUUCAACGAGAAAAC',
      chemicalProbing: 'XX',
      article: '2024',
      sequence: '100%',
      confidence: 'high',
      structureFile: 'src/assets/structures/8QO5-assembly1.cif',
      structureText: '. . . . . . ( ( ( ( ( . ( ( ( ( ( . . . . ) ) ) ) ) . . ) ) ) ) ) . . . . . . . . . . . ( ( ( ( ( . . . . . ) ) ) ) ) . ( ( ( ( . . . . . . . ) ) ) ) . . . . . . . . ( ( ( ( ( ( ( ( . ( ( . ( ( ( ( . ( ( ( . . . . . ) ) ) . ) ) ) ) ) ) . ) ) ) ) ) ) ) ) . . ( ( ( ( ( ( . . . . . ) ) ) ) ) ) . . . ( ( ( ( ( ( ( ( ( ( ( . . ( ( ( ( ( . . . ( ( ( . ( ( ( ( ( ( ( ( ( ( ( . . ( ( ( ( ( ( . ( ( ( ( ( . . . . . . ) ) ) ) ) . . ) ) ) ) ) ) . . . . . . ) ) ) ( ( ( ( ( ( ( . ( ( . . . . . . ) ) ) ) ) ) ) ) ) ( ( ( . . . . ) ) ) ) ) ) ) ) ) ) ) ) ) ) . ) ) ) ) ) . ) ) ) ) . . . ) ) ) ) ) ) ) . . . . . .',
    },
    {
      id: '5KPY-5-HTP-RNA-APTAMER',
      pdbName: '5KPY',
      sequenceName: '5-hydroxytryptophan RNA aptamer',
      aptamerName: 'Structure of a 5-hydroxytryptophan aptamer',
      category: 'RNA',
      type: 'GGACACUGAUGAUCGCGUGGAUAUGGCACGCAUUGAAUUGUUGGACACCGUAAAUGUCCUAACACGUGUCC',
      chemicalProbing: 'XX',
      article: '2017',
      sequence: '100%',
      confidence: 'high',
      structureFile: 'src/assets/structures/5KPY-assembly1.cif'
    },
    {
      id: '1AM0-RNA-APTAMER',
      pdbName: '1AM0',
      sequenceName: 'RNA APTAMER',
      aptamerName: 'AMP RNA APTAMER COMPLEX, NMR, 8 STRUCTURES',
      category: 'RNA',
      type: 'GGGUUGGGAAGAAACUGUGGCACUUCGGUGCCAGCAACCC',
      chemicalProbing: 'XX',
      article: '1997',
      sequence: '100%',
      confidence: 'high',
      structureFile: 'src/assets/structures/1AM0-assembly1.cif'
    },
    {
      id: '4L81-SAM-I-IV-VARIANT-RIBOSWITCH-APTAMER-DOMAIN',
      pdbName: '4L81',
      sequenceName: 'SAM-I/IV variant riboswitch aptamer domain',
      aptamerName: 'Structure of the SAM-I/IV riboswitch (env87(deltaU92, deltaG93))',
      category: 'RNA',
      type: 'GGAUCACGAGGGGGAGACCCCGGCAACCUGGGACGGACACCCAAGGUGCUCACACCGGAGACGGUGGAUCCGGCCCGAGAGGGCAACGAAGUCCGU',
      chemicalProbing: 'XX',
      article: '2014',
      sequence: '100%',
      confidence: 'high',
      structureFile: 'src/assets/structures/4L81-assembly1.cif'
    },
    {
      id: '5TPY-RNA-71-MER',
      pdbName: '5TPY',
      sequenceName: 'RNA (71-MER)',
      aptamerName: 'Crystal structure of an exonuclease resistant RNA from Zika virus',
      category: 'RNA',
      type: 'GGGUCAGGCCGGCGAAAGUCGCCACAGUUUGGGGAAAGCUGUGCAGCCUGUAACCCCCCCACGAAAGUGGG',
      chemicalProbing: 'XX',
      article: '2016',
      sequence: '100%',
      confidence: 'high',
      structureFile: 'src/assets/structures/5TPY-assembly1.cif'
    }
  ].map((row) => ({
    ...row,
    detailPage: `#sequence-detail?sequenceId=${encodeURIComponent(row.id)}`
  }));
}

function dataAssetPath(fileName) {
  return `./src/assets/data/rmdb-puzzle/${fileName}`;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      current = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows;
}

async function loadBrowseEntryRows() {
  try {
    const response = await fetch(dataAssetPath('rdat_summary.csv'));
    if (!response.ok) throw new Error('Failed to load RDAT summary');
    const text = await response.text();
    const [header, ...records] = parseCsv(text);
    if (!header?.length) {
      browseEntryRows = [];
      return;
    }

    browseEntryRows = records.map((record) => {
      const row = Object.fromEntries(header.map((key, index) => [key, record[index] ?? '']));
      return {
        foldBridgeId: row['FoldBridge ID'] || '',
        name: row.Name || '',
        sequence: row.Sequence || '',
        length: row.Length || '',
        fileCode: row['File Code'] || '',
        experimentType: row['Experiment Type'] || '',
        modifier: row.Modifier || ''
      };
    });
  } catch (error) {
    console.error(error);
    browseEntryRows = [];
  }
}

const routes = ['home', 'browse', 'sequence', 'structure', 'probing', 'about', 'stats', 'download', 'pdb-downloads', 'search', 'help', 'pdb-case', 'annojoin-atlas', 'annojoin-case', 'annojoin-confidence'];
let route = routeFromHash(window.location.hash);
let theme = 'ribocentre';
let mode = localStorage.getItem('foldbridge-mode') === 'dark' ? 'dark' : 'light';
const siteSearchService = createSearchService();
const SAVED_SEARCHES_KEY = 'foldbridge.savedSearches';

function isRouteActive(...names) {
  return names.includes(route);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setTheme(themeKey, modeKey) {
  const styleTag = document.getElementById('theme-vars') ?? document.createElement('style');
  styleTag.id = 'theme-vars';
  styleTag.textContent = `:root { ${cssVarsFor(themeKey, modeKey)} }`;
  document.head.appendChild(styleTag);
  document.body.setAttribute('data-mode', modeKey);
  localStorage.setItem('foldbridge-mode', modeKey);
}

let isDownloadMenuOpen = false;
let isSubnavMenuOpen = false;

function nav() {
  return `<header>${renderGlobalNav()}</header>`;
}



function parseMetricValue(raw) {
  const text = String(raw).trim();
  const multiplier = text.endsWith('M') ? 1_000_000 : text.endsWith('K') ? 1_000 : 1;
  const numeric = Number(text.replace(/[^\d.]/g, '')) * multiplier;
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function formatAnimatedValue(target, original) {
  const text = String(original).trim();
  if (text.endsWith('M')) return `${(target / 1_000_000).toFixed(1)}M`;
  if (text.endsWith('K')) return `${(target / 1_000).toFixed(1)}K`;
  return target.toLocaleString();
}

function initAnimatedStats() {
  const nodes = Array.from(document.querySelectorAll('[data-animate-number="true"]'));
  const duration = 1200;

  nodes.forEach((node) => {
    if (node.dataset.animated === 'true') return;
    const target = Number(node.dataset.target || '0');
    const original = node.dataset.original || '0';
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(target * eased);
      node.textContent = formatAnimatedValue(value, original);
      if (t < 1) requestAnimationFrame(tick);
      else {
        node.textContent = original;
        node.dataset.animated = 'true';
      }
    }

    requestAnimationFrame(tick);
  });
}

function renderFooter() {
  return `<footer class="black-footer">
    <div class="black-footer-inner">
      <div class="footer-stack">
        <div class="footer-row">
          <span>© RNAcentre</span>
          <span class="sep">|</span>
          <a href="https://www.rnacentre.org/" target="_blank" rel="noopener noreferrer">www.rnacentre.org</a>
        </div>
        <div class="footer-row footer-address">
          <span class="footer-heading">Address</span>
          <span class="footer-address-text">Building F, Guangzhou National Laboratory 9 Xingdao North Road, Guangzhou International Bio Island, Haizhu District, Guangzhou, Guangdong, China.</span>
        </div>
        <div class="footer-row footer-bundle">
          <span class="footer-heading">Bundle</span>
          <a href="https://www.ribocentre.org/" target="_blank" rel="noopener noreferrer">Ribocentre</a>
          <a href="https://riboswitch.ribocentre.org/" target="_blank" rel="noopener noreferrer">Switch</a>
          <a href="https://aptamer.ribocentre.org/" target="_blank" rel="noopener noreferrer">Aptamer</a>
          <a href="http://www.glycornadb.com" target="_blank" rel="noopener noreferrer">GlycoRNA</a>
          <a href="#home" aria-current="page">FoldBridge</a>
        </div>
        <div class="footer-row footer-domain">
          <span class="footer-heading">GitHub Pages</span>
          <a href="http://github.com/chichaumiao-openclaw/foldbridge" target="_blank" rel="noopener noreferrer">http://github.com/chichaumiao-openclaw/foldbridge</a>
          <span class="sep">|</span>
          <span class="footer-heading">Custom domain</span>
          <strong>foldbridge.ribocentre.org</strong>
        </div>
      </div>
    </div>
  </footer>`;
}

function buildHomeDashboardData() {
  const rows = sequenceRows;
  const yearCounts = new Map();
  const categoryCounts = new Map();

  rows.forEach((row) => {
    const year = String(row.article ?? '');
    const category = String(row.category ?? 'Unknown');
    yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  });

  const yearEntries = [...yearCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const years = rows.map((row) => Number(row.article)).filter((value) => Number.isFinite(value));
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;
  const denseYearEntries = minYear !== null && maxYear !== null
    ? Array.from({ length: maxYear - minYear + 1 }, (_, offset) => {
        const year = String(minYear + offset);
        return [year, yearCounts.get(year) || 0];
      })
    : yearEntries;
  const displayYearEntries = denseYearEntries.filter(([year, count], index, entries) => {
    const numericYear = Number(year);
    const isBoundary = index === 0 || index === entries.length - 1;
    const isFiveYearTick = numericYear % 5 === 0;
    const hasData = count > 0;
    return isBoundary || isFiveYearTick || hasData;
  });
  const categoryEntries = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const totalSequenceLength = rows.reduce((sum, row) => sum + String(row.type ?? '').length, 0);
  const avgLength = rows.length ? Math.round(totalSequenceLength / rows.length) : 0;
  const yearValues = displayYearEntries.map(([, count]) => count);
  const maxYearCount = Math.max(...yearValues, 1);
  const donutPalette = ['#8FC8BE', '#E8BF8B', '#B9C8EC', '#DDBEE9', '#BFD8A5', '#E7B4AA', '#C7B9E8'];
  const barPalette = ['#E9A693', '#B8D9EE', '#C7E8D2', '#E8D6B0', '#D0BCEB', '#B9E2DB', '#EAB8CF', '#CFE3AE', '#B8C8EF', '#E6C39A', '#B9E7EA', '#DDB8B8'];
  const highConfidenceCount = rows.filter((row) => String(row.confidence).toLowerCase() === 'high').length;

  return {
    rows,
    yearEntries,
    displayYearEntries,
    categoryEntries,
    maxYearCount,
    avgLength,
    minYear: minYear ?? '—',
    maxYear: maxYear ?? '—',
    highConfidenceCount,
    barPalette,
    donutPalette
  };
}

function getFilteredHomeDashboardRows(rows) {
  return rows.filter((row) => {
    const matchesYear = homeDashboardFilters.years.length
      ? homeDashboardFilters.years.includes(String(row.article ?? ''))
      : true;
    const matchesCategory = homeDashboardFilters.categories.length
      ? homeDashboardFilters.categories.includes(String(row.category ?? ''))
      : true;
    return matchesYear && matchesCategory;
  });
}

function filterRowsByDashboardFilters(rows, filters = homeDashboardFilters) {
  return rows.filter((row) => {
    const matchesYear = filters.years?.length ? filters.years.includes(String(row.article ?? '')) : true;
    const matchesCategory = filters.categories?.length ? filters.categories.includes(String(row.category ?? '')) : true;
    return matchesYear && matchesCategory;
  });
}

function summarizeRowsByYear(rows, availableYears) {
  const counts = new Map();
  rows.forEach((row) => {
    const year = String(row.article ?? '');
    counts.set(year, (counts.get(year) || 0) + 1);
  });
  return availableYears.map(([year]) => [year, counts.get(String(year)) || 0]);
}

function summarizeRowsByCategory(rows, availableCategories) {
  const counts = new Map();
  rows.forEach((row) => {
    const category = String(row.category ?? '');
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return availableCategories.map(([category]) => [category, counts.get(String(category)) || 0]);
}

function createDonutSegments(entries, palette) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return [];
  let startAngle = 0;
  return entries.map(([label, count], index) => {
    const angle = (count / total) * 360;
    const endAngle = startAngle + angle;
    const segment = {
      label,
      count,
      color: palette[index % palette.length],
      startAngle,
      endAngle
    };
    startAngle = endAngle;
    return segment;
  });
}

function describeDonutArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const polarToCartesian = (radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians)
    };
  };

  const startOuter = polarToCartesian(outerRadius, endAngle);
  const endOuter = polarToCartesian(outerRadius, startAngle);
  const startInner = polarToCartesian(innerRadius, startAngle);
  const endInner = polarToCartesian(innerRadius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    'Z'
  ].join(' ');
}

function homePage() {
  if (probingArticleIndexState === null) {
    loadProbingArticleIndex();
  }
  if (siteStatsState.status === 'idle') {
    loadSiteStats();
  }
  const dashboardView = buildDashboardViewModel(siteStatsState, probingArticleIndexState);

  // 已加载则喂文章，否则空壳占位 + 触发懒加载（与 probing 路由同款）。
  const articles = (probingArticleIndexState && typeof probingArticleIndexState === 'object')
    ? (probingArticleIndexState.articles || [])
    : [];
  const carouselHtml = renderHomeProbingCarousel(articles);

  if (homeScrollStoryState === null) {
    loadHomeScrollStory();
  }
  let scrollStoryHtml = '';
  if (homeScrollStoryState && typeof homeScrollStoryState === 'object') {
    const visitIndex = homeScrollVisitIndex;
    const featured = pickFeaturedCase(homeScrollStoryState.cases || [], visitIndex);
    scrollStoryHtml = renderHomeScrollStory(featured, {
      assetBase: homeScrollStoryStore.assetBase,
      dashboardView,
      carouselHtml
    });
  } else {
    scrollStoryHtml = carouselHtml;
  }

  const bundleHeader = renderBundleHeader();

  return `${bundleHeader}
  <main class="page-home bundle-home-page">
    <section class="bundle-home-shell">
      ${renderHomeHero(dashboardView)}
      ${scrollStoryHtml}
    </section>
  </main>`;
}

function renderBundleHeader() {
  return renderSharedBundleHeader({ mode, navHtml: renderPrimaryNav(route) });
}


function renderTechnologyOverviewPage() {
  const categoryCards = technologyCategories.map((category) => {
    const methodsMarkup = category.methods
      .map((slug) => technologyMethods.find((method) => method.slug === slug))
      .filter(Boolean)
      .map((method) => `<a class="technology-method-pill" href="#probing?tech=${encodeURIComponent(method.slug)}">${method.title}</a>`)
      .join('');

    return `
      <article class="technology-category-card">
        <div class="technology-category-card-head">
          <p class="technology-method-kicker">Category</p>
          <h3>${category.title}</h3>
          <p>${category.summary}</p>
        </div>
        <div class="technology-category-card-body">
          <div class="technology-category-label-row">
            <span>Methods</span>
          </div>
          <div class="technology-method-grid-buttons">
            ${methodsMarkup}
          </div>
        </div>
      </article>
    `;
  }).join('');

  const categoryChips = technologyCategories
    .map((category) => `<span class="technology-chip">${category.title.replace(/^\d+\.\s*/, '')}</span>`)
    .join('');

  return `${renderBundleHeader()}
  <main class="page-detail">
    <section class="card bundle-wide-card technology-hero-card">
      <div class="technology-hero-copy">
        <p class="technology-kicker">technology atlas</p>
        <h1>Technology Categories</h1>
        <p class="technology-intro">This page is now organized as a method directory: 5 large technology modules first, then concrete techniques inside each module. Every technique name below opens its own child page.</p>
        <p class="technology-intro technology-intro-secondary">That gives you the exact structure you described: users first browse by category, then click into a specific method page for principle, workflow, strengths, caveats, and references.</p>
        <div class="technology-chip-row">${categoryChips}</div>
      </div>
      <aside class="technology-summary-panel">
        <article class="technology-summary-card">
          <p>major categories</p>
          <strong>${technologyCategories.length}</strong>
          <span>top-level modules on the technology landing page</span>
        </article>
        <article class="technology-summary-card">
          <p>child pages</p>
          <strong>${technologyMethods.length}</strong>
          <span>clickable method pages ready for later expansion</span>
        </article>
      </aside>
    </section>

    <section class="card bundle-wide-card technology-section-card">
      <div class="technology-section-heading">
        <div>
          <p class="technology-kicker">browse by category</p>
          <h2>Category Cards</h2>
        </div>
        <p>Each large card represents one category. Desktop shows two cards per row, and every method stays clickable as its own child page.</p>
      </div>
      <div class="technology-category-grid" role="list">
        ${categoryCards}
      </div>
    </section>
  </main>`;
}

function renderTechnologyMethodPage(method) {
  const workflow = method.workflow.map((step, index) => `
    <article class="technology-step-card">
      <span class="technology-step-index">0${index + 1}</span>
      <p>${step}</p>
    </article>
  `).join('');

  const strengths = method.strengths.map((item) => `<li>${item}</li>`).join('');
  const caveats = method.caveats.map((item) => `<li>${item}</li>`).join('');
  const outputs = method.outputs.map((item) => `<li>${item}</li>`).join('');
  const references = method.references.map((item) => `<li>${item}</li>`).join('');

  return `${renderBundleHeader()}
  <main class="page-detail">
    <section class="card bundle-wide-card technology-detail-hero">
      <a class="technology-back-link" href="#probing">Back to technology overview</a>
      <div class="technology-detail-header">
        <div>
          <h1>${method.title}</h1>
          <p class="technology-intro">${method.subtitle}</p>
        </div>
        <dl class="technology-detail-meta">
          <div><dt>Reagent</dt><dd>${method.reagent}</dd></div>
          <div><dt>Readout</dt><dd>${method.readout}</dd></div>
          <div><dt>Best for</dt><dd>${method.bestFor}</dd></div>
          <div><dt>Primary signal</dt><dd>${method.whatItReads}</dd></div>
        </dl>
      </div>
    </section>

    <section class="card bundle-wide-card technology-section-card">
      <div class="technology-section-heading">
        <div>
          <p class="technology-kicker">concept</p>
          <h2>What This Method Measures</h2>
        </div>
        <p>${method.foldbridgeUse}</p>
      </div>
      <div class="technology-dual-grid">
        <article class="technology-note-card">
          <h3>Typical outputs</h3>
          <ul>${outputs}</ul>
        </article>
        <article class="technology-note-card">
          <h3>When to choose it</h3>
          <p>${method.bestFor}</p>
        </article>
      </div>
    </section>

    <section class="card bundle-wide-card technology-section-card">
      <div class="technology-section-heading">
        <div>
          <p class="technology-kicker">workflow</p>
          <h2>Suggested Page Structure</h2>
        </div>
        <p>This is a good default layout for your future real content: principle first, then workflow, then interpretation, then examples.</p>
      </div>
      <div class="technology-step-grid">
        ${workflow}
      </div>
    </section>

    <section class="card bundle-wide-card technology-section-card">
      <div class="technology-dual-grid">
        <article class="technology-note-card">
          <h3>Strengths</h3>
          <ul>${strengths}</ul>
        </article>
        <article class="technology-note-card">
          <h3>Caveats</h3>
          <ul>${caveats}</ul>
        </article>
      </div>
    </section>

    <section class="card bundle-wide-card technology-section-card">
      <div class="technology-section-heading">
        <div>
          <p class="technology-kicker">references</p>
          <h2>Starter References</h2>
        </div>
        <p>These can later become linked citations, method notes, or protocol references.</p>
      </div>
      <ul class="technology-reference-list">
        ${references}
      </ul>
    </section>
  </main>`;
}

function detailPage() {
  const requestedSlug = getTechnologySlugFromHash();
  // The legacy technology directory links to `shape`, while the curated
  // article asset is `shape-reagents`; keep the old entry point pointing at
  // the new article instead of rendering the placeholder method page.
  const slug = requestedSlug === 'shape' ? 'shape-reagents' : requestedSlug;
  const header = renderBundleHeader();

  if (probingArticleIndexState === 'error') {
    return renderProbingUnavailablePage('The probing method index could not be loaded.', header);
  }

  // 探针科普文章优先：若 index 里存在该 slug，则渲染真实阅读页。
  const hasIndex = probingArticleIndexState && typeof probingArticleIndexState === 'object';
  const articleSlugs = hasIndex
    ? new Set((probingArticleIndexState.articles || []).map((a) => a.slug))
    : null;

  if (slug) {
    // 已加载详情 → 渲染阅读页
    const detailState = probingArticleDetailState.get(slug);
    if (detailState && typeof detailState === 'object') {
      return renderProbingArticlePage(detailState, hasIndex ? probingArticleIndexState : null, header);
    }
    // index 已确认该 slug 是真实文章 → 触发详情加载并显示 loading
    if (articleSlugs && articleSlugs.has(slug)) {
      if (detailState !== 'loading' && detailState !== 'error') loadProbingArticleDetail(slug);
      if (detailState === 'error') {
        // 加载失败时回退到旧占位方法页（若存在）
        const method = technologyMethods.find((item) => item.slug === slug);
        if (method) return renderTechnologyMethodPage(method);
      }
      return renderProbingArticleLoadingPage(slug, header, detailState === 'error');
    }
    // index 尚未加载 → 后台拉取，同时乐观触发该 slug 的详情加载
    if (!hasIndex) {
      if (probingArticleIndexState !== 'loading' && probingArticleIndexState !== 'error') {
        loadProbingArticleIndex();
      }
      if (detailState !== 'loading' && detailState !== 'error') loadProbingArticleDetail(slug);
      if (detailState === 'error') {
        const method = technologyMethods.find((item) => item.slug === slug);
        if (method) return renderTechnologyMethodPage(method);
      }
      return renderProbingArticleLoadingPage(slug, header, false);
    }
    // index 已加载但无此 slug → 回退到旧占位方法页（保留 legacy 方法目录）
    const method = technologyMethods.find((item) => item.slug === slug);
    if (method) return renderTechnologyMethodPage(method);
    return renderProbingArticleIndex(probingArticleIndexState, header);
  }

  // 无 slug：总览页。优先真实文章索引；未加载则后台拉取并显示原 technology 总览作为占位。
  if (hasIndex) {
    return renderProbingArticleIndex(probingArticleIndexState, header);
  }
  if (probingArticleIndexState !== 'loading' && probingArticleIndexState !== 'error') {
    loadProbingArticleIndex();
  }
  return renderTechnologyOverviewPage();
}

function renderProbingArticleLoadingPage(slug, headerHtml, isError) {
  const method = technologyMethods.find((item) => item.slug === slug);
  const title = method ? method.title : slug;
  return `${headerHtml}
  <main class="page-detail page-probing-article">
    <section class="card bundle-wide-card technology-detail-hero">
      <a class="technology-back-link" href="#probing">← Back to probing methods overview</a>
      <div class="technology-detail-header">
        <div>
          <p class="technology-kicker">probing article</p>
          <h1>${title}</h1>
          <p class="technology-intro">${isError ? 'Failed to load article assets. Please try again later.' : 'Loading article…'}</p>
        </div>
      </div>
    </section>
  </main>`;
}

function browsePage() {
  const rows = browseEntryRows.length
    ? browseEntryRows
        .map(
          (row) => `<tr>
            <td>${row.foldBridgeId}</td>
            <td>${row.name}</td>
            <td>
              <span class="entry-sequence" title="${row.sequence}">${row.sequence}</span>
            </td>
            <td>${row.fileCode}</td>
            <td>${row.experimentType}</td>
            <td>${row.modifier}</td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="6" class="entry-table-empty">No entries yet.</td></tr>`;

  return `${renderBundleHeader()}
  <main class="page-download-sequences page-browse">
    <section class="card download-card entry-table-card">
      <div class="entry-table-wrap">
        <table class="entry-table">
          <thead>
            <tr>
              <th>FoldBridge ID</th>
              <th>Name</th>
              <th>Sequence</th>
              <th>File Code</th>
              <th>Experiment Type</th>
              <th>Modifier</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>
  </main>`;
}

function structurePage() {
  return downloadStructuresPage();
}

function renderPdbCaseLoadingPage(message, headerHtml = '') {
  return `${headerHtml}
  <main class="page-pdb-case">
    <section class="card bundle-wide-card pdb-case-hero">
      <a class="technology-back-link" href="#pdb-case">Back to PDB case index</a>
      <p class="technology-kicker">PDB case</p>
      <h1>${message}</h1>
      <div class="pdb-case-track-empty">Loading…</div>
    </section>
  </main>`;
}

async function loadPdbCaseIndex() {
  if (pdbCaseIndexState === 'loading') return;
  pdbCaseIndexState = 'loading';
  try {
    const index = await pdbCaseStore.loadCaseIndex();
    pdbCaseIndexState = { cases: index.cases || [] };
  } catch (err) {
    console.error('[main] 加载 PDB case 索引失败', err);
    pdbCaseIndexState = 'error';
  }
  if (route === 'pdb-case') render({ preserveScroll: true });
}

async function loadPdbCaseDetail(pdbId) {
  if (pdbCaseDetailState.get(pdbId) === 'loading') return;
  pdbCaseDetailState.set(pdbId, 'loading');
  try {
    const detail = await pdbCaseStore.loadCase(pdbId);
    const profilesDoc = await pdbCaseStore.loadProfiles(pdbId).catch(() => null);
    const profiles = profilesDoc?.profiles || [];
    const page = pdbCaseAlignmentPageByPdb.get(pdbId) || 1;
    let alignmentPage = null;
    if ((detail.alignmentPageCount || 0) > 0) {
      alignmentPage = await pdbCaseStore.loadAlignmentPage(pdbId, page).catch(() => null);
    }
    let reactivitySummary = null;
    const firstReac = (detail.reactivity || [])[0];
    if (firstReac?.profileKey) {
      reactivitySummary = await pdbCaseStore
        .loadReactivitySummary(pdbId, firstReac.profileKey)
        .catch(() => null);
    }
    pdbCaseDetailState.set(pdbId, { detail, profiles, alignmentPage, reactivitySummary });
  } catch (err) {
    console.error('[main] 加载 PDB case 详情失败', pdbId, err);
    pdbCaseDetailState.set(pdbId, 'error');
  }
  if (route === 'pdb-case') render({ preserveScroll: true });
}

async function loadProbingArticleIndex() {
  if (probingArticleIndexState === 'loading') return;
  probingArticleIndexState = 'loading';
  try {
    const loadedIndex = await probingArticleStore.loadIndex();
    const dashboardView = buildDashboardViewModel(siteStatsState, loadedIndex);
    if (dashboardView.probingStatus !== 'ready') {
      throw new Error(dashboardView.probingError || 'The probing method index is invalid.');
    }
    probingArticleIndexState = loadedIndex;
  } catch (err) {
    console.error('[main] 加载探针文章索引失败', err);
    probingArticleIndexState = 'error';
  }
  if (route === 'detail' || route === 'probing' || route === 'home' || route === 'stats') render({ preserveScroll: true });
}

async function loadHelpContent() {
  if (helpContentState === 'loading') return;
  helpContentState = 'loading';
  try {
    // 与 About 同款：store 失败返回 null → 终态 'error'，避免无限重试。
    helpContentState = (await helpContentStore.loadContent()) || 'error';
  } catch (err) {
    console.error('[main] 加载 Help 内容失败', err);
    helpContentState = 'error';
  }
  if (route === 'help') render({ preserveScroll: true });
}

async function loadSiteStats() {
  if (siteStatsState.status === 'loading' || siteStatsState.status === 'ready') return;
  siteStatsState = { status: 'loading' };
  try {
    const dashboard = await siteStatsStore.loadDashboard();
    siteStatsState = { status: 'ready', ...dashboard };
  } catch (err) {
    console.error('[main] 加载站点统计失败', err);
    siteStatsState = { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
  if (route === 'stats' || route === 'home') render({ preserveScroll: true });
}

function initStatsDashboard() {
  document.querySelectorAll('.stats-chart-row[data-stats-filter-dimension]').forEach((button) => {
    button.addEventListener('click', () => {
      statsDashboardFilters = toggleStatsFilter(
        statsDashboardFilters,
        button.getAttribute('data-stats-filter-dimension'),
        button.getAttribute('data-stats-filter-value')
      );
      render({ preserveScroll: true });
    });
  });
  document.querySelectorAll('[data-stats-filter-chip]').forEach((button) => {
    button.addEventListener('click', () => {
      statsDashboardFilters = toggleStatsFilter(
        statsDashboardFilters,
        button.getAttribute('data-stats-filter-dimension'),
        button.getAttribute('data-stats-filter-value')
      );
      render({ preserveScroll: true });
    });
  });
  document.querySelector('[data-stats-reset]')?.addEventListener('click', () => {
    statsDashboardFilters = clearStatsFilters();
    render({ preserveScroll: true });
  });
}

// 访问计数：每次成功加载招牌 story 自增（localStorage），用于 pickFeaturedCase 轮换。
// 隐私模式 localStorage 抛错 → 退回 0，绝不报错（规格 §8 降级）。
function readHomeScrollVisitIndex() {
  try {
    const raw = globalThis.localStorage?.getItem('fb.hss.visitIndex');
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_err) {
    return 0;
  }
}

function bumpHomeScrollVisitIndex() {
  try {
    const next = readHomeScrollVisitIndex() + 1;
    globalThis.localStorage?.setItem('fb.hss.visitIndex', String(next));
  } catch (_err) {
    /* 隐私模式：忽略 */
  }
}

async function loadHomeScrollStory() {
  if (homeScrollStoryState === 'loading') return;
  homeScrollStoryState = 'loading';
  homeScrollVisitIndex = readHomeScrollVisitIndex();
  try {
    homeScrollStoryState = await homeScrollStoryStore.loadStory();
    bumpHomeScrollVisitIndex();
  } catch (err) {
    console.error('[main] 加载主页招牌叙事失败', err);
    homeScrollStoryState = 'error';
  }
  if (route === 'home') render({ preserveScroll: true });
}

async function loadProbingArticleDetail(slug) {
  if (!slug || probingArticleDetailState.get(slug) === 'loading') return;
  probingArticleDetailState.set(slug, 'loading');
  try {
    const detail = await probingArticleStore.loadArticle(slug);
    probingArticleDetailState.set(slug, detail);
  } catch (err) {
    console.error('[main] 加载探针文章详情失败', slug, err);
    probingArticleDetailState.set(slug, 'error');
  }
  if (route === 'detail' || route === 'probing') render({ preserveScroll: true });
}

async function loadEntryTable() {
  if (entryTableState === 'loading') return;
  entryTableState = 'loading';
  try {
    const response = await fetch('./src/assets/generated/entry-table/entry-table.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    entryTableState = normalizeEntryRows(await response.json());
  } catch (err) {
    console.error('[main] 加载 entry 表失败', err);
    entryTableState = 'error';
  }
  // 缺页清单：fetch 失败/不存在时降级为空集合（所有行照常可跳，回到旧行为），不阻断表加载。
  try {
    const missingResponse = await fetch('./src/assets/generated/entry-table/entry-missing-pages.json');
    if (!missingResponse.ok) throw new Error(`HTTP ${missingResponse.status}`);
    const payload = await missingResponse.json();
    entryMissingPdbsState = new Set(Array.isArray(payload.missingPdbs) ? payload.missingPdbs : []);
  } catch (err) {
    console.error('[main] 加载 entry 缺页清单失败（降级为空集合）', err);
    entryMissingPdbsState = new Set();
  }
  if (route === 'entry' || route === 'pdb-downloads') render({ preserveScroll: true });
}

function entryTablePage() {
  let content;
  if (!entryTableState || entryTableState === 'loading') {
    if (entryTableState !== 'loading') loadEntryTable();
    content = renderEntryTablePage({ rows: null, statusMessage: { tone: 'loading', text: 'Loading the entry table…' } });
  } else if (entryTableState === 'error') {
    content = renderEntryTablePage({ rows: null, statusMessage: { tone: 'error', text: 'The entry table could not be loaded. Refresh to try again.' } });
  } else {
    content = renderEntryTablePage({
      rows: getFilteredEntryRows(),
      totalRowCount: entryTableState.length,
      missingPdbs: entryMissingPdbsState,
      grouped: true,
      expandedGroupIds: expandedEntryGroupIds,
      techniqueSelection: entryTechniqueSelection
    });
  }
  return `${renderBundleHeader()}${content}`;
}

async function loadAnnojointAtlasIndex() {
  if (annojoinAtlasIndexState === 'loading') return;
  annojoinAtlasIndexState = 'loading';
  try {
    annojoinAtlasIndexState = await annojoinAtlasStore.loadIndex();
  } catch (err) {
    console.error('[main] 加载 ANNOJOIN Atlas 索引失败', err);
    annojoinAtlasIndexState = 'error';
  }
  if (route === 'entry' || route === 'sequence' || route === 'annojoin-atlas' || route === 'annojoin-case') render({ preserveScroll: true });
}

async function loadAnnojointDetailRouteIndex() {
  if (annojoinDetailRouteIndexState === 'loading') return;
  annojoinDetailRouteIndexState = 'loading';
  try {
    annojoinDetailRouteIndexState = await annojoinAtlasStore.loadDetailRouteIndex();
  } catch (err) {
    console.error('[main] 加载 ANNOJOIN Atlas detail route index 失败', err);
    annojoinDetailRouteIndexState = 'error';
  }
  if (route === 'annojoin-case') render({ preserveScroll: true });
}

function resolveAnnojointDetailRouteEntry(caseKey, caseId = '') {
  if (!annojoinDetailRouteIndexState || typeof annojoinDetailRouteIndexState !== 'object') return null;
  const lookup = annojoinDetailRouteIndexState.lookup || {};
  return lookup[caseKey] || lookup[String(caseKey || '').toUpperCase()] || lookup[caseId] || lookup[String(caseId || '').toUpperCase()] || null;
}

function annojoinConfidenceAssetPaths(caseKey = '') {
  const normalizedKey = String(caseKey || '').trim();
  const segment = encodeURIComponent(normalizedKey);
  return {
    summaryPath: `cases/${segment}/confidence-summary.json`,
    evidencePath: `cases/${segment}/confidence-evidence.json`,
    provenancePath: `cases/${segment}/confidence-provenance.json`,
  };
}

async function loadAnnojointAtlasDetail(caseKey, caseAssetPath = '') {
  if (!caseKey || annojoinAtlasDetailState.get(caseKey) === 'loading') return;
  annojoinAtlasDetailState.set(caseKey, 'loading');
  try {
    const asset = caseAssetPath
      ? await annojoinAtlasStore.loadCaseAssetPath(caseAssetPath, { compressed: true })
      : await annojoinAtlasStore.loadCase(caseKey, { compressed: true });
    annojoinAtlasDetailState.set(caseKey, asset);
  } catch (err) {
    console.error('[main] 加载 ANNOJOIN Atlas case 失败', caseKey, err);
    annojoinAtlasDetailState.set(caseKey, 'error');
  }
  if (route === 'annojoin-case') render({ preserveScroll: true });
}

async function loadAnnojointCaseConfidence(caseKey, caseAsset) {
  if (!caseKey || annojoinCaseConfidenceState.get(caseKey) === 'loading') return;
  const family = String(caseAsset?.case?.assetFamily || '').trim();
  if (!['RMDB2PDB', 'RASP2PDB'].includes(family)) return;
  annojoinCaseConfidenceState.set(caseKey, 'loading');
  try {
    const assetPaths = caseAsset?.supplementalAssets || annojoinConfidenceAssetPaths(caseKey);
    const [summary, evidence, provenance] = await Promise.all([
      annojoinAtlasStore.loadAssetPath(assetPaths.confidenceSummaryPath || assetPaths.summaryPath, { compressed: true }),
      annojoinAtlasStore.loadAssetPath(assetPaths.confidenceEvidencePath || assetPaths.evidencePath, { compressed: true }),
      annojoinAtlasStore.loadAssetPath(assetPaths.confidenceProvenancePath || assetPaths.provenancePath, { compressed: true }),
    ]);
    annojoinCaseConfidenceState.set(caseKey, { summary, evidence, provenance });
  } catch (err) {
    console.error('[main] 加载 ANNOJOIN case confidence sidecars 失败', caseKey, err);
    annojoinCaseConfidenceState.set(caseKey, 'error');
  }
  if (route === 'annojoin-case') render({ preserveScroll: true });
}

async function loadAnnojointPdbCitation(pdbId) {
  const normalizedPdbId = String(pdbId || '').trim().toUpperCase();
  if (!normalizedPdbId || annojoinPdbCitationState.get(normalizedPdbId) === 'loading') return;
  annojoinPdbCitationState.set(normalizedPdbId, 'loading');
  const citation = await pdbCitationStore.loadPrimaryCitation(normalizedPdbId);
  annojoinPdbCitationState.set(normalizedPdbId, citation || 'unavailable');
  if (route === 'annojoin-case') render({ preserveScroll: true });
}

// alignment 分页导航：保留已加载的 detail/profiles/reactivity，只换 alignment 页，避免整页 loading 闪烁。
async function loadAlignmentForCase(pdbId, page) {
  pdbCaseAlignmentPageByPdb.set(pdbId, page);
  const state = pdbCaseDetailState.get(pdbId);
  if (!state || typeof state === 'string') {
    loadPdbCaseDetail(pdbId);
    return;
  }
  try {
    const alignmentPage = await pdbCaseStore.loadAlignmentPage(pdbId, page);
    pdbCaseDetailState.set(pdbId, { ...state, alignmentPage });
  } catch (err) {
    console.error('[main] 加载 alignment 页失败', pdbId, page, err);
  }
  if (route === 'pdb-case') render({ preserveScroll: true });
}

function pdbCasePage() {
  const params = getPdbCaseParamsFromHash();
  const headerHtml = renderBundleHeader();
  if (!params.pdbId) {
    if (pdbCaseIndexState && typeof pdbCaseIndexState === 'object') {
      return renderPdbCaseIndexPage(pdbCaseIndexState.cases, { headerHtml });
    }
    if (pdbCaseIndexState !== 'loading') loadPdbCaseIndex();
    return renderPdbCaseLoadingPage(
      pdbCaseIndexState === 'error' ? 'PDB case index unavailable' : 'Loading PDB case index…',
      headerHtml
    );
  }
  const state = pdbCaseDetailState.get(params.pdbId);
  if (state && typeof state === 'object') {
    return renderPdbCasePage(state.detail, params, {
      profiles: state.profiles,
      alignmentPage: state.alignmentPage,
      reactivitySummary: state.reactivitySummary
    }, { headerHtml });
  }
  if (state === 'error') return renderPdbCasePage(null, params, {}, { headerHtml });
  if (state !== 'loading') loadPdbCaseDetail(params.pdbId);
  return renderPdbCaseLoadingPage(`Loading case assets for ${params.pdbId}…`, headerHtml);
}

function annojoinAtlasPage() {
  const parsed = parseHashRoute(window.location.hash);
  const params = parsed.params;
  const routeName = (parsed.route === 'entry' || parsed.route === 'sequence') ? parsed.route : 'annojoin-atlas';
  const filters = getAnnojointAtlasFilters(params);
  const selectedCaseId = params.get('caseId') || '';
  const selectedCaseKey = params.get('caseKey') || '';
  const headerHtml = renderBundleHeader();
  if (!annojoinAtlasIndexState || annojoinAtlasIndexState === 'loading') {
    if (annojoinAtlasIndexState !== 'loading') loadAnnojointAtlasIndex();
    return renderAnnojointAtlasPage({
      state: null,
      routeName,
      expandedGroupIds: expandedAnnojointGroupIds,
      uncappedGroupIds: uncappedAnnojointGroupIds,
      selectedCaseId,
      selectedCaseKey,
      statusMessage: { tone: 'loading', text: 'Loading the master table…' },
      headerHtml
    });
  }
  if (annojoinAtlasIndexState === 'error') {
    return renderAnnojointAtlasPage({
      state: null,
      routeName,
      expandedGroupIds: expandedAnnojointGroupIds,
      uncappedGroupIds: uncappedAnnojointGroupIds,
      selectedCaseId,
      selectedCaseKey,
      statusMessage: { tone: 'error', text: 'The master table could not be loaded. Refresh to try again.' },
      headerHtml
    });
  }

  const state = buildAtlasSearchState(annojoinAtlasIndexState, filters);
  if (!annojoinGroupsDefaultedExpanded) {
    // Keep the first view compact: users can expand only the molecule group
    // they want to inspect instead of rendering every group at once.
    expandedAnnojointGroupIds = new Set();
    annojoinGroupsDefaultedExpanded = true;
  }
  return renderAnnojointAtlasPage({
    state,
    routeName,
    expandedGroupIds: expandedAnnojointGroupIds,
    uncappedGroupIds: uncappedAnnojointGroupIds,
    selectedCaseId,
    selectedCaseKey,
    headerHtml
  });
}

function getAnnojointAtlasFilters(params) {
  return {
    query: params.get('q') || '',
    rnaFamily: params.get('rnaFamily') || '',
    probeType: params.get('probeType') || '',
    pdbId: params.get('pdbId') || '',
    motif: params.get('motif') || '',
    structureClass: params.get('structureClass') || '',
    techniqueFamilies: params.getAll('techniqueFamilies'),
    techniqueNames: params.getAll('techniqueNames')
  };
}

function currentAnnojointAtlasTables() {
  return annojoinAtlasIndexState && typeof annojoinAtlasIndexState === 'object'
    ? annojoinAtlasIndexState
    : { cases: [], displayCases: [], facets: [], presets: [], downloads: [] };
}

function currentAnnojointAtlasState() {
  const parsed = parseHashRoute(window.location.hash);
  const params = parsed.params;
  const filters = getAnnojointAtlasFilters(params);
  const sortedRows = sortAnnojointCases(buildAtlasSearchState(currentAnnojointAtlasTables(), filters).cases);
  const rows = isAnnojointSearchActive(filters.query)
    ? searchAnnojointRows(sortedRows, filters.query)
    : sortedRows;
  return { rows };
}

function getAnnojointCaseIdFromHash() {
  const parsed = parseHashRoute(window.location.hash);
  return String(parsed.params.get('caseId') || '10ZT').trim().toUpperCase();
}

function getAnnojointCaseKeyFromHash() {
  const parsed = parseHashRoute(window.location.hash);
  return String(parsed.params.get('caseKey') || getAnnojointCaseIdFromHash()).trim();
}

function findAnnojointIndexRowByKey(caseKey) {
  const normalizedKey = String(caseKey || '').trim().toUpperCase();
  if (!normalizedKey) return null;
  const state = buildAtlasSearchState(currentAnnojointAtlasTables(), {}).cases;
  return state.find((row) => rowCaseKey(row).toUpperCase() === normalizedKey || rowCaseId(row).toUpperCase() === normalizedKey) || null;
}

function annojoinCasePage() {
  const caseId = getAnnojointCaseIdFromHash();
  const caseKey = getAnnojointCaseKeyFromHash();
  const detailState = annojoinAtlasDetailState.get(caseKey);
  const confidenceState = annojoinCaseConfidenceState.get(caseKey);
  if (!annojoinDetailRouteIndexState) loadAnnojointDetailRouteIndex();
  const detailRouteEntry = resolveAnnojointDetailRouteEntry(caseKey, caseId);
  const caseAssetPath = detailRouteEntry?.asset?.caseAssetPath || findAnnojointIndexRowByKey(caseKey)?.caseAssetPath;
  if (!detailState && (annojoinDetailRouteIndexState === 'error' || detailRouteEntry || caseAssetPath)) {
    loadAnnojointAtlasDetail(caseKey, caseAssetPath);
  }
  if (detailState && typeof detailState === 'object' && !confidenceState) {
    loadAnnojointCaseConfidence(caseKey, detailState);
  }
  const pdbId = String(detailState?.case?.pdbId || caseId || '').trim().toUpperCase();
  const citationState = pdbId ? annojoinPdbCitationState.get(pdbId) : null;
  if (detailState && typeof detailState === 'object' && !citationState) {
    loadAnnojointPdbCitation(pdbId);
  }
  return renderAnnojointCasePage({
    caseAsset: detailState && typeof detailState === 'object' ? detailState : null,
    confidenceBundle: confidenceState && typeof confidenceState === 'object' ? confidenceState : null,
    confidenceStatus: confidenceState || 'idle',
    pdbCitation: citationState && typeof citationState === 'object' ? citationState : null,
    pdbCitationStatus: citationState || 'idle',
    caseId,
    caseKey,
    headerHtml: renderBundleHeader()
  });
}

function setAnnojointAtlasFilter(key, value, { replace = false } = {}) {
  const parsed = parseHashRoute(window.location.hash);
  const params = parsed.params;
  const routeName = (parsed.route === 'entry' || parsed.route === 'sequence') ? parsed.route : 'annojoin-atlas';
  if (value) params.set(key, value);
  else params.delete(key);
  params.set('page', '1');
  params.delete('caseId');
  params.delete('caseKey');
  params.delete('field');
  const next = params.toString();
  const composedHash = next ? `${routeName}?${next}` : routeName;
  if (replace) {
    // replaceState 不触发 hashchange，需手动同步 route 并重渲染（保留滚动与焦点）。
    history.replaceState(null, '', '#' + composedHash);
    route = routeFromHash(window.location.hash);
    render({ preserveScroll: true });
  } else {
    window.location.hash = composedHash;
  }
}

function clearAnnojointAtlasFilters() {
  const parsed = parseHashRoute(window.location.hash);
  const params = parsed.params;
  const routeName = (parsed.route === 'entry' || parsed.route === 'sequence') ? parsed.route : 'annojoin-atlas';
  ['q', 'rnaFamily', 'probeType', 'pdbId', 'motif', 'structureClass', 'techniqueFamilies', 'techniqueNames'].forEach((key) => params.delete(key));
  params.set('page', '1');
  params.delete('caseId');
  params.delete('caseKey');
  params.delete('field');
  const next = params.toString();
  window.location.hash = next ? `${routeName}?${next}` : routeName;
}

function toggleAnnojointAtlasTechnique(kind, value) {
  // kind = 'techniqueFamilies' | 'techniqueNames'; value = the Probing category id or technique name.
  const parsed = parseHashRoute(window.location.hash);
  const params = parsed.params;
  const routeName = (parsed.route === 'entry' || parsed.route === 'sequence') ? parsed.route : 'annojoin-atlas';
  const current = params.getAll(kind);
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  params.delete(kind);
  for (const v of next) params.append(kind, v);
  params.set('page', '1');
  params.delete('caseId');
  params.delete('caseKey');
  params.delete('field');
  const nextQs = params.toString();
  window.location.hash = nextQs ? `${routeName}?${nextQs}` : routeName;
}

function setAnnojointAtlasQuery(query) {
  setAnnojointAtlasFilter('q', query, { replace: true });
}

function revealEntryGroupInTable(groupId) {
  requestAnimationFrame(() => {
    const tableWrap = document.querySelector('.entry-table-page .entry-table-wrap');
    const target = [...document.querySelectorAll('.entry-table-page [data-entry-group-toggle]')]
      .find((button) => button.getAttribute('data-entry-group-toggle') === groupId);
    const targetRow = target?.closest('tr');
    if (!tableWrap || !targetRow || tableWrap.scrollHeight <= tableWrap.clientHeight) return;

    // Move only the table viewport. scrollIntoView() would also move the
    // document and make the surrounding page jump while a group is opened.
    const wrapRect = tableWrap.getBoundingClientRect();
    const rowRect = targetRow.getBoundingClientRect();
    const rowTop = tableWrap.scrollTop + rowRect.top - wrapRect.top;
    const desiredTop = rowTop - Math.max(16, (tableWrap.clientHeight - rowRect.height) * 0.28);
    const maxTop = tableWrap.scrollHeight - tableWrap.clientHeight;
    tableWrap.scrollTop = Math.max(0, Math.min(desiredTop, maxTop));
  });
}

// entry 表折叠：切换某个分组 id（parent:<id> / child:<id>）的展开状态，整页重渲染。
function toggleEntryGroup(groupId) {
  if (!groupId) return;
  if (route === 'entry' && entryTableViewportHeight === null) {
    const tableWrap = document.querySelector('.entry-table-page .entry-table-wrap');
    if (tableWrap) entryTableViewportHeight = Math.round(tableWrap.getBoundingClientRect().height);
  }
  const isExpanding = !expandedEntryGroupIds.has(groupId);
  if (!isExpanding) expandedEntryGroupIds.delete(groupId);
  else expandedEntryGroupIds.add(groupId);
  render({ preserveScroll: true });
  if (isExpanding && route === 'entry') revealEntryGroupInTable(groupId);
}

function getFilteredEntryRows() {
  if (!Array.isArray(entryTableState)) return [];
  return filterEntryRowsByTechniqueSelection(entryTableState, entryTechniqueSelection);
}

function toggleEntryTechnique(kind, value) {
  if (!value) return;
  entryTechniqueSelection = toggleTechniqueSelection(entryTechniqueSelection, kind, value);
  render({ preserveScroll: true });
}

function bindEntryExportLink() {
  const link = document.getElementById('export-entry');
  if (!link || !Array.isArray(entryTableState)) return;
  const signature = JSON.stringify({
    families: [...entryTechniqueSelection.families].sort(),
    techniques: [...entryTechniqueSelection.techniques].sort()
  });
  if (!entryExportObjectUrl || signature !== entryExportSignature) {
    if (entryExportObjectUrl) URL.revokeObjectURL(entryExportObjectUrl);
    const payload = buildEntryExport(getFilteredEntryRows());
    entryExportObjectUrl = URL.createObjectURL(new Blob(
      [JSON.stringify(payload)],
      { type: 'application/json;charset=utf-8' }
    ));
    entryExportSignature = signature;
  }
  link.href = entryExportObjectUrl;
}

function toggleAnnojointAtlasGroup(groupId) {
  if (expandedAnnojointGroupIds.has(groupId)) expandedAnnojointGroupIds.delete(groupId);
  else expandedAnnojointGroupIds.add(groupId);
  render({ preserveScroll: true });
}

function allAnnojointAtlasGroupIds() {
  const groups = buildAnnojointTableGroups(currentAnnojointAtlasState().rows);
  return groups.flatMap((parent) => [
    `parent:${parent.id}`,
    ...parent.children.map((child) => `child:${child.id}`)
  ]);
}

function toggleAnnojointAtlasGroupLimit(groupId) {
  if (uncappedAnnojointGroupIds.has(groupId)) uncappedAnnojointGroupIds.delete(groupId);
  else uncappedAnnojointGroupIds.add(groupId);
  render({ preserveScroll: true });
}

const DOWNLOAD_GEO_SERIES = Object.freeze([
  'GSE22393', 'GSE45803', 'GSE54106', 'GSE67667', 'GSE97609', 'GSE103421',
  'GSE110516', 'GSE111962', 'GSE118309', 'GSE118387', 'GSE122286', 'GSE132099',
  'GSE140048', 'GSE146952', 'GSE149767', 'GSE151327', 'GSE154171', 'GSE158052',
  'GSE189259', 'GSE226865', 'GSE239954', 'GSE246246', 'GSE250290', 'GSE254361',
  'GSE255779', 'GSE255783', 'GSE262014', 'GSE262888', 'GSE266263', 'GSE266872',
  'GSE270001', 'GSE271825', 'GSE278422', 'GSE285333', 'GSE285334', 'GSE286293',
  'GSE288618', 'GSE302505', 'GSE310313', 'GSE331520', 'GSE338022',
]);

function renderDownloadGeoSeries() {
  return DOWNLOAD_GEO_SERIES.map((accession) => `<a
    class="download-geo-series-link"
    href="https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${encodeURIComponent(accession)}"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="${escapeHtml(accession)} on NCBI GEO">${escapeHtml(accession)}</a>`).join('');
}

function downloadPage() {
  return `${renderBundleHeader()}
  <main class="page-download" aria-label="Download">
    <section class="card bundle-wide-card download-page-card">
      <header class="page-card-heading">
        <h1>Download</h1>
        <p class="download-page-intro">Browse original records in their authoritative repositories or download FoldBridge-organized registries for downstream training.</p>
      </header>
      <div class="download-center-grid">
        <section class="download-center-section download-center-section--training">
          <div class="download-center-heading">
            <div>
              <h2>Processed data</h2>
              <p>Download the chain-aligned profile catalog, reactivity registration, and PDB residue alignment.</p>
            </div>
          </div>
          <div class="download-center-actions">
            <a class="download-center-button" href="https://foldbridge.sunhao.uk/training-data/profiles/" target="_blank" rel="noopener noreferrer">Profiles</a>
            <a class="download-center-button" href="#pdb-downloads">PDB</a>
            <a class="download-center-button" href="https://foldbridge.sunhao.uk/training-data/reactivity/" target="_blank" rel="noopener noreferrer">Reactivity registration</a>
            <a class="download-center-button" href="https://foldbridge.sunhao.uk/training-data/alignment/" target="_blank" rel="noopener noreferrer">Alignment</a>
          </div>
        </section>
        <section class="download-center-section download-center-section--raw-data">
          <div class="download-center-heading">
            <div>
              <h2>Raw data</h2>
              <p>Access original records from RMDB, RASP, and the GEO datasets represented in FoldBridge.</p>
            </div>
          </div>
          <div class="download-center-actions">
            <a class="download-center-button" href="https://rmdb.stanford.edu/about/#download-all-data" target="_blank" rel="noopener noreferrer">RMDB downloads</a>
            <a class="download-center-button" href="https://rasp2.zhanglab.net/download/" target="_blank" rel="noopener noreferrer">RASP downloads</a>
            <details class="download-geo-disclosure" data-geo-disclosure="raw-data-geo">
              <summary class="download-center-button">
                <span class="download-geo-disclosure-show">GEO datasets (41)</span>
              </summary>
            </details>
          </div>
          <nav class="download-geo-series-links raw-data-geo-panel" data-geo-panel="raw-data-geo" aria-label="NCBI GEO Series downloads" hidden>
            ${renderDownloadGeoSeries()}
          </nav>
        </section>
      </div>
    </section>
  </main>`;
}

const PDB_DOWNLOAD_PAGE_SIZE = 48;

function getPdbDownloadRecords(rows = []) {
  const byId = new Map();
  rows.forEach((row) => {
    const pdbId = String(row?.pdbId || '').trim().toUpperCase();
    if (!pdbId) return;
    const existing = byId.get(pdbId);
    if (existing) {
      existing.chainCount += 1;
      return;
    }
    byId.set(pdbId, {
      pdbId,
      molecule: String(row?.sciName || '').trim(),
      chainCount: 1
    });
  });
  return [...byId.values()].sort((a, b) => a.pdbId.localeCompare(b.pdbId));
}

function renderPdbDownloadsPage() {
  if (!Array.isArray(entryTableState)) {
    if (entryTableState !== 'loading') loadEntryTable();
    const message = entryTableState === 'error'
      ? 'The PDB catalogue could not be loaded. Refresh to try again.'
      : 'Loading the PDB catalogue…';
    return `${renderBundleHeader()}
      <main class="page-download page-pdb-downloads" aria-label="PDB CIF downloads">
        <section class="card bundle-wide-card pdb-download-page-card">
          <header class="page-card-heading">
            <h1>PDB CIF downloads</h1>
            <p class="pdb-download-intro">${message}</p>
          </header>
        </section>
      </main>`;
  }

  const allRecords = getPdbDownloadRecords(entryTableState);
  const query = pdbDownloadQuery.trim().toUpperCase();
  const filteredRecords = query
    ? allRecords.filter((record) => record.pdbId.includes(query) || record.molecule.toUpperCase().includes(query))
    : allRecords;
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PDB_DOWNLOAD_PAGE_SIZE));
  const page = Math.min(Math.max(1, pdbDownloadPage), totalPages);
  const pageRecords = filteredRecords.slice((page - 1) * PDB_DOWNLOAD_PAGE_SIZE, page * PDB_DOWNLOAD_PAGE_SIZE);
  const list = pageRecords.map((record) => {
    const pdbId = escapeHtml(record.pdbId);
    const cifUrl = `https://files.rcsb.org/download/${encodeURIComponent(record.pdbId)}.cif`;
    const detailLabel = record.molecule ? escapeHtml(record.molecule) : `${record.chainCount} chain${record.chainCount === 1 ? '' : 's'} in FoldBridge`;
    return `<li class="pdb-download-item">
      <div class="pdb-download-record">
        <strong>${pdbId}</strong>
        <span>${detailLabel}</span>
      </div>
      <a class="pdb-download-cif-link" href="${cifUrl}" target="_blank" rel="noopener noreferrer" aria-label="Download ${pdbId} as CIF from RCSB">CIF</a>
    </li>`;
  }).join('');
  const resultLabel = query
    ? `${filteredRecords.length.toLocaleString()} matching structures`
    : `${allRecords.length.toLocaleString()} structures`;

  return `${renderBundleHeader()}
    <main class="page-download page-pdb-downloads" aria-label="PDB CIF downloads">
      <section class="card bundle-wide-card pdb-download-page-card">
        <header class="page-card-heading">
          <a class="pdb-download-back-link" href="#download">← Back to Download</a>
          <h1>PDB CIF downloads</h1>
          <p class="pdb-download-intro">Download the structure CIF for any PDB record represented in FoldBridge. Files are delivered directly by RCSB PDB.</p>
        </header>
        <div class="pdb-download-toolbar">
          <label class="pdb-download-search-label" for="pdb-download-search">Find a PDB ID or molecule</label>
          <input id="pdb-download-search" type="search" value="${escapeHtml(pdbDownloadQuery)}" placeholder="e.g. 5HC9" autocomplete="off" />
          <p class="pdb-download-count" aria-live="polite">${resultLabel}</p>
        </div>
        <ul class="pdb-download-list" aria-label="PDB CIF files">${list || '<li class="pdb-download-empty">No PDB records match this search.</li>'}</ul>
        ${filteredRecords.length > PDB_DOWNLOAD_PAGE_SIZE ? `<nav class="pdb-download-pagination" aria-label="PDB download pages">
          <button type="button" class="pdb-download-page-button" data-pdb-download-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button>
          <span>Page ${page} of ${totalPages}</span>
          <button type="button" class="pdb-download-page-button" data-pdb-download-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>Next</button>
        </nav>` : ''}
      </section>
    </main>`;
}

function searchPage() {
  const params = searchParamsFromHash(window.location.hash);
  const query = params.get('q') ?? '';
  const filters = filtersFromSearchParams(params);
  const activeTags = Array.isArray(filters.tag) ? filters.tag : filters.tag ? [filters.tag] : [];
  const activeType = filters.type ?? '';

  return `${renderBundleHeader()}
  <main class="page-detail page-browse page-search">
    <section class="card bundle-wide-card site-search-card">
      <div class="site-search-header">
        <div class="site-search-title-row">
          <h1>Search</h1>
        </div>
      </div>
      <form class="site-search-form" id="site-search-form">
        <div class="site-search-input-wrap">
          <input
            id="site-search-input"
            class="site-search-input"
            type="search"
            placeholder="Search probing methods, PDB ID, molecule name..."
            value="${escapeHtml(query)}"
            aria-label="Search query"
          />
          <button type="submit" class="site-search-submit-icon" aria-label="Search">
            <img src="./src/assets/search.svg" alt="" aria-hidden="true" />
          </button>
        </div>
        <button id="save-search-query" type="button" class="download-outline-btn site-search-save-button">Save search</button>
      </form>
      <div class="site-search-saved-actions">
        <div id="site-search-saved" class="site-search-saved" aria-label="Saved searches"></div>
      </div>
      <div class="site-search-active">
        ${activeType ? `<span class="chip">type: ${escapeHtml(activeType)}</span>` : ''}
        ${activeTags.map((tag) => `<span class="chip">tag: ${escapeHtml(tag)}</span>`).join('')}
      </div>
    </section>

    <section class="site-search-layout bundle-wide-card">
      <aside class="card site-search-filter-card">
        <h2>Filters</h2>
        <div id="site-search-filters" class="site-search-filters">
          <span class="mini-note">Loading filters...</span>
        </div>
      </aside>
      <section class="card site-search-results-card">
        <div id="site-search-summary" class="mini-note">Loading search index...</div>
        <div id="site-search-results" class="site-search-results"></div>
      </section>
    </section>
  </main>`;
}


function downloadStructuresPage() {
  return `${renderBundleHeader()}
  <main class="page-download">
    <section class="card bundle-wide-card">
      <h1>Structure</h1>
      <p>Structure-linked downloads and related assets are collected here.</p>
    </section>
  </main>`;
}

function publicationsPage() {
  const headers = Array.from({ length: 10 }, (_, i) => `<th>Column ${i + 1}</th>`).join('');
  const rows = Array.from({ length: 5 }, () => `
    <tr>
      ${Array.from({ length: 10 }, () => '<td>&nbsp;</td>').join('')}
    </tr>
  `).join('');

  return `${renderBundleHeader()}
  <main class="page-publications">
    <section class="card bundle-wide-card">
      <h1>Publications Page</h1>
      <table class="structure-table">
        <thead>
          <tr>${headers}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
  </main>`;
}

function helpPage() {
  const helpCached = helpContentStore.peek();
  if (!helpCached && helpContentState !== 'loading' && helpContentState !== 'error') loadHelpContent();
  return `${renderBundleHeader()}<main class="page-detail">${renderHelpPage(helpCached)}</main>`;
}

function statsPage() {
  if (siteStatsState.status === 'idle') loadSiteStats();
  if (probingArticleIndexState === null) loadProbingArticleIndex();
  const dashboardView = buildDashboardViewModel(siteStatsState, probingArticleIndexState);
  return `${renderBundleHeader()}<main class="page-detail">${renderStatsPage({
    dashboardView,
    rows: siteStatsState.rows || [],
    filters: statsDashboardFilters
  })}</main>`;
}

// ANNOJOIN 置信度科普页：解释主表 Confidence distribution 列里 A/B/C/D 族、
// LSS 召回层级（STRONG/MODERATE/WEAK/...）、以及 RASP "not active" 的含义。
function annojoinConfidencePage() {
  return `${renderBundleHeader()}
  <main class="page-annojoin-confidence annojoin-confidence-article">
    <section class="annojoin-confidence-article-head">
      <p class="technology-kicker">ANNOJOIN · Confidence guide</p>
      <h1>Reading the ANNOJOIN confidence labels</h1>
      <p class="pdb-case-lede">Every confidence label on the master table is two words doing two different jobs. The first word
        is a <strong>measurement family</strong> — it tells you <em>which physical quantity</em> the experiment measured. The
        second word is a <strong>calibrated recall tier</strong> — it tells you <em>how reliably</em> that evidence recovers the
        structure actually deposited in the PDB, after we test it against chance. Read it as
        <code>&lt;measurement family&gt; &lt;calibrated recall tier&gt;</code>. The family is not a grade: a bare family letter
        promises nothing about strength — <code>A</code> is not "better" than <code>D</code>, it just means a different
        instrument was pointed at the molecule. All of the strength lives in the tier, and the tier has to be earned.</p>
      <p><a class="download-outline-btn" href="#annojoin-atlas">Back to the master table</a></p>
    </section>

    <section class="annojoin-confidence-article-body">
      <h2>What a confidence label encodes</h2>
      <div class="annojoin-confidence-plain">
        <p>Take a badge like <span class="annojoin-confidence-badge"><span class="annojoin-confidence-badge-family">D</span><span class="annojoin-confidence-badge-tier">MODERATE</span></span> and split it down the middle. The <code>D</code> is the
          <strong>family</strong> — the kind of measurement. Here it means the experiment reported solvent accessibility of the
          RNA backbone. That is all the letter says; it does not mean the evidence is weak, broad, or unfiltered. The
          <code>MODERATE</code> is the <strong>tier</strong> — the verdict on how well that evidence matches the deposited
          structure once we have checked it against chance and a handful of quality gates. A family letter on its own tells you
          what was measured; you always need the tier next to it to know how strong the support is.</p>
      </div>
      <figure class="annojoin-confidence-figure">
        <svg viewBox="0 0 520 220" role="img" aria-label="Anatomy of a confidence badge: family zone plus calibrated recall tier zone">
          <g transform="translate(150,28)">
            <rect x="0" y="0" width="220" height="56" rx="28" fill="var(--surface)" stroke="var(--border)" stroke-width="1.5"/>
            <path d="M 28 0 L 110 0 L 110 56 L 28 56 A 28 28 0 0 1 28 0 Z" fill="var(--primarySoft)"><title>Family zone: which physical quantity was measured</title></path>
            <path d="M 110 0 L 192 0 A 28 28 0 0 1 192 56 L 110 56 Z" fill="var(--accentSoft)"><title>Tier zone: calibrated recall reliability</title></path>
            <line x1="110" y1="4" x2="110" y2="52" stroke="var(--border)" stroke-width="1"/>
            <text x="69" y="35" text-anchor="middle" font-size="22" font-weight="700" fill="var(--textPrimary)">D</text>
            <text x="151" y="35" text-anchor="middle" font-size="18" font-weight="700" fill="var(--textPrimary)">MODERATE</text>
          </g>
          <line x1="219" y1="88" x2="219" y2="132" stroke="var(--border)" stroke-width="1.2"/>
          <line x1="219" y1="132" x2="130" y2="132" stroke="var(--border)" stroke-width="1.2"/>
          <line x1="301" y1="88" x2="301" y2="132" stroke="var(--border)" stroke-width="1.2"/>
          <line x1="301" y1="132" x2="390" y2="132" stroke="var(--border)" stroke-width="1.2"/>
          <g transform="translate(8,134)">
            <rect x="0" y="0" width="244" height="70" rx="10" fill="var(--primarySoft)" stroke="var(--border)" stroke-width="1"/>
            <text x="14" y="24" font-size="12" font-weight="700" fill="var(--textPrimary)">FAMILY = D</text>
            <text x="14" y="44" font-size="11.5" fill="var(--textPrimary)">which physical quantity was</text>
            <text x="14" y="60" font-size="11.5" fill="var(--textPrimary)">measured (here: SASA)</text>
          </g>
          <g transform="translate(268,134)">
            <rect x="0" y="0" width="244" height="70" rx="10" fill="var(--accentSoft)" stroke="var(--border)" stroke-width="1"/>
            <text x="14" y="24" font-size="12" font-weight="700" fill="var(--textPrimary)">TIER = MODERATE</text>
            <text x="14" y="44" font-size="11.5" fill="var(--textPrimary)">how reliably it recovers the</text>
            <text x="14" y="60" font-size="11.5" fill="var(--textPrimary)">deposited structure after calibration</text>
          </g>
        </svg>
        <figcaption>A confidence label reads <strong>family + tier</strong>. The family letter names the physical quantity that was measured and promises nothing about strength; the tier names how reliably that evidence recovers the deposited structure after calibration.</figcaption>
      </figure>
      <div class="annojoin-confidence-deep">
        <p class="annojoin-confidence-deep-label">How it's computed</p>
        <p>LSS (Local Structure-Signal Support) is computed per <strong>segment</strong>, where a segment is one
          <code>(profile, pdb_id, chain)</code> group: a single reactivity profile mapped onto one chain of one PDB entry. For
          that segment we ask a single question — do the per-residue chemical-probing values agree with the paired/unpaired (or
          geometric) state of the residues in the deposited structure? The family fixes <em>which</em> agreement statistic we
          compute; the tier is the calibrated answer.</p>
      </div>

      <h2>The six measurement families</h2>
      <div class="annojoin-confidence-plain">
        <p>There are six families, one per physical quantity. They are categories of instrument, not a ranking — pick any one
          and you can still land in any tier from STRONG down to NOT_SUPPORTED.</p>
        <ul class="annojoin-confidence-legend">
          <li><strong>A — base-specific chemistry.</strong> Probes that hit the Watson-Crick face of specific bases (DMS, CMCT, Keth-seq). High signal means that base is unpaired.</li>
          <li><strong>B — backbone flexibility.</strong> SHAPE reagents that report 2′-OH flexibility on any of the four bases. High signal means a flexible, likely unpaired residue.</li>
          <li><strong>C — enzymatic, run backwards.</strong> Nucleases like PARS/PARTE where the enzyme cuts <em>paired</em> stems, so the logic is reversed: high signal means paired.</li>
          <li><strong>D — solvent accessibility.</strong> Hydroxyl-radical and related probes (RL-Seq, HRF, Lead-seq, icLASER) that report how exposed the backbone is. More signal should track more exposed surface.</li>
          <li><strong>E — spatial contacts.</strong> Methods (MCA/MOHCA) that report which residue pairs sit close together in 3D. Near equals a hit.</li>
          <li><strong>F — base-pair sets.</strong> Mutate-and-map approaches that infer an entire set of base pairs, scored against the reference pair set.</li>
        </ul>
      </div>
      <figure class="annojoin-confidence-figure">
        <svg viewBox="0 0 720 470" role="img" aria-label="Matrix of six measurement families with physical quantity, statistic and positive-class direction">
          <rect x="8" y="12" width="704" height="44" rx="8" fill="var(--surfaceAlt)" stroke="var(--border)" stroke-width="1"/>
          <text x="52" y="40" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textMuted)">FAMILY</text>
          <text x="215" y="40" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textMuted)">PHYSICAL QUANTITY</text>
          <text x="450" y="40" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textMuted)">STATISTIC</text>
          <text x="640" y="40" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textMuted)">POSITIVE CLASS</text>
          <g>
            <rect x="8" y="64" width="704" height="60" fill="var(--surface)"/>
            <rect x="22" y="78" width="60" height="32" rx="8" fill="var(--primarySoft)" stroke="var(--border)"/>
            <text x="52" y="100" text-anchor="middle" font-size="17" font-weight="700" fill="var(--textPrimary)">A</text>
            <text x="100" y="99" font-size="12.5" fill="var(--textPrimary)">WC-face base-specific (DMS/CMCT/Keth)</text>
            <text x="335" y="99" font-size="12" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">auc_unpaired_vs_paired</text>
            <text x="600" y="99" font-size="12.5" fill="var(--textPrimary)">unpaired</text>
            <text x="668" y="99" font-size="16" font-weight="700" fill="var(--accent)">&#8594;</text>
            <title>Family A: Watson-Crick face base-specific reagents, unpaired-positive</title>
          </g>
          <g>
            <rect x="8" y="124" width="704" height="60" fill="var(--surfaceAlt)"/>
            <rect x="22" y="138" width="60" height="32" rx="8" fill="var(--accentSoft)" stroke="var(--border)"/>
            <text x="52" y="160" text-anchor="middle" font-size="17" font-weight="700" fill="var(--textPrimary)">B</text>
            <text x="100" y="159" font-size="12.5" fill="var(--textPrimary)">SHAPE 2&#8242;-OH flexibility (ACGU)</text>
            <text x="335" y="159" font-size="12" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">auc_unpaired_vs_paired</text>
            <text x="600" y="159" font-size="12.5" fill="var(--textPrimary)">unpaired</text>
            <text x="668" y="159" font-size="16" font-weight="700" fill="var(--accent)">&#8594;</text>
            <title>Family B: SHAPE flexibility proxy, unpaired-positive</title>
          </g>
          <g>
            <rect x="8" y="184" width="704" height="60" fill="var(--surface)"/>
            <rect x="22" y="198" width="60" height="32" rx="8" fill="var(--primarySoft)" stroke="var(--accent)" stroke-width="1.5"/>
            <text x="52" y="220" text-anchor="middle" font-size="17" font-weight="700" fill="var(--textPrimary)">C</text>
            <text x="100" y="214" font-size="12.5" fill="var(--textPrimary)">enzymatic (PARS/PARTE)</text>
            <text x="100" y="232" font-size="10.5" font-weight="700" fill="var(--accent)">REVERSED &#183; V1 cleaves paired stems</text>
            <text x="335" y="219" font-size="12" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">auc_paired_vs_unpaired (1&#8722;AUC)</text>
            <text x="600" y="219" font-size="12.5" fill="var(--textPrimary)">paired</text>
            <text x="654" y="219" font-size="16" font-weight="700" fill="var(--accent)">&#8592;</text>
            <title>Family C: enzymatic, REVERSED direction, paired-positive</title>
          </g>
          <g>
            <rect x="8" y="244" width="704" height="60" fill="var(--surfaceAlt)"/>
            <rect x="22" y="258" width="60" height="32" rx="8" fill="var(--accentSoft)" stroke="var(--accent)" stroke-width="1.5"/>
            <text x="52" y="280" text-anchor="middle" font-size="17" font-weight="700" fill="var(--textPrimary)">D</text>
            <text x="100" y="274" font-size="12.5" fill="var(--textPrimary)">SASA solvent accessibility</text>
            <text x="100" y="292" font-size="10.5" font-weight="700" fill="var(--accent)">DUAL PATH &#183; fallback never STRONG</text>
            <text x="335" y="279" font-size="12" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">spearman(reactivity, sasa)</text>
            <text x="600" y="279" font-size="12.5" fill="var(--textPrimary)">high</text>
            <text x="638" y="279" font-size="15" font-weight="700" fill="var(--accent)">&#8596;</text>
            <text x="660" y="279" font-size="12.5" fill="var(--textPrimary)">high</text>
            <title>Family D: SASA, dual path; Spearman main, AUC pairing-proxy fallback</title>
          </g>
          <g>
            <rect x="8" y="304" width="704" height="60" fill="var(--surface)"/>
            <rect x="22" y="318" width="60" height="32" rx="8" fill="var(--primarySoft)" stroke="var(--border)"/>
            <text x="52" y="340" text-anchor="middle" font-size="17" font-weight="700" fill="var(--textPrimary)">E</text>
            <text x="100" y="339" font-size="12.5" fill="var(--textPrimary)">contact map (MCA/MOHCA)</text>
            <text x="335" y="339" font-size="12" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">contact_pair_auc</text>
            <text x="600" y="339" font-size="12.5" fill="var(--textPrimary)">near = hit</text>
            <title>Family E: contact map, near = hit</title>
          </g>
          <g>
            <rect x="8" y="364" width="704" height="60" fill="var(--surfaceAlt)"/>
            <rect x="22" y="378" width="60" height="32" rx="8" fill="var(--accentSoft)" stroke="var(--border)"/>
            <text x="52" y="400" text-anchor="middle" font-size="17" font-weight="700" fill="var(--textPrimary)">F</text>
            <text x="100" y="399" font-size="12.5" fill="var(--textPrimary)">pair-set F1 (mutate-and-map)</text>
            <text x="335" y="399" font-size="12" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">pair_set_prf</text>
            <text x="600" y="399" font-size="12.5" fill="var(--textPrimary)">F1 inferred vs ref</text>
            <title>Family F: pair-set F1 of inferred vs reference pairs</title>
          </g>
          <rect x="8" y="64" width="704" height="360" fill="none" stroke="var(--border)" stroke-width="1" rx="2"/>
        </svg>
        <figcaption>The six families differ only by <strong>what they measure</strong>, not by quality. C runs <strong>reversed</strong> (enzymatic V1 marks paired stems, so paired is the positive class), and D carries a <strong>dual path</strong> whose pairing-proxy fallback can never reach STRONG.</figcaption>
        <p class="annojoin-confidence-figure-cite">Family anchors — A: Burkhardt et al., eLife 2017 · PMID 28371612 · DOI 10.7554/eLife.22037. B: Siegfried et al., Nat Methods 2014 · PMID 25028896 · DOI 10.1038/nmeth.3029. C: Lockard &amp; Kumar, NAR 1981 · PMID 6269089 · DOI 10.1093/nar/9.13.3001. D: Solayman et al., RNA Biology 2022 · PMID 36369947 · DOI 10.1080/15476286.2022.2145098. E: Cheng et al., eLife 2015 · PMID 26035425 · DOI 10.7554/eLife.07600. F: Cheng et al., PNAS 2017 · PMID 28851837 · DOI 10.1073/pnas.1619897114.</p>
      </figure>
      <div class="annojoin-confidence-deep">
        <p class="annojoin-confidence-deep-label">Per-family detail</p>
        <ul class="annojoin-confidence-legend">
          <li><strong>A — Watson-Crick-face base-specific</strong> (DMS, CMCT, Keth-seq). Statistic <code>auc_unpaired_vs_paired</code>; <strong>unpaired-positive</strong>. Evaluated on targetable bases only — DMS → A, C; CMCT → G, U; Keth-seq → G.</li>
          <li><strong>B — SHAPE 2′-OH flexibility</strong> (all four bases). Statistic <code>auc_unpaired_vs_paired</code>; <strong>unpaired-positive</strong>.</li>
          <li><strong>C — enzymatic, REVERSED</strong> (PARS, PARTE, tNet-RNase-seq). Statistic <code>auc_paired_vs_unpaired</code>, computed as <code>1 − auc_unpaired_vs_paired</code>; <strong>paired-positive</strong>, because RNase V1 cleaves paired stems.</li>
          <li><strong>D — solvent-accessible surface area, dual path</strong> (RL-Seq, HRF, Lead-seq, icLASER). Main path <code>spearman(reactivity, sasa)</code> with high reactivity ↔ high SASA; when SASA is unavailable it falls back to a pairing-proxy <code>auc_unpaired_vs_paired</code> that is tier-capped and <strong>can never reach STRONG</strong>.</li>
          <li><strong>E — residue-residue contact map</strong> (MCA, MOHCA). Statistic <code>contact_pair_auc</code> = P(signal pair is nearer than a decoy pair); <strong>near = hit</strong>.</li>
          <li><strong>F — base-pair set F1</strong> (mutate-and-map). Statistic <code>pair_set_prf</code> → F1 of the inferred base-pair set against the reference, with pairs canonicalised so <code>(i, j)</code> and <code>(j, i)</code> are the same pair.</li>
        </ul>
      </div>

      <h2>The recall tiers and their gates</h2>
      <div class="annojoin-confidence-plain">
        <ul class="annojoin-confidence-legend">
          <li><strong>STRONG</strong> — the evidence reliably recovers the deposited structure and has passed every gate, including a chance test.</li>
          <li><strong>MODERATE</strong> — solid, calibrated agreement that clears a slightly lower bar than STRONG.</li>
          <li><strong>MODERATE_CANDIDATE</strong> — would qualify, but calibration has not run yet, so it is held one step below as a candidate.</li>
          <li><strong>WEAK</strong> — the score is decent but the segment is not self-contained enough to lean on.</li>
          <li><strong>NOT_SUPPORTED</strong> — the score did not survive the chance test; it could be luck.</li>
          <li><strong>DISCORDANT</strong> — the signal points the wrong way or conflicts with the structure.</li>
          <li><strong>UNDERPOWERED</strong> — too few evaluable residues to judge at all.</li>
          <li><strong>NOT_EVALUABLE</strong> — the technology or data could not be resolved to a family, so no score is attempted.</li>
        </ul>
      </div>
      <figure class="annojoin-confidence-figure">
        <svg viewBox="0 0 560 640" role="img" aria-label="STRONG gate decision ladder with fail branches to lower recall tiers">
          <line x1="150" y1="84" x2="150" y2="106" stroke="var(--border)" stroke-width="2"/>
          <line x1="150" y1="154" x2="150" y2="176" stroke="var(--border)" stroke-width="2"/>
          <line x1="150" y1="224" x2="150" y2="246" stroke="var(--border)" stroke-width="2"/>
          <line x1="150" y1="294" x2="150" y2="316" stroke="var(--border)" stroke-width="2"/>
          <line x1="150" y1="364" x2="150" y2="386" stroke="var(--border)" stroke-width="2"/>
          <line x1="150" y1="434" x2="150" y2="456" stroke="var(--border)" stroke-width="2"/>
          <line x1="150" y1="504" x2="150" y2="540" stroke="var(--primary)" stroke-width="2.5"/>
          <g font-size="12.5" fill="var(--textPrimary)" text-anchor="middle">
            <rect x="40" y="56" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="74">n_eval &#8805; 20 (size)</text>
            <rect x="40" y="126" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="144">paired &#8805; 5 &#183; unpaired &#8805; 5</text>
            <rect x="40" y="196" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="214">directional &#8805; 0.70</text>
            <rect x="40" y="266" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="284">permutation RUN</text>
            <rect x="40" y="336" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="354">empirical p &#8804; 0.05</text>
            <rect x="40" y="406" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="424">conflict &#8804; 0.25</text>
            <rect x="40" y="476" width="220" height="28" rx="7" fill="var(--surfaceAlt)" stroke="var(--border)"/><text x="150" y="494">partner_inside &#8805; 0.70</text>
          </g>
          <rect x="60" y="540" width="180" height="40" rx="20" fill="var(--primary)"/>
          <text x="150" y="565" text-anchor="middle" font-size="16" font-weight="700" fill="var(--surface)">STRONG</text>
          <g font-size="11" font-weight="700" text-anchor="middle">
            <line x1="260" y1="70" x2="400" y2="70" stroke="var(--textMuted)" stroke-width="1.4" stroke-dasharray="4 3"/>
            <rect x="400" y="56" width="148" height="28" rx="7" fill="var(--accentSoft)"/><text x="474" y="74" fill="var(--textPrimary)">MODERATE (n &#8805; 15)</text>
            <line x1="260" y1="210" x2="400" y2="210" stroke="var(--textMuted)" stroke-width="1.4" stroke-dasharray="4 3"/>
            <rect x="400" y="196" width="148" height="28" rx="7" fill="var(--accentSoft)"/><text x="474" y="214" fill="var(--textPrimary)">MODERATE (&#8805;0.65)</text>
            <line x1="260" y1="350" x2="400" y2="350" stroke="var(--textMuted)" stroke-width="1.4" stroke-dasharray="4 3"/>
            <rect x="400" y="336" width="148" height="28" rx="7" fill="var(--textMuted)"/><text x="474" y="354" fill="var(--surface)">NOT_SUPPORTED</text>
            <line x1="260" y1="420" x2="400" y2="420" stroke="var(--textMuted)" stroke-width="1.4" stroke-dasharray="4 3"/>
            <rect x="400" y="406" width="148" height="28" rx="7" fill="var(--accentSoft)"/><text x="474" y="424" fill="var(--textPrimary)">DISCORDANT</text>
            <line x1="260" y1="490" x2="400" y2="490" stroke="var(--textMuted)" stroke-width="1.4" stroke-dasharray="4 3"/>
            <rect x="400" y="476" width="148" height="28" rx="7" fill="var(--primarySoft)"/><text x="474" y="494" fill="var(--textPrimary)">WEAK</text>
          </g>
          <text x="150" y="32" text-anchor="middle" font-size="13" font-weight="700" fill="var(--textPrimary)">STRONG gate spine (all must pass)</text>
          <text x="20" y="600" font-size="10.5" fill="var(--textMuted)">Footnote: the spine shows STRONG gates. Relaxing the size gate to n_eval &#8805; 15 (with the</text>
          <text x="20" y="613" font-size="10.5" fill="var(--textMuted)">lower MODERATE cut-points) yields MODERATE; below n_eval 15 it is UNDERPOWERED.</text>
          <text x="20" y="626" font-size="10.5" fill="var(--textMuted)">Family D main path uses discordance_floor = 0.0 (Spearman ranges &#8722;1..1).</text>
        </svg>
        <figcaption>STRONG is granted only when every gate on the spine passes. Each failure routes the segment to a lower tier; a strong-looking score that fails permutation drops to NOT_SUPPORTED, and an AUC-pass that is not self-contained drops to WEAK.</figcaption>
      </figure>
      <div class="annojoin-confidence-deep">
        <p class="annojoin-confidence-deep-label">Exact gates</p>
        <p><strong>STRONG</strong> requires all of: n_eval ≥ 20, n_paired ≥ 5, n_unpaired ≥ 5, directional metric ≥ 0.70,
          permutation status = RUN, empirical p ≤ 0.05, conflict ≤ 0.25, and partner_inside ≥ 0.70. <strong>MODERATE</strong>
          relaxes these to n_eval ≥ 15, directional ≥ 0.65, p ≤ 0.10, conflict ≤ 0.35, partner_inside ≥ 0.50. The "directional
          metric" is the family's own positive-class statistic (for Family C the reversed <code>1 − AUC</code>; for Family D's
          main path the Spearman correlation). Because Spearman lives on −1..1 with no-correlation at 0 (not an AUC centred at
          0.5), Family D's main path sets <code>discordance_floor = 0.0</code> — only a genuinely negative correlation reads as
          DISCORDANT, while a small positive correlation below the support band reads as NOT_SUPPORTED.</p>
      </div>

      <h2>Where the thresholds come from</h2>
      <div class="annojoin-confidence-plain">
        <p>Be clear about one thing: the A/B/C cut-points of <strong>0.70 / 0.65 / 0.55 are not thresholds that any paper
          published.</strong> No study reported "an AUC of 0.70 means a strong match." External benchmarks establish only two
          things — first, that the metric itself works (paired and unpaired residues really are separable by AUC/ROC); second,
          that the STRONG tier is <em>attainable</em> (SHAPE-directed modeling recovers more than 90% of base pairs). The
          specific numeric cut-points are RC3 operating values, set as reasonable defaults and waiting on calibration. That
          honesty is exactly why the calibration step in the next section exists.</p>
      </div>
      <figure class="annojoin-confidence-figure">
        <svg viewBox="0 0 720 380" role="img" aria-label="Three-grade threshold provenance ladder from measured to operating values">
          <line x1="40" y1="30" x2="40" y2="350" stroke="var(--border)" stroke-width="1.5"/>
          <path d="M 40 350 L 36 340 L 44 340 Z" fill="var(--border)"/>
          <text x="30" y="44" font-size="11" font-weight="700" fill="var(--textPrimary)" transform="rotate(-90 30 44)" text-anchor="end">measured</text>
          <text x="30" y="340" font-size="11" font-weight="700" fill="var(--textMuted)" transform="rotate(-90 30 340)" text-anchor="start">operating</text>
          <g>
            <rect x="90" y="30" width="590" height="92" rx="10" fill="var(--primarySoft)" stroke="var(--border)"/>
            <rect x="90" y="30" width="8" height="92" rx="4" fill="var(--primary)"/>
            <text x="112" y="56" font-size="14" font-weight="700" fill="var(--textPrimary)">LITERATURE_SUPPORTED</text>
            <text x="112" y="78" font-size="12" fill="var(--textPrimary)">Band set directly by measured values. Rep: RL-Seq &#183; Solayman 2022</text>
            <text x="112" y="98" font-size="11.5" fill="var(--textMuted)">ribose-ASA Spearman 0.39&#8211;0.57 sets Family D&#8217;s 0.50/0.40/0.30</text>
            <circle cx="638" cy="76" r="26" fill="var(--surface)" stroke="var(--primary)" stroke-width="2"/>
            <text x="638" y="83" text-anchor="middle" font-size="22" font-weight="700" fill="var(--textPrimary)">1</text>
            <title>LITERATURE_SUPPORTED: exactly 1 technology (RL-Seq)</title>
          </g>
          <g>
            <rect x="90" y="140" width="555" height="92" rx="10" fill="var(--surfaceAlt)" stroke="var(--border)"/>
            <rect x="90" y="140" width="8" height="92" rx="4" fill="var(--accent)"/>
            <text x="112" y="166" font-size="14" font-weight="700" fill="var(--textPrimary)">LITERATURE_INFORMED</text>
            <text x="112" y="188" font-size="12" fill="var(--textPrimary)">Benchmark proves STRONG attainable; exact cut-point not published.</text>
            <text x="112" y="208" font-size="11.5" fill="var(--textMuted)">SHAPE, SHAPE-MaP, DMS, DMS-MaPseq, HRF, Lead-seq, icLASER &#8230;</text>
            <circle cx="603" cy="186" r="26" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>
            <text x="603" y="193" text-anchor="middle" font-size="22" font-weight="700" fill="var(--textPrimary)">10</text>
            <title>LITERATURE_INFORMED: 10 technologies</title>
          </g>
          <g>
            <rect x="90" y="250" width="520" height="92" rx="10" fill="var(--surface)" stroke="var(--border)"/>
            <rect x="90" y="250" width="8" height="92" rx="4" fill="var(--textMuted)"/>
            <text x="112" y="276" font-size="14" font-weight="700" fill="var(--textMuted)">OPERATING_VALUE_PENDING_CALIBRATION</text>
            <text x="112" y="298" font-size="12" fill="var(--textPrimary)">No published discrimination metric &#8212; beta operating value.</text>
            <text x="112" y="318" font-size="11.5" fill="var(--textMuted)">PARS, PARTE, tNet-RNase-seq &#8230; (no AUC published)</text>
            <circle cx="568" cy="296" r="26" fill="var(--surface)" stroke="var(--textMuted)" stroke-width="2"/>
            <text x="568" y="303" text-anchor="middle" font-size="22" font-weight="700" fill="var(--textMuted)">23</text>
            <title>OPERATING_VALUE_PENDING_CALIBRATION: 23 technologies</title>
          </g>
        </svg>
        <figcaption>Of 34 technologies only <strong>one</strong> (RL-Seq) has a literature-set band; 10 are literature-informed and 23 remain RC3 operating values pending calibration. This is why permutation calibration exists: most cut-points must earn the right to ever emit STRONG.</figcaption>
        <p class="annojoin-confidence-figure-cite">Solayman et al., RNA Biology 2022 · PMID 36369947 · DOI 10.1080/15476286.2022.2145098</p>
      </figure>
      <div class="annojoin-confidence-deep">
        <p class="annojoin-confidence-deep-label">The three honesty grades</p>
        <ul class="annojoin-confidence-legend">
          <li><strong>LITERATURE_SUPPORTED</strong> — the band is set directly by measured literature values. <strong>Exactly one technology qualifies: RL-Seq</strong> (Family D). Its ribose-ASA Spearman of 0.39–0.57 (16S 0.53–0.57 / 23S 0.47–0.50 / 5S 0.39–0.52, vs PDB 4V7T; Solayman et al., RNA Biology 2022) directly sets Family D's 0.50 / 0.40 / 0.30 band.</li>
          <li><strong>LITERATURE_INFORMED</strong> — a related benchmark makes STRONG attainable and shows the metric is sound, but the exact cut-point is not published. This applies to exactly ten technologies: DMS, DMS-seq, DMS-MaPseq, Structure-Seq, Structure-seq2, SHAPE, SHAPE-MaP, HRF, Lead-seq, icLASER. (This is <em>not</em> "the whole DMS family" or "the whole SHAPE family" — Mod-seq, DIM-2P-seq, CMC, CMCT, Keth-seq, NMIA, 1M7, BzCN, 2A3, icSHAPE and the rest are operating values.) Anchors: orthogonal DMS reproducibility r ≈ 0.91, &gt;90% base-pair recovery of SHAPE-directed modeling (Siegfried et al., Nat Methods 2014), and the shared SASA reference quantity for HRF/Lead-seq/icLASER.</li>
          <li><strong>OPERATING_VALUE_PENDING_CALIBRATION</strong> — no published discrimination metric; a beta operating value awaiting calibration. This covers the remaining 23 technologies, including the entire Family C set (PARS, PARTE, tNet-RNase-seq), whose <em>direction</em> is mechanistically anchored (RNase V1 cleaves paired stems; Lockard &amp; Kumar, NAR 1981) but for which no discrimination AUC was ever published, plus the contact and pair-set methods and the long tail.</li>
        </ul>
        <p>Because most cut-points are operating values rather than published thresholds, calibration is what earns a segment the
          right to ever be called STRONG.</p>
      </div>

      <h2>Why "candidate" exists: permutation calibration</h2>
      <div class="annojoin-confidence-plain">
        <p>A high score can just be luck. If a segment only has a handful of residues, a strong-looking AUC might appear by
          chance. To guard against that, we keep the reactivity values exactly as measured but reshuffle which residues are
          labelled paired versus unpaired, many times over, and watch how often a shuffled (random) labelling scores as well as
          the real one. If the real score rarely beats the shuffles, the support is real. If chance reproduces it easily, the
          score does not earn its tier.</p>
      </div>
      <figure class="annojoin-confidence-figure">
        <svg viewBox="0 0 640 320" role="img" aria-label="Permutation calibration: fixed reactivity, shuffled labels, null distribution with observed marker">
          <text x="70" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textPrimary)">reactivity (fixed)</text>
          <g>
            <rect x="40" y="44" width="60" height="220" rx="8" fill="var(--surfaceAlt)" stroke="var(--border)"/>
            <rect x="58" y="60" width="24" height="18" rx="3" fill="var(--primary)"/>
            <path d="M 63 60 V 53 a 7 7 0 0 1 14 0 V 60" fill="none" stroke="var(--primary)" stroke-width="2.5"/>
            <g font-size="11" style="font-family:Arial,sans-serif" fill="var(--textPrimary)" text-anchor="middle">
              <text x="70" y="104">0.81</text><text x="70" y="128">0.12</text><text x="70" y="152">0.64</text>
              <text x="70" y="176">0.05</text><text x="70" y="200">0.77</text><text x="70" y="224">0.21</text><text x="70" y="248">0.58</text>
            </g>
          </g>
          <text x="190" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textPrimary)">paired/unpaired (shuffled)</text>
          <g>
            <rect x="160" y="44" width="60" height="220" rx="8" fill="var(--surface)" stroke="var(--border)"/>
            <g font-size="11" font-weight="700" fill="var(--accent)" text-anchor="middle">
              <text x="190" y="104">U</text><text x="190" y="128">P</text><text x="190" y="152">P</text>
              <text x="190" y="176">U</text><text x="190" y="200">P</text><text x="190" y="224">U</text><text x="190" y="248">P</text>
            </g>
          </g>
          <g fill="none" stroke="var(--accent)" stroke-width="1.6">
            <path d="M 226 104 C 256 96 256 132 226 128"/>
            <path d="M 226 152 C 256 144 256 204 226 200"/>
            <path d="M 226 224 C 252 216 252 256 226 248"/>
          </g>
          <text x="258" y="160" font-size="11" fill="var(--textMuted)" transform="rotate(90 258 160)" text-anchor="middle">&#215; 1000</text>
          <text x="470" y="30" text-anchor="middle" font-size="12" font-weight="700" fill="var(--textPrimary)">null distribution (schematic)</text>
          <line x1="350" y1="250" x2="620" y2="250" stroke="var(--border)" stroke-width="1.5"/>
          <line x1="350" y1="60" x2="350" y2="250" stroke="var(--border)" stroke-width="1.5"/>
          <g fill="var(--primarySoft)" stroke="var(--border)" stroke-width="0.5">
            <rect x="356" y="242" width="20" height="8"/><rect x="378" y="232" width="20" height="18"/>
            <rect x="400" y="216" width="20" height="34"/><rect x="422" y="192" width="20" height="58"/>
            <rect x="444" y="168" width="20" height="82"/><rect x="466" y="154" width="20" height="96"/>
            <rect x="488" y="168" width="20" height="82"/><rect x="510" y="192" width="20" height="58"/>
            <rect x="532" y="216" width="20" height="34"/><rect x="554" y="232" width="20" height="18"/>
            <rect x="576" y="242" width="20" height="8"/>
          </g>
          <line x1="596" y1="70" x2="596" y2="250" stroke="var(--primary)" stroke-width="2.5"/>
          <text x="596" y="64" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--primary)">observed</text>
          <text x="350" y="284" font-size="11.5" style="font-family:Arial,sans-serif" fill="var(--textPrimary)">p = (1 + #{null &#8805; obs}) / (1 + n_perm)</text>
          <text x="350" y="304" font-size="10.5" fill="var(--textMuted)">1000 permutations &#183; seed 12345 &#183; p never zero</text>
        </svg>
        <figcaption>To test whether a score is luck, reactivity values are held fixed while paired/unpaired labels are reshuffled 1000 times to build a null distribution. The histogram is schematic. This label-shuffle applies to A/B/C and Family D&#8217;s pairing-proxy fallback; D&#8217;s SASA-Spearman main path has its own calibration path.</figcaption>
      </figure>
      <div class="annojoin-confidence-deep">
        <p class="annojoin-confidence-deep-label">The chance test</p>
        <p>The empirical p-value is <code>(1 + #{null ≥ observed}) / (1 + n_perm)</code>, with the +1/+1 correction so it is
          <strong>never zero</strong>. The default is 1000 permutations with seed 12345, which makes the calibration
          deterministic and reproducible. While a segment is UNCALIBRATED, a would-be-STRONG (or would-be-MODERATE) result is
          capped down to <strong>MODERATE_CANDIDATE</strong>. Once calibration runs, any segment with p &gt; 0.10 is downgraded
          to <strong>NOT_SUPPORTED</strong>. Scope: this label-shuffle calibration applies to families A, B, C, and Family D's
          pairing-proxy fallback; Family D's SASA-Spearman main path is calibrated by its own path, not by this label shuffle.</p>
      </div>

      <h2>Self-containment</h2>
      <div class="annojoin-confidence-plain">
        <p>A segment is only trustworthy if you can judge it on its own. If a residue is paired, its partner base ideally lives
          inside the same segment, so the agreement we measure is about base pairs we can actually see. When too many partners
          sit <em>outside</em> the segment, the segment is judging pairs it can't fully account for, and we hold it back.</p>
      </div>
      <figure class="annojoin-confidence-figure">
        <svg viewBox="0 0 640 280" role="img" aria-label="Self-containment: base-pair partners inside the segment versus spilling outside">
          <text x="160" y="34" text-anchor="middle" font-size="13" font-weight="700" fill="var(--accent)">&#10003; partners inside segment</text>
          <rect x="52" y="150" width="216" height="40" rx="8" fill="var(--accentSoft)" opacity="0.45"/>
          <g fill="none" stroke="var(--accent)" stroke-width="2.2">
            <path d="M 66 170 Q 160 96 254 170"><title>partner inside segment</title></path>
            <path d="M 92 170 Q 160 116 228 170"><title>partner inside segment</title></path>
            <path d="M 118 170 Q 160 134 202 170"><title>partner inside segment</title></path>
          </g>
          <g fill="var(--surface)" stroke="var(--textMuted)" stroke-width="1.2">
            <circle cx="40" cy="170" r="6"/><circle cx="66" cy="170" r="6"/><circle cx="92" cy="170" r="6"/>
            <circle cx="118" cy="170" r="6"/><circle cx="150" cy="170" r="6"/><circle cx="176" cy="170" r="6"/>
            <circle cx="202" cy="170" r="6"/><circle cx="228" cy="170" r="6"/><circle cx="254" cy="170" r="6"/><circle cx="280" cy="170" r="6"/>
          </g>
          <line x1="320" y1="40" x2="320" y2="230" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 4"/>
          <text x="480" y="34" text-anchor="middle" font-size="13" font-weight="700" fill="var(--textMuted)">&#10007; partner outside segment</text>
          <rect x="362" y="150" width="170" height="40" rx="8" fill="var(--surfaceAlt)" opacity="0.7"/>
          <g fill="none" stroke="var(--accent)" stroke-width="2.2">
            <path d="M 388 170 Q 440 120 492 170"><title>partner inside segment</title></path>
          </g>
          <path d="M 414 170 Q 500 60 600 170" fill="none" stroke="var(--textMuted)" stroke-width="2.2" stroke-dasharray="6 4"><title>partner lies outside the segment &#8212; not self-contained</title></path>
          <g fill="var(--surface)" stroke="var(--textMuted)" stroke-width="1.2">
            <circle cx="362" cy="170" r="6"/><circle cx="388" cy="170" r="6"/><circle cx="414" cy="170" r="6"/>
            <circle cx="440" cy="170" r="6"/><circle cx="466" cy="170" r="6"/><circle cx="492" cy="170" r="6"/>
            <circle cx="518" cy="170" r="6"/><circle cx="548" cy="170" r="6"/><circle cx="574" cy="170" r="6"/>
          </g>
          <circle cx="600" cy="170" r="6" fill="var(--surface)" stroke="var(--textMuted)" stroke-width="1.2" stroke-dasharray="3 2"/>
          <text x="320" y="262" text-anchor="middle" font-size="10.5" fill="var(--textMuted)">STRONG &#8805; 0.70 inside &#183; MODERATE &#8805; 0.50 inside &#183; AUC-pass but &lt; 0.50 &#8594; WEAK (auc_supported_but_not_self_contained)</text>
        </svg>
        <figcaption>A segment is self-contained when its paired residues&#8217; base-pair partners also lie inside the same segment. STRONG needs <strong>partner_inside &#8805; 0.70</strong>, MODERATE <strong>&#8805; 0.50</strong>; an AUC-pass that spills below 0.50 is downgraded to WEAK.</figcaption>
      </figure>
      <div class="annojoin-confidence-deep">
        <p class="annojoin-confidence-deep-label">partner_inside_fraction</p>
        <p><code>partner_inside_fraction</code> is the fraction of evaluable paired residues whose base-pair partner also lies
          inside the same segment. STRONG requires ≥ 0.70 and MODERATE requires ≥ 0.50. A segment that clears its AUC bar but has
          partner_inside &lt; 0.50 is downgraded to <strong>WEAK</strong> with the note
          <code>auc_supported_but_not_self_contained</code>: the signal looks good, but the segment is not self-contained enough
          to stand on.</p>
      </div>

      <h2>What this looks like at scale</h2>
      <div class="annojoin-confidence-plain">
        <p>Put it all together across a full run and the headline is simple: <strong>STRONG is rare and earned.</strong> Most
          segments do not clear the gates, and that is the system working as intended — the bar is high on purpose.</p>
      </div>
      <figure class="annojoin-confidence-figure annojoin-confidence-chart">
        <svg viewBox="0 0 700 380" role="img" aria-label="RASP ABC calibrated tier counts on a log-scaled axis">
          <text x="16" y="28" font-size="14" font-weight="700" fill="var(--textPrimary)">Calibrated recall tiers &#8212; 218,638 segments</text>
          <text x="16" y="46" font-size="11" fill="var(--textMuted)">x-axis: log scale (counts span 283 to 114,591)</text>
          <g stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4">
            <line x1="238" y1="66" x2="238" y2="312"/><line x1="316" y1="66" x2="316" y2="312"/>
            <line x1="394" y1="66" x2="394" y2="312"/><line x1="472" y1="66" x2="472" y2="312"/>
            <line x1="550" y1="66" x2="550" y2="312"/>
          </g>
          <g font-size="10" fill="var(--textMuted)" text-anchor="middle">
            <text x="238" y="328">10</text><text x="316" y="328">100</text><text x="394" y="328">1,000</text>
            <text x="472" y="328">10,000</text><text x="550" y="328">100,000</text>
          </g>
          <line x1="160" y1="66" x2="160" y2="312" stroke="var(--border)" stroke-width="1.5"/>
          <g font-size="11.5" fill="var(--textPrimary)">
            <text x="152" y="84" text-anchor="end" font-weight="700">STRONG</text>
            <rect x="160" y="68" width="191" height="24" rx="3" fill="var(--primary)"><title>STRONG: 283 segments</title></rect>
            <text x="357" y="84" font-weight="700" fill="var(--textPrimary)">283</text>
            <text x="152" y="126" text-anchor="end" font-weight="700">MODERATE</text>
            <rect x="160" y="110" width="240" height="24" rx="3" fill="var(--accent)"><title>MODERATE: 1,191 segments</title></rect>
            <text x="406" y="126" font-weight="700">1,191</text>
            <text x="152" y="168" text-anchor="end" font-weight="700">WEAK</text>
            <rect x="160" y="152" width="333" height="24" rx="3" fill="var(--primarySoft)"><title>WEAK: 18,635 segments</title></rect>
            <text x="499" y="168">18,635</text>
            <text x="152" y="210" text-anchor="end" font-weight="700">DISCORDANT</text>
            <rect x="160" y="194" width="353" height="24" rx="3" fill="var(--accentSoft)"><title>DISCORDANT: 33,876 segments</title></rect>
            <text x="519" y="210">33,876</text>
            <text x="152" y="252" text-anchor="end" font-weight="700">NOT_SUPPORTED</text>
            <rect x="160" y="236" width="395" height="24" rx="3" fill="var(--textMuted)"><title>NOT_SUPPORTED: 114,591 segments</title></rect>
            <text x="561" y="252">114,591</text>
            <text x="152" y="294" text-anchor="end" font-weight="700">UNDERPOWERED</text>
            <rect x="160" y="278" width="367" height="24" rx="3" fill="var(--border)"><title>UNDERPOWERED: 50,062 segments</title></rect>
            <text x="533" y="294">50,062</text>
          </g>
          <text x="16" y="356" font-size="10.5" fill="var(--textMuted)">Log scale keeps the rare earned tiers (STRONG 283) visible beside NOT_SUPPORTED (114,591). STRONG/MODERATE in earned accents; NOT_SUPPORTED/UNDERPOWERED muted.</text>
          <text x="16" y="372" font-size="10" fill="var(--textMuted)">STRONG is rare and earned: 283 of 218,638 segments (0.13%).</text>
        </svg>
        <figcaption>Calibrated recall tiers across the full RASP ABC run. The x-axis is <strong>log-scaled</strong> so the rare earned tiers stay visible against the dominant NOT_SUPPORTED bucket. STRONG accounts for just 283 of 218,638 segments.</figcaption>
        <p class="annojoin-confidence-figure-cite">as of run 2026-06-26, source 133:/data/rasp_abc_lss_run_20260626/cal/abc_lss_calibrated.tsv</p>
      </figure>
      <figure class="annojoin-confidence-figure annojoin-confidence-chart">
        <svg viewBox="0 0 220 220" role="img" aria-label="Family D SASA path: 82.3 percent SASA present versus 17.7 percent pairing-proxy fallback">
          <path d="M 110 30 A 80 80 0 1 1 38.25 74.59 L 65.15 87.87 A 50 50 0 1 0 110 60 Z" fill="var(--primary)"><title>SASA_PRESENT: 82.3% (8,417 segments)</title></path>
          <path d="M 38.25 74.59 A 80 80 0 0 1 110 30 L 110 60 A 50 50 0 0 0 65.15 87.87 Z" fill="var(--accentSoft)"><title>PAIRING_PROXY_FALLBACK: 17.7% (1,812 segments)</title></path>
          <text x="110" y="106" text-anchor="middle" font-size="22" font-weight="700" fill="var(--textPrimary)">82.3%</text>
          <text x="110" y="124" text-anchor="middle" font-size="10.5" fill="var(--textMuted)">SASA present</text>
        </svg>
        <figcaption>Family D evidence path across the full run (10,229 segments).
          <span class="annojoin-confidence-chart-legend">
            <span class="annojoin-confidence-chart-dot" style="background:var(--primary)"></span>SASA_PRESENT 82.3% (8,417)
            &#160;&#160;
            <span class="annojoin-confidence-chart-dot" style="background:var(--accentSoft)"></span>PAIRING_PROXY_FALLBACK 17.7% (1,812)
          </span>
        </figcaption>
        <p class="annojoin-confidence-figure-cite">as of run 2026-06-27, source 130:/home/sunhao/family_d_lss_run_20260627/full/out/def_lss_confidence.tsv</p>
      </figure>

      <h2>"Not active" and merged labels</h2>
      <div class="annojoin-confidence-plain">
        <p><code>RASP: not active</code> does <strong>not</strong> mean the evidence failed. It means the positive-confidence
          track for that source is not yet switched on for public display — think "pending," not "negative" and not
          "unsupported." When it's turned on, you'll see real tiers.</p>
        <p>A compound label like <code>RMDB: A/B/C; RASP: not active</code> appears on merged cases. It simply lists the
          measurement families present across the underlying source cases (here, families A, B and C from RMDB) and notes that
          the RASP track is still pending. The slash-separated letters are an inventory of what was measured, not a combined
          grade. To see how each family and tier breaks down for a specific entry, open the side panel or the case detail page
          from the master table.</p>
      </div>

      <h2>What confidence can never do</h2>
      <div class="annojoin-confidence-plain">
        <p>LSS is a supporting signal, not a verdict. It can nudge ranking and decide whether an entry is eligible for a ranked
          set, but it has hard limits by design.</p>
      </div>
      <div class="annojoin-confidence-caveat">
        <ul class="annojoin-confidence-legend">
          <li>LSS <strong>never proves a full-feature claim</strong> and <strong>never exceeds the <code>claim_ceiling</code></strong> — it cannot promote an entry beyond the claim its underlying data already supports.</li>
          <li>Its contribution to the score, <code>confidence_score_delta</code>, is bounded to <strong>[−0.10, +0.05]</strong> — a small nudge, never a takeover.</li>
          <li>Only the tiers <strong>{STRONG, MODERATE, MODERATE_CANDIDATE}</strong> are eligible for ranked-set membership; everything below is informational.</li>
          <li>High coverage combined with STRONG or MODERATE support raises only an entry's <strong>internal ranking</strong>, not its claim authority.</li>
        </ul>
      </div>

      <p><a class="download-outline-btn" href="#annojoin-atlas">Back to the master table</a></p>
    </section>
  </main>`;
}


// Case data is hosted with the complete deployed Case bundle. The checked-in
// local preview is intentionally incomplete, so using it for localhost would
// turn otherwise valid search results into 404s.
const ENTRY_CASE_ORIGIN = 'https://foldbridge.sunhao.uk/entry-cases';
const ENTRY_CASE_FRAME_ORIGIN = new URL(ENTRY_CASE_ORIGIN).origin;

function clearEntryCaseEmbed() {
  if (!disposeEntryCaseHeightListener) return;
  disposeEntryCaseHeightListener();
  disposeEntryCaseHeightListener = null;
}

function initEntryCaseEmbed() {
  clearEntryCaseEmbed();
  const frame = document.querySelector('.entry-case-embed-frame');
  if (!frame) return;

  const disposeHeight = mountEntryCaseHeightListener({
    windowObject: window,
    frame,
    expectedOrigin: ENTRY_CASE_FRAME_ORIGIN,
  });
  const disposeLoading = mountEntryCaseLoadingIndicator({
    frame,
    indicator: document.querySelector('.entry-case-loading'),
  });
  disposeEntryCaseHeightListener = () => {
    disposeHeight();
    disposeLoading();
  };
}

function entryCasePage() {
  let entryCaseParams;
  try {
    entryCaseParams = getEntryCaseParamsFromHash();
  } catch (_error) {
    return `<main class="page"><section class="page-section"><p>Invalid case reference.</p>
      <p><a class="download-outline-btn" href="#entry">Back to the table</a></p></section></main>`;
  }
  const { pdb, chain, family } = entryCaseParams;
  const safePdb = String(pdb || '').trim();
  if (!safePdb || !/^[A-Za-z0-9]+$/.test(safePdb)) {
    return `<main class="page"><section class="page-section"><p>Invalid case reference.</p>
      <p><a class="download-outline-btn" href="#entry">Back to the table</a></p></section></main>`;
  }
  const safeChain = String(chain || '').trim();
  // 所有 case（含 EF）走无版本 index.html；EF 由无版本 family-aware 壳按 ?family= 选 2D 产物。
  // 缓存击穿靠全局壳子模块的版本化文件名（VERSIONED_ASSETS），与 case 数量无关，新增 EF case 零改动。
  const srcUrl = new URL(`${ENTRY_CASE_ORIGIN}/cases/${encodeURIComponent(safePdb)}/index.html`);
  // Entry Case is rendered in a separate iframe, so the parent document's
  // data-mode attribute cannot style it. Pass the persisted theme explicitly.
  srcUrl.searchParams.set('mode', mode);
  if (safeChain && /^[A-Za-z0-9._-]+$/.test(safeChain)) {
    srcUrl.searchParams.set('chain', safeChain);
  }
  // family(E|F) 透传给 case 壳(case-shell.js 读 ?family= 选 E/F 2D 产物)。
  if (family === 'E' || family === 'F') {
    srcUrl.searchParams.set('family', family);
  }
  const src = srcUrl.href;
  // 主站 header 与其它页面一致（renderBundleHeader），iframe 夹在其下、footer 之上。
  // case 页内部的 site-nav.js 有 iframe 守卫（self!==top 不注入），不会重复渲染头。
  return `${renderBundleHeader()}<main class="entry-case-embed">
    <div class="entry-case-loading" role="status" aria-live="polite">
      <span class="entry-case-loading-label">Loading Case…</span>
      <span class="entry-case-loading-track" aria-hidden="true"><span></span></span>
    </div>
    <iframe class="entry-case-embed-frame" src="${src}" title="${escapeHtml(safePdb)} case page"
      loading="lazy" referrerpolicy="no-referrer"></iframe>
  </main>`;
}

function pageFor(name) {
  const safeRoute = normalizeRoute(name);
  if (safeRoute === 'browse') return browsePage();
  if (safeRoute === 'entry-case') return entryCasePage();
  if (safeRoute === 'entry') return entryTablePage();
  if (safeRoute === 'sequence') return annojoinAtlasPage();
  if (safeRoute === 'structure') return structurePage();
  if (safeRoute === 'pdb-case') return pdbCasePage();
  if (safeRoute === 'pdb-downloads') return renderPdbDownloadsPage();
  if (safeRoute === 'annojoin-atlas') return annojoinAtlasPage();
  if (safeRoute === 'annojoin-case') return annojoinCasePage();
  if (safeRoute === 'annojoin-confidence') return annojoinConfidencePage();
  if (safeRoute === 'probing') return detailPage();
  if (safeRoute === 'download') return downloadPage();
  if (safeRoute === 'search') return searchPage();
  if (safeRoute === 'detail') return detailPage();
  if (safeRoute === 'publications') return publicationsPage();
  if (safeRoute === 'help') return helpPage();
  if (safeRoute === 'stats') return statsPage();
  if (safeRoute === 'sequence-detail') return sequenceDetailPage();
  return homePage();
}

function readSavedSearches() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function writeSavedSearches(items) {
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(items.slice(0, 8)));
}

function currentSearchState() {
  const params = searchParamsFromHash(window.location.hash);
  return {
    q: params.get('q') ?? '',
    filters: filtersFromSearchParams(params),
    page: pageFromSearchParams(params)
  };
}

function setSearchState(nextState) {
  const nextHash = buildSearchHash(nextState);
  if (window.location.hash === nextHash) {
    render({ preserveScroll: true });
    return;
  }
  window.location.hash = nextHash;
}

function isFilterActive(filters, key, value) {
  const active = filters[key];
  return Array.isArray(active) ? active.includes(value) : active === value;
}

function toggleSearchFilter(key, value) {
  const state = currentSearchState();
  const filters = { ...state.filters };

  if (key === 'type') {
    filters.type = filters.type === value ? '' : value;
  } else {
    const values = new Set(Array.isArray(filters[key]) ? filters[key] : filters[key] ? [filters[key]] : []);
    if (values.has(value)) values.delete(value);
    else values.add(value);
    filters[key] = [...values];
  }

  setSearchState({ q: state.q, filters, page: 1 });
}

function renderSearchFilters(filters, activeFilters) {
  return SEARCH_FILTER_GROUPS
    .map(({ key }) => {
      const groupLabel = key === 'tag'
        ? 'RNA TYPE'
        : key === 'type'
          ? 'ENTRY TYPE'
          : key;
      const buttons = visibleSearchFilterEntries(filters, key)
        .map(({ value, label, count }) => `<button
          type="button"
          class="site-search-filter ${isFilterActive(activeFilters, key, value) ? 'active' : ''}"
          data-search-filter-key="${escapeHtml(key)}"
          data-search-filter-value="${escapeHtml(value)}"
        >
          <span>${escapeHtml(label)}</span>
          <small>${escapeHtml(count)}</small>
        </button>`)
        .join('');

      return `<div class="site-search-filter-group site-search-filter-group--${escapeHtml(key)}">
        <h3>${escapeHtml(groupLabel)}</h3>
        <div>${buttons || '<span class="mini-note">No filters yet.</span>'}</div>
      </div>`;
    })
    .join('');
}

function renderSavedSearches() {
  const saved = readSavedSearches();
  if (!saved.length) return '';

  return saved
    .map((item, index) => `<div class="saved-search-item">
      <a href="${escapeHtml(item.hash)}">${escapeHtml(item.label)}</a>
      <button type="button" data-remove-saved-search="${index}" aria-label="Remove saved search">×</button>
    </div>`)
    .join('');
}

function renderSearchResults(result) {
  if (!result.items.length) {
    return `<div class="site-search-empty" role="status">
      <strong>No matching entries</strong>
      <p>Try another keyword or remove a filter.</p>
    </div>`;
  }

  return result.items
    .map((item) => {
      const summary = item.summary || (item.type === 'probing-article' ? 'RNA probing method article.' : 'Open this RNA structure entry for details.');
      const details = item.details ? `<span class="site-search-result-details"> · ${escapeHtml(item.details)}</span>` : '';
      return `<a class="site-search-result" href="${escapeHtml(item.href)}">
      <strong class="site-search-result-title">${escapeHtml(item.title)}</strong>
      <span class="site-search-result-summary">${escapeHtml(summary)}${details}</span>
    </a>`;
    })
    .join('');
}

function renderSearchPagination({ page, totalPages }) {
  if (totalPages <= 1) return '';

  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const buttons = pages.map((value, index) => {
    const gap = index && value - pages[index - 1] > 1 ? '<span class="site-search-pagination-gap" aria-hidden="true">…</span>' : '';
    return `${gap}<button type="button" class="site-search-pagination-button${value === page ? ' active' : ''}" data-search-page="${value}"${value === page ? ' aria-current="page"' : ''}>${value}</button>`;
  }).join('');

  return `<nav class="site-search-pagination" aria-label="Search result pages">
    <button type="button" class="site-search-pagination-button" data-search-page="${page - 1}"${page === 1 ? ' disabled' : ''}>Previous</button>
    <div class="site-search-pagination-pages">${buttons}</div>
    <button type="button" class="site-search-pagination-button" data-search-page="${page + 1}"${page === totalPages ? ' disabled' : ''}>Next</button>
    <form class="site-search-page-jump" data-search-page-jump aria-label="Jump to page">
      <input id="site-search-page-jump-input" name="page" type="number" inputmode="numeric" min="1" max="${totalPages}" value="${page}" aria-label="Page number; press Enter to jump" title="Enter a page number and press Enter" />
      <span aria-hidden="true">/ ${totalPages}</span>
    </form>
  </nav>`;
}

function bindSearchPageControls() {
  const form = document.getElementById('site-search-form');
  const input = document.getElementById('site-search-input');
  const saveButton = document.getElementById('save-search-query');
  const savedHost = document.getElementById('site-search-saved');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const state = currentSearchState();
    setSearchState({ q: input?.value ?? '', filters: state.filters, page: 1 });
  });

  saveButton?.addEventListener('click', () => {
    const state = currentSearchState();
    const hash = buildSearchHash(state);
    if (hash === '#search') return;
    const labelParts = [state.q || 'Filtered search'];
    if (state.filters.type) labelParts.push(`type:${state.filters.type}`);
    const tags = Array.isArray(state.filters.tag) ? state.filters.tag : state.filters.tag ? [state.filters.tag] : [];
    if (tags.length) labelParts.push(`tag:${tags.join(',')}`);
    const item = { hash, label: labelParts.join(' · ') };
    const next = [item, ...readSavedSearches().filter((saved) => saved.hash !== hash)];
    writeSavedSearches(next);
    if (savedHost) savedHost.innerHTML = renderSavedSearches();
  });

  savedHost?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-saved-search]');
    if (!button) return;
    const index = Number(button.getAttribute('data-remove-saved-search'));
    const next = readSavedSearches().filter((_, itemIndex) => itemIndex !== index);
    writeSavedSearches(next);
    savedHost.innerHTML = renderSavedSearches();
  });
}

async function initSearchPage() {
  if (route !== 'search') return;

  const filterHost = document.getElementById('site-search-filters');
  const resultHost = document.getElementById('site-search-results');
  const summaryHost = document.getElementById('site-search-summary');
  const savedHost = document.getElementById('site-search-saved');
  if (!filterHost || !resultHost || !summaryHost || !savedHost) return;

  bindSearchPageControls();
  savedHost.innerHTML = renderSavedSearches();

  const state = currentSearchState();

  try {
    const isProbingArticleSearch = state.filters.type === 'probing-article';
    const result = await siteSearchService.search({
      q: state.q,
      filters: state.filters,
      page: state.page,
      pageSize: isProbingArticleSearch ? 8 : 10
    });
    filterHost.innerHTML = renderSearchFilters(result.availableFilters, state.filters);
    resultHost.innerHTML = `${renderSearchResults(result)}${renderSearchPagination(result)}`;
    summaryHost.textContent = state.q || Object.keys(state.filters).length
      ? `${result.total} results`
      : 'Enter a query or choose a filter.';

    filterHost.querySelectorAll('[data-search-filter-key]').forEach((button) => {
      button.addEventListener('click', () => {
        toggleSearchFilter(button.getAttribute('data-search-filter-key'), button.getAttribute('data-search-filter-value'));
      });
    });

    resultHost.querySelectorAll('[data-search-page]').forEach((button) => {
      button.addEventListener('click', () => {
        const page = Number(button.getAttribute('data-search-page'));
        if (!Number.isSafeInteger(page) || page < 1 || page > result.totalPages || page === result.page) return;
        setSearchState({ q: state.q, filters: state.filters, page });
        requestAnimationFrame(() => document.querySelector('.site-search-results-card')?.scrollIntoView({ block: 'start' }));
      });
    });
    resultHost.querySelectorAll('[data-search-page-jump]').forEach((jumpForm) => {
      const pageInput = jumpForm.elements.namedItem('page');
      const jumpToEnteredPage = () => {
        const page = Number(pageInput?.value);
        if (!Number.isSafeInteger(page) || page < 1 || page > result.totalPages) {
          pageInput?.setCustomValidity(`Enter a page from 1 to ${result.totalPages}.`);
          pageInput?.reportValidity();
          return;
        }
        pageInput?.setCustomValidity('');
        if (page === result.page) return;
        setSearchState({ q: state.q, filters: state.filters, page });
        requestAnimationFrame(() => document.querySelector('.site-search-results-card')?.scrollIntoView({ block: 'start' }));
      };
      jumpForm.addEventListener('submit', (event) => {
        event.preventDefault();
        jumpToEnteredPage();
      });
      pageInput?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        jumpToEnteredPage();
      });
    });
  } catch (_error) {
    summaryHost.textContent = 'Search index unavailable. Run npm run build:pages.';
    resultHost.innerHTML = '';
    filterHost.innerHTML = '<span class="mini-note">No index loaded.</span>';
  }
}

function initGlobalSearch() {
  const form = document.getElementById('global-search-form');
  const input = document.getElementById('global-search-input');
  if (!form || !input) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setSearchState({ q: input.value, filters: {} });
  });

  input.addEventListener('focus', () => {
    siteSearchService.warm().catch(() => {});
  });
}

function render(options = {}) {
  const { preserveScroll = false } = options;
  const previousScrollX = window.scrollX;
  const previousScrollY = window.scrollY;
  // 宽表横向滚动位置存在内部容器上，整页重渲染会重建它并丢失用户的横向拖拽。
  // 渲染前抓取、渲染后恢复，避免点击 Chains 等字段链接后横向滚动被重置。
  const previousTableWrap = document.querySelector('.annojoin-master-table-wrap');
  const previousTableScroll = previousTableWrap
    ? { left: previousTableWrap.scrollLeft, top: previousTableWrap.scrollTop }
    : null;
  const previousEntryTableWrap = document.querySelector('.entry-table-page .entry-table-wrap');
  const previousEntryTableScroll = previousEntryTableWrap
    ? { left: previousEntryTableWrap.scrollLeft, top: previousEntryTableWrap.scrollTop }
    : null;
  let activeSearch = null;
  if (document.activeElement?.id === 'annojoin-search-input') {
    const el = document.activeElement;
    activeSearch = {
      selectionStart: el.selectionStart ?? null,
      selectionEnd: el.selectionEnd ?? null
    };
  }
  let activePdbDownloadSearch = null;
  if (document.activeElement?.id === 'pdb-download-search') {
    const el = document.activeElement;
    activePdbDownloadSearch = {
      selectionStart: el.selectionStart ?? null,
      selectionEnd: el.selectionEnd ?? null
    };
  }

  clearEntryCaseEmbed();
  setTheme(theme, mode);
  document.getElementById('app').innerHTML = `${nav()}${pageFor(route)}${renderFooter()}`;
  if (route === 'entry' && Number.isFinite(entryTableViewportHeight)) {
    const entryTableWrap = document.querySelector('.entry-table-page .entry-table-wrap');
    entryTableWrap?.style.setProperty('--entry-table-viewport-height', `${entryTableViewportHeight}px`);
  }
  if (route === 'entry-case') initEntryCaseEmbed();
  if (route === 'entry' || route === 'sequence') {
    const targetPdbId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('pdbId')?.trim();
    if (targetPdbId) {
      requestAnimationFrame(() => {
        const target = [...document.querySelectorAll('[data-annojoin-case-row]')]
          .find((row) => String(row.getAttribute('data-pdb-id') || '').toUpperCase() === targetPdbId.toUpperCase());
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target?.classList.add('is-return-target');
      });
    }
  }
  // entry 表两层折叠：委托绑定分组表头的展开/收起（parent:<id> / child:<id>）。
  document.querySelectorAll('[data-entry-group-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleEntryGroup(button.getAttribute('data-entry-group-toggle'));
    });
  });
  // entry 表旧版 family + detail technique 两级筛选。
  document.querySelectorAll('.entry-table-page [data-technique-family]').forEach((input) => {
    input.addEventListener('change', () => {
      toggleEntryTechnique('families', input.getAttribute('data-technique-family'));
    });
  });
  document.querySelectorAll('.entry-table-page [data-technique-name]').forEach((input) => {
    input.addEventListener('change', () => {
      toggleEntryTechnique('techniques', input.getAttribute('data-technique-name'));
    });
  });
  bindEntryExportLink();
  // entry 表：清空 family + detail technique 筛选。
  const clearEntryFilterBtn = document.getElementById('clear-entry-technique-filter');
  if (clearEntryFilterBtn) {
    clearEntryFilterBtn.addEventListener('click', () => {
      entryTechniqueSelection = { families: new Set(), techniques: new Set() };
      render({ preserveScroll: true });
    });
  }
  const modeToggle = document.getElementById('mode-toggle');
  if (modeToggle) {
    modeToggle.addEventListener('click', () => {
      mode = mode === 'dark' ? 'light' : 'dark';
      render({ preserveScroll: true });
    });
  }
  const annojoinState = document.getElementById('annojoin-search-input') ? currentAnnojointAtlasState() : null;
  if (annojoinState) {
    bindAnnojointAtlasTable({
      root: document,
      setQuery: setAnnojointAtlasQuery,
      toggleGroup: toggleAnnojointAtlasGroup,
      toggleGroupLimit: toggleAnnojointAtlasGroupLimit,
      expandAllGroups: () => {
        expandedAnnojointGroupIds = new Set(allAnnojointAtlasGroupIds());
        render({ preserveScroll: true });
      },
      collapseAllGroups: () => {
        expandedAnnojointGroupIds.clear();
        uncappedAnnojointGroupIds.clear();
        render({ preserveScroll: true });
      },
      removeFilter: (key) => {
        if (key && key.includes(':')) {
          const idx = key.indexOf(':');
          const kind = key.slice(0, idx);
          const value = key.slice(idx + 1);
          if (kind === 'techniqueFamilies' || kind === 'techniqueNames') {
            toggleAnnojointAtlasTechnique(kind, value);
            return;
          }
        }
        setAnnojointAtlasFilter(key, '');
      },
      clearFilters: () => clearAnnojointAtlasFilters(),
      toggleTechniqueFamily: (fam) => toggleAnnojointAtlasTechnique('techniqueFamilies', fam),
      toggleTechniqueName: (name) => toggleAnnojointAtlasTechnique('techniqueNames', name)
    });
  }
  initAnnojointStructureViewers().catch((error) => {
    console.error('[main] 初始化 ANNOJOIN 3D viewer 失败', error);
  });
  initAnnojointCasePage().catch((error) => {
    console.error('[main] 初始化 ANNOJOIN case page 失败', error);
  });
  initHeaderSearch();
  initGlobalSearch();
  initAptamerMultiSelect();
  initSecondaryStructureModule();
  initMolstarModule();
  initHomeStructureShowcase();
  initSequenceDetailMolstar();
  initSequenceDetailSecondaryHeatmap();
  initAnimatedStats();
  initHomeDashboardFilters();
  initStatsDashboard();
  initHomeProbingCarousel();
  initHomeScrollStory();
  initPdbCasePage();
  initPdbDownloadsPage();
  initDownloadGeoDisclosure();
  initSearchPage();

const subnavMenuToggle = document.getElementById('subnav-menu-toggle');
const subnavNav = document.querySelector('.hero-subnav nav');

if (subnavMenuToggle && subnavNav) {
  subnavMenuToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    isSubnavMenuOpen = !isSubnavMenuOpen;
    render({ preserveScroll: true });
  });

  subnavNav.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

document.addEventListener('click', () => {
  let shouldRender = false;
  if (isDownloadMenuOpen) {
    isDownloadMenuOpen = false;
    shouldRender = true;
  }
  if (isSubnavMenuOpen) {
    isSubnavMenuOpen = false;
    shouldRender = true;
  }
  if (shouldRender) {
    render({ preserveScroll: true });
  }
});


  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      isDownloadMenuOpen = false;
      isSubnavMenuOpen = false;
      route = normalizeRoute(el.getAttribute('data-route'));
      window.location.hash = route;
    });
  });

  // Browse by mechanism 卡片：同页滚动到对应家族 section，不改 hash（改 hash 会被路由归一化回 home 并整页重渲染）。
  // 目标缺失时不阻止默认行为，交回浏览器原生锚点跳转。
  document.querySelectorAll('[data-probing-family-link]').forEach((el) => {
    el.addEventListener('click', (event) => {
      const id = el.getAttribute('data-probing-family-link');
      if (!id) return;
      const target = document.getElementById(`probing-family-${id}`);
      if (!target) return;
      event.preventDefault();
      if (target.tagName === 'DETAILS') target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (activeSearch) {
    const el = document.getElementById('annojoin-search-input');
    if (el) {
      el.focus();
      if (typeof activeSearch.selectionStart === 'number' && typeof activeSearch.selectionEnd === 'number') {
        try {
          el.setSelectionRange(activeSearch.selectionStart, activeSearch.selectionEnd);
        } catch (error) {
          // type="search" 可能不支持 setSelectionRange，忽略。
        }
      }
    }
  }

  if (activePdbDownloadSearch) {
    const el = document.getElementById('pdb-download-search');
    if (el) {
      el.focus();
      if (typeof activePdbDownloadSearch.selectionStart === 'number' && typeof activePdbDownloadSearch.selectionEnd === 'number') {
        el.setSelectionRange(activePdbDownloadSearch.selectionStart, activePdbDownloadSearch.selectionEnd);
      }
    }
  }

  if (previousTableScroll) {
    const nextTableWrap = document.querySelector('.annojoin-master-table-wrap');
    if (nextTableWrap) {
      nextTableWrap.scrollLeft = previousTableScroll.left;
      nextTableWrap.scrollTop = previousTableScroll.top;
    }
  }

  if (previousEntryTableScroll) {
    const nextEntryTableWrap = document.querySelector('.entry-table-page .entry-table-wrap');
    if (nextEntryTableWrap) {
      nextEntryTableWrap.scrollLeft = previousEntryTableScroll.left;
      nextEntryTableWrap.scrollTop = previousEntryTableScroll.top;
    }
  }

  if (preserveScroll) {
    requestAnimationFrame(() => window.scrollTo(previousScrollX, previousScrollY));
  }
}

function initPdbDownloadsPage() {
  const search = document.getElementById('pdb-download-search');
  if (search) {
    search.addEventListener('input', () => {
      pdbDownloadQuery = search.value;
      pdbDownloadPage = 1;
      render({ preserveScroll: true });
    });
  }
  document.querySelectorAll('[data-pdb-download-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextPage = Number(button.getAttribute('data-pdb-download-page'));
      if (!Number.isSafeInteger(nextPage) || nextPage < 1 || button.disabled) return;
      pdbDownloadPage = nextPage;
      render({ preserveScroll: true });
    });
  });
}

function initDownloadGeoDisclosure() {
  document.querySelectorAll('[data-geo-disclosure]').forEach((disclosure) => {
    const panelId = disclosure.getAttribute('data-geo-disclosure');
    const panel = panelId
      ? document.querySelector(`[data-geo-panel="${CSS.escape(panelId)}"]`)
      : null;
    if (!panel) return;
    const sync = () => { panel.hidden = !disclosure.open; };
    sync();
    disclosure.addEventListener('toggle', sync);
  });
}

function initPdbCasePage() {
  // 索引页 confidence 过滤：纯前端切换行可见性，不触发整页重渲染。
  const filterButtons = document.querySelectorAll('[data-confidence-filter]');
  if (filterButtons.length) {
    const applyFilter = () => {
      document.querySelectorAll('[data-confidence-class]').forEach((row) => {
        const cls = row.getAttribute('data-confidence-class');
        const isParentRow = row.classList.contains('pdb-case-parent-row');
        if (pdbCaseConfidenceFilter === 'all') {
          // parent 行始终可见；child 行取决于其 parent 是否展开
          if (isParentRow) { row.hidden = false; }
          else if (row.classList.contains('pdb-case-child-row')) {
            // 由 parent toggle 控制
          } else { row.hidden = false; }
        } else {
          row.hidden = cls !== pdbCaseConfidenceFilter;
          // 过滤时强制折叠 child 行
          if (row.classList.contains('pdb-case-child-row')) row.hidden = true;
        }
      });
      // parent 行特殊逻辑：如果过滤后没有子行匹配，隐藏 parent
      document.querySelectorAll('[data-parent-toggle]').forEach((parentRow) => {
        const parentName = parentRow.getAttribute('data-parent-toggle');
        if (pdbCaseConfidenceFilter === 'all') {
          parentRow.hidden = false;
        } else {
          const hasVisible = !!document.querySelector(
            `[data-parent-name="${CSS.escape(parentName)}"][data-confidence-class="${pdbCaseConfidenceFilter}"]`
          );
          parentRow.hidden = !hasVisible;
        }
      });
      filterButtons.forEach((btn) => {
        btn.classList.toggle('is-active', btn.getAttribute('data-confidence-filter') === pdbCaseConfidenceFilter);
      });
    };
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        pdbCaseConfidenceFilter = btn.getAttribute('data-confidence-filter') || 'all';
        applyFilter();
      });
    });
    applyFilter();
  }

  // Parent group 折叠/展开切换
  document.querySelectorAll('[data-parent-toggle]').forEach((parentRow) => {
    const toggleBtn = parentRow.querySelector('.pdb-case-parent-toggle');
    if (!toggleBtn) return;
    toggleBtn.addEventListener('click', () => {
      const parentName = parentRow.getAttribute('data-parent-toggle');
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      const arrow = toggleBtn.querySelector('.pdb-case-parent-arrow');
      if (arrow) arrow.textContent = expanded ? '\u25B6' : '\u25BC';
      document.querySelectorAll(`.pdb-case-child-row[data-parent-name="${CSS.escape(parentName)}"]`).forEach((child) => {
        child.hidden = expanded; // toggle: was expanded → collapse, was collapsed → expand
      });
    });
  });

  // Detail 按钮：导航到本站详情页
  document.querySelectorAll('.pdb-case-detail-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const href = btn.getAttribute('data-detail-href');
      if (href) window.location.hash = href.replace(/^#/, '');
    });
  });

  // 详情页 alignment 分页导航。
  const params = getPdbCaseParamsFromHash();
  if (params.pdbId) {
    const section = document.querySelector('[data-alignment-page]');
    const current = section ? Number(section.getAttribute('data-alignment-page')) || 1 : 1;
    document.querySelectorAll('[data-alignment-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const dir = btn.getAttribute('data-alignment-nav');
        const next = dir === 'prev' ? current - 1 : current + 1;
        if (next < 1) return;
        loadAlignmentForCase(params.pdbId, next);
      });
    });
  }
}

function initHomeProbingCarousel() {
  // 幂等：每次 render 都会重跑本函数，先清旧定时器再决定是否重启，
  // 否则同一 home 会话内反复 render 会叠加多个 interval。
  if (homeProbingCarouselTimer) {
    clearInterval(homeProbingCarouselTimer);
    homeProbingCarouselTimer = null;
  }
  const carousel = document.querySelector('.home-probing-carousel');
  // 非 home 路由 / 空壳无 slide：清掉定时器后直接返回（已在上面清理）。
  if (!carousel) return;
  const slides = Array.from(carousel.querySelectorAll('[data-carousel-slide]'));
  const dots = Array.from(carousel.querySelectorAll('[data-carousel-dot]'));
  if (slides.length <= 1) return;

  let current = 0;
  const show = (next) => {
    current = (next + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  };

  const restart = () => {
    if (homeProbingCarouselTimer) clearInterval(homeProbingCarouselTimer);
    homeProbingCarouselTimer = setInterval(() => show(current + 1), 6000);
  };

  carousel.querySelector('[data-carousel-prev]')?.addEventListener('click', (e) => {
    e.preventDefault();
    show(current - 1);
    restart();
  });
  carousel.querySelector('[data-carousel-next]')?.addEventListener('click', (e) => {
    e.preventDefault();
    show(current + 1);
    restart();
  });
  dots.forEach((dot, i) => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
      restart();
    });
  });

  restart();
}

function initHomeScrollStory() {
  // 幂等：每次 render 都会重跑，先 disconnect 旧 observer 再决定是否重建，
  // 否则同一 home 会话内反复 render 会叠加多个 observer（同轮播 setInterval 坑）。
  if (homeScrollStoryObserver) {
    homeScrollStoryObserver.disconnect();
    homeScrollStoryObserver = null;
  }
  const story = document.querySelector('.home-scroll-story');
  if (!story) return; // 非 home / placeholder 壳：清理后返回
  const scenes = Array.from(story.querySelectorAll('.hss-scene'));
  const layers = Array.from(story.querySelectorAll('.hss-layer'));
  if (scenes.length === 0 || layers.length === 0) return;
  if (typeof IntersectionObserver !== 'function') return; // 不支持 → CSS 静态堆叠降级（任务 7）

  story.classList.add('hss-js'); // observer 确实接上后才启用滚动渐隐；无 JS/无 observer → 场景全可读（spec §8）

  const activate = (idx) => {
    scenes.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.scene) === idx));
    layers.forEach((l) => l.classList.toggle('is-active', Number(l.dataset.stage) === idx));
  };

  homeScrollStoryObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) activate(Number(e.target.dataset.scene));
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

  scenes.forEach((s) => homeScrollStoryObserver.observe(s));
}

function initHomeDashboardFilters() {
  const filterButtons = document.querySelectorAll('[data-home-filter-kind]');
  if (!filterButtons.length) return;

  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-home-filter-kind');
      const value = button.getAttribute('data-home-filter-value');
      if (!kind || !value) return;
      const key = kind === 'year' ? 'years' : 'categories';
      const values = new Set(homeDashboardFilters[key]);
      if (values.has(value)) values.delete(value);
      else values.add(value);
      homeDashboardFilters[key] = [...values];
      render({ preserveScroll: true });
    });
  });

  document.querySelectorAll('[data-home-filter-clear]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.getAttribute('data-home-filter-clear');
      const value = button.getAttribute('data-home-filter-value');
      if (!kind || !value) return;
      const key = kind === 'year' ? 'years' : 'categories';
      homeDashboardFilters[key] = homeDashboardFilters[key].filter((item) => item !== value);
      render({ preserveScroll: true });
    });
  });

  const resetButton = document.getElementById('home-dashboard-reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      homeDashboardFilters = { years: [], categories: [] };
      render({ preserveScroll: true });
    });
  }

}

window.addEventListener('hashchange', () => {
  const previousRoute = route;
  route = routeFromHash(window.location.hash);
  // 同路由内仅参数变化（如点击字段链接切换右侧面板）保留滚动位置；
  // 真正切换路由时才重置到顶部。
  render({ preserveScroll: route === previousRoute });
});


async function initApp() {
  await loadSequenceRows();
  await loadBrowseEntryRows();
  render();
}

initApp();
