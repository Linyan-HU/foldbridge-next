import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants as FS_CONSTANTS,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { open as openFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

import {
  MECHANISM_FAMILIES,
  buildTechniqueTaxonomySnapshot,
  classifyTechniqueFilter,
} from '../src/techniqueFilterModel.js';
import {
  PROFILE_PUBLIC_TECHNIQUES_SCHEMA,
  validateProfilePublicTechniques,
} from '../public/entry-cases/__entry_v3_site__/workbench-pure.mjs';

export const LEGACY_BUILDER_VERSION = 'case-public-techniques-builder.v1';
export const BUILDER_VERSION = 'case-public-techniques-builder.v2';
// V2 remains the immutable data-only contract used by the historical Task 5 runs.
export const LEGACY_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v2';
export const SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v4';
export const PREVIEW_BUILDER_VERSION = 'case-public-techniques-preview-builder.v2';
export const PREVIEW_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v3';
export const PREVIEW_PROVENANCE_SCHEMA = 'case-public-techniques-preview.v2';
export const PREVIEW_ARTIFACT_KIND = 'pilot-preview';
export const APPROVED_PREVIEW_BASELINE_ANCHOR = Object.freeze({
  run: '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/pilot-20260828T160812Z-f53fbdb138d2',
  sha256: 'c0e5c91055d49c1503944551fb198e45fa07153862e1f0a9634692d1d136a65e',
});
export const PREVIEW_GLOBAL_DIRECTORIES = Object.freeze([
  'entry-cases/__entry_v3_site__',
  'entry-cases/__entry_ef_site__',
]);
export const PREVIEW_GLOBAL_FILES = Object.freeze([
  'src/assets/generated/pdb-primary-citations/index.json',
  'src/assets/header/aboutus.svg',
  'src/assets/header/database.svg',
  'src/assets/header/gznl2.svg',
  'src/assets/header/home.svg',
  'src/assets/header/research.svg',
  'src/portalChrome.js',
  'src/siteChrome.js',
  'src/statsDashboard.js',
]);
export const PREVIEW_SOURCE_CLOSURE_PATHS = Object.freeze([
  'package.json',
  'scripts/build-case-public-techniques-preview.mjs',
  'scripts/build-case-public-techniques.mjs',
  'scripts/case-public-techniques-lib.mjs',
  'scripts/extract-case-public-techniques.py',
  'scripts/safe-openat-capture.py',
  'scripts/verify-case-public-techniques.mjs',
  'scripts/version-ef-entry-assets.mjs',
  'src/techniqueFilterModel.js',
  'public/entry-cases/__entry_v3_site__/workbench-pure.mjs',
]);
export const COVERAGE_SCHEMA = 'case-public-techniques-coverage.v1';
export const MAX_DB_ONLY_AUDIT_SUMMARY_BYTES = 32 * 1024 * 1024;
export const MAX_GLOBAL_AUDIT_STDOUT_BYTES = 64 * 1024 * 1024;
export const MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_MANIFEST_BYTES = 64 * 1024 * 1024;
export const MAX_PREVIEW_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_PREVIEW_MANIFEST_BYTES = 64 * 1024 * 1024;
// One auditable ceiling applies to both compressed capture and decompressed JSON bytes.
export const MAX_PROFILE_INDEX_BYTES = 32 * 1024 * 1024;
export const MAX_SAFE_HELPER_STRUCTURED_OUTPUT_BYTES = 32 * 1024 * 1024;
export const MAX_SAFE_HELPER_CAPTURE_OUTPUT_BYTES = 96 * 1024 * 1024;
export const SAFE_OPENAT_HELPER_PATH = fileURLToPath(new URL('./safe-openat-capture.py', import.meta.url));
export const RUN_ID_PATTERN = /^(?<kind>pilot|full)-(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})T(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})Z-(?<git12>[0-9a-f]{12})$/;
export const STATUS_NAMES = ['mapped', 'partially_mapped', 'unmapped', 'background', 'missing'];
export const EXTRACTOR_ROW_FIELDS = [
  'ordinal',
  'pdbId',
  'authChain',
  'chainKey',
  'profileId',
  'techFilter',
  'isBackgroundChannel',
];
export const GLOBAL_AUDIT_ROW_FIELDS = [
  'pdbId',
  'authChain',
  'techFilter',
  'isBackgroundChannel',
  'profileCount',
];

export const CLASSIFICATION_EXCEPTION_SCOPES = Object.freeze([
  'global',
  'selected-public-sidecar',
  'selected-chain-db-only',
  'unselected-profile-index-chain',
  'no-profile-index-chain',
]);
export const CLASSIFICATION_EXCEPTION_TYPES = Object.freeze([
  'unmapped-technique',
  'non-background-null',
]);

export const REPORT_HEADERS = Object.freeze({
  joinFailures: ['ordinal', 'pdbId', 'authChain', 'error'],
  dbOnly: ['ordinal', 'pdbId', 'authChain', 'profileId', 'techFilter', 'isBackgroundChannel'],
  unmapped: ['ordinal', 'pdbId', 'authChain', 'profileId', 'label'],
  nullTechniques: ['ordinal', 'pdbId', 'authChain', 'profileId', 'isBackgroundChannel'],
  classificationExceptions: ['scope', 'exceptionType', 'techniqueLabel', 'profileCount', 'chainCount'],
});

