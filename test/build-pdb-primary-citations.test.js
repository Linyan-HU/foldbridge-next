import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import {
  buildCitationPayload,
  discoverPublishedCases,
  extractPrimaryCitation,
  parseCifCategories,
  tokenizeCif,
  validateCitationPayload
} from '../scripts/build-pdb-primary-citations.mjs';

const SOURCE_LABEL = 'local case mmCIF _citation and _citation_author categories';
const GENERATED_AT = '2026-08-24T12:34:56.000Z';

const singleItemCif = `data_28NT
_citation.id primary
_citation.title
'Structure of the hibernating ribosome.'
_citation.journal_abbrev 'Nucleic Acids Res.'
_citation.journal_full 'Nucleic Acids Research'
_citation.journal_volume 54
_citation.page_first ?
_citation.page_last .
_citation.year 2026
_citation.pdbx_database_id_DOI https://doi.org/10.1093/nar/gkag340
_citation.pdbx_database_id_PubMed 42049235
loop_
_citation_author.citation_id
_citation_author.name
_citation_author.ordinal
primary 'Late numeric' 3
PRIMARY "First Author" 1
secondary 'Excluded Author' 0
primary 'Missing ordinal first' ?
primary "Missing ordinal second" not-a-number
primary 'Second Author' 2
#
`;

const loopCitationCif = `data_1ABC
loop_
_citation.id
_citation.title
_citation.journal_abbrev
_citation.journal_full
_citation.journal_volume
_citation.page_first
_citation.page_last
_citation.year
_citation.pdbx_database_id_DOI
_citation.pdbx_database_id_PubMed
secondary 'A secondary paper' 'Other J.' 'Other Journal' 1 1 2 2001 10.1/secondary 123
PRIMARY "The loop primary paper" ? 'Journal from full name' . ? . 2025 https://doi.org/10.2/primary ?
loop_
_citation_author.citation_id
_citation_author.name
_citation_author.ordinal
primary 'Loop Author' 1
#
`;

async function makeTempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foldbridge-pdb-citations-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

async function createCase(
  caseRoot,
  directoryName,
  {
    cif = singleItemCif,
    structureBytes,
    includeStructure = true,
    includeCaseJson = true,
    includeBrowserManifest = true
  } = {}
) {
  const caseDir = path.join(caseRoot, directoryName);
  await mkdir(caseDir, { recursive: true });
  if (includeCaseJson) await writeFile(path.join(caseDir, 'case.json'), '{}\n');
  if (includeBrowserManifest) {
    await writeFile(path.join(caseDir, 'browser-manifest.json'), '{}\n');
  }
  if (includeStructure) {
    const bytes = structureBytes ?? gzipSync(cif);
    await writeFile(path.join(caseDir, 'structure.cif.gz'), bytes);
  }
  return caseDir;
}

async function snapshotFile(filePath) {
  const [bytes, fileStat] = await Promise.all([
    readFile(filePath),
    stat(filePath, { bigint: true })
  ]);
  return { bytes, mtimeNs: fileStat.mtimeNs };
}

async function assertFileSnapshotUnchanged(filePath, before) {
  const after = await snapshotFile(filePath);
  assert.deepEqual(after.bytes, before.bytes);
  assert.equal(after.mtimeNs, before.mtimeNs);
}

function validPayload() {
  return {
    schemaVersion: 'pdb-primary-citations.v2',
    generatedAt: GENERATED_AT,
    source: SOURCE_LABEL,
    requestedCaseCount: 3,
    sourceStructureCount: 2,
    citationCount: 1,
    unavailableCount: 1,
    missingStructureCount: 1,
    citations: {
      '1AAA': {
        title: 'A paper',
        authors: ['Author, A.'],
        journal: 'RNA',
        volume: '1',
        pageFirst: '',
        pageLast: '',
        year: '2026',
        doi: '10.1/example',
        pubmedId: '123'
      }
    },
    unavailablePdbIds: ['2BBB'],
    missingStructurePdbIds: ['3CCC']
  };
}

test('tokenizeCif handles comments, bare values, single/double quotes, and semicolon text', () => {
  const source = `# leading comment
data_demo
_citation.id primary # trailing comment
_citation.journal_abbrev 'Nucleic Acids Res.'
_citation.journal_full "Nucleic Acids Research"
_citation.title
;
Title on line one
and line two
;
`;

  assert.deepEqual(tokenizeCif(source), [
    'data_demo',
    '_citation.id',
    'primary',
    '_citation.journal_abbrev',
    'Nucleic Acids Res.',
    '_citation.journal_full',
    'Nucleic Acids Research',
    '_citation.title',
    'Title on line one\nand line two'
  ]);
});

