import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildChainSidecar,
  captureInputFile,
  captureInputFileStreaming,
  deterministicGzip,
  deterministicJson,
  processSequentiallyBounded,
  sha256Manifest,
  validateIsoUtcInstant,
  validateRunId,
} from '../scripts/case-public-techniques-lib.mjs';
import * as techniqueLib from '../scripts/case-public-techniques-lib.mjs';
import {
  assertInventoryUnchanged,
  captureSourceClosure,
  enumerateAllCasesSafe,
  publishDirectoryNoReplace,
  resolveGitCommit,
  sortCaseSelectionsBytewise,
} from '../scripts/build-case-public-techniques.mjs';
import * as builderModule from '../scripts/build-case-public-techniques.mjs';
import {
  snapshotRunTreeStreaming,
} from '../scripts/verify-case-public-techniques.mjs';
import * as verifierModule from '../scripts/verify-case-public-techniques.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASE_SENSITIVE_TEMP_PARENT = path.dirname(ROOT);
const BUILD = path.join(ROOT, 'scripts', 'build-case-public-techniques.mjs');
const VERIFY = path.join(ROOT, 'scripts', 'verify-case-public-techniques.mjs');
const FROZEN_DUCKDB_PYTHON = process.env.HOME && path.join(
  process.env.HOME,
  '.cache',
  'codex-runtimes',
  'codex-primary-runtime',
  'dependencies',
  'python',
  'bin',
  'python3',
);
const PYTHON_CANDIDATES = [
  process.env.CASE_PUBLIC_TECHNIQUES_TEST_PYTHON,
  FROZEN_DUCKDB_PYTHON,
  process.env.HOME && path.join(process.env.HOME, 'miniforge3', 'bin', 'python'),
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
].filter(Boolean);
const PYTHON = PYTHON_CANDIDATES.find((candidate) => (
  existsSync(candidate)
  && spawnSync(candidate, ['-c', 'import duckdb'], { stdio: 'ignore' }).status === 0
));
if (!PYTHON) throw new Error('A Python interpreter with DuckDB is required for Case public technique tests');
const GIT_COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const GIT12 = GIT_COMMIT.slice(0, 12);
const BAD_GIT12 = GIT12 === 'f'.repeat(12) ? 'e'.repeat(12) : 'f'.repeat(12);
const RUN_ID = `pilot-20260828T123456Z-${GIT12}`;
const FULL_RUN_ID = `full-20260828T123456Z-${GIT12}`;
const SOURCE_CLOSURE_PATHS = [
  'scripts/build-case-public-techniques.mjs',
  'scripts/case-public-techniques-lib.mjs',
  'scripts/extract-case-public-techniques.py',
  'scripts/safe-openat-capture.py',
  'src/techniqueFilterModel.js',
  'public/entry-cases/__entry_v3_site__/workbench-pure.mjs',
];

function tempFixture() {
  const root = mkdtempSync(path.join(CASE_SENSITIVE_TEMP_PARENT, '.case-public-techniques-test-'));
  const caseRoot = path.join(root, 'cases');
  const outParent = path.join(root, 'staging');
  const db = path.join(root, 'entry_atlas.duckdb');
  mkdirSync(caseRoot, { recursive: true });
  mkdirSync(outParent, { recursive: true });
  return { root, caseRoot, outParent, db };
}

