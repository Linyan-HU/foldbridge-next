import fs from "node:fs/promises";
import { constants as FS_CONSTANTS } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const EF_ASSET_VERSION = "20260913-reviewer-d36-1";
export const VERSIONING_CONCURRENCY_CONTRACT =
  "versionEfEntryAssets requires an exclusive single-writer; no concurrent writers may modify the repository source or public asset tree during a run.";

const SCRIPT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLASSIFIER_SOURCE_RELATIVE_PATH = path.join("src", "techniqueFilterModel.js");
const CLASSIFIER_ASSET = Object.freeze({
  directory: "__entry_v3_site__",
  assetName: "technique-filter-model.mjs",
});
const WORKBENCH_VERSIONED_IMPORT_ASSETS = Object.freeze([
  "technique-filter-model.mjs",
  "workbench-pure.mjs",
  "ef-workbench-shell.mjs",
  "residue-linkage.mjs",
  "residue-rail.mjs",
]);
const WORKBENCH_DYNAMIC_ASSETS = Object.freeze([
  "ef-heatmap-core.js",
  "ef-heatmap.js",
  "ef-case.js",
]);
const NO_FOLLOW = FS_CONSTANTS.O_NOFOLLOW ?? 0;

// 缓存击穿只靠全局壳子模块的版本化文件名（下表）：无版本 workbench.js 内部 import
// 这些 *.<version>.mjs/js。这是线上实际部署的机制，与 EF case 数量无关。
// per-case 的 index 版本化（旧 EF_ENTRY_ROUTES 循环）从未真正部署，且随 EF case 增长
// 会带来多链/重发维护负担，已移除——所有 case（含 EF）统一走无版本 index.html + 无版本
// family-aware 壳，新增 EF case 只需重跑数据标注，无需再跑本步骤的 per-case 部分。
export const VERSIONED_ASSETS = Object.freeze([
  { directory: "__entry_v3_site__", assetName: "case-shell.css" },
  { directory: "__entry_v3_site__", assetName: "case-shell.js" },
  { directory: "__entry_v3_site__", assetName: "workbench.css" },
  { directory: "__entry_v3_site__", assetName: "workbench.js" },
  CLASSIFIER_ASSET,
  { directory: "__entry_v3_site__", assetName: "workbench-pure.mjs" },
  { directory: "__entry_v3_site__", assetName: "ef-workbench-shell.mjs" },
  { directory: "__entry_v3_site__", assetName: "residue-linkage.mjs" },
  { directory: "__entry_v3_site__", assetName: "residue-rail.mjs" },
  { directory: "__entry_ef_site__", assetName: "ef-heatmap-core.js" },
  { directory: "__entry_ef_site__", assetName: "ef-heatmap.js" },
  { directory: "__entry_ef_site__", assetName: "ef-case.js" },
]);

export function versionedAssetName(assetName) {
  const extension = path.extname(assetName);
  return `${assetName.slice(0, -extension.length)}.${EF_ASSET_VERSION}${extension}`;
}

function assertContained(root, targetPath, label) {
  const relative = path.relative(root, targetPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes ${root}: ${targetPath}`);
  }
}

async function canonicalDirectoryRoot(inputPath, label) {
  const resolved = path.resolve(inputPath);
  const stat = await fs.lstat(resolved);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${resolved}`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory: ${resolved}`);
  return fs.realpath(resolved);
}

async function assertSafeDirectoryPath(root, directoryPath, label) {
  const resolved = path.resolve(directoryPath);
  assertContained(root, resolved, label);
  const relative = path.relative(root, resolved);
  let cursor = root;
  const segments = relative ? relative.split(path.sep) : [];
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    let stat;
    try {
      stat = await fs.lstat(cursor);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`${label} directory is missing: ${cursor}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`${label} contains a symbolic link: ${cursor}`);
    if (!stat.isDirectory()) throw new Error(`${label} must contain only directories: ${cursor}`);
  }
  const realDirectory = await fs.realpath(resolved);
  if (realDirectory !== resolved) {
    throw new Error(`${label} resolves through a symbolic link: ${resolved}`);
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileSnapshot(left, right) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.mode === right.mode;
}

