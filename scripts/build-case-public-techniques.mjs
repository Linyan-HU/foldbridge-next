#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  statSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
  BUILDER_VERSION,
  LEGACY_BUILDER_VERSION,
  LEGACY_SOURCE_MANIFEST_SCHEMA,
  MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES,
  MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
  MAX_GLOBAL_AUDIT_STDOUT_BYTES,
  MAX_PROFILE_INDEX_BYTES,
  MAX_SOURCE_MANIFEST_BYTES,
  REPORT_HEADERS,
  SOURCE_MANIFEST_SCHEMA,
  STATUS_NAMES,
  addStatusCounts,
  buildChainSidecar,
  buildCoverage,
  captureAnchoredFile,
  compareAuditRows,
  compareUtf8,
  createClassificationExceptionAuditAccumulator,
  createBoundedDbOnlyAuditSummaryAccumulator,
  deterministicGzip,
  deterministicJson,
  deterministicTsv,
  emptyStatusCounts,
  enumerateAnchoredCaseInventory,
  parseNdjsonStrict,
  parseGlobalAuditNdjsonStrict,
  parseProfileIndexGzipBytes,
  profileIndexPath,
  processSequentiallyBounded,
  runGitNoReplace,
  sha256AnchoredManifest,
  sidecarRelativePath,
  taxonomySnapshotSha256,
  validateDbOnlyAuditSummary,
  validateClassificationExceptionAudit,
  validateRunId,
} from './case-public-techniques-lib.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const EXTRACTOR_PATH = path.join(REPO_ROOT, 'scripts', 'extract-case-public-techniques.py');
const SAFE_OPENAT_HELPER_PATH = path.join(REPO_ROOT, 'scripts', 'safe-openat-capture.py');
const MAX_CHAIN_EXTRACTOR_STDOUT_BYTES = 32 * 1024 * 1024;
const MAX_DATABASE_INPUT_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_DATABASE_BROKER_STDERR_BYTES = 1024 * 1024;
const MAX_SOURCE_CLOSURE_FILE_BYTES = 8 * 1024 * 1024;
const SOURCE_CLOSURE_PATHS = [
  'scripts/build-case-public-techniques.mjs',
  'scripts/case-public-techniques-lib.mjs',
  'scripts/extract-case-public-techniques.py',
  'scripts/safe-openat-capture.py',
  'src/techniqueFilterModel.js',
  'public/entry-cases/__entry_v3_site__/workbench-pure.mjs',
];

export function hashRunFilesForPublication(runRoot, {
  python,
  sourceManifestMaxBytes = MAX_SOURCE_MANIFEST_BYTES,
} = {}) {
  if (!Number.isSafeInteger(sourceManifestMaxBytes) || sourceManifestMaxBytes <= 0) {
    throw new TypeError('sourceManifestMaxBytes must be a positive safe integer');
  }
  return sha256AnchoredManifest({
    python,
    root: runRoot,
    maxBytesByRelativePath: new Map([['source-manifest.json', sourceManifestMaxBytes]]),
  });
}

const VALUE_FLAGS = new Set(['--db', '--case-root', '--out-parent', '--run-id', '--python']);

function parseCaseIdentity(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`${label} must be an unpadded PDB/auth identity`);
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