function createSafeHelperAttackPython({
  fixtureRoot,
  targetRoot,
  operation,
  event,
  relativeSegments,
  targetDirectory,
  outsideDirectory,
  aba = false,
}) {
  const wrapper = path.join(fixtureRoot, `attack-python-${operation}-${Math.random().toString(16).slice(2)}.py`);
  const config = {
    realPython: PYTHON,
    targetRoot,
    operation,
    event,
    relativeSegments,
    targetDirectory,
    outsideDirectory,
    originalAway: `${targetDirectory}-original`,
    aba,
  };
  const program = String.raw`#!${PYTHON}
import importlib.util
import json
import os
import sys

CONFIG = json.loads(${JSON.stringify(JSON.stringify(config))})

if len(sys.argv) < 2 or os.path.basename(sys.argv[1]) != "safe-openat-capture.py":
    os.execv(CONFIG["realPython"], [CONFIG["realPython"], *sys.argv[1:]])

spec = importlib.util.spec_from_file_location("safe_openat_capture_under_attack", sys.argv[1])
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
fired = False

def attack(event, relative_segments):
    global fired
    if fired or event != CONFIG["event"] or list(relative_segments) != CONFIG["relativeSegments"]:
        return
    fired = True
    os.rename(CONFIG["targetDirectory"], CONFIG["originalAway"])
    os.symlink(CONFIG["outsideDirectory"], CONFIG["targetDirectory"], target_is_directory=True)
    if CONFIG["aba"]:
        os.unlink(CONFIG["targetDirectory"])
        os.rename(CONFIG["originalAway"], CONFIG["targetDirectory"])

try:
    raw = sys.stdin.buffer.read(helper.MAX_REQUEST_BYTES + 1)
    request = helper._parse_request(raw)
    if request.get("operation") != CONFIG["operation"] or request.get("root") != CONFIG["targetRoot"]:
        response = helper._dispatch(request)
    elif CONFIG["operation"] == "capture":
        helper._exact_keys(request, ["operation", "root", "segments", "maxBytes", "includeBytes"], "request")
        response = {"operation": "capture", **helper.capture_anchored(
            request["root"], request["segments"], max_bytes=request["maxBytes"],
            include_bytes=request["includeBytes"], hook=attack,
        )}
    elif CONFIG["operation"] == "inventory":
        helper._exact_keys(request, ["operation", "root", "profileIndexMaxBytes"], "request")
        response = {"operation": "inventory", "items": helper.inventory_anchored(
            request["root"], profile_index_max_bytes=request["profileIndexMaxBytes"], hook=attack,
        )}
    elif CONFIG["operation"] == "tree":
        helper._exact_keys(request, ["operation", "root", "maxBytesByRelativePath", "defaultMaxBytes"], "request")
        response = {"operation": "tree", **helper.tree_snapshot_anchored(
            request["root"], max_bytes_by_relative_path=request["maxBytesByRelativePath"],
            default_max_bytes=request["defaultMaxBytes"], hook=attack,
        )}
    elif CONFIG["operation"] == "sha256":
        helper._exact_keys(request, ["operation", "root", "maxBytesByRelativePath", "defaultMaxBytes", "exclude"], "request")
        response = {"operation": "sha256", "manifest": helper.sha256_manifest_anchored(
            request["root"], max_bytes_by_relative_path=request["maxBytesByRelativePath"],
            default_max_bytes=request["defaultMaxBytes"], exclude=request["exclude"], hook=attack,
        )}
    else:
        response = helper._dispatch(request)
    output = helper.encode_response(response)
except Exception as error:
    sys.stderr.write(f"error: {error}\n")
    raise SystemExit(1)
sys.stdout.buffer.write(output)
sys.stdout.buffer.flush()
`;
  writeFileSync(wrapper, program);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

function createDbQueryAbaPython({ fixtureRoot, targetDb, maliciousDb }) {
  const wrapper = path.join(fixtureRoot, `attack-python-db-query-${Math.random().toString(16).slice(2)}.py`);
  const config = {
    realPython: PYTHON,
    targetDb,
    maliciousDb,
    originalAway: `${targetDb}.original-away`,
  };
  const program = String.raw`#!${PYTHON}
import json
import os
import subprocess
import sys

CONFIG = json.loads(${JSON.stringify(JSON.stringify(config))})
args = sys.argv[1:]
is_builder_query = (
    bool(args)
    and os.path.basename(args[0]) == "extract-case-public-techniques.py"
    and "--serve-anchored" in args
)
is_verifier_query = len(args) >= 2 and args[0] == "-c" and "anchored-fd-readonly-transaction" in args[1]

if not (is_builder_query or is_verifier_query):
    os.execv(CONFIG["realPython"], [CONFIG["realPython"], *args])

child = subprocess.Popen(
    [CONFIG["realPython"], *args],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
ready = child.stdout.readline()
if not ready:
    sys.stderr.buffer.write(child.stderr.read())
    raise SystemExit(child.wait())
sys.stdout.buffer.write(ready)
sys.stdout.buffer.flush()

os.rename(CONFIG["targetDb"], CONFIG["originalAway"])
os.rename(CONFIG["maliciousDb"], CONFIG["targetDb"])
restored = False
try:
    for request_line in sys.stdin.buffer:
        request = json.loads(request_line)
        if request.get("operation") == "close" and not restored:
            os.rename(CONFIG["targetDb"], CONFIG["maliciousDb"])
            os.rename(CONFIG["originalAway"], CONFIG["targetDb"])
            restored = True
        child.stdin.write(request_line)
        child.stdin.flush()
        while True:
            response_line = child.stdout.readline()
            if not response_line:
                sys.stderr.buffer.write(child.stderr.read())
                raise SystemExit(child.wait())
            sys.stdout.buffer.write(response_line)
            sys.stdout.buffer.flush()
            response = json.loads(response_line)
            if response.get("id") == request.get("id") and response.get("type") in {"end", "closed"}:
                break
        if request.get("operation") == "close":
            break
finally:
    if not restored:
        os.rename(CONFIG["targetDb"], CONFIG["maliciousDb"])
        os.rename(CONFIG["originalAway"], CONFIG["targetDb"])
    if child.poll() is None:
        child.stdin.close()
        if restored:
            child.wait()
        else:
            child.terminate()
stderr = child.stderr.read()
returncode = child.wait()
if stderr:
    sys.stderr.buffer.write(stderr)
raise SystemExit(returncode)
`;
  writeFileSync(wrapper, program);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

function createDbCloseDriftPython({ fixtureRoot, targetDb, attackMarker = null }) {
  const wrapper = path.join(fixtureRoot, `attack-python-db-close-${Math.random().toString(16).slice(2)}.py`);
  const config = {
    realPython: PYTHON,
    targetDb,
    attackMarker,
  };
  const program = String.raw`#!${PYTHON}
import json
import os
import subprocess
import sys

CONFIG = json.loads(${JSON.stringify(JSON.stringify(config))})
args = sys.argv[1:]
is_builder_query = (
    bool(args)
    and os.path.basename(args[0]) == "extract-case-public-techniques.py"
    and "--serve-anchored" in args
)
is_verifier_query = len(args) >= 2 and args[0] == "-c" and "anchored-fd-readonly-transaction" in args[1]
attack_enabled = CONFIG["attackMarker"] is None or os.path.exists(CONFIG["attackMarker"])

if not (attack_enabled and (is_builder_query or is_verifier_query)):
    os.execv(CONFIG["realPython"], [CONFIG["realPython"], *args])

child = subprocess.Popen(
    [CONFIG["realPython"], *args],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
ready = child.stdout.readline()
if not ready:
    sys.stderr.buffer.write(child.stderr.read())
    raise SystemExit(child.wait())
sys.stdout.buffer.write(ready)
sys.stdout.buffer.flush()

original_bytes = None
original_stat = None
restored = False

def restore():
    global restored
    if original_bytes is None or restored:
        return
    with open(CONFIG["targetDb"], "wb") as stream:
        stream.write(original_bytes)
        stream.flush()
        os.fsync(stream.fileno())
    os.utime(
        CONFIG["targetDb"],
        ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns),
    )
    restored = True

try:
    for request_line in sys.stdin.buffer:
        request = json.loads(request_line)
        if request.get("operation") == "close" and original_bytes is None:
            original_stat = os.stat(CONFIG["targetDb"])
            with open(CONFIG["targetDb"], "rb") as stream:
                original_bytes = stream.read()
            with open(CONFIG["targetDb"], "ab") as stream:
                stream.write(b"CLOSE-DRIFT")
                stream.flush()
                os.fsync(stream.fileno())
        child.stdin.write(request_line)
        child.stdin.flush()
        while True:
            response_line = child.stdout.readline()
            if not response_line:
                returncode = child.wait()
                stderr = child.stderr.read()
                restore()
                if stderr:
                    sys.stderr.buffer.write(stderr)
                raise SystemExit(returncode)
            sys.stdout.buffer.write(response_line)
            sys.stdout.buffer.flush()
            response = json.loads(response_line)
            if response.get("id") == request.get("id") and response.get("type") in {"end", "closed"}:
                break
        if request.get("operation") == "close":
            break
finally:
    restore()
    if child.poll() is None:
        child.stdin.close()
        child.terminate()
        child.wait()

stderr = child.stderr.read()
returncode = child.wait()
if stderr:
    sys.stderr.buffer.write(stderr)
raise SystemExit(returncode)
`;
  writeFileSync(wrapper, program);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

function createSnapshotQueryAbaPython({ fixtureRoot, maliciousDb }) {
  const wrapper = path.join(fixtureRoot, `attack-python-snapshot-query-${Math.random().toString(16).slice(2)}.py`);
  const config = { realPython: PYTHON, maliciousDb };
  const program = String.raw`#!${PYTHON}
import json
import os
import subprocess
import sys

CONFIG = json.loads(${JSON.stringify(JSON.stringify(config))})
args = sys.argv[1:]
is_builder_query = bool(args) and os.path.basename(args[0]) == "extract-case-public-techniques.py"
is_verifier_query = (
    len(args) >= 3
    and args[0] == "-c"
    and "anchored-fd-readonly-transaction" in args[1]
)
if not (is_builder_query or is_verifier_query):
    os.execv(CONFIG["realPython"], [CONFIG["realPython"], *args])

if is_builder_query:
    database_path = args[args.index("--db") + 1]
else:
    database_path = args[2]
if ".database-snapshot-" in database_path:
    sys.stderr.write(f"error: query still depends on a replaceable snapshot pathname: {database_path}\n")
    raise SystemExit(97)
os.execv(CONFIG["realPython"], [CONFIG["realPython"], *args])
`;
  writeFileSync(wrapper, program);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

function writeProfileIndex(caseRoot, pdbId = '1ABC', authChain = 'A', profiles = [
  { profile_id: 'published-b', pair_id: 'pair-b' },
  { profile_id: 'published-a', pair_id: 'pair-a' },
]) {
  const profileDir = path.join(caseRoot, pdbId, 'chains', authChain, 'profiles');
  mkdirSync(profileDir, { recursive: true });
  const payload = { profile_count: profiles.length, profiles };
  writeFileSync(path.join(profileDir, 'profile-index.json.gz'), gzipSync(`${JSON.stringify(payload)}\n`));
  return payload;
}

function createDuckDb(db, { duplicate = false, auditVariants = false, dbOnlyBackground = null } = {}) {
  const program = String.raw`
import duckdb, sys
db = sys.argv[1]
con = duckdb.connect(db)
con.execute("CREATE TABLE chain (pdb_id VARCHAR, auth VARCHAR, chain_key VARCHAR)")
con.execute("CREATE TABLE profile (pdb_id VARCHAR, chain_key VARCHAR, profile_key VARCHAR, tech_filter VARCHAR, is_background_channel BOOLEAN)")
con.execute("INSERT INTO chain VALUES ('1ABC', 'A', '1ABC|A')")
rows = [
  ('1ABC', '1ABC|A', 'published-a', 'DMS', False),
  ('1ABC', '1ABC|A', 'published-b', None, True),
  ('1ABC', '1ABC|A', 'db-only', 'Mystery-seq', {'null': None, 'false': False, 'true': True}[sys.argv[3]]),
]
if sys.argv[2] == 'duplicate':
  rows.append(('1ABC', '1ABC|A', 'published-a', 'SHAPE-MaP', False))
if sys.argv[2] == 'audit':
  rows.extend([
    ('1ABC', '1ABC|A', 'db-null-false', None, False),
    ('1ABC', '1ABC|A', 'db-null-true', None, True),
    ('1ABC', '1ABC|A', 'db-empty-false-1', '', False),
    ('1ABC', '1ABC|A', 'db-empty-false-2', '', None),
    ('1ABC', '1ABC|A', 'db-empty-true', '', True),
  ])
con.executemany("INSERT INTO profile VALUES (?, ?, ?, ?, ?)", rows)
con.close()
`;
  const mode = duplicate ? 'duplicate' : auditVariants ? 'audit' : 'normal';
  const backgroundMode = dbOnlyBackground === null ? 'null' : dbOnlyBackground ? 'true' : 'false';
  execFileSync(PYTHON, ['-c', program, db, mode, backgroundMode]);
}

function createManyChainDuckDb(db, selections) {
  const program = String.raw`
import duckdb, json, sys
selections = json.loads(sys.argv[2])
con = duckdb.connect(sys.argv[1])
con.execute("CREATE TABLE chain (pdb_id VARCHAR, auth VARCHAR, chain_key VARCHAR)")
con.execute("CREATE TABLE profile (pdb_id VARCHAR, chain_key VARCHAR, profile_key VARCHAR, tech_filter VARCHAR, is_background_channel BOOLEAN)")
chains = [(item["pdbId"], item["authChain"], f'{item["pdbId"]}|{item["authChain"]}') for item in selections]
profiles = [(pdb_id, chain_key, f'profile-{auth_chain}', 'DMS', False) for pdb_id, auth_chain, chain_key in chains]
con.executemany("INSERT INTO chain VALUES (?, ?, ?)", chains)
con.executemany("INSERT INTO profile VALUES (?, ?, ?, ?, ?)", profiles)
con.close()
`;
  execFileSync(PYTHON, ['-c', program, db, JSON.stringify(selections)]);
}

function createClassificationAuditDuckDb(db) {
  const program = String.raw`
import duckdb, sys
con = duckdb.connect(sys.argv[1])
con.execute("CREATE TABLE chain (pdb_id VARCHAR, auth VARCHAR, chain_key VARCHAR)")
con.execute("CREATE TABLE profile (pdb_id VARCHAR, chain_key VARCHAR, profile_key VARCHAR, tech_filter VARCHAR, is_background_channel BOOLEAN)")
con.executemany("INSERT INTO chain VALUES (?, ?, ?)", [
  ('1ABC', 'A', '1ABC|A'),
  ('0DEF', 'B', '0DEF|B'),
  ('3GHI', 'C', '3GHI|C'),
])
con.executemany("INSERT INTO profile VALUES (?, ?, ?, ?, ?)", [
  ('1ABC', '1ABC|A', 'public-cirs', 'CIRS-seq', False),
  ('1ABC', '1ABC|A', 'db-only-glyoxal', 'Glyoxal', False),
  ('0DEF', '0DEF|B', 'unselected-terbium', 'Terbium', None),
  ('3GHI', '3GHI|C', 'no-index-null', None, False),
])
con.close()
`;
  execFileSync(PYTHON, ['-c', program, db]);
}

function runBuilder(fixture, runId = RUN_ID, extraArgs = [], python = PYTHON) {
  return spawnSync(process.execPath, [
    BUILD,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--out-parent', fixture.outParent,
    '--run-id', runId,
    '--python', python,
    '--case', '1ABC/A',
    ...extraArgs,
  ], { cwd: ROOT, encoding: 'utf8' });
}

function runVerifier(fixture, run = path.join(fixture.outParent, RUN_ID), python = PYTHON) {
  return spawnSync(process.execPath, [
    VERIFY,
    '--run', run,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--python', python,
  ], { cwd: ROOT, encoding: 'utf8' });
}

function runBuilderAll(fixture, runId = FULL_RUN_ID, python = PYTHON) {
  return spawnSync(process.execPath, [
    BUILD,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--out-parent', fixture.outParent,
    '--run-id', runId,
    '--python', python,
    '--all',
  ], { cwd: ROOT, encoding: 'utf8' });
}

function buildFixture({ duplicate = false, auditVariants = false, dbOnlyBackground = null } = {}) {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db, { duplicate, auditVariants, dbOnlyBackground });
  const result = runBuilder(fixture);
  return { fixture, result, run: path.join(fixture.outParent, RUN_ID) };
}

function treeFingerprint(root) {
  const program = String.raw`
import hashlib, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
items = []
for path in sorted(root.rglob('*'), key=lambda value: os.fsencode(str(value.relative_to(root)))):
  stat = path.stat()
  digest = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else '-'
  items.append((str(path.relative_to(root)), stat.st_mtime_ns, digest))
print(repr(items))
`;
  return execFileSync(PYTHON, ['-c', program, root], { encoding: 'utf8' });
}

function fileFingerprint(filePath) {
  const stat = statSync(filePath, { bigint: true });
  return {
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    sha256: createHash('sha256').update(readFileSync(filePath)).digest('hex'),
  };
}

function createTask4FixtureRepo(prefix) {
  const repo = mkdtempSync(path.join(CASE_SENSITIVE_TEMP_PARENT, `.${prefix}`));
  for (const relativePath of ['package.json', ...SOURCE_CLOSURE_PATHS, 'scripts/verify-case-public-techniques.mjs']) {
    const destination = path.join(repo, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path.join(ROOT, relativePath)));
  }
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Case Test'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'case@example.invalid'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  return { repo, commit };
}

test('buildChainSidecar joins in profile-index order and audits DB-only rows', () => {
  const profileIndex = {
    profile_count: 2,
    profiles: [{ profile_id: 'published-b' }, { profile_id: 'published-a' }],
  };
  const dbRows = [
    { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'published-a', techFilter: 'DMS', isBackgroundChannel: false },
    { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'published-b', techFilter: null, isBackgroundChannel: true },
    { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'db-only', techFilter: 'Mystery-seq', isBackgroundChannel: null },
  ];

  const sourceCopy = structuredClone(profileIndex);
  const result = buildChainSidecar({ profileIndex, dbRows, pdbId: '1ABC', authChain: 'A', ordinal: 0 });

  assert.deepEqual(result.payload.profiles.map(({ profileId }) => profileId), ['published-b', 'published-a']);
  assert.deepEqual(result.payload.profiles.map(({ classificationStatus }) => classificationStatus), ['background', 'mapped']);
  assert.deepEqual(result.dbOnlyRows.map(({ profileId }) => profileId), ['db-only']);
  assert.equal(result.payload.profiles.some(({ profileId }) => profileId === 'db-only'), false);
  assert.deepEqual(profileIndex, sourceCopy);
  assert.deepEqual(result.statusCounts, { mapped: 1, partially_mapped: 0, unmapped: 0, background: 1, missing: 0 });
});

test('classification exception audit closes global anomalies across Case ownership scopes', () => {
  assert.equal(typeof techniqueLib.buildClassificationExceptionAudit, 'function');
  const row = (pdbId, authChain, profileId, techFilter, isBackgroundChannel) => ({
    ordinal: 0,
    pdbId,
    authChain,
    chainKey: `${pdbId}|${authChain}`,
    profileId,
    techFilter,
    isBackgroundChannel,
  });
  const audit = techniqueLib.buildClassificationExceptionAudit({
    globalRows: [
      { pdbId: '1ABC', authChain: 'A', techFilter: 'CIRS-seq', isBackgroundChannel: false, profileCount: 1 },
      { pdbId: '1ABC', authChain: 'A', techFilter: 'Glyoxal', isBackgroundChannel: false, profileCount: 1 },
      { pdbId: '2DEF', authChain: 'B', techFilter: 'Terbium', isBackgroundChannel: null, profileCount: 1 },
      { pdbId: '3GHI', authChain: 'C', techFilter: null, isBackgroundChannel: false, profileCount: 1 },
    ],
    caseInventory: [
      { pdbId: '1ABC', authChain: 'A' },
      { pdbId: '2DEF', authChain: 'B' },
    ],
    selections: [{ pdbId: '1ABC', authChain: 'A' }],
    selectedPublicRows: [row('1ABC', 'A', 'public-cirs', 'CIRS-seq', false)],
    selectedDbOnlyRows: [row('1ABC', 'A', 'db-only-glyoxal', 'Glyoxal', false)],
  });
  assert.deepEqual(audit, [
    { scope: 'global', exceptionType: 'unmapped-technique', techniqueLabel: 'CIRS-seq', profileCount: 1, chainCount: 1 },
    { scope: 'global', exceptionType: 'unmapped-technique', techniqueLabel: 'Glyoxal', profileCount: 1, chainCount: 1 },
    { scope: 'global', exceptionType: 'unmapped-technique', techniqueLabel: 'Terbium', profileCount: 1, chainCount: 1 },
    { scope: 'global', exceptionType: 'non-background-null', techniqueLabel: '', profileCount: 1, chainCount: 1 },
    { scope: 'selected-public-sidecar', exceptionType: 'unmapped-technique', techniqueLabel: 'CIRS-seq', profileCount: 1, chainCount: 1 },
    { scope: 'selected-chain-db-only', exceptionType: 'unmapped-technique', techniqueLabel: 'Glyoxal', profileCount: 1, chainCount: 1 },
    { scope: 'unselected-profile-index-chain', exceptionType: 'unmapped-technique', techniqueLabel: 'Terbium', profileCount: 1, chainCount: 1 },
    { scope: 'no-profile-index-chain', exceptionType: 'non-background-null', techniqueLabel: '', profileCount: 1, chainCount: 1 },
  ]);
});

test('builder emits a bounded global classification exception report and verifier recomputes it independently', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot, '1ABC', 'A', [{ profile_id: 'public-cirs' }]);
  writeProfileIndex(fixture.caseRoot, '0DEF', 'B', [{ profile_id: 'unselected-terbium' }]);
  createClassificationAuditDuckDb(fixture.db);
  const built = runBuilder(fixture);
  assert.equal(built.status, 0, built.stderr);
  const run = path.join(fixture.outParent, RUN_ID);
  const reportPath = path.join(run, 'reports', 'classification-exceptions.tsv');
  const report = readFileSync(reportPath, 'utf8');
  for (const expected of [
    'global\tunmapped-technique\tCIRS-seq\t1\t1',
    'selected-public-sidecar\tunmapped-technique\tCIRS-seq\t1\t1',
    'selected-chain-db-only\tunmapped-technique\tGlyoxal\t1\t1',
    'unselected-profile-index-chain\tunmapped-technique\tTerbium\t1\t1',
    'no-profile-index-chain\tnon-background-null\t\t1\t1',
  ]) assert.match(report, new RegExp(expected));
  const verified = runVerifier(fixture, run);
  assert.equal(verified.status, 0, verified.stderr);

  const manifestPath = path.join(run, 'source-manifest.json');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.caseInventory.profileIndexCount, 2);
  assert.match(manifest.caseInventory.sha256, /^[0-9a-f]{64}$/);
  manifest.caseInventory.profileIndexCount += 1;
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports', 'sha256.txt'), sha256Manifest(run));
  const inventoryRejected = runVerifier(fixture, run);
  assert.notEqual(inventoryRejected.status, 0);
  assert.match(inventoryRejected.stderr, /caseInventory|inventory/i);
  writeFileSync(manifestPath, manifestBytes);
  writeFileSync(path.join(run, 'reports', 'sha256.txt'), sha256Manifest(run));

  writeFileSync(reportPath, report.replace('CIRS-seq\t1\t1', 'CIRS-seq\t2\t1'));
  writeFileSync(path.join(run, 'reports', 'sha256.txt'), sha256Manifest(run));
  const rejected = runVerifier(fixture, run);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /classification|exception|global|audit/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('buildChainSidecar fails loudly for profile-index and exact-join drift', () => {
  const validIndex = { profile_count: 1, profiles: [{ profile_id: 'p1' }] };
  const validRow = { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'p1', techFilter: null, isBackgroundChannel: false };
  const invalidIndexes = [
    null,
    { profile_count: 2, profiles: [{ profile_id: 'p1' }] },
    { profile_count: 2, profiles: [{ profile_id: 'p1' }, { profile_id: 'p1' }] },
    { profile_count: 1, profiles: [{ profile_id: ' p1' }] },
  ];
  for (const profileIndex of invalidIndexes) {
    assert.throws(() => buildChainSidecar({ profileIndex, dbRows: [validRow], pdbId: '1ABC', authChain: 'A', ordinal: 0 }));
  }
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /missing/i);
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [validRow, validRow], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /duplicate/i);
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [{ ...validRow, pdbId: '1abc' }], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /pdbId/i);
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [{ ...validRow, authChain: 'a' }], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /authChain/i);
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [{ ...validRow, ordinal: 1 }], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /ordinal/i);
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [{ ...validRow, techFilter: 7 }], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /techFilter/i);
  assert.throws(() => buildChainSidecar({ profileIndex: validIndex, dbRows: [{ ...validRow, isBackgroundChannel: 0 }], pdbId: '1ABC', authChain: 'A', ordinal: 0 }), /isBackgroundChannel/i);
});