const textEncoder = new TextEncoder();

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertStrictIdentity(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty string without surrounding whitespace`);
  }
}

function dbOnlyAuditSelectionContext(selection) {
  if (!Array.isArray(selection)) throw new TypeError('DB-only audit selection must be an array');
  const chainOrdinals = new Map();
  selection.forEach((item, ordinal) => {
    assertExactFields(item, ['pdbId', 'authChain'], `DB-only audit selection[${ordinal}]`);
    assertStrictIdentity(item.pdbId, `DB-only audit selection[${ordinal}].pdbId`);
    assertStrictIdentity(item.authChain, `DB-only audit selection[${ordinal}].authChain`);
    const key = `${item.pdbId}\0${item.authChain}`;
    if (chainOrdinals.has(key)) throw new Error(`DB-only audit selection has duplicate chain ${item.pdbId}/${item.authChain}`);
    chainOrdinals.set(key, ordinal);
  });
  return chainOrdinals;
}

function validateDbOnlyAuditSummaryWithContext(summary, chainOrdinals) {
  if (!Array.isArray(summary)) throw new TypeError('dbOnlyAuditSummary must be an array');
  let previous = null;
  summary.forEach((row, index) => {
    assertExactFields(
      row,
      ['pdbId', 'authChain', 'techFilter', 'isBackgroundChannel', 'count'],
      `dbOnlyAuditSummary[${index}]`,
    );
    assertStrictIdentity(row.pdbId, `dbOnlyAuditSummary[${index}].pdbId`);
    assertStrictIdentity(row.authChain, `dbOnlyAuditSummary[${index}].authChain`);
    if (row.techFilter !== null && typeof row.techFilter !== 'string') {
      throw new TypeError(`dbOnlyAuditSummary[${index}].techFilter must be a string or null`);
    }
    if (row.isBackgroundChannel !== null && typeof row.isBackgroundChannel !== 'boolean') {
      throw new TypeError(`dbOnlyAuditSummary[${index}].isBackgroundChannel must be boolean or null`);
    }
    if (!Number.isSafeInteger(row.count) || row.count <= 0) {
      throw new TypeError(`dbOnlyAuditSummary[${index}].count must be a positive safe integer`);
    }
    const chainKey = `${row.pdbId}\0${row.authChain}`;
    const chainOrdinal = chainOrdinals.get(chainKey);
    if (chainOrdinal === undefined) throw new Error(`dbOnlyAuditSummary[${index}] references an unselected chain`);
    const comparable = { row, chainOrdinal };
    if (previous !== null) {
      const chainOrder = previous.chainOrdinal - comparable.chainOrdinal;
      let techniqueOrder = 0;
      if (chainOrder === 0) {
        if (previous.row.techFilter === null && row.techFilter !== null) techniqueOrder = -1;
        else if (previous.row.techFilter !== null && row.techFilter === null) techniqueOrder = 1;
        else if (previous.row.techFilter !== null && row.techFilter !== null) {
          techniqueOrder = compareUtf8(previous.row.techFilter, row.techFilter);
        }
      }
      const backgroundOrder = chainOrder === 0 && techniqueOrder === 0
        ? backgroundAuditRank(previous.row.isBackgroundChannel) - backgroundAuditRank(row.isBackgroundChannel)
        : 0;
      const order = chainOrder || techniqueOrder || backgroundOrder;
      if (order >= 0) {
        const problem = order === 0 ? 'duplicate exact key' : 'non-deterministic sort order';
        throw new Error(`dbOnlyAuditSummary[${index}] has ${problem}`);
      }
    }
    previous = comparable;
  });
  return summary;
}

function backgroundAuditRank(value) {
  if (value === null) return 0;
  return value === false ? 1 : 2;
}

export function validateDbOnlyAuditSummary(summary, selection) {
  return validateDbOnlyAuditSummaryWithContext(summary, dbOnlyAuditSelectionContext(selection));
}

export function createBoundedDbOnlyAuditSummaryAccumulator({
  selection,
  maxBytes = MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
} = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 3) {
    throw new TypeError('DB-only audit summary maxBytes must be a safe integer of at least 3 bytes');
  }
  const chainOrdinals = dbOnlyAuditSelectionContext(selection);
  validateDbOnlyAuditSummaryWithContext([], chainOrdinals);
  const summary = [];
  let byteLength = textEncoder.encode(deterministicJson(summary)).byteLength;
  let finished = false;

  return {
    append(rows) {
      if (finished) throw new Error('DB-only audit summary accumulator is already finished');
      validateDbOnlyAuditSummaryWithContext(rows, chainOrdinals);
      if (summary.length > 0 && rows.length > 0) {
        validateDbOnlyAuditSummaryWithContext([summary.at(-1), rows[0]], chainOrdinals);
      }
      for (const row of rows) {
        const rowBytes = textEncoder.encode(deterministicJson(row)).byteLength - 1;
        const nextByteLength = byteLength + rowBytes + (summary.length > 0 ? 1 : 0);
        if (nextByteLength > maxBytes) {
          throw new Error(
            `DB-only audit summary exceeds ${maxBytes} canonical JSON UTF-8 bytes`,
          );
        }
        summary.push(row);
        byteLength = nextByteLength;
      }
      return summary.length;
    },
    finish() {
      finished = true;
      validateDbOnlyAuditSummaryWithContext(summary, chainOrdinals);
      return summary;
    },
    get byteLength() {
      return byteLength;
    },
  };
}

export function validateRunId(runId) {
  if (typeof runId !== 'string') throw new TypeError('run-id must be a string');
  const match = RUN_ID_PATTERN.exec(runId);
  if (!match?.groups) {
    throw new Error('run-id must match <pilot|full>-<real YYYYMMDDTHHMMSSZ UTC>-<12 lowercase hex>');
  }
  const fields = Object.fromEntries(
    ['year', 'month', 'day', 'hour', 'minute', 'second']
      .map((field) => [field, Number(match.groups[field])]),
  );
  const instant = new Date(Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
  ));
  if (
    !Number.isFinite(instant.getTime())
    || instant.getUTCFullYear() !== fields.year
    || instant.getUTCMonth() + 1 !== fields.month
    || instant.getUTCDate() !== fields.day
    || instant.getUTCHours() !== fields.hour
    || instant.getUTCMinutes() !== fields.minute
    || instant.getUTCSeconds() !== fields.second
  ) {
    throw new Error(`run-id contains an impossible UTC calendar timestamp: ${runId}`);
  }
  return {
    kind: match.groups.kind,
    timestamp: `${match.groups.year}${match.groups.month}${match.groups.day}`
      + `T${match.groups.hour}${match.groups.minute}${match.groups.second}Z`,
    git12: match.groups.git12,
  };
}

export function validateIsoUtcInstant(value, field = 'UTC timestamp') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${field} must be a strict ISO UTC timestamp with milliseconds`);
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    throw new Error(`${field} must be a real ISO UTC instant`);
  }
  return instant.getTime();
}

export function assertExactFields(value, fields, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const expected = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) throw new Error(`${label} has unknown field "${field}"`);
  }
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`${label} is missing field "${field}"`);
    }
  }
}

function validateAnchoredFileRecord(record, label) {
  assertExactFields(record, ['path', 'size', 'mtimeNs', 'inode', 'device', 'sha256'], label);
  if (typeof record.path !== 'string' || !path.isAbsolute(record.path)) {
    throw new Error(`${label}.path must be absolute`);
  }
  if (!Number.isSafeInteger(record.size) || record.size < 0) {
    throw new Error(`${label}.size must be a non-negative safe integer`);
  }
  for (const field of ['mtimeNs', 'inode', 'device']) {
    if (typeof record[field] !== 'string' || !/^(?:0|[1-9]\d*)$/.test(record[field])) {
      throw new Error(`${label}.${field} must be a canonical non-negative integer string`);
    }
  }
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) {
    throw new Error(`${label}.sha256 must be lowercase SHA-256`);
  }
  return record;
}