export function parseBuilderArgs(argv) {
  const values = new Map();
  const cases = [];
  let all = false;
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
    } else if (flag === '--all') {
      if (all) throw new Error('Duplicate argument --all');
      all = true;
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(flag)}`);
    }
  }
  for (const flag of VALUE_FLAGS) {
    if (!values.has(flag)) throw new Error(`Missing required argument ${flag}`);
  }
  if ((all && cases.length > 0) || (!all && cases.length === 0)) {
    throw new Error('Exactly one of repeated --case or --all is required');
  }
  const runId = values.get('--run-id');
  const runIdParts = validateRunId(runId);
  if (runIdParts.kind === 'full' && !all) {
    throw new Error('full run-id requires --all and forbids explicit --case selection');
  }
  if (runIdParts.kind === 'pilot' && all) {
    throw new Error('pilot run-id requires explicit repeated --case selection and forbids --all');
  }
  const seen = new Set();
  for (const selection of cases) {
    const key = `${selection.pdbId}\0${selection.authChain}`;
    if (seen.has(key)) throw new Error(`Duplicate --case identity ${selection.pdbId}/${selection.authChain}`);
    seen.add(key);
  }
  return {
    db: values.get('--db'),
    caseRoot: values.get('--case-root'),
    outParent: values.get('--out-parent'),
    runId,
    runIdParts,
    python: values.get('--python'),
    all,
    cases,
    argv: [...argv],
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

export function enumerateAllCasesSafe(caseRoot, { python } = {}) {
  return enumerateAnchoredCaseInventory({
    python,
    caseRoot,
    profileIndexMaxBytes: MAX_PROFILE_INDEX_BYTES,
  }).map(({ pdbId, authChain }) => ({ pdbId, authChain }));
}

export function sortCaseSelectionsBytewise(selections) {
  return [...selections].sort((left, right) => (
    compareUtf8(left.pdbId, right.pdbId) || compareUtf8(left.authChain, right.authChain)
  ));
}

export function assertInventoryUnchanged(before, after) {
  if (deterministicJson(before) !== deterministicJson(after)) {
    throw new Error('Case --all inventory changed during build');
  }
}

function resolveInputs(parsed, { captureCompleteInventory = false } = {}) {
  const db = requireFile(parsed.db, '--db');
  const caseRoot = requireDirectory(parsed.caseRoot, '--case-root');
  const outParent = requireDirectory(parsed.outParent, '--out-parent');
  const python = requireFile(parsed.python, '--python');
  const inventoryBefore = (parsed.all || captureCompleteInventory)
    ? enumerateAnchoredCaseInventory({
      python,
      caseRoot,
      profileIndexMaxBytes: MAX_PROFILE_INDEX_BYTES,
    })
    : null;
  const selections = (parsed.all ? inventoryBefore : parsed.cases)
    .map((selection, ordinal) => ({ ordinal, ...selection }));
  if (selections.length === 0) throw new Error('Selection is empty');
  const inventoryByIdentity = inventoryBefore === null
    ? null
    : new Map(inventoryBefore.map((item) => [`${item.pdbId}\0${item.authChain}`, item]));

  const profileInputs = selections.map((selection) => {
    const segments = [
      selection.pdbId,
      'chains',
      selection.authChain,
      'profiles',
      'profile-index.json.gz',
    ];
    let captured;
    try {
      captured = captureAnchoredFile({
        python,
        root: caseRoot,
        segments,
        maxBytes: MAX_PROFILE_INDEX_BYTES,
        includeBytes: true,
      });
    } catch (error) {
      throw new Error(
        `Cannot capture profile-index ${selection.pdbId}/${selection.authChain}: ${error.message}`,
      );
    }
    if (inventoryBefore !== null) {
      const inventoryItem = inventoryByIdentity.get(`${selection.pdbId}\0${selection.authChain}`);
      if (!inventoryItem) {
        throw new Error(`Selected profile-index is absent from complete Case inventory: ${selection.pdbId}/${selection.authChain}`);
      }
      ensureRecordsEqual(
        inventoryItem.record,
        captured.record,
        `Profile-index inventory ${selection.pdbId}/${selection.authChain}`,
      );
    }
    parseProfileIndexGzipBytes(captured.bytes, captured.record.path);
    return {
      ...selection,
      path: captured.record.path,
      segments,
      preflightRecord: captured.record,
    };
  });
  return { db, caseRoot, outParent, python, selections, profileInputs, inventoryBefore };
}

export function resolveGitCommit(repoRoot, revision) {
  let stdout;
  try {
    stdout = runGitNoReplace(repoRoot, ['rev-parse', '--verify', `${revision}^{commit}`], 'Resolve git commit')
      .toString('utf8');
  } catch {
    throw new Error(`Cannot uniquely resolve real git commit ${JSON.stringify(revision)}`);
  }
  if (!/^[0-9a-f]{40}\n$/.test(stdout)) {
    throw new Error(`Cannot uniquely resolve real git commit ${JSON.stringify(revision)}`);
  }
  return stdout.trim();
}

function resolveUniqueCommitPrefix(repoRoot, prefix) {
  if (typeof prefix !== 'string' || !/^[0-9a-f]{12}$/.test(prefix)) {
    throw new Error('Git commit prefix must be exactly 12 lowercase hex characters');
  }
  let candidates;
  try {
    candidates = runGitNoReplace(repoRoot, ['rev-parse', `--disambiguate=${prefix}`], 'Disambiguate git commit prefix')
      .toString('utf8').split('\n').filter(Boolean);
  } catch {
    throw new Error(`Cannot disambiguate git commit prefix ${prefix}`);
  }
  const commits = candidates.filter((candidate) => {
    if (!/^[0-9a-f]{40,64}$/.test(candidate)) return false;
    try {
      return runGitNoReplace(repoRoot, ['cat-file', '-t', candidate], `Read git object type ${candidate}`)
        .toString('utf8') === 'commit\n';
    } catch {
      return false;
    }
  });
  if (commits.length !== 1) throw new Error(`Git commit prefix ${prefix} does not uniquely select one commit object`);
  return commits[0];
}

function gitBuffer(repoRoot, args, label) {
  return runGitNoReplace(repoRoot, args, label, { maxBuffer: 8 * 1024 * 1024 });
}

function committedRegularBlob(repoRoot, commit, relativePath) {
  const entry = gitBuffer(
    repoRoot,
    ['ls-tree', '-z', commit, '--', relativePath],
    `Read source closure tree entry ${relativePath}`,
  );
  if (entry.length === 0 || entry.at(-1) !== 0 || entry.subarray(0, -1).includes(0)) {
    throw new Error(`Source closure path has no unique Git tree entry: ${relativePath}`);
  }
  const line = entry.subarray(0, -1).toString('utf8');
  const tab = line.indexOf('\t');
  const [mode, type, blob] = line.slice(0, tab).split(' ');
  if (tab < 0 || line.slice(tab + 1) !== relativePath || !['100644', '100755'].includes(mode) || type !== 'blob') {
    throw new Error(`Source closure path is not a committed regular file: ${relativePath}`);
  }
  if (!/^[0-9a-f]{40,64}$/.test(blob)) throw new Error(`Invalid Git blob id for source closure ${relativePath}`);
  return blob;
}

export function captureSourceClosure({ repoRoot, commit, python, paths = SOURCE_CLOSURE_PATHS }) {
  const resolvedCommit = resolveGitCommit(repoRoot, commit);
  const canonicalRepo = realpathSync(repoRoot);
  return [...paths].sort(compareUtf8).map((relativePath) => {
    if (path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
      throw new Error(`Unsafe source closure path: ${relativePath}`);
    }
    const lexicalPath = path.join(canonicalRepo, ...relativePath.split('/'));
    const workingStat = lstatSync(lexicalPath);
    if (workingStat.isSymbolicLink() || !workingStat.isFile()) {
      throw new Error(`Source closure working path must be a non-symlink regular file: ${relativePath}`);
    }
    if (realpathSync(lexicalPath) !== lexicalPath) {
      throw new Error(`Source closure working path realpath drift: ${relativePath}`);
    }
    const blob = committedRegularBlob(repoRoot, resolvedCommit, relativePath);
    const committedBytes = gitBuffer(repoRoot, ['cat-file', 'blob', blob], `Read source closure blob ${relativePath}`);
    const workingCapture = captureAnchoredFile({
      python,
      root: canonicalRepo,
      segments: relativePath.split('/'),
      maxBytes: MAX_SOURCE_CLOSURE_FILE_BYTES,
      includeBytes: true,
    });
    if (!workingCapture.bytes.equals(committedBytes)) {
      throw new Error(`Relevant source closure path is dirty against HEAD blob: ${relativePath}`);
    }
    return {
      path: relativePath,
      blob,
      sha256: createHash('sha256').update(committedBytes).digest('hex'),
    };
  });
}

function canonicalBuilderCommand(parsed, resolved) {
  const args = [
    process.execPath,
    SCRIPT_PATH,
    '--db', resolved.db,
    '--case-root', resolved.caseRoot,
    '--out-parent', resolved.outParent,
    '--run-id', parsed.runId,
    '--python', resolved.python,
  ];
  if (parsed.all) args.push('--all');
  else {
    for (const { pdbId, authChain } of resolved.selections) {
      args.push('--case', `${pdbId}/${authChain}`);
    }
  }
  return args;
}

function writeRunFile(partial, relativePath, content) {
  const absolutePath = path.join(partial, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function assertBrokerRecord(record, label) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`${label} must be an object`);
  }
  const fields = ['path', 'size', 'mtimeNs', 'inode', 'device', 'sha256'];
  if (deterministicJson(Object.keys(record).sort()) !== deterministicJson([...fields].sort())) {
    throw new Error(`${label} fields differ`);
  }
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

async function startBuilderDatabaseSession({ python, db }) {
  const args = [
    EXTRACTOR_PATH,
    '--db', db,
    '--serve-anchored',
    '--safe-helper', SAFE_OPENAT_HELPER_PATH,
    '--max-db-bytes', String(MAX_DATABASE_INPUT_BYTES),
  ];
  const child = spawn(python, args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
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
        stderr = 'database broker stderr exceeded its byte contract';
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
    const encoded = deterministicJson(request);
    await new Promise((resolve, reject) => {
      child.stdin.write(encoded, 'utf8', (error) => (error ? reject(error) : resolve()));
    });
  }

  async function requestRows(request, maxBytes, label) {
    await writeRequest(request);
    const rows = [];
    let bytes = 0;
    while (true) {
      const frame = await nextFrame(label);
      if (frame === null || typeof frame !== 'object' || Array.isArray(frame) || frame.id !== request.id) {
        throw new Error(`${label} response identity drifted`);
      }
      if (frame.type === 'row') {
        if (deterministicJson(Object.keys(frame).sort()) !== deterministicJson(['id', 'row', 'type'])) {
          throw new Error(`${label} row frame fields differ`);
        }
        bytes += Buffer.byteLength(deterministicJson(frame.row), 'utf8');
        if (bytes > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
        rows.push(frame.row);
      } else if (frame.type === 'end') {
        if (deterministicJson(Object.keys(frame).sort()) !== deterministicJson(['count', 'id', 'type'])) {
          throw new Error(`${label} end frame fields differ`);
        }
        if (frame.count !== rows.length) throw new Error(`${label} row count drifted`);
        return rows;
      } else {
        throw new Error(`${label} response type is invalid`);
      }
    }
  }

  let sourceRecord;
  try {
    const ready = await nextFrame('Database broker startup');
    if (
      ready === null
      || typeof ready !== 'object'
      || Array.isArray(ready)
      || deterministicJson(Object.keys(ready).sort()) !== deterministicJson(['sourceRecord', 'strategy', 'type'])
      || ready.type !== 'ready'
      || ready.strategy !== 'anchored-fd-readonly-transaction'
    ) {
      throw new Error('Database broker ready frame is invalid');
    }
    sourceRecord = assertBrokerRecord(ready.sourceRecord, 'Database broker source record');
  } catch (error) {
    child.stdin.destroy();
    if (!exited) child.kill('SIGTERM');
    await completion;
    throw error;
  }

  return {
    sourceRecord,
    async globalRows() {
      if (closed) throw new Error('Database broker is closed');
      const id = nextId++;
      const rows = await requestRows({ id, operation: 'global' }, MAX_GLOBAL_AUDIT_STDOUT_BYTES, 'Global audit broker');
      return parseGlobalAuditNdjsonStrict(rows.map((row) => deterministicJson(row)).join(''));
    },
    async chainRows(selection) {
      if (closed) throw new Error('Database broker is closed');
      const id = nextId++;
      const rows = await requestRows(
        { id, operation: 'chain', pdbId: selection.pdbId, authChain: selection.authChain },
        MAX_CHAIN_EXTRACTOR_STDOUT_BYTES,
        `Per-chain broker ${selection.pdbId}/${selection.authChain}`,
      );
      return parseNdjsonStrict(rows.map((row) => deterministicJson(row)).join('')).map((row, rowIndex) => {
        if (row.ordinal !== 0 || row.pdbId !== selection.pdbId || row.authChain !== selection.authChain) {
          throw new Error(`Per-chain extractor row ${rowIndex} identity drift for ${selection.pdbId}/${selection.authChain}`);
        }
        return { ...row, ordinal: selection.ordinal };
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        const id = nextId++;
        await writeRequest({ id, operation: 'close' });
        const frame = await nextFrame('Database broker close');
        if (
          frame === null
          || typeof frame !== 'object'
          || Array.isArray(frame)
          || deterministicJson(Object.keys(frame).sort()) !== deterministicJson(['id', 'sourceRecord', 'type'])
          || frame.id !== id
          || frame.type !== 'closed'
        ) {
          throw new Error('Database broker close frame is invalid');
        }
        ensureRecordsEqual(sourceRecord, assertBrokerRecord(frame.sourceRecord, 'Database broker final record'), 'Database broker source');
        child.stdin.end();
        const outcome = await completion;
        if (outcome.error || outcome.code !== 0 || outcome.signal !== null || stderrOverflow || stderr !== '') {
          const detail = outcome.error?.message || stderr || outcome.signal || `exit ${outcome.code}`;
          throw new Error(`Database broker failed during close: ${detail}`);
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

function createTsvAppender(partialPath, relativePath, headers) {
  const absolutePath = path.join(partialPath, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const fd = openSync(absolutePath, 'wx');
  writeAllSync(fd, deterministicTsv(headers, []));
  let closed = false;
  return {
    append(rows) {
      if (closed) throw new Error(`TSV appender is closed: ${relativePath}`);
      if (rows.length === 0) return;
      const complete = deterministicTsv(headers, rows);
      writeAllSync(fd, complete.slice(complete.indexOf('\n') + 1));
    },
    close() {
      if (!closed) {
        closeSync(fd);
        closed = true;
      }
    },
  };
}

export function writeAllSync(fd, content, writeOperation = writeSync) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeOperation(fd, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error(`Synchronous write made invalid progress at offset ${offset}: ${written}`);
    }
    offset += written;
  }
  return offset;
}

function rawBackgroundRank(value) {
  if (value === null) return 0;
  return value === false ? 1 : 2;
}

function summarizeDbOnlyRowsForChain(rows, pdbId, authChain) {
  const grouped = new Map();
  for (const row of rows) {
    const isBackgroundChannel = row.isBackgroundChannel;
    const key = JSON.stringify([row.techFilter, isBackgroundChannel]);
    const existing = grouped.get(key);
    if (existing) existing.count += 1;
    else {
      grouped.set(key, {
        pdbId,
        authChain,
        techFilter: row.techFilter,
        isBackgroundChannel,
        count: 1,
      });
    }
  }
  return [...grouped.values()].sort((left, right) => {
    if (left.techFilter === null && right.techFilter !== null) return -1;
    if (left.techFilter !== null && right.techFilter === null) return 1;
    const techniqueOrder = left.techFilter === null ? 0 : compareUtf8(left.techFilter, right.techFilter);
    return techniqueOrder || rawBackgroundRank(left.isBackgroundChannel) - rawBackgroundRank(right.isBackgroundChannel);
  });
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

export function publishDirectoryNoReplace({ partialPath, finalPath, python }) {
  const sourceBefore = lstatSync(partialPath, { bigint: true });
  if (!sourceBefore.isDirectory()) throw new Error('Atomic publish source must be a directory');
  const program = String.raw`
