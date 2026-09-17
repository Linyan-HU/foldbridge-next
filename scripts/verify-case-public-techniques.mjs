#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  COVERAGE_SCHEMA,
  MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
  MAX_PROFILE_INDEX_BYTES,
  MAX_SOURCE_MANIFEST_BYTES,
  REPORT_HEADERS,
  STATUS_NAMES,
  assertExactFields,
  assertStrictIdentity,
  captureAnchoredFile,
  committedPreviewGlobalAssets,
  compareAuditRows,
  compareUtf8,
  createBoundedDbOnlyAuditSummaryAccumulator,
  deterministicGzip,
  deterministicJson,
  emptyStatusCounts,
  enumerateAnchoredCaseInventory,
  isRecord,
  parseNdjsonStrict,
  parseProfileIndexGzipBytes,
  processSequentiallyBounded,
  runGitNoReplace,
  sha256AnchoredManifest,
  sidecarRelativePath,
  snapshotAnchoredTree,
  validateExtractorRow,
  validateDbOnlyAuditSummary,
  validateIsoUtcInstant,
  validateProfileIndex,
} from './case-public-techniques-lib.mjs';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const BUILDER_PATH = path.join(REPO_ROOT, 'scripts', 'build-case-public-techniques.mjs');
const PREVIEW_BUILDER_PATH = path.join(REPO_ROOT, 'scripts', 'build-case-public-techniques-preview.mjs');
const BUILDER_EXTRACTOR_PATH = path.join(REPO_ROOT, 'scripts', 'extract-case-public-techniques.py');
const SAFE_OPENAT_HELPER_PATH = path.join(REPO_ROOT, 'scripts', 'safe-openat-capture.py');
const REQUIRED_FLAGS = ['--run', '--db', '--case-root', '--python'];
const MAX_CHAIN_QUERY_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_DATABASE_INPUT_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_DATABASE_BROKER_STDERR_BYTES = 1024 * 1024;
const VERIFIER_APPROVED_PREVIEW_BASELINE_RUN = '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/pilot-20260828T160812Z-f53fbdb138d2';
const VERIFIER_APPROVED_PREVIEW_BASELINE_SHA256 = 'c0e5c91055d49c1503944551fb198e45fa07153862e1f0a9634692d1d136a65e';
const VERIFIER_PREVIEW_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v3';
const VERIFIER_PREVIEW_PROVENANCE_SCHEMA = 'case-public-techniques-preview.v2';
const VERIFIER_PREVIEW_BUILDER_VERSION = 'case-public-techniques-preview-builder.v2';
const VERIFIER_LEGACY_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v2';
const VERIFIER_LEGACY_BUILDER_VERSION = 'case-public-techniques-builder.v1';
const VERIFIER_CURRENT_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v4';
const VERIFIER_CURRENT_BUILDER_VERSION = 'case-public-techniques-builder.v2';
const VERIFIER_MAX_GLOBAL_AUDIT_STDOUT_BYTES = 64 * 1024 * 1024;
const VERIFIER_MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES = 8 * 1024 * 1024;
const VERIFIER_PREVIEW_ARTIFACT_KIND = 'pilot-preview';
const VERIFIER_MAX_PREVIEW_FILE_BYTES = 64 * 1024 * 1024;
const VERIFIER_MAX_PREVIEW_MANIFEST_BYTES = 64 * 1024 * 1024;
const VERIFIER_APPROVED_PREVIEW_BASELINE_ANCHOR = Object.freeze({
  run: VERIFIER_APPROVED_PREVIEW_BASELINE_RUN,
  sha256: VERIFIER_APPROVED_PREVIEW_BASELINE_SHA256,
});
const RUN_FILE_BYTE_LIMITS = new Map([
  ['source-manifest.json', MAX_SOURCE_MANIFEST_BYTES],
]);
const SOURCE_CLOSURE_PATHS = [
  'scripts/build-case-public-techniques.mjs',
  'scripts/case-public-techniques-lib.mjs',
  'scripts/extract-case-public-techniques.py',
  'scripts/safe-openat-capture.py',
  'src/techniqueFilterModel.js',
  'public/entry-cases/__entry_v3_site__/workbench-pure.mjs',
].sort(compareUtf8);
// Keep the v3 replay closure and copied global roots independent from builder-owned lists.
const VERIFIER_PREVIEW_SOURCE_CLOSURE_PATHS = [
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
].sort(compareUtf8);
const VERIFIER_PREVIEW_GLOBAL_DIRECTORIES = [
  'entry-cases/__entry_v3_site__',
  'entry-cases/__entry_ef_site__',
];
const VERIFIER_PREVIEW_GLOBAL_FILES = [
  'src/assets/generated/pdb-primary-citations/index.json',
  'src/assets/header/aboutus.svg',
  'src/assets/header/database.svg',
  'src/assets/header/gznl2.svg',
  'src/assets/header/home.svg',
  'src/assets/header/research.svg',
  'src/portalChrome.js',
  'src/siteChrome.js',
  'src/statsDashboard.js',
];
const VERIFIER_PDB_ROOT_DIRECT_DEPENDENCIES = [
  'browser-manifest.json',
  'structure.cif.gz',
];
const PREVIEW_MANIFEST_FIELDS = [
  'schemaVersion',
  'builderVersion',
  'artifactKind',
  'runId',
  'gitCommit',
  'buildStartedAt',
  'projectionCompletedAt',
  'finalizedAt',
  'sourceClosure',
  'database',
  'caseRoot',
  'profileIndexes',
  'taxonomySnapshotSha256',
  'selectionMode',
  'selection',
  'dbOnlyAuditSummary',
  'baseline',
  'commands',
  'execution',
  'totals',
  'preview',
];
const LEGACY_MANIFEST_FIELDS = [
  'schemaVersion',
  'builderVersion',
  'runId',
  'gitCommit',
  'buildStartedAt',
  'projectionCompletedAt',
  'finalizedAt',
  'sourceClosure',
  'database',
  'caseRoot',
  'profileIndexes',
  'taxonomySnapshotSha256',
  'selectionMode',
  'selection',
  'dbOnlyAuditSummary',
  'commands',
  'execution',
  'totals',
];
const CURRENT_MANIFEST_FIELDS = [
  ...LEGACY_MANIFEST_FIELDS,
  'runKind',
  'caseInventory',
  'classificationExceptionAudit',
];
const INPUT_RECORD_FIELDS = ['path', 'size', 'mtimeNs', 'inode', 'device', 'sha256'];
const PROFILE_RECORD_FIELDS = ['ordinal', 'pdbId', 'authChain', ...INPUT_RECORD_FIELDS];
const EXECUTION_FIELDS = [
  'strategy',
  'maxBufferedChains',
  'maxExtractorStdoutBytes',
  'maxDbOnlyAuditSummaryBytes',
  'maxSourceManifestBytes',
  'maxProfileIndexBytes',
];
const CURRENT_EXECUTION_FIELDS = [
  ...EXECUTION_FIELDS,
  'maxGlobalAuditStdoutBytes',
  'maxClassificationExceptionReportBytes',
];
const VERIFIER_GLOBAL_AUDIT_FIELDS = [
  'pdbId',
  'authChain',
  'techFilter',
  'isBackgroundChannel',
  'profileCount',
];
const VERIFIER_CLASSIFICATION_EXCEPTION_FIELDS = [
  'scope',
  'exceptionType',
  'techniqueLabel',
  'profileCount',
  'chainCount',
];
const VERIFIER_CLASSIFICATION_EXCEPTION_SCOPES = [
  'global',
  'selected-public-sidecar',
  'selected-chain-db-only',
  'unselected-profile-index-chain',
  'no-profile-index-chain',
];
const VERIFIER_CLASSIFICATION_EXCEPTION_TYPES = [
  'unmapped-technique',
  'non-background-null',
];
const PREVIEW_EXECUTION_FIELDS = [
  ...EXECUTION_FIELDS,
  'previewStrategy',
  'maxPreviewFileBytes',
  'maxPreviewManifestBytes',
];

export function snapshotRunTreeStreaming(run, {
  python,
  sourceManifestMaxBytes = MAX_SOURCE_MANIFEST_BYTES,
} = {}) {
  if (!Number.isSafeInteger(sourceManifestMaxBytes) || sourceManifestMaxBytes <= 0) {
    throw new TypeError('sourceManifestMaxBytes must be a positive safe integer');
  }
  return deterministicJson(snapshotAnchoredTree({
    python,
    root: run,
    maxBytesByRelativePath: new Map([['source-manifest.json', sourceManifestMaxBytes]]),
  }));
}

export function parseVerifierArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!REQUIRED_FLAGS.includes(flag)) throw new Error(`Unknown argument ${JSON.stringify(flag)}`);
    if (values.has(flag)) throw new Error(`Duplicate argument ${flag}`);
    if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values.set(flag, argv[index + 1]);
    index += 1;
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) throw new Error(`Missing required argument ${flag}`);
  }
  return Object.fromEntries(REQUIRED_FLAGS.map((flag) => [flag.slice(2).replace('-', ''), values.get(flag)]));
}

export function validateRunKindIndependently({
  runId,
  selectionMode,
  manifestRunKind,
  requiresManifestRunKind,
  isPreview,
  isLegacyData = false,
} = {}) {
  if (typeof runId !== 'string') throw new TypeError('Verifier run-id must be a string');
  const match = /^(?<kind>pilot|full)-(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})T(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})Z-(?<git12>[0-9a-f]{12})$/.exec(runId);
  if (!match?.groups) throw new Error('Verifier run-id has an invalid independent run kind or timestamp shape');
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
  ) throw new Error('Verifier run-id contains an impossible UTC timestamp');
  const kind = match.groups.kind;
  if (selectionMode !== 'cases' && selectionMode !== 'all') {
    throw new Error('Verifier selectionMode is invalid');
  }
  if (isPreview) {
    if (kind !== 'pilot' || selectionMode !== 'cases') {
      throw new Error('Preview run kind must be pilot with explicit case selection');
    }
  } else if (isLegacyData) {
    if (kind !== 'pilot' || selectionMode !== 'cases') {
      throw new Error('Legacy v2 run kind must be pilot with explicit case selection');
    }
  } else if (
    (kind === 'pilot' && selectionMode !== 'cases')
    || (kind === 'full' && selectionMode !== 'all')
  ) {
    throw new Error(`${kind} run kind does not match selection mode ${selectionMode}`);
  }
  if (requiresManifestRunKind) {
    if (manifestRunKind !== kind) throw new Error('Source manifest runKind does not match directory run kind');
  } else if (manifestRunKind !== undefined) {
    throw new Error('Legacy or preview manifest must not declare runKind');
  }
  return {
    kind,
    timestamp: `${match.groups.year}${match.groups.month}${match.groups.day}`
      + `T${match.groups.hour}${match.groups.minute}${match.groups.second}Z`,
    git12: match.groups.git12,
  };
}

function requireDirectory(directory, label) {
  const absolute = realpathSync(directory);
  if (!statSync(absolute).isDirectory()) throw new Error(`${label} is not a directory: ${absolute}`);
  return absolute;
}

function requireFile(filePath, label) {
  const absolute = realpathSync(filePath);
  if (!statSync(absolute).isFile()) throw new Error(`${label} is not a regular file: ${absolute}`);
  return absolute;
}