function canonicalBase64Bytes(value, label) {
  if (typeof value !== 'string' || value.length % 4 !== 0) {
    throw new Error(`${label} must be canonical base64`);
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const dataLength = value.length - padding;
  for (let index = 0; index < dataLength; index += 1) {
    const code = value.charCodeAt(index);
    const isCanonicalAlphabet = (
      (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || (code >= 0x30 && code <= 0x39)
      || code === 0x2b
      || code === 0x2f
    );
    if (!isCanonicalAlphabet) throw new Error(`${label} must be canonical base64`);
  }
  for (let index = dataLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 0x3d) throw new Error(`${label} must be canonical base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error(`${label} is not canonical base64`);
  return bytes;
}

function helperMaxBuffer(operation) {
  return (operation === 'capture'
    ? MAX_SAFE_HELPER_CAPTURE_OUTPUT_BYTES
    : MAX_SAFE_HELPER_STRUCTURED_OUTPUT_BYTES) + 1;
}

export function runSafeOpenatHelper({ python, request }) {
  if (typeof python !== 'string' || python.length === 0) throw new Error('Safe-openat python must be a path');
  if (!isRecord(request) || !['capture', 'inventory', 'tree', 'sha256', 'materialize'].includes(request.operation)) {
    throw new Error('Safe-openat request operation is invalid');
  }
  const result = spawnSync(python, [SAFE_OPENAT_HELPER_PATH], {
    input: Buffer.from(deterministicJson(request)),
    encoding: null,
    maxBuffer: helperMaxBuffer(request.operation),
  });
  if (result.error) throw new Error(`Safe-openat helper launch failed: ${result.error.message}`);
  if (result.signal !== null) throw new Error(`Safe-openat helper terminated by signal ${result.signal}`);
  if (result.status !== 0) {
    const detail = result.stderr?.toString('utf8').trim() || `exit ${result.status}`;
    throw new Error(`Safe-openat helper failed: ${detail}`);
  }
  if (!Buffer.isBuffer(result.stderr) || result.stderr.length !== 0) {
    throw new Error(`Safe-openat helper emitted stderr on success: ${result.stderr?.toString('utf8')}`);
  }
  const stdout = result.stdout;
  if (!Buffer.isBuffer(stdout) || stdout.length === 0 || stdout.at(-1) !== 0x0a || stdout.subarray(0, -1).includes(0x0a)) {
    throw new Error('Safe-openat helper stdout must be exactly one JSON line');
  }
  let response;
  try {
    response = JSON.parse(stdout.subarray(0, -1).toString('utf8'));
  } catch (error) {
    throw new Error(`Safe-openat helper returned invalid JSON: ${error.message}`);
  }
  if (!isRecord(response) || response.operation !== request.operation) {
    throw new Error('Safe-openat helper response operation drifted');
  }
  return response;
}

export function captureAnchoredFile({ python, root, segments, maxBytes, includeBytes = true }) {
  const response = runSafeOpenatHelper({
    python,
    request: { operation: 'capture', root, segments, maxBytes, includeBytes },
  });
  const fields = includeBytes ? ['operation', 'record', 'bytesBase64'] : ['operation', 'record'];
  assertExactFields(response, fields, 'Safe-openat capture response');
  validateAnchoredFileRecord(response.record, 'Safe-openat capture record');
  const expectedPath = path.join(root, ...segments);
  if (response.record.path !== expectedPath) throw new Error('Safe-openat capture record path drifted');
  if (!includeBytes) return { record: response.record };
  const bytes = canonicalBase64Bytes(response.bytesBase64, 'Safe-openat capture bytesBase64');
  if (bytes.length !== response.record.size) throw new Error('Safe-openat capture byte length differs from record size');
  if (createHash('sha256').update(bytes).digest('hex') !== response.record.sha256) {
    throw new Error('Safe-openat capture bytes differ from record SHA-256');
  }
  return { record: response.record, bytes };
}

function capsObject(maxBytesByRelativePath) {
  if (!(maxBytesByRelativePath instanceof Map)) throw new TypeError('Anchored per-file caps must be a Map');
  return Object.fromEntries([...maxBytesByRelativePath.entries()].sort(([left], [right]) => compareUtf8(left, right)));
}

export function enumerateAnchoredCaseInventory({ python, caseRoot, profileIndexMaxBytes = MAX_PROFILE_INDEX_BYTES }) {
  const response = runSafeOpenatHelper({
    python,
    request: {
      operation: 'inventory',
      root: caseRoot,
      profileIndexMaxBytes,
    },
  });
  assertExactFields(response, ['operation', 'items'], 'Safe-openat inventory response');
  if (!Array.isArray(response.items)) throw new Error('Safe-openat inventory items must be an array');
  let previous = null;
  return response.items.map((item, ordinal) => {
    assertExactFields(item, ['ordinal', 'pdbId', 'authChain', 'segments', 'record'], `Safe-openat inventory[${ordinal}]`);
    if (item.ordinal !== ordinal) throw new Error(`Safe-openat inventory[${ordinal}] ordinal drifted`);
    assertStrictIdentity(item.pdbId, `Safe-openat inventory[${ordinal}].pdbId`);
    assertStrictIdentity(item.authChain, `Safe-openat inventory[${ordinal}].authChain`);
    const expectedSegments = [item.pdbId, 'chains', item.authChain, 'profiles', 'profile-index.json.gz'];
    if (deterministicJson(item.segments) !== deterministicJson(expectedSegments)) {
      throw new Error(`Safe-openat inventory[${ordinal}] segments drifted`);
    }
    validateAnchoredFileRecord(item.record, `Safe-openat inventory[${ordinal}].record`);
    if (item.record.path !== path.join(caseRoot, ...expectedSegments)) {
      throw new Error(`Safe-openat inventory[${ordinal}] record path drifted`);
    }
    if (previous !== null && (
      compareUtf8(previous.pdbId, item.pdbId) > 0
      || (previous.pdbId === item.pdbId && compareUtf8(previous.authChain, item.authChain) >= 0)
    )) {
      throw new Error(`Safe-openat inventory[${ordinal}] is not in unique byte order`);
    }
    previous = item;
    return item;
  });
}

export function snapshotAnchoredTree({
  python,
  root,
  maxBytesByRelativePath = new Map(),
  defaultMaxBytes = null,
}) {
  const response = runSafeOpenatHelper({
    python,
    request: {
      operation: 'tree',
      root,
      maxBytesByRelativePath: capsObject(maxBytesByRelativePath),
      defaultMaxBytes,
    },
  });
  assertExactFields(response, ['operation', 'directories', 'files'], 'Safe-openat tree response');
  if (!Array.isArray(response.directories) || !Array.isArray(response.files)) {
    throw new Error('Safe-openat tree response arrays are invalid');
  }
  response.directories.forEach((item, index) => {
    assertExactFields(item, ['path', 'mtimeNs'], `Safe-openat tree directory[${index}]`);
    if (typeof item.path !== 'string' || typeof item.mtimeNs !== 'string' || !/^(?:0|[1-9]\d*)$/.test(item.mtimeNs)) {
      throw new Error(`Safe-openat tree directory[${index}] is invalid`);
    }
  });
  response.files.forEach((item, index) => {
    assertExactFields(item, ['path', 'record'], `Safe-openat tree file[${index}]`);
    if (typeof item.path !== 'string' || item.path.length === 0) throw new Error(`Safe-openat tree file[${index}].path is invalid`);
    validateAnchoredFileRecord(item.record, `Safe-openat tree file[${index}].record`);
    if (item.record.path !== path.join(root, ...item.path.split('/'))) {
      throw new Error(`Safe-openat tree file[${index}] record path drifted`);
    }
  });
  return { directories: response.directories, files: response.files };
}

export function sha256AnchoredManifest({
  python,
  root,
  maxBytesByRelativePath = new Map(),
  defaultMaxBytes = null,
  exclude = ['reports/sha256.txt'],
}) {
  const response = runSafeOpenatHelper({
    python,
    request: {
      operation: 'sha256',
      root,
      maxBytesByRelativePath: capsObject(maxBytesByRelativePath),
      defaultMaxBytes,
      exclude,
    },
  });
  assertExactFields(response, ['operation', 'manifest'], 'Safe-openat SHA-256 response');
  if (typeof response.manifest !== 'string' || response.manifest.includes('\r')) {
    throw new Error('Safe-openat SHA-256 manifest is invalid');
  }
  return response.manifest;
}

export function materializeAnchoredDirectory({
  python,
  sourceRoot,
  outParent,
  partialName,
  finalName,
  expectedInventory,
  publish,
  diagnosticText = null,
}) {
  const response = runSafeOpenatHelper({
    python,
    request: {
      operation: 'materialize',
      sourceRoot,
      outParent,
      partialName,
      finalName,
      expectedInventory,
      publish,
      diagnosticText,
    },
  });
  assertExactFields(response, ['operation', 'published', 'name'], 'Safe-openat materialize response');
  if (response.published !== publish || response.name !== (publish ? finalName : partialName)) {
    throw new Error('Safe-openat materialize response drifted');
  }
  return { published: response.published, name: response.name };
}

function canonicalJsonValue(value, location = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${location} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalJsonValue(item, `${location}[${index}]`));
  }
  if (!isRecord(value)) throw new TypeError(`${location} is not JSON-serializable`);
  const output = {};
  for (const key of Object.keys(value).sort(compareUtf8)) {
    const item = value[key];
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new TypeError(`${location}.${key} is not JSON-serializable`);
    }
    output[key] = canonicalJsonValue(item, `${location}.${key}`);
  }
  return output;
}

export function deterministicJson(payload) {
  return `${JSON.stringify(canonicalJsonValue(payload))}\n`;
}

export function deterministicGzip(payload) {
  const input = Buffer.isBuffer(payload) || payload instanceof Uint8Array
    ? Buffer.from(payload)
    : Buffer.from(typeof payload === 'string' ? payload : deterministicJson(payload), 'utf8');
  const output = gzipSync(input, { level: 9 });
  // RFC 1952 allows these header bytes to vary. Normalize them explicitly;
  // Node's gzip options do not expose a portable mtime/OS header contract.
  output.writeUInt32LE(0, 4);
  output[9] = 255;
  return output;
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256File(filePath) {
  return sha256Bytes(readFileSync(filePath));
}

export function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(String(left), 'utf8'), Buffer.from(String(right), 'utf8'));
}

export function runGitNoReplace(repoRoot, args, label, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) {
    throw new Error('Git repoRoot must be an absolute path');
  }
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    throw new Error('Git arguments must be an array of strings');
  }
  const canonicalRepo = realpathSync(repoRoot);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  env.GIT_NO_REPLACE_OBJECTS = '1';
  const result = spawnSync('git', ['--no-replace-objects', '-C', canonicalRepo, ...args], {
    env,
    encoding: null,
    maxBuffer,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    throw new Error(
      `${label} failed: ${result.error?.message || result.stderr?.toString('utf8') || result.signal || result.status}`,
    );
  }
  return result.stdout;
}

export function committedPreviewGlobalAssets({
  repoRoot,
  commit,
  globalDirectories = PREVIEW_GLOBAL_DIRECTORIES,
  globalFiles = PREVIEW_GLOBAL_FILES,
} = {}) {
  if (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot)) throw new Error('Preview Git repoRoot must be absolute');
  if (typeof commit !== 'string' || !/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('Preview Git commit is invalid');
  if (!Array.isArray(globalDirectories) || globalDirectories.length === 0) {
    throw new Error('Preview globalDirectories must be a non-empty array');
  }
  if (!Array.isArray(globalFiles) || globalFiles.length === 0) {
    throw new Error('Preview globalFiles must be a non-empty array');
  }
  const validateRelativePath = (value, label) => {
    if (
      typeof value !== 'string'
      || value.length === 0
      || path.posix.isAbsolute(value)
      || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) throw new Error(`${label} is not a safe repository-relative path`);
  };
  globalDirectories.forEach((directory, index) => validateRelativePath(directory, `Preview globalDirectories[${index}]`));
  globalFiles.forEach((file, index) => validateRelativePath(file, `Preview globalFiles[${index}]`));
  if (new Set(globalDirectories).size !== globalDirectories.length) throw new Error('Preview globalDirectories contain duplicates');
  if (new Set(globalFiles).size !== globalFiles.length) throw new Error('Preview globalFiles contain duplicates');
  const prefixes = [
    ...globalDirectories.map((directory) => path.posix.join('public', directory)),
    ...globalFiles,
  ];
  const output = runGitNoReplace(
    repoRoot,
    ['ls-tree', '-rz', '-r', '--full-tree', commit, '--', ...prefixes],
    'Read committed preview global assets',
  );
  const entries = output.toString('utf8').split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    if (tab < 0) throw new Error('Committed preview global asset tree entry is malformed');
    const [mode, type, blob] = line.slice(0, tab).split(' ');
    const repositoryPath = line.slice(tab + 1);
    if (!['100644', '100755'].includes(mode) || type !== 'blob' || !/^[0-9a-f]{40,64}$/.test(blob)) {
      throw new Error(`Committed preview global asset is not a regular blob: ${repositoryPath}`);
    }
    const publicRelativePath = path.posix.relative('public', repositoryPath);
    const inApprovedDirectory = !publicRelativePath.startsWith('../')
      && globalDirectories.some((directory) => publicRelativePath.startsWith(`${directory}/`));
    const isApprovedFile = globalFiles.includes(repositoryPath);
    if (!inApprovedDirectory && !isApprovedFile) {
      throw new Error(`Committed preview global asset escapes approved directories: ${repositoryPath}`);
    }
    const relativePath = isApprovedFile ? repositoryPath : publicRelativePath;
    const bytes = runGitNoReplace(repoRoot, ['cat-file', 'blob', blob], `Read preview global blob ${repositoryPath}`);
    return {
      path: relativePath,
      mode,
      blob,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }).sort((left, right) => compareUtf8(left.path, right.path));
  if (entries.length === 0) throw new Error('Committed preview global asset inventory is empty');
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.path)) throw new Error(`Duplicate committed preview global asset ${entry.path}`);
    seen.add(entry.path);
  }
  for (const file of globalFiles) {
    if (!seen.has(file)) throw new Error(`Committed preview global file is missing: ${file}`);
  }
  return entries;
}

function classificationExceptionEvents({ techFilter, isBackgroundChannel }) {
  if (techFilter === null) {
    return isBackgroundChannel === true
      ? []
      : [{ exceptionType: 'non-background-null', techniqueLabel: '' }];
  }
  if (typeof techFilter !== 'string') throw new TypeError('Classification audit techFilter must be a string or null');
  if (techFilter.trim().length === 0) return [];
  const classified = classifyTechniqueFilter(techFilter);
  if (!isRecord(classified) || !Array.isArray(classified.methods)) {
    throw new Error('Shared technique classifier returned malformed global audit data');
  }
  return classified.methods
    .filter((method) => method.mappingStatus === 'unmapped')
    .map((method) => ({ exceptionType: 'unmapped-technique', techniqueLabel: method.label }));
}

function classificationAuditIdentitySet(items, label) {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array`);
  const identities = new Set();
  items.forEach((item, index) => {
    if (!isRecord(item)) throw new TypeError(`${label}[${index}] must be an object`);
    assertStrictIdentity(item.pdbId, `${label}[${index}].pdbId`);
    assertStrictIdentity(item.authChain, `${label}[${index}].authChain`);
    const key = `${item.pdbId}\0${item.authChain}`;
    if (identities.has(key)) throw new Error(`${label} contains duplicate chain ${item.pdbId}/${item.authChain}`);
    identities.add(key);
  });
  return identities;
}

export function validateGlobalAuditRow(row, label = 'Global audit row') {
  assertExactFields(row, GLOBAL_AUDIT_ROW_FIELDS, label);
  assertStrictIdentity(row.pdbId, `${label}.pdbId`);
  assertStrictIdentity(row.authChain, `${label}.authChain`);
  if (row.techFilter !== null && typeof row.techFilter !== 'string') {
    throw new TypeError(`${label}.techFilter must be a string or null`);
  }
  if (row.isBackgroundChannel !== null && typeof row.isBackgroundChannel !== 'boolean') {
    throw new TypeError(`${label}.isBackgroundChannel must be boolean or null`);
  }
  if (!Number.isSafeInteger(row.profileCount) || row.profileCount <= 0) {
    throw new TypeError(`${label}.profileCount must be a positive safe integer`);
  }
  return row;
}

export function validateClassificationExceptionAudit(rows) {
  if (!Array.isArray(rows)) throw new TypeError('classificationExceptionAudit must be an array');
  let previous = null;
  for (const [index, row] of rows.entries()) {
    assertExactFields(row, REPORT_HEADERS.classificationExceptions, `classificationExceptionAudit[${index}]`);
    if (!CLASSIFICATION_EXCEPTION_SCOPES.includes(row.scope)) {
      throw new Error(`classificationExceptionAudit[${index}].scope is invalid`);
    }
    if (!CLASSIFICATION_EXCEPTION_TYPES.includes(row.exceptionType)) {
      throw new Error(`classificationExceptionAudit[${index}].exceptionType is invalid`);
    }
    if (typeof row.techniqueLabel !== 'string') {
      throw new TypeError(`classificationExceptionAudit[${index}].techniqueLabel must be a string`);
    }
    if (row.exceptionType === 'unmapped-technique') {
      assertStrictIdentity(row.techniqueLabel, `classificationExceptionAudit[${index}].techniqueLabel`);
    } else if (row.techniqueLabel !== '') {
      throw new Error(`classificationExceptionAudit[${index}] null exception must use an empty techniqueLabel`);
    }
    for (const field of ['profileCount', 'chainCount']) {
      if (!Number.isSafeInteger(row[field]) || row[field] <= 0) {
        throw new TypeError(`classificationExceptionAudit[${index}].${field} must be a positive safe integer`);
      }
    }
    if (previous !== null && compareClassificationExceptionRows(previous, row) >= 0) {
      throw new Error(`classificationExceptionAudit[${index}] is duplicated or not deterministically sorted`);
    }
    previous = row;
  }
  return rows;
}

function compareClassificationExceptionRows(left, right) {
  const scopeOrder = CLASSIFICATION_EXCEPTION_SCOPES.indexOf(left.scope)
    - CLASSIFICATION_EXCEPTION_SCOPES.indexOf(right.scope);
  if (scopeOrder !== 0) return scopeOrder;
  const typeOrder = CLASSIFICATION_EXCEPTION_TYPES.indexOf(left.exceptionType)
    - CLASSIFICATION_EXCEPTION_TYPES.indexOf(right.exceptionType);
  if (typeOrder !== 0) return typeOrder;
  return compareUtf8(left.techniqueLabel, right.techniqueLabel);
}

export function createClassificationExceptionAuditAccumulator({
  globalRows,
  caseInventory,
  selections,
} = {}) {
  if (!Array.isArray(globalRows)) throw new TypeError('globalRows must be an array');
  const inventoryIdentities = classificationAuditIdentitySet(caseInventory, 'caseInventory');
  const selectedIdentities = classificationAuditIdentitySet(selections, 'selections');
  for (const selection of selections) {
    const key = `${selection.pdbId}\0${selection.authChain}`;
    if (!inventoryIdentities.has(key)) {
      throw new Error(`Selected chain lacks a profile-index identity: ${selection.pdbId}/${selection.authChain}`);
    }
  }

  const groups = new Map();
  const append = (scope, exception, pdbId, authChain, count) => {
    const key = JSON.stringify([scope, exception.exceptionType, exception.techniqueLabel]);
    let group = groups.get(key);
    if (!group) {
      group = {
        scope,
        exceptionType: exception.exceptionType,
        techniqueLabel: exception.techniqueLabel,
        profileCount: 0,
        chains: new Set(),
      };
      groups.set(key, group);
    }
    group.profileCount += count;
    if (!Number.isSafeInteger(group.profileCount)) throw new Error('Classification exception profileCount overflow');
    group.chains.add(`${pdbId}\0${authChain}`);
  };

  const seenGlobalGroups = new Set();
  globalRows.forEach((row, index) => {
    validateGlobalAuditRow(row, `globalRows[${index}]`);
    const groupKey = JSON.stringify([
      row.pdbId,
      row.authChain,
      row.techFilter,
      row.isBackgroundChannel,
    ]);
    if (seenGlobalGroups.has(groupKey)) throw new Error(`globalRows contains duplicate group at index ${index}`);
    seenGlobalGroups.add(groupKey);
    const identity = `${row.pdbId}\0${row.authChain}`;
    for (const exception of classificationExceptionEvents(row)) {
      append('global', exception, row.pdbId, row.authChain, row.profileCount);
      if (!selectedIdentities.has(identity)) {
        append(
          inventoryIdentities.has(identity) ? 'unselected-profile-index-chain' : 'no-profile-index-chain',
          exception,
          row.pdbId,
          row.authChain,
          row.profileCount,
        );
      }
    }
  });

  let finished = false;
  const appendSelectedRows = (rows, scope) => {
    if (finished) throw new Error('Classification exception audit accumulator is already finished');
    if (!Array.isArray(rows)) throw new TypeError(`${scope} rows must be an array`);
    const seenProfilesInBatch = new Set();
    rows.forEach((row, index) => {
      validateExtractorRow(row, { rowIndex: index });
      const identity = `${row.pdbId}\0${row.authChain}`;
      if (!selectedIdentities.has(identity)) throw new Error(`${scope} row references an unselected chain`);
      const profileKey = `${identity}\0${row.profileId}`;
      if (seenProfilesInBatch.has(profileKey)) throw new Error(`${scope} contains duplicate profile ${row.profileId}`);
      seenProfilesInBatch.add(profileKey);
      for (const exception of classificationExceptionEvents(row)) {
        append(scope, exception, row.pdbId, row.authChain, 1);
      }
    });
  };

  return {
    append({ publicRows = [], dbOnlyRows = [] } = {}) {
      appendSelectedRows(publicRows, 'selected-public-sidecar');
      appendSelectedRows(dbOnlyRows, 'selected-chain-db-only');
    },
    finish() {
      if (finished) throw new Error('Classification exception audit accumulator is already finished');
      finished = true;
      const anomalyKeys = new Set();
      for (const group of groups.values()) anomalyKeys.add(JSON.stringify([group.exceptionType, group.techniqueLabel]));
      for (const anomalyKey of anomalyKeys) {
        const [exceptionType, techniqueLabel] = JSON.parse(anomalyKey);
        const countFor = (scope) => groups.get(JSON.stringify([scope, exceptionType, techniqueLabel]))?.profileCount || 0;
        const globalCount = countFor('global');
        const ownedCount = CLASSIFICATION_EXCEPTION_SCOPES.slice(1)
          .reduce((sum, scope) => sum + countFor(scope), 0);
        if (globalCount !== ownedCount) {
          throw new Error(
            `Global classification exception ownership does not close for ${exceptionType}/${techniqueLabel}: `
            + `global=${globalCount}, owned=${ownedCount}`,
          );
        }
      }
      const rows = [...groups.values()].map(({ chains, ...group }) => ({
        ...group,
        chainCount: chains.size,
      })).sort(compareClassificationExceptionRows);
      return validateClassificationExceptionAudit(rows);
    },
  };
}

export function buildClassificationExceptionAudit({
  globalRows,
  caseInventory,
  selections,
  selectedPublicRows,
  selectedDbOnlyRows,
} = {}) {
  if (!Array.isArray(selectedPublicRows)) throw new TypeError('selectedPublicRows must be an array');
  if (!Array.isArray(selectedDbOnlyRows)) throw new TypeError('selectedDbOnlyRows must be an array');
  const accumulator = createClassificationExceptionAuditAccumulator({
    globalRows,
    caseInventory,
    selections,
  });
  accumulator.append({ publicRows: selectedPublicRows, dbOnlyRows: selectedDbOnlyRows });
  return accumulator.finish();
}

export function compareAuditRows(left, right) {
  const ordinalDelta = left.ordinal - right.ordinal;
  if (ordinalDelta !== 0) return ordinalDelta;
  for (const field of ['pdbId', 'authChain', 'profileId', 'label']) {
    const delta = compareUtf8(left[field] ?? '', right[field] ?? '');
    if (delta !== 0) return delta;
  }
  return 0;
}

export function emptyStatusCounts() {
  return Object.fromEntries(STATUS_NAMES.map((status) => [status, 0]));
}

export function addStatusCounts(target, source) {
  for (const status of STATUS_NAMES) target[status] += source[status];
  return target;
}

export function classifyTechniqueToken(label) {
  const result = classifyTechniqueFilter(label);
  if (!isRecord(result) || !Array.isArray(result.methods) || result.methods.length !== 1) {
    throw new Error(`Shared technique classifier must return exactly one method for token ${JSON.stringify(label)}`);
  }
  return { ...result.methods[0] };
}

export function validateProfileIndex(profileIndex, label = 'profileIndex') {
  if (!isRecord(profileIndex)) throw new TypeError(`${label} must be an object`);
  if (!Array.isArray(profileIndex.profiles)) throw new TypeError(`${label}.profiles must be an array`);
  if (!Number.isInteger(profileIndex.profile_count) || profileIndex.profile_count < 0) {
    throw new Error(`${label}.profile_count must be a non-negative integer`);
  }
  if (profileIndex.profile_count !== profileIndex.profiles.length) {
    throw new Error(`${label}.profile_count must equal profiles.length`);
  }
  const seen = new Set();
  const profileIds = [];
  profileIndex.profiles.forEach((profile, index) => {
    if (!isRecord(profile)) throw new TypeError(`${label}.profiles[${index}] must be an object`);
    const profileId = profile.profile_id;
    assertStrictIdentity(profileId, `${label}.profiles[${index}].profile_id`);
    if (seen.has(profileId)) throw new Error(`${label} contains duplicate profile_id "${profileId}"`);
    seen.add(profileId);
    profileIds.push(profileId);
  });
  return profileIds;
}

export function validateExtractorRow(row, expected = {}) {
  const label = `DB row ${expected.rowIndex ?? ''}`.trim();
  assertExactFields(row, EXTRACTOR_ROW_FIELDS, label);
  if (!Number.isInteger(row.ordinal) || row.ordinal < 0) throw new Error(`${label}.ordinal must be a non-negative integer`);
  for (const field of ['pdbId', 'authChain', 'chainKey', 'profileId']) {
    assertStrictIdentity(row[field], `${label}.${field}`);
  }
  if (row.techFilter !== null && typeof row.techFilter !== 'string') {
    throw new TypeError(`${label}.techFilter must be a string or null`);
  }
  if (row.isBackgroundChannel !== null && typeof row.isBackgroundChannel !== 'boolean') {
    throw new TypeError(`${label}.isBackgroundChannel must be a boolean or null`);
  }
  for (const field of ['ordinal', 'pdbId', 'authChain']) {
    if (expected[field] !== undefined && row[field] !== expected[field]) {
      throw new Error(`${label}.${field} must exactly match ${JSON.stringify(expected[field])}`);
    }
  }
  return row;
}

function classifyRow(row) {
  let methods = [];
  let classificationStatus;
  if (typeof row.techFilter === 'string' && row.techFilter.trim().length > 0) {
    const classified = classifyTechniqueFilter(row.techFilter);
    if (!isRecord(classified) || !Array.isArray(classified.methods)) {
      throw new Error(`Shared technique classifier returned a malformed result for profile "${row.profileId}"`);
    }
    methods = classified.methods.map((method) => ({ ...method }));
    if (methods.length > 0) classificationStatus = classified.classificationStatus;
  }
  if (methods.length === 0) {
    classificationStatus = row.isBackgroundChannel === true ? 'background' : 'missing';
  }
  if (!STATUS_NAMES.includes(classificationStatus)) {
    throw new Error(`Shared technique classifier returned invalid status "${classificationStatus}"`);
  }
  return { classificationStatus, methods };
}

export function buildChainSidecar({ profileIndex, dbRows, pdbId, authChain, ordinal } = {}) {
  assertStrictIdentity(pdbId, 'pdbId');
  assertStrictIdentity(authChain, 'authChain');
  const profileIds = validateProfileIndex(profileIndex);
  if (!Array.isArray(dbRows)) throw new TypeError('dbRows must be an array');
  if (ordinal !== undefined && (!Number.isInteger(ordinal) || ordinal < 0)) {
    throw new Error('ordinal must be a non-negative integer');
  }

  const rowByProfileId = new Map();
  const classifiedByProfileId = new Map();
  const unmappedTechniqueRows = [];
  const nullTechniqueRows = [];
  let inferredOrdinal = ordinal;
  dbRows.forEach((row, rowIndex) => {
    validateExtractorRow(row, { rowIndex, pdbId, authChain, ...(ordinal === undefined ? {} : { ordinal }) });
    if (inferredOrdinal === undefined) inferredOrdinal = row.ordinal;
    if (row.ordinal !== inferredOrdinal) {
      throw new Error(`DB row ${rowIndex}.ordinal must exactly match ${inferredOrdinal}`);
    }
    if (rowByProfileId.has(row.profileId)) {
      throw new Error(`DB rows contain duplicate profileId "${row.profileId}" for ${pdbId}/${authChain}`);
    }
    rowByProfileId.set(row.profileId, row);
    const classified = classifyRow(row);
    classifiedByProfileId.set(row.profileId, classified);
    for (const method of classified.methods) {
      if (method.mappingStatus === 'unmapped') {
        unmappedTechniqueRows.push({
          ordinal: row.ordinal,
          pdbId,
          authChain,
          profileId: row.profileId,
          label: method.label,
        });
      }
    }
    if (row.techFilter === null || row.techFilter.trim().length === 0) {
      nullTechniqueRows.push({
        ordinal: row.ordinal,
        pdbId,
        authChain,
        profileId: row.profileId,
        isBackgroundChannel: row.isBackgroundChannel,
      });
    }
  });

  const missing = profileIds.filter((profileId) => !rowByProfileId.has(profileId));
  if (missing.length > 0) {
    throw new Error(`Published profiles are missing from DB rows for ${pdbId}/${authChain}: ${missing.join(', ')}`);
  }

  const published = new Set(profileIds);
  const profiles = profileIds.map((profileId) => {
    const classified = classifiedByProfileId.get(profileId);
    return {
      profileId,
      classificationStatus: classified.classificationStatus,
      methods: classified.methods.map((method) => ({ ...method })),
    };
  });
  const payload = {
    schemaVersion: PROFILE_PUBLIC_TECHNIQUES_SCHEMA,
    pdbId,
    authChain,
    profileCount: profiles.length,
    profiles,
  };
  validateProfilePublicTechniques(payload, profileIndex, {
    pdbId,
    authChain,
    categories: MECHANISM_FAMILIES,
    classifyTechniqueToken,
  });

  const dbOnlyRows = dbRows
    .filter((row) => !published.has(row.profileId))
    .map((row) => ({ ...row }))
    .sort(compareAuditRows);
  const publicRows = dbRows
    .filter((row) => published.has(row.profileId))
    .map((row) => ({ ...row }))
    .sort(compareAuditRows);
  const publicClassificationExceptionRows = publicRows
    .filter((row) => classificationExceptionEvents(row).length > 0);
  const dbOnlyClassificationExceptionRows = dbOnlyRows
    .filter((row) => classificationExceptionEvents(row).length > 0);
  const statusCounts = emptyStatusCounts();
  for (const profile of profiles) statusCounts[profile.classificationStatus] += 1;
  return {
    payload,
    dbOnlyRows,
    publicClassificationExceptionRows,
    dbOnlyClassificationExceptionRows,
    unmappedTechniqueRows: unmappedTechniqueRows.sort(compareAuditRows),
    nullTechniqueRows: nullTechniqueRows.sort(compareAuditRows),
    statusCounts,
  };
}

export function parseNdjsonStrict(stdout) {
  if (typeof stdout !== 'string') throw new TypeError('Extractor stdout must be a string');
  if (stdout.length === 0) return [];
  if (!stdout.endsWith('\n')) throw new Error('Extractor NDJSON must end with a newline');
  const lines = stdout.slice(0, -1).split('\n');
  const rows = [];
  lines.forEach((line, index) => {
    if (line.length === 0) throw new Error(`Extractor NDJSON line ${index + 1} is empty`);
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`Extractor NDJSON line ${index + 1} is invalid JSON: ${error.message}`);
    }
    validateExtractorRow(row, { rowIndex: index });
    rows.push(row);
  });
  return rows;
}