import ctypes
import errno
import os
import sys

source = os.fsencode(sys.argv[1])
destination = os.fsencode(sys.argv[2])
libc = ctypes.CDLL(None, use_errno=True)

if sys.platform == "darwin":
    rename_exclusive = libc.renamex_np
    rename_exclusive.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    rename_exclusive.restype = ctypes.c_int
    result = rename_exclusive(source, destination, 0x00000004)
elif sys.platform.startswith("linux"):
    try:
        rename_exclusive = libc.renameat2
    except AttributeError:
        print("error: libc does not expose renameat2", file=sys.stderr)
        raise SystemExit(2)
    rename_exclusive.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    rename_exclusive.restype = ctypes.c_int
    result = rename_exclusive(-100, source, -100, destination, 1)
else:
    print(f"error: no atomic no-replace directory rename for {sys.platform}", file=sys.stderr)
    raise SystemExit(2)

if result != 0:
    error_number = ctypes.get_errno()
    print(
        f"error: atomic publish refused: {os.strerror(error_number)} ({error_number})",
        file=sys.stderr,
    )
    raise SystemExit(1)
`;
  const result = spawnSync(python, ['-c', program, partialPath, finalPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const partialStillExists = existsSync(partialPath);
  let publishedSameInode = false;
  if (existsSync(finalPath)) {
    const finalStat = lstatSync(finalPath, { bigint: true });
    publishedSameInode = finalStat.isDirectory()
      && finalStat.dev === sourceBefore.dev
      && finalStat.ino === sourceBefore.ino;
  }
  if (publishedSameInode && !partialStillExists) return;
  if (result.error) throw new Error(`Atomic no-replace publish failed to launch: ${result.error.message}`);
  const detail = result.stderr || result.stdout || result.signal || `exit ${result.status}`;
  throw new Error(
    `Atomic no-replace publish did not publish the source inode; partialExists=${partialStillExists}; ${detail}`.trim(),
  );
}

function ensureRecordsEqual(before, after, label) {
  for (const field of ['path', 'size', 'mtimeNs', 'inode', 'device', 'sha256']) {
    if (before[field] !== after[field]) throw new Error(`${label} changed during build (${field})`);
  }
}

export async function buildRun(argv, { legacyDataOnlyV2 = false } = {}) {
  const parsed = parseBuilderArgs(argv);
  if (legacyDataOnlyV2 && parsed.runIdParts.kind !== 'pilot') {
    throw new Error('Legacy preview projection accepts only pilot runs');
  }
  const currentCommit = resolveGitCommit(REPO_ROOT, 'HEAD');
  if (!currentCommit.startsWith(parsed.runIdParts.git12)) {
    throw new Error(
      `--run-id git12 "${parsed.runIdParts.git12}" is not a prefix of current HEAD "${currentCommit}"`,
    );
  }
  let runCommit;
  try {
    runCommit = resolveUniqueCommitPrefix(REPO_ROOT, parsed.runIdParts.git12);
  } catch {
    throw new Error(`--run-id git12 "${parsed.runIdParts.git12}" does not uniquely resolve a real git commit`);
  }
  if (runCommit !== currentCommit) {
    throw new Error(
      `--run-id git12 "${parsed.runIdParts.git12}" must uniquely resolve current HEAD "${currentCommit}"`,
    );
  }
  const preflightPython = requireFile(parsed.python, '--python');
  const sourceClosure = captureSourceClosure({
    repoRoot: REPO_ROOT,
    commit: currentCommit,
    python: preflightPython,
  });
  const outParent = requireDirectory(parsed.outParent, '--out-parent');
  const finalPath = path.join(outParent, parsed.runId);
  const partialPath = path.join(outParent, `.${parsed.runId}.partial`);
  if (existsSync(finalPath)) throw new Error(`Final run already exists: ${finalPath}`);
  if (existsSync(partialPath)) throw new Error(`Partial run already exists: ${partialPath}`);
  const resolved = resolveInputs(
    { ...parsed, outParent },
    { captureCompleteInventory: !legacyDataOnlyV2 },
  );
  const buildStartedAt = new Date().toISOString();

  let partialCreated = false;
  let finalRenamed = false;
  let databaseSession = null;
  const reportAppenders = [];
  try {
    mkdirSync(partialPath);
    partialCreated = true;
    mkdirSync(path.join(partialPath, 'reports'), { recursive: true });

    const dbPreflight = captureAbsoluteAnchored({
      python: resolved.python,
      filePath: resolved.db,
      maxBytes: MAX_DATABASE_INPUT_BYTES,
      includeBytes: false,
    }).record;
    databaseSession = await startBuilderDatabaseSession({
      python: resolved.python,
      db: resolved.db,
    });
    ensureRecordsEqual(dbPreflight, databaseSession.sourceRecord, 'Database input preflight');
    const dbRecord = databaseSession.sourceRecord;
    const globalAuditRows = legacyDataOnlyV2
      ? null
      : await databaseSession.globalRows();
    const profileRecords = resolved.profileInputs.map((input) => {
      const current = captureAnchoredFile({
        python: resolved.python,
        root: resolved.caseRoot,
        segments: input.segments,
        maxBytes: MAX_PROFILE_INDEX_BYTES,
        includeBytes: false,
      });
      ensureRecordsEqual(input.preflightRecord, current.record, `Profile-index ${input.pdbId}/${input.authChain}`);
      return {
        ordinal: input.ordinal,
        pdbId: input.pdbId,
        authChain: input.authChain,
        ...input.preflightRecord,
      };
    });
    const selectionPayload = resolved.selections.map(({ pdbId, authChain }) => ({ pdbId, authChain }));
    writeFileSync(path.join(partialPath, 'selection.json'), deterministicJson(selectionPayload));
    const classificationAuditAccumulator = legacyDataOnlyV2
      ? null
      : createClassificationExceptionAuditAccumulator({
        globalRows: globalAuditRows,
        caseInventory: resolved.inventoryBefore,
        selections: selectionPayload,
      });

    const joinReport = createTsvAppender(partialPath, 'reports/profile-join-failures.tsv', REPORT_HEADERS.joinFailures);
    const dbOnlyReport = createTsvAppender(partialPath, 'reports/db-only-profiles.tsv', REPORT_HEADERS.dbOnly);
    const unmappedReport = createTsvAppender(partialPath, 'reports/unmapped-techniques.tsv', REPORT_HEADERS.unmapped);
    const nullReport = createTsvAppender(partialPath, 'reports/null-techniques.tsv', REPORT_HEADERS.nullTechniques);
    reportAppenders.push(joinReport, dbOnlyReport, unmappedReport, nullReport);

    const statusCounts = emptyStatusCounts();
    let profileCount = 0;
    let sidecarCount = 0;
    let dbOnlyProfileCount = 0;
    const dbOnlyAuditAccumulator = createBoundedDbOnlyAuditSummaryAccumulator({
      selection: selectionPayload,
      maxBytes: MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
    });
    let unmappedTechniqueCount = 0;
    let nullTechniqueCount = 0;
    const executionState = await processSequentiallyBounded(resolved.profileInputs, async (input) => {
      try {
        const profileCapture = captureAnchoredFile({
          python: resolved.python,
          root: resolved.caseRoot,
          segments: input.segments,
          maxBytes: MAX_PROFILE_INDEX_BYTES,
          includeBytes: true,
        });
        ensureRecordsEqual(input.preflightRecord, profileCapture.record, `Profile-index ${input.pdbId}/${input.authChain}`);
        const profileIndex = parseProfileIndexGzipBytes(profileCapture.bytes, input.path);
        const rows = await databaseSession.chainRows(input);
        const built = buildChainSidecar({
          profileIndex,
          dbRows: rows,
          pdbId: input.pdbId,
          authChain: input.authChain,
          ordinal: input.ordinal,
        });
        writeRunFile(
          partialPath,
          sidecarRelativePath(input.pdbId, input.authChain),
          deterministicGzip(built.payload),
        );
        dbOnlyReport.append(built.dbOnlyRows.sort(compareAuditRows));
        classificationAuditAccumulator?.append({
          publicRows: built.publicClassificationExceptionRows,
          dbOnlyRows: built.dbOnlyClassificationExceptionRows,
        });
        dbOnlyAuditAccumulator.append(
          summarizeDbOnlyRowsForChain(built.dbOnlyRows, input.pdbId, input.authChain),
        );
        unmappedReport.append(built.unmappedTechniqueRows.sort(compareAuditRows));
        nullReport.append(built.nullTechniqueRows.sort(compareAuditRows));
        profileCount += built.payload.profileCount;
        sidecarCount += 1;
        dbOnlyProfileCount += built.dbOnlyRows.length;
        unmappedTechniqueCount += built.unmappedTechniqueRows.length;
        nullTechniqueCount += built.nullTechniqueRows.length;
        addStatusCounts(statusCounts, built.statusCounts);
      } catch (error) {
        joinReport.append([{
          ordinal: input.ordinal,
          pdbId: input.pdbId,
          authChain: input.authChain,
          error: error.message,
        }]);
        throw new Error(`Profile join failed for ${input.pdbId}/${input.authChain}: ${error.message}`);
      }
    });
    for (const appender of reportAppenders) appender.close();
    const classificationExceptionAudit = legacyDataOnlyV2
      ? null
      : classificationAuditAccumulator.finish();
    if (classificationExceptionAudit !== null) {
      validateClassificationExceptionAudit(classificationExceptionAudit);
      const classificationReport = deterministicTsv(
        REPORT_HEADERS.classificationExceptions,
        classificationExceptionAudit,
      );
      if (Buffer.byteLength(classificationReport, 'utf8') > MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES) {
        throw new Error(
          `Classification exception report exceeds ${MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES} UTF-8 bytes`,
        );
      }
      writeRunFile(partialPath, 'reports/classification-exceptions.tsv', classificationReport);
    }
    mkdirSync(path.join(partialPath, 'pilot-preview'));
    const dbOnlyAuditSummary = dbOnlyAuditAccumulator.finish();

    const coverage = buildCoverage({
      runId: parsed.runId,
      chainCount: resolved.selections.length,
      sidecarCount,
      profileCount,
      statusCounts,
      dbOnlyProfileCount,
      unmappedTechniqueCount,
      nullTechniqueCount,
    });
    writeRunFile(partialPath, 'reports/coverage.json', deterministicJson(coverage));
    if (resolved.inventoryBefore !== null) {
      const inventoryAfter = enumerateAnchoredCaseInventory({
        python: resolved.python,
        caseRoot: resolved.caseRoot,
        profileIndexMaxBytes: MAX_PROFILE_INDEX_BYTES,
      });
      if (deterministicJson(resolved.inventoryBefore) !== deterministicJson(inventoryAfter)) {
        throw new Error('Complete Case profile-index inventory changed during build');
      }
    }
    if (
      deterministicJson(captureSourceClosure({
        repoRoot: REPO_ROOT,
        commit: currentCommit,
        python: resolved.python,
      }))
      !== deterministicJson(sourceClosure)
    ) {
      throw new Error('Relevant source closure changed during build');
    }
    const projectionCompletedAt = new Date().toISOString();
    await databaseSession.close();
    databaseSession = null;
    ensureRecordsEqual(
      dbRecord,
      captureAbsoluteAnchored({ python: resolved.python, filePath: resolved.db }).record,
      'Database input',
    );
    for (const record of profileRecords) {
      const segments = [record.pdbId, 'chains', record.authChain, 'profiles', 'profile-index.json.gz'];
      ensureRecordsEqual(
        record,
        captureAnchoredFile({
          python: resolved.python,
          root: resolved.caseRoot,
          segments,
          maxBytes: MAX_PROFILE_INDEX_BYTES,
          includeBytes: false,
        }).record,
        `Profile-index ${record.pdbId}/${record.authChain}`,
      );
    }
    if (
      deterministicJson(captureSourceClosure({
        repoRoot: REPO_ROOT,
        commit: currentCommit,
        python: resolved.python,
      }))
      !== deterministicJson(sourceClosure)
    ) {
      throw new Error('Relevant source closure changed before publication');
    }
    const finalizedAt = new Date().toISOString();
    validateDbOnlyAuditSummary(dbOnlyAuditSummary, selectionPayload);
    if (dbOnlyAuditSummary.reduce((sum, row) => sum + row.count, 0) !== dbOnlyProfileCount) {
      throw new Error('DB-only audit summary count does not match DB-only profile total');
    }
    const manifest = {
      schemaVersion: legacyDataOnlyV2 ? LEGACY_SOURCE_MANIFEST_SCHEMA : SOURCE_MANIFEST_SCHEMA,
      builderVersion: legacyDataOnlyV2 ? LEGACY_BUILDER_VERSION : BUILDER_VERSION,
      runId: parsed.runId,
      ...(!legacyDataOnlyV2 ? { runKind: parsed.runIdParts.kind } : {}),
      gitCommit: currentCommit,
      buildStartedAt,
      projectionCompletedAt,
      finalizedAt,
      sourceClosure,
      database: dbRecord,
      caseRoot: resolved.caseRoot,
      ...(!legacyDataOnlyV2 ? {
        caseInventory: {
          profileIndexCount: resolved.inventoryBefore.length,
          sha256: createHash('sha256')
            .update(deterministicJson(resolved.inventoryBefore))
            .digest('hex'),
        },
      } : {}),
      profileIndexes: profileRecords,
      taxonomySnapshotSha256: taxonomySnapshotSha256(),
      selectionMode: parsed.all ? 'all' : 'cases',
      selection: selectionPayload,
      dbOnlyAuditSummary,
      ...(!legacyDataOnlyV2 ? { classificationExceptionAudit } : {}),
      commands: {
        builder: canonicalBuilderCommand(parsed, resolved),
        extractor: {
          strategy: legacyDataOnlyV2 ? 'per-chain' : 'anchored-fd-readonly-transaction',
          maxStdoutBytes: MAX_CHAIN_EXTRACTOR_STDOUT_BYTES,
          argvTemplate: legacyDataOnlyV2 ? [
            resolved.python, EXTRACTOR_PATH,
            '--db', resolved.db,
            '--selection-json', '<per-chain-selection.json>',
          ] : [
            resolved.python, EXTRACTOR_PATH,
            '--db', '<anchored-database-input>',
            '--serve-anchored',
            '--safe-helper', SAFE_OPENAT_HELPER_PATH,
            '--max-db-bytes', String(MAX_DATABASE_INPUT_BYTES),
          ],
          ...(!legacyDataOnlyV2 ? {
            queryProtocol: 'bounded-jsonl-v1',
            maxGlobalSummaryStdoutBytes: MAX_GLOBAL_AUDIT_STDOUT_BYTES,
          } : {}),
        },
      },
      execution: {
        strategy: 'per-chain',
        maxBufferedChains: executionState.maxBufferedItems,
        maxExtractorStdoutBytes: MAX_CHAIN_EXTRACTOR_STDOUT_BYTES,
        maxDbOnlyAuditSummaryBytes: MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
        maxSourceManifestBytes: MAX_SOURCE_MANIFEST_BYTES,
        maxProfileIndexBytes: MAX_PROFILE_INDEX_BYTES,
        ...(!legacyDataOnlyV2 ? {
          maxGlobalAuditStdoutBytes: MAX_GLOBAL_AUDIT_STDOUT_BYTES,
          maxClassificationExceptionReportBytes: MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES,
        } : {}),
      },
      totals: {
        chainCount: resolved.selections.length,
        sidecarCount,
        profileCount,
        statusCounts: Object.fromEntries(STATUS_NAMES.map((status) => [status, statusCounts[status]])),
        dbOnlyProfileCount,
        unmappedTechniqueCount,
        nullTechniqueCount,
      },
    };
    const manifestJson = deterministicJson(manifest);
    const manifestBytes = Buffer.byteLength(manifestJson, 'utf8');
    if (manifestBytes > MAX_SOURCE_MANIFEST_BYTES) {
      throw new Error(
        `Source manifest exceeds ${MAX_SOURCE_MANIFEST_BYTES} canonical JSON UTF-8 bytes`,
      );
    }
    writeRunFile(partialPath, 'source-manifest.json', manifestJson);
    writeRunFile(partialPath, 'reports/sha256.txt', hashRunFilesForPublication(partialPath, {
      python: resolved.python,
    }));

    publishDirectoryNoReplace({ partialPath, finalPath, python: resolved.python });
    finalRenamed = true;
    return { run: finalPath, coverage };
  } catch (error) {
    for (const appender of reportAppenders) appender.close();
    if (partialCreated && !finalRenamed && existsSync(partialPath)) {
      try {
        writeRunFile(partialPath, 'reports/build-error.txt', `${error.message}\n`);
      } catch {
        // Preserve the original failure; the partial directory itself is diagnostic evidence.
      }
    }
    throw error;
  } finally {
    if (databaseSession !== null) await databaseSession.abort();
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const result = await buildRun(argv);
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