function assertTargetMatchesPreflight(expected, current) {
  if (!expected.exists && current.exists) {
    throw new Error(`Fingerprint target appeared after preflight: ${expected.path}`);
  }
  if (expected.exists && !current.exists) {
    throw new Error(`Fingerprint target changed after preflight: ${expected.path}`);
  }
  if (
    expected.exists
    && (!sameFileSnapshot(expected.snapshot, current.snapshot) || !expected.bytes.equals(current.bytes))
  ) {
    throw new Error(`Fingerprint target changed after preflight: ${expected.path}`);
  }
}

async function inspectRegularFile(root, filePath, { label, optional = false } = {}) {
  const resolved = path.resolve(filePath);
  assertContained(root, resolved, label);
  await assertSafeDirectoryPath(root, path.dirname(resolved), `${label} parent`);

  let before;
  try {
    before = await fs.lstat(resolved, { bigint: true });
  } catch (error) {
    if (optional && error?.code === "ENOENT") return { exists: false, path: resolved };
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${resolved}`);
    throw error;
  }
  if (before.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link: ${resolved}`);
  if (!before.isFile()) throw new Error(`${label} must be a regular file: ${resolved}`);

  let handle;
  try {
    handle = await fs.open(resolved, FS_CONSTANTS.O_RDONLY | NO_FOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) throw new Error(`${label} must be a regular file: ${resolved}`);
    if (!sameFileIdentity(before, opened)) throw new Error(`${label} changed while it was opened: ${resolved}`);
    const bytes = await handle.readFile();
    const afterRead = await handle.stat({ bigint: true });
    const afterPath = await fs.lstat(resolved, { bigint: true });
    if (!sameFileSnapshot(opened, afterRead) || !sameFileSnapshot(opened, afterPath)) {
      throw new Error(`${label} changed while it was read: ${resolved}`);
    }
    return {
      exists: true,
      path: resolved,
      bytes,
      mode: Number(opened.mode & 0o777n),
      snapshot: opened,
    };
  } catch (error) {
    if (error?.code === "ELOOP") throw new Error(`${label} must not be a symbolic link: ${resolved}`);
    throw error;
  } finally {
    await handle?.close();
  }
}

function skipSpaceAndComments(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
    } else if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
    } else if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) throw new Error("Unterminated comment while parsing workbench imports");
      index = end + 2;
    } else {
      break;
    }
  }
  return index;
}

function readQuotedString(source, start) {
  const quote = source[start];
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      if (index + 1 >= source.length) throw new Error("Unterminated escape in workbench import");
      value += source[index + 1];
      index += 1;
    } else if (char === quote) {
      return { value, end: index + 1 };
    } else {
      value += char;
    }
  }
  throw new Error("Unterminated string while parsing workbench imports");
}

function skipTemplateLiteral(source, start) {
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === "\\") index += 1;
    else if (source[index] === "`") return index + 1;
    else if (source[index] === "$" && source[index + 1] === "{") {
      index = skipTemplateExpression(source, index + 2) - 1;
    }
  }
  throw new Error("Unterminated template literal while parsing workbench imports");
}