test('empty technique values become background only for the explicit background flag', () => {
  const profileIndex = { profile_count: 3, profiles: [{ profile_id: 'null' }, { profile_id: 'blank' }, { profile_id: 'empty' }] };
  const dbRows = [
    { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'null', techFilter: null, isBackgroundChannel: true },
    { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'blank', techFilter: '   ', isBackgroundChannel: false },
    { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: 'ck', profileId: 'empty', techFilter: '', isBackgroundChannel: null },
  ];
  const result = buildChainSidecar({ profileIndex, dbRows, pdbId: '1ABC', authChain: 'A', ordinal: 0 });
  assert.deepEqual(result.payload.profiles.map(({ classificationStatus }) => classificationStatus), ['background', 'missing', 'missing']);
  assert.deepEqual(result.nullTechniqueRows.map(({ profileId }) => profileId), ['blank', 'empty', 'null']);
});

test('deterministic JSON and gzip have stable bytes and a normalized gzip header', () => {
  const payload = { z: 1, a: [{ y: 'é', x: true }] };
  assert.equal(deterministicJson(payload), '{"a":[{"x":true,"y":"é"}],"z":1}\n');
  const first = deterministicGzip(payload);
  const second = deterministicGzip(payload);
  assert.deepEqual(first, second);
  assert.deepEqual([...first.subarray(4, 8)], [0, 0, 0, 0]);
  assert.equal(first[9], 255);
  assert.equal(gunzipSync(first).toString('utf8'), deterministicJson(payload));
});

test('writeAllSync drains partial writes without truncating report bytes', () => {
  assert.equal(typeof builderModule.writeAllSync, 'function');
  const emitted = [];
  let calls = 0;
  const input = Buffer.from('header\nrow-one\nrow-two\n');
  const written = builderModule.writeAllSync(17, input, (_fd, bytes, offset, length) => {
    calls += 1;
    const count = Math.min(length, 3);
    emitted.push(Buffer.from(bytes.subarray(offset, offset + count)));
    return count;
  });
  assert.equal(written, input.length);
  assert.ok(calls > 1);
  assert.deepEqual(Buffer.concat(emitted), input);
  assert.throws(
    () => builderModule.writeAllSync(17, input, () => 0),
    /write|progress|zero|partial/i,
  );
});

test('source manifest v2 strictly validates deterministic DB-only audit summary rows', () => {
  assert.equal(techniqueLib.LEGACY_SOURCE_MANIFEST_SCHEMA, 'case-public-techniques-source-manifest.v2');
  assert.equal(techniqueLib.SOURCE_MANIFEST_SCHEMA, 'case-public-techniques-source-manifest.v4');
  assert.equal(typeof techniqueLib.validateDbOnlyAuditSummary, 'function');
  const selection = [{ pdbId: '1ABC', authChain: 'A' }];
  const valid = [
    { pdbId: '1ABC', authChain: 'A', techFilter: null, isBackgroundChannel: false, count: 1 },
    { pdbId: '1ABC', authChain: 'A', techFilter: '', isBackgroundChannel: true, count: 2 },
  ];
  const triState = [null, false, true].map((isBackgroundChannel) => ({
    pdbId: '1ABC',
    authChain: 'A',
    techFilter: 'same-technique',
    isBackgroundChannel,
    count: 1,
  }));
  assert.doesNotThrow(() => techniqueLib.validateDbOnlyAuditSummary(valid, selection));
  assert.doesNotThrow(() => techniqueLib.validateDbOnlyAuditSummary(triState, selection));
  assert.throws(
    () => techniqueLib.validateDbOnlyAuditSummary([triState[1], triState[0], triState[2]], selection),
    /order|sort/i,
  );
  assert.throws(() => techniqueLib.validateDbOnlyAuditSummary([...valid].reverse(), selection), /order|sort/i);
  assert.throws(() => techniqueLib.validateDbOnlyAuditSummary([...valid, { ...valid[1] }], selection), /duplicate|order/i);
  assert.throws(() => techniqueLib.validateDbOnlyAuditSummary([{ ...valid[0], count: 0 }], selection), /count|positive/i);
  assert.throws(
    () => techniqueLib.validateDbOnlyAuditSummary([{ ...valid[0], count: Number.MAX_SAFE_INTEGER + 1 }], selection),
    /count|safe|integer/i,
  );
  assert.throws(
    () => techniqueLib.validateDbOnlyAuditSummary([{ ...valid[0], isBackgroundChannel: 'false' }], selection),
    /background|boolean/i,
  );
  assert.throws(
    () => techniqueLib.validateDbOnlyAuditSummary([{ ...valid[0], internalFamily: 'forbidden' }], selection),
    /unknown|field/i,
  );
});