test('parseCifCategories combines single items and expands loop rows for wanted categories', () => {
  const categories = parseCifCategories(loopCitationCif, [
    'citation',
    'citation_author'
  ]);

  assert.equal(categories.citation.length, 2);
  assert.equal(categories.citation[1]['_citation.id'], 'PRIMARY');
  assert.equal(
    categories.citation[1]['_citation.journal_full'],
    'Journal from full name'
  );
  assert.deepEqual(categories.citation_author, [
    {
      '_citation_author.citation_id': 'primary',
      '_citation_author.name': 'Loop Author',
      '_citation_author.ordinal': '1'
    }
  ]);

  const singleCategories = parseCifCategories(singleItemCif, ['citation']);
  assert.equal(singleCategories.citation.length, 1);
  assert.equal(
    singleCategories.citation[0]['_citation.title'],
    'Structure of the hibernating ribosome.'
  );
});

test('parseCifCategories rejects loops whose value count does not match the tag count', () => {
  const invalid = `data_bad
loop_
_citation.id
_citation.title
primary 'Complete row'
secondary
`;

  assert.throws(
    () => parseCifCategories(invalid, ['citation']),
    /loop.*value.*count|loop.*row/i
  );
});

test('extractPrimaryCitation normalizes fields and orders only matching primary authors', () => {
  assert.deepEqual(extractPrimaryCitation(singleItemCif), {
    title: 'Structure of the hibernating ribosome.',
    authors: [
      'First Author',
      'Second Author',
      'Late numeric',
      'Missing ordinal first',
      'Missing ordinal second'
    ],
    journal: 'Nucleic Acids Res.',
    volume: '54',
    pageFirst: '',
    pageLast: '',
    year: '2026',
    doi: '10.1093/nar/gkag340',
    pubmedId: '42049235'
  });
});

test('extractPrimaryCitation supports loop citations, journal fallback, and case-insensitive primary ids', () => {
  assert.deepEqual(extractPrimaryCitation(loopCitationCif), {
    title: 'The loop primary paper',
    authors: ['Loop Author'],
    journal: 'Journal from full name',
    volume: '',
    pageFirst: '',
    pageLast: '',
    year: '2025',
    doi: '10.2/primary',
    pubmedId: ''
  });
});

test('extractPrimaryCitation trims semicolon titles and returns null without a usable primary title', () => {
  const multiline = `data_multi
_citation.id PRIMARY
_citation.title
;
  A multiline title
  continued here
;
`;
  assert.equal(
    extractPrimaryCitation(multiline)?.title,
    'A multiline title\n  continued here'
  );

  assert.equal(
    extractPrimaryCitation(`data_none
_citation.id secondary
_citation.title 'Not primary'
`),
    null
  );
  assert.equal(
    extractPrimaryCitation(`data_missing
_citation.id primary
_citation.title ?
`),
    null
  );
});

test('discoverPublishedCases accepts every four-alphanumeric case directory and normalizes ids', async (t) => {
  const root = await makeTempRoot(t);
  await createCase(root, '2bbb');
  await createCase(root, '1AaA');
  await createCase(root, 'ABCDE');
  await createCase(root, 'ABC_');
  await createCase(root, '3CCC', { includeCaseJson: false });
  await createCase(root, '4DDD', { includeBrowserManifest: false });
  const nonFileManifestDir = path.join(root, '5EEE');
  await mkdir(path.join(nonFileManifestDir, 'case.json'), { recursive: true });
  await writeFile(path.join(nonFileManifestDir, 'browser-manifest.json'), '{}\n');

  const cases = discoverPublishedCases(root);
  assert.deepEqual(
    cases.map(({ pdbId }) => pdbId),
    ['1AAA', '2BBB', '3CCC', '4DDD', '5EEE']
  );
  assert.deepEqual(
    cases.map(({ caseDir }) => path.basename(caseDir)),
    ['1AaA', '2bbb', '3CCC', '4DDD', '5EEE']
  );
});

test('discoverPublishedCases rejects duplicate ids after uppercase normalization', () => {
  const originalReaddirSync = fs.readdirSync;
  const originalExistsSync = fs.existsSync;
  const originalStatSync = fs.statSync;
  fs.readdirSync = () => [
    { name: '1abc', isDirectory: () => true },
    { name: '1ABC', isDirectory: () => true }
  ];
  fs.existsSync = () => true;
  fs.statSync = () => ({ isFile: () => true });

  try {
    assert.throws(
      () => discoverPublishedCases('/synthetic/case-root'),
      /duplicate.*1ABC/i
    );
  } finally {
    fs.readdirSync = originalReaddirSync;
    fs.existsSync = originalExistsSync;
    fs.statSync = originalStatSync;
  }
});

