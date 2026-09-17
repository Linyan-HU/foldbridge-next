import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSearchDocuments, renderSearchDocumentHtml } from '../src/search/searchCorpus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'dist', 'search-docs');

function documentFileName(id) {
  const value = String(id || '');
  if (!/^[a-z0-9-]+$/i.test(value)) {
    throw new Error(`unsafe search document id: ${value}`);
  }
  return `${value}.html`;
}

function buildSearchDocs() {
  const documents = buildSearchDocuments();
  fs.mkdirSync(outputDir, { recursive: true });

  for (const document of documents) {
    fs.writeFileSync(
      path.join(outputDir, documentFileName(document.id)),
      renderSearchDocumentHtml(document),
      'utf8',
    );
  }

  fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(documents.map(({ id, href, type }) => ({ id, href, type })), null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`[build-search-docs] wrote ${documents.length} documents to ${outputDir}\n`);
}

buildSearchDocs();