test('DB-only audit summary accumulator enforces exact canonical UTF-8 byte bounds across chains', () => {
  assert.equal(techniqueLib.MAX_DB_ONLY_AUDIT_SUMMARY_BYTES, 32 * 1024 * 1024);
  assert.equal(techniqueLib.MAX_SOURCE_MANIFEST_BYTES, 64 * 1024 * 1024);
  assert.equal(typeof techniqueLib.createBoundedDbOnlyAuditSummaryAccumulator, 'function');
  const selection = [
    { pdbId: '1ABC', authChain: 'A' },
    { pdbId: '1ABC', authChain: 'B' },
  ];
  const first = { pdbId: '1ABC', authChain: 'A', techFilter: 'alpha', isBackgroundChannel: false, count: 1 };
  const second = { pdbId: '1ABC', authChain: 'B', techFilter: 'βeta', isBackgroundChannel: true, count: 2 };
  const exactBytes = Buffer.byteLength(deterministicJson([first, second]), 'utf8');

  const exact = techniqueLib.createBoundedDbOnlyAuditSummaryAccumulator({ selection, maxBytes: exactBytes });
  exact.append([first]);
  exact.append([second]);
  assert.equal(exact.byteLength, exactBytes);
  assert.deepEqual(exact.finish(), [first, second]);

  const crossChainOverflow = techniqueLib.createBoundedDbOnlyAuditSummaryAccumulator({
    selection,
    maxBytes: exactBytes - 1,
  });
  crossChainOverflow.append([first]);
  assert.throws(() => crossChainOverflow.append([second]), /DB-only audit summary|bytes|limit/i);
  assert.deepEqual(crossChainOverflow.finish(), [first]);

  const longLabel = { ...first, techFilter: '界'.repeat(32) };
  const longBytes = Buffer.byteLength(deterministicJson([longLabel]), 'utf8');
  const singleOverflow = techniqueLib.createBoundedDbOnlyAuditSummaryAccumulator({
    selection,
    maxBytes: longBytes - 1,
  });
  assert.throws(() => singleOverflow.append([longLabel]), /DB-only audit summary|bytes|limit/i);
  assert.deepEqual(singleOverflow.finish(), []);

  let identityReads = 0;
  const observedSelection = selection.map((item) => new Proxy(item, {
    get(target, property, receiver) {
      if (property === 'pdbId' || property === 'authChain') identityReads += 1;
      return Reflect.get(target, property, receiver);
    },
  }));
  const manyEmptyChains = techniqueLib.createBoundedDbOnlyAuditSummaryAccumulator({
    selection: observedSelection,
    maxBytes: 3,
  });
  const constructionReads = identityReads;
  for (let index = 0; index < 1000; index += 1) manyEmptyChains.append([]);
  assert.equal(identityReads, constructionReads, 'selection ordinals must be precomputed once');
});

test('strict run-id validation accepts real UTC instants and rejects impossible calendar or clock fields', () => {
  assert.deepEqual(validateRunId('pilot-20240229T235959Z-abcdef012345'), {
    kind: 'pilot',
    timestamp: '20240229T235959Z',
    git12: 'abcdef012345',
  });
  assert.deepEqual(validateRunId('full-20260828T123456Z-012345abcdef'), {
    kind: 'full',
    timestamp: '20260828T123456Z',
    git12: '012345abcdef',
  });
  for (const runId of [
    'pilot-20260229T120000Z-012345abcdef',
    'pilot-20269999T999999Z-012345abcdef',
    'pilot-20260431T120000Z-012345abcdef',
    'pilot-20260101T240000Z-012345abcdef',
    'pilot-20260101T236000Z-012345abcdef',
    'pilot-20260101T235960Z-012345abcdef',
    'preview-20260101T235959Z-012345abcdef',
  ]) {
    assert.throws(() => validateRunId(runId), /run-id|UTC|calendar|timestamp/i);
  }
});

test('builder CLI binds full runs to --all and pilot runs to explicit cases in both directions', () => {
  const common = [
    '--db', '/tmp/db',
    '--case-root', '/tmp/cases',
    '--out-parent', '/tmp/out',
    '--python', '/tmp/python',
  ];
  const pilot = builderModule.parseBuilderArgs([
    ...common,
    '--run-id', 'pilot-20260828T123456Z-012345abcdef',
    '--case', '1ABC/A',
  ]);
  assert.equal(pilot.runIdParts.kind, 'pilot');
  assert.equal(pilot.all, false);
  const full = builderModule.parseBuilderArgs([
    ...common,
    '--run-id', 'full-20260828T123456Z-012345abcdef',
    '--all',
  ]);
  assert.equal(full.runIdParts.kind, 'full');
  assert.equal(full.all, true);
  assert.throws(
    () => builderModule.parseBuilderArgs([
      ...common,
      '--run-id', 'pilot-20260828T123456Z-012345abcdef',
      '--all',
    ]),
    /pilot.*explicit.*case|pilot.*--case/i,
  );
  assert.throws(
    () => builderModule.parseBuilderArgs([
      ...common,
      '--run-id', 'full-20260828T123456Z-012345abcdef',
      '--case', '1ABC/A',
    ]),
    /full.*--all/i,
  );
});

test('verifier independently binds directory run kind, manifest runKind, and selection mode', () => {
  assert.equal(typeof verifierModule.validateRunKindIndependently, 'function');
  assert.deepEqual(verifierModule.validateRunKindIndependently({
    runId: 'pilot-20260828T123456Z-012345abcdef',
    selectionMode: 'cases',
    manifestRunKind: 'pilot',
    requiresManifestRunKind: true,
    isPreview: false,
  }), { kind: 'pilot', timestamp: '20260828T123456Z', git12: '012345abcdef' });
  assert.deepEqual(verifierModule.validateRunKindIndependently({
    runId: 'full-20260828T123456Z-012345abcdef',
    selectionMode: 'all',
    manifestRunKind: 'full',
    requiresManifestRunKind: true,
    isPreview: false,
  }), { kind: 'full', timestamp: '20260828T123456Z', git12: '012345abcdef' });
  assert.deepEqual(verifierModule.validateRunKindIndependently({
    runId: 'pilot-20260828T123456Z-012345abcdef',
    selectionMode: 'cases',
    manifestRunKind: undefined,
    requiresManifestRunKind: false,
    isPreview: false,
    isLegacyData: true,
  }), { kind: 'pilot', timestamp: '20260828T123456Z', git12: '012345abcdef' });
  for (const input of [
    {
      runId: 'pilot-20260828T123456Z-012345abcdef', selectionMode: 'all',
      manifestRunKind: 'pilot', requiresManifestRunKind: true, isPreview: false,
    },
    {
      runId: 'full-20260828T123456Z-012345abcdef', selectionMode: 'cases',
      manifestRunKind: 'full', requiresManifestRunKind: true, isPreview: false,
    },
    {
      runId: 'pilot-20260828T123456Z-012345abcdef', selectionMode: 'cases',
      manifestRunKind: 'full', requiresManifestRunKind: true, isPreview: false,
    },
    {
      runId: 'full-20260828T123456Z-012345abcdef', selectionMode: 'cases',
      manifestRunKind: undefined, requiresManifestRunKind: false, isPreview: true,
    },
    {
      runId: 'full-20260828T123456Z-012345abcdef', selectionMode: 'all',
      manifestRunKind: undefined, requiresManifestRunKind: false, isPreview: false,
      isLegacyData: true,
    },
  ]) assert.throws(() => verifierModule.validateRunKindIndependently(input), /run kind|pilot|full|selection/i);
});