export function parseGlobalAuditNdjsonStrict(stdout) {
  if (typeof stdout !== 'string') throw new TypeError('Global audit stdout must be a string');
  if (stdout.length === 0) return [];
  if (!stdout.endsWith('\n')) throw new Error('Global audit NDJSON must end with a newline');
  return stdout.slice(0, -1).split('\n').map((line, index) => {
    if (line.length === 0) throw new Error(`Global audit NDJSON line ${index + 1} is empty`);
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`Global audit NDJSON line ${index + 1} is invalid JSON: ${error.message}`);
    }
    return validateGlobalAuditRow(row, `Global audit NDJSON line ${index + 1}`);
  });
}

export function parseProfileIndexGzipBytes(bytes, label = 'profile-index') {
  let decompressed;
  try {
    decompressed = gunzipSync(bytes, { maxOutputLength: MAX_PROFILE_INDEX_BYTES }).toString('utf8');
  } catch (error) {
    throw new Error(
      `Cannot read profile-index gzip ${label} within the ${MAX_PROFILE_INDEX_BYTES}-byte decompression limit: ${error.message}`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(decompressed);
  } catch (error) {
    throw new Error(`Invalid profile-index JSON ${label}: ${error.message}`);
  }
  validateProfileIndex(payload, `profile-index ${label}`);
  return payload;
}

function assertStableOpenedInput(before, after, absolutePath, bytesRead) {
  for (const field of ['dev', 'ino', 'size', 'mtimeNs']) {
    if (before[field] !== after[field]) throw new Error(`Opened input changed while being captured: ${absolutePath}`);
  }
  if (after.size !== BigInt(bytesRead)) throw new Error(`Opened input size changed while being captured: ${absolutePath}`);
}

function assertPathStillNamesOpenedInput(absolutePath, openedStat) {
  const named = lstatSync(absolutePath, { bigint: true });
  if (named.isSymbolicLink() || !named.isFile()) throw new Error(`Input path is not a non-symlink regular file: ${absolutePath}`);
  if (named.dev !== openedStat.dev || named.ino !== openedStat.ino) {
    throw new Error(`Input path changed to a different inode while being captured: ${absolutePath}`);
  }
}

function openedInputRecord(absolutePath, stat, sha256) {
  return {
    path: absolutePath,
    size: Number(stat.size),
    mtimeNs: stat.mtimeNs.toString(),
    inode: stat.ino.toString(),
    device: stat.dev.toString(),
    sha256,
  };
}

const INPUT_READ_CHUNK_BYTES = 1024 * 1024;

function normalizeCaptureOptions({ maxBytes, onRead } = {}) {
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)) {
    throw new TypeError('Input maxBytes must be undefined or a positive safe integer');
  }
  if (onRead !== undefined && typeof onRead !== 'function') {
    throw new TypeError('Input onRead must be undefined or a function');
  }
  return { maxBytes, onRead };
}

