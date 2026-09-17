import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { createGunzip } from 'node:zlib';

const SCHEMA_VERSION = 'pdb-primary-citations.v2';
const SOURCE_LABEL = 'local case mmCIF _citation and _citation_author categories';
const PDB_ID_PATTERN = /^[A-Z0-9]{4}$/;
const CITATION_FIELDS = [
  'title',
  'authors',
  'journal',
  'volume',
  'pageFirst',
  'pageLast',
  'year',
  'doi',
  'pubmedId'
];

function sortStrings(values) {
  return [...values].sort((left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

function scanCifTokens(source) {
  if (typeof source !== 'string') {
    throw new TypeError('mmCIF source must be a string');
  }

  const tokens = [];
  let index = 0;
  let lineStart = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) {
      if (source[index] === '\n') lineStart = index + 1;
      index += 1;
    }
    if (index >= source.length) break;

    if (source[index] === '#') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }

    if (source[index] === ';' && index === lineStart) {
      const opening = index;
      let cursor = index + 1;
      let closing = -1;
      let cursorLineStart = lineStart;

      while (cursor < source.length) {
        if (source[cursor] === '\n') {
          cursorLineStart = cursor + 1;
          cursor += 1;
          continue;
        }
        if (source[cursor] === ';' && cursor === cursorLineStart) {
          closing = cursor;
          break;
        }
        cursor += 1;
      }

      if (closing < 0) {
        throw new Error('unterminated semicolon-delimited mmCIF value');
      }

      let contentStart = opening + 1;
      if (source[contentStart] === '\r' && source[contentStart + 1] === '\n') {
        contentStart += 2;
      } else if (source[contentStart] === '\n') {
        contentStart += 1;
      }

      let contentEnd = closing;
      if (contentEnd > contentStart && source[contentEnd - 1] === '\n') {
        contentEnd -= 1;
        if (contentEnd > contentStart && source[contentEnd - 1] === '\r') {
          contentEnd -= 1;
        }
      }

      tokens.push({
        value: source.slice(contentStart, contentEnd),
        quoted: true
      });
      index = closing + 1;
      lineStart = closing;
      continue;
    }

    if (source[index] === "'" || source[index] === '"') {
      const quote = source[index];
      const valueStart = index + 1;
      let cursor = valueStart;
      let closing = -1;

      while (cursor < source.length) {
        if (source[cursor] === '\n') lineStart = cursor + 1;
        if (
          source[cursor] === quote
          && (cursor + 1 === source.length || /\s/.test(source[cursor + 1]))
        ) {
          closing = cursor;
          break;
        }
        cursor += 1;
      }

      if (closing < 0) throw new Error(`unterminated ${quote}-quoted mmCIF value`);
      tokens.push({ value: source.slice(valueStart, closing), quoted: true });
      index = closing + 1;
      continue;
    }

    const valueStart = index;
    while (index < source.length && !/\s/.test(source[index])) index += 1;
    tokens.push({ value: source.slice(valueStart, index), quoted: false });
  }

  return tokens;
}

export function tokenizeCif(source) {
  return scanCifTokens(source).map(({ value }) => value);
}

function normalizeCategoryName(category) {
  if (typeof category !== 'string' || !category.trim()) {
    throw new TypeError('wanted mmCIF category names must be non-empty strings');
  }
  return category.trim().replace(/^_/, '').split('.')[0].toLowerCase();
}

function tagCategory(tag) {
  return tag.slice(1).split('.')[0].toLowerCase();
}

function isTag(token) {
  return !token.quoted && token.value.startsWith('_');
}

function isControl(token, control) {
  return !token.quoted && token.value.toLowerCase() === control;
}

function isDataBlock(token) {
  return !token.quoted && token.value.toLowerCase().startsWith('data_');
}

function isSaveFrameControl(token) {
  return !token.quoted && token.value.toLowerCase().startsWith('save_');
}

function isLoopBoundary(token) {
  return isTag(token)
    || isControl(token, 'loop_')
    || isControl(token, 'stop_')
    || isControl(token, 'global_')
    || isDataBlock(token)
    || isSaveFrameControl(token);
}