test('verifier freezes v4 schema, builder version, and global-audit byte ceilings independently', () => {
  const source = readFileSync(VERIFY, 'utf8');
  for (const literal of [
    "VERIFIER_CURRENT_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v4'",
    "VERIFIER_CURRENT_BUILDER_VERSION = 'case-public-techniques-builder.v2'",
    'VERIFIER_MAX_GLOBAL_AUDIT_STDOUT_BYTES = 64 * 1024 * 1024',
    'VERIFIER_MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES = 8 * 1024 * 1024',
  ]) assert.match(source, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const sharedImport = source.match(/import \{([\s\S]*?)\} from '\.\/case-public-techniques-lib\.mjs';/)?.[1] || '';
  for (const sharedName of [
    'SOURCE_MANIFEST_SCHEMA',
    'BUILDER_VERSION',
    'MAX_GLOBAL_AUDIT_STDOUT_BYTES',
    'MAX_CLASSIFICATION_EXCEPTION_REPORT_BYTES',
  ]) assert.doesNotMatch(sharedImport, new RegExp(`\\b${sharedName}\\b`));
});

test('input capture binds manifest metadata and parsed bytes to one stable read', () => {
  const fixture = tempFixture();
  const input = path.join(fixture.root, 'input.bin');
  writeFileSync(input, 'before\n');
  const captured = captureInputFile(input);
  assert.equal(captured.bytes.toString('utf8'), 'before\n');
  assert.equal(captured.record.sha256, createHash('sha256').update(captured.bytes).digest('hex'));
  assert.equal(captured.record.size, captured.bytes.length);
  writeFileSync(input, 'after\n');
  assert.equal(captured.bytes.toString('utf8'), 'before\n');
  rmSync(fixture.root, { recursive: true, force: true });
});

test('anchored base64 capture remains stack-safe at the real 9WNR root-structure size', (testContext) => {
  const fixture = tempFixture();
  testContext.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const canonicalRoot = realpathSync(fixture.root);
  const source = path.join(canonicalRoot, 'large-structure.cif.gz');
  const payload = Buffer.alloc(4_227_121, 0xa5);
  writeFileSync(source, payload);
  const captured = techniqueLib.captureAnchoredFile({
    python: realpathSync(PYTHON),
    root: canonicalRoot,
    segments: ['large-structure.cif.gz'],
    maxBytes: 64 * 1024 * 1024,
    includeBytes: true,
  });
  assert.equal(captured.bytes.equals(payload), true);
  assert.equal(captured.record.size, payload.length);
  assert.equal(captured.record.sha256, createHash('sha256').update(payload).digest('hex'));
});

test('anchored base64 capture rejects invalid length, characters, padding, and noncanonical bits', (testContext) => {
  const fixture = tempFixture();
  testContext.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const expectedPath = path.join(fixture.root, 'payload.bin');
  const fakePython = path.join(fixture.root, 'fake-python');
  for (const [label, bytesBase64] of [
    ['length', 'A'],
    ['characters', '!!!!'],
    ['padding', 'A==='],
    ['noncanonical bits', 'Zh=='],
  ]) {
    const response = {
      operation: 'capture',
      record: {
        path: expectedPath,
        size: 1,
        mtimeNs: '0',
        inode: '0',
        device: '0',
        sha256: '0'.repeat(64),
      },
      bytesBase64,
    };
    writeFileSync(
      fakePython,
      `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(response)}\n`)});\n`,
      { mode: 0o755 },
    );
    assert.throws(
      () => techniqueLib.captureAnchoredFile({
        python: fakePython,
        root: fixture.root,
        segments: ['payload.bin'],
        maxBytes: 1024,
        includeBytes: true,
      }),
      /canonical base64/,
      label,
    );
  }
});

test('bounded sync and streaming captures stop reading at the first byte-limit breach', async () => {
  const fixture = tempFixture();
  const input = path.join(fixture.root, 'growing-input.bin');
  const exercise = async (capture) => {
    writeFileSync(input, '12345');
    const initialReads = [];
    await assert.rejects(
      async () => capture(input, {
        maxBytes: 4,
        onRead(progress) { initialReads.push(progress.totalBytesRead); },
      }),
      /exceeds 4 bytes/i,
    );
    assert.deepEqual(initialReads, [], 'initial oversized files must be rejected before the first read');

    writeFileSync(input, '1234');
    const growthReads = [];
    await assert.rejects(
      async () => capture(input, {
        maxBytes: 4,
        onRead(progress) {
          growthReads.push(progress.totalBytesRead);
          if (growthReads.length === 1) appendFileSync(input, '5');
        },
      }),
      /exceeds 4 bytes/i,
    );
    assert.deepEqual(growthReads, [4], 'growth beyond the cap must be rejected before another read');
  };
  await exercise(async (filePath, options) => captureInputFile(filePath, options));
  await exercise(captureInputFileStreaming);
  assert.throws(() => captureInputFile(input, { maxBytes: 0 }), /maxBytes|positive safe integer/i);
  await assert.rejects(
    captureInputFileStreaming(input, { maxBytes: Number.MAX_SAFE_INTEGER + 1 }),
    /maxBytes|positive safe integer/i,
  );
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier run-tree snapshot applies its manifest cap before the first read', () => {
  const fixture = tempFixture();
  const run = path.join(fixture.root, 'run');
  mkdirSync(run);
  writeFileSync(path.join(run, 'other.txt'), 'ok');
  writeFileSync(path.join(run, 'source-manifest.json'), '12345');
  assert.throws(
    () => snapshotRunTreeStreaming(realpathSync(run), {
      python: PYTHON,
      sourceManifestMaxBytes: 4,
    }),
    /source-manifest|exceeds 4 bytes/i,
  );
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder publication hashing applies the source-manifest cap through the anchored helper', () => {
  assert.equal(typeof builderModule.hashRunFilesForPublication, 'function');
  const fixture = tempFixture();
  const partial = path.join(fixture.root, 'partial');
  mkdirSync(partial);
  const manifestPath = path.join(partial, 'source-manifest.json');
  writeFileSync(manifestPath, '12345');
  assert.throws(
    () => builderModule.hashRunFilesForPublication(realpathSync(partial), {
      python: PYTHON,
      sourceManifestMaxBytes: 4,
    }),
    /source-manifest|exceeds 4 bytes/i,
  );
  rmSync(fixture.root, { recursive: true, force: true });
});

test('anchored run tree and publication SHA allow non-manifest files above 64 MiB', () => {
  const fixture = tempFixture();
  const run = path.join(fixture.root, 'large-run');
  mkdirSync(run);
  writeFileSync(path.join(run, 'source-manifest.json'), '{}\n');
  const largeReport = path.join(run, 'large-report.tsv');
  writeFileSync(largeReport, '');
  truncateSync(largeReport, techniqueLib.MAX_SOURCE_MANIFEST_BYTES + 1);
  assert.doesNotThrow(() => snapshotRunTreeStreaming(realpathSync(run), { python: PYTHON }));
  assert.doesNotThrow(() => builderModule.hashRunFilesForPublication(realpathSync(run), { python: PYTHON }));
  rmSync(fixture.root, { recursive: true, force: true });
});

test('profile-index decompression is bounded independently of compressed input size', () => {
  const expanded = Buffer.alloc(techniqueLib.MAX_PROFILE_INDEX_BYTES + 1, 0x20);
  const compressed = gzipSync(expanded);
  assert.ok(compressed.length < techniqueLib.MAX_PROFILE_INDEX_BYTES);
  assert.throws(
    () => techniqueLib.parseProfileIndexGzipBytes(compressed, 'gzip-bomb'),
    /decompress|exceeds|maximum|limit|too large/i,
  );
});

test('streaming input capture hashes without retaining whole-file bytes', async () => {
  const fixture = tempFixture();
  const input = path.join(fixture.root, 'large-input.bin');
  writeFileSync(input, Buffer.alloc(2 * 1024 * 1024, 0x5a));
  const captured = await captureInputFileStreaming(input);
  assert.equal(Object.hasOwn(captured, 'bytes'), false);
  assert.equal(captured.size, 2 * 1024 * 1024);
  assert.equal(captured.sha256, createHash('sha256').update(readFileSync(input)).digest('hex'));
  rmSync(fixture.root, { recursive: true, force: true });
});

test('streaming input capture binds hash and metadata to one opened inode during path replacement', async () => {
  const fixture = tempFixture();
  const input = path.join(fixture.root, 'race-input.bin');
  const originalAway = path.join(fixture.root, 'race-input.original');
  const replacement = path.join(fixture.root, 'race-input.replacement');
  const originalBytes = Buffer.alloc(64 * 1024 * 1024, 0x41);
  const replacementBytes = Buffer.alloc(originalBytes.length, 0x42);
  writeFileSync(input, originalBytes);
  writeFileSync(replacement, replacementBytes);
  const originalInode = statSync(input, { bigint: true }).ino.toString();
  const replacementInode = statSync(replacement, { bigint: true }).ino.toString();
  const expectedHashes = new Map([
    [originalInode, createHash('sha256').update(originalBytes).digest('hex')],
    [replacementInode, createHash('sha256').update(replacementBytes).digest('hex')],
  ]);
  const pending = captureInputFileStreaming(input);
  renameSync(input, originalAway);
  renameSync(replacement, input);
  const restore = new Promise((resolve) => setTimeout(() => {
    renameSync(input, replacement);
    renameSync(originalAway, input);
    resolve();
  }, 5));
  let captured = null;
  try {
    captured = await pending;
  } catch {
    // Rejecting a path replacement is also a correct fail-closed result.
  }
  await restore;
  if (captured) assert.equal(captured.sha256, expectedHashes.get(captured.inode));
  rmSync(fixture.root, { recursive: true, force: true });
});

test('bounded selection processing retains at most one chain across logical output above 256 MiB', async () => {
  const selections = Array.from({ length: 1024 }, (_, ordinal) => ({ ordinal }));
  let logicalBytes = 0;
  const result = await processSequentiallyBounded(selections, async () => {
    logicalBytes += 512 * 1024;
  });
  assert.ok(logicalBytes > 256 * 1024 * 1024);
  assert.equal(result.processedCount, selections.length);
  assert.equal(result.maxBufferedItems, 1);
});

test('source closure resolves a real commit, rejects relevant dirty bytes, and ignores unrelated dirt', () => {
  const repo = mkdtempSync(path.join(CASE_SENSITIVE_TEMP_PARENT, '.case-public-git-closure-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Case Test'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'case@example.invalid'], { cwd: repo });
  writeFileSync(path.join(repo, 'tracked.js'), 'export const value = 1;\n');
  execFileSync('git', ['add', 'tracked.js'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  assert.equal(resolveGitCommit(repo, commit.slice(0, 12)), commit);
  const clean = captureSourceClosure({ repoRoot: repo, commit, python: PYTHON, paths: ['tracked.js'] });
  assert.equal(clean.length, 1);
  assert.match(clean[0].blob, /^[0-9a-f]{40,64}$/);
  assert.match(clean[0].sha256, /^[0-9a-f]{64}$/);

  writeFileSync(path.join(repo, 'unrelated.txt'), 'dirty but irrelevant\n');
  assert.doesNotThrow(() => captureSourceClosure({ repoRoot: repo, commit, python: PYTHON, paths: ['tracked.js'] }));
  const external = path.join(path.dirname(repo), `${path.basename(repo)}-same-bytes.js`);
  writeFileSync(external, 'export const value = 1;\n');
  rmSync(path.join(repo, 'tracked.js'));
  symlinkSync(external, path.join(repo, 'tracked.js'));
  assert.throws(
    () => captureSourceClosure({ repoRoot: repo, commit, python: PYTHON, paths: ['tracked.js'] }),
    /symlink|regular|closure|realpath|mode/i,
  );
  rmSync(path.join(repo, 'tracked.js'));
  writeFileSync(path.join(repo, 'tracked.js'), 'export const value = 1;\n');
  writeFileSync(path.join(repo, 'tracked.js'), 'export const value = 2;\n');
  assert.throws(
    () => captureSourceClosure({ repoRoot: repo, commit, python: PYTHON, paths: ['tracked.js'] }),
    /dirty|closure|HEAD|blob/i,
  );
  rmSync(repo, { recursive: true, force: true });
  rmSync(external, { force: true });
});

test('builder rejects a dirty execution closure before creating its partial directory', () => {
  const repo = mkdtempSync(path.join(CASE_SENSITIVE_TEMP_PARENT, '.case-public-dirty-builder-'));
  const closurePaths = [
    'scripts/build-case-public-techniques.mjs',
    'scripts/case-public-techniques-lib.mjs',
    'scripts/extract-case-public-techniques.py',
    'scripts/safe-openat-capture.py',
    'src/techniqueFilterModel.js',
    'public/entry-cases/__entry_v3_site__/workbench-pure.mjs',
  ];
  for (const relativePath of ['package.json', ...closurePaths]) {
    const destination = path.join(repo, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path.join(ROOT, relativePath)));
  }
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Case Test'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'case@example.invalid'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const fixture = {
    db: path.join(repo, 'fixture.duckdb'),
    caseRoot: path.join(repo, 'cases'),
    outParent: path.join(repo, 'out'),
  };
  writeFileSync(fixture.db, 'not reached\n');
  mkdirSync(fixture.caseRoot);
  mkdirSync(fixture.outParent);
  const fakeBuilder = path.join(repo, 'scripts/build-case-public-techniques.mjs');
  writeFileSync(fakeBuilder, `${readFileSync(fakeBuilder, 'utf8')}\n// relevant dirty test\n`);
  const runId = `pilot-20260828T123456Z-${commit.slice(0, 12)}`;
  const result = spawnSync(process.execPath, [
    path.relative(repo, fakeBuilder),
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--out-parent', fixture.outParent,
    '--run-id', runId,
    '--python', PYTHON,
    '--case', '1ABC/A',
  ], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source closure|dirty|blob/i);
  assert.equal(existsSync(path.join(fixture.outParent, `.${runId}.partial`)), false);
  rmSync(repo, { recursive: true, force: true });
});

test('safe Case inventory rejects nested and file symlinks and preserves A/a byte order', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot, '1ABC', 'A');
  assert.deepEqual(enumerateAllCasesSafe(realpathSync(fixture.caseRoot), { python: PYTHON }), [
    { pdbId: '1ABC', authChain: 'A' },
  ]);
  assert.deepEqual(sortCaseSelectionsBytewise([
    { pdbId: '1ABC', authChain: 'a' },
    { pdbId: '1ABC', authChain: 'A' },
  ]), [
    { pdbId: '1ABC', authChain: 'A' },
    { pdbId: '1ABC', authChain: 'a' },
  ]);

  const symlinkFixture = tempFixture();
  const outside = path.join(symlinkFixture.root, 'outside');
  writeProfileIndex(outside, '1ABC', 'A');
  mkdirSync(path.join(symlinkFixture.caseRoot, '1ABC'), { recursive: true });
  symlinkSync(path.join(outside, '1ABC', 'chains'), path.join(symlinkFixture.caseRoot, '1ABC', 'chains'));
  assert.throws(() => enumerateAllCasesSafe(realpathSync(symlinkFixture.caseRoot), { python: PYTHON }), /symlink|escape/i);

  const fileSymlinkFixture = tempFixture();
  const externalIndexRoot = path.join(fileSymlinkFixture.root, 'external-index');
  writeProfileIndex(externalIndexRoot, '9ZZZ', 'Z');
  const profiles = path.join(fileSymlinkFixture.caseRoot, '9ZZZ', 'chains', 'Z', 'profiles');
  mkdirSync(profiles, { recursive: true });
  symlinkSync(
    path.join(externalIndexRoot, '9ZZZ', 'chains', 'Z', 'profiles', 'profile-index.json.gz'),
    path.join(profiles, 'profile-index.json.gz'),
  );
  assert.throws(() => enumerateAllCasesSafe(realpathSync(fileSymlinkFixture.caseRoot), { python: PYTHON }), /symlink|escape/i);

  const danglingFixture = tempFixture();
  const danglingProfiles = path.join(danglingFixture.caseRoot, '7YYY', 'chains', 'Y', 'profiles');
  mkdirSync(danglingProfiles, { recursive: true });
  symlinkSync(
    path.join(danglingFixture.root, 'does-not-exist.json.gz'),
    path.join(danglingProfiles, 'profile-index.json.gz'),
  );
  assert.throws(() => enumerateAllCasesSafe(realpathSync(danglingFixture.caseRoot), { python: PYTHON }), /symlink|dangling|profile-index/i);
  rmSync(fixture.root, { recursive: true, force: true });
  rmSync(symlinkFixture.root, { recursive: true, force: true });
  rmSync(fileSymlinkFixture.root, { recursive: true, force: true });
  rmSync(danglingFixture.root, { recursive: true, force: true });
});