function assertWithinInputLimit(stat, maxBytes, absolutePath, bytesRead) {
  if (maxBytes !== undefined && stat.size > BigInt(maxBytes)) {
    throw new Error(`Input exceeds ${maxBytes} bytes after reading ${bytesRead} bytes: ${absolutePath}`);
  }
}

function nextReadLength(stat, bytesRead, maxBytes) {
  const available = stat.size - BigInt(bytesRead);
  if (available <= 0n) return 0;
  let length = available > BigInt(INPUT_READ_CHUNK_BYTES)
    ? INPUT_READ_CHUNK_BYTES
    : Number(available);
  if (maxBytes !== undefined) length = Math.min(length, maxBytes - bytesRead);
  return length;
}

export function captureInputFile(filePath, options = {}) {
  const { maxBytes, onRead } = normalizeCaptureOptions(options);
  const absolutePath = path.resolve(filePath);
  const fd = openSync(absolutePath, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new Error(`Input is not a regular file: ${absolutePath}`);
    assertWithinInputLimit(before, maxBytes, absolutePath, 0);
    const chunks = [];
    let bytesRead = 0;
    while (true) {
      const current = fstatSync(fd, { bigint: true });
      assertWithinInputLimit(current, maxBytes, absolutePath, bytesRead);
      const readLength = nextReadLength(current, bytesRead, maxBytes);
      if (readLength === 0) break;
      const chunk = Buffer.allocUnsafe(readLength);
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      bytesRead += count;
      if (maxBytes !== undefined && bytesRead > maxBytes) {
        throw new Error(`Input exceeds ${maxBytes} bytes after reading ${bytesRead} bytes: ${absolutePath}`);
      }
      onRead?.({ bytesRead: count, totalBytesRead: bytesRead, maxBytes });
    }
    const after = fstatSync(fd, { bigint: true });
    assertWithinInputLimit(after, maxBytes, absolutePath, bytesRead);
    assertStableOpenedInput(before, after, absolutePath, bytesRead);
    assertPathStillNamesOpenedInput(absolutePath, after);
    const bytes = Buffer.concat(chunks, bytesRead);
    return { bytes, record: openedInputRecord(absolutePath, after, sha256Bytes(bytes)) };
  } finally {
    closeSync(fd);
  }
}

