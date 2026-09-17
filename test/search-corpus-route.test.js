import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSearchDocuments, renderSearchDocumentHtml } from '../src/search/searchCorpus.js';

test('PDB search documents use the deployed entry-case route at chain grain', () => {
  const pdbDocs = buildSearchDocuments().filter((doc) => doc.type === 'pdb-case');

  assert.equal(pdbDocs.length, 17843);
  assert.equal(new Set(pdbDocs.map((doc) => doc.href)).size, 17843);
  assert.ok(pdbDocs.every((doc) => doc.href.startsWith('#entry-case?pdb=') && doc.href.includes('&chain=')));
  assert.deepEqual(
    pdbDocs.filter((doc) => doc.content.startsWith('7SYS ')).map((doc) => doc.href).sort(),
    [
      '#entry-case?pdb=7SYS&chain=2',
      '#entry-case?pdb=7SYS&chain=i',
      '#entry-case?pdb=7SYS&chain=z',
    ],
  );
});

test('search document exposes the reader-facing summary as Pagefind metadata', () => {
  const html = renderSearchDocumentHtml({
    type: 'pdb-case',
    title: 'tRNA',
    href: '#entry-case?pdb=6TNA&chain=A',
    tags: ['rna'],
    summary: 'PDB 6TNA · Chain A · tRNA',
    details: '981 profiles · DMS / SHAPE · RMDB',
    content: '6TNA tRNA',
  });

  assert.match(html, /data-pagefind-meta="summary">PDB 6TNA · Chain A · tRNA/);
  assert.match(html, /data-pagefind-meta="details">981 profiles · DMS \/ SHAPE · RMDB/);
});
