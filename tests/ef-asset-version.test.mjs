import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EF_ASSET_VERSION,
  VERSIONED_ASSETS,
  versionedAssetName,
  versionEfEntryAssets,
} from "../scripts/version-ef-entry-assets.mjs";

const CLASSIFIER_ASSET = "technique-filter-model.mjs";
const EXPECTED_EF_ASSET_VERSION = "20260913-reviewer-d36-1";
const PREVIOUS_EF_ASSET_VERSION = "20260913-reviewer-d34-1";
const WORKBENCH_IMPORT_ASSETS = [
  CLASSIFIER_ASSET,
  "workbench-pure.mjs",
  "ef-workbench-shell.mjs",
  "residue-linkage.mjs",
  "residue-rail.mjs",
];
const WORKBENCH_DYNAMIC_ASSETS = ["ef-heatmap-core.js", "ef-heatmap.js", "ef-case.js"];
const TASK9_REFRESH_ASSETS = [
  ["__entry_v3_site__", "workbench.css"],
  ["__entry_v3_site__", "workbench.js"],
  ["__entry_v3_site__", "workbench-pure.mjs"],
  ["__entry_v3_site__", "ef-workbench-shell.mjs"],
  ["__entry_ef_site__", "ef-heatmap.js"],
  ["__entry_ef_site__", "ef-case.js"],
];
const VERSION_SCRIPT = new URL("../scripts/version-ef-entry-assets.mjs", import.meta.url);

test("the fingerprinted Workbench pure module exports the Case view router used by production", async () => {
  const fingerprintedPure = await import(
    `../public/entry-cases/__entry_v3_site__/${versionedAssetName("workbench-pure.mjs")}`
  );
  assert.equal(typeof fingerprintedPure.resolveCaseViewMode, "function");
});

test("checked-in classifier source, mirror, and fingerprint share the real F-payload MAP alias", async () => {
  const sourceUrl = new URL("../src/techniqueFilterModel.js", import.meta.url);
  const mirrorUrl = new URL("../public/entry-cases/__entry_v3_site__/technique-filter-model.mjs", import.meta.url);
  const fingerprintUrl = new URL(
    `../public/entry-cases/__entry_v3_site__/${versionedAssetName(CLASSIFIER_ASSET)}`,
    import.meta.url,
  );
  const [sourceBytes, mirrorBytes, fingerprintBytes] = await Promise.all(
    [sourceUrl, mirrorUrl, fingerprintUrl].map((url) => fs.readFile(url)),
  );
  assert.deepEqual(mirrorBytes, sourceBytes);
  assert.deepEqual(fingerprintBytes, sourceBytes);

  for (const moduleUrl of [sourceUrl, mirrorUrl, fingerprintUrl]) {
    const classifier = await import(moduleUrl.href);
    assert.deepEqual(classifier.classifyTechniqueFilter("MAP").methods, [{
      label: "Mutate-and-map methods",
      mappingStatus: "mapped",
      categoryId: "interaction",
      categoryLabel: "RNA–RNA interaction mapping methods",
      categoryShortLabel: "RNA–RNA interaction",
    }]);
  }
});

function fixtureWorkbenchSource({ leadingImports = [], dynamicAssetVersion = EF_ASSET_VERSION } = {}) {
  return [
    ...leadingImports,
    `import { classifyTechniqueFilter, MECHANISM_FAMILIES } from "./${versionedAssetName(CLASSIFIER_ASSET)}";`,
    `import { buildCaseProfileDownloadItems } from "./${versionedAssetName("workbench-pure.mjs")}";`,
    `import { prepareEfWorkbenchShell } from "./${versionedAssetName("ef-workbench-shell.mjs")}";`,
    `import * as ResidueLinkage from "./${versionedAssetName("residue-linkage.mjs")}";`,
    `import { createResidueRail } from "./${versionedAssetName("residue-rail.mjs")}";`,
    `const EF_ASSET_VERSION = "${EF_ASSET_VERSION}";`,
    "const scripts = [",
    `  new URL('../__entry_ef_site__/ef-heatmap-core.${dynamicAssetVersion}.js', import.meta.url),`,
    `  new URL('../__entry_ef_site__/ef-heatmap.${dynamicAssetVersion}.js', import.meta.url),`,
    `  new URL('../__entry_ef_site__/ef-case.${dynamicAssetVersion}.js', import.meta.url),`,
    "];",
  ].join("\n");
}