function skipTemplateExpression(source, start) {
  let braceDepth = 1;
  let canStartRegex = true;
  const parenContext = createParenContext();
  let index = start;
  while (index < source.length) {
    const next = skipSpaceAndComments(source, index);
    if (next >= source.length) break;
    index = next;
    const char = source[index];
    if (char === '"' || char === "'") {
      index = readQuotedString(source, index).end;
      canStartRegex = false;
      parenContext.pendingControlParen = false;
    } else if (char === "`") {
      index = skipTemplateLiteral(source, index);
      canStartRegex = false;
      parenContext.pendingControlParen = false;
    } else if (char === "/" && canStartRegex) {
      index = skipRegexLiteral(source, index);
      canStartRegex = false;
      parenContext.pendingControlParen = false;
    } else if (char === "{") {
      braceDepth += 1;
      index += 1;
      canStartRegex = true;
      parenContext.pendingControlParen = false;
    } else if (char === "}") {
      braceDepth -= 1;
      index += 1;
      if (braceDepth === 0) return index;
      canStartRegex = false;
      parenContext.pendingControlParen = false;
    } else if (/[0-9]/.test(char)) {
      index = skipNumberLiteral(source, index);
      canStartRegex = false;
      parenContext.pendingControlParen = false;
    } else if (isIdentifierStart(char)) {
      const identifier = readIdentifier(source, index);
      index = identifier.end;
      canStartRegex = identifierAllowsRegexAfter(parenContext, identifier.value, canStartRegex);
    } else {
      canStartRegex = punctuationAllowsRegexAfter(parenContext, char);
      index += 1;
    }
  }
  throw new Error("Unterminated template expression while parsing workbench imports");
}

function skipRegexLiteral(source, start) {
  let inCharacterClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      if (index + 1 >= source.length) {
        throw new Error("Unterminated escape in regular expression literal while parsing workbench imports");
      }
      index += 1;
    } else if (char === "[" && !inCharacterClass) {
      inCharacterClass = true;
    } else if (char === "]" && inCharacterClass) {
      inCharacterClass = false;
    } else if (char === "/" && !inCharacterClass) {
      let end = index + 1;
      while (isIdentifierPart(source[end])) end += 1;
      return end;
    } else if (char === "\n" || char === "\r") {
      throw new Error(
        `Unterminated regular expression literal while parsing workbench imports at offset ${start}`,
      );
    }
  }
  throw new Error(`Unterminated regular expression literal while parsing workbench imports at offset ${start}`);
}

function isIdentifierStart(char) {
  return Boolean(char && /[A-Za-z_$]/.test(char));
}

function isIdentifierPart(char) {
  return Boolean(char && /[A-Za-z0-9_$]/.test(char));
}

function readIdentifier(source, start) {
  let end = start + 1;
  while (isIdentifierPart(source[end])) end += 1;
  return { value: source.slice(start, end), end };
}

const REGEX_PREFIX_KEYWORDS = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);
const CONTROL_HEAD_KEYWORDS = new Set(["catch", "for", "if", "switch", "while", "with"]);

function skipNumberLiteral(source, start) {
  let end = start + 1;
  while (end < source.length && /[A-Za-z0-9_.]/.test(source[end])) end += 1;
  return end;
}

function createParenContext() {
  return { pendingControlParen: false, stack: [] };
}

function identifierAllowsRegexAfter(context, identifier, canStartRegexBefore) {
  context.pendingControlParen = canStartRegexBefore && CONTROL_HEAD_KEYWORDS.has(identifier);
  return context.pendingControlParen || REGEX_PREFIX_KEYWORDS.has(identifier);
}

function punctuationAllowsRegexAfter(context, char) {
  if (char === "(") {
    context.stack.push(context.pendingControlParen ? "control-head" : "expression");
    context.pendingControlParen = false;
    return true;
  }
  if (char === ")") {
    context.pendingControlParen = false;
    return context.stack.pop() === "control-head";
  }
  context.pendingControlParen = false;
  return "[{,;:?=!~+-*/%&|^<>".includes(char);
}