export function parseCifCategories(source, wantedCategories) {
  if (!wantedCategories || typeof wantedCategories[Symbol.iterator] !== 'function') {
    throw new TypeError('wantedCategories must be iterable');
  }

  const wanted = [...wantedCategories].map(normalizeCategoryName);
  if (new Set(wanted).size !== wanted.length) {
    throw new Error('wantedCategories contains duplicate category names');
  }

  const wantedSet = new Set(wanted);
  const categories = Object.fromEntries(wanted.map((category) => [category, []]));
  const tokens = scanCifTokens(source);
  const singleRows = new Map();
  let foundDataBlock = false;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (isDataBlock(token)) {
      if (token.value.length === 5) throw new Error('mmCIF data block name must not be empty');
      foundDataBlock = true;
      singleRows.clear();
      index += 1;
      continue;
    }

    if (isControl(token, 'loop_')) {
      singleRows.clear();
      index += 1;
      const tags = [];
      while (index < tokens.length && isTag(tokens[index])) {
        tags.push(tokens[index].value.toLowerCase());
        index += 1;
      }
      if (tags.length === 0) throw new Error('mmCIF loop_ must declare at least one tag');

      const values = [];
      while (index < tokens.length && !isLoopBoundary(tokens[index])) {
        values.push(tokens[index].value);
        index += 1;
      }
      if (values.length % tags.length !== 0) {
        throw new Error(
          `mmCIF loop value count ${values.length} does not form complete rows of ${tags.length}`
        );
      }

      for (let offset = 0; offset < values.length; offset += tags.length) {
        const rowsByCategory = new Map();
        tags.forEach((tag, tagIndex) => {
          const category = tagCategory(tag);
          if (!wantedSet.has(category)) return;
          if (!rowsByCategory.has(category)) rowsByCategory.set(category, {});
          rowsByCategory.get(category)[tag] = values[offset + tagIndex];
        });
        for (const [category, row] of rowsByCategory) categories[category].push(row);
      }

      if (index < tokens.length && isControl(tokens[index], 'stop_')) index += 1;
      continue;
    }

    if (isTag(token)) {
      if (index + 1 >= tokens.length || isLoopBoundary(tokens[index + 1])) {
        throw new Error(`mmCIF item ${token.value} is missing a value`);
      }
      const tag = token.value.toLowerCase();
      const category = tagCategory(tag);
      if (wantedSet.has(category)) {
        let row = singleRows.get(category);
        if (!row || Object.hasOwn(row, tag)) {
          row = {};
          categories[category].push(row);
          singleRows.set(category, row);
        }
        row[tag] = tokens[index + 1].value;
      }
      index += 2;
      continue;
    }

    if (
      isControl(token, 'stop_')
      || isControl(token, 'global_')
      || isSaveFrameControl(token)
    ) {
      singleRows.clear();
      index += 1;
      continue;
    }

    throw new Error(`unexpected mmCIF token outside an item or loop: ${token.value}`);
  }

  if (!foundDataBlock) throw new Error('mmCIF source contains no data_ block');
  return categories;
}

function normalizeCifValue(value) {
  if (value === undefined || value === null) return '';
  const normalized = String(value).trim();
  return normalized === '.' || normalized === '?' ? '' : normalized;
}

function numericOrdinal(value) {
  const normalized = normalizeCifValue(value);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function extractPrimaryCitation(source) {
  const categories = parseCifCategories(source, ['citation', 'citation_author']);
  const primary = categories.citation.find(
    (row) => normalizeCifValue(row['_citation.id']).toLowerCase() === 'primary'
  );
  if (!primary) return null;

  const title = normalizeCifValue(primary['_citation.title']);
  if (!title) return null;

  const authors = categories.citation_author
    .map((row, sourceIndex) => ({
      row,
      sourceIndex,
      ordinal: numericOrdinal(row['_citation_author.ordinal'])
    }))
    .filter(({ row }) => (
      normalizeCifValue(row['_citation_author.citation_id']).toLowerCase() === 'primary'
    ))
    .sort((left, right) => {
      if (left.ordinal !== null && right.ordinal !== null) {
        return left.ordinal - right.ordinal || left.sourceIndex - right.sourceIndex;
      }
      if (left.ordinal !== null) return -1;
      if (right.ordinal !== null) return 1;
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ row }) => normalizeCifValue(row['_citation_author.name']));

  const journalAbbrev = normalizeCifValue(primary['_citation.journal_abbrev']);
  const doi = normalizeCifValue(primary['_citation.pdbx_database_id_doi'])
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');

  return {
    title,
    authors,
    journal: journalAbbrev || normalizeCifValue(primary['_citation.journal_full']),
    volume: normalizeCifValue(primary['_citation.journal_volume']),
    pageFirst: normalizeCifValue(primary['_citation.page_first']),
    pageLast: normalizeCifValue(primary['_citation.page_last']),
    year: normalizeCifValue(primary['_citation.year']),
    doi,
    pubmedId: normalizeCifValue(primary['_citation.pdbx_database_id_pubmed'])
  };
}