function parseJsonFileBounded({ python, root, segments, label, maxBytes }) {
  const captured = captureAnchoredFile({ python, root, segments, maxBytes, includeBytes: true });
  try {
    return { payload: JSON.parse(captured.bytes.toString('utf8')), bytes: captured.bytes };
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function captureAbsoluteAnchored({ python, filePath, maxBytes = null, includeBytes = false }) {
  return captureAnchoredFile({
    python,
    root: path.dirname(filePath),
    segments: [path.basename(filePath)],
    maxBytes,
    includeBytes,
  });
}

function captureRunFile({ python, run, relativePath, maxBytes, includeBytes = true }) {
  return captureAnchoredFile({
    python,
    root: run,
    segments: relativePath.split('/'),
    maxBytes,
    includeBytes,
  });
}

function assertBytes(actual, expected, label) {
  const actualBuffer = Buffer.isBuffer(actual) ? actual : Buffer.from(actual);
  const expectedBuffer = Buffer.isBuffer(expected) ? expected : Buffer.from(expected);
  if (!actualBuffer.equals(expectedBuffer)) throw new Error(`${label} differs from independently regenerated bytes`);
}

function sameRecord(actual, expected, label) {
  assertExactFields(actual, INPUT_RECORD_FIELDS, label);
  for (const field of INPUT_RECORD_FIELDS) {
    if (actual[field] !== expected[field]) throw new Error(`${label}.${field} does not match current input`);
  }
}

function validateSelection(selection) {
  if (!Array.isArray(selection) || selection.length === 0) throw new Error('Manifest selection must be a non-empty array');
  const seen = new Set();
  return selection.map((item, ordinal) => {
    assertExactFields(item, ['pdbId', 'authChain'], `Manifest selection[${ordinal}]`);
    assertStrictIdentity(item.pdbId, `Manifest selection[${ordinal}].pdbId`);
    assertStrictIdentity(item.authChain, `Manifest selection[${ordinal}].authChain`);
    for (const identity of [item.pdbId, item.authChain]) {
      if (identity === '.' || identity === '..' || identity.includes('/') || identity.includes('\0')) {
        throw new Error(`Manifest selection[${ordinal}] contains an unsafe path identity`);
      }
    }
    const key = `${item.pdbId}\0${item.authChain}`;
    if (seen.has(key)) throw new Error(`Manifest selection contains duplicate identity ${item.pdbId}/${item.authChain}`);
    seen.add(key);
    return { ordinal, pdbId: item.pdbId, authChain: item.authChain };
  });
}

function independentlyCaptureCaseInventory(caseRoot, python) {
  return enumerateAnchoredCaseInventory({
    python,
    caseRoot,
    profileIndexMaxBytes: MAX_PROFILE_INDEX_BYTES,
  });
}

function independentlyEnumerateAllSelection(caseRoot, python) {
  return independentlyCaptureCaseInventory(caseRoot, python)
    .map(({ pdbId, authChain }) => ({ pdbId, authChain }));
}

function independentlyDescribeCaseInventory(inventory) {
  if (!Array.isArray(inventory)) throw new TypeError('Verifier complete Case inventory must be an array');
  return {
    profileIndexCount: inventory.length,
    sha256: createHash('sha256').update(deterministicJson(inventory)).digest('hex'),
  };
}

function gitBuffer(args, label) {
  return runGitNoReplace(REPO_ROOT, args, label, { maxBuffer: 8 * 1024 * 1024 });
}

function resolveRecordedCommit(git12, recordedCommit) {
  if (typeof recordedCommit !== 'string' || !/^[0-9a-f]{40}$/.test(recordedCommit)) {
    throw new Error('Source manifest gitCommit must be a full 40-character lowercase hex commit');
  }
  if (!recordedCommit.startsWith(git12)) {
    throw new Error('Run-id git12 is not a prefix of source manifest gitCommit');
  }
  const recordedType = gitBuffer(['cat-file', '-t', recordedCommit], 'Validate recorded full git commit').toString('utf8');
  if (recordedType !== 'commit\n') throw new Error('Source manifest gitCommit does not name a commit object');
  const candidates = gitBuffer(['rev-parse', `--disambiguate=${git12}`], 'Disambiguate run-id git12')
    .toString('utf8').split('\n').filter(Boolean);
  const commits = candidates.filter((candidate) => {
    if (!/^[0-9a-f]{40,64}$/.test(candidate)) return false;
    try {
      return gitBuffer(['cat-file', '-t', candidate], `Read git object type ${candidate}`).toString('utf8') === 'commit\n';
    } catch {
      return false;
    }
  });
  if (commits.length !== 1 || commits[0] !== recordedCommit) {
    throw new Error('Run-id git12 does not uniquely select the recorded full commit object');
  }
  return recordedCommit;
}

function independentlyRebuildSourceClosure(commit, paths = SOURCE_CLOSURE_PATHS) {
  return [...paths].sort(compareUtf8).map((relativePath) => {
    const entry = gitBuffer(
      ['ls-tree', '-z', commit, '--', relativePath],
      `Read committed source tree entry ${relativePath}`,
    );
    if (entry.length === 0 || entry.at(-1) !== 0 || entry.subarray(0, -1).includes(0)) {
      throw new Error(`Committed source path has no unique tree entry: ${relativePath}`);
    }
    const line = entry.subarray(0, -1).toString('utf8');
    const tab = line.indexOf('\t');
    const [mode, type, blob] = line.slice(0, tab).split(' ');
    if (tab < 0 || line.slice(tab + 1) !== relativePath || !['100644', '100755'].includes(mode) || type !== 'blob') {
      throw new Error(`Committed source path is not a regular file: ${relativePath}`);
    }
    if (!/^[0-9a-f]{40,64}$/.test(blob)) throw new Error(`Committed source blob id is invalid: ${relativePath}`);
    const bytes = gitBuffer(['cat-file', 'blob', blob], `Read committed source blob ${relativePath}`);
    return { path: relativePath, blob, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

function assertStringArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const seen = new Set();
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || item.length === 0 || item.trim() !== item) {
      throw new Error(`${label}[${index}] must be a non-empty trimmed string`);
    }
    if (seen.has(item)) throw new Error(`${label} contains duplicate ${JSON.stringify(item)}`);
    seen.add(item);
  }
}

function validateCommittedTaxonomySnapshot(snapshot) {
  assertExactFields(
    snapshot,
    ['taxonomyVersion', 'tokenSeparator', 'families', 'aliases', 'canonicalTechniques'],
    'Committed taxonomy snapshot',
  );
  for (const field of ['taxonomyVersion', 'tokenSeparator']) {
    if (typeof snapshot[field] !== 'string' || snapshot[field].length === 0) {
      throw new Error(`Committed taxonomy snapshot ${field} must be a non-empty string`);
    }
  }
  for (const [field, limit] of [['families', 256], ['aliases', 65536], ['canonicalTechniques', 65536]]) {
    if (!Array.isArray(snapshot[field]) || snapshot[field].length > limit) {
      throw new Error(`Committed taxonomy snapshot ${field} must be a bounded array`);
    }
  }
  const familyIds = new Set();
  snapshot.families.forEach((family, index) => {
    const label = `Committed taxonomy snapshot families[${index}]`;
    assertExactFields(family, ['id', 'label', 'shortLabel', 'techniques', 'filterTechniques'], label);
    for (const field of ['id', 'label', 'shortLabel']) {
      if (typeof family[field] !== 'string' || family[field].length === 0 || family[field].trim() !== family[field]) {
        throw new Error(`${label}.${field} must be a non-empty trimmed string`);
      }
    }
    if (familyIds.has(family.id)) throw new Error(`Committed taxonomy snapshot has duplicate family ${family.id}`);
    familyIds.add(family.id);
    assertStringArray(family.techniques, `${label}.techniques`);
    assertStringArray(family.filterTechniques, `${label}.filterTechniques`);
  });
  const aliasTokens = new Set();
  snapshot.aliases.forEach((alias, index) => {
    const label = `Committed taxonomy snapshot aliases[${index}]`;
    assertExactFields(alias, ['normalizedToken', 'canonicalLabel'], label);
    for (const field of ['normalizedToken', 'canonicalLabel']) {
      if (typeof alias[field] !== 'string' || alias[field].length === 0 || alias[field].trim() !== alias[field]) {
        throw new Error(`${label}.${field} must be a non-empty trimmed string`);
      }
    }
    if (aliasTokens.has(alias.normalizedToken)) throw new Error(`${label}.normalizedToken is duplicated`);
    aliasTokens.add(alias.normalizedToken);
  });
  const canonicalTokens = new Set();
  snapshot.canonicalTechniques.forEach((technique, index) => {
    const label = `Committed taxonomy snapshot canonicalTechniques[${index}]`;
    assertExactFields(
      technique,
      ['normalizedToken', 'label', 'categoryId', 'categoryLabel', 'categoryShortLabel'],
      label,
    );
    for (const field of ['normalizedToken', 'label', 'categoryId', 'categoryLabel', 'categoryShortLabel']) {
      if (typeof technique[field] !== 'string' || technique[field].length === 0 || technique[field].trim() !== technique[field]) {
        throw new Error(`${label}.${field} must be a non-empty trimmed string`);
      }
    }
    if (!familyIds.has(technique.categoryId)) throw new Error(`${label}.categoryId references an unknown family`);
    if (canonicalTokens.has(technique.normalizedToken)) throw new Error(`${label}.normalizedToken is duplicated`);
    canonicalTokens.add(technique.normalizedToken);
  });
}

function committedRegularBlob(commit, relativePath, label) {
  const entry = gitBuffer(
    ['ls-tree', '-z', commit, '--', relativePath],
    `Read committed ${label} tree entry`,
  );
  if (entry.length === 0 || entry.at(-1) !== 0 || entry.subarray(0, -1).includes(0)) {
    throw new Error(`Committed ${label} has no unique tree entry`);
  }
  const line = entry.subarray(0, -1).toString('utf8');
  const tab = line.indexOf('\t');
  const [mode, type, blob] = line.slice(0, tab).split(' ');
  if (tab < 0 || line.slice(tab + 1) !== relativePath || !['100644', '100755'].includes(mode) || type !== 'blob') {
    throw new Error(`Committed ${label} is not a regular file`);
  }
  if (!/^[0-9a-f]{40,64}$/.test(blob)) throw new Error(`Committed ${label} blob id is invalid`);
  const bytes = gitBuffer(['cat-file', 'blob', blob], `Read committed ${label} blob`);
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
    throw new Error(`Committed ${label} exceeds its byte contract`);
  }
  return bytes;
}

async function independentlyLoadCommittedTechniqueReplay(commit) {
  const classifierBytes = committedRegularBlob(
    commit,
    'src/techniqueFilterModel.js',
    'taxonomy classifier',
  );
  const validatorBytes = committedRegularBlob(
    commit,
    'public/entry-cases/__entry_v3_site__/workbench-pure.mjs',
    'profile technique validator',
  );
  const temporary = mkdtempSync(path.join(tmpdir(), 'case-public-taxonomy-commit-'));
  try {
    const modulePath = path.join(temporary, 'techniqueFilterModel.mjs');
    const validatorPath = path.join(temporary, 'workbench-pure.mjs');
    writeFileSync(modulePath, classifierBytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(validatorPath, validatorBytes, { flag: 'wx', mode: 0o600 });
    const classifier = await import(pathToFileURL(modulePath).href);
    const validator = await import(pathToFileURL(validatorPath).href);
    if (typeof classifier.buildTechniqueTaxonomySnapshot !== 'function') {
      throw new Error('Committed taxonomy classifier does not export buildTechniqueTaxonomySnapshot');
    }
    if (typeof classifier.classifyTechniqueFilter !== 'function' || !Array.isArray(classifier.MECHANISM_FAMILIES)) {
      throw new Error('Committed taxonomy classifier does not expose its classification contract');
    }
    if (
      typeof validator.PROFILE_PUBLIC_TECHNIQUES_SCHEMA !== 'string'
      || validator.PROFILE_PUBLIC_TECHNIQUES_SCHEMA.length === 0
      || typeof validator.validateProfilePublicTechniques !== 'function'
    ) {
      throw new Error('Committed profile technique validator does not expose its validation contract');
    }
    const snapshot = classifier.buildTechniqueTaxonomySnapshot();
    if (snapshot && typeof snapshot.then === 'function') {
      throw new Error('Committed taxonomy snapshot builder must be synchronous');
    }
    validateCommittedTaxonomySnapshot(snapshot);
    const serialized = deterministicJson(snapshot);
    if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) {
      throw new Error('Committed taxonomy snapshot exceeds its byte contract');
    }
    if (deterministicJson(classifier.MECHANISM_FAMILIES) !== deterministicJson(snapshot.families)) {
      throw new Error('Committed classifier families differ from its taxonomy snapshot');
    }
    return {
      taxonomySnapshotSha256: createHash('sha256').update(serialized).digest('hex'),
      classifyTechniqueFilter: classifier.classifyTechniqueFilter,
      categories: classifier.MECHANISM_FAMILIES,
      profileSchema: validator.PROFILE_PUBLIC_TECHNIQUES_SCHEMA,
      validateProfilePublicTechniques: validator.validateProfilePublicTechniques,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function singleTokenClassifier(label, techniqueReplay) {
  const result = techniqueReplay.classifyTechniqueFilter(label);
  if (!isRecord(result) || !Array.isArray(result.methods) || result.methods.length !== 1) {
    throw new Error(`Shared classifier did not return exactly one method for ${JSON.stringify(label)}`);
  }
  return { ...result.methods[0] };
}

function classifyRawRow(row, techniqueReplay) {
  if (row.techFilter !== null && typeof row.techFilter !== 'string') throw new Error(`DB row profile ${row.profileId} techFilter must be string or null`);
  if (row.isBackgroundChannel !== null && typeof row.isBackgroundChannel !== 'boolean') {
    throw new Error(`DB row profile ${row.profileId} isBackgroundChannel must be boolean or null`);
  }
  let methods = [];
  let status;
  if (typeof row.techFilter === 'string' && row.techFilter.trim().length > 0) {
    const result = techniqueReplay.classifyTechniqueFilter(row.techFilter);
    if (!isRecord(result) || !Array.isArray(result.methods)) throw new Error('Shared classifier returned a malformed result');
    methods = result.methods.map((method) => ({ ...method }));
    if (methods.length > 0) status = result.classificationStatus;
  }
  if (methods.length === 0) status = row.isBackgroundChannel === true ? 'background' : 'missing';
  if (!STATUS_NAMES.includes(status)) throw new Error(`Shared classifier returned invalid status ${JSON.stringify(status)}`);
  return { status, methods };
}

function independentClassificationExceptionEvents(row, techniqueReplay) {
  if (row.techFilter === null) {
    return row.isBackgroundChannel === true
      ? []
      : [{ exceptionType: 'non-background-null', techniqueLabel: '' }];
  }
  if (typeof row.techFilter !== 'string') {
    throw new TypeError('Verifier classification exception techFilter must be string or null');
  }
  if (row.techFilter.trim().length === 0) return [];
  const classified = techniqueReplay.classifyTechniqueFilter(row.techFilter);
  if (!isRecord(classified) || !Array.isArray(classified.methods)) {
    throw new Error('Verifier classifier returned malformed exception audit data');
  }
  return classified.methods
    .filter((method) => method.mappingStatus === 'unmapped')
    .map((method) => ({ exceptionType: 'unmapped-technique', techniqueLabel: method.label }));
}

function independentClassificationExceptionComparator(left, right) {
  const scopeDelta = VERIFIER_CLASSIFICATION_EXCEPTION_SCOPES.indexOf(left.scope)
    - VERIFIER_CLASSIFICATION_EXCEPTION_SCOPES.indexOf(right.scope);
  if (scopeDelta !== 0) return scopeDelta;
  const typeDelta = VERIFIER_CLASSIFICATION_EXCEPTION_TYPES.indexOf(left.exceptionType)
    - VERIFIER_CLASSIFICATION_EXCEPTION_TYPES.indexOf(right.exceptionType);
  if (typeDelta !== 0) return typeDelta;
  return compareUtf8(left.techniqueLabel, right.techniqueLabel);
}

function independentChainIdentitySet(items, label) {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array`);
  const identities = new Set();
  items.forEach((item, index) => {
    if (!isRecord(item)) throw new TypeError(`${label}[${index}] must be an object`);
    assertStrictIdentity(item.pdbId, `${label}[${index}].pdbId`);
    assertStrictIdentity(item.authChain, `${label}[${index}].authChain`);
    const identity = `${item.pdbId}\0${item.authChain}`;
    if (identities.has(identity)) throw new Error(`${label} contains duplicate chain ${item.pdbId}/${item.authChain}`);
    identities.add(identity);
  });
  return identities;
}

function createIndependentClassificationExceptionAudit({
  globalRows,
  caseInventory,
  selections,
  techniqueReplay,
}) {
  if (!Array.isArray(globalRows)) throw new TypeError('Verifier globalRows must be an array');
  const inventoryIdentities = independentChainIdentitySet(caseInventory, 'Verifier case inventory');
  const selectedIdentities = independentChainIdentitySet(selections, 'Verifier selections');
  for (const selection of selections) {
    const identity = `${selection.pdbId}\0${selection.authChain}`;
    if (!inventoryIdentities.has(identity)) {
      throw new Error(`Verifier selected chain lacks profile-index: ${selection.pdbId}/${selection.authChain}`);
    }
  }
  const groups = new Map();
  const appendGroup = (scope, exception, pdbId, authChain, profileCount) => {
    if (!VERIFIER_CLASSIFICATION_EXCEPTION_SCOPES.includes(scope)) {
      throw new Error(`Verifier classification exception scope is invalid: ${scope}`);
    }
    if (!Number.isSafeInteger(profileCount) || profileCount <= 0) {
      throw new TypeError('Verifier classification exception count must be a positive safe integer');
    }
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
    group.profileCount += profileCount;
    if (!Number.isSafeInteger(group.profileCount)) {
      throw new Error('Verifier classification exception count overflow');
    }
    group.chains.add(`${pdbId}\0${authChain}`);
  };

  const seenGlobal = new Set();
  globalRows.forEach((row, index) => {
    assertExactFields(row, VERIFIER_GLOBAL_AUDIT_FIELDS, `Verifier global audit row ${index}`);
    assertStrictIdentity(row.pdbId, `Verifier global audit row ${index}.pdbId`);
    assertStrictIdentity(row.authChain, `Verifier global audit row ${index}.authChain`);
    if (row.techFilter !== null && typeof row.techFilter !== 'string') {
      throw new TypeError(`Verifier global audit row ${index}.techFilter must be string or null`);
    }
    if (row.isBackgroundChannel !== null && typeof row.isBackgroundChannel !== 'boolean') {
      throw new TypeError(`Verifier global audit row ${index}.isBackgroundChannel must be boolean or null`);
    }
    if (!Number.isSafeInteger(row.profileCount) || row.profileCount <= 0) {
      throw new TypeError(`Verifier global audit row ${index}.profileCount is invalid`);
    }
    const groupIdentity = JSON.stringify([
      row.pdbId,
      row.authChain,
      row.techFilter,
      row.isBackgroundChannel,
    ]);
    if (seenGlobal.has(groupIdentity)) throw new Error(`Verifier global audit row ${index} is duplicated`);
    seenGlobal.add(groupIdentity);
    const chainIdentity = `${row.pdbId}\0${row.authChain}`;
    for (const exception of independentClassificationExceptionEvents(row, techniqueReplay)) {
      appendGroup('global', exception, row.pdbId, row.authChain, row.profileCount);
      if (!selectedIdentities.has(chainIdentity)) {
        appendGroup(
          inventoryIdentities.has(chainIdentity)
            ? 'unselected-profile-index-chain'
            : 'no-profile-index-chain',
          exception,
          row.pdbId,
          row.authChain,
          row.profileCount,
        );
      }
    }
  });

  let finished = false;
  const appendSelected = (rows, scope) => {
    if (finished) throw new Error('Verifier classification exception audit is finished');
    if (!Array.isArray(rows)) throw new TypeError(`Verifier ${scope} rows must be an array`);
    const seenProfiles = new Set();
    rows.forEach((row, index) => {
      validateExtractorRow(row, { rowIndex: index });
      const chainIdentity = `${row.pdbId}\0${row.authChain}`;
      if (!selectedIdentities.has(chainIdentity)) throw new Error(`Verifier ${scope} row is not selected`);
      const profileIdentity = `${chainIdentity}\0${row.profileId}`;
      if (seenProfiles.has(profileIdentity)) throw new Error(`Verifier ${scope} row duplicates ${row.profileId}`);
      seenProfiles.add(profileIdentity);
      for (const exception of independentClassificationExceptionEvents(row, techniqueReplay)) {
        appendGroup(scope, exception, row.pdbId, row.authChain, 1);
      }
    });
  };
  return {
    append({ publicRows = [], dbOnlyRows = [] } = {}) {
      appendSelected(publicRows, 'selected-public-sidecar');
      appendSelected(dbOnlyRows, 'selected-chain-db-only');
    },
    finish() {
      if (finished) throw new Error('Verifier classification exception audit is finished');
      finished = true;
      const anomalyKeys = new Set(
        [...groups.values()].map((row) => JSON.stringify([row.exceptionType, row.techniqueLabel])),
      );
      for (const anomalyKey of anomalyKeys) {
        const [exceptionType, techniqueLabel] = JSON.parse(anomalyKey);
        const countFor = (scope) => groups.get(
          JSON.stringify([scope, exceptionType, techniqueLabel]),
        )?.profileCount || 0;
        const globalCount = countFor('global');
        const ownedCount = VERIFIER_CLASSIFICATION_EXCEPTION_SCOPES.slice(1)
          .reduce((sum, scope) => sum + countFor(scope), 0);
        if (globalCount !== ownedCount) {
          throw new Error(
            `Verifier global classification ownership does not close for ${exceptionType}/${techniqueLabel}: `
            + `global=${globalCount}, owned=${ownedCount}`,
          );
        }
      }
      return [...groups.values()].map(({ chains, ...row }) => ({
        ...row,
        chainCount: chains.size,
      })).sort(independentClassificationExceptionComparator);
    },
  };
}

function independentlyProjectChain({ selection, profileIndex, rows, techniqueReplay }) {
  const profileIds = validateProfileIndex(profileIndex, `profile-index for ${selection.pdbId}/${selection.authChain}`);
  const byProfileId = new Map();
  const classifications = new Map();
  const unmappedRows = [];
  const nullRows = [];
  rows.forEach((row, rowIndex) => {
    validateExtractorRow(row, { rowIndex, ordinal: selection.ordinal, pdbId: selection.pdbId, authChain: selection.authChain });
    if (byProfileId.has(row.profileId)) throw new Error(`Verifier found duplicate DB profileId "${row.profileId}"`);
    byProfileId.set(row.profileId, row);
    const classified = classifyRawRow(row, techniqueReplay);
    classifications.set(row.profileId, classified);
    for (const method of classified.methods) {
      if (method.mappingStatus === 'unmapped') {
        unmappedRows.push({ ordinal: selection.ordinal, pdbId: selection.pdbId, authChain: selection.authChain, profileId: row.profileId, label: method.label });
      }
    }
    if (row.techFilter === null || row.techFilter.trim().length === 0) {
      nullRows.push({ ordinal: selection.ordinal, pdbId: selection.pdbId, authChain: selection.authChain, profileId: row.profileId, isBackgroundChannel: row.isBackgroundChannel });
    }
  });
  const missing = profileIds.filter((profileId) => !byProfileId.has(profileId));
  if (missing.length > 0) throw new Error(`Verifier exact join is missing published profiles: ${missing.join(', ')}`);
  const profileIdSet = new Set(profileIds);
  const dbOnlyRows = rows.filter((row) => !profileIdSet.has(row.profileId)).map((row) => ({ ...row }));
  const publicRows = rows.filter((row) => profileIdSet.has(row.profileId)).map((row) => ({ ...row }));
  const profiles = profileIds.map((profileId) => {
    const classified = classifications.get(profileId);
    return { profileId, classificationStatus: classified.status, methods: classified.methods.map((method) => ({ ...method })) };
  });
  const payload = {
    schemaVersion: techniqueReplay.profileSchema,
    pdbId: selection.pdbId,
    authChain: selection.authChain,
    profileCount: profiles.length,
    profiles,
  };
  techniqueReplay.validateProfilePublicTechniques(payload, profileIndex, {
    pdbId: selection.pdbId,
    authChain: selection.authChain,
    categories: techniqueReplay.categories,
    classifyTechniqueToken: (label) => singleTokenClassifier(label, techniqueReplay),
  });
  const statusCounts = emptyStatusCounts();
  for (const profile of profiles) statusCounts[profile.classificationStatus] += 1;
  return {
    payload,
    dbOnlyRows: dbOnlyRows.sort(compareAuditRows),
    publicClassificationExceptionRows: publicRows
      .filter((row) => independentClassificationExceptionEvents(row, techniqueReplay).length > 0)
      .sort(compareAuditRows),
    dbOnlyClassificationExceptionRows: dbOnlyRows
      .filter((row) => independentClassificationExceptionEvents(row, techniqueReplay).length > 0)
      .sort(compareAuditRows),
    unmappedRows: unmappedRows.sort(compareAuditRows),
    nullRows: nullRows.sort(compareAuditRows),
    statusCounts,
  };
}

function independentlySummarizeDbOnlyRows(rows, selection) {
  const groups = new Map();
  for (const row of rows) {
    const background = row.isBackgroundChannel;
    const backgroundKey = background === null ? 'N' : background === false ? 'F' : 'T';
    const key = `${row.techFilter === null ? 'N' : `S${row.techFilter}`}\0${backgroundKey}`;
    const current = groups.get(key);
    if (current) current.count += 1;
    else {
      groups.set(key, {
        pdbId: selection.pdbId,
        authChain: selection.authChain,
        techFilter: row.techFilter,
        isBackgroundChannel: background,
        count: 1,
      });
    }
  }
  const backgroundRank = (value) => value === null ? 0 : value === false ? 1 : 2;
  return [...groups.values()].sort((left, right) => {
    if (left.techFilter === null) return right.techFilter === null
      ? backgroundRank(left.isBackgroundChannel) - backgroundRank(right.isBackgroundChannel)
      : -1;
    if (right.techFilter === null) return 1;
    return compareUtf8(left.techFilter, right.techFilter)
      || backgroundRank(left.isBackgroundChannel) - backgroundRank(right.isBackgroundChannel);
  });
}

function verifierTsv(headers, rows) {
  const encode = (value, field) => {
    let text;
    if (value === null) text = 'null';
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') text = String(value);
    else throw new Error(`Verifier cannot encode ${field} in TSV`);
    if (/[\t\r\n]/.test(text)) throw new Error(`Verifier refuses unsafe TSV value in ${field}`);
    return text;
  };
  const lines = [headers.map((header) => encode(header, 'header')).join('\t')];
  rows.forEach((row, rowIndex) => {
    lines.push(headers.map((header) => {
      if (!Object.prototype.hasOwnProperty.call(row, header)) throw new Error(`Verifier TSV row ${rowIndex} lacks ${header}`);
      return encode(row[header], header);
    }).join('\t'));
  });
  return `${lines.join('\n')}\n`;
}

function createExpectedReport(headers) {
  const hash = createHash('sha256');
  let size = 0;
  const header = Buffer.from(verifierTsv(headers, []));
  hash.update(header);
  size += header.length;
  return {
    append(rows) {
      if (rows.length === 0) return;
      const full = verifierTsv(headers, rows);
      const body = Buffer.from(full.slice(full.indexOf('\n') + 1));
      hash.update(body);
      size += body.length;
    },
    finish() {
      return { size, sha256: hash.digest('hex') };
    },
  };
}

async function assertReportDigest({ python, run, relativePath, expected, label }) {
  const actual = captureRunFile({
    python,
    run,
    relativePath,
    maxBytes: null,
    includeBytes: false,
  }).record;
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) {
    throw new Error(`${label} differs from independently regenerated rows`);
  }
}

function expectedCommands({
  run,
  runId,
  db,
  caseRoot,
  python,
  selections,
  selectionMode,
  includeGlobalAudit = false,
  anchoredDatabaseConnection = false,
}) {
  const builder = [
    process.execPath,
    BUILDER_PATH,
    '--db', db,
    '--case-root', caseRoot,
    '--out-parent', path.dirname(run),
    '--run-id', runId,
    '--python', python,
  ];
  if (selectionMode === 'all') builder.push('--all');
  else for (const { pdbId, authChain } of selections) builder.push('--case', `${pdbId}/${authChain}`);
  const extractor = {
    strategy: anchoredDatabaseConnection ? 'anchored-fd-readonly-transaction' : 'per-chain',
    maxStdoutBytes: MAX_CHAIN_QUERY_STDOUT_BYTES,
    argvTemplate: anchoredDatabaseConnection ? [
      python,
      BUILDER_EXTRACTOR_PATH,
      '--db', '<anchored-database-input>',
      '--serve-anchored',
      '--safe-helper', SAFE_OPENAT_HELPER_PATH,
      '--max-db-bytes', String(MAX_DATABASE_INPUT_BYTES),
    ] : [
      python,
      BUILDER_EXTRACTOR_PATH,
      '--db', db,
      '--selection-json', '<per-chain-selection.json>',
    ],
  };
  if (includeGlobalAudit) {
    extractor.queryProtocol = 'bounded-jsonl-v1';
    extractor.maxGlobalSummaryStdoutBytes = VERIFIER_MAX_GLOBAL_AUDIT_STDOUT_BYTES;
  }
  return {
    builder,
    extractor,
  };
}

function expectedPreviewCommands({ run, runId, db, caseRoot, python, selections, baselineRun }) {
  return {
    previewBuilder: [
      process.execPath,
      PREVIEW_BUILDER_PATH,
      '--baseline-run', baselineRun,
      '--db', db,
      '--case-root', caseRoot,
      '--worktree-public', path.join(REPO_ROOT, 'public'),
      '--out-parent', path.dirname(run),
      '--run-id', runId,
      '--python', python,
      ...selections.flatMap(({ pdbId, authChain }) => ['--case', `${pdbId}/${authChain}`]),
    ],
    extractor: expectedCommands({
      run,
      runId,
      db,
      caseRoot,
      python,
      selections,
      selectionMode: 'cases',
    }).extractor,
  };
}

function expectedFiles(selections, { includeClassificationExceptions = false } = {}) {
  return [
    ...selections.map(({ pdbId, authChain }) => sidecarRelativePath(pdbId, authChain)),
    'reports/coverage.json',
    'reports/profile-join-failures.tsv',
    'reports/db-only-profiles.tsv',
    'reports/unmapped-techniques.tsv',
    'reports/null-techniques.tsv',
    ...(includeClassificationExceptions ? ['reports/classification-exceptions.tsv'] : []),
    'reports/sha256.txt',
    'selection.json',
    'source-manifest.json',
  ].sort(compareUtf8);
}

function expectedDirectories(selections) {
  const directories = new Set(['data', 'data/entry-cases', 'data/entry-cases/cases', 'pilot-preview', 'reports']);
  for (const { pdbId, authChain } of selections) {
    const pdbRoot = path.posix.join('data', 'entry-cases', 'cases', pdbId);
    const chainRoot = path.posix.join(pdbRoot, 'chains');
    const authRoot = path.posix.join(chainRoot, authChain);
    directories.add(pdbRoot);
    directories.add(chainRoot);
    directories.add(authRoot);
    directories.add(path.posix.join(authRoot, 'profiles'));
  }
  return [...directories].sort(compareUtf8);
}

function normalizedPreviewInventory(tree) {
  return {
    directories: tree.directories.map((item) => item.path),
    files: tree.files.map((item) => ({ path: item.path, size: item.record.size, sha256: item.record.sha256 })),
  };
}

function addPathAncestors(directories, relativePath) {
  let cursor = path.posix.dirname(relativePath);
  while (cursor !== '.') {
    directories.add(cursor);
    cursor = path.posix.dirname(cursor);
  }
}

function validatePreviewProvenance({ manifest, selections, caseRoot, python, commit, run }) {
  const preview = manifest.preview;
  assertExactFields(
    preview,
    ['schemaVersion', 'worktreePublic', 'globalDirectories', 'globalFiles', 'globalAssets', 'pdbSources', 'caseSources', 'sidecars', 'inventory'],
    'Preview provenance',
  );
  if (preview.schemaVersion !== VERIFIER_PREVIEW_PROVENANCE_SCHEMA) throw new Error('Preview provenance schemaVersion is invalid');
  if (preview.worktreePublic !== path.join(REPO_ROOT, 'public')) throw new Error('Preview worktreePublic does not match repository public root');
  if (deterministicJson(preview.globalDirectories) !== deterministicJson(VERIFIER_PREVIEW_GLOBAL_DIRECTORIES)) {
    throw new Error('Preview globalDirectories differ from the fixed committed asset roots');
  }
  if (deterministicJson(preview.globalFiles) !== deterministicJson(VERIFIER_PREVIEW_GLOBAL_FILES)) {
    throw new Error('Preview globalFiles differ from the fixed committed runtime closure');
  }
  const expectedGlobalAssets = committedPreviewGlobalAssets({
    repoRoot: REPO_ROOT,
    commit,
    globalDirectories: VERIFIER_PREVIEW_GLOBAL_DIRECTORIES,
    globalFiles: VERIFIER_PREVIEW_GLOBAL_FILES,
  });
  if (deterministicJson(preview.globalAssets) !== deterministicJson(expectedGlobalAssets)) {
    throw new Error('Preview globalAssets differ from committed Git blobs');
  }
  if (!Array.isArray(preview.caseSources) || preview.caseSources.length !== selections.length) {
    throw new Error('Preview caseSources must exactly cover the selected auth chains');
  }

  const expectedFilesByPath = new Map();
  const expectedDirectories = new Set(['', 'entry-cases']);
  const addExpectedFile = (relativePath, size, sha256, label) => {
    if (expectedFilesByPath.has(relativePath)) throw new Error(`Preview source paths collide at ${relativePath}`);
    expectedFilesByPath.set(relativePath, { path: relativePath, size, sha256, label });
    addPathAncestors(expectedDirectories, relativePath);
  };
  for (const asset of expectedGlobalAssets) {
    addExpectedFile(asset.path, asset.size, asset.sha256, `global asset ${asset.path}`);
  }

  const uniquePdbIds = [];
  const seenPdbIds = new Set();
  for (const { pdbId } of selections) {
    if (seenPdbIds.has(pdbId)) continue;
    seenPdbIds.add(pdbId);
    uniquePdbIds.push(pdbId);
  }
  if (!Array.isArray(preview.pdbSources) || preview.pdbSources.length !== uniquePdbIds.length) {
    throw new Error('Preview pdbSources must exactly cover selected PDB-root direct dependencies');
  }
  preview.pdbSources.forEach((source, ordinal) => {
    assertExactFields(
      source,
      ['ordinal', 'pdbId', 'sourceRelativePath', 'sourceRoot', 'files'],
      `Preview pdbSources[${ordinal}]`,
    );
    const pdbId = uniquePdbIds[ordinal];
    const sourceRoot = path.join(caseRoot, pdbId);
    if (
      source.ordinal !== ordinal
      || source.pdbId !== pdbId
      || source.sourceRelativePath !== pdbId
      || source.sourceRoot !== sourceRoot
    ) {
      throw new Error(`Preview pdbSources[${ordinal}] PDB-root identity or path drifted`);
    }
    if (!Array.isArray(source.files) || source.files.length !== VERIFIER_PDB_ROOT_DIRECT_DEPENDENCIES.length) {
      throw new Error(`Preview pdbSources[${ordinal}] must list every PDB-root direct dependency`);
    }
    source.files.forEach((file, fileOrdinal) => {
      assertExactFields(file, ['path', 'record'], `Preview pdbSources[${ordinal}].files[${fileOrdinal}]`);
      const relativePath = VERIFIER_PDB_ROOT_DIRECT_DEPENDENCIES[fileOrdinal];
      if (file.path !== relativePath) {
        throw new Error(`Preview pdbSources[${ordinal}] PDB-root dependency order drifted`);
      }
      let current;
      try {
        current = captureAnchoredFile({
          python,
          root: sourceRoot,
          segments: [relativePath],
          maxBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES,
          includeBytes: false,
        });
      } catch (error) {
        throw new Error(`Missing or unsafe PDB-root direct dependency ${pdbId}/${relativePath}: ${error.message}`);
      }
      sameRecord(file.record, current.record, `Preview pdbSources[${ordinal}].files[${fileOrdinal}].record`);
      addExpectedFile(
        path.posix.join('entry-cases', 'cases', pdbId, relativePath),
        current.record.size,
        current.record.sha256,
        `PDB-root source ${pdbId}/${relativePath}`,
      );
    });
  });

  preview.caseSources.forEach((source, ordinal) => {
    assertExactFields(
      source,
      ['ordinal', 'pdbId', 'authChain', 'sourceRelativePath', 'sourceRoot', 'directories', 'files'],
      `Preview caseSources[${ordinal}]`,
    );
    const selection = selections[ordinal];
    if (source.ordinal !== ordinal || source.pdbId !== selection.pdbId || source.authChain !== selection.authChain) {
      throw new Error(`Preview caseSources[${ordinal}] identity or order drifted`);
    }
    const sourceRelativePath = path.posix.join(selection.pdbId, 'chains', selection.authChain);
    const sourceRoot = path.join(caseRoot, ...sourceRelativePath.split('/'));
    if (source.sourceRelativePath !== sourceRelativePath || source.sourceRoot !== sourceRoot) {
      throw new Error(`Preview caseSources[${ordinal}] source path drifted`);
    }
    const current = snapshotAnchoredTree({ python, root: sourceRoot, defaultMaxBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES });
    if (deterministicJson({ directories: source.directories, files: source.files }) !== deterministicJson(current)) {
      throw new Error(`Preview case source changed for ${selection.pdbId}/${selection.authChain}`);
    }
    const destinationRoot = path.posix.join('entry-cases', 'cases', selection.pdbId, 'chains', selection.authChain);
    expectedDirectories.add(destinationRoot);
    addPathAncestors(expectedDirectories, destinationRoot);
    for (const directory of current.directories) {
      const destination = directory.path ? path.posix.join(destinationRoot, directory.path) : destinationRoot;
      expectedDirectories.add(destination);
      addPathAncestors(expectedDirectories, destination);
    }
    for (const file of current.files) {
      if (file.path === 'profiles/profile-public-techniques.json.gz') continue;
      addExpectedFile(
        path.posix.join(destinationRoot, file.path),
        file.record.size,
        file.record.sha256,
        `Case source ${selection.pdbId}/${selection.authChain}/${file.path}`,
      );
    }
  });

  if (!Array.isArray(preview.sidecars) || preview.sidecars.length !== selections.length) {
    throw new Error('Preview sidecars must exactly cover selection');
  }
  const expectedSidecars = selections.map((selection, ordinal) => {
    const dataPath = sidecarRelativePath(selection.pdbId, selection.authChain);
    const previewPath = path.posix.join(
      'pilot-preview',
      'entry-cases',
      'cases', selection.pdbId, 'chains', selection.authChain,
      'profiles', 'profile-public-techniques.json.gz',
    );
    const dataCapture = captureRunFile({ python, run, relativePath: dataPath, maxBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES });
    const previewRelative = previewPath.slice('pilot-preview/'.length);
    addExpectedFile(previewRelative, dataCapture.record.size, dataCapture.record.sha256, `sidecar ${selection.pdbId}/${selection.authChain}`);
    const expected = {
      pdbId: selection.pdbId,
      authChain: selection.authChain,
      dataPath,
      previewPath,
      sha256: dataCapture.record.sha256,
    };
    assertExactFields(preview.sidecars[ordinal], ['pdbId', 'authChain', 'dataPath', 'previewPath', 'sha256'], `Preview sidecars[${ordinal}]`);
    return expected;
  });
  if (deterministicJson(preview.sidecars) !== deterministicJson(expectedSidecars)) {
    throw new Error('Preview sidecar provenance differs from rebuilt data paths');
  }

  const previewRoot = path.join(run, 'pilot-preview');
  const actualTree = snapshotAnchoredTree({ python, root: previewRoot, defaultMaxBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES });
  const actualInventory = normalizedPreviewInventory(actualTree);
  assertExactFields(preview.inventory, ['directories', 'files'], 'Preview inventory');
  if (deterministicJson(preview.inventory) !== deterministicJson(actualInventory)) {
    throw new Error('Preview inventory differs from the anchored preview tree');
  }
  const expectedInventory = {
    directories: [...expectedDirectories].sort(compareUtf8),
    files: [...expectedFilesByPath.values()]
      .sort((left, right) => compareUtf8(left.path, right.path))
      .map(({ path: relativePath, size, sha256 }) => ({ path: relativePath, size, sha256 })),
  };
  if (deterministicJson(actualInventory) !== deterministicJson(expectedInventory)) {
    throw new Error('Preview tree has missing, extra, or source-divergent entries');
  }

  for (const asset of expectedGlobalAssets) {
    const absolute = path.join(previewRoot, ...asset.path.split('/'));
    const stat = lstatSync(absolute);
    const expectedMode = Number.parseInt(asset.mode, 8) & 0o777;
    if (!stat.isFile() || (stat.mode & 0o777) !== expectedMode) {
      throw new Error(`Preview global asset mode differs from Git blob ${asset.path}`);
    }
  }
  for (const sidecar of expectedSidecars) {
    const data = captureRunFile({ python, run, relativePath: sidecar.dataPath, maxBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES }).bytes;
    const copied = captureRunFile({ python, run, relativePath: sidecar.previewPath, maxBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES }).bytes;
    assertBytes(copied, data, `Preview sidecar ${sidecar.pdbId}/${sidecar.authChain}`);
  }
  return actualInventory;
}

async function validatePreviewBaseline({ baseline, baselineAnchor, db, caseRoot, python }) {
  assertExactFields(baseline, ['run', 'runId', 'sha256File', 'sourceManifestSha256'], 'Preview baseline');
  if (baseline.run !== baselineAnchor.run || baseline.runId !== path.basename(baselineAnchor.run)) {
    throw new Error('Preview baseline path or runId differs from the approved anchor');
  }
  if (typeof baseline.sourceManifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(baseline.sourceManifestSha256)) {
    throw new Error('Preview baseline sourceManifestSha256 is invalid');
  }
  await verifyRun([
    '--run', baseline.run,
    '--db', db,
    '--case-root', caseRoot,
    '--python', python,
  ], { baselineAnchor });
  const anchorCapture = captureAnchoredFile({
    python,
    root: baseline.run,
    segments: ['reports', 'sha256.txt'],
    maxBytes: MAX_SOURCE_MANIFEST_BYTES,
    includeBytes: false,
  });
  if (anchorCapture.record.sha256 !== baselineAnchor.sha256) {
    throw new Error('Approved preview baseline external SHA-256 anchor drifted');
  }
  sameRecord(baseline.sha256File, anchorCapture.record, 'Preview baseline sha256 file');
  const sourceManifest = captureAnchoredFile({
    python,
    root: baseline.run,
    segments: ['source-manifest.json'],
    maxBytes: MAX_SOURCE_MANIFEST_BYTES,
    includeBytes: true,
  });
  if (sourceManifest.record.sha256 !== baseline.sourceManifestSha256) {
    throw new Error('Preview baseline source manifest hash drifted');
  }
  let sourceManifestPayload;
  try {
    sourceManifestPayload = JSON.parse(sourceManifest.bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Approved baseline source manifest is not valid JSON: ${error.message}`);
  }
  if (sourceManifestPayload.schemaVersion !== VERIFIER_LEGACY_SOURCE_MANIFEST_SCHEMA) {
    throw new Error('Approved baseline source manifest must use the v2 schema');
  }
  return validateSelection(sourceManifestPayload.selection);
}

const INDEPENDENT_DATABASE_BROKER_PROGRAM = String.raw`
import importlib.util
import json
import os
import sys
import duckdb

MAX_REQUEST_BYTES = 1024 * 1024
MAX_CHAIN_BYTES = 32 * 1024 * 1024
MAX_GLOBAL_BYTES = 64 * 1024 * 1024
CHAIN_FIELDS = ("ordinal", "pdbId", "authChain", "chainKey", "profileId", "techFilter", "isBackgroundChannel")
GLOBAL_FIELDS = ("pdbId", "authChain", "techFilter", "isBackgroundChannel", "profileCount")

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        result[key] = value
    return result

def frame(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()

def load_helper(path):
    if os.path.realpath(path) != path or not os.path.isfile(path):
        raise ValueError("independent safe-openat helper path is invalid")
    spec = importlib.util.spec_from_file_location("independent_case_public_safe_openat", path)
    if spec is None or spec.loader is None:
        raise ValueError("cannot load independent safe-openat helper")
    module = importlib.util.module_from_spec(spec)
    previous_dont_write_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = previous_dont_write_bytecode
    return module

def read_request():
    raw = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    if raw == b"":
        return None
    if len(raw) > MAX_REQUEST_BYTES or not raw.endswith(b"\n"):
        raise ValueError("independent broker request exceeds line limit")
    return json.loads(raw, object_pairs_hook=unique_object)

def validate_identity(value, label):
    if type(value) is not str or not value or value.strip() != value:
        raise ValueError(f"{label} is invalid")
    return value

def global_rows(connection):
    duplicate = connection.execute(
        "SELECT pdb_id, auth, COUNT(*) AS n FROM chain "
        "GROUP BY pdb_id, auth HAVING COUNT(*) <> 1 "
        "ORDER BY pdb_id, auth LIMIT 1"
    ).fetchone()
    if duplicate is not None:
        raise ValueError(
            f"global audit chain identity is duplicated: pdbId={duplicate[0]!r}, "
            f"authChain={duplicate[1]!r}, count={duplicate[2]}"
        )
    unresolved = connection.execute(
        "WITH profile_chain_keys AS (SELECT DISTINCT pdb_id, chain_key FROM profile) "
        "SELECT p.pdb_id, p.chain_key, COUNT(c.chain_key) AS n FROM profile_chain_keys p "
        "LEFT JOIN chain c ON c.pdb_id = p.pdb_id AND c.chain_key = p.chain_key "
        "GROUP BY p.pdb_id, p.chain_key HAVING COUNT(c.chain_key) <> 1 "
        "ORDER BY p.pdb_id, p.chain_key LIMIT 1"
    ).fetchone()
    if unresolved is not None:
        raise ValueError(
            f"global audit profile chain does not resolve exactly once: pdbId={unresolved[0]!r}, "
            f"chainKey={unresolved[1]!r}, count={unresolved[2]}"
        )
    cursor = connection.execute(
        "SELECT p.pdb_id, c.auth, p.tech_filter, p.is_background_channel, COUNT(*) AS profile_count "
        "FROM profile p JOIN chain c ON c.pdb_id = p.pdb_id AND c.chain_key = p.chain_key "
        "GROUP BY p.pdb_id, c.auth, p.tech_filter, p.is_background_channel "
        "ORDER BY p.pdb_id, c.auth, "
        "CASE WHEN p.tech_filter IS NULL THEN 0 ELSE 1 END, p.tech_filter, "
        "CASE WHEN p.is_background_channel IS NULL THEN 0 WHEN p.is_background_channel = FALSE THEN 1 ELSE 2 END"
    )
    while True:
        batch = cursor.fetchmany(1024)
        if not batch:
            return
        for row in batch:
            yield dict(zip(GLOBAL_FIELDS, row))

def chain_rows(connection, pdb_id, auth_chain):
    pdb_id = validate_identity(pdb_id, "pdbId")
    auth_chain = validate_identity(auth_chain, "authChain")
    count = connection.execute(
        "SELECT COUNT(*) FROM chain WHERE pdb_id = ? AND auth = ?",
        [pdb_id, auth_chain],
    ).fetchone()[0]
    if count != 1:
        raise ValueError(
            f"selection requires exactly one DB chain; pdbId={pdb_id!r}, authChain={auth_chain!r}, count={count}"
        )
    cursor = connection.execute(
        "SELECT p.pdb_id, c.auth, p.chain_key, p.profile_key, p.tech_filter, p.is_background_channel "
        "FROM chain c JOIN profile p ON p.pdb_id = c.pdb_id AND p.chain_key = c.chain_key "
        "WHERE c.pdb_id = ? AND c.auth = ? ORDER BY p.profile_key",
        [pdb_id, auth_chain],
    )
    while True:
        batch = cursor.fetchmany(1024)
        if not batch:
            return
        for row in batch:
            yield dict(zip(CHAIN_FIELDS, (0,) + tuple(row)))

def serve(db_path, helper_path, max_bytes):
    if os.path.realpath(db_path) != db_path or not os.path.isfile(db_path):
        raise ValueError("independent database path must be a canonical regular file")
    helper = load_helper(helper_path)
    handle = helper.open_database_source_anchored(
        os.path.dirname(db_path),
        [os.path.basename(db_path)],
        max_bytes=max_bytes,
    )
    connection = None
    transaction_open = False
    source_closed = False
    try:
        connection = duckdb.connect(handle["fdPath"], read_only=True)
        connection.execute("BEGIN TRANSACTION")
        transaction_open = True
        frame({"type": "ready", "sourceRecord": handle["record"], "strategy": "anchored-fd-readonly-transaction"})
        while True:
            request = read_request()
            if request is None:
                raise ValueError("independent broker stdin closed before close request")
            if type(request) is not dict:
                raise ValueError("independent broker request must be an object")
            request_id = request.get("id")
            operation = request.get("operation")
            if type(request_id) is not int or isinstance(request_id, bool) or request_id < 1:
                raise ValueError("independent broker id is invalid")
            if operation == "global":
                if set(request) != {"id", "operation"}:
                    raise ValueError("independent global request fields differ")
                rows = global_rows(connection)
                limit = MAX_GLOBAL_BYTES
            elif operation == "chain":
                if set(request) != {"id", "operation", "pdbId", "authChain"}:
                    raise ValueError("independent chain request fields differ")
                rows = chain_rows(connection, request["pdbId"], request["authChain"])
                limit = MAX_CHAIN_BYTES
            elif operation == "close":
                if set(request) != {"id", "operation"}:
                    raise ValueError("independent close request fields differ")
                connection.execute("ROLLBACK")
                transaction_open = False
                connection.close()
                connection = None
                source_closed = True
                final_record = helper.close_database_source_anchored(handle, expected_record=handle["record"])
                frame({"id": request_id, "type": "closed", "sourceRecord": final_record})
                return
            else:
                raise ValueError("independent broker operation is invalid")
            size = 0
            count = 0
            for row in rows:
                size += len((json.dumps(row, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8"))
                if size > limit:
                    raise ValueError(f"independent broker response exceeds {limit} bytes")
                frame({"id": request_id, "type": "row", "row": row})
                count += 1
            frame({"id": request_id, "type": "end", "count": count})
    finally:
        if connection is not None:
            try:
                if transaction_open:
                    connection.execute("ROLLBACK")
            finally:
                connection.close()
        if not source_closed:
            helper.close_database_source_anchored(handle, expected_record=handle["record"])

try:
    serve(sys.argv[1], sys.argv[2], int(sys.argv[3]))
except Exception as error:
    print(f"error: {error}", file=sys.stderr)
    raise SystemExit(1)
`;

function validateIndependentBrokerRecord(record, label) {
  assertExactFields(record, INPUT_RECORD_FIELDS, label);
  if (typeof record.path !== 'string' || !path.isAbsolute(record.path)) throw new Error(`${label}.path is invalid`);
  if (!Number.isSafeInteger(record.size) || record.size < 0) throw new Error(`${label}.size is invalid`);
  for (const field of ['mtimeNs', 'inode', 'device']) {
    if (typeof record[field] !== 'string' || !/^\d+$/.test(record[field])) throw new Error(`${label}.${field} is invalid`);
  }
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(record.sha256)) {
    throw new Error(`${label}.sha256 is invalid`);
  }
  return record;
}

async function startIndependentDatabaseSession({ python, db }) {
  const child = spawn(
    python,
    ['-c', INDEPENDENT_DATABASE_BROKER_PROGRAM, db, SAFE_OPENAT_HELPER_PATH, String(MAX_DATABASE_INPUT_BYTES)],
    { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  child.stdin.on('error', () => {});
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
  let stderr = '';
  let stderrOverflow = false;
  let exited = false;
  const completion = new Promise((resolve) => {
    child.stderr.on('data', (chunk) => {
      if (stderrOverflow) return;
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > MAX_DATABASE_BROKER_STDERR_BYTES) {
        stderrOverflow = true;
        stderr = 'independent database broker stderr exceeded its byte contract';
        child.kill('SIGTERM');
      }
    });
    child.once('error', (error) => {
      exited = true;
      resolve({ error, code: null, signal: null });
    });
    child.once('close', (code, signal) => {
      exited = true;
      resolve({ error: null, code, signal });
    });
  });
  let nextId = 1;
  let closed = false;

  async function nextFrame(label) {
    const item = await lines.next();
    if (item.done) {
      const outcome = await completion;
      const detail = outcome.error?.message || stderr || outcome.signal || `exit ${outcome.code}`;
      throw new Error(`${label} ended before a complete response: ${detail}`);
    }
    try {
      return JSON.parse(item.value);
    } catch (error) {
      throw new Error(`${label} emitted invalid JSON: ${error.message}`);
    }
  }

  async function writeRequest(request) {
    await new Promise((resolve, reject) => {
      child.stdin.write(
        deterministicJson(request),
        'utf8',
        (error) => (error ? reject(error) : resolve()),
      );
    });
  }

  async function requestRows(request, maxBytes, label) {
    await writeRequest(request);
    const rows = [];
    let bytes = 0;
    while (true) {
      const frame = await nextFrame(label);
      if (!isRecord(frame) || frame.id !== request.id) throw new Error(`${label} response identity drifted`);
      if (frame.type === 'row') {
        assertExactFields(frame, ['id', 'type', 'row'], `${label} row frame`);
        bytes += Buffer.byteLength(deterministicJson(frame.row), 'utf8');
        if (bytes > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
        rows.push(frame.row);
      } else if (frame.type === 'end') {
        assertExactFields(frame, ['id', 'type', 'count'], `${label} end frame`);
        if (frame.count !== rows.length) throw new Error(`${label} row count drifted`);
        return rows;
      } else {
        throw new Error(`${label} response type is invalid`);
      }
    }
  }

  let sourceRecord;
  try {
    const ready = await nextFrame('Independent database broker startup');
    assertExactFields(ready, ['type', 'sourceRecord', 'strategy'], 'Independent database broker ready frame');
    if (ready.type !== 'ready' || ready.strategy !== 'anchored-fd-readonly-transaction') {
      throw new Error('Independent database broker strategy is invalid');
    }
    sourceRecord = validateIndependentBrokerRecord(ready.sourceRecord, 'Independent database broker source record');
  } catch (error) {
    child.stdin.destroy();
    if (!exited) child.kill('SIGTERM');
    await completion;
    throw error;
  }

  return {
    sourceRecord,
    async globalRows() {
      const id = nextId++;
      const rows = await requestRows({ id, operation: 'global' }, VERIFIER_MAX_GLOBAL_AUDIT_STDOUT_BYTES, 'Independent global audit broker');
      return parseIndependentGlobalAuditRows(rows);
    },
    async chainRows(selection) {
      const id = nextId++;
      const rows = await requestRows(
        { id, operation: 'chain', pdbId: selection.pdbId, authChain: selection.authChain },
        MAX_CHAIN_QUERY_STDOUT_BYTES,
        `Independent per-chain broker ${selection.pdbId}/${selection.authChain}`,
      );
      return parseNdjsonStrict(rows.map((row) => deterministicJson(row)).join(''));
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        const id = nextId++;
        await writeRequest({ id, operation: 'close' });
        const frame = await nextFrame('Independent database broker close');
        assertExactFields(frame, ['id', 'type', 'sourceRecord'], 'Independent database broker close frame');
        if (frame.id !== id || frame.type !== 'closed') throw new Error('Independent database broker close identity drifted');
        sameRecord(sourceRecord, validateIndependentBrokerRecord(frame.sourceRecord, 'Independent database broker final record'), 'Independent database broker source');
        child.stdin.end();
        const outcome = await completion;
        if (outcome.error || outcome.code !== 0 || outcome.signal !== null || stderrOverflow || stderr !== '') {
          const detail = outcome.error?.message || stderr || outcome.signal || `exit ${outcome.code}`;
          throw new Error(`Independent database broker failed during close: ${detail}`);
        }
      } catch (error) {
        child.stdin.destroy();
        if (!exited) child.kill('SIGTERM');
        await completion;
        throw error;
      }
    },
    async abort() {
      if (closed) return;
      closed = true;
      child.stdin.destroy();
      if (!exited) child.kill('SIGTERM');
      await completion;
    },
  };
}

function parseIndependentGlobalAuditRows(rows) {
  return rows.map((row, index) => {
    assertExactFields(row, VERIFIER_GLOBAL_AUDIT_FIELDS, `Verifier global audit row ${index + 1}`);
    return row;
  });
}

export async function verifyRun(argv, {
  baselineAnchor = VERIFIER_APPROVED_PREVIEW_BASELINE_ANCHOR,
  logicalRun = null,
} = {}) {
  const parsed = parseVerifierArgs(argv);
  const run = requireDirectory(parsed.run, '--run');
  const db = requireFile(parsed.db, '--db');
  const caseRoot = requireDirectory(parsed.caseroot, '--case-root');
  const python = requireFile(parsed.python, '--python');
  const commandRun = logicalRun === null ? run : path.resolve(logicalRun);
  if (logicalRun !== null) {
    const commandParent = realpathSync(path.dirname(commandRun));
    if (path.dirname(commandRun) !== commandParent || commandRun === run) {
      throw new Error('Verifier logicalRun must name a not-yet-published child of a canonical directory');
    }
  }
  const runId = path.basename(commandRun);

  const runBefore = await snapshotRunTreeStreaming(run, { python });
  const dbPreflight = captureAbsoluteAnchored({
    python,
    filePath: db,
    maxBytes: MAX_DATABASE_INPUT_BYTES,
    includeBytes: false,
  }).record;
  let databaseSession = null;
  let dbBefore = dbPreflight;
  let profileSnapshots = [];
  let caseInventoryBefore = null;
  let primaryError = null;
  try {
    databaseSession = await startIndependentDatabaseSession({ python, db });
    sameRecord(dbPreflight, databaseSession.sourceRecord, 'Verifier database preflight');
    dbBefore = databaseSession.sourceRecord;
    const manifestCapture = parseJsonFileBounded({
      python,
      root: run,
      segments: ['source-manifest.json'],
      label: 'source-manifest.json',
      maxBytes: MAX_SOURCE_MANIFEST_BYTES,
    });
    const manifest = manifestCapture.payload;
    assertBytes(manifestCapture.bytes, deterministicJson(manifest), 'source-manifest canonical JSON');
    const isPreview = manifest.schemaVersion === VERIFIER_PREVIEW_SOURCE_MANIFEST_SCHEMA;
    const isLegacyData = manifest.schemaVersion === VERIFIER_LEGACY_SOURCE_MANIFEST_SCHEMA;
    const isCurrentData = manifest.schemaVersion === VERIFIER_CURRENT_SOURCE_MANIFEST_SCHEMA;
    if (logicalRun !== null && !isPreview) {
      throw new Error('Verifier logicalRun is allowed only for private preview assembly verification');
    }
    if (!isPreview && !isLegacyData && !isCurrentData) {
      throw new Error('Source manifest schemaVersion is invalid');
    }
    assertExactFields(
      manifest,
      isPreview ? PREVIEW_MANIFEST_FIELDS : isCurrentData ? CURRENT_MANIFEST_FIELDS : LEGACY_MANIFEST_FIELDS,
      'Source manifest',
    );
    assertExactFields(
      manifest.execution,
      isPreview ? PREVIEW_EXECUTION_FIELDS : isCurrentData ? CURRENT_EXECUTION_FIELDS : EXECUTION_FIELDS,
      'Source manifest execution',
    );
    if (manifest.execution.maxDbOnlyAuditSummaryBytes !== MAX_DB_ONLY_AUDIT_SUMMARY_BYTES) {
      throw new Error('Source manifest execution.maxDbOnlyAuditSummaryBytes is invalid');
    }
    if (manifest.execution.maxSourceManifestBytes !== MAX_SOURCE_MANIFEST_BYTES) {
      throw new Error('Source manifest execution.maxSourceManifestBytes is invalid');
    }
    if (manifest.execution.maxProfileIndexBytes !== MAX_PROFILE_INDEX_BYTES) {
      throw new Error(
        'Source manifest execution.maxProfileIndexBytes compressed/decompressed ceiling is invalid',
      );
    }
    if (isCurrentData) {
      if (manifest.execution.maxGlobalAuditStdoutBytes !== VERIFIER_MAX_GLOBAL_AUDIT_STDOUT_BYTES) {
        throw new Error('Source manifest execution.maxGlobalAuditStdoutBytes is invalid');
      }
      if (manifest.execution.maxClassificationExceptionReportBytes !== VERIFIER_MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES) {
        throw new Error('Source manifest execution.maxClassificationExceptionReportBytes is invalid');
      }
    }
    const expectedBuilderVersion = isPreview
      ? VERIFIER_PREVIEW_BUILDER_VERSION
      : isCurrentData ? VERIFIER_CURRENT_BUILDER_VERSION : VERIFIER_LEGACY_BUILDER_VERSION;
    if (manifest.builderVersion !== expectedBuilderVersion) {
      throw new Error('Source manifest builderVersion is invalid');
    }
    if (isPreview) {
      if (manifest.artifactKind !== VERIFIER_PREVIEW_ARTIFACT_KIND) throw new Error('Preview artifactKind is invalid');
      if (manifest.execution.previewStrategy !== 'anchored-selected-chain-copy') throw new Error('Preview execution strategy is invalid');
      if (manifest.execution.maxPreviewFileBytes !== VERIFIER_MAX_PREVIEW_FILE_BYTES) throw new Error('Preview file byte cap is invalid');
      if (manifest.execution.maxPreviewManifestBytes !== VERIFIER_MAX_PREVIEW_MANIFEST_BYTES) throw new Error('Preview manifest byte cap is invalid');
    }
    if (manifest.runId !== runId) throw new Error('Source manifest runId does not match run directory');
    if (manifest.selectionMode !== 'cases' && manifest.selectionMode !== 'all') {
      throw new Error('Source manifest selectionMode is invalid');
    }
    const runIdParts = validateRunKindIndependently({
      runId,
      selectionMode: manifest.selectionMode,
      manifestRunKind: manifest.runKind,
      requiresManifestRunKind: isCurrentData,
      isPreview,
      isLegacyData,
    });
    const commit = resolveRecordedCommit(runIdParts.git12, manifest.gitCommit);
    const expectedClosure = independentlyRebuildSourceClosure(
      commit,
      isPreview ? VERIFIER_PREVIEW_SOURCE_CLOSURE_PATHS : SOURCE_CLOSURE_PATHS,
    );
    if (deterministicJson(manifest.sourceClosure) !== deterministicJson(expectedClosure)) {
      throw new Error('Source manifest sourceClosure does not match committed Git blobs');
    }
    const started = validateIsoUtcInstant(manifest.buildStartedAt, 'Source manifest buildStartedAt');
    const projectionCompleted = validateIsoUtcInstant(
      manifest.projectionCompletedAt,
      'Source manifest projectionCompletedAt',
    );
    const finalized = validateIsoUtcInstant(manifest.finalizedAt, 'Source manifest finalizedAt');
    if (projectionCompleted < started) throw new Error('Source manifest projectionCompletedAt precedes buildStartedAt');
    if (finalized < projectionCompleted) throw new Error('Source manifest finalizedAt precedes projectionCompletedAt');
    if (manifest.caseRoot !== caseRoot) throw new Error('Source manifest caseRoot does not match --case-root');
    const techniqueReplay = await independentlyLoadCommittedTechniqueReplay(commit);
    const committedTaxonomySnapshotSha256 = techniqueReplay.taxonomySnapshotSha256;
    if (manifest.taxonomySnapshotSha256 !== committedTaxonomySnapshotSha256) {
      throw new Error('Source manifest taxonomy snapshot hash does not match committed taxonomy');
    }
    sameRecord(manifest.database, dbPreflight, 'Source manifest database');
    const selections = validateSelection(manifest.selection);
    if (isPreview) {
      if (manifest.selectionMode !== 'cases') throw new Error('Preview manifest selectionMode must be cases');
      const baselineSelection = await validatePreviewBaseline({
        baseline: manifest.baseline,
        baselineAnchor,
        db,
        caseRoot,
        python,
      });
      if (deterministicJson(selections) !== deterministicJson(baselineSelection)) {
        throw new Error('Preview selection must exactly match the approved baseline selection and order');
      }
    }
    if (isCurrentData || manifest.selectionMode === 'all') {
      caseInventoryBefore = independentlyCaptureCaseInventory(caseRoot, python);
    }
    if (manifest.selectionMode === 'all') {
      const completeSelection = caseInventoryBefore
        .map(({ pdbId, authChain }) => ({ pdbId, authChain }));
      if (deterministicJson(manifest.selection) !== deterministicJson(completeSelection)) {
        throw new Error('Source manifest --all selection does not match complete safe case-root inventory');
      }
    }
    const expectedCaseInventory = isCurrentData
      ? independentlyDescribeCaseInventory(caseInventoryBefore)
      : null;
    if (isCurrentData) {
      assertExactFields(manifest.caseInventory, ['profileIndexCount', 'sha256'], 'Source manifest caseInventory');
      if (deterministicJson(manifest.caseInventory) !== deterministicJson(expectedCaseInventory)) {
        throw new Error('Source manifest caseInventory differs from complete current Case inventory');
      }
    }
    assertBytes(
      captureRunFile({
        python,
        run,
        relativePath: 'selection.json',
        maxBytes: MAX_SOURCE_MANIFEST_BYTES,
      }).bytes,
      deterministicJson(manifest.selection),
      'selection.json',
    );
    if (!Array.isArray(manifest.profileIndexes) || manifest.profileIndexes.length !== selections.length) {
      throw new Error('Source manifest profileIndexes must exactly cover selection');
    }
    const profileInputs = selections.map((selection, ordinal) => {
      const recorded = manifest.profileIndexes[ordinal];
      assertExactFields(recorded, PROFILE_RECORD_FIELDS, `Source manifest profileIndexes[${ordinal}]`);
      for (const field of ['ordinal', 'pdbId', 'authChain']) {
        if (recorded[field] !== selection[field]) throw new Error(`Source manifest profileIndexes[${ordinal}].${field} drift`);
      }
      const segments = [selection.pdbId, 'chains', selection.authChain, 'profiles', 'profile-index.json.gz'];
      const expectedPath = path.join(caseRoot, ...segments);
      if (recorded.path !== expectedPath) throw new Error(`Source manifest profile-index path drift at ordinal ${ordinal}`);
      const captured = captureAnchoredFile({
        python,
        root: caseRoot,
        segments,
        maxBytes: MAX_PROFILE_INDEX_BYTES,
        includeBytes: true,
      });
      sameRecord(
        Object.fromEntries(INPUT_RECORD_FIELDS.map((field) => [field, recorded[field]])),
        captured.record,
        `Profile-index record ${ordinal}`,
      );
      parseProfileIndexGzipBytes(captured.bytes, expectedPath);
      return {
        ...selection,
        path: expectedPath,
        segments,
        inputRecord: captured.record,
      };
    });
    profileSnapshots = profileInputs.map(({ segments, inputRecord }) => ({ segments, inputRecord }));

    const previewInventory = isPreview
      ? validatePreviewProvenance({ manifest, selections, caseRoot, python, commit, run })
      : null;

    const layout = snapshotAnchoredTree({
      python,
      root: run,
      maxBytesByRelativePath: RUN_FILE_BYTE_LIMITS,
      defaultMaxBytes: isPreview ? VERIFIER_MAX_PREVIEW_FILE_BYTES : null,
    });
    const expectedRunFiles = [
      ...expectedFiles(selections, { includeClassificationExceptions: isCurrentData }),
      ...(previewInventory?.files || []).map((file) => path.posix.join('pilot-preview', file.path)),
    ].sort(compareUtf8);
    if (deterministicJson(layout.files.map(({ path: relative }) => relative).sort(compareUtf8)) !== deterministicJson(expectedRunFiles)) {
      throw new Error('Run layout has missing or unexpected files');
    }
    const actualDirectories = layout.directories.map(({ path: relative }) => relative).filter(Boolean).sort(compareUtf8);
    const expectedRunDirectories = new Set(expectedDirectories(selections));
    for (const directory of previewInventory?.directories || []) {
      if (directory) expectedRunDirectories.add(path.posix.join('pilot-preview', directory));
    }
    if (deterministicJson(actualDirectories) !== deterministicJson([...expectedRunDirectories].sort(compareUtf8))) {
      throw new Error('Run layout has missing or unexpected directories');
    }
    if (!isPreview && layout.files.some(({ path: relative }) => relative.startsWith('pilot-preview/'))) {
      throw new Error('pilot-preview must be an empty directory');
    }

    const reports = {
      joinFailures: createExpectedReport(REPORT_HEADERS.joinFailures),
      dbOnly: createExpectedReport(REPORT_HEADERS.dbOnly),
      unmapped: createExpectedReport(REPORT_HEADERS.unmapped),
      nullTechniques: createExpectedReport(REPORT_HEADERS.nullTechniques),
    };
    const statusCounts = emptyStatusCounts();
    let sidecarCount = 0;
    let profileCount = 0;
    let dbOnlyProfileCount = 0;
    const expectedDbOnlyAuditAccumulator = createBoundedDbOnlyAuditSummaryAccumulator({
      selection: manifest.selection,
      maxBytes: MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
    });
    const expectedClassificationAuditAccumulator = isCurrentData
      ? createIndependentClassificationExceptionAudit({
        globalRows: await databaseSession.globalRows(),
        caseInventory: caseInventoryBefore,
        selections: manifest.selection,
        techniqueReplay,
      })
      : null;
    let unmappedTechniqueCount = 0;
    let nullTechniqueCount = 0;
    const executionState = await processSequentiallyBounded(profileInputs, async (input) => {
      const profileCapture = captureAnchoredFile({
        python,
        root: caseRoot,
        segments: input.segments,
        maxBytes: MAX_PROFILE_INDEX_BYTES,
        includeBytes: true,
      });
      sameRecord(profileCapture.record, input.inputRecord, `Profile-index processing record ${input.ordinal}`);
      const profileIndex = parseProfileIndexGzipBytes(profileCapture.bytes, input.path);
      const queried = (await databaseSession.chainRows({
        pdbId: input.pdbId,
        authChain: input.authChain,
      })).map((row, rowIndex) => {
        if (row.ordinal !== 0 || row.pdbId !== input.pdbId || row.authChain !== input.authChain) {
          throw new Error(`Verifier per-chain row ${rowIndex} identity drift`);
        }
        return { ...row, ordinal: input.ordinal };
      });
      const projection = independentlyProjectChain({
        selection: input,
        profileIndex,
        rows: queried,
        techniqueReplay,
      });
      const relative = sidecarRelativePath(input.pdbId, input.authChain);
      const actualGzip = captureRunFile({
        python,
        run,
        relativePath: relative,
        maxBytes: MAX_SOURCE_MANIFEST_BYTES,
      }).bytes;
      assertBytes(actualGzip, deterministicGzip(projection.payload), `Sidecar gzip ${relative}`);
      let decompressed;
      try {
        decompressed = gunzipSync(actualGzip);
      } catch (error) {
        throw new Error(`Sidecar ${relative} is not valid gzip: ${error.message}`);
      }
      assertBytes(decompressed, deterministicJson(projection.payload), `Sidecar ${relative}`);
      reports.dbOnly.append(projection.dbOnlyRows);
      expectedClassificationAuditAccumulator?.append({
        publicRows: projection.publicClassificationExceptionRows,
        dbOnlyRows: projection.dbOnlyClassificationExceptionRows,
      });
      expectedDbOnlyAuditAccumulator.append(
        independentlySummarizeDbOnlyRows(projection.dbOnlyRows, input),
      );
      reports.unmapped.append(projection.unmappedRows);
      reports.nullTechniques.append(projection.nullRows);
      sidecarCount += 1;
      profileCount += projection.payload.profileCount;
      dbOnlyProfileCount += projection.dbOnlyRows.length;
      unmappedTechniqueCount += projection.unmappedRows.length;
      nullTechniqueCount += projection.nullRows.length;
      for (const status of STATUS_NAMES) statusCounts[status] += projection.statusCounts[status];
    });
    const expectedDbOnlyAuditSummary = expectedDbOnlyAuditAccumulator.finish();
    const expectedClassificationExceptionAudit = expectedClassificationAuditAccumulator?.finish() || null;

    await assertReportDigest({ python, run, relativePath: 'reports/profile-join-failures.tsv', expected: reports.joinFailures.finish(), label: 'join-failures report' });
    await assertReportDigest({ python, run, relativePath: 'reports/db-only-profiles.tsv', expected: reports.dbOnly.finish(), label: 'DB-only report' });
    await assertReportDigest({ python, run, relativePath: 'reports/unmapped-techniques.tsv', expected: reports.unmapped.finish(), label: 'unmapped report' });
    await assertReportDigest({ python, run, relativePath: 'reports/null-techniques.tsv', expected: reports.nullTechniques.finish(), label: 'null-techniques report' });
    if (isCurrentData) {
      const classificationReportBytes = Buffer.from(verifierTsv(
        VERIFIER_CLASSIFICATION_EXCEPTION_FIELDS,
        expectedClassificationExceptionAudit,
      ));
      if (classificationReportBytes.length > VERIFIER_MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES) {
        throw new Error('Verifier classification exception report exceeds its byte contract');
      }
      await assertReportDigest({
        python,
        run,
        relativePath: 'reports/classification-exceptions.tsv',
        expected: {
          size: classificationReportBytes.length,
          sha256: createHash('sha256').update(classificationReportBytes).digest('hex'),
        },
        label: 'classification-exceptions report',
      });
      if (!Array.isArray(manifest.classificationExceptionAudit)) {
        throw new TypeError('Source manifest classificationExceptionAudit must be an array');
      }
      manifest.classificationExceptionAudit.forEach((row, index) => {
        assertExactFields(
          row,
          VERIFIER_CLASSIFICATION_EXCEPTION_FIELDS,
          `Source manifest classificationExceptionAudit[${index}]`,
        );
      });
      if (
        deterministicJson(manifest.classificationExceptionAudit)
        !== deterministicJson(expectedClassificationExceptionAudit)
      ) {
        throw new Error('Source manifest classification exception audit differs from independent DuckDB audit');
      }
    }

    const coverage = {
      schemaVersion: COVERAGE_SCHEMA,
      runId,
      chainCount: selections.length,
      sidecarCount,
      profileCount,
      statusCounts: Object.fromEntries(STATUS_NAMES.map((status) => [status, statusCounts[status]])),
      dbOnlyProfileCount,
      unmappedTechniqueCount,
      nullTechniqueCount,
    };
    assertBytes(
      captureRunFile({ python, run, relativePath: 'reports/coverage.json', maxBytes: MAX_SOURCE_MANIFEST_BYTES }).bytes,
      deterministicJson(coverage),
      'coverage report',
    );
    const expectedTotals = {
      chainCount: coverage.chainCount,
      sidecarCount: coverage.sidecarCount,
      profileCount: coverage.profileCount,
      statusCounts: coverage.statusCounts,
      dbOnlyProfileCount: coverage.dbOnlyProfileCount,
      unmappedTechniqueCount: coverage.unmappedTechniqueCount,
      nullTechniqueCount: coverage.nullTechniqueCount,
    };
    validateDbOnlyAuditSummary(manifest.dbOnlyAuditSummary, manifest.selection);
    validateDbOnlyAuditSummary(expectedDbOnlyAuditSummary, manifest.selection);
    const recordedAuditCount = manifest.dbOnlyAuditSummary.reduce((sum, row) => sum + row.count, 0);
    if (recordedAuditCount !== manifest.totals.dbOnlyProfileCount) {
      throw new Error('Source manifest DB-only audit summary count does not match recorded totals');
    }
    if (expectedDbOnlyAuditSummary.reduce((sum, row) => sum + row.count, 0) !== dbOnlyProfileCount) {
      throw new Error('Independent DB-only audit summary count does not match DB-only report projection');
    }
    if (deterministicJson(manifest.dbOnlyAuditSummary) !== deterministicJson(expectedDbOnlyAuditSummary)) {
      throw new Error('Source manifest DB-only audit summary differs from independent DuckDB projection');
    }
    const commonExpectedManifest = {
      runId,
      gitCommit: commit,
      buildStartedAt: manifest.buildStartedAt,
      projectionCompletedAt: manifest.projectionCompletedAt,
      finalizedAt: manifest.finalizedAt,
      sourceClosure: expectedClosure,
      database: dbPreflight,
      caseRoot,
      profileIndexes: profileInputs.map((input) => ({
        ordinal: input.ordinal,
        pdbId: input.pdbId,
        authChain: input.authChain,
        ...input.inputRecord,
      })),
      taxonomySnapshotSha256: committedTaxonomySnapshotSha256,
      selectionMode: manifest.selectionMode,
      selection: manifest.selection.map((selection) => ({ ...selection })),
      dbOnlyAuditSummary: expectedDbOnlyAuditSummary,
      totals: expectedTotals,
    };
    const baseExecution = {
      strategy: 'per-chain',
      maxBufferedChains: executionState.maxBufferedItems,
      maxExtractorStdoutBytes: MAX_CHAIN_QUERY_STDOUT_BYTES,
      maxDbOnlyAuditSummaryBytes: MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
      maxSourceManifestBytes: MAX_SOURCE_MANIFEST_BYTES,
      maxProfileIndexBytes: MAX_PROFILE_INDEX_BYTES,
    };
    const expectedManifest = isPreview ? {
      schemaVersion: VERIFIER_PREVIEW_SOURCE_MANIFEST_SCHEMA,
      builderVersion: VERIFIER_PREVIEW_BUILDER_VERSION,
      artifactKind: VERIFIER_PREVIEW_ARTIFACT_KIND,
      ...commonExpectedManifest,
      baseline: manifest.baseline,
      commands: expectedPreviewCommands({
        run: commandRun,
        runId,
        db,
        caseRoot,
        python,
        selections,
        baselineRun: baselineAnchor.run,
      }),
      execution: {
        ...baseExecution,
        previewStrategy: 'anchored-selected-chain-copy',
        maxPreviewFileBytes: VERIFIER_MAX_PREVIEW_FILE_BYTES,
        maxPreviewManifestBytes: VERIFIER_MAX_PREVIEW_MANIFEST_BYTES,
      },
      preview: manifest.preview,
    } : isCurrentData ? {
      schemaVersion: VERIFIER_CURRENT_SOURCE_MANIFEST_SCHEMA,
      builderVersion: VERIFIER_CURRENT_BUILDER_VERSION,
      runKind: runIdParts.kind,
      ...commonExpectedManifest,
      caseInventory: expectedCaseInventory,
      classificationExceptionAudit: expectedClassificationExceptionAudit,
      commands: expectedCommands({
        run: commandRun,
        runId,
        db,
        caseRoot,
        python,
        selections,
        selectionMode: manifest.selectionMode,
        includeGlobalAudit: true,
        anchoredDatabaseConnection: true,
      }),
      execution: {
        ...baseExecution,
        maxGlobalAuditStdoutBytes: VERIFIER_MAX_GLOBAL_AUDIT_STDOUT_BYTES,
        maxClassificationExceptionReportBytes: VERIFIER_MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES,
      },
    } : {
      schemaVersion: VERIFIER_LEGACY_SOURCE_MANIFEST_SCHEMA,
      builderVersion: VERIFIER_LEGACY_BUILDER_VERSION,
      ...commonExpectedManifest,
      commands: expectedCommands({
        run: commandRun,
        runId,
        db,
        caseRoot,
        python,
        selections,
        selectionMode: manifest.selectionMode,
      }),
      execution: baseExecution,
    };
    if (deterministicJson(manifest) !== deterministicJson(expectedManifest)) {
      const differingFields = Object.keys(expectedManifest)
        .filter((field) => deterministicJson(manifest[field]) !== deterministicJson(expectedManifest[field]));
      throw new Error(
        `Source manifest declarations do not match independently regenerated provenance: ${differingFields.join(', ')}`,
      );
    }
    assertBytes(
      captureRunFile({
        python,
        run,
        relativePath: 'reports/sha256.txt',
        maxBytes: MAX_SOURCE_MANIFEST_BYTES,
      }).bytes,
      sha256AnchoredManifest({
        python,
        root: run,
        maxBytesByRelativePath: RUN_FILE_BYTE_LIMITS,
        defaultMaxBytes: isPreview ? VERIFIER_MAX_PREVIEW_FILE_BYTES : null,
      }),
      'SHA-256 manifest',
    );
    if (caseInventoryBefore !== null) {
      const caseInventoryAfter = independentlyCaptureCaseInventory(caseRoot, python);
      if (deterministicJson(caseInventoryBefore) !== deterministicJson(caseInventoryAfter)) {
        throw new Error('Verifier complete Case inventory changed during verification');
      }
    }
    await databaseSession.close();
    databaseSession = null;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError = null;
    try {
      if (databaseSession !== null) {
        try {
          await databaseSession.close();
        } catch (error) {
          cleanupError = error;
          await databaseSession.abort();
        } finally {
          databaseSession = null;
        }
      }
      const changes = [];
      if (await snapshotRunTreeStreaming(run, { python }) !== runBefore) {
        changes.push('run tree');
      }
      const dbAfter = captureAbsoluteAnchored({ python, filePath: db }).record;
      if (deterministicJson(dbAfter) !== deterministicJson(dbBefore)) changes.push('database');
      for (const { segments, inputRecord } of profileSnapshots) {
        const after = captureAnchoredFile({
          python,
          root: caseRoot,
          segments,
          maxBytes: MAX_PROFILE_INDEX_BYTES,
          includeBytes: false,
        }).record;
        if (deterministicJson(after) !== deterministicJson(inputRecord)) {
          changes.push(`profile-index ${path.join(caseRoot, ...segments)}`);
        }
      }
      if (changes.length > 0) throw new Error(`Verifier mutated immutable inputs: ${changes.join(', ')}`);
    } catch (error) {
      if (cleanupError === null) cleanupError = error;
      else cleanupError = new Error(`${cleanupError.message}; cleanup verification also failed: ${error.message}`);
    }
    if (cleanupError !== null) {
      if (primaryError !== null) {
        primaryError.message = `${primaryError.message}; cleanup verification also failed: ${cleanupError.message}`;
      } else {
        throw cleanupError;
      }
    }
  }
  return { run, runId };
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await verifyRun(argv);
    process.stdout.write(`${result.run}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = await main();
}