async function makeRepoFixture({
  workbenchPure = "export function buildCaseProfileDownloadItems() {}",
  workbenchSource = fixtureWorkbenchSource(),
} = {}) {
  const repoSourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-version-"));
  const publicRoot = path.join(repoSourceRoot, "public");
  const classifierSource = Buffer.from("export const fixtureClassifier = 'source-byte-copy';\n");
  await fs.mkdir(path.join(repoSourceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(repoSourceRoot, "src", "techniqueFilterModel.js"), classifierSource);

  for (const { directory, assetName } of VERSIONED_ASSETS) {
    if (assetName === CLASSIFIER_ASSET) continue;
    const assetDir = path.join(publicRoot, "entry-cases", directory);
    await fs.mkdir(assetDir, { recursive: true });
    let source = `fixture:${directory}/${assetName}`;
    if (assetName === "workbench.js") source = workbenchSource;
    if (assetName === "workbench-pure.mjs") source = workbenchPure;
    await fs.writeFile(path.join(assetDir, assetName), source);
  }

  const caseIndexPath = path.join(
    publicRoot,
    "entry-cases",
    "cases",
    "9WNR",
    "chains",
    "a",
    "index.html",
  );
  await fs.mkdir(path.dirname(caseIndexPath), { recursive: true });
  await fs.writeFile(caseIndexPath, "per-case-index-must-not-change\n");
  return { repoSourceRoot, publicRoot, classifierSource, caseIndexPath };
}

async function snapshotTree(root) {
  const entries = [];
  async function visit(absolutePath, relativePath) {
    const stat = await fs.lstat(absolutePath, { bigint: true });
    const common = {
      path: relativePath || ".",
      mode: Number(stat.mode & 0o7777n),
      mtimeNs: stat.mtimeNs.toString(),
    };
    if (stat.isDirectory()) {
      entries.push({ ...common, type: "directory" });
      const children = await fs.readdir(absolutePath);
      children.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
      for (const child of children) {
        await visit(path.join(absolutePath, child), relativePath ? path.join(relativePath, child) : child);
      }
    } else if (stat.isFile()) {
      entries.push({
        ...common,
        type: "file",
        bytes: (await fs.readFile(absolutePath)).toString("base64"),
      });
    } else if (stat.isSymbolicLink()) {
      entries.push({ ...common, type: "symlink", target: await fs.readlink(absolutePath) });
    } else {
      entries.push({ ...common, type: "other" });
    }
  }
  await visit(root, "");
  return entries;
}

async function assertFingerprintsEqualSources(publicRoot) {
  for (const { directory, assetName } of VERSIONED_ASSETS) {
    const assetDir = path.join(publicRoot, "entry-cases", directory);
    const source = await fs.readFile(path.join(assetDir, assetName));
    const fingerprinted = await fs.readFile(path.join(assetDir, versionedAssetName(assetName)));
    assert.deepEqual(fingerprinted, source, `${assetName} fingerprint must be a byte copy`);
  }
}

function assertValidJavaScriptFixture(sourcePath) {
  const result = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `lexer adversarial fixture must be valid JavaScript:\n${result.stderr || result.stdout}`,
  );
}

test("EF versioning mirrors the classifier source and fingerprints every global asset", async () => {
  const { repoSourceRoot, publicRoot, classifierSource } = await makeRepoFixture();

  const result = await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  assert.equal(EF_ASSET_VERSION, EXPECTED_EF_ASSET_VERSION);
  assert.equal(result.version, EF_ASSET_VERSION);
  assert.equal(result.changedFiles, VERSIONED_ASSETS.length + 1, "mirror plus every fingerprint must be written");
  assert.equal(result.checkedFiles, VERSIONED_ASSETS.length + 1);

  const assetDir = path.join(publicRoot, "entry-cases", "__entry_v3_site__");
  assert.deepEqual(await fs.readFile(path.join(assetDir, CLASSIFIER_ASSET)), classifierSource);
  assert.deepEqual(await fs.readFile(path.join(assetDir, versionedAssetName(CLASSIFIER_ASSET))), classifierSource);
  await assertFingerprintsEqualSources(publicRoot);
});

