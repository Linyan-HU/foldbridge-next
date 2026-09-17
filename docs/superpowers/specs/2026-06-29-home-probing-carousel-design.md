# Home Page Probing-Article Carousel — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorming), pending spec review
**Repo:** `~/docs/foldbridge` (static GitHub Pages site)

## 1. Purpose

Add a rotating showcase module to the FoldBridge home page that surfaces the 27
RNA probing-method explainer articles. The module reuses the probing-article
assets (representative figure + title + mechanism family) and links each slide
to the article detail page. Goal: make the home page richer and drive traffic
into the probing library, with zero regression to the existing hero.

## 2. Scope

**Layout decision (option B, approved):** The existing hero
(`renderHomeHero()`, title + three metric cards) is **unchanged**. The carousel
is a **new, independent module** inserted between the hero and the three module
cards (`renderHomeModuleCards()`). It is purely additive — no existing home
markup is modified.

**Out of scope:** redesigning the hero; new article content; touching the
probing route, detail route, or search; any backend/build-graph change beyond
emitting one new field per article.

## 3. Architecture

Three small units, each with one responsibility, following existing patterns.

### 3.1 Pure render unit (`src/siteChrome.js`)

New exported pure function `renderHomeProbingCarousel(articles)`:

- **Input:** a single argument — an array of article card objects (the same
  shape already in `index.json` `articles[]`:
  `{ slug, title, rep_figure, family_title, ... }`). The card object does **not**
  carry `asset_base` (only the per-slug detail JSON does), so the pure function
  derives each image src deterministically from the slug:
  `./src/assets/generated/probing-articles/assets/<slug>/<rep_figure>` — the same
  path shape `detail` already uses. No second argument.
- **Output:** a static HTML string. No timers, no event binding, no DOM access,
  no module-level `window`/`route` reads — consistent with the file's contract
  ("所有函数必须是纯函数：入参 → 返回 HTML 字符串").
- **Markup per slide:** representative figure `<img>`, article title, mechanism
  family badge, wrapped in a link to `#detail/<slug>`. Plus prev/next buttons and
  one dot per slide, all carrying `data-*` hooks (e.g. `data-carousel-prev`,
  `data-carousel-dot="<index>"`). First slide marked active.
- **Empty input:** returns an empty-state placeholder shell (so the home page
  renders cleanly before the async index arrives, and never throws).

Mirrors the existing `renderHomeHero` / `renderHomeModuleCards` siblings so it is
node-`--test`-able without jsdom.

### 3.2 Build emits a representative figure (`scripts/build-probing-articles.mjs`)

The card object today lacks an image filename. The builder already computes
`repFig = figureBlocks[0]` for `rep_pmid`/`rep_doi`. Add one field to the card
returned by `buildOne()` and therefore to every `articles[]` entry in
`index.json`:

- `rep_figure`: `figureBlocks[0].srcBasename` (the first figure's image
  basename), or `""` when an article has no figures.
- `family_title`: the mechanism family the article belongs to, so the slide can
  render its badge without a second lookup. **Backfill location:** `buildOne()`
  does not know an article's family (grouping happens in `main()` via
  `FAMILY_ORDER` / `cardBySlug`). Build a slug→family-title reverse map from
  `FAMILY_ORDER` and stamp `family_title` onto each card — either inside
  `buildOne()` by passing the map in, or in `main()` after the cards are built.
  The plan picks one; both are correct.

Asset base for the `<img>` is the existing per-slug convention:
`./src/assets/generated/probing-articles/assets/<slug>/<rep_figure>` (same path
shape `detail` already uses). Regenerating the builder rewrites all 27 per-slug
JSON files + `index.json` with the new fields; generated assets are git-tracked
and must be committed.

### 3.3 Wiring + behavior (`src/main.js`)

- **Data source:** reuse the existing async index already used by the probing
  route — `loadProbingArticleIndex()` + `probingArticleIndexState` +
  `probingArticleStore`. No new store, no new fetch path.
