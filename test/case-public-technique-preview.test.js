import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

import * as previewBuilder from '../scripts/build-case-public-techniques-preview.mjs';
import * as techniqueLib from '../scripts/case-public-techniques-lib.mjs';
import {
  committedPreviewGlobalAssets,
  deterministicJson,
  sha256Manifest,
} from '../scripts/case-public-techniques-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_BUILDER = path.join(ROOT, 'scripts', 'build-case-public-techniques-preview.mjs');
const VERIFIER = path.join(ROOT, 'scripts', 'verify-case-public-techniques.mjs');
const PRODUCTION_DB = '/Volumes/tianyi/foldbridge_1D_pool/entry_rollup/entry_atlas.duckdb';
const PRODUCTION_CASE_ROOT = '/Volumes/tianyi/Server/public/entry-cases/cases';
const SEALED_V2_PYTHON = '/Users/joseperezmartinez/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const SEALED_V2_RUNS = [
  '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/pilot-20260828T160812Z-f53fbdb138d2',
  '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/pilot-20260828T160947Z-f53fbdb138d2',
];
const PYTHON_CANDIDATES = [
  process.env.CASE_PUBLIC_TECHNIQUES_TEST_PYTHON,
  SEALED_V2_PYTHON,
  process.env.HOME && path.join(process.env.HOME, 'miniforge3', 'bin', 'python'),
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3',
  '/usr/bin/python3',
].filter(Boolean);
const PYTHON = PYTHON_CANDIDATES.find((candidate) => (
  existsSync(candidate)
  && spawnSync(candidate, ['-c', 'import duckdb'], { stdio: 'ignore' }).status === 0
));
if (!PYTHON) throw new Error('A Python interpreter with DuckDB is required for preview builder tests');

const PREVIEW_RUNTIME_GLOBAL_FILES = [
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
const TEST_GIT_MAX_BUFFER = 64 * 1024 * 1024;

test('preview runtime closure is the exact static Case dependency set', () => {
  assert.deepEqual(techniqueLib.PREVIEW_GLOBAL_FILES, PREVIEW_RUNTIME_GLOBAL_FILES);
  const siteNav = readFileSync(path.join(ROOT, 'public', 'entry-cases', '__entry_v3_site__', 'site-nav.js'), 'utf8');
  assert.match(siteNav, /from '\.\.\/\.\.\/\.\.\/src\/portalChrome\.js'/);
  assert.match(siteNav, /from '\.\.\/\.\.\/\.\.\/src\/siteChrome\.js'/);
  const siteChrome = readFileSync(path.join(ROOT, 'src', 'siteChrome.js'), 'utf8');
  assert.match(siteChrome, /from '\.\/statsDashboard\.js'/);
  const workbench = readFileSync(path.join(ROOT, 'public', 'entry-cases', '__entry_v3_site__', 'workbench.js'), 'utf8');
  assert.match(workbench, /new URL\("\.\.\/\.\.\/\.\.\/src\/assets\/generated\/pdb-primary-citations\/index\.json", import\.meta\.url\)/);
  const portalChrome = readFileSync(path.join(ROOT, 'src', 'portalChrome.js'), 'utf8');
  for (const icon of ['aboutus.svg', 'database.svg', 'gznl2.svg', 'home.svg', 'research.svg']) {
    assert.equal(portalChrome.includes(`icon: '${icon}'`), true, icon);
  }
});

test('complete pilot preview builder is present', () => {
  assert.equal(
    existsSync(PREVIEW_BUILDER),
    true,
    'Task 9 requires scripts/build-case-public-techniques-preview.mjs',
  );
});

test('verifier replays committed taxonomy for both sealed v2 Task 5 runs', (testContext) => {
  for (const run of SEALED_V2_RUNS) {
    const verified = spawnSync(process.execPath, [
      VERIFIER,
      '--run', run,
      '--db', PRODUCTION_DB,
      '--case-root', PRODUCTION_CASE_ROOT,
      '--python', SEALED_V2_PYTHON,
    ], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(verified.status, 0, `${path.basename(run)}: ${verified.stderr}`);
  }

  const tamperParent = mkdtempSync(path.join('/tmp', 'sealed-v2-taxonomy-tamper-'));
  testContext.after(() => rmSync(tamperParent, { recursive: true, force: true }));
  const tamperedRun = path.join(tamperParent, path.basename(SEALED_V2_RUNS[0]));
  cpSync(SEALED_V2_RUNS[0], tamperedRun, { recursive: true, errorOnExist: true });
  const manifestPath = path.join(tamperedRun, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.taxonomySnapshotSha256 = '0'.repeat(64);
  const outParentIndex = manifest.commands.builder.indexOf('--out-parent');
  assert.notEqual(outParentIndex, -1);
  manifest.commands.builder[outParentIndex + 1] = tamperParent;
  writeFileSync(manifestPath, deterministicJson(manifest));
  writeFileSync(path.join(tamperedRun, 'reports', 'sha256.txt'), sha256Manifest(tamperedRun));
  const rejected = spawnSync(process.execPath, [
    VERIFIER,
    '--run', tamperedRun,
    '--db', PRODUCTION_DB,
    '--case-root', PRODUCTION_CASE_ROOT,
    '--python', SEALED_V2_PYTHON,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /taxonomy snapshot hash does not match committed taxonomy/i);
});

test('preflight rejects occupied targets, anchor drift, selection drift, and missing baseline sidecars before writing', async (testContext) => {
  const fixture = createPreviewFixture(testContext);
  const fixtureBuilder = await importFixtureModule(fixture, 'scripts/build-case-public-techniques-preview.mjs');

  mkdirSync(fixture.finalRun);
  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, { baselineAnchor: fixture.baselineAnchor }),
    /Final run already exists/,
  );
  rmSync(fixture.finalRun, { recursive: true });
  assert.equal(existsSync(fixture.partialRun), false);

  mkdirSync(fixture.partialRun);
  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, { baselineAnchor: fixture.baselineAnchor }),
    /Partial run already exists/,
  );
  rmSync(fixture.partialRun, { recursive: true });

  symlinkSync(path.join(fixture.root, 'missing-target'), fixture.partialRun);
  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, { baselineAnchor: fixture.baselineAnchor }),
    /Partial run already exists/,
  );
  rmSync(fixture.partialRun);

  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, {
      baselineAnchor: { ...fixture.baselineAnchor, sha256: '0'.repeat(64) },
    }),
    /external anchor drifted/,
  );
  assert.equal(existsSync(fixture.partialRun), false);

  const selectionDriftArgs = [...fixture.args];
  const firstCase = selectionDriftArgs.indexOf('--case');
  selectionDriftArgs.splice(firstCase, 2);
  await assert.rejects(
    fixtureBuilder.buildPreviewRun(selectionDriftArgs, { baselineAnchor: fixture.baselineAnchor }),
    /exactly match.*baseline selection/i,
  );
  assert.equal(existsSync(fixture.partialRun), false);

  rmSync(path.join(
    fixture.baselineRun,
    'data', 'entry-cases', 'cases', '9WNR', 'chains', 'A', 'profiles',
    'profile-public-techniques.json.gz',
  ));
  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, { baselineAnchor: fixture.baselineAnchor }),
    /layout|missing|sidecar/i,
  );
  assert.equal(existsSync(fixture.partialRun), false);
});