test("validation failure leaves the complete public tree byte-for-byte and metadata unchanged", async () => {
  const invalidWorkbench = fixtureWorkbenchSource()
    .split("\n")
    .filter((line) => !line.includes(versionedAssetName("residue-rail.mjs")))
    .join("\n");
  const { repoSourceRoot, publicRoot } = await makeRepoFixture({ workbenchSource: invalidWorkbench });
  const before = await snapshotTree(publicRoot);

  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot }),
    new RegExp(`must import \\./${versionedAssetName("residue-rail.mjs").replaceAll(".", "\\.")}`),
  );

  assert.deepEqual(
    await snapshotTree(publicRoot),
    before,
    "complete validation must finish before mirror or fingerprint writes begin",
  );
});

test("multiline static imports are validated before any write", async () => {
  const missingTarget = `./missing.${EF_ASSET_VERSION}.mjs`;
  const multilineImport = [
    "import {",
    "  missingDependency,",
    `} from "${missingTarget}";`,
  ].join("\n");
  const { repoSourceRoot, publicRoot } = await makeRepoFixture({
    workbenchSource: fixtureWorkbenchSource({ leadingImports: [multilineImport] }),
  });
  assertValidJavaScriptFixture(
    path.join(publicRoot, "entry-cases", "__entry_v3_site__", "workbench.js"),
  );
  const before = await snapshotTree(publicRoot);

  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot }),
    /workbench import target.*missing/i,
  );
  assert.deepEqual(await snapshotTree(publicRoot), before);
});

test("regex literals and other non-static import syntax are ignored by dependency discovery", async () => {
  const nonStaticSyntax = [
    `const fakeImportPattern = /import \\{ x \\} from '.\\/not-a-module\\.${EF_ASSET_VERSION}\\.mjs'[\\/]/giu;`,
    "// import { x } from './not-a-line-comment-module.mjs';",
    "/* import { x } from './not-a-block-comment-module.mjs'; */",
    "const ordinaryString = \"import { x } from './not-a-string-module.mjs'\";",
    "const templateString = `import { x } from './not-a-template-module.mjs'`;",
    "const lazyModule = import('./not-a-dynamic-module.mjs');",
    "const currentModule = import.meta.url;",
  ];
  const { repoSourceRoot, publicRoot } = await makeRepoFixture({
    workbenchSource: fixtureWorkbenchSource({ leadingImports: nonStaticSyntax }),
  });
  assertValidJavaScriptFixture(
    path.join(publicRoot, "entry-cases", "__entry_v3_site__", "workbench.js"),
  );

  const result = await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  assert.equal(result.changedFiles, VERSIONED_ASSETS.length + 1);
  await versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true });
});

test("regex literals after control-flow heads are not static imports while ordinary parens keep division", async () => {
  const fakeImportRegex = `/import \\{ x \\} from '.\\/not-a-module\\.${EF_ASSET_VERSION}\\.mjs'/giu`;
  const controlAndDivisionSyntax = [
    `if (true) ${fakeImportRegex}.test('x');`,
    `while (false) ${fakeImportRegex}.test('x');`,
    `for (; false;) ${fakeImportRegex}.test('x');`,
    "const callRatio = Number('4') / 2;",
    "const groupedRatio = (4 + 2) / 3;",
  ];
  const { repoSourceRoot, publicRoot } = await makeRepoFixture({
    workbenchSource: fixtureWorkbenchSource({ leadingImports: controlAndDivisionSyntax }),
  });
  assertValidJavaScriptFixture(
    path.join(publicRoot, "entry-cases", "__entry_v3_site__", "workbench.js"),
  );

  const result = await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  assert.equal(result.changedFiles, VERSIONED_ASSETS.length + 1);
  await versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true });
});

