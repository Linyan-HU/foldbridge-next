import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as probingArticleView from '../src/probingArticleView.js';
import { renderProbingFamilyIndex } from '../src/siteChrome.js';

const INDEX = JSON.parse(readFileSync(
  new URL('../src/assets/generated/probing-articles/index.json', import.meta.url),
  'utf8'
));

const PUBLIC_FAMILY_IDS = [
  'dms',
  'shape',
  'in-cell-shape',
  'footprinting',
  'carbodiimide-special'
];

test('buildProbingOverviewModel rejects a non-object index', () => {
  assert.throws(
    () => probingArticleView.buildProbingOverviewModel(null),
    /probing index must be an object/
  );
});

test('buildProbingOverviewModel rejects an index without a families array', () => {
  assert.throws(
    () => probingArticleView.buildProbingOverviewModel({}),
    /probing index families must be an array/
  );
});

for (const familyId of PUBLIC_FAMILY_IDS) {
  test(`buildProbingOverviewModel rejects a missing curated public family: ${familyId}`, () => {
    const index = {
      ...INDEX,
      families: INDEX.families.filter((family) => family.id !== familyId)
    };

    assert.throws(
      () => probingArticleView.buildProbingOverviewModel(index),
      new RegExp(`probing index is missing curated public family: ${familyId}`)
    );
  });
}

test('buildProbingOverviewModel derives the five public families and 28 curated methods', () => {
  assert.equal(
    typeof probingArticleView.buildProbingOverviewModel,
    'function',
    'buildProbingOverviewModel should be exported'
  );

  const model = probingArticleView.buildProbingOverviewModel(INDEX);

  assert.equal(model.methodCount, 28);
  assert.equal(model.familyCount, 5);
  assert.equal(model.families.flatMap((family) => family.methods).length, 28);
});

test('RNA interaction methods append MCA and mutate-and-map article cards', () => {
  const model = probingArticleView.buildProbingOverviewModel(INDEX);
  const interactionFamily = model.families.find((family) => family.id === 'carbodiimide-special');

  assert.equal(interactionFamily.methods.length, 8);
  assert.deepEqual(
    interactionFamily.methods.slice(-2).map((method) => ({
      slug: method.slug,
      title: method.title,
      description: method.description,
      figureCount: method.figure_count,
      pmid: method.rep_pmid
    })),
    [
      {
        slug: 'mca',
        title: 'MOHCA/MOHCA-seq (MCA)',
        description: 'Tertiary proximity restraint.',
        figureCount: 4,
        pmid: '26035425'
      },
      {
        slug: 'mutate-and-map',
        title: 'Mutate-and-map (M²)',
        description: 'Perturbational structural coupling.',
        figureCount: 4,
        pmid: '22109276'
      }
    ]
  );
});

test('an extra raw family cannot enter the shared overview, family navigation, or method sections', () => {
  const indexWithExtraFamily = {
    ...INDEX,
    families: [
      ...INDEX.families,
      {
        id: 'extra-family',
        title: 'Extra family',
        summary: 'This raw-only family must not become public.',
        articles: [{ slug: 'extra-method', title: 'Extra method' }]
      }
    ]
  };

  const model = probingArticleView.buildProbingOverviewModel(indexWithExtraFamily);
  const familyNavigationHtml = renderProbingFamilyIndex(model.families, { embedded: true });
  const methodSectionsHtml = probingArticleView.renderProbingArticleIndex(indexWithExtraFamily);

  assert.equal(model.families.length, 5);
  assert.equal((familyNavigationHtml.match(/class="probing-family-card"/g) || []).length, 5);
  assert.equal((methodSectionsHtml.match(/data-probing-family="/g) || []).length, 5);
  assert.doesNotMatch(familyNavigationHtml, /extra-family|Extra family|Extra method/i);
  assert.doesNotMatch(methodSectionsHtml, /extra-family|Extra family|Extra method/i);
});

test('an extra raw family cannot override curated-family method metadata through a duplicate slug', () => {
  const indexWithDuplicateSlugLeak = {
    ...INDEX,
    families: [
      ...INDEX.families,
      {
        id: 'extra-family',
        title: 'Extra family',
        summary: 'Raw only',
        articles: [{ slug: 'dms', rep_pmid: 'LEAK_PMID', figure_count: 999 }]
      }
    ]
  };

  const model = probingArticleView.buildProbingOverviewModel(indexWithDuplicateSlugLeak);
  const dmsMethod = model.families
    .find((family) => family.id === 'dms')
    .methods.find((method) => method.slug === 'dms');
  const html = probingArticleView.renderProbingArticleIndex(indexWithDuplicateSlugLeak);

  assert.notEqual(dmsMethod.rep_pmid, 'LEAK_PMID');
  assert.notEqual(dmsMethod.figure_count, 999);
  assert.doesNotMatch(html, /LEAK_PMID|999 figures/);
});

test('renderProbingArticleIndex uses the curated method count and public wording', () => {
  const html = probingArticleView.renderProbingArticleIndex(INDEX);
  const methodLinks = html.match(/href="#probing\?tech=[^"]+"/g) || [];

  assert.equal(methodLinks.length, 28);
  assert.match(html, /28 probing methods/i);
  assert.doesNotMatch(html, /28 in-depth explainers/i);
  assert.doesNotMatch(html, /28 articles/i);
  assert.match(html, /href="#probing\?tech=mca"/);
  assert.match(html, /href="#probing\?tech=mutate-and-map"/);
  assert.match(html, /MOHCA\/MOHCA-seq \(MCA\)/);
  assert.match(html, /Mutate-and-map \(M²\)/);
  assert.doesNotMatch(html, /Chain confidence/i);
});

test('renderProbingUnavailablePage renders an escaped probing-specific error shell without legacy counts', () => {
  assert.equal(
    typeof probingArticleView.renderProbingUnavailablePage,
    'function',
    'renderProbingUnavailablePage should be exported'
  );

  const html = probingArticleView.renderProbingUnavailablePage(
    'broken <index> & "family"',
    '<header>FoldBridge</header>'
  );

  assert.match(html, /^<header>FoldBridge<\/header>/);
  assert.match(html, /<h1>Chemical probing methods<\/h1>/);
  assert.match(html, /Probing methods unavailable/);
  assert.match(html, /broken &lt;index&gt; &amp; &quot;family&quot;/);
  assert.doesNotMatch(html, /broken <index>/);
  assert.doesNotMatch(html, /Technology Categories|28 probing methods|Five mechanism families/);
});