test('a post-partial extractor failure preserves diagnostics and never publishes final', async (testContext) => {
  const fixture = createPreviewFixture(testContext, { gatedExtractor: true });
  const fixtureBuilder = await importFixtureModule(fixture, 'scripts/build-case-public-techniques-preview.mjs');
  const baselineBefore = treeFingerprint(fixture.baselineRun);
  const caseBefore = treeFingerprint(fixture.caseRoot);
  const repoBefore = treeFingerprint(fixture.repo);
  writeFileSync(fixture.extractorFailureMarker, 'fail\n');

  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, { baselineAnchor: fixture.baselineAnchor }),
    /extractor failed|intentional extractor failure/i,
  );
  assert.equal(existsSync(fixture.finalRun), false);
  assert.equal(existsSync(fixture.partialRun), true);
  assert.equal(existsSync(path.join(fixture.partialRun, 'reports', 'build-error.txt')), true);
  assert.equal(
    readFileSync(path.join(fixture.partialRun, 'reports', 'build-error.txt'), 'utf8'),
    'Preview build failed.\n',
  );
  assert.equal(existsSync(path.join(fixture.partialRun, 'pilot-preview')), false);
  assert.equal(treeFingerprint(fixture.baselineRun), baselineBefore);
  assert.equal(treeFingerprint(fixture.caseRoot), caseBefore);
  assert.equal(treeFingerprint(fixture.repo), repoBefore);
});

test('missing selected PDB-root direct dependency fails loudly before partial creation', async (testContext) => {
  const fixture = createPreviewFixture(testContext);
  rmSync(path.join(fixture.caseRoot, '9WNR', 'structure.cif.gz'));
  const fixtureBuilder = await importFixtureModule(fixture, 'scripts/build-case-public-techniques-preview.mjs');
  await assert.rejects(
    fixtureBuilder.buildPreviewRun(fixture.args, { baselineAnchor: fixture.baselineAnchor }),
    /structure\.cif\.gz|PDB-root direct dependency/i,
  );
  assert.equal(existsSync(fixture.finalRun), false);
  assert.equal(existsSync(fixture.partialRun), false);
});

const FIXTURE_ANCHOR = Object.freeze({
  run: '/tmp/approved-baseline',
  sha256: 'a'.repeat(64),
});

function completeArgs(overrides = {}) {
  const values = {
    '--baseline-run': FIXTURE_ANCHOR.run,
    '--db': '/tmp/entry_atlas.duckdb',
    '--case-root': '/tmp/cases',
    '--worktree-public': '/tmp/repo/public',
    '--out-parent': '/tmp/runs',
    '--run-id': 'pilot-20260828T123456Z-0123456789ab',
    '--python': '/tmp/python',
    ...overrides,
  };
  return [
    ...Object.entries(values).flat(),
    '--case', '9WNR/A',
    '--case', '9WNR/a',
  ];
}

test('preview CLI has a closed required argument surface and preserves case-sensitive identities', () => {
  assert.equal(typeof previewBuilder.parsePreviewBuilderArgs, 'function');
  const parsed = previewBuilder.parsePreviewBuilderArgs(completeArgs(), {
    baselineAnchor: FIXTURE_ANCHOR,
    expectedWorktreePublic: '/tmp/repo/public',
  });
  assert.deepEqual(parsed.cases, [
    { pdbId: '9WNR', authChain: 'A' },
    { pdbId: '9WNR', authChain: 'a' },
  ]);
  assert.equal(parsed.baselineRun, FIXTURE_ANCHOR.run);
  assert.equal(parsed.runId, 'pilot-20260828T123456Z-0123456789ab');

  for (const required of [
    '--baseline-run', '--db', '--case-root', '--worktree-public', '--out-parent', '--run-id', '--python',
  ]) {
    const args = completeArgs();
    const index = args.indexOf(required);
    args.splice(index, 2);
    assert.throws(
      () => previewBuilder.parsePreviewBuilderArgs(args, {
        baselineAnchor: FIXTURE_ANCHOR,
        expectedWorktreePublic: '/tmp/repo/public',
      }),
      new RegExp(`Missing required argument ${required}`),
    );
  }
  assert.throws(
    () => previewBuilder.parsePreviewBuilderArgs([...completeArgs(), '--unknown', 'x'], {
      baselineAnchor: FIXTURE_ANCHOR,
      expectedWorktreePublic: '/tmp/repo/public',
    }),
    /Unknown argument/,
  );
});

test('preview CLI rejects duplicate, malformed, mismatched, and non-pilot identities', () => {
  const options = { baselineAnchor: FIXTURE_ANCHOR, expectedWorktreePublic: '/tmp/repo/public' };
  assert.throws(
    () => previewBuilder.parsePreviewBuilderArgs([...completeArgs(), '--case', '9WNR/A'], options),
    /Duplicate --case identity 9WNR\/A/,
  );
  assert.throws(
    () => previewBuilder.parsePreviewBuilderArgs(completeArgs({ '--baseline-run': '/tmp/not-approved' }), options),
    /approved immutable baseline/,
  );
  assert.throws(
    () => previewBuilder.parsePreviewBuilderArgs(completeArgs({ '--worktree-public': '/tmp/other-public' }), options),
    /worktree-public.*repository public root/i,
  );
  assert.throws(
    () => previewBuilder.parsePreviewBuilderArgs(completeArgs({ '--run-id': 'full-20260828T123456Z-0123456789ab' }), options),
    /run-id must match pilot/,
  );
  const malformed = completeArgs();
  malformed.splice(malformed.indexOf('--case') + 1, 1, '9WNR');
  assert.throws(() => previewBuilder.parsePreviewBuilderArgs(malformed, options), /PDB\/auth/);
});