test("workbench dynamic EF script URLs must use the current version before any write", async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture({
    workbenchSource: fixtureWorkbenchSource({ dynamicAssetVersion: "20260826-ef-ui-8" }),
  });
  const before = await snapshotTree(publicRoot);

  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot }),
    new RegExp(`must reference.*${versionedAssetName("ef-heatmap-core.js").replaceAll(".", "\\.")}`, "i"),
  );
  assert.deepEqual(await snapshotTree(publicRoot), before);
});

test("unsafe source, target, and parent symlinks are rejected without following them", async (t) => {
  await t.test("fingerprint target symlink cannot overwrite an outside file", async () => {
    const { repoSourceRoot, publicRoot } = await makeRepoFixture();
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-outside-"));
    const outsidePath = path.join(outsideRoot, "outside.mjs");
    const outsideBytes = Buffer.from("outside-must-stay-unchanged\n");
    await fs.writeFile(outsidePath, outsideBytes);
    const targetPath = path.join(
      publicRoot,
      "entry-cases",
      "__entry_v3_site__",
      versionedAssetName("workbench-pure.mjs"),
    );
    await fs.symlink(outsidePath, targetPath);
    const before = await snapshotTree(publicRoot);

    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /symbolic link/i,
    );
    assert.deepEqual(await fs.readFile(outsidePath), outsideBytes);
    assert.deepEqual(await snapshotTree(publicRoot), before);
  });

  await t.test("--check rejects a fingerprinted import symlink that escapes public root", async () => {
    const { repoSourceRoot, publicRoot } = await makeRepoFixture();
    await versionEfEntryAssets(publicRoot, { repoSourceRoot });
    const sourcePath = path.join(publicRoot, "entry-cases", "__entry_v3_site__", "residue-rail.mjs");
    const targetPath = path.join(
      publicRoot,
      "entry-cases",
      "__entry_v3_site__",
      versionedAssetName("residue-rail.mjs"),
    );
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-import-outside-"));
    const outsidePath = path.join(outsideRoot, "residue-rail.mjs");
    await fs.writeFile(outsidePath, await fs.readFile(sourcePath));
    await fs.unlink(targetPath);
    await fs.symlink(outsidePath, targetPath);

    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true }),
      /symbolic link/i,
    );
  });

  await t.test("repository classifier source symlink is rejected", async () => {
    const { repoSourceRoot, publicRoot, classifierSource } = await makeRepoFixture();
    const sourcePath = path.join(repoSourceRoot, "src", "techniqueFilterModel.js");
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-source-outside-"));
    const outsidePath = path.join(outsideRoot, "techniqueFilterModel.js");
    await fs.writeFile(outsidePath, classifierSource);
    await fs.unlink(sourcePath);
    await fs.symlink(outsidePath, sourcePath);

    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /symbolic link/i,
    );
  });

  await t.test("repository source intermediate directory symlink is rejected", async () => {
    const { repoSourceRoot, publicRoot } = await makeRepoFixture();
    const sourceDir = path.join(repoSourceRoot, "src");
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-source-parent-outside-"));
    const outsideSourceDir = path.join(outsideRoot, "src");
    await fs.rename(sourceDir, outsideSourceDir);
    await fs.symlink(outsideSourceDir, sourceDir);

    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /symbolic link/i,
    );
  });

  await t.test("unversioned asset symlink is rejected", async () => {
    const { repoSourceRoot, publicRoot } = await makeRepoFixture();
    const sourcePath = path.join(publicRoot, "entry-cases", "__entry_ef_site__", "ef-case.js");
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-source-outside-"));
    const outsidePath = path.join(outsideRoot, "ef-case.js");
    await fs.writeFile(outsidePath, await fs.readFile(sourcePath));
    await fs.unlink(sourcePath);
    await fs.symlink(outsidePath, sourcePath);

    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /symbolic link/i,
    );
  });

  await t.test("intermediate asset directory symlink is rejected", async () => {
    const { repoSourceRoot, publicRoot } = await makeRepoFixture();
    const assetDir = path.join(publicRoot, "entry-cases", "__entry_ef_site__");
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-parent-outside-"));
    const outsideAssetDir = path.join(outsideRoot, "__entry_ef_site__");
    await fs.rename(assetDir, outsideAssetDir);
    await fs.symlink(outsideAssetDir, assetDir);

    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /symbolic link/i,
    );
  });
});