export function inputFileRecord(filePath) {
  return captureInputFile(filePath).record;
}

export async function captureInputFileStreaming(filePath, options = {}) {
  const { maxBytes, onRead } = normalizeCaptureOptions(options);
  const absolutePath = path.resolve(filePath);
  const handle = await openFile(absolutePath, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new Error(`Input is not a regular file: ${absolutePath}`);
    assertWithinInputLimit(before, maxBytes, absolutePath, 0);
    const hash = createHash('sha256');
    const chunk = Buffer.allocUnsafe(Math.min(INPUT_READ_CHUNK_BYTES, maxBytes ?? INPUT_READ_CHUNK_BYTES));
    let bytesRead = 0;
    while (true) {
      const current = await handle.stat({ bigint: true });
      assertWithinInputLimit(current, maxBytes, absolutePath, bytesRead);
      const readLength = nextReadLength(current, bytesRead, maxBytes);
      if (readLength === 0) break;
      const result = await handle.read(chunk, 0, readLength, null);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
      if (maxBytes !== undefined && bytesRead > maxBytes) {
        throw new Error(`Input exceeds ${maxBytes} bytes after reading ${bytesRead} bytes: ${absolutePath}`);
      }
      hash.update(chunk.subarray(0, result.bytesRead));
      onRead?.({ bytesRead: result.bytesRead, totalBytesRead: bytesRead, maxBytes });
    }
    const after = await handle.stat({ bigint: true });
    assertWithinInputLimit(after, maxBytes, absolutePath, bytesRead);
    assertStableOpenedInput(before, after, absolutePath, bytesRead);
    assertPathStillNamesOpenedInput(absolutePath, after);
    return openedInputRecord(absolutePath, after, hash.digest('hex'));
  } finally {
    await handle.close();
  }
}

