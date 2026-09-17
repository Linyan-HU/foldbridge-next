#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  constants as FS_CONSTANTS,
  chmodSync,
  closeSync,
  fchmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import {
  buildRun,
  captureSourceClosure,
  resolveGitCommit,
} from './build-case-public-techniques.mjs';
import {
  MAX_PREVIEW_FILE_BYTES,
  MAX_PREVIEW_MANIFEST_BYTES,
  MAX_SOURCE_MANIFEST_BYTES,
  APPROVED_PREVIEW_BASELINE_ANCHOR,
  PREVIEW_ARTIFACT_KIND,
  PREVIEW_BUILDER_VERSION,
  PREVIEW_GLOBAL_DIRECTORIES,
  PREVIEW_GLOBAL_FILES,
  PREVIEW_PROVENANCE_SCHEMA,
  PREVIEW_SOURCE_CLOSURE_PATHS,
  PREVIEW_SOURCE_MANIFEST_SCHEMA,
  LEGACY_SOURCE_MANIFEST_SCHEMA,
  captureAnchoredFile,
  classifyTechniqueToken,
  committedPreviewGlobalAssets,
  compareUtf8,
  deterministicJson,
  materializeAnchoredDirectory,
  parseProfileIndexGzipBytes,
  sha256AnchoredManifest,
  snapshotAnchoredTree,
  validateRunId,
} from './case-public-techniques-lib.mjs';
import { verifyRun } from './verify-case-public-techniques.mjs';
import { versionEfEntryAssets } from './version-ef-entry-assets.mjs';
import { MECHANISM_FAMILIES } from '../src/techniqueFilterModel.js';
import { validateProfilePublicTechniques } from '../public/entry-cases/__entry_v3_site__/workbench-pure.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const NO_FOLLOW = FS_CONSTANTS.O_NOFOLLOW ?? 0;
const PREVIEW_MANIFEST_LIMITS = new Map([['source-manifest.json', MAX_PREVIEW_MANIFEST_BYTES]]);
export const APPROVED_BASELINE_ANCHOR = APPROVED_PREVIEW_BASELINE_ANCHOR;

export const PREVIEW_SINGLE_WRITER_CONTRACT =
  'buildPreviewRun requires an exclusive single-writer for its new partial directory and immutable read-only inputs.';

const VALUE_FLAGS = new Set([
  '--baseline-run',
  '--db',
  '--case-root',
  '--worktree-public',
  '--out-parent',
  '--run-id',
  '--python',
]);

function parseCaseIdentity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must have exactly the form PDB/auth`);
  }
  const parts = value.split('/');
  if (parts.length !== 2) throw new Error(`${label} must have exactly the form PDB/auth`);
  const [pdbId, authChain] = parts;
  for (const [field, identity] of [['PDB', pdbId], ['auth', authChain]]) {
    if (!identity || identity.trim() !== identity || identity === '.' || identity === '..' || identity.includes('\0')) {
      throw new Error(`${label} ${field} must be a safe, non-empty, unpadded path segment`);
    }
  }
  return { pdbId, authChain };
}

export function parsePreviewBuilderArgs(argv, {
  baselineAnchor = APPROVED_BASELINE_ANCHOR,
  expectedWorktreePublic = path.join(REPO_ROOT, 'public'),
} = {}) {
  const values = new Map();
  const cases = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (VALUE_FLAGS.has(flag)) {
      if (values.has(flag)) throw new Error(`Duplicate argument ${flag}`);
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
        throw new Error(`Missing value for ${flag}`);
      }
      values.set(flag, argv[index + 1]);
      index += 1;
    } else if (flag === '--case') {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) {
        throw new Error('Missing value for --case');
      }
      cases.push(parseCaseIdentity(argv[index + 1], `--case[${cases.length}]`));
      index += 1;
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(flag)}`);
    }
  }
  for (const flag of VALUE_FLAGS) {
    if (!values.has(flag)) throw new Error(`Missing required argument ${flag}`);
  }
  if (cases.length === 0) throw new Error('At least one repeated --case is required');
  const seen = new Set();
  for (const selection of cases) {
    const key = `${selection.pdbId}\0${selection.authChain}`;
    if (seen.has(key)) throw new Error(`Duplicate --case identity ${selection.pdbId}/${selection.authChain}`);
    seen.add(key);
  }
  const runId = values.get('--run-id');
  const runIdParts = validateRunId(runId);
  if (runIdParts.kind !== 'pilot') {
    throw new Error('Preview run-id must match pilot-<real YYYYMMDDTHHMMSSZ UTC>-<12 lowercase hex>');
  }
  if (values.get('--baseline-run') !== baselineAnchor.run) {
    throw new Error('--baseline-run must equal the approved immutable baseline');
  }
  if (values.get('--worktree-public') !== expectedWorktreePublic) {
    throw new Error('--worktree-public must equal the repository public root');
  }
  return {
    baselineRun: values.get('--baseline-run'),
    db: values.get('--db'),
    caseRoot: values.get('--case-root'),
    worktreePublic: values.get('--worktree-public'),
    outParent: values.get('--out-parent'),
    runId,
    python: values.get('--python'),
    cases,
    argv: [...argv],
  };
}