test("non-regular unversioned sources are rejected explicitly before writes", async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  const sourcePath = path.join(publicRoot, "entry-cases", "__entry_ef_site__", "ef-case.js");
  await fs.unlink(sourcePath);
  await fs.mkdir(sourcePath);
  const before = await snapshotTree(publicRoot);

  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot }),
    /regular file/i,
  );
  assert.deepEqual(await snapshotTree(publicRoot), before);
});

test("non-regular existing fingerprint targets are rejected explicitly before writes", async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  const targetPath = path.join(
    publicRoot,
    "entry-cases",
    "__entry_v3_site__",
    versionedAssetName("workbench-pure.mjs"),
  );
  await fs.mkdir(targetPath);
  const before = await snapshotTree(publicRoot);

  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot }),
    /regular file/i,
  );
  assert.deepEqual(await snapshotTree(publicRoot), before);
});

test("atomic replacement removes its same-directory temporary file after rename failure", { concurrency: false }, async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  const failingTargetName = versionedAssetName("workbench-pure.mjs");
  const originalRename = fs.rename;
  let injected = false;
  fs.rename = async (sourcePath, targetPath) => {
    if (!injected && path.basename(targetPath) === failingTargetName) {
      injected = true;
      const error = new Error("injected atomic rename failure");
      error.code = "EIO";
      throw error;
    }
    return originalRename(sourcePath, targetPath);
  };
  try {
    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /injected atomic rename failure/,
    );
  } finally {
    fs.rename = originalRename;
  }
  assert.equal(injected, true, "test must reach the atomic rename boundary");
  const tree = await snapshotTree(publicRoot);
  assert.deepEqual(
    tree.filter((entry) => entry.path.endsWith(".tmp")),
    [],
    "failed atomic writes must not leave temporary files",
  );
});

test("a missing target that appears after preflight is never overwritten", { concurrency: false }, async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  const targetName = versionedAssetName("workbench-pure.mjs");
  const targetPath = path.join(publicRoot, "entry-cases", "__entry_v3_site__", targetName);
  const intrusion = Buffer.from("concurrent-target-must-survive\n");
  const originalOpen = fs.open;
  let injected = false;
  fs.open = async (filePath, ...args) => {
    const basename = path.basename(String(filePath));
    if (!injected && basename.startsWith(`.${targetName}.`) && basename.endsWith(".tmp")) {
      injected = true;
      const targetHandle = await originalOpen(targetPath, "wx", 0o644);
      await targetHandle.writeFile(intrusion);
      await targetHandle.close();
    }
    return originalOpen(filePath, ...args);
  };
  try {
    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /target appeared after preflight/i,
    );
  } finally {
    fs.open = originalOpen;
  }
  assert.equal(injected, true);
  assert.deepEqual(await fs.readFile(targetPath), intrusion);
});

test("an existing target replaced after preflight is never overwritten", { concurrency: false }, async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  const sourcePath = path.join(publicRoot, "entry-cases", "__entry_v3_site__", "workbench-pure.mjs");
  await fs.writeFile(sourcePath, "export function buildCaseProfileDownloadItems() { return []; }\n");
  const targetName = versionedAssetName("workbench-pure.mjs");
  const targetPath = path.join(publicRoot, "entry-cases", "__entry_v3_site__", targetName);
  const preflightBytes = await fs.readFile(targetPath);
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "foldbridge-ef-aba-"));
  const displacedTarget = path.join(outsideRoot, targetName);
  const originalOpen = fs.open;
  let injected = false;
  fs.open = async (filePath, ...args) => {
    const basename = path.basename(String(filePath));
    if (!injected && basename.startsWith(`.${targetName}.`) && basename.endsWith(".tmp")) {
      injected = true;
      await fs.rename(targetPath, displacedTarget);
      const targetHandle = await originalOpen(targetPath, "wx", 0o644);
      await targetHandle.writeFile(preflightBytes);
      await targetHandle.close();
    }
    return originalOpen(filePath, ...args);
  };
  try {
    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot }),
      /target changed after preflight/i,
    );
  } finally {
    fs.open = originalOpen;
  }
  assert.equal(injected, true);
  assert.deepEqual(await fs.readFile(targetPath), preflightBytes);
});

