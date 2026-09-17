import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveEntryStatsContract } from '../src/statsDashboard.js';

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
}

function validateTechnologyRegistry(registry) {
  requireObject(registry, 'technology registry');
  if (registry.schema_version !== 'probe-tech-registry.v1') {
    throw new Error(`technology registry schema_version is incompatible: ${registry.schema_version}`);
  }
  requireNonEmptyArray(registry.technologies, 'technology registry technologies');
  const names = new Set();
  registry.technologies.forEach((item, index) => {
    requireObject(item, `technology ${index}`);
    if (typeof item.technology !== 'string' || !item.technology.trim()) {
      throw new Error(`technology ${index} technology must be a non-empty string`);
    }
    const name = item.technology.trim();
    if (names.has(name)) throw new Error(`duplicate technology: ${name}`);
    names.add(name);
  });
  return names.size;
}

function validateArticleIndex(index) {
  requireObject(index, 'article index');
  if (index.schema_version !== 'probing-articles.v1') {
    throw new Error(`article index schema_version is incompatible: ${index.schema_version}`);
  }
  requireNonEmptyArray(index.articles, 'article index articles');
  if (!Number.isInteger(index.article_count) || index.article_count !== index.articles.length) {
    throw new Error(`article_count must equal articles length (${index.articles.length})`);
  }
  const slugs = new Set();
  index.articles.forEach((article, articleIndex) => {
    requireObject(article, `article ${articleIndex}`);
    if (typeof article.slug !== 'string' || !article.slug.trim()) {
      throw new Error(`article ${articleIndex} slug must be a non-empty string`);
    }
    const slug = article.slug.trim();
    if (slugs.has(slug)) throw new Error(`duplicate article slug: ${slug}`);
    slugs.add(slug);
  });
  return index.article_count;
}

export function deriveStats({ entryTable, technologyRegistry, articleIndex }) {
  requireObject(entryTable, 'entry table');
  if (entryTable.schemaVersion !== 'entry-table.v1') {
    throw new Error(`entry table schemaVersion is incompatible: ${entryTable.schemaVersion}`);
  }
  requireNonEmptyArray(entryTable.rows, 'entry table rows');
  if (!Number.isInteger(entryTable.rowCount) || entryTable.rowCount !== entryTable.rows.length) {
    throw new Error(`entry table rowCount must equal rows length (${entryTable.rows.length})`);
  }

  const entryContract = deriveEntryStatsContract(entryTable.rows);
  const registeredTechnologies = validateTechnologyRegistry(technologyRegistry);
  const explainerArticles = validateArticleIndex(articleIndex);

  return {
    schema_version: 'site-stats.v2',
    entry_schema_version: entryTable.schemaVersion,
    entry_contract: entryContract,
    metrics: {
      ...entryContract.metrics,
      registered_technologies: registeredTechnologies,
      explainer_articles: explainerArticles
    },
    distributions: entryContract.distributions
  };
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to read ${label} at ${filePath}: ${error.message}`);
  }
}

function buildSiteStats() {
  const scriptPath = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(scriptPath), '..');
  const stats = deriveStats({
    entryTable: readJson(path.join(root, 'src/assets/generated/entry-table/entry-table.json'), 'entry table'),
    technologyRegistry: readJson(path.join(root, 'src/assets/data/probe-technology-registry.json'), 'technology registry'),
    articleIndex: readJson(path.join(root, 'src/assets/generated/probing-articles/index.json'), 'article index')
  });

  const outDir = path.join(root, 'src/assets/generated/site-stats');
  const outPath = path.join(outDir, 'stats.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
  process.stdout.write(`[build-site-stats] wrote ${outPath}\n`);
  process.stdout.write(`[build-site-stats] chains=${stats.metrics.rna_chains} pdbs=${stats.metrics.pdb_structures}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildSiteStats();
}