export async function processSequentiallyBounded(items, handler) {
  if (!Array.isArray(items)) throw new TypeError('Bounded items must be an array');
  if (typeof handler !== 'function') throw new TypeError('Bounded handler must be a function');
  let bufferedItems = 0;
  let maxBufferedItems = 0;
  let processedCount = 0;
  for (const item of items) {
    bufferedItems += 1;
    maxBufferedItems = Math.max(maxBufferedItems, bufferedItems);
    try {
      await handler(item, processedCount);
      processedCount += 1;
    } finally {
      bufferedItems -= 1;
    }
  }
  return { processedCount, maxBufferedItems };
}

function tsvCell(value, field) {
  let output;
  if (value === null) output = 'null';
  else if (typeof value === 'boolean' || typeof value === 'number') output = String(value);
  else if (typeof value === 'string') output = value;
  else throw new TypeError(`TSV field ${field} has unsupported type`);
  if (/[\t\r\n]/.test(output)) {
    throw new Error(`TSV field ${field} cannot safely represent tab or newline characters`);
  }
  return output;
}

export function deterministicTsv(headers, rows) {
  if (!Array.isArray(headers) || headers.length === 0) throw new Error('TSV headers must be a non-empty array');
  const header = headers.map((field) => tsvCell(field, 'header')).join('\t');
  const body = rows.map((row, rowIndex) => headers
    .map((field) => {
      if (!Object.prototype.hasOwnProperty.call(row, field)) {
        throw new Error(`TSV row ${rowIndex} is missing field ${field}`);
      }
      return tsvCell(row[field], field);
    })
    .join('\t'));
  return `${[header, ...body].join('\n')}\n`;
}