test('production baseline anchor is fixed and exposes no CLI hash override', () => {
  assert.deepEqual(previewBuilder.APPROVED_BASELINE_ANCHOR, {
    run: '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/pilot-20260828T160812Z-f53fbdb138d2',
    sha256: 'c0e5c91055d49c1503944551fb198e45fa07153862e1f0a9634692d1d136a65e',
  });
  assert.throws(
    () => previewBuilder.parsePreviewBuilderArgs([...completeArgs(), '--baseline-sha256', 'b'.repeat(64)], {
      baselineAnchor: FIXTURE_ANCHOR,
      expectedWorktreePublic: '/tmp/repo/public',
    }),
    /Unknown argument.*baseline-sha256/,
  );
});

test('verifier owns every v3 truth constant independently of builder and shared library', () => {
  const source = readFileSync(VERIFIER, 'utf8');
  for (const declaration of [
    "VERIFIER_APPROVED_PREVIEW_BASELINE_RUN = '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828/runs/pilot-20260828T160812Z-f53fbdb138d2'",
    "VERIFIER_APPROVED_PREVIEW_BASELINE_SHA256 = 'c0e5c91055d49c1503944551fb198e45fa07153862e1f0a9634692d1d136a65e'",
    "VERIFIER_PREVIEW_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v3'",
    "VERIFIER_PREVIEW_PROVENANCE_SCHEMA = 'case-public-techniques-preview.v2'",
    "VERIFIER_PREVIEW_BUILDER_VERSION = 'case-public-techniques-preview-builder.v2'",
    "VERIFIER_PREVIEW_ARTIFACT_KIND = 'pilot-preview'",
    'VERIFIER_MAX_PREVIEW_FILE_BYTES = 64 * 1024 * 1024',
    'VERIFIER_MAX_PREVIEW_MANIFEST_BYTES = 64 * 1024 * 1024',
  ]) assert.match(source, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const sharedImport = source.match(/import \{([\s\S]*?)\} from '\.\/case-public-techniques-lib\.mjs';/)?.[1] || '';
  for (const sharedTruth of [
    'APPROVED_PREVIEW_BASELINE_ANCHOR',
    'PREVIEW_SOURCE_MANIFEST_SCHEMA',
    'PREVIEW_PROVENANCE_SCHEMA',
    'PREVIEW_BUILDER_VERSION',
    'PREVIEW_ARTIFACT_KIND',
    'PREVIEW_GLOBAL_FILES',
    'MAX_PREVIEW_FILE_BYTES',
    'MAX_PREVIEW_MANIFEST_BYTES',
  ]) assert.doesNotMatch(sharedImport, new RegExp(`\\b${sharedTruth}\\b`));
  assert.match(source, /const VERIFIER_PREVIEW_GLOBAL_FILES = \[/);
  for (const relativePath of PREVIEW_RUNTIME_GLOBAL_FILES) {
    assert.match(source, new RegExp(`'${relativePath.replaceAll('/', '\\/')}'`));
  }
});

const PREVIEW_REPO_FILES = [
  'package.json',
  'scripts/build-case-public-techniques-preview.mjs',
  'scripts/build-case-public-techniques.mjs',
  'scripts/case-public-techniques-lib.mjs',
  'scripts/extract-case-public-techniques.py',
  'scripts/safe-openat-capture.py',
  'scripts/verify-case-public-techniques.mjs',
  'scripts/version-ef-entry-assets.mjs',
  'src/techniqueFilterModel.js',
  ...PREVIEW_RUNTIME_GLOBAL_FILES,
];

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function committedRuntimeAsset(repo, commit, repositoryPath) {
  const tree = execFileSync('git', [
    '--no-replace-objects', '-C', realpathSync(repo),
    'ls-tree', '-z', '--full-tree', commit, '--', repositoryPath,
  ], { maxBuffer: TEST_GIT_MAX_BUFFER });
  const line = tree.toString('utf8').replace(/\0$/, '');
  const tab = line.indexOf('\t');
  assert.notEqual(tab, -1, repositoryPath);
  const [mode, type, blob] = line.slice(0, tab).split(' ');
  assert.equal(type, 'blob', repositoryPath);
  assert.equal(line.slice(tab + 1), repositoryPath);
  const bytes = execFileSync('git', [
    '--no-replace-objects', '-C', realpathSync(repo),
    'cat-file', 'blob', blob,
  ], { maxBuffer: TEST_GIT_MAX_BUFFER });
  return {
    path: repositoryPath,
    mode,
    blob,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function createGitProvenanceFixture(testContext, prefix) {
  const repo = mkdtempSync(path.join('/tmp', prefix));
  testContext.after(() => rmSync(repo, { recursive: true, force: true }));
  for (const directory of ['__entry_v3_site__', '__entry_ef_site__']) {
    const asset = path.join(repo, 'public', 'entry-cases', directory, 'asset.txt');
    mkdirSync(path.dirname(asset), { recursive: true });
    writeFileSync(asset, `original:${directory}\n`);
  }
  for (const relativePath of PREVIEW_RUNTIME_GLOBAL_FILES) {
    const asset = path.join(repo, ...relativePath.split('/'));
    mkdirSync(path.dirname(asset), { recursive: true });
    writeFileSync(asset, `original:${relativePath}\n`);
  }
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Git Provenance Test'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'git-provenance@example.invalid'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'original tree'], { cwd: repo });
  const originalCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const expected = committedPreviewGlobalAssets({ repoRoot: repo, commit: originalCommit });
  for (const directory of ['__entry_v3_site__', '__entry_ef_site__']) {
    writeFileSync(path.join(repo, 'public', 'entry-cases', directory, 'asset.txt'), `replacement:${directory}\n`);
  }
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'replacement tree'], { cwd: repo });
  const replacementCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  return { repo, originalCommit, replacementCommit, expected };
}

test('Git provenance ignores real replace refs', (testContext) => {
  const fixture = createGitProvenanceFixture(testContext, 'case-preview-git-replace-');
  execFileSync('git', ['replace', fixture.originalCommit, fixture.replacementCommit], { cwd: fixture.repo });
  assert.deepEqual(
    committedPreviewGlobalAssets({ repoRoot: fixture.repo, commit: fixture.originalCommit }),
    fixture.expected,
  );
});

test('Git provenance ignores inherited GIT_DIR and GIT_WORK_TREE', (testContext) => {
  const target = createGitProvenanceFixture(testContext, 'case-preview-git-target-');
  const outside = createGitProvenanceFixture(testContext, 'case-preview-git-outside-');
  const previousGitDir = process.env.GIT_DIR;
  const previousGitWorkTree = process.env.GIT_WORK_TREE;
  process.env.GIT_DIR = path.join(outside.repo, '.git');
  process.env.GIT_WORK_TREE = outside.repo;
  try {
    assert.deepEqual(
      committedPreviewGlobalAssets({ repoRoot: target.repo, commit: target.originalCommit }),
      target.expected,
    );
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
    if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = previousGitWorkTree;
  }
});

test('every production Git call is routed through the hardened no-replace runner', () => {
  for (const relative of [
    'scripts/build-case-public-techniques.mjs',
    'scripts/build-case-public-techniques-preview.mjs',
    'scripts/verify-case-public-techniques.mjs',
  ]) {
    assert.doesNotMatch(readFileSync(path.join(ROOT, relative), 'utf8'), /spawnSync\(['"]git['"]/);
  }
  const shared = readFileSync(path.join(ROOT, 'scripts', 'case-public-techniques-lib.mjs'), 'utf8');
  assert.match(shared, /Object\.entries\(process\.env\)\.filter\(\(\[name\]\) => !name\.startsWith\('GIT_'\)\)/);
  assert.match(shared, /env\.GIT_NO_REPLACE_OBJECTS = '1'/);
  assert.match(shared, /spawnSync\('git', \['--no-replace-objects', '-C', canonicalRepo, \.\.\.args\]/);
});

function treeFingerprint(root) {
  const program = String.raw`
import hashlib, os, pathlib, stat, sys
root = pathlib.Path(sys.argv[1])
items = []
for item in sorted(root.rglob('*'), key=lambda value: os.fsencode(str(value.relative_to(root)))):
  info = item.lstat()
  if stat.S_ISREG(info.st_mode):
    digest = hashlib.sha256(item.read_bytes()).hexdigest()
    kind = 'file'
  elif stat.S_ISDIR(info.st_mode):
    digest = '-'
    kind = 'directory'
  elif stat.S_ISLNK(info.st_mode):
    digest = os.readlink(item)
    kind = 'symlink'
  else:
    digest = '-'
    kind = 'other'
  items.append((str(item.relative_to(root)), kind, info.st_mode, info.st_size, info.st_mtime_ns, digest))
print(repr(items))
`;
  return execFileSync(PYTHON, ['-c', program, root], { encoding: 'utf8' });
}

function writeProfileIndex(caseRoot, pdbId, authChain, profiles) {
  const profileDir = path.join(caseRoot, pdbId, 'chains', authChain, 'profiles');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    path.join(profileDir, 'profile-index.json.gz'),
    gzipSync(`${JSON.stringify({ profile_count: profiles.length, profiles })}\n`),
  );
  writeFileSync(path.join(caseRoot, pdbId, 'chains', authChain, 'index.html'), `${pdbId}/${authChain}\n`);
  writeFileSync(
    path.join(caseRoot, pdbId, 'chains', authChain, 'linked-view.json.gz'),
    gzipSync(`${JSON.stringify({ pdbId, authChain })}\n`),
  );
}

function createFixtureDuckDb(db) {
  const program = String.raw`
import duckdb, sys
con = duckdb.connect(sys.argv[1])
con.execute("CREATE TABLE chain (pdb_id VARCHAR, auth VARCHAR, chain_key VARCHAR)")
con.execute("CREATE TABLE profile (pdb_id VARCHAR, chain_key VARCHAR, profile_key VARCHAR, tech_filter VARCHAR, is_background_channel BOOLEAN)")
con.executemany("INSERT INTO chain VALUES (?, ?, ?)", [
  ('9WNR', 'A', '9WNR|A'),
  ('9WNR', 'a', '9WNR|a'),
])
con.executemany("INSERT INTO profile VALUES (?, ?, ?, ?, ?)", [
  ('9WNR', '9WNR|A', 'upper-profile', 'DMS', False),
  ('9WNR', '9WNR|A', 'upper-db-only', 'SHAPE', False),
  ('9WNR', '9WNR|a', 'lower-profile', 'SHAPE-MaP', False),
  ('9WNR', '9WNR|a', 'lower-background', None, True),
])
con.close()
`;
  execFileSync(PYTHON, ['-c', program, db]);
}

function createPreviewFixture(testContext, { gatedExtractor = false, taxonomyDriftAfterBaseline = false } = {}) {
  const caseSensitiveRoot = process.env.CASE_PUBLIC_TECHNIQUES_CASE_SENSITIVE_TEST_ROOT
    || '/Volumes/tianyi/foldbridge_staging/case-public-taxonomy-20260828';
  const root = realpathSync(mkdtempSync(path.join(caseSensitiveRoot, '.case-public-preview-test-')));
  testContext.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  const caseRoot = path.join(root, 'cases');
  const outParent = path.join(root, 'runs');
  const db = path.join(root, 'entry_atlas.duckdb');
  mkdirSync(repo, { recursive: true });
  mkdirSync(caseRoot, { recursive: true });
  mkdirSync(outParent, { recursive: true });

  for (const relative of PREVIEW_REPO_FILES) {
    const destination = path.join(repo, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path.join(ROOT, relative)));
  }
  for (const directory of ['__entry_v3_site__', '__entry_ef_site__']) {
    cpSync(
      path.join(ROOT, 'public', 'entry-cases', directory),
      path.join(repo, 'public', 'entry-cases', directory),
      { recursive: true, errorOnExist: true },
    );
  }
  const nestedGlobal = path.join(repo, 'public', 'entry-cases', '__entry_v3_site__', 'nested', 'deeper', 'committed.txt');
  mkdirSync(path.dirname(nestedGlobal), { recursive: true });
  writeFileSync(nestedGlobal, 'nested committed preview asset\n');
  writeFileSync(path.join(repo, 'src', 'not-preview-runtime.txt'), 'must not be copied with the fixed runtime closure\n');
  const excludedRdat = path.join(repo, 'src', 'assets', 'data', 'rmdb-puzzle', 'must-not-copy.rdat');
  mkdirSync(path.dirname(excludedRdat), { recursive: true });
  writeFileSync(excludedRdat, 'raw RDAT remains an external/API-backed optional panel\n');
  execFileSync(process.execPath, ['scripts/version-ef-entry-assets.mjs', 'public'], { cwd: repo });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Preview Test'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'preview@example.invalid'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  writeProfileIndex(caseRoot, '9WNR', 'A', [
    { profile_id: 'upper-profile', pair_id: 'upper-pair' },
  ]);
  writeProfileIndex(caseRoot, '9WNR', 'a', [
    { profile_id: 'lower-profile', pair_id: 'lower-pair' },
    { profile_id: 'lower-background', pair_id: 'lower-background-pair' },
  ]);
  mkdirSync(path.join(caseRoot, '9WNR', 'chains', 'B'), { recursive: true });
  writeFileSync(path.join(caseRoot, '9WNR', 'chains', 'B', 'not-selected.txt'), 'must not be copied\n');
  writeFileSync(
    path.join(caseRoot, '9WNR', 'browser-manifest.json'),
    deterministicJson({
      chains: {
        A: { chainId: 'A', chainRoot: 'chains/A' },
        a: { chainId: 'a', chainRoot: 'chains/a', structurePath: 'chains/a/structure.cif.gz' },
        B: { chainId: 'B', chainRoot: 'chains/B' },
      },
      commonAssets: { structure: 'structure.cif.gz' },
    }),
  );
  writeFileSync(path.join(caseRoot, '9WNR', 'structure.cif.gz'), gzipSync('data_fixture\n#\n'));
  writeFileSync(path.join(caseRoot, '9WNR', 'chains', 'a', 'structure.cif.gz'), gzipSync('data_fixture_a\n#\n'));
  writeFileSync(path.join(caseRoot, '9WNR', 'unrelated-root.txt'), 'must not be copied\n');
  createFixtureDuckDb(db);

  const canonicalPython = realpathSync(PYTHON);
  const pythonLink = path.join(root, 'python3');
  symlinkSync(canonicalPython, pythonLink);
  let python = pythonLink;
  let extractorFailureMarker = null;
  if (gatedExtractor) {
    extractorFailureMarker = path.join(root, 'fail-extractor.marker');
    const wrapper = path.join(root, 'python-wrapper');
    writeFileSync(wrapper, `#!${canonicalPython}\nimport os, sys\nmarker = ${JSON.stringify(extractorFailureMarker)}\nif os.path.exists(marker) and len(sys.argv) > 1 and os.path.basename(sys.argv[1]) == 'extract-case-public-techniques.py':\n    sys.stderr.write('intentional extractor failure')\n    raise SystemExit(47)\nos.execv(${JSON.stringify(canonicalPython)}, [${JSON.stringify(canonicalPython)}, *sys.argv[1:]])\n`);
    chmodSync(wrapper, 0o755);
    python = wrapper;
  }

  const baselineRunId = `pilot-20260828T120000Z-${commit.slice(0, 12)}`;
  const selectionArgs = ['--case', '9WNR/A', '--case', '9WNR/a'];
  const baselineArgs = [
    '--db', db,
    '--case-root', caseRoot,
    '--out-parent', outParent,
    '--run-id', baselineRunId,
    '--python', python,
    ...selectionArgs,
  ];
  const baselineProgram = `
import { buildRun } from ${JSON.stringify(pathToFileURL(path.join(repo, 'scripts', 'build-case-public-techniques.mjs')).href)};
await buildRun(JSON.parse(process.argv[1]), { legacyDataOnlyV2: true });
`;
  const baselineResult = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval', baselineProgram,
    JSON.stringify(baselineArgs),
  ], { cwd: repo, encoding: 'utf8' });
  assert.equal(baselineResult.status, 0, baselineResult.stderr || baselineResult.stdout);
  const baselineRun = path.join(outParent, baselineRunId);
  const baselineAnchor = {
    run: baselineRun,
    sha256: sha256File(path.join(baselineRun, 'reports', 'sha256.txt')),
  };
  if (taxonomyDriftAfterBaseline) {
    const classifierPath = path.join(repo, 'src', 'techniqueFilterModel.js');
    const classifier = readFileSync(classifierPath, 'utf8');
    const drifted = classifier.replace("label: 'DMS-based methods'", "label: 'Drifted DMS-based methods'");
    assert.notEqual(drifted, classifier);
    writeFileSync(classifierPath, drifted);
    execFileSync('git', ['add', 'src/techniqueFilterModel.js'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'drift current taxonomy'], { cwd: repo });
  }
  const runId = `pilot-20260828T120100Z-${commit.slice(0, 12)}`;
  const args = [
    '--baseline-run', baselineRun,
    '--db', db,
    '--case-root', caseRoot,
    '--worktree-public', path.join(repo, 'public'),
    '--out-parent', outParent,
    '--run-id', runId,
    '--python', python,
    ...selectionArgs,
  ];
  return {
    root, repo, caseRoot, outParent, db, commit, baselineRun, baselineAnchor, runId, args, python,
    extractorFailureMarker,
    finalRun: path.join(outParent, runId),
    partialRun: path.join(outParent, `.${runId}.partial`),
  };
}