function relativeStaticImportSpecifiers(source) {
  const specifiers = [];
  let index = 0;
  let canStartRegex = true;
  const parenContext = createParenContext();
  while (index < source.length) {
    const next = skipSpaceAndComments(source, index);
    if (next >= source.length) break;
    index = next;
    const char = source[index];
    if (char === '"' || char === "'") {
      index = readQuotedString(source, index).end;
      canStartRegex = false;
      parenContext.pendingControlParen = false;
      continue;
    }
    if (char === "`") {
      index = skipTemplateLiteral(source, index);
      canStartRegex = false;
      parenContext.pendingControlParen = false;
      continue;
    }
    if (char === "/" && canStartRegex) {
      index = skipRegexLiteral(source, index);
      canStartRegex = false;
      parenContext.pendingControlParen = false;
      continue;
    }
    if (/[0-9]/.test(char)) {
      index = skipNumberLiteral(source, index);
      canStartRegex = false;
      parenContext.pendingControlParen = false;
      continue;
    }
    if (!isIdentifierStart(char)) {
      canStartRegex = punctuationAllowsRegexAfter(parenContext, char);
      index += 1;
      continue;
    }
    const identifier = readIdentifier(source, index);
    index = identifier.end;
    if (identifier.value !== "import") {
      canStartRegex = identifierAllowsRegexAfter(parenContext, identifier.value, canStartRegex);
      continue;
    }
    parenContext.pendingControlParen = false;

    let cursor = skipSpaceAndComments(source, identifier.end);
    if (source[cursor] === "(" || source[cursor] === ".") {
      canStartRegex = false;
      continue;
    }
    if (source[cursor] === '"' || source[cursor] === "'") {
      const imported = readQuotedString(source, cursor);
      if (imported.value.startsWith(".")) specifiers.push(imported.value);
      index = imported.end;
      canStartRegex = false;
      continue;
    }

    while (cursor < source.length) {
      cursor = skipSpaceAndComments(source, cursor);
      const tokenChar = source[cursor];
      if (tokenChar === ";" || tokenChar === undefined) {
        index = cursor + 1;
        break;
      }
      if (tokenChar === '"' || tokenChar === "'") {
        cursor = readQuotedString(source, cursor).end;
        continue;
      }
      if (tokenChar === "`") {
        cursor = skipTemplateLiteral(source, cursor);
        continue;
      }
      if (isIdentifierStart(tokenChar)) {
        const token = readIdentifier(source, cursor);
        cursor = token.end;
        if (token.value !== "from") continue;
        cursor = skipSpaceAndComments(source, cursor);
        if (source[cursor] !== '"' && source[cursor] !== "'") {
          throw new Error("Static workbench import from must be followed by a string literal");
        }
        const imported = readQuotedString(source, cursor);
        if (imported.value.startsWith(".")) specifiers.push(imported.value);
        index = imported.end;
        canStartRegex = false;
        break;
      }
      cursor += 1;
    }
  }
  return specifiers;
}