- **Home render:** `homePage()` passes the loaded article list (when
  `probingArticleIndexState` is an object) to `renderHomeProbingCarousel(...)`,
  inserted between `renderHomeHero()` and `renderHomeModuleCards()`. If the index
  is not yet loaded, the empty-state shell renders and `homePage()` kicks off
  `loadProbingArticleIndex()` (same lazy-load trigger pattern the probing route
  uses).
- **Re-render guard:** `loadProbingArticleIndex()` currently re-renders only for
  `route === 'detail' || route === 'probing'`. Add `'home'` so the home page
  repaints once the index resolves. (Carries the lesson from the earlier
  cold-start probing bug: the guard must include every route that consumes the
  index.)
- **Carousel behavior (DOM/event layer, in `main.js`, not the pure unit):**
  auto-advance on an interval, manual prev/next, and dot navigation. Clicking a
  slide navigates to `#detail/<slug>` (normal hash link — no special handler
  needed). Event binding + the timer live alongside the existing post-render DOM
  wiring in `main.js`. **Init must be idempotent — clear any existing carousel
  timer before starting a new one.** `render()` rebuilds `innerHTML` and re-runs
  post-render wiring on *every* home interaction (filter, search, etc.), so
  starting a fresh `setInterval` without clearing the previous one would stack
  multiple intervals within a single home session. The timer is also cleared
  when leaving the home route, to avoid a dangling interval.

## 4. Data flow

```
build-probing-articles.mjs ──> index.json (articles[] now carry rep_figure + family_title)
                                      │
                          loadProbingArticleIndex()  (async, reused)
                                      │
                          probingArticleIndexState (object)
                                      │
homePage() ──> renderHomeProbingCarousel(articles) ──> static HTML
                                      │
                       main.js post-render: bind prev/next/dots + start timer
                                      │
                       click slide ──> #detail/<slug> ──> existing detail route
```

## 5. Error handling

- Builder: an article with zero figures yields `rep_figure: ""`; the carousel
  slide for it omits the `<img>` (or uses a neutral placeholder block) rather
  than emitting a broken image. NO_FALLBACK fabrication — empty means empty.
- Index load failure (`probingArticleIndexState === 'error'`): the home page
  renders the carousel empty-state shell; the rest of the home page is
  unaffected. No throw, no blank home page.
- A missing/renamed image file does not break the page — `<img>` failure is
  cosmetic and isolated to one slide.

## 6. Testing

- `test/site-chrome.test.js` (pure, node `--test`):
  - `renderHomeProbingCarousel(articles)` emits one slide per article.
  - each slide links to `#detail/<slug>`.
  - each slide renders its `rep_figure` image src under the per-slug asset path.
  - each slide shows its `family_title` badge.
  - the first slide is marked active; prev/next/dot controls are present with
    their `data-*` hooks.
  - empty input returns the placeholder shell (no throw, no slide markup).
- `test/build-probing-articles*.test.js` (or the existing builder test): assert
  every `articles[]` entry carries `rep_figure` and `family_title`, that an
  article with figures gets a non-empty `rep_figure` basename, and that an
  article with zero figures yields `rep_figure: ""` (locks the §5 empty-state
  branch).
- Full `npm test` stays green (current baseline: 164 pass / 0 fail); `npm run
  build` still succeeds.

## 7. Files touched

- `src/siteChrome.js` — add `renderHomeProbingCarousel` (pure).
- `scripts/build-probing-articles.mjs` — emit `rep_figure` + `family_title`.
- `src/assets/generated/probing-articles/*.json` + `index.json` — regenerated
  (committed).
- `src/main.js` — insert carousel into `homePage()`, extend
  `loadProbingArticleIndex()` guard, add carousel DOM wiring + timer.
- `src/styles.css` — carousel layout, reusing existing card visual language; no
  new design system.
- `test/site-chrome.test.js` + builder test — new assertions.

## 8. Success criteria

- Home page shows a rotating set of probing-article slides between the hero and
  the module cards; each links into the correct article detail page.
- Existing hero markup and tests are unchanged.
- Auto-rotation works, manual prev/next + dots work, the timer does not leak
  when leaving home.
- `npm test` green, `npm run build` green, no broken images, no dead links.