function requireDirectory(input, label) {
  const lexical = path.resolve(input);
  const before = lstatSync(lexical);
  if (before.isSymbolicLink() || !before.isDirectory()) throw new Error(`${label} must be a non-symlink directory`);
  const canonical = realpathSync(lexical);
  if (canonical !== lexical) throw new Error(`${label} must be a canonical directory without symlinks`);
  return canonical;
}

function requireFile(input, label) {
  const lexical = path.resolve(input);
  const canonical = realpathSync(lexical);
  const target = lstatSync(canonical);
  if (target.isSymbolicLink() || !target.isFile()) throw new Error(`${label} must resolve to a regular file`);
  return canonical;
}

function entryExistsNoFollow(entryPath) {
  try {
    lstatSync(entryPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function anchoredAbsoluteFile({ python, filePath, maxBytes = null, includeBytes = false }) {
  return captureAnchoredFile({
    python,
    root: path.dirname(filePath),
    segments: [path.basename(filePath)],
    maxBytes,
    includeBytes,
  });
}

function sameRecord(left, right, label) {
  for (const field of ['path', 'size', 'mtimeNs', 'inode', 'device', 'sha256']) {
    if (left[field] !== right[field]) throw new Error(`${label} changed (${field})`);
  }
}

function sameTree(left, right, label) {
  if (deterministicJson(left) !== deterministicJson(right)) throw new Error(`${label} changed`);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseGzipJson(bytes, label) {
  let decompressed;
  try {
    decompressed = gunzipSync(bytes, { maxOutputLength: MAX_PREVIEW_FILE_BYTES });
  } catch (error) {
    throw new Error(`${label} is not bounded valid gzip: ${error.message}`);
  }
  return { payload: parseJsonBytes(decompressed, label), bytes: decompressed };
}

function expectedDirectoryPaths(filePaths) {
  const directories = new Set(['']);
  for (const filePath of filePaths) {
    let parent = path.posix.dirname(filePath);
    while (parent !== '.') {
      directories.add(parent);
      parent = path.posix.dirname(parent);
    }
  }
  return [...directories].sort(compareUtf8);
}

function snapshotGlobalSources({ python, repoRoot, worktreePublic, globalDirectories, globalFiles, globalAssets }) {
  const directories = globalDirectories.map((directory) => {
    const root = path.join(worktreePublic, ...directory.split('/'));
    const tree = snapshotAnchoredTree({ python, root, defaultMaxBytes: MAX_PREVIEW_FILE_BYTES });
    const expectedFiles = globalAssets
      .filter((asset) => asset.path.startsWith(`${directory}/`))
      .map((asset) => asset.path.slice(directory.length + 1));
    if (deterministicJson(tree.files.map((item) => item.path)) !== deterministicJson(expectedFiles)) {
      throw new Error(`Worktree global directory differs from committed files: ${directory}`);
    }
    if (deterministicJson(tree.directories.map((item) => item.path)) !== deterministicJson(expectedDirectoryPaths(expectedFiles))) {
      throw new Error(`Worktree global directory contains uncommitted directory layout: ${directory}`);
    }
    return { directory, root, tree };
  });
  const files = globalFiles.map((relativePath) => {
    const asset = globalAssets.find((item) => item.path === relativePath);
    if (!asset) throw new Error(`Committed global file inventory is missing ${relativePath}`);
    const captured = captureAnchoredFile({
      python,
      root: repoRoot,
      segments: relativePath.split('/'),
      maxBytes: Math.max(1, asset.size),
      includeBytes: false,
    });
    if (captured.record.size !== asset.size || captured.record.sha256 !== asset.sha256) {
      throw new Error(`Worktree global file differs from commit blob: ${relativePath}`);
    }
    return { path: relativePath, record: captured.record };
  });
  return { directories, files };
}

function captureCaseSources({ python, caseRoot, cases }) {
  return cases.map((selection, ordinal) => {
    const sourceRelativePath = path.posix.join(selection.pdbId, 'chains', selection.authChain);
    const sourceRoot = requireDirectory(path.join(caseRoot, ...sourceRelativePath.split('/')), `Case source ${selection.pdbId}/${selection.authChain}`);
    const tree = snapshotAnchoredTree({ python, root: sourceRoot, defaultMaxBytes: MAX_PREVIEW_FILE_BYTES });
    return { ordinal, ...selection, sourceRelativePath, sourceRoot, directories: tree.directories, files: tree.files };
  });
}

const PDB_ROOT_DIRECT_DEPENDENCIES = Object.freeze([
  'browser-manifest.json',
  'structure.cif.gz',
]);

function capturePdbSources({ python, caseRoot, cases }) {
  const seen = new Set();
  const sources = [];
  for (const selection of cases) {
    if (seen.has(selection.pdbId)) continue;
    seen.add(selection.pdbId);
    const sourceRelativePath = selection.pdbId;
    const sourceRoot = requireDirectory(path.join(caseRoot, selection.pdbId), `PDB-root source ${selection.pdbId}`);
    const files = PDB_ROOT_DIRECT_DEPENDENCIES.map((relativePath) => {
      let capture;
      try {
        capture = captureAnchoredFile({
          python,
          root: sourceRoot,
          segments: [relativePath],
          maxBytes: MAX_PREVIEW_FILE_BYTES,
          includeBytes: false,
        });
      } catch (error) {
        throw new Error(`Missing or unsafe PDB-root direct dependency ${selection.pdbId}/${relativePath}: ${error.message}`);
      }
      return { path: relativePath, record: capture.record };
    });
    sources.push({
      ordinal: sources.length,
      pdbId: selection.pdbId,
      sourceRelativePath,
      sourceRoot,
      files,
    });
  }
  return sources;
}

function writeAll(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Preview output write made no progress');
    offset += count;
  }
}

function writeExclusiveFile(root, relativePath, bytes, mode = 0o644) {
  const segments = relativePath.split('/');
  if (path.posix.isAbsolute(relativePath) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe preview output path ${relativePath}`);
  }
  const absolute = path.join(root, ...segments);
  const relative = path.relative(root, absolute);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Preview output escapes root: ${relativePath}`);
  mkdirSync(path.dirname(absolute), { recursive: true });
  const fd = openSync(absolute, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | NO_FOLLOW, mode);
  try {
    writeAll(fd, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    fchmodSync(fd, mode);
  } finally {
    closeSync(fd);
  }
}

function captureAndCopyFile({ python, sourceRoot, sourceRelativePath, sourceRecord, destinationRoot, destinationRelativePath }) {
  const captured = captureAnchoredFile({
    python,
    root: sourceRoot,
    segments: sourceRelativePath.split('/'),
    maxBytes: Math.max(1, sourceRecord.size),
    includeBytes: true,
  });
  sameRecord(captured.record, sourceRecord, `Source file ${sourceRecord.path}`);
  writeExclusiveFile(destinationRoot, destinationRelativePath, captured.bytes);
}

function copyGlobalSources({ python, repoRoot, globalFiles, globalAssets, destinationRoot }) {
  for (const asset of globalAssets) {
    const sourcePath = globalFiles.includes(asset.path)
      ? asset.path
      : path.posix.join('public', asset.path);
    const captured = captureAnchoredFile({
      python,
      root: repoRoot,
      segments: sourcePath.split('/'),
      maxBytes: Math.max(1, asset.size),
      includeBytes: true,
    });
    if (captured.record.size !== asset.size || captured.record.sha256 !== asset.sha256) {
      throw new Error(`Worktree global asset differs from commit blob: ${asset.path}`);
    }
    writeExclusiveFile(destinationRoot, asset.path, captured.bytes, Number.parseInt(asset.mode, 8) & 0o777);
  }
}

function copyCaseSources({ python, caseSources, destinationRoot }) {
  const injectedRelative = 'profiles/profile-public-techniques.json.gz';
  for (const source of caseSources) {
    const chainDestination = path.posix.join('cases', source.pdbId, 'chains', source.authChain);
    for (const directory of source.directories) {
      mkdirSync(path.join(destinationRoot, ...chainDestination.split('/'), ...directory.path.split('/').filter(Boolean)), { recursive: true });
    }
    for (const file of source.files) {
      if (file.path === injectedRelative) continue;
      captureAndCopyFile({
        python,
        sourceRoot: source.sourceRoot,
        sourceRelativePath: file.path,
        sourceRecord: file.record,
        destinationRoot,
        destinationRelativePath: path.posix.join(chainDestination, file.path),
      });
    }
  }
}

function copyPdbSources({ python, pdbSources, destinationRoot }) {
  for (const source of pdbSources) {
    const destination = path.posix.join('cases', source.pdbId);
    for (const file of source.files) {
      captureAndCopyFile({
        python,
        sourceRoot: source.sourceRoot,
        sourceRelativePath: file.path,
        sourceRecord: file.record,
        destinationRoot,
        destinationRelativePath: path.posix.join(destination, file.path),
      });
    }
  }
}

function normalizedPreviewInventory(tree) {
  return {
    directories: tree.directories.map((item) => item.path),
    files: tree.files.map((item) => ({ path: item.path, size: item.record.size, sha256: item.record.sha256 })),
  };
}

function frozenMaterializeInventory({ python, root }) {
  const tree = snapshotAnchoredTree({
    python,
    root,
    maxBytesByRelativePath: PREVIEW_MANIFEST_LIMITS,
    defaultMaxBytes: MAX_PREVIEW_FILE_BYTES,
  });
  return {
    directories: tree.directories.map((item) => item.path),
    files: tree.files.map((item) => {
      const stat = lstatSync(path.join(root, ...item.path.split('/')));
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error(`Private preview assembly contains a non-regular file: ${item.path}`);
      }
      const mode = stat.mode & 0o777;
      if (![0o644, 0o755].includes(mode)) {
        throw new Error(`Private preview assembly has unsupported file mode: ${item.path}`);
      }
      return {
        path: item.path,
        size: item.record.size,
        sha256: item.record.sha256,
        mode: mode === 0o755 ? '100755' : '100644',
      };
    }),
  };
}

function canonicalPreviewCommand(parsed, resolved) {
  const argv = [
    process.execPath, SCRIPT_PATH,
    '--baseline-run', resolved.baselineRun,
    '--db', resolved.db,
    '--case-root', resolved.caseRoot,
    '--worktree-public', resolved.worktreePublic,
    '--out-parent', resolved.outParent,
    '--run-id', parsed.runId,
    '--python', resolved.python,
  ];
  for (const { pdbId, authChain } of parsed.cases) argv.push('--case', `${pdbId}/${authChain}`);
  return argv;
}

function baselineSidecarCaptures({ python, baselineRun, cases }) {
  return cases.map((selection) => {
    const relativePath = path.posix.join('data', 'entry-cases', 'cases', selection.pdbId, 'chains', selection.authChain, 'profiles', 'profile-public-techniques.json.gz');
    const capture = captureAnchoredFile({ python, root: baselineRun, segments: relativePath.split('/'), maxBytes: MAX_PREVIEW_FILE_BYTES, includeBytes: true });
    const decompressed = parseGzipJson(capture.bytes, `Baseline sidecar ${selection.pdbId}/${selection.authChain}`);
    return { ...selection, relativePath, record: capture.record, jsonSha256: sha256Bytes(decompressed.bytes) };
  });
}

function captureBaselineReports({ python, baselineRun }) {
  const paths = [
    'reports/coverage.json',
    'reports/profile-join-failures.tsv',
    'reports/db-only-profiles.tsv',
    'reports/unmapped-techniques.tsv',
    'reports/null-techniques.tsv',
    'selection.json',
  ];
  return Object.fromEntries(paths.map((relativePath) => {
    const capture = captureAnchoredFile({ python, root: baselineRun, segments: relativePath.split('/'), maxBytes: MAX_SOURCE_MANIFEST_BYTES, includeBytes: true });
    return [relativePath, capture.bytes];
  }));
}

function assertDeterministicProjection({ python, baseline, projectionRun, cases }) {
  const current = baselineSidecarCaptures({ python, baselineRun: projectionRun, cases });
  for (let index = 0; index < cases.length; index += 1) {
    if (baseline.sidecars[index].jsonSha256 !== current[index].jsonSha256) {
      throw new Error(`Rebuilt sidecar JSON differs from baseline for ${cases[index].pdbId}/${cases[index].authChain}`);
    }
  }
  const reports = captureBaselineReports({ python, baselineRun: projectionRun });
  for (const relativePath of Object.keys(baseline.reports)) {
    if (relativePath === 'reports/coverage.json') {
      const left = parseJsonBytes(baseline.reports[relativePath], 'Baseline coverage');
      const right = parseJsonBytes(reports[relativePath], 'Rebuilt coverage');
      delete left.runId;
      delete right.runId;
      if (deterministicJson(left) !== deterministicJson(right)) throw new Error('Rebuilt coverage differs from baseline');
    } else if (!baseline.reports[relativePath].equals(reports[relativePath])) {
      throw new Error(`Rebuilt deterministic report differs from baseline: ${relativePath}`);
    }
  }
}

function moveProjectionIntoPartial(projectionRun, partialPath) {
  for (const name of ['data', 'reports', 'selection.json']) renameSync(path.join(projectionRun, name), path.join(partialPath, name));
  const sourceManifest = parseJsonBytes(readFileSync(path.join(projectionRun, 'source-manifest.json')), 'Rebuilt v2 source manifest');
  if (sourceManifest.schemaVersion !== LEGACY_SOURCE_MANIFEST_SCHEMA) throw new Error('Rebuilt projection did not use the v2 data-only schema');
  rmSync(path.dirname(projectionRun), { recursive: true, force: false });
  return sourceManifest;
}

function capturePreviewSidecars({ python, partialPath, previewEntryCases, cases }) {
  return cases.map((selection) => {
    const dataPath = path.posix.join('data', 'entry-cases', 'cases', selection.pdbId, 'chains', selection.authChain, 'profiles', 'profile-public-techniques.json.gz');
    const previewRelative = path.posix.join('cases', selection.pdbId, 'chains', selection.authChain, 'profiles', 'profile-public-techniques.json.gz');
    const dataCapture = captureAnchoredFile({ python, root: partialPath, segments: dataPath.split('/'), maxBytes: MAX_PREVIEW_FILE_BYTES, includeBytes: true });
    writeExclusiveFile(previewEntryCases, previewRelative, dataCapture.bytes);
    const previewCapture = captureAnchoredFile({ python, root: previewEntryCases, segments: previewRelative.split('/'), maxBytes: MAX_PREVIEW_FILE_BYTES, includeBytes: true });
    if (!previewCapture.bytes.equals(dataCapture.bytes)) throw new Error(`Preview sidecar copy drift for ${selection.pdbId}/${selection.authChain}`);
    const indexPath = path.posix.join('cases', selection.pdbId, 'chains', selection.authChain, 'profiles', 'profile-index.json.gz');
    const indexCapture = captureAnchoredFile({ python, root: previewEntryCases, segments: indexPath.split('/'), maxBytes: MAX_PREVIEW_FILE_BYTES, includeBytes: true });
    const profileIndex = parseProfileIndexGzipBytes(indexCapture.bytes, indexPath);
    const sidecar = parseGzipJson(previewCapture.bytes, `Preview sidecar ${selection.pdbId}/${selection.authChain}`).payload;
    validateProfilePublicTechniques(sidecar, profileIndex, {
      pdbId: selection.pdbId,
      authChain: selection.authChain,
      categories: MECHANISM_FAMILIES,
      classifyTechniqueToken,
    });
    return {
      pdbId: selection.pdbId,
      authChain: selection.authChain,
      dataPath,
      previewPath: path.posix.join('pilot-preview', 'entry-cases', previewRelative),
      sha256: dataCapture.record.sha256,
    };
  });
}

export async function buildPreviewRun(argv, { baselineAnchor = APPROVED_BASELINE_ANCHOR } = {}) {
  const expectedWorktreePublic = path.join(REPO_ROOT, 'public');
  const parsed = parsePreviewBuilderArgs(argv, { baselineAnchor, expectedWorktreePublic });
  const runIdParts = validateRunId(parsed.runId);
  const currentCommit = resolveGitCommit(REPO_ROOT, 'HEAD');
  if (currentCommit.slice(0, 12) !== runIdParts.git12) throw new Error(`--run-id git12 must equal current HEAD prefix ${currentCommit.slice(0, 12)}`);
  const resolved = {
    baselineRun: requireDirectory(parsed.baselineRun, '--baseline-run'),
    db: requireFile(parsed.db, '--db'),
    caseRoot: requireDirectory(parsed.caseRoot, '--case-root'),
    worktreePublic: requireDirectory(parsed.worktreePublic, '--worktree-public'),
    outParent: requireDirectory(parsed.outParent, '--out-parent'),
    python: requireFile(parsed.python, '--python'),
  };
  if (resolved.baselineRun !== baselineAnchor.run) throw new Error('Canonical baseline path differs from the approved immutable baseline');
  if (resolved.worktreePublic !== expectedWorktreePublic) throw new Error('Canonical worktree public path differs from repository public root');

  const finalPath = path.join(resolved.outParent, parsed.runId);
  const partialPath = path.join(resolved.outParent, `.${parsed.runId}.partial`);
  if (entryExistsNoFollow(finalPath)) throw new Error(`Final run already exists: ${finalPath}`);
  if (entryExistsNoFollow(partialPath)) throw new Error(`Partial run already exists: ${partialPath}`);

  const baselineAnchorCapture = captureAnchoredFile({ python: resolved.python, root: resolved.baselineRun, segments: ['reports', 'sha256.txt'], maxBytes: MAX_SOURCE_MANIFEST_BYTES, includeBytes: true });
  if (baselineAnchorCapture.record.sha256 !== baselineAnchor.sha256) throw new Error('Approved baseline reports/sha256.txt external anchor drifted');
  const baselineBefore = snapshotAnchoredTree({ python: resolved.python, root: resolved.baselineRun, maxBytesByRelativePath: PREVIEW_MANIFEST_LIMITS, defaultMaxBytes: MAX_PREVIEW_FILE_BYTES });
  await verifyRun(['--run', resolved.baselineRun, '--db', resolved.db, '--case-root', resolved.caseRoot, '--python', resolved.python], { baselineAnchor });
  const baselineManifestCapture = captureAnchoredFile({ python: resolved.python, root: resolved.baselineRun, segments: ['source-manifest.json'], maxBytes: MAX_SOURCE_MANIFEST_BYTES, includeBytes: true });
  const baselineManifest = parseJsonBytes(baselineManifestCapture.bytes, 'Baseline source manifest');
  if (baselineManifest.schemaVersion !== LEGACY_SOURCE_MANIFEST_SCHEMA) throw new Error('Approved baseline must use the v2 data-only schema');
  if (deterministicJson(baselineManifest.selection) !== deterministicJson(parsed.cases)) throw new Error('Requested case identities and order must exactly match the approved baseline selection');
  const baseline = {
    sidecars: baselineSidecarCaptures({ python: resolved.python, baselineRun: resolved.baselineRun, cases: parsed.cases }),
    reports: captureBaselineReports({ python: resolved.python, baselineRun: resolved.baselineRun }),
  };

  await versionEfEntryAssets(resolved.worktreePublic, { check: true, repoSourceRoot: REPO_ROOT });
  const sourceClosure = captureSourceClosure({ repoRoot: REPO_ROOT, commit: currentCommit, python: resolved.python, paths: PREVIEW_SOURCE_CLOSURE_PATHS });
  const globalAssets = committedPreviewGlobalAssets({ repoRoot: REPO_ROOT, commit: currentCommit });
  const globalSourcesBefore = snapshotGlobalSources({
    python: resolved.python,
    repoRoot: REPO_ROOT,
    worktreePublic: resolved.worktreePublic,
    globalDirectories: PREVIEW_GLOBAL_DIRECTORIES,
    globalFiles: PREVIEW_GLOBAL_FILES,
    globalAssets,
  });
  const caseSourcesBefore = captureCaseSources({ python: resolved.python, caseRoot: resolved.caseRoot, cases: parsed.cases });
  const pdbSourcesBefore = capturePdbSources({ python: resolved.python, caseRoot: resolved.caseRoot, cases: parsed.cases });
  const dbBefore = anchoredAbsoluteFile({ python: resolved.python, filePath: resolved.db }).record;

  let assemblyRoot = null;
  let finalRenamed = false;
  try {
    assemblyRoot = realpathSync(mkdtempSync(path.join(
      path.dirname(resolved.outParent),
      '.case-public-preview-assembly-',
    )));
    chmodSync(assemblyRoot, 0o700);
    const projectionParent = path.join(assemblyRoot, '.projection');
    mkdirSync(projectionParent);
    const projectionArgs = ['--db', resolved.db, '--case-root', resolved.caseRoot, '--out-parent', projectionParent, '--run-id', parsed.runId, '--python', resolved.python];
    for (const { pdbId, authChain } of parsed.cases) projectionArgs.push('--case', `${pdbId}/${authChain}`);
    const projectionResult = await buildRun(projectionArgs, { legacyDataOnlyV2: true });
    assertDeterministicProjection({ python: resolved.python, baseline, projectionRun: projectionResult.run, cases: parsed.cases });
    const projectionManifest = moveProjectionIntoPartial(projectionResult.run, assemblyRoot);

    const previewRoot = path.join(assemblyRoot, 'pilot-preview');
    const previewEntryCases = path.join(previewRoot, 'entry-cases');
    mkdirSync(previewEntryCases, { recursive: true });
    copyGlobalSources({
      python: resolved.python,
      repoRoot: REPO_ROOT,
      globalFiles: PREVIEW_GLOBAL_FILES,
      globalAssets,
      destinationRoot: previewRoot,
    });
    copyCaseSources({ python: resolved.python, caseSources: caseSourcesBefore, destinationRoot: previewEntryCases });
    copyPdbSources({ python: resolved.python, pdbSources: pdbSourcesBefore, destinationRoot: previewEntryCases });
    const sidecars = capturePreviewSidecars({ python: resolved.python, partialPath: assemblyRoot, previewEntryCases, cases: parsed.cases });
    const previewInventory = normalizedPreviewInventory(snapshotAnchoredTree({ python: resolved.python, root: previewRoot, defaultMaxBytes: MAX_PREVIEW_FILE_BYTES }));

    const manifest = {
      ...projectionManifest,
      schemaVersion: PREVIEW_SOURCE_MANIFEST_SCHEMA,
      builderVersion: PREVIEW_BUILDER_VERSION,
      artifactKind: PREVIEW_ARTIFACT_KIND,
      finalizedAt: new Date().toISOString(),
      sourceClosure,
      baseline: {
        run: resolved.baselineRun,
        runId: path.basename(resolved.baselineRun),
        sha256File: baselineAnchorCapture.record,
        sourceManifestSha256: baselineManifestCapture.record.sha256,
      },
      commands: { previewBuilder: canonicalPreviewCommand(parsed, resolved), extractor: projectionManifest.commands.extractor },
      execution: {
        ...projectionManifest.execution,
        previewStrategy: 'anchored-selected-chain-copy',
        maxPreviewFileBytes: MAX_PREVIEW_FILE_BYTES,
        maxPreviewManifestBytes: MAX_PREVIEW_MANIFEST_BYTES,
      },
      preview: {
        schemaVersion: PREVIEW_PROVENANCE_SCHEMA,
        worktreePublic: resolved.worktreePublic,
        globalDirectories: [...PREVIEW_GLOBAL_DIRECTORIES],
        globalFiles: [...PREVIEW_GLOBAL_FILES],
        globalAssets,
        pdbSources: pdbSourcesBefore,
        caseSources: caseSourcesBefore,
        sidecars,
        inventory: previewInventory,
      },
    };
    const manifestJson = deterministicJson(manifest);
    if (Buffer.byteLength(manifestJson) > MAX_PREVIEW_MANIFEST_BYTES) throw new Error('Preview source manifest exceeds its bounded byte limit');
    writeExclusiveFile(assemblyRoot, 'source-manifest.json', manifestJson);
    writeFileSync(path.join(assemblyRoot, 'reports', 'sha256.txt'), sha256AnchoredManifest({ python: resolved.python, root: assemblyRoot, maxBytesByRelativePath: PREVIEW_MANIFEST_LIMITS, defaultMaxBytes: MAX_PREVIEW_FILE_BYTES }));

    sameTree(baselineBefore, snapshotAnchoredTree({ python: resolved.python, root: resolved.baselineRun, maxBytesByRelativePath: PREVIEW_MANIFEST_LIMITS, defaultMaxBytes: MAX_PREVIEW_FILE_BYTES }), 'Approved baseline run');
    sameRecord(dbBefore, anchoredAbsoluteFile({ python: resolved.python, filePath: resolved.db }).record, 'Database input');
    sameTree(caseSourcesBefore, captureCaseSources({ python: resolved.python, caseRoot: resolved.caseRoot, cases: parsed.cases }), 'Selected Case source trees');
    sameTree(pdbSourcesBefore, capturePdbSources({ python: resolved.python, caseRoot: resolved.caseRoot, cases: parsed.cases }), 'Selected PDB-root direct dependencies');
    sameTree(globalSourcesBefore, snapshotGlobalSources({
      python: resolved.python,
      repoRoot: REPO_ROOT,
      worktreePublic: resolved.worktreePublic,
      globalDirectories: PREVIEW_GLOBAL_DIRECTORIES,
      globalFiles: PREVIEW_GLOBAL_FILES,
      globalAssets,
    }), 'Worktree global assets');
    if (resolveGitCommit(REPO_ROOT, 'HEAD') !== currentCommit) throw new Error('Git HEAD changed during preview build');
    sameTree(sourceClosure, captureSourceClosure({ repoRoot: REPO_ROOT, commit: currentCommit, python: resolved.python, paths: PREVIEW_SOURCE_CLOSURE_PATHS }), 'Preview builder source closure');
    await verifyRun([
      '--run', assemblyRoot,
      '--db', resolved.db,
      '--case-root', resolved.caseRoot,
      '--python', resolved.python,
    ], { baselineAnchor, logicalRun: finalPath });
    const frozenInventory = frozenMaterializeInventory({ python: resolved.python, root: assemblyRoot });
    materializeAnchoredDirectory({
      python: resolved.python,
      sourceRoot: assemblyRoot,
      outParent: resolved.outParent,
      partialName: path.basename(partialPath),
      finalName: path.basename(finalPath),
      expectedInventory: frozenInventory,
      publish: true,
    });
    finalRenamed = true;
    return { run: finalPath, coverage: projectionResult.coverage };
  } catch (error) {
    if (assemblyRoot !== null && !finalRenamed && !entryExistsNoFollow(partialPath) && !entryExistsNoFollow(finalPath)) {
      try {
        rmSync(assemblyRoot, { recursive: true, force: false });
        mkdirSync(path.join(assemblyRoot, 'reports'), { recursive: true, mode: 0o755 });
        chmodSync(assemblyRoot, 0o700);
        writeExclusiveFile(assemblyRoot, 'reports/build-error.txt', 'Preview build failed.\n');
        const diagnosticInventory = frozenMaterializeInventory({ python: resolved.python, root: assemblyRoot });
        materializeAnchoredDirectory({
          python: resolved.python,
          sourceRoot: assemblyRoot,
          outParent: resolved.outParent,
          partialName: path.basename(partialPath),
          finalName: path.basename(finalPath),
          expectedInventory: diagnosticInventory,
          publish: false,
          diagnosticText: 'Preview build failed.\n',
        });
      } catch {
        // Preserve the original failure and any safely anchored partial evidence.
      }
    }
    throw error;
  } finally {
    if (assemblyRoot !== null && entryExistsNoFollow(assemblyRoot)) {
      rmSync(assemblyRoot, { recursive: true, force: false });
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await buildPreviewRun(argv);
    process.stdout.write(`${result.run}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main();
}