test('all-mode inventory comparison fails on concurrent addition or case-sensitive drift', () => {
  const before = [{ pdbId: '1ABC', authChain: 'A' }];
  assert.throws(
    () => assertInventoryUnchanged(before, [...before, { pdbId: '2DEF', authChain: 'B' }]),
    /inventory.*changed/i,
  );
  assert.throws(
    () => assertInventoryUnchanged(before, [{ pdbId: '1ABC', authChain: 'a' }]),
    /inventory.*changed/i,
  );
});

test('builder explicit profile capture rejects a deterministic intermediate profiles swap', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const profiles = path.join(fixture.caseRoot, '1ABC', 'chains', 'A', 'profiles');
  const outside = path.join(fixture.root, 'outside-explicit-profiles');
  mkdirSync(outside);
  const outsideBytes = gzipSync('{"external":true}\n');
  writeFileSync(path.join(outside, 'profile-index.json.gz'), outsideBytes);
  const attackingPython = createSafeHelperAttackPython({
    fixtureRoot: fixture.root,
    targetRoot: realpathSync(fixture.caseRoot),
    operation: 'capture',
    event: 'before_file_open',
    relativeSegments: ['1ABC', 'chains', 'A', 'profiles', 'profile-index.json.gz'],
    targetDirectory: profiles,
    outsideDirectory: outside,
  });
  const result = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /profile-index|edge|drift|symlink/i);
  assert.equal(existsSync(path.join(fixture.outParent, `.${RUN_ID}.partial`)), false);
  assert.deepEqual(readFileSync(path.join(outside, 'profile-index.json.gz')), outsideBytes);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder --all inventory rejects a deterministic intermediate profiles swap', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const profiles = path.join(fixture.caseRoot, '1ABC', 'chains', 'A', 'profiles');
  const outside = path.join(fixture.root, 'outside-inventory-profiles');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'profile-index.json.gz'), gzipSync('{"external":true}\n'));
  const attackingPython = createSafeHelperAttackPython({
    fixtureRoot: fixture.root,
    targetRoot: realpathSync(fixture.caseRoot),
    operation: 'inventory',
    event: 'after_directory_open',
    relativeSegments: ['1ABC', 'chains', 'A', 'profiles'],
    targetDirectory: profiles,
    outsideDirectory: outside,
  });
  const result = runBuilderAll(fixture, FULL_RUN_ID, attackingPython);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /inventory|edge|drift|symlink/i);
  assert.equal(existsSync(path.join(fixture.outParent, `.${FULL_RUN_ID}.partial`)), false);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder publication SHA rejects a deterministic nested reports swap and preserves partial', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const partial = path.join(realpathSync(fixture.outParent), `.${RUN_ID}.partial`);
  const reports = path.join(partial, 'reports');
  const outside = path.join(fixture.root, 'outside-publication-reports');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'coverage.json'), '{"external":true}\n');
  const attackingPython = createSafeHelperAttackPython({
    fixtureRoot: fixture.root,
    targetRoot: partial,
    operation: 'sha256',
    event: 'after_directory_open',
    relativeSegments: ['reports'],
    targetDirectory: reports,
    outsideDirectory: outside,
  });
  const result = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /edge|drift|symlink|sha/i);
  assert.equal(existsSync(partial), true, 'failed publication keeps the diagnostic partial');
  assert.equal(existsSync(path.join(fixture.outParent, RUN_ID)), false);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier initial run-tree snapshot rejects a deterministic nested reports ABA swap', () => {
  const built = buildFixture();
  assert.equal(built.result.status, 0, built.result.stderr);
  const reports = path.join(built.run, 'reports');
  const outside = path.join(built.fixture.root, 'outside-verifier-reports');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'coverage.json'), '{"external":true}\n');
  const attackingPython = createSafeHelperAttackPython({
    fixtureRoot: built.fixture.root,
    targetRoot: realpathSync(built.run),
    operation: 'tree',
    event: 'after_directory_open',
    relativeSegments: ['reports'],
    targetDirectory: reports,
    outsideDirectory: outside,
    aba: true,
  });
  const verified = runVerifier(built.fixture, built.run, attackingPython);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /edge|drift|ABA|tree/i);
  rmSync(built.fixture.root, { recursive: true, force: true });
});

test('verifier profile capture rejects a deterministic intermediate profiles swap', () => {
  const built = buildFixture();
  assert.equal(built.result.status, 0, built.result.stderr);
  const profiles = path.join(built.fixture.caseRoot, '1ABC', 'chains', 'A', 'profiles');
  const outside = path.join(built.fixture.root, 'outside-verifier-profiles');
  mkdirSync(outside);
  writeFileSync(path.join(outside, 'profile-index.json.gz'), gzipSync('{"external":true}\n'));
  const attackingPython = createSafeHelperAttackPython({
    fixtureRoot: built.fixture.root,
    targetRoot: realpathSync(built.fixture.caseRoot),
    operation: 'capture',
    event: 'before_file_open',
    relativeSegments: ['1ABC', 'chains', 'A', 'profiles', 'profile-index.json.gz'],
    targetDirectory: profiles,
    outsideDirectory: outside,
  });
  const verified = runVerifier(built.fixture, built.run, attackingPython);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /profile-index|edge|drift|symlink/i);
  rmSync(built.fixture.root, { recursive: true, force: true });
});