export function taxonomySnapshotSha256() {
  return sha256Bytes(textEncoder.encode(deterministicJson(buildTechniqueTaxonomySnapshot())));
}

export function profileIndexPath(caseRoot, pdbId, authChain) {
  return path.join(caseRoot, pdbId, 'chains', authChain, 'profiles', 'profile-index.json.gz');
}

export function sidecarRelativePath(pdbId, authChain) {
  return path.posix.join(
    'data', 'entry-cases', 'cases', pdbId, 'chains', authChain, 'profiles',
    'profile-public-techniques.json.gz',
  );
}

export function listRegularFiles(root) {
  const files = [];
  function visit(directory, relativeDirectory = '') {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed in run tree: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push(relative);
      else throw new Error(`Non-regular run entry is not allowed: ${relative}`);
    }
  }
  visit(root);
  return files.sort(compareUtf8);
}

export function sha256Manifest(root, { exclude = ['reports/sha256.txt'] } = {}) {
  const excluded = new Set(exclude);
  const rows = listRegularFiles(root)
    .filter((relative) => !excluded.has(relative))
    .map((relative) => {
      if (/[\r\n]/.test(relative)) throw new Error(`Unsafe path in SHA-256 manifest: ${relative}`);
      return `${sha256File(path.join(root, ...relative.split('/')))}  ${relative}`;
    });
  return `${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

export async function sha256ManifestStreaming(root, {
  exclude = ['reports/sha256.txt'],
  maxBytesByRelativePath,
  onRead,
} = {}) {
  if (maxBytesByRelativePath !== undefined && !(maxBytesByRelativePath instanceof Map)) {
    throw new TypeError('SHA-256 manifest maxBytesByRelativePath must be undefined or a Map');
  }
  if (onRead !== undefined && typeof onRead !== 'function') {
    throw new TypeError('SHA-256 manifest onRead must be undefined or a function');
  }
  const excluded = new Set(exclude);
  const rows = [];
  for (const relative of listRegularFiles(root).filter((value) => !excluded.has(value))) {
    if (/[\r\n]/.test(relative)) throw new Error(`Unsafe path in SHA-256 manifest: ${relative}`);
    const record = await captureInputFileStreaming(path.join(root, ...relative.split('/')), {
      maxBytes: maxBytesByRelativePath?.get(relative),
      onRead: onRead === undefined ? undefined : (progress) => onRead(relative, progress),
    });
    rows.push(`${record.sha256}  ${relative}`);
  }
  return `${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

export function buildCoverage({
  runId,
  chainCount,
  profileCount,
  sidecarCount,
  statusCounts,
  dbOnlyRows,
  unmappedRows,
  nullRows,
  dbOnlyProfileCount = dbOnlyRows?.length,
  unmappedTechniqueCount = unmappedRows?.length,
  nullTechniqueCount = nullRows?.length,
}) {
  return {
    schemaVersion: COVERAGE_SCHEMA,
    runId,
    chainCount,
    sidecarCount,
    profileCount,
    statusCounts: Object.fromEntries(STATUS_NAMES.map((status) => [status, statusCounts[status]])),
    dbOnlyProfileCount,
    unmappedTechniqueCount,
    nullTechniqueCount,
  };
}

export function fileSnapshot(filePath) {
  const record = inputFileRecord(filePath);
  return `${record.path}\0${record.size}\0${record.mtimeNs}\0${record.sha256}`;
}

export function treeSnapshot(root) {
  const records = [];
  function visit(directory, relativeDirectory = '') {
    const stat = statSync(directory, { bigint: true });
    records.push(`D\0${relativeDirectory}\0${stat.mtimeNs}`);
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) {
        const fileStat = statSync(absolute, { bigint: true });
        records.push(`F\0${relative}\0${fileStat.size}\0${fileStat.mtimeNs}\0${sha256File(absolute)}`);
      } else throw new Error(`Non-regular entry is not allowed: ${relative}`);
    }
  }
  visit(root);
  return records.join('\n');
}

export async function treeSnapshotStreaming(root, {
  maxBytesByRelativePath,
  onRead,
} = {}) {
  if (maxBytesByRelativePath !== undefined && !(maxBytesByRelativePath instanceof Map)) {
    throw new TypeError('Tree snapshot maxBytesByRelativePath must be undefined or a Map');
  }
  if (onRead !== undefined && typeof onRead !== 'function') {
    throw new TypeError('Tree snapshot onRead must be undefined or a function');
  }
  const records = [];
  const files = [];
  function visit(directory, relativeDirectory = '') {
    const stat = statSync(directory, { bigint: true });
    records.push(`D\0${relativeDirectory}\0${stat.mtimeNs}`);
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareUtf8(left.name, right.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? path.posix.join(relativeDirectory, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push({ relative, absolute });
      else throw new Error(`Non-regular entry is not allowed: ${relative}`);
    }
  }
  visit(root);
  for (const { relative, absolute } of files) {
    const record = await captureInputFileStreaming(absolute, {
      maxBytes: maxBytesByRelativePath?.get(relative),
      onRead: onRead === undefined ? undefined : (progress) => onRead(relative, progress),
    });
    records.push(`F\0${relative}\0${record.size}\0${record.mtimeNs}\0${record.inode}\0${record.sha256}`);
  }
  return records.join('\n');
}