test("versioning contract requires an exclusive single writer", async () => {
  const source = await fs.readFile(VERSION_SCRIPT, "utf8");
  assert.match(source, /exclusive single-writer|no concurrent writers/i);
});

test("--check is idempotent and rejects mirror or fingerprint drift without repairing it", async (t) => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  const clean = await versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true });
  assert.equal(clean.changedFiles, 0);

  const assetDir = path.join(publicRoot, "entry-cases", "__entry_v3_site__");
  await t.test("source mirror drift", async () => {
    const mirrorPath = path.join(assetDir, CLASSIFIER_ASSET);
    await fs.writeFile(mirrorPath, "drifted mirror\n");
    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true }),
      /technique-filter-model\.mjs.*missing or differs/i,
    );
    assert.equal(await fs.readFile(mirrorPath, "utf8"), "drifted mirror\n", "--check must not repair drift");
    await fs.copyFile(path.join(repoSourceRoot, "src", "techniqueFilterModel.js"), mirrorPath);
  });

  await t.test("fingerprint drift", async () => {
    const fingerprintPath = path.join(assetDir, versionedAssetName("workbench-pure.mjs"));
    await fs.writeFile(fingerprintPath, "drifted fingerprint\n");
    await assert.rejects(
      versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true }),
      /workbench-pure\..*missing or differs/i,
    );
    assert.equal(
      await fs.readFile(fingerprintPath, "utf8"),
      "drifted fingerprint\n",
      "--check must not repair fingerprints",
    );
  });
});

test("--check rejects a missing target imported by workbench", async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture();
  await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  const assetDir = path.join(publicRoot, "entry-cases", "__entry_v3_site__");
  const workbenchPath = path.join(assetDir, "workbench.js");
  const workbenchFingerprintPath = path.join(assetDir, versionedAssetName("workbench.js"));
  const workbench = await fs.readFile(workbenchPath, "utf8");
  const withMissingImport = `import "./missing.${EF_ASSET_VERSION}.mjs";\n${workbench}`;
  await fs.writeFile(workbenchPath, withMissingImport);
  await fs.writeFile(workbenchFingerprintPath, withMissingImport);

  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot, check: true }),
    /workbench import target.*missing\./i,
  );
});

test("EF release rejects a stale workbench-pure dependency", async () => {
  const { repoSourceRoot, publicRoot } = await makeRepoFixture({
    workbenchPure: "export function applyTechniqueFilter() {}",
  });
  await assert.rejects(
    versionEfEntryAssets(publicRoot, { repoSourceRoot }),
    /workbench-pure\.mjs must export buildCaseProfileDownloadItems/,
  );
});

test("the versioning write set excludes per-case index files", async () => {
  assert.ok(
    VERSIONED_ASSETS.every(({ directory, assetName }) => directory !== "cases" && assetName !== "index.html"),
  );
  const { repoSourceRoot, publicRoot, caseIndexPath } = await makeRepoFixture();
  const before = await fs.readFile(caseIndexPath);
  const beforeStat = await fs.stat(caseIndexPath);
  await versionEfEntryAssets(publicRoot, { repoSourceRoot });
  assert.deepEqual(await fs.readFile(caseIndexPath), before);
  assert.equal((await fs.stat(caseIndexPath)).mtimeMs, beforeStat.mtimeMs);
});

test("CLI accepts an explicit repository source root", async () => {
  const { repoSourceRoot, publicRoot, classifierSource } = await makeRepoFixture();
  const result = spawnSync(
    process.execPath,
    [VERSION_SCRIPT.pathname, publicRoot, "--repo-root", repoSourceRoot],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    await fs.readFile(path.join(publicRoot, "entry-cases", "__entry_v3_site__", CLASSIFIER_ASSET)),
    classifierSource,
  );

  const checkResult = spawnSync(
    process.execPath,
    [VERSION_SCRIPT.pathname, publicRoot, "--repo-root", repoSourceRoot, "--check"],
    { encoding: "utf8" },
  );
  assert.equal(checkResult.status, 0, checkResult.stderr);
  assert.equal(JSON.parse(checkResult.stdout).changedFiles, 0);
});