test('builder DB queries stay bound to the originally captured regular file across pathname ABA', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const maliciousDb = path.join(fixture.root, 'malicious-entry-atlas.duckdb');
  createDuckDb(maliciousDb);
  execFileSync(PYTHON, ['-c', String.raw`
import duckdb, sys
connection = duckdb.connect(sys.argv[1])
connection.execute("UPDATE profile SET tech_filter = 'SHAPE-MaP' WHERE profile_key = 'published-a'")
connection.close()
`, maliciousDb]);
  const originalBefore = fileFingerprint(fixture.db);
  const maliciousBefore = fileFingerprint(maliciousDb);
  const attackingPython = createDbQueryAbaPython({
    fixtureRoot: fixture.root,
    targetDb: fixture.db,
    maliciousDb,
  });

  const result = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.equal(result.status, 0, result.stderr);
  const sidecar = JSON.parse(gunzipSync(readFileSync(path.join(
    fixture.outParent,
    RUN_ID,
    'data/entry-cases/cases/1ABC/chains/A/profiles/profile-public-techniques.json.gz',
  ))));
  const expected = buildChainSidecar({
    profileIndex: writeProfileIndex(fixture.caseRoot),
    dbRows: [
      { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: '1ABC|A', profileId: 'published-a', techFilter: 'DMS', isBackgroundChannel: false },
      { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: '1ABC|A', profileId: 'published-b', techFilter: null, isBackgroundChannel: true },
      { ordinal: 0, pdbId: '1ABC', authChain: 'A', chainKey: '1ABC|A', profileId: 'db-only', techFilter: 'Mystery-seq', isBackgroundChannel: null },
    ],
    pdbId: '1ABC',
    authChain: 'A',
    ordinal: 0,
  }).payload;
  assert.deepEqual(sidecar, expected);
  assert.deepEqual(fileFingerprint(fixture.db), originalBefore);
  assert.deepEqual(fileFingerprint(maliciousDb), maliciousBefore);
  assert.equal(existsSync(`${fixture.db}.original-away`), false);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier DB queries stay bound to the originally captured regular file across pathname ABA', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const maliciousDb = path.join(fixture.root, 'malicious-entry-atlas.duckdb');
  createDuckDb(maliciousDb);
  execFileSync(PYTHON, ['-c', String.raw`
import duckdb, sys
connection = duckdb.connect(sys.argv[1])
connection.execute("UPDATE profile SET tech_filter = 'SHAPE-MaP' WHERE profile_key = 'published-a'")
connection.close()
`, maliciousDb]);
  const originalBefore = fileFingerprint(fixture.db);
  const maliciousBefore = fileFingerprint(maliciousDb);
  const attackingPython = createDbQueryAbaPython({
    fixtureRoot: fixture.root,
    targetDb: fixture.db,
    maliciousDb,
  });
  const built = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.equal(built.status, 0, built.stderr);
  const run = path.join(fixture.outParent, RUN_ID);

  const verified = runVerifier(fixture, run, attackingPython);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(fileFingerprint(fixture.db), originalBefore);
  assert.deepEqual(fileFingerprint(maliciousDb), maliciousBefore);
  assert.equal(existsSync(`${fixture.db}.original-away`), false);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder reports anchored close drift without masking it with a second close failure', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const dbBefore = fileFingerprint(fixture.db);
  const attackingPython = createDbCloseDriftPython({
    fixtureRoot: fixture.root,
    targetDb: fixture.db,
  });

  const result = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /anchored database source content or edge changed|database source changed/i);
  assert.doesNotMatch(result.stderr, /Bad file descriptor|EBADF|EPIPE|write after end/i);
  assert.equal(existsSync(path.join(fixture.outParent, RUN_ID)), false);
  assert.equal(existsSync(path.join(fixture.outParent, `.${RUN_ID}.partial`)), true);
  assert.deepEqual(fileFingerprint(fixture.db), dbBefore);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier reports anchored close drift without masking it with a second close failure', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const dbBefore = fileFingerprint(fixture.db);
  const attackMarker = path.join(fixture.root, 'enable-verifier-close-drift');
  const attackingPython = createDbCloseDriftPython({
    fixtureRoot: fixture.root,
    targetDb: fixture.db,
    attackMarker,
  });
  const built = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.equal(built.status, 0, built.stderr);
  const run = path.join(fixture.outParent, RUN_ID);
  const runBefore = treeFingerprint(run);
  writeFileSync(attackMarker, 'enabled\n');

  const verified = runVerifier(fixture, run, attackingPython);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /anchored database source content or edge changed|database source changed/i);
  assert.doesNotMatch(verified.stderr, /Bad file descriptor|EBADF|EPIPE|write after end/i);
  assert.equal(treeFingerprint(run), runBefore);
  assert.deepEqual(fileFingerprint(fixture.db), dbBefore);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder queries never depend on a replaceable private snapshot pathname', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const maliciousDb = path.join(fixture.root, 'malicious-entry-atlas.duckdb');
  createDuckDb(maliciousDb);
  execFileSync(PYTHON, ['-c', String.raw`
import duckdb, sys
connection = duckdb.connect(sys.argv[1])
connection.execute("UPDATE profile SET tech_filter = 'SHAPE-MaP' WHERE profile_key = 'published-a'")
connection.close()
`, maliciousDb]);
  const originalBefore = fileFingerprint(fixture.db);
  const maliciousBefore = fileFingerprint(maliciousDb);
  const attackingPython = createSnapshotQueryAbaPython({ fixtureRoot: fixture.root, maliciousDb });

  const result = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(fixture.outParent, RUN_ID)), true);
  assert.equal(existsSync(path.join(ROOT, `.database-snapshot-${RUN_ID}`)), false);
  assert.deepEqual(fileFingerprint(fixture.db), originalBefore);
  assert.deepEqual(fileFingerprint(maliciousDb), maliciousBefore);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier queries never depend on a replaceable private snapshot pathname', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const maliciousDb = path.join(fixture.root, 'malicious-entry-atlas.duckdb');
  createDuckDb(maliciousDb);
  execFileSync(PYTHON, ['-c', String.raw`
import duckdb, sys
connection = duckdb.connect(sys.argv[1])
connection.execute("UPDATE profile SET tech_filter = 'SHAPE-MaP' WHERE profile_key = 'published-a'")
connection.close()
`, maliciousDb]);
  const originalBefore = fileFingerprint(fixture.db);
  const maliciousBefore = fileFingerprint(maliciousDb);
  const attackingPython = createSnapshotQueryAbaPython({ fixtureRoot: fixture.root, maliciousDb });
  const built = runBuilder(fixture, RUN_ID, [], attackingPython);
  assert.equal(built.status, 0, built.stderr);
  const run = path.join(fixture.outParent, RUN_ID);

  const verified = runVerifier(fixture, run, attackingPython);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(readdirSync(ROOT).some((name) => name.startsWith('.database-snapshot-verify-')), false);
  assert.deepEqual(fileFingerprint(fixture.db), originalBefore);
  assert.deepEqual(fileFingerprint(maliciousDb), maliciousBefore);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder creates an immutable run with exact profile publication and verifier accepts it read-only', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const sidecarPath = path.join(run, 'data/entry-cases/cases/1ABC/chains/A/profiles/profile-public-techniques.json.gz');
  const sidecar = JSON.parse(gunzipSync(readFileSync(sidecarPath)));
  assert.deepEqual(sidecar.profiles.map(({ profileId }) => profileId), ['published-b', 'published-a']);
  assert.equal(sidecar.profiles.some(({ profileId }) => profileId === 'db-only'), false);
  assert.match(readFileSync(path.join(run, 'reports/db-only-profiles.tsv'), 'utf8'), /db-only/);
  assert.equal(readFileSync(path.join(run, 'reports/profile-join-failures.tsv'), 'utf8').split('\n').length, 2);
  const manifest = JSON.parse(readFileSync(path.join(run, 'source-manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 'case-public-techniques-source-manifest.v4');
  assert.equal(manifest.runKind, 'pilot');
  assert.equal(manifest.commands.extractor.strategy, 'anchored-fd-readonly-transaction');
  assert.equal(manifest.commands.extractor.argvTemplate[3], '<anchored-database-input>');
  assert.equal(manifest.commands.extractor.queryProtocol, 'bounded-jsonl-v1');
  assert.deepEqual(manifest.dbOnlyAuditSummary, [
    {
      pdbId: '1ABC',
      authChain: 'A',
      techFilter: 'Mystery-seq',
      isBackgroundChannel: null,
      count: 1,
    },
  ]);

  const runBefore = treeFingerprint(run);
  const dbBefore = treeFingerprint(path.dirname(fixture.db));
  const verified = runVerifier(fixture, run);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(treeFingerprint(run), runBefore);
  assert.equal(treeFingerprint(path.dirname(fixture.db)), dbBefore);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('DB-only audit summary separates null, empty, raw labels, and background with exact counts', () => {
  const { fixture, result, run } = buildFixture({ auditVariants: true });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(path.join(run, 'source-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.dbOnlyAuditSummary, [
    { pdbId: '1ABC', authChain: 'A', techFilter: null, isBackgroundChannel: false, count: 1 },
    { pdbId: '1ABC', authChain: 'A', techFilter: null, isBackgroundChannel: true, count: 1 },
    { pdbId: '1ABC', authChain: 'A', techFilter: '', isBackgroundChannel: null, count: 1 },
    { pdbId: '1ABC', authChain: 'A', techFilter: '', isBackgroundChannel: false, count: 1 },
    { pdbId: '1ABC', authChain: 'A', techFilter: '', isBackgroundChannel: true, count: 1 },
    { pdbId: '1ABC', authChain: 'A', techFilter: 'Mystery-seq', isBackgroundChannel: null, count: 1 },
  ]);
  const summaryTotal = manifest.dbOnlyAuditSummary.reduce((sum, row) => sum + row.count, 0);
  const reportRows = readFileSync(path.join(run, 'reports/db-only-profiles.tsv'), 'utf8').trimEnd().split('\n').length - 1;
  assert.equal(summaryTotal, 6);
  assert.equal(summaryTotal, manifest.totals.dbOnlyProfileCount);
  assert.equal(summaryTotal, reportRows);
  const verified = runVerifier(fixture, run);
  assert.equal(verified.status, 0, verified.stderr);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('otherwise identical DuckDB NULL and FALSE background inputs produce distinct raw audit summaries', () => {
  const nullBuild = buildFixture({ dbOnlyBackground: null });
  const falseBuild = buildFixture({ dbOnlyBackground: false });
  assert.equal(nullBuild.result.status, 0, nullBuild.result.stderr);
  assert.equal(falseBuild.result.status, 0, falseBuild.result.stderr);
  const readSummary = ({ run }) => JSON.parse(
    readFileSync(path.join(run, 'source-manifest.json'), 'utf8'),
  ).dbOnlyAuditSummary;
  const nullSummary = readSummary(nullBuild);
  const falseSummary = readSummary(falseBuild);
  assert.deepEqual(nullSummary, [
    { pdbId: '1ABC', authChain: 'A', techFilter: 'Mystery-seq', isBackgroundChannel: null, count: 1 },
  ]);
  assert.deepEqual(falseSummary, [
    { pdbId: '1ABC', authChain: 'A', techFilter: 'Mystery-seq', isBackgroundChannel: false, count: 1 },
  ]);
  assert.notDeepEqual(nullSummary, falseSummary);
  assert.equal(runVerifier(nullBuild.fixture, nullBuild.run).status, 0);
  assert.equal(runVerifier(falseBuild.fixture, falseBuild.run).status, 0);
  rmSync(nullBuild.fixture.root, { recursive: true, force: true });
  rmSync(falseBuild.fixture.root, { recursive: true, force: true });
});

test('manifest records strict UTC build bounds and bounded per-chain execution', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(path.join(run, 'source-manifest.json'), 'utf8'));
  const started = validateIsoUtcInstant(manifest.buildStartedAt, 'buildStartedAt');
  const projectionCompleted = validateIsoUtcInstant(manifest.projectionCompletedAt, 'projectionCompletedAt');
  const finalized = validateIsoUtcInstant(manifest.finalizedAt, 'finalizedAt');
  assert.ok(projectionCompleted >= started);
  assert.ok(finalized >= projectionCompleted);
  assert.equal(Object.hasOwn(manifest, 'buildCompletedAt'), false);
  assert.equal(manifest.execution.maxBufferedChains, 1);
  assert.ok(manifest.execution.maxExtractorStdoutBytes < 256 * 1024 * 1024);
  assert.equal(
    manifest.execution.maxDbOnlyAuditSummaryBytes,
    techniqueLib.MAX_DB_ONLY_AUDIT_SUMMARY_BYTES,
  );
  assert.equal(manifest.execution.maxSourceManifestBytes, techniqueLib.MAX_SOURCE_MANIFEST_BYTES);
  assert.equal(
    manifest.execution.maxProfileIndexBytes,
    techniqueLib.MAX_PROFILE_INDEX_BYTES,
    'the same ceiling bounds compressed capture and decompressed profile-index JSON',
  );
  rmSync(fixture.root, { recursive: true, force: true });
});

test('--all uses the same one-chain bounded build and independent verification path', () => {
  const fixture = tempFixture();
  const selections = [...'ABCDEFGHI'].map((authChain) => ({ pdbId: '1ABC', authChain }));
  for (const selection of selections) {
    writeProfileIndex(fixture.caseRoot, selection.pdbId, selection.authChain, [
      { profile_id: `profile-${selection.authChain}` },
    ]);
  }
  createManyChainDuckDb(fixture.db, selections);
  const result = runBuilderAll(fixture);
  assert.equal(result.status, 0, result.stderr);
  const run = path.join(fixture.outParent, FULL_RUN_ID);
  const manifest = JSON.parse(readFileSync(path.join(run, 'source-manifest.json'), 'utf8'));
  assert.equal(manifest.totals.chainCount, selections.length);
  assert.equal(manifest.execution.maxBufferedChains, 1);
  assert.ok(manifest.totals.chainCount * manifest.execution.maxExtractorStdoutBytes > 256 * 1024 * 1024);
  const verified = runVerifier(fixture, run);
  assert.equal(verified.status, 0, verified.stderr);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier owns an independent read-only DuckDB query instead of calling the production extractor', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const wrapper = path.join(fixture.root, 'reject-production-extractor.py');
  const rejectMarker = path.join(fixture.root, 'reject-production-extractor.enabled');
  writeFileSync(wrapper, String.raw`#!${PYTHON}
import os
import sys
args = sys.argv[1:]
if os.path.exists(${JSON.stringify(rejectMarker)}) and args and os.path.basename(args[0]) == "extract-case-public-techniques.py":
    print("error: verifier called production extractor", file=sys.stderr)
    raise SystemExit(97)
os.execv(${JSON.stringify(PYTHON)}, [${JSON.stringify(PYTHON)}, *args])
`);
  chmodSync(wrapper, 0o755);
  const result = runBuilder(fixture, RUN_ID, [], wrapper);
  assert.equal(result.status, 0, result.stderr);
  writeFileSync(rejectMarker, 'enabled\n');
  const run = path.join(fixture.outParent, RUN_ID);
  const before = fileFingerprint(fixture.db);
  const verified = runVerifier(fixture, run, wrapper);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(fileFingerprint(fixture.db), before);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('atomic publisher refuses to replace a final directory created during the build window', () => {
  const fixture = tempFixture();
  const partial = path.join(fixture.outParent, `.${RUN_ID}.partial`);
  const final = path.join(fixture.outParent, RUN_ID);
  mkdirSync(partial);
  writeFileSync(path.join(partial, 'partial-marker'), 'partial\n');
  mkdirSync(final);
  writeFileSync(path.join(final, 'final-marker'), 'final\n');

  assert.throws(
    () => publishDirectoryNoReplace({ partialPath: partial, finalPath: final, python: PYTHON }),
    /publish|exist|replace/i,
  );
  assert.equal(readFileSync(path.join(final, 'final-marker'), 'utf8'), 'final\n');
  assert.equal(readFileSync(path.join(partial, 'partial-marker'), 'utf8'), 'partial\n');
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder rejects existing final or partial runs and invalid run ids', () => {
  for (const existingName of [RUN_ID, `.${RUN_ID}.partial`]) {
    const fixture = tempFixture();
    writeProfileIndex(fixture.caseRoot);
    createDuckDb(fixture.db);
    mkdirSync(path.join(fixture.outParent, existingName));
    const result = runBuilder(fixture);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already exists/i);
    rmSync(fixture.root, { recursive: true, force: true });
  }
  for (const runId of [
    `pilot-20260828-${GIT12}`,
    'pilot-20260828T123456Z-ABCDEF012345',
    `pilot-20269999T999999Z-${GIT12}`,
    '../escape',
  ]) {
    const fixture = tempFixture();
    writeProfileIndex(fixture.caseRoot);
    createDuckDb(fixture.db);
    const result = runBuilder(fixture, runId);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /run-id/i);
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('builder rejects a run-id whose git12 is not current HEAD before creating partial', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const mismatchedRunId = `pilot-20260828T123456Z-${BAD_GIT12}`;
  const result = runBuilder(fixture, mismatchedRunId);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /run-id.*git|git.*run-id|HEAD/i);
  assert.equal(existsSync(path.join(fixture.outParent, `.${mismatchedRunId}.partial`)), false);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder rejects a 12-hex ref shadow that does not prefix current HEAD', () => {
  const { repo, commit } = createTask4FixtureRepo('case-public-ref-shadow-builder-');
  const shadow = 'aaaaaaaaaaaa';
  assert.equal(commit.startsWith(shadow), false);
  execFileSync('git', ['branch', shadow, commit], { cwd: repo });
  const fixture = {
    db: path.join(repo, 'entry.duckdb'),
    caseRoot: path.join(repo, 'cases'),
    outParent: path.join(repo, 'out'),
  };
  mkdirSync(fixture.caseRoot);
  mkdirSync(fixture.outParent);
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const runId = `pilot-20260828T123456Z-${shadow}`;
  const result = spawnSync(process.execPath, [
    'scripts/build-case-public-techniques.mjs',
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--out-parent', fixture.outParent,
    '--run-id', runId,
    '--python', PYTHON,
    '--case', '1ABC/A',
  ], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /run-id|prefix|git12|HEAD/i);
  assert.equal(existsSync(path.join(fixture.outParent, `.${runId}.partial`)), false);
  assert.equal(existsSync(path.join(fixture.outParent, runId)), false);
  rmSync(repo, { recursive: true, force: true });
});

test('verifier rejects a 12-hex ref shadow that does not prefix recorded commit', () => {
  const { repo, commit } = createTask4FixtureRepo('case-public-ref-shadow-verifier-');
  const shadow = 'aaaaaaaaaaaa';
  assert.equal(commit.startsWith(shadow), false);
  execFileSync('git', ['branch', shadow, commit], { cwd: repo });
  const fixture = {
    db: path.join(repo, 'entry.duckdb'),
    caseRoot: path.join(repo, 'cases'),
    outParent: path.join(repo, 'out'),
  };
  mkdirSync(fixture.caseRoot);
  mkdirSync(fixture.outParent);
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  const validRunId = `pilot-20260828T123456Z-${commit.slice(0, 12)}`;
  const built = spawnSync(process.execPath, [
    'scripts/build-case-public-techniques.mjs',
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--out-parent', fixture.outParent,
    '--run-id', validRunId,
    '--python', PYTHON,
    '--case', '1ABC/A',
  ], { cwd: repo, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const validRun = path.join(fixture.outParent, validRunId);
  const shadowRunId = `pilot-20260828T123456Z-${shadow}`;
  const shadowRun = path.join(fixture.outParent, shadowRunId);
  renameSync(validRun, shadowRun);
  const manifestPath = path.join(shadowRun, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.runId = shadowRunId;
  manifest.commands.builder[manifest.commands.builder.indexOf('--run-id') + 1] = shadowRunId;
  writeFileSync(manifestPath, deterministicJson(manifest));
  const coveragePath = path.join(shadowRun, 'reports/coverage.json');
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  coverage.runId = shadowRunId;
  writeFileSync(coveragePath, deterministicJson(coverage));
  writeFileSync(path.join(shadowRun, 'reports/sha256.txt'), sha256Manifest(shadowRun));
  const verified = spawnSync(process.execPath, [
    'scripts/verify-case-public-techniques.mjs',
    '--run', shadowRun,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--python', PYTHON,
  ], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /run-id|prefix|git12|gitCommit/i);
  rmSync(repo, { recursive: true, force: true });
});

test('builder fails before partial creation when a selected profile index is missing', () => {
  const fixture = tempFixture();
  createDuckDb(fixture.db);
  const result = runBuilder(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /profile-index/i);
  assert.throws(() => statSync(path.join(fixture.outParent, `.${RUN_ID}.partial`)));
  rmSync(fixture.root, { recursive: true, force: true });
});

test('builder retains a diagnostic partial and does not mutate inputs after a DB duplicate', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db, { duplicate: true });
  const indexPath = path.join(fixture.caseRoot, '1ABC/chains/A/profiles/profile-index.json.gz');
  const dbBefore = fileFingerprint(fixture.db);
  const indexBefore = fileFingerprint(indexPath);
  const result = runBuilder(fixture);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate/i);
  const partial = path.join(fixture.outParent, `.${RUN_ID}.partial`);
  assert.equal(statSync(partial).isDirectory(), true);
  assert.equal(existsSync(path.join(ROOT, `.database-snapshot-${RUN_ID}`)), false);
  assert.deepEqual(fileFingerprint(fixture.db), dbBefore);
  assert.deepEqual(fileFingerprint(indexPath), indexBefore);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('strict CLI argument parsing rejects unknown, duplicate, and mutually exclusive selection flags', () => {
  const fixture = tempFixture();
  writeProfileIndex(fixture.caseRoot);
  createDuckDb(fixture.db);
  for (const extraArgs of [['--wat'], ['--db', fixture.db], ['--all'], ['--case', '1ABC/A']]) {
    const result = runBuilder(fixture, RUN_ID, extraArgs);
    assert.notEqual(result.status, 0);
  }
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier catches a background-to-missing sidecar tamper', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const sidecarPath = path.join(run, 'data/entry-cases/cases/1ABC/chains/A/profiles/profile-public-techniques.json.gz');
  const sidecar = JSON.parse(gunzipSync(readFileSync(sidecarPath)));
  sidecar.profiles[0].classificationStatus = 'missing';
  writeFileSync(sidecarPath, deterministicGzip(sidecar));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /sidecar|sha256/i);
  assert.equal(
    readdirSync(ROOT).some((name) => name.startsWith('.database-snapshot-verify-')),
    false,
  );
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier catches a gzip-header-only tamper even when the SHA-256 list is refreshed', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const sidecarPath = path.join(run, 'data/entry-cases/cases/1ABC/chains/A/profiles/profile-public-techniques.json.gz');
  const bytes = readFileSync(sidecarPath);
  bytes[9] = bytes[9] === 3 ? 255 : 3;
  writeFileSync(sidecarPath, bytes);
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /gzip|sidecar/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier catches a deleted DB-only report row', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const report = path.join(run, 'reports/db-only-profiles.tsv');
  writeFileSync(report, readFileSync(report, 'utf8').split('\n')[0] + '\n');
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /db-only|sha256/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier independently rejects a schema-valid DB-only raw background NULL-to-FALSE tamper', () => {
  const { fixture, result, run } = buildFixture({ auditVariants: true });
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const auditRow = manifest.dbOnlyAuditSummary.at(-1);
  assert.equal(auditRow.techFilter, 'Mystery-seq');
  assert.equal(auditRow.isBackgroundChannel, null);
  auditRow.isBackgroundChannel = false;
  assert.doesNotThrow(() => techniqueLib.validateDbOnlyAuditSummary(
    manifest.dbOnlyAuditSummary,
    manifest.selection,
  ));
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /Source manifest DB-only audit summary differs from independent DuckDB projection/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier rejects an oversized source manifest before JSON parsing', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  truncateSync(manifestPath, techniqueLib.MAX_SOURCE_MANIFEST_BYTES + 1);
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /source-manifest\.json/i);
  assert.match(verified.stderr, /exceeds 67108864 bytes after reading 0 bytes/i);
  assert.doesNotMatch(verified.stderr, /invalid JSON/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier rejects tampered manifest execution capacity declarations', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const original = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const field of ['maxDbOnlyAuditSummaryBytes', 'maxSourceManifestBytes', 'maxProfileIndexBytes']) {
    const manifest = structuredClone(original);
    manifest.execution[field] = 1;
    writeFileSync(manifestPath, deterministicJson(manifest));
    writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
    const verified = runVerifier(fixture, run);
    assert.notEqual(verified.status, 0);
    assert.match(verified.stderr, new RegExp(`execution.*${field}`, 'i'));
  }
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier independently rejects malformed or tampered DB-only audit summary data', () => {
  const { fixture, result, run } = buildFixture({ auditVariants: true });
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const original = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const mutations = [
    (manifest) => { delete manifest.dbOnlyAuditSummary; },
    (manifest) => { manifest.dbOnlyAuditSummary[0].count += 1; },
    (manifest) => { manifest.dbOnlyAuditSummary.at(-1).techFilter = 'Changed-raw-label'; },
    (manifest) => { manifest.dbOnlyAuditSummary.reverse(); },
    (manifest) => { manifest.dbOnlyAuditSummary[0].internalFamily = 'forbidden'; },
    (manifest) => { manifest.dbOnlyAuditSummary.push(structuredClone(manifest.dbOnlyAuditSummary[0])); },
  ];
  for (const mutate of mutations) {
    const manifest = structuredClone(original);
    mutate(manifest);
    writeFileSync(manifestPath, deterministicJson(manifest));
    writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
    const verified = runVerifier(fixture, run);
    assert.notEqual(verified.status, 0);
    assert.match(verified.stderr, /DB-only|audit|manifest|summary/i);
  }
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier explicitly rejects obsolete v1 source manifests', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.schemaVersion = 'case-public-techniques-source-manifest.v1';
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /schemaVersion|source manifest|v1/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier catches forged manifest provenance even when the SHA-256 list is refreshed', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.gitCommit = '0'.repeat(40);
  manifest.commands = { builder: ['forged'], extractor: ['forged'] };
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /manifest|commit|command/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier binds the run-id git12 suffix to the recorded manifest commit', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.gitCommit = `${BAD_GIT12}${'0'.repeat(28)}`;
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /run-id.*gitCommit|gitCommit.*run-id|suffix/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier rejects a forged full commit tail even when git12 and refreshed SHA list match', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const manifestPath = path.join(run, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const alternateTail = manifest.gitCommit.slice(12) === 'f'.repeat(28) ? 'e'.repeat(28) : 'f'.repeat(28);
  manifest.gitCommit = `${GIT12}${alternateTail}`;
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /commit|object|resolve|provenance/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier rejects a subset forged as --all when case-root contains another profile index', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  writeProfileIndex(fixture.caseRoot, '2DEF', 'B', [{ profile_id: 'extra-profile' }]);
  const manifestPath = path.join(run, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.selectionMode = 'all';
  manifest.commands.builder = manifest.commands.builder.slice(0, -2).concat('--all');
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(run, 'reports/sha256.txt'), sha256Manifest(run));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /all|selection|inventory/i);
  rmSync(fixture.root, { recursive: true, force: true });
});

test('verifier catches an altered unmapped label', () => {
  const { fixture, result, run } = buildFixture();
  assert.equal(result.status, 0, result.stderr);
  const report = path.join(run, 'reports/unmapped-techniques.tsv');
  const original = readFileSync(report, 'utf8');
  assert.match(original, /Mystery-seq/);
  writeFileSync(report, original.replace('Mystery-seq', 'Changed-seq'));
  const verified = runVerifier(fixture, run);
  assert.notEqual(verified.status, 0);
  assert.match(verified.stderr, /unmapped|sha256/i);
  rmSync(fixture.root, { recursive: true, force: true });
});
