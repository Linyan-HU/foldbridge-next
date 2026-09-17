import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const CASES_ROOT = join(process.cwd(), "public", "entry-cases", "cases");
const SIDEcar_SCHEMA = "profile-public-techniques.v1";

function readGzipJson(path) {
  return JSON.parse(gunzipSync(readFileSync(path)));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sourceKey(profileId) {
  const hash = String(profileId).lastIndexOf("#");
  return hash > 0 ? String(profileId).slice(0, hash) : String(profileId);
}

function publicMethod(method) {
  return {
    label: method.label,
    mappingStatus: method.mappingStatus,
    categoryId: method.categoryId,
    categoryLabel: method.categoryLabel,
    categoryShortLabel: method.categoryShortLabel,
  };
}

const caseEntries = [];
const sourceTemplates = new Map();
const caseDirs = (await readdir(CASES_ROOT, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

for (const caseDir of caseDirs) {
  const caseRoot = join(CASES_ROOT, caseDir.name);
  const manifestPath = join(caseRoot, "browser-manifest.json");
  if (!(await exists(manifestPath))) continue;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chains = Object.entries(manifest.chains || {}).sort(([left], [right]) => left.localeCompare(right));
  const chainEntries = [];

  for (const [chainId, chainInfo] of chains) {
    const profilesRoot = join(caseRoot, chainInfo.chainRoot, "profiles");
    const sidecarPath = join(profilesRoot, "profile-public-techniques.json.gz");
    const indexPath = join(profilesRoot, "profile-index.json.gz");
    const indexHtml = await readFile(join(caseRoot, chainInfo.chainRoot, "index.html"), "utf8");
    const configMatch = indexHtml.match(/__FAMILY_D_CHAIN_WORKBENCH_CONFIG__\s*=\s*(\{.*?\});/);
    const effectiveChainId = configMatch ? JSON.parse(configMatch[1]).chainId : chainId;
    if (!(await exists(sidecarPath))) {
      throw new Error(`Missing downloaded sidecar for ${caseDir.name}/${chainId}`);
    }
    const sidecar = readGzipJson(sidecarPath);
    const direct = new Map(sidecar.profiles.map((profile) => [profile.profileId, profile]));
    for (const profile of sidecar.profiles) {
      const key = sourceKey(profile.profileId);
      const normalized = {
        classificationStatus: profile.classificationStatus,
        methods: profile.methods.map(publicMethod),
      };
      const signature = JSON.stringify(normalized);
      const previous = sourceTemplates.get(key);
      if (!previous) {
        sourceTemplates.set(key, { signatures: new Map([[signature, normalized]]) });
      } else if (!previous.signatures.has(signature)) {
        previous.signatures.set(signature, normalized);
      }
    }
    const fileStat = await stat(sidecarPath);
    chainEntries.push({
      caseId: caseDir.name,
      chainId,
      effectiveChainId,
      fileIdentity: `${fileStat.dev}:${fileStat.ino}`,
      profilesRoot,
      sidecarPath,
      indexPath,
      direct,
    });
  }
  caseEntries.push(...chainEntries);
}

let exact = 0;
let sourceFallback = 0;
let missing = 0;
const writtenPhysicalFiles = new Set();
for (const entry of caseEntries) {
  if (writtenPhysicalFiles.has(entry.fileIdentity)) continue;
  writtenPhysicalFiles.add(entry.fileIdentity);
  const profileIndex = readGzipJson(entry.indexPath);
  const profiles = profileIndex.profiles.map((profile) => {
    const direct = entry.direct.get(profile.profile_id);
    const sourceTemplate = sourceTemplates.get(sourceKey(profile.profile_id));
    const template = direct || (
      sourceTemplate?.signatures.size === 1
        ? [...sourceTemplate.signatures.values()][0]
        : null
    );
    if (!template) {
      missing += 1;
      throw new Error(`No technique classification for ${entry.caseId}/${entry.chainId}/${profile.profile_id}`);
    }
    if (direct) exact += 1;
    else sourceFallback += 1;
    return {
      profileId: profile.profile_id,
      classificationStatus: template.classificationStatus,
      methods: template.methods.map(publicMethod),
    };
  });
  const payload = {
    schemaVersion: SIDEcar_SCHEMA,
    pdbId: entry.caseId,
    authChain: entry.effectiveChainId,
    profileCount: profiles.length,
    profiles,
  };
  await writeFile(entry.sidecarPath, gzipSync(JSON.stringify(payload)));
}

console.log(JSON.stringify({
  chains: caseEntries.length,
  sourceTemplates: sourceTemplates.size,
  exact,
  sourceFallback,
  missing,
}));