export function discoverPublishedCases(caseRoot) {
  if (typeof caseRoot !== 'string' || !caseRoot.trim()) {
    throw new TypeError('caseRoot must be a non-empty path string');
  }
  const resolvedRoot = path.resolve(caseRoot);
  const casesByPdbId = new Map();

  for (const entry of fs.readdirSync(resolvedRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[A-Za-z0-9]{4}$/.test(entry.name)) continue;
    const caseDir = path.join(resolvedRoot, entry.name);
    const pdbId = entry.name.toUpperCase();
    if (casesByPdbId.has(pdbId)) {
      throw new Error(
        `duplicate published case id after uppercase normalization: ${pdbId}`
      );
    }
    casesByPdbId.set(pdbId, {
      pdbId,
      caseDir,
      structurePath: path.join(caseDir, 'structure.cif.gz')
    });
  }

  return sortStrings(casesByPdbId.keys()).map((pdbId) => casesByPdbId.get(pdbId));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireCount(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function requireNormalizedPdbId(value, label) {
  if (typeof value !== 'string' || !PDB_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be an uppercase four-alphanumeric PDB id`);
  }
}

function requireSortedUniquePdbIds(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const seen = new Set();
  value.forEach((pdbId, index) => {
    requireNormalizedPdbId(pdbId, `${label}[${index}]`);
    if (seen.has(pdbId)) throw new Error(`${label} contains duplicate PDB id ${pdbId}`);
    seen.add(pdbId);
  });
  if (value.some((pdbId, index) => pdbId !== sortStrings(value)[index])) {
    throw new Error(`${label} must be sorted`);
  }
  return seen;
}

function validateCitationRecord(record, pdbId) {
  requireObject(record, `citation ${pdbId}`);
  const fields = Object.keys(record);
  if (
    fields.length !== CITATION_FIELDS.length
    || CITATION_FIELDS.some((field) => !Object.hasOwn(record, field))
  ) {
    throw new Error(`citation ${pdbId} record fields are invalid`);
  }

  if (typeof record.title !== 'string' || !record.title.trim()) {
    throw new Error(`citation ${pdbId} title must be a non-empty string`);
  }
  if (record.title !== record.title.trim()) {
    throw new Error(`citation ${pdbId} title must be trimmed`);
  }
  if (!Array.isArray(record.authors)) {
    throw new Error(`citation ${pdbId} authors must be an array`);
  }
  record.authors.forEach((author, index) => {
    if (typeof author !== 'string' || author !== author.trim()) {
      throw new Error(`citation ${pdbId} authors[${index}] must be a trimmed string`);
    }
  });

  for (const field of CITATION_FIELDS) {
    if (field === 'authors' || field === 'title') continue;
    if (typeof record[field] !== 'string' || record[field] !== record[field].trim()) {
      throw new Error(`citation ${pdbId} ${field} must be a trimmed string`);
    }
  }
  if (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(record.doi)) {
    throw new Error(`citation ${pdbId} doi must not contain a doi.org URL prefix`);
  }
}

function normalizeExpectedPdbIds(expectedPdbIds) {
  if (!expectedPdbIds || typeof expectedPdbIds[Symbol.iterator] !== 'function') {
    throw new TypeError('expectedPdbIds must be iterable when provided');
  }
  const normalized = [...expectedPdbIds].map((value, index) => {
    if (typeof value !== 'string') {
      throw new Error(`expectedPdbIds[${index}] must be a string`);
    }
    const pdbId = value.trim().toUpperCase();
    requireNormalizedPdbId(pdbId, `expectedPdbIds[${index}]`);
    return pdbId;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('expectedPdbIds contains duplicate ids after uppercase normalization');
  }
  return new Set(normalized);
}

export function validateCitationPayload(payload, { expectedPdbIds } = {}) {
  requireObject(payload, 'citation payload');
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`citation payload schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (payload.source !== SOURCE_LABEL) {
    throw new Error(`citation payload source must be ${SOURCE_LABEL}`);
  }
  if (
    typeof payload.generatedAt !== 'string'
    || !Number.isFinite(Date.parse(payload.generatedAt))
  ) {
    throw new Error('citation payload generatedAt must be an ISO date string');
  }

  for (const countField of [
    'requestedCaseCount',
    'sourceStructureCount',
    'citationCount',
    'unavailableCount',
    'missingStructureCount'
  ]) {
    requireCount(payload[countField], `citation payload ${countField}`);
  }

  requireObject(payload.citations, 'citation payload citations');
  const citationPdbIds = Object.keys(payload.citations);
  citationPdbIds.forEach((pdbId) => {
    requireNormalizedPdbId(pdbId, 'citation key');
    validateCitationRecord(payload.citations[pdbId], pdbId);
  });

  const unavailable = requireSortedUniquePdbIds(
    payload.unavailablePdbIds,
    'citation payload unavailablePdbIds'
  );
  const missing = requireSortedUniquePdbIds(
    payload.missingStructurePdbIds,
    'citation payload missingStructurePdbIds'
  );
  const union = new Set();
  for (const [classification, pdbIds] of [
    ['citations', citationPdbIds],
    ['unavailablePdbIds', unavailable],
    ['missingStructurePdbIds', missing]
  ]) {
    for (const pdbId of pdbIds) {
      if (union.has(pdbId)) {
        throw new Error(`citation classifications overlap at ${pdbId} (${classification})`);
      }
      union.add(pdbId);
    }
  }

  if (payload.citationCount !== citationPdbIds.length) {
    throw new Error('citation payload citationCount does not match citations');
  }
  if (payload.unavailableCount !== unavailable.size) {
    throw new Error('citation payload unavailableCount does not match unavailablePdbIds');
  }
  if (payload.missingStructureCount !== missing.size) {
    throw new Error(
      'citation payload missingStructureCount does not match missingStructurePdbIds'
    );
  }
  if (payload.sourceStructureCount !== citationPdbIds.length + unavailable.size) {
    throw new Error(
      'citation payload sourceStructureCount must equal citations plus unavailable cases'
    );
  }
  if (payload.requestedCaseCount !== union.size) {
    throw new Error('citation payload requestedCaseCount does not match classification coverage');
  }
  if (payload.requestedCaseCount !== payload.sourceStructureCount + missing.size) {
    throw new Error(
      'citation payload requestedCaseCount must equal source structures plus missing structures'
    );
  }

  if (expectedPdbIds !== undefined) {
    const expected = normalizeExpectedPdbIds(expectedPdbIds);
    const missingExpected = sortStrings([...expected].filter((pdbId) => !union.has(pdbId)));
    const unexpected = sortStrings([...union].filter((pdbId) => !expected.has(pdbId)));
    if (missingExpected.length || unexpected.length) {
      throw new Error(
        `citation payload coverage does not match expected PDB ids; missing=${missingExpected.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}`
      );
    }
  }

  return payload;
}

export async function buildCitationPayload({ caseRoot, generatedAt } = {}) {
  const publishedCases = discoverPublishedCases(caseRoot);
  const citations = {};
  const unavailablePdbIds = [];
  const missingStructurePdbIds = [];

  for (const publishedCase of publishedCases) {
    const { pdbId, structurePath } = publishedCase;
    if (!fs.existsSync(structurePath)) {
      missingStructurePdbIds.push(pdbId);
      continue;
    }

    let citation;
    try {
      const source = await readCitationHeader(structurePath);
      citation = extractPrimaryCitation(source);
    } catch (error) {
      throw new Error(
        `failed to read or parse ${pdbId} structure.cif.gz: ${error.message}`,
        { cause: error }
      );
    }

    if (citation) citations[pdbId] = citation;
    else unavailablePdbIds.push(pdbId);
  }

  const citationCount = Object.keys(citations).length;
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: generatedAt === undefined ? new Date().toISOString() : generatedAt,
    source: SOURCE_LABEL,
    requestedCaseCount: publishedCases.length,
    sourceStructureCount: citationCount + unavailablePdbIds.length,
    citationCount,
    unavailableCount: unavailablePdbIds.length,
    missingStructureCount: missingStructurePdbIds.length,
    citations,
    unavailablePdbIds,
    missingStructurePdbIds
  };

  return validateCitationPayload(payload, {
    expectedPdbIds: publishedCases.map(({ pdbId }) => pdbId)
  });
}

function readCitationHeader(structurePath) {
  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const input = fs.createReadStream(structurePath);
    const gunzip = createGunzip();
    let source = '';
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      input.destroy();
      gunzip.destroy();
      reject(error);
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      input.destroy();
      gunzip.destroy();
      resolve(source);
    };

    input.on('error', fail);
    gunzip.on('error', fail);
    gunzip.on('data', (chunk) => {
      try {
        source += decoder.decode(chunk, { stream: true });
      } catch (error) {
        fail(error);
        return;
      }
      const authorStart = source.indexOf('_citation_author.');
      const authorEnd = authorStart < 0 ? -1 : source.indexOf('\n#', authorStart);
      if (authorEnd >= 0) {
        source = `${source.slice(0, authorEnd + 2)}\n`;
        finish();
      }
    });
    gunzip.on('end', () => {
      if (settled) return;
      try {
        source += decoder.decode();
        finish();
      } catch (error) {
        fail(error);
      }
    });
    input.pipe(gunzip);
  });
}