test("checked-in repository locks the real source mirror, fingerprints, and import graph", async () => {
  const repoSourceRoot = fileURLToPath(new URL("../", import.meta.url));
  const result = await versionEfEntryAssets(path.join(repoSourceRoot, "public"), {
    check: true,
    repoSourceRoot,
  });
  assert.equal(result.checkedFiles, VERSIONED_ASSETS.length + 1);
  assert.equal(result.changedFiles, 0);
});

test("Task 9 refreshes every Task 7/8 global fingerprint and no per-case asset", async () => {
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const stale = [];
  for (const [directory, assetName] of TASK9_REFRESH_ASSETS) {
    const assetDir = path.join(publicRoot, "entry-cases", directory);
    const [sourceBytes, fingerprintBytes] = await Promise.all([
      fs.readFile(path.join(assetDir, assetName)),
      fs.readFile(path.join(assetDir, versionedAssetName(assetName))),
    ]);
    if (!sourceBytes.equals(fingerprintBytes)) stale.push(`${directory}/${assetName}`);
  }
  assert.deepEqual(stale, []);
  assert.ok(TASK9_REFRESH_ASSETS.every(([directory]) => directory !== "cases"));
});

test("Workbench imports every static dependency from the same deploy version", async () => {
  const publicRoot = new URL("../public/", import.meta.url);
  const workbench = await fs.readFile(
    new URL("entry-cases/__entry_v3_site__/workbench.js", publicRoot),
    "utf8",
  );
  const assetDir = new URL("entry-cases/__entry_v3_site__/", publicRoot);

  assert.match(workbench, new RegExp(`const EF_ASSET_VERSION = ["']${EF_ASSET_VERSION}["']`));
  for (const assetName of WORKBENCH_IMPORT_ASSETS) {
    assert.ok(
      VERSIONED_ASSETS.some(
        (asset) => asset.directory === "__entry_v3_site__" && asset.assetName === assetName,
      ),
      `${assetName} must ship in VERSIONED_ASSETS`,
    );
    const targetName = versionedAssetName(assetName);
    assert.match(workbench, new RegExp(`(?:from\\s+)?["']\\./${targetName.replaceAll(".", "\\.")}["']`));
    await fs.access(new URL(targetName, assetDir));
  }
  assert.doesNotMatch(workbench, /20260826-ef-ui-8/);
  for (const assetName of WORKBENCH_DYNAMIC_ASSETS) {
    const targetName = versionedAssetName(assetName);
    assert.match(
      workbench,
      new RegExp(`new\\s+URL\\(["']\\.\\./__entry_ef_site__/${targetName.replaceAll(".", "\\.")}["']`),
    );
    await fs.access(new URL(`../__entry_ef_site__/${targetName}`, assetDir));
  }
});

test("the current fingerprint closure has no previous-version references and retains rollback assets", async () => {
  const publicRoot = new URL("../public/entry-cases/", import.meta.url);
  const versionedNameFor = (assetName, version) => {
    const extension = path.extname(assetName);
    return `${assetName.slice(0, -extension.length)}.${version}${extension}`;
  };

  for (const { directory, assetName } of VERSIONED_ASSETS) {
    const currentName = versionedAssetName(assetName);
    const previousName = versionedNameFor(assetName, PREVIOUS_EF_ASSET_VERSION);
    const currentUrl = new URL(`${directory}/${currentName}`, publicRoot);
    const previousUrl = new URL(`${directory}/${previousName}`, publicRoot);
    const currentSource = await fs.readFile(currentUrl, "utf8");
    assert.equal(
      currentSource.includes(PREVIOUS_EF_ASSET_VERSION),
      false,
      `${currentName} cannot reach the previous fingerprint closure`,
    );
    await fs.access(previousUrl);
  }
});