test('buildCitationPayload classifies every published case deterministically without mutating structures', async (t) => {
  const root = await makeTempRoot(t);
  const unavailableCif = `data_2BBB
_entry.id 2BBB
_citation.id secondary
_citation.title 'Only a secondary citation'
`;

  await createCase(root, '3ccc', { includeStructure: false });
  const unavailableDir = await createCase(root, '2bBb', { cif: unavailableCif });
  const citationDir = await createCase(root, '1aaa');

  const citationPath = path.join(citationDir, 'structure.cif.gz');
  const unavailablePath = path.join(unavailableDir, 'structure.cif.gz');
  const citationBefore = await snapshotFile(citationPath);
  const unavailableBefore = await snapshotFile(unavailablePath);

  const payload = await buildCitationPayload({ caseRoot: root, generatedAt: GENERATED_AT });

  assert.equal(payload.schemaVersion, 'pdb-primary-citations.v2');
  assert.equal(payload.generatedAt, GENERATED_AT);
  assert.equal(payload.source, SOURCE_LABEL);
  assert.equal(payload.requestedCaseCount, 3);
  assert.equal(payload.sourceStructureCount, 2);
  assert.equal(payload.citationCount, 1);
  assert.equal(payload.unavailableCount, 1);
  assert.equal(payload.missingStructureCount, 1);
  assert.deepEqual(Object.keys(payload.citations), ['1AAA']);
  assert.equal(payload.citations['1AAA'].pubmedId, '42049235');
  assert.deepEqual(payload.unavailablePdbIds, ['2BBB']);
  assert.deepEqual(payload.missingStructurePdbIds, ['3CCC']);
  assert.equal(validateCitationPayload(payload, {
    expectedPdbIds: ['3ccc', '1aaa', '2bbb']
  }), payload);

  await assertFileSnapshotUnchanged(citationPath, citationBefore);
  await assertFileSnapshotUnchanged(unavailablePath, unavailableBefore);
});

test('buildCitationPayload remains deterministic when a published PDB id is all numeric', async (t) => {
  const firstRoot = await makeTempRoot(t);
  const secondRoot = await makeTempRoot(t);
  for (const pdbId of ['2000', '1aaa']) await createCase(firstRoot, pdbId);
  for (const pdbId of ['1aaa', '2000']) await createCase(secondRoot, pdbId);

  const first = await buildCitationPayload({
    caseRoot: firstRoot,
    generatedAt: GENERATED_AT
  });
  const second = await buildCitationPayload({
    caseRoot: secondRoot,
    generatedAt: GENERATED_AT
  });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(new Set(Object.keys(first.citations)), new Set(['1AAA', '2000']));
});

test('buildCitationPayload fails the whole build for bad gzip without changing the source file', async (t) => {
  const root = await makeTempRoot(t);
  const caseDir = await createCase(root, '1BAD', {
    structureBytes: Buffer.from('not a gzip stream')
  });
  const structurePath = path.join(caseDir, 'structure.cif.gz');
  const before = await snapshotFile(structurePath);

  await assert.rejects(
    buildCitationPayload({ caseRoot: root, generatedAt: GENERATED_AT }),
    /1BAD.*gzip|gzip.*1BAD|1BAD.*structure\.cif\.gz/i
  );
  await assertFileSnapshotUnchanged(structurePath, before);
});

test('buildCitationPayload fails the whole build for invalid mmCIF loop cardinality', async (t) => {
  const root = await makeTempRoot(t);
  await createCase(root, '1BAD', {
    cif: `data_bad
loop_
_citation.id
_citation.title
primary 'Complete row'
secondary
`
  });

  await assert.rejects(
    buildCitationPayload({ caseRoot: root, generatedAt: GENERATED_AT }),
    /1BAD.*loop|loop.*1BAD/i
  );
});

test('validateCitationPayload rejects count drift, overlap, incomplete coverage, and malformed records', () => {
  const countDrift = validPayload();
  countDrift.citationCount = 2;
  assert.throws(() => validateCitationPayload(countDrift), /citationCount/i);

  const overlap = validPayload();
  overlap.unavailablePdbIds.push('1AAA');
  overlap.unavailablePdbIds.sort();
  overlap.unavailableCount = 2;
  overlap.sourceStructureCount = 3;
  overlap.requestedCaseCount = 4;
  assert.throws(() => validateCitationPayload(overlap), /overlap|disjoint|duplicate/i);

  const incomplete = validPayload();
  assert.throws(
    () => validateCitationPayload(incomplete, {
      expectedPdbIds: ['1AAA', '2BBB', '3CCC', '4DDD']
    }),
    /coverage|expected|4DDD/i
  );

  const malformed = validPayload();
  malformed.citations['1AAA'].title = '';
  assert.throws(() => validateCitationPayload(malformed), /title/i);

  const extraField = validPayload();
  extraField.citations['1AAA'].url = 'https://example.test';
  assert.throws(() => validateCitationPayload(extraField), /field|url|record/i);
});
