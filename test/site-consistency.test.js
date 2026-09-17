import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderBundleHeader } from '../src/portalChrome.js';
import { renderProbingArticlePage } from '../src/probingArticleView.js';
import { renderHelpPage } from '../src/siteChrome.js';

test('Help preserves the general contact section', () => {
  const content = JSON.parse(readFileSync(new URL('../src/assets/data/help-content.json', import.meta.url), 'utf8'));
  const html = renderHelpPage(content);
  assert.doesNotMatch(html, /id="help-data-submission"/);
  assert.doesNotMatch(html, /miao_zhichao@gzlab\.ac\.cn/);
  assert.match(html, /href="mailto:hu_linyan@gzlab.ac.cn"/);
});

for (const slug of ['cmc-cmct', 'hrf-seq', 'shape-2a3', 'dms-seq', 'mod-seq']) {
  test(`current article ${slug} formats editorial scientific terms`, () => {
    const detail = JSON.parse(readFileSync(new URL(`../src/assets/generated/probing-articles/${slug}.json`, import.meta.url), 'utf8'));
    assert.match(renderProbingArticlePage(detail, null), /<em>(?:[Ii]n vi(?:vo|tro)|E\. coli)<\/em>/);
  });
}

test('editorial PPT headings format Latin phrases', () => {
  const html = renderProbingArticlePage({ slug: 'test', title: 'Method',
    ppt_overview: [{ title: 'In vivo profiling', text: '', srcBasename: 'figure.png' }]
  }, null);
  assert.match(html, /<h2><em>In vivo<\/em> profiling<\/h2>/);
});

test('official name appears in browser title, shared header and first Help introduction', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(read('../index.html'), /<title>Ribocentre-FoldBridge<\/title>/);
  assert.match(renderBundleHeader(), /Ribocentre-FoldBridge/);
  assert.match(read('../src/assets/data/help-content.json'), /Ribocentre-FoldBridge \(FoldBridge\)/);
});

test('article prose italicizes scientific terms but preserves code and identifiers', () => {
  const html = renderProbingArticlePage({
    slug: 'test', title: 'Method', rep_doi: '10.test/in-vivo',
    blocks: [{ type: 'paragraph', text: 'In vivo and E. coli; `in vitro` **ex vivo** <script>bad</script>' }],
    ppt_overview: [{ title: 'Overview', text: 'Arabidopsis thaliana in vitro', srcBasename: 'in-vivo.png' }]
  }, null);
  assert.match(html, /<em>In vivo<\/em> and <em>E\. coli<\/em>/);
  assert.match(html, /<code class="article-code">in vitro<\/code>/);
  assert.match(html, /<strong><em>ex vivo<\/em><\/strong>/);
  assert.match(html, /<em>Arabidopsis thaliana<\/em> <em>in vitro<\/em>/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /10\.test\/in-vivo/);
});