function assertWorkbenchPureContract(sourceRecord) {
  const source = sourceRecord.bytes.toString("utf8");
  if (!/export\s+function\s+buildCaseProfileDownloadItems\s*\(/.test(source)) {
    throw new Error(`${sourceRecord.path} must export buildCaseProfileDownloadItems`);
  }
}

async function assertWorkbenchImportGraph({
  publicRoot,
  entryRoot,
  workbenchRecord,
  plannedTargetPaths,
  check,
}) {
  const assetDir = path.join(entryRoot, "__entry_v3_site__");
  const workbenchSource = workbenchRecord.bytes.toString("utf8");
  const specifiers = relativeStaticImportSpecifiers(workbenchSource);

  for (const assetName of WORKBENCH_VERSIONED_IMPORT_ASSETS) {
    const requiredSpecifier = `./${versionedAssetName(assetName)}`;
    if (!specifiers.includes(requiredSpecifier)) {
      throw new Error(`${workbenchRecord.path} must import ${requiredSpecifier}`);
    }
  }

  for (const specifier of specifiers) {
    const targetPath = path.resolve(assetDir, specifier);
    assertContained(assetDir, targetPath, `Workbench import target "${specifier}"`);
    const target = await inspectRegularFile(publicRoot, targetPath, {
      label: `Workbench import target "${specifier}"`,
      optional: true,
    });
    if (!target.exists && (check || !plannedTargetPaths.has(targetPath))) {
      throw new Error(`Workbench import target "${specifier}" is missing.`);
    }
  }

  for (const assetName of WORKBENCH_DYNAMIC_ASSETS) {
    const requiredSpecifier = `../__entry_ef_site__/${versionedAssetName(assetName)}`;
    const escapedAssetStem = path.basename(assetName, path.extname(assetName)).replaceAll(".", "\\.");
    const dynamicUrlPattern = new RegExp(
      `\\bnew\\s+URL\\s*\\(\\s*(["'])(\\.\\.\\/__entry_ef_site__\\/${escapedAssetStem}\\.[^"'\\r\\n]+\\.js)\\1\\s*,\\s*import\\s*\\.\\s*meta\\s*\\.\\s*url\\s*\\)`,
      "g",
    );
    const matches = [...workbenchSource.matchAll(dynamicUrlPattern)].map((match) => match[2]);
    if (matches.length !== 1 || matches[0] !== requiredSpecifier) {
      throw new Error(`${workbenchRecord.path} must reference ${requiredSpecifier}`);
    }

    const targetPath = path.resolve(assetDir, requiredSpecifier);
    assertContained(entryRoot, targetPath, `Workbench dynamic target "${requiredSpecifier}"`);
    const target = await inspectRegularFile(publicRoot, targetPath, {
      label: `Workbench dynamic target "${requiredSpecifier}"`,
      optional: true,
    });
    if (!target.exists && (check || !plannedTargetPaths.has(targetPath))) {
      throw new Error(`Workbench dynamic target "${requiredSpecifier}" is missing.`);
    }
  }
}

function makeOperation(sourceRecord, targetRecord, targetPath) {
  return {
    sourcePath: sourceRecord.path,
    targetPath,
    bytes: sourceRecord.bytes,
    mode: sourceRecord.mode,
    target: targetRecord,
  };
}

async function buildVersionPlan(publicRootInput, repoSourceRootInput, { check }) {
  const repoSourceRoot = await canonicalDirectoryRoot(repoSourceRootInput, "Repository source root");
  const publicRoot = await canonicalDirectoryRoot(publicRootInput, "Public root");
  const entryRoot = path.join(publicRoot, "entry-cases");
  await assertSafeDirectoryPath(publicRoot, entryRoot, "Entry asset root");

  const classifierSource = await inspectRegularFile(
    repoSourceRoot,
    path.join(repoSourceRoot, CLASSIFIER_SOURCE_RELATIVE_PATH),
    { label: "Classifier source" },
  );
  const classifierMirrorPath = path.join(
    entryRoot,
    CLASSIFIER_ASSET.directory,
    CLASSIFIER_ASSET.assetName,
  );
  const classifierMirrorTarget = await inspectRegularFile(publicRoot, classifierMirrorPath, {
    label: "Classifier public mirror",
    optional: true,
  });

  const operations = [makeOperation(classifierSource, classifierMirrorTarget, classifierMirrorPath)];
  const unversionedSources = new Map();
  for (const { directory, assetName } of VERSIONED_ASSETS) {
    const assetDir = path.join(entryRoot, directory);
    const sourcePath = path.join(assetDir, assetName);
    const source = assetName === CLASSIFIER_ASSET.assetName
      ? { ...classifierSource, path: classifierMirrorPath }
      : await inspectRegularFile(publicRoot, sourcePath, { label: `Unversioned asset ${assetName}` });
    unversionedSources.set(`${directory}/${assetName}`, source);
    const targetPath = path.join(assetDir, versionedAssetName(assetName));
    const target = await inspectRegularFile(publicRoot, targetPath, {
      label: `Fingerprint target ${versionedAssetName(assetName)}`,
      optional: true,
    });
    operations.push(makeOperation(source, target, targetPath));
  }

  const targetPaths = new Set();
  for (const operation of operations) {
    if (targetPaths.has(operation.targetPath)) {
      throw new Error(`Duplicate versioning target: ${operation.targetPath}`);
    }
    targetPaths.add(operation.targetPath);
  }

  const workbenchPure = unversionedSources.get("__entry_v3_site__/workbench-pure.mjs");
  const workbench = unversionedSources.get("__entry_v3_site__/workbench.js");
  assertWorkbenchPureContract(workbenchPure);
  await assertWorkbenchImportGraph({
    publicRoot,
    entryRoot,
    workbenchRecord: workbench,
    plannedTargetPaths: targetPaths,
    check,
  });

  if (check) {
    for (const operation of operations) {
      if (!operation.target.exists || !operation.bytes.equals(operation.target.bytes)) {
        throw new Error(`${operation.targetPath} is missing or differs from ${operation.sourcePath}`);
      }
    }
  }

  return {
    publicRoot,
    operations,
    changed: operations.filter(
      (operation) => !operation.target.exists || !operation.bytes.equals(operation.target.bytes),
    ),
  };
}

async function atomicReplaceRegularFile(publicRoot, operation) {
  const parent = path.dirname(operation.targetPath);
  await assertSafeDirectoryPath(publicRoot, parent, `Fingerprint target parent for ${operation.targetPath}`);

  const temporaryPath = path.join(
    parent,
    `.${path.basename(operation.targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await fs.open(
      temporaryPath,
      FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | NO_FOLLOW,
      operation.mode,
    );
    const temporaryStat = await handle.stat();
    if (!temporaryStat.isFile()) throw new Error(`Temporary target is not a regular file: ${temporaryPath}`);
    await handle.writeFile(operation.bytes);
    await handle.chmod(operation.mode);
    await handle.sync();
    await handle.close();
    handle = null;

    await assertSafeDirectoryPath(publicRoot, parent, `Fingerprint target parent for ${operation.targetPath}`);
    // This closes deterministic target replacement between preflight and rename. Parent-path ABA
    // remains outside this pure Node implementation and is covered by the exported single-writer contract.
    const currentTarget = await inspectRegularFile(publicRoot, operation.targetPath, {
      label: `Fingerprint target ${operation.targetPath}`,
      optional: true,
    });
    assertTargetMatchesPreflight(operation.target, currentTarget);
    await fs.rename(temporaryPath, operation.targetPath);
  } finally {
    try {
      await handle?.close();
    } finally {
      try {
        await fs.unlink(temporaryPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
}

export async function versionEfEntryAssets(
  publicRoot,
  { check = false, repoSourceRoot = SCRIPT_REPO_ROOT } = {},
) {
  if (!publicRoot) throw new Error("versionEfEntryAssets requires a public root");
  if (!repoSourceRoot) throw new Error("versionEfEntryAssets requires a repository source root");
  const plan = await buildVersionPlan(publicRoot, repoSourceRoot, { check });
  if (!check) {
    for (const operation of plan.changed) {
      await atomicReplaceRegularFile(plan.publicRoot, operation);
    }
    await buildVersionPlan(publicRoot, repoSourceRoot, { check: true });
  }
  return {
    version: EF_ASSET_VERSION,
    checkedFiles: plan.operations.length,
    changedFiles: check ? 0 : plan.changed.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  let check = false;
  let publicRoot = null;
  let repoSourceRoot = SCRIPT_REPO_ROOT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--repo-root") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--repo-root requires a path");
      repoSourceRoot = path.resolve(value);
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (publicRoot) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    } else {
      publicRoot = arg;
    }
  }
  if (!publicRoot) {
    throw new Error(
      "Usage: node scripts/version-ef-entry-assets.mjs <public-root> [--repo-root <repo-root>] [--check]",
    );
  }
  const result = await versionEfEntryAssets(path.resolve(publicRoot), { check, repoSourceRoot });
  console.log(JSON.stringify(result));
}