async function importFixtureModule(fixture, relativePath) {
  return import(`${new URL(`file://${path.join(fixture.repo, relativePath)}`).href}?t=${Date.now()}-${Math.random()}`);
}

test('verifier replays sidecar classification from the recorded commit after current taxonomy drift', async (testContext) => {
  const fixture = createPreviewFixture(testContext, { taxonomyDriftAfterBaseline: true });
  const fixtureVerifier = await importFixtureModule(fixture, 'scripts/verify-case-public-techniques.mjs');
  await fixtureVerifier.verifyRun([
    '--run', fixture.baselineRun,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--python', fixture.python,
  ], { baselineAnchor: fixture.baselineAnchor });
});

test('builder rebuilds data, assembles exact selected preview, verifies v3, and never mutates inputs', async (testContext) => {
  assert.equal(typeof previewBuilder.buildPreviewRun, 'function');
  const fixture = createPreviewFixture(testContext);
  const baselineBefore = treeFingerprint(fixture.baselineRun);
  const dbBefore = treeFingerprint(path.dirname(fixture.db));
  const caseBefore = treeFingerprint(fixture.caseRoot);
  const worktreeBefore = treeFingerprint(fixture.repo);
  const fixtureBuilder = await importFixtureModule(fixture, 'scripts/build-case-public-techniques-preview.mjs');

  const result = await fixtureBuilder.buildPreviewRun(fixture.args, {
    baselineAnchor: fixture.baselineAnchor,
  });
  assert.equal(result.run, fixture.finalRun);
  assert.equal(existsSync(fixture.finalRun), true);
  assert.equal(existsSync(fixture.partialRun), false);
  assert.equal(treeFingerprint(fixture.baselineRun), baselineBefore);
  assert.equal(treeFingerprint(fixture.caseRoot), caseBefore);
  assert.equal(treeFingerprint(fixture.repo), worktreeBefore);
  // The DB lives beside staging in this fixture, so compare its own stable file record explicitly.
  assert.equal(statSync(fixture.db).size > 0, true);
  assert.equal(dbBefore.includes(sha256File(fixture.db)), true);

  const previewRoot = path.join(fixture.finalRun, 'pilot-preview', 'entry-cases');
  assert.equal(existsSync(path.join(previewRoot, '__entry_v3_site__', 'workbench.js')), true);
  assert.equal(existsSync(path.join(previewRoot, '__entry_ef_site__', 'ef-heatmap.js')), true);
  assert.equal(existsSync(path.join(previewRoot, 'cases', '9WNR', 'chains', 'A', 'index.html')), true);
  assert.equal(existsSync(path.join(previewRoot, 'cases', '9WNR', 'chains', 'a', 'index.html')), true);
  assert.equal(existsSync(path.join(previewRoot, 'cases', '9WNR', 'chains', 'B')), false);
  assert.equal(existsSync(path.join(previewRoot, 'cases', '9WNR', 'browser-manifest.json')), true);
  assert.equal(existsSync(path.join(previewRoot, 'cases', '9WNR', 'structure.cif.gz')), true);
  assert.equal(existsSync(path.join(previewRoot, 'cases', '9WNR', 'unrelated-root.txt')), false);
  const directManifestUrl = new URL('../../browser-manifest.json', 'https://preview.test/entry-cases/cases/9WNR/chains/A/index.html');
  assert.equal(directManifestUrl.pathname, '/entry-cases/cases/9WNR/browser-manifest.json');
  const copiedBrowserManifest = JSON.parse(readFileSync(
    path.join(previewRoot, directManifestUrl.pathname.slice('/entry-cases/'.length)),
    'utf8',
  ));
  assert.equal(
    existsSync(path.join(previewRoot, 'cases', '9WNR', copiedBrowserManifest.commonAssets.structure)),
    true,
  );

  for (const authChain of ['A', 'a']) {
    const relative = path.join('entry-cases', 'cases', '9WNR', 'chains', authChain, 'profiles', 'profile-public-techniques.json.gz');
    const dataBytes = readFileSync(path.join(fixture.finalRun, 'data', relative));
    const previewBytes = readFileSync(path.join(fixture.finalRun, 'pilot-preview', relative));
    assert.deepEqual(previewBytes, dataBytes);
    const payload = JSON.parse(gunzipSync(previewBytes));
    assert.equal(payload.authChain, authChain);
  }

  const manifest = JSON.parse(readFileSync(path.join(fixture.finalRun, 'source-manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 'case-public-techniques-source-manifest.v3');
  assert.equal(manifest.artifactKind, 'pilot-preview');
  assert.equal(manifest.preview.caseSources.length, 2);
  assert.equal(manifest.preview.pdbSources.length, 1);
  assert.deepEqual(manifest.preview.pdbSources[0].files.map(({ path: relative }) => relative), [
    'browser-manifest.json',
    'structure.cif.gz',
  ]);
  assert.equal(manifest.preview.inventory.files.length > 0, true);
  assert.equal(manifest.preview.globalAssets.length > 0, true);
  const previewPortalRoot = path.join(fixture.finalRun, 'pilot-preview');
  const runtimeUrls = [
    new URL('../../../src/assets/generated/pdb-primary-citations/index.json', 'https://preview.test/entry-cases/__entry_v3_site__/workbench.js'),
    new URL('../../../src/portalChrome.js', 'https://preview.test/entry-cases/__entry_v3_site__/site-nav.js'),
    new URL('../../../src/siteChrome.js', 'https://preview.test/entry-cases/__entry_v3_site__/site-nav.js'),
    new URL('./statsDashboard.js', 'https://preview.test/src/siteChrome.js'),
    ...['aboutus.svg', 'database.svg', 'gznl2.svg', 'home.svg', 'research.svg']
      .map((icon) => new URL(`/src/assets/header/${icon}`, 'https://preview.test/')),
  ];
  assert.deepEqual(
    runtimeUrls.map((url) => url.pathname.slice(1)).sort(),
    PREVIEW_RUNTIME_GLOBAL_FILES,
  );
  for (const relativePath of PREVIEW_RUNTIME_GLOBAL_FILES) {
    const copiedPath = path.join(previewPortalRoot, ...relativePath.split('/'));
    assert.equal(existsSync(copiedPath), true, `missing direct runtime URL /${relativePath}`);
    assert.deepEqual(readFileSync(copiedPath), readFileSync(path.join(fixture.repo, relativePath)));
    const expectedAsset = committedRuntimeAsset(fixture.repo, fixture.commit, relativePath);
    assert.deepEqual(
      manifest.preview.globalAssets.find((asset) => asset.path === relativePath),
      expectedAsset,
      `Git provenance ${relativePath}`,
    );
    assert.deepEqual(
      manifest.preview.inventory.files.find((asset) => asset.path === relativePath),
      { path: relativePath, size: expectedAsset.size, sha256: expectedAsset.sha256 },
      `preview inventory ${relativePath}`,
    );
    assert.equal(statSync(copiedPath).mode & 0o777, Number.parseInt(expectedAsset.mode, 8) & 0o777);
  }
  assert.equal(existsSync(path.join(previewPortalRoot, 'src', 'not-preview-runtime.txt')), false);
  assert.equal(existsSync(path.join(previewPortalRoot, 'src', 'assets', 'data', 'rmdb-puzzle')), false);
  assert.equal(
    manifest.preview.globalAssets.some((asset) => asset.path.startsWith('src/assets/data/rmdb-puzzle/')),
    false,
  );
  assert.equal(manifest.builderVersion, 'case-public-techniques-preview-builder.v2');
  assert.equal(manifest.preview.schemaVersion, 'case-public-techniques-preview.v2');
  assert.deepEqual(manifest.preview.globalFiles, PREVIEW_RUNTIME_GLOBAL_FILES);

  const fixtureVerifier = await importFixtureModule(fixture, 'scripts/verify-case-public-techniques.mjs');
  const verifierArgs = [
    '--run', fixture.finalRun,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--python', realpathSync(PYTHON),
  ];
  await fixtureVerifier.verifyRun(verifierArgs, { baselineAnchor: fixture.baselineAnchor });
  const replacementAsset = path.join(
    fixture.repo,
    'public', 'entry-cases', '__entry_v3_site__', 'workbench.js',
  );
  writeFileSync(replacementAsset, `${readFileSync(replacementAsset, 'utf8')}\n// replacement-ref attack\n`);
  execFileSync('git', ['add', 'public/entry-cases/__entry_v3_site__/workbench.js'], { cwd: fixture.repo });
  execFileSync('git', ['commit', '-qm', 'replacement-ref attack tree'], { cwd: fixture.repo });
  const replacementCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: fixture.repo, encoding: 'utf8' }).trim();
  execFileSync('git', ['replace', fixture.commit, replacementCommit], { cwd: fixture.repo });
  await fixtureVerifier.verifyRun(verifierArgs, { baselineAnchor: fixture.baselineAnchor });
  const finalBefore = treeFingerprint(fixture.finalRun);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(treeFingerprint(fixture.finalRun), finalBefore, 'final rename must be the last write');

  // The same current verifier must retain the strict v2 data-only branch.
  await fixtureVerifier.verifyRun([
    '--run', fixture.baselineRun,
    '--db', fixture.db,
    '--case-root', fixture.caseRoot,
    '--python', realpathSync(PYTHON),
  ], { baselineAnchor: fixture.baselineAnchor });

  const tamperCases = [
    {
      name: 'artifact kind',
      pattern: /artifactKind/,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.artifactKind = 'data-only';
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'preview inventory hash',
      pattern: /inventory/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.preview.inventory.files[0].sha256 = '0'.repeat(64);
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'committed global provenance',
      pattern: /globalAssets|Git blobs/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.preview.globalAssets[0].sha256 = '0'.repeat(64);
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'root runtime Git provenance',
      pattern: /globalAssets|Git blobs/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        const asset = value.preview.globalAssets.find((item) => item.path === 'src/portalChrome.js');
        assert.ok(asset);
        asset.blob = '0'.repeat(asset.blob.length);
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'citation index Git provenance',
      pattern: /globalAssets|Git blobs/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        const asset = value.preview.globalAssets.find((item) => item.path === 'src/assets/generated/pdb-primary-citations/index.json');
        assert.ok(asset);
        asset.sha256 = '0'.repeat(64);
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'case-source identity',
      pattern: /caseSources|identity/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.preview.caseSources[0].authChain = 'a';
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'PDB-root source provenance',
      pattern: /pdbSources|PDB-root/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.preview.pdbSources[0].files[0].record.sha256 = '0'.repeat(64);
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'missing PDB-root direct dependency',
      pattern: /inventory|PDB-root|missing/i,
      mutate(run) {
        rmSync(path.join(run, 'pilot-preview', 'entry-cases', 'cases', '9WNR', 'browser-manifest.json'));
      },
    },
    {
      name: 'baseline provenance',
      pattern: /baseline source manifest hash/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.baseline.sourceManifestSha256 = '0'.repeat(64);
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'baseline selection subset',
      pattern: /approved baseline selection/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.selection.pop();
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'baseline selection order',
      pattern: /approved baseline selection/i,
      mutate(run) {
        const file = path.join(run, 'source-manifest.json');
        const value = JSON.parse(readFileSync(file, 'utf8'));
        value.selection.reverse();
        writeFileSync(file, deterministicJson(value));
      },
    },
    {
      name: 'extra preview file',
      pattern: /inventory|missing, extra|unexpected/i,
      mutate(run) {
        writeFileSync(path.join(run, 'pilot-preview', 'entry-cases', 'extra.txt'), 'extra\n');
      },
    },
    {
      name: 'extra root runtime file',
      pattern: /inventory|missing, extra|unexpected/i,
      mutate(run) {
        writeFileSync(path.join(run, 'pilot-preview', 'src', 'extra.js'), 'extra\n');
      },
    },
    {
      name: 'missing root runtime dependency',
      pattern: /inventory|missing, extra|required entry/i,
      mutate(run) {
        rmSync(path.join(run, 'pilot-preview', 'src', 'portalChrome.js'));
      },
    },
    {
      name: 'tampered root runtime bytes',
      pattern: /inventory|source-divergent/i,
      mutate(run) {
        writeFileSync(path.join(run, 'pilot-preview', 'src', 'siteChrome.js'), 'tampered\n');
      },
    },
    {
      name: 'missing citation index',
      pattern: /inventory|missing, extra|required entry/i,
      mutate(run) {
        rmSync(path.join(run, 'pilot-preview', 'src', 'assets', 'generated', 'pdb-primary-citations', 'index.json'));
      },
    },
    {
      name: 'tampered citation index',
      pattern: /inventory|source-divergent/i,
      mutate(run) {
        writeFileSync(path.join(run, 'pilot-preview', 'src', 'assets', 'generated', 'pdb-primary-citations', 'index.json'), '{}\n');
      },
    },
    {
      name: 'missing preview file',
      pattern: /inventory|missing, extra|required entry/i,
      mutate(run) {
        rmSync(path.join(run, 'pilot-preview', 'entry-cases', '__entry_v3_site__', 'workbench.js'));
      },
    },
    {
      name: 'tampered preview bytes',
      pattern: /inventory|source-divergent/i,
      mutate(run) {
        writeFileSync(path.join(run, 'pilot-preview', 'entry-cases', '__entry_v3_site__', 'workbench.js'), 'tampered\n');
      },
    },
    {
      name: 'tampered global mode',
      pattern: /mode differs/i,
      mutate(run) {
        chmodSync(path.join(run, 'pilot-preview', 'entry-cases', '__entry_v3_site__', 'workbench.js'), 0o755);
      },
    },
    {
      name: 'tampered root runtime mode',
      pattern: /mode differs/i,
      mutate(run) {
        chmodSync(path.join(run, 'pilot-preview', 'src', 'portalChrome.js'), 0o755);
      },
    },
    {
      name: 'tampered citation index mode',
      pattern: /mode differs/i,
      mutate(run) {
        chmodSync(path.join(run, 'pilot-preview', 'src', 'assets', 'generated', 'pdb-primary-citations', 'index.json'), 0o755);
      },
    },
    {
      name: 'tampered complete SHA manifest',
      pattern: /SHA-256 manifest/i,
      mutate(run) {
        writeFileSync(path.join(run, 'reports', 'sha256.txt'), '0'.repeat(64) + '  source-manifest.json\n');
      },
    },
  ];
  for (const [index, tamper] of tamperCases.entries()) {
    const parent = path.join(fixture.root, `tamper-${index}`);
    const clonedRun = path.join(parent, fixture.runId);
    mkdirSync(parent);
    cpSync(fixture.finalRun, clonedRun, { recursive: true, errorOnExist: true });
    const clonedManifestPath = path.join(clonedRun, 'source-manifest.json');
    const clonedManifest = JSON.parse(readFileSync(clonedManifestPath, 'utf8'));
    const outParentIndex = clonedManifest.commands.previewBuilder.indexOf('--out-parent');
    assert.notEqual(outParentIndex, -1);
    clonedManifest.commands.previewBuilder[outParentIndex + 1] = parent;
    writeFileSync(clonedManifestPath, deterministicJson(clonedManifest));
    tamper.mutate(clonedRun);
    await assert.rejects(
      fixtureVerifier.verifyRun([
        '--run', clonedRun,
        '--db', fixture.db,
        '--case-root', fixture.caseRoot,
        '--python', realpathSync(PYTHON),
      ], { baselineAnchor: fixture.baselineAnchor }),
      tamper.pattern,
      tamper.name,
    );
  }

  // The verifier must keep replaying its own frozen v3 contract even when the
  // builder-side shared constants drift in the current worktree.
  const sharedLibraryPath = path.join(fixture.repo, 'scripts', 'case-public-techniques-lib.mjs');
  let sharedLibrary = readFileSync(sharedLibraryPath, 'utf8');
  for (const [before, after] of [
    [
      "export const PREVIEW_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.v3';",
      "export const PREVIEW_SOURCE_MANIFEST_SCHEMA = 'case-public-techniques-source-manifest.evil';",
    ],
    [
      "export const PREVIEW_PROVENANCE_SCHEMA = 'case-public-techniques-preview.v2';",
      "export const PREVIEW_PROVENANCE_SCHEMA = 'case-public-techniques-preview.evil';",
    ],
    [
      "export const PREVIEW_BUILDER_VERSION = 'case-public-techniques-preview-builder.v2';",
      "export const PREVIEW_BUILDER_VERSION = 'case-public-techniques-preview-builder.evil';",
    ],
    [
      "export const PREVIEW_ARTIFACT_KIND = 'pilot-preview';",
      "export const PREVIEW_ARTIFACT_KIND = 'forged-preview';",
    ],
    [
      "export const PREVIEW_GLOBAL_FILES = Object.freeze([\n  'src/assets/generated/pdb-primary-citations/index.json',\n  'src/assets/header/aboutus.svg',\n  'src/assets/header/database.svg',\n  'src/assets/header/gznl2.svg',\n  'src/assets/header/home.svg',\n  'src/assets/header/research.svg',\n  'src/portalChrome.js',\n  'src/siteChrome.js',\n  'src/statsDashboard.js',\n]);",
      "export const PREVIEW_GLOBAL_FILES = Object.freeze(['src/forged-runtime.js']);",
    ],
    [
      'export const MAX_PREVIEW_FILE_BYTES = 64 * 1024 * 1024;',
      'export const MAX_PREVIEW_FILE_BYTES = 63 * 1024 * 1024;',
    ],
    [
      'export const MAX_PREVIEW_MANIFEST_BYTES = 64 * 1024 * 1024;',
      'export const MAX_PREVIEW_MANIFEST_BYTES = 63 * 1024 * 1024;',
    ],
  ]) {
    assert.match(sharedLibrary, new RegExp(before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    sharedLibrary = sharedLibrary.replace(before, after);
  }
  writeFileSync(sharedLibraryPath, sharedLibrary);
  const freshVerifierRunner = path.join(fixture.root, 'fresh-v3-verifier.mjs');
  writeFileSync(freshVerifierRunner, `
import { verifyRun } from ${JSON.stringify(new URL(`file://${path.join(fixture.repo, 'scripts', 'verify-case-public-techniques.mjs')}`).href)};
const [run, db, caseRoot, python, anchorJson] = process.argv.slice(2);
try {
  await verifyRun(['--run', run, '--db', db, '--case-root', caseRoot, '--python', python], {
    baselineAnchor: JSON.parse(anchorJson),
  });
} catch (error) {
  process.stderr.write(String(error?.stack || error) + '\\n');
  process.exitCode = 1;
}
`);
  const verifyFresh = (run) => spawnSync(process.execPath, [
    freshVerifierRunner,
    run,
    fixture.db,
    fixture.caseRoot,
    realpathSync(PYTHON),
    JSON.stringify(fixture.baselineAnchor),
  ], { cwd: fixture.repo, encoding: 'utf8' });
  const stableV3 = verifyFresh(fixture.finalRun);
  assert.equal(stableV3.status, 0, stableV3.stderr);

  const forgedParent = path.join(fixture.root, 'forged-builder-truth');
  const forgedRun = path.join(forgedParent, fixture.runId);
  mkdirSync(forgedParent);
  cpSync(fixture.finalRun, forgedRun, { recursive: true, errorOnExist: true });
  const forgedManifestPath = path.join(forgedRun, 'source-manifest.json');
  const forgedManifest = JSON.parse(readFileSync(forgedManifestPath, 'utf8'));
  const forgedOutParentIndex = forgedManifest.commands.previewBuilder.indexOf('--out-parent');
  forgedManifest.commands.previewBuilder[forgedOutParentIndex + 1] = forgedParent;
  forgedManifest.schemaVersion = 'case-public-techniques-source-manifest.evil';
  forgedManifest.builderVersion = 'case-public-techniques-preview-builder.evil';
  forgedManifest.artifactKind = 'forged-preview';
  forgedManifest.preview.schemaVersion = 'case-public-techniques-preview.evil';
  forgedManifest.execution.maxPreviewFileBytes = 63 * 1024 * 1024;
  forgedManifest.execution.maxPreviewManifestBytes = 63 * 1024 * 1024;
  writeFileSync(forgedManifestPath, deterministicJson(forgedManifest));
  writeFileSync(path.join(forgedRun, 'reports', 'sha256.txt'), sha256Manifest(forgedRun));
  const rejectedForged = verifyFresh(forgedRun);
  assert.notEqual(rejectedForged.status, 0);
  assert.match(rejectedForged.stderr, /schemaVersion|builderVersion|artifactKind|byte limit/i);
});
