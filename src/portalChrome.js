const BUNDLE_SITES = [
  { name: 'Ribocentre', tone: 'blue', topLabel: 'Ribozyme database', href: 'https://www.ribocentre.org/' },
  { name: 'Switch', tone: 'green', topLabel: 'Riboswitch database', href: 'https://riboswitch.ribocentre.org/' },
  { name: 'Aptamer', tone: 'violet', topLabel: 'Aptamer database', href: 'https://aptamer.ribocentre.org/' },
  { name: 'GlycoRNA', tone: 'blue', topLabel: 'GlycoRNA database', href: 'http://www.glycornadb.com' },
  { name: 'FoldBridge', tone: 'gold', topLabel: 'Probing-to-structure bridge', href: null }
];

const GLOBAL_NAV_ITEMS = [
  { label: 'Home', icon: 'home.svg', href: 'http://www.gznl.org/' },
  { label: 'Database', icon: 'database.svg', href: 'https://www.gznl.org/database/' },
  { label: 'Research', icon: 'research.svg', href: 'https://www.gznl.org/research/' },
  { label: 'About us', icon: 'aboutus.svg', href: 'https://www.gznl.org/aboutus/' },
  { label: 'GZNL-RDC', icon: 'gznl2.svg', href: 'https://gzlab.ac.cn/', className: 'gznl-rdc-link' }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderGlobalNav({ assetBase = './src/assets/header/' } = {}) {
  const links = GLOBAL_NAV_ITEMS.map((item) => {
    const className = item.className ? ` class="${item.className}"` : '';
    return `<a${className} href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(assetBase + item.icon)}" alt=""/>${item.label}</a>`;
  }).join('\n      ');

  return `<div class="black-nav" aria-label="GZNL global navigation">
      ${links}
    </div>`;
}

export function renderBundleHeader({ mode = 'light', navHtml = '' } = {}) {
  const featuredNames = BUNDLE_SITES.map((site) => {
    const activeClass = site.href ? '' : 'active';
    if (site.href) {
      return `<a class="bundle-switch-pill tone-${site.tone} ${activeClass}" href="${site.href}" target="_blank" rel="noopener noreferrer">
        <strong>${site.name}</strong>
        <span>${site.topLabel}</span>
      </a>`;
    }

    return `<span class="bundle-switch-pill tone-${site.tone} ${activeClass}" aria-current="page">
      <strong>${site.name}</strong>
      <span>${site.topLabel}</span>
    </span>`;
  }).join('');

  return `<header class="bundle-home-header">
    <div class="bundle-home-header-inner">
      <div class="bundle-home-brand-column">
        <div class="bundle-home-brand">
          <div class="bundle-home-mark">FB</div>
          <div class="bundle-home-brand-copy">
            <p class="bundle-home-bundle-label">Ribocentre-FoldBridge</p>
            <h1>FoldBridge</h1>
            <span>A curated database that links RNA chemical probing data with experimentally resolved tertiary structures.</span>
          </div>
        </div>
      </div>

      <div class="bundle-home-nav-column">
        <div class="bundle-home-topline">
          <div class="bundle-home-bundle-block">
            <p class="bundle-home-switch-label">RNA database bundle</p>
            <div class="bundle-home-switches">
              ${featuredNames}
            </div>
          </div>
          <div class="bundle-home-meta">
            <form class="global-search-form" id="global-search-form">
              <input id="global-search-input" type="search" placeholder="Search FoldBridge" aria-label="Search FoldBridge" />
              <button class="global-search-submit" type="submit" aria-label="Search" title="Search">🔍</button>
            </form>
            <button type="button" class="mode-toggle" id="mode-toggle">
              ${mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            </button>
          </div>
        </div>

        ${navHtml}
      </div>
    </div>
  </header>`;
}
