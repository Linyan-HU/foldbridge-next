import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import * as MatrixShell from "../public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs";
import { EF_ASSET_VERSION, versionedAssetName } from "../scripts/version-ef-entry-assets.mjs";

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("EF stays inside the existing Workbench shell", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  assert.match(source, /ef-workbench-shell\.[^"']+\.mjs/);
  assert.match(source, /prepareEfWorkbenchShell/);
  assert.match(source, /window\.efCaseBootstrap\(\s*\{/);
  assert.doesNotMatch(source, /document\.body\s*\.\s*innerHTML\s*=/);
  assert.doesNotMatch(source, /document\.body\s*\.\s*replaceChildren\s*\(/);
  assert.doesNotMatch(source, /#assetStatus[^;\n]*\|\|\s*document\.body/);
  assert.doesNotMatch(source, /main class="ef-grid"/);
  assert.match(source, /if\s*\(!detectedEfChain\s*&&\s*!manifestDetectionError\s*&&\s*el\.status\)/);
});

test("retired Full CIF reference is removed before ordinary or EF mode branches", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  assert.match(source, /function\s+removeRetiredFullCifReference\s*\(/);
  assert.match(source, /querySelector\(["']#molstar-full-host["']\)\?\.closest\(["']\.molstar-view["']\)\?\.remove\(\)/);
  assert.match(source, /querySelector\(["']#molstarFullMeta["']\)\?\.remove\(\)/);

  const helperBody = source.indexOf("function removeRetiredFullCifReference");
  const eagerCleanupCall = source.indexOf("removeRetiredFullCifReference();", helperBody);
  const manifestFetch = source.indexOf("const response = await fetch");
  assert.ok(eagerCleanupCall >= 0 && eagerCleanupCall < manifestFetch, "retired Full CIF cleanup must run before manifest loading can block");
});

test("manifest detection fails loudly instead of falling back to profile mode", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  assert.match(source, /let manifestDetectionError\s*=\s*null/);
  assert.match(source, /parseCaseMatrixFamilyQuery\(window\.location\.search\s*\|\|\s*["']["']\)/);
  assert.match(source, /if\s*\(!response\.ok\)\s*throw/);
  assert.match(
    source,
    /resolveCaseViewMode\(\{\s*manifest,\s*chainId,\s*requestedFamily:\s*requestedMatrixFamily\s*\}\)/,
  );
  assert.match(source, /if\s*\(manifestDetectionError\)\s*throw manifestDetectionError/);
  assert.match(source, /if\s*\(!detectedEfChain\s*&&\s*!manifestDetectionError\s*&&\s*el\.status\)/);
});

test("EF bootstrap validates linked assets before rendering", () => {
  const source = read("public/entry-cases/__entry_ef_site__/ef-case.js");
  assert.match(source, /case2dPath/);
  assert.match(source, /linkedViewBundlePath/);
  assert.match(source, /assertLinkedContract/);
  assert.match(source, /sequence\s*=\s*requireOptionHost\(hosts,\s*["']sequence["']\)/);
  assert.doesNotMatch(source, /showError\([^)]*document\.body/);
  assert.match(source, /return\s+\{\s*manifest,\s*manifestUrl,\s*resolvedChain,\s*controller\s*\}/);
});

test("EF renderer owns separate 1D and matrix hosts", () => {
  const source = read("public/entry-cases/__entry_ef_site__/ef-heatmap.js");
  assert.match(source, /sequenceHost/);
  assert.match(source, /onInteraction/);
  assert.match(source, /sequenceHost\.appendChild\(sequenceTrack\)/);
  assert.doesNotMatch(source, /root\.appendChild\(sequenceTrack\)/);
  assert.match(source, /MATRIX_PUBLIC_COPY\.sequence/);
  assert.match(source, /MATRIX_PUBLIC_COPY\.signal/);
  assert.match(source, /role:\s*["']group["']/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /data-track-kind/);
  assert.match(source, /updateSequenceIntensity/);
  assert.match(source, /kind:\s*["']hover["']/);
  assert.match(source, /kind:\s*["']select["']/);
  assert.match(source, /idx\.cellMap\.has/);
  assert.match(source, /core\.presentationPayload/);
  assert.match(source, /const mappedAxisI\s*=\s*viewPayload\.axis_i\.filter/);
  assert.match(source, /const mappedAxisJ\s*=\s*viewPayload\.axis_j\.filter/);
  assert.match(source, /const sequenceAxis\s*=\s*mappedAxisJ\.length\s*>\s*mappedAxisI\.length\s*\?\s*["']j["']\s*:\s*["']i["']/);
  assert.match(source, /const sequenceRows\s*=\s*sequenceAxis\s*===\s*["']j["']\s*\?\s*mappedAxisJ\s*:\s*mappedAxisI/);
  assert.match(source, /sequenceRows\.forEach/);
  assert.match(source, /const matrixRefByKey\s*=\s*new Map/);
  assert.match(source, /for\s*\(const axis of \[sequenceAxis/);
  assert.match(source, /selectAxis\(ref\.axis,\s*ref\.index,\s*["']varna["']\)/);
  assert.match(source, /PDB\.molstar\.click/);
  assert.match(source, /selectPdbPosition\([^,]+,\s*["']3d["']\)/);
  assert.match(source, /FoldBridgeResidueLinkage/);
  assert.match(source, /data-residue-key/);
  assert.match(source, /PDB\.molstar\.mouseover/);
  assert.match(source, /PDB\.molstar\.mouseout/);
  assert.doesNotMatch(source, /nearestVarna|nearestDistance|nearestRadius/);
});

test("matrix technology metadata uses the shared public classifier", () => {
  const shellSource = read("public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs");
  assert.match(shellSource, /import\s*\{\s*classifyTechniqueFilter\s*\}\s*from\s*["']\.\/technique-filter-model\.[^"']+\.mjs["']/);
  assert.equal(typeof MatrixShell.matrixPublicTechnique, "function");
  assert.deepEqual(MatrixShell.matrixPublicTechnique({ technology: "MCA" }), {
    methodLabel: "MOHCA",
    categoryLabel: "RNA–RNA interaction mapping methods",
  });
  assert.deepEqual(MatrixShell.matrixPublicTechnique({ technology: "mutate-and-map" }), {
    methodLabel: "Mutate-and-map methods",
    categoryLabel: "RNA–RNA interaction mapping methods",
  });
  assert.deepEqual(MatrixShell.matrixPublicTechnique({
    pdb_id: "8QO5",
    family: "F",
    value_kind: "m2_coupling_z",
    technology: "MAP",
  }), {
    methodLabel: "Mutate-and-map methods",
    categoryLabel: "RNA–RNA interaction mapping methods",
  });
});

test("matrix value metadata is derived from value_kind rather than family", () => {
  assert.equal(typeof MatrixShell.matrixPublicValueLabel, "function");
  assert.equal(MatrixShell.matrixPublicValueLabel({ value_kind: "cohcoa_contact", family: "F" }), "Contact score");
  assert.equal(MatrixShell.matrixPublicValueLabel({ value_kind: "m2_coupling_z", family: "E" }), "Pair coupling");
  assert.throws(
    () => MatrixShell.matrixPublicValueLabel({ value_kind: "unknown", family: "E" }),
    /unsupported matrix value_kind/i,
  );

  const shellSource = read("public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs");
  const metadataStart = shellSource.indexOf("export function renderEfWorkbenchMetadata");
  const metadataEnd = shellSource.indexOf("export function renderEfInteraction", metadataStart);
  const metadataRenderer = shellSource.slice(metadataStart, metadataEnd);
  assert.equal((metadataRenderer.match(/matrixPublicTechnique\(header\)/g) || []).length, 1);
  assert.match(metadataRenderer, /metric\(document,\s*["']Technique["'],\s*publicTechnique\.methodLabel\)/);
  assert.match(metadataRenderer, /metric\(document,\s*["']Category["'],\s*publicTechnique\.categoryLabel\)/);
  assert.doesNotMatch(metadataRenderer, /header\.family/);
});

test("matrix interaction sources render through public component labels", () => {
  assert.equal(typeof MatrixShell.matrixPublicInteractionSource, "function");
  assert.deepEqual(
    ["sequence", "signal", "varna", "3d", "matrix"].map(MatrixShell.matrixPublicInteractionSource),
    ["Sequence", "Signal", "Secondary structure", "3D structure", "Contact / pair map"],
  );
  const workbenchSource = read("public/entry-cases/__entry_v3_site__/workbench.js");
  const transitionStart = workbenchSource.indexOf("function nextMatrixLockedEvent");
  const transitionEnd = workbenchSource.indexOf("async function initEfMode", transitionStart);
  const nextMatrixLockedEvent = vm.runInNewContext(
    `(() => { ${workbenchSource.slice(transitionStart, transitionEnd)}; return nextMatrixLockedEvent; })()`,
  );
  assert.match(workbenchSource, /lockedEvent = nextMatrixLockedEvent\(event, lockedEvent\)/);

  class TinyNode {
    constructor() {
      this.children = [];
      this.textContent = "";
      this.className = "";
    }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
  }
  const inspector = new TinyNode();
  const inspectorStatus = new TinyNode();
  const structureStatus = new TinyNode();
  const document = {
    createElement() { return new TinyNode(); },
    querySelector(selector) {
      return {
        "#linked-inspector": inspector,
        "#inspectorStatus": inspectorStatus,
        "#molstar-selection-status": structureStatus,
      }[selector] || null;
    },
  };
  MatrixShell.renderEfInteraction(document, {
    kind: "select",
    source: "signal",
    axis: "i",
    index: 0,
    residue: { base: "A", pdb_pos: 1, matrix_index: 0 },
  });
  const sourceCard = inspector.children[0].children[1];
  assert.equal(sourceCard.children[0].textContent, "Source");
  assert.equal(sourceCard.children[1].textContent, "Signal");

  const selectedEvent = {
    kind: "select",
    source: "signal",
    axis: "i",
    index: 0,
    residue: { base: "A", pdb_pos: 1, matrix_index: 0 },
  };
  MatrixShell.renderEfInteraction(document, { kind: "hover-clear" }, selectedEvent);
  assert.equal(inspector.children[0].children[1].children[1].textContent, "Signal");
  MatrixShell.renderEfInteraction(document, { kind: "select-clear" }, selectedEvent);
  assert.equal(inspector.children[0].textContent, MatrixShell.MATRIX_PUBLIC_COPY.inspectorEmpty);
  assert.equal(inspectorStatus.textContent, "no residue selected");
  assert.equal(structureStatus.textContent, "selection: none");

  let lockedEvent = nextMatrixLockedEvent(selectedEvent, null);
  assert.equal(lockedEvent, selectedEvent);
  lockedEvent = nextMatrixLockedEvent({ kind: "hover-clear" }, lockedEvent);
  assert.equal(lockedEvent, selectedEvent);
  lockedEvent = nextMatrixLockedEvent({ kind: "select-clear" }, lockedEvent);
  assert.equal(lockedEvent, null);
  MatrixShell.renderEfInteraction(document, { kind: "hover-clear" }, lockedEvent);
  assert.equal(inspector.children[0].textContent, MatrixShell.MATRIX_PUBLIC_COPY.inspectorEmpty);
});

test("matrix metadata renders public Technique and Category for real E/F payload headers", () => {
  class TinyNode {
    constructor() {
      this.children = [];
      this.textContent = "";
      this.className = "";
    }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
  }
  const stats = new TinyNode();
  const assetStatus = new TinyNode();
  const matrixStatus = new TinyNode();
  const caption = new TinyNode();
  const document = {
    createElement() { return new TinyNode(); },
    querySelector(selector) {
      return {
        "#stats": stats,
        "#assetStatus": assetStatus,
        "#ef-matrix-status": matrixStatus,
        "#viewCaption": caption,
      }[selector] || null;
    },
  };
  for (const expected of [
    {
      header: {
        pdb_id: "8QO5", chain: "A", family: "F", technology: "MAP", value_kind: "m2_coupling_z",
        n_rows: 124, n_cols: 160, value_min: -7.34, value_max: 10.9,
      },
      valueLabel: "Pair coupling",
      technique: "Mutate-and-map methods",
    },
    {
      header: {
        pdb_id: "7SYS", chain: "z", family: "E", technology: "MCA", value_kind: "cohcoa_contact",
        n_rows: 160, n_cols: 160, value_min: -2.1, value_max: 8.6,
      },
      valueLabel: "Contact score",
      technique: "MOHCA",
    },
  ]) {
    MatrixShell.renderEfWorkbenchMetadata(document, {
      controller: {
        viewHeader: expected.header,
        viewPayload: {
          axis_i: [{ pdb_pos: 1, varna_index: 0 }],
          axis_j: [{ pdb_pos: 1, varna_index: 0 }],
        },
      },
    });
    const metrics = Object.fromEntries(stats.children.map((item) => [item.children[0].textContent, item.children[1].textContent]));
    assert.equal(metrics["Matrix value"], expected.valueLabel);
    assert.equal(metrics.Technique, expected.technique);
    assert.equal(metrics.Category, "RNA–RNA interaction mapping methods");
    assert.doesNotMatch(Object.values(metrics).join("\n"), /\b(?:EF|Family|Tier|LSS)\b/);
  }
});

test("matrix public copy collection uses ordinary Case vocabulary without internal terms", () => {
  assert.ok(MatrixShell.MATRIX_PUBLIC_COPY && typeof MatrixShell.MATRIX_PUBLIC_COPY === "object");

  const rendererSource = read("public/entry-cases/__entry_ef_site__/ef-heatmap.js");
  const sandbox = { window: {} };
  vm.runInNewContext(rendererSource, sandbox);
  const rendererCopy = sandbox.window.FoldBridgeMatrixPublicCopy;
  assert.ok(rendererCopy && typeof rendererCopy === "object");

  const copy = [...Object.values(MatrixShell.MATRIX_PUBLIC_COPY), ...Object.values(rendererCopy)].join("\n");
  for (const expected of [
    "Explore experimental contacts across sequence, secondary structure, and 3D structure.",
    "Sequence",
    "Contact / pair map",
    "Secondary structure",
    "3D structure",
    "Signal",
    "Loading matrix…",
    "Linked data ready",
  ]) {
    assert.match(copy, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(copy, /\b(?:EF|Family|Tier|LSS)\b/i);
  assert.doesNotMatch(copy, /mapped-chain sequence|VARNA secondary structure|3D linked structure/i);
});

test("ordinary secondary-structure accessible name uses public Case vocabulary", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  assert.match(source, /setAttribute\("aria-label",\s*"Secondary structure"\)/);
  assert.doesNotMatch(source, /setAttribute\("aria-label",\s*"VARNA secondary structure"\)/);
});

test("matrix error rendering keeps raw diagnostics out of the DOM", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  const start = source.indexOf("function showEfModeError");
  const end = source.indexOf("function classifyPublicTechniqueToken", start);
  assert.ok(start >= 0 && end > start);
  const errorRenderer = source.slice(start, end);

  assert.match(errorRenderer, /pre\.textContent\s*=\s*["']Case data could not be loaded\.["']/);
  assert.match(errorRenderer, /console\.error\(["']\[workbench:matrix\]["'],\s*error\)/);
  assert.doesNotMatch(errorRenderer, /pre\.textContent\s*=.*(?:msg|error)/);

  const host = { replaceChildren(node) { this.child = node; } };
  const diagnostics = [];
  const sandbox = {
    document: {
      querySelector(selector) { return selector === "#assetStatus" ? host : null; },
      createElement() { return {}; },
    },
    console: { error(...args) { diagnostics.push(args); } },
  };
  vm.runInNewContext(`${errorRenderer}; showEfModeError(new Error("private matrix diagnostic"));`, sandbox);
  assert.equal(host.child.textContent, "Case data could not be loaded.");
  assert.doesNotMatch(host.child.textContent, /private matrix diagnostic/);
  assert.equal(diagnostics[0][0], "[workbench:matrix]");
  assert.match(String(diagnostics[0][1]), /private matrix diagnostic/);
});

test("the real loader-to-workbench error chain never writes raw diagnostics into its host", async () => {
  const workbenchSource = read("public/entry-cases/__entry_v3_site__/workbench.js");
  const errorStart = workbenchSource.indexOf("function showEfModeError");
  const errorEnd = workbenchSource.indexOf("function classifyPublicTechniqueToken", errorStart);
  const errorRenderer = workbenchSource.slice(errorStart, errorEnd);
  const efCaseSource = read("public/entry-cases/__entry_ef_site__/ef-case.js");
  const domWrites = [];
  const errorHost = {
    set innerHTML(value) { domWrites.push(String(value)); },
    replaceChildren(node) { this.child = node; domWrites.push(String(node.textContent)); },
  };
  const diagnostics = [];
  const sandbox = {
    window: {
      __FOLDBRIDGE_EF_CASE_CONFIG__: { deferBootstrap: true },
      location: { href: "https://example.test/cases/8QO5/chains/A/" },
    },
    document: {
      baseURI: "https://example.test/cases/8QO5/chains/A/",
      readyState: "complete",
      querySelector(selector) { return selector === "#assetStatus" ? errorHost : null; },
      createElement() { return {}; },
    },
    console: {
      error(...args) { diagnostics.push(args); },
      warn() {},
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(efCaseSource, context);
  vm.runInContext(errorRenderer, context);
  let caughtError;
  try {
    await sandbox.window.efCaseBootstrap({
      caseId: "8QO5",
      chainId: "A",
      manifestUrl: "https://example.test/cases/8QO5/browser-manifest.json",
      hosts: { sequence: {}, heatmap: {}, varna: {}, molstar: {}, error: errorHost },
    });
  } catch (error) {
    caughtError = error;
    sandbox.caughtError = error;
    vm.runInContext("showEfModeError(caughtError)", context);
  }
  assert.match(String(caughtError), /EfHeatmapCore \/ createEfHeatmap not loaded/);
  assert.ok(domWrites.length >= 1);
  assert.ok(domWrites.every((value) => !value.includes("EfHeatmapCore")), `raw DOM writes: ${JSON.stringify(domWrites)}`);
  assert.equal(errorHost.child.textContent, "Case data could not be loaded.");
  assert.deepEqual(diagnostics.map((args) => args[0]), ["[workbench:matrix]"]);
  assert.match(String(diagnostics[0][1]), /EfHeatmapCore \/ createEfHeatmap not loaded/);
});

test("ordinary Case and EF share the residue linkage API", () => {
  const workbench = read("public/entry-cases/__entry_v3_site__/workbench.js");
  assert.match(workbench, /residue-linkage\.[^"']+\.mjs/);
  assert.match(workbench, /window\.FoldBridgeResidueLinkage/);
  assert.match(workbench, /setResidueMarkState/);
  assert.match(workbench, /installVarnaHitLayer/);
});

test("EF uses the existing Workbench heatmap palette instead of blue-red", () => {
  const core = read("public/entry-cases/__entry_ef_site__/ef-heatmap-core.js");
  const renderer = read("public/entry-cases/__entry_ef_site__/ef-heatmap.js");
  assert.match(core, /\[255,\s*255,\s*255\]/);
  assert.match(core, /\[255,\s*242,\s*0\]/);
  assert.match(core, /\[198,\s*0,\s*0\]/);
  assert.doesNotMatch(renderer, /blue\s*<\s*center\s*<\s*red/i);
  assert.match(renderer, /no \/ negative signal.*strong positive signal/i);
});

test("Case Shell reports the chain it actually embeds", () => {
  const source = read("public/entry-cases/__entry_v3_site__/case-shell.js");
  assert.match(source, /querySelector\(["']#chainStatus["']\)/);
  assert.match(source, /chainStatus\.textContent\s*=\s*state\.activeChainId/);
  assert.match(source, /initialChainId\(bootstrap,\s*window\.location\.search\)/);
});

test("EF inspector reports linked 3D state without undefined matrix values", () => {
  const source = read("public/entry-cases/__entry_v3_site__/ef-workbench-shell.mjs");
  assert.match(source, /molstar-selection-status/);
  assert.match(source, /Number\.isFinite\(active\.cell\.value\)/);
  assert.match(source, /mappedPositions/);
  assert.match(source, /no signal/);
});

test("EF styles are scoped to Workbench EF mode", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.css");
  assert.match(source, /\.workbench-shell\.is-ef-mode/);
  assert.match(source, /\.ef-workbench-matrix-panel/);
  assert.match(source, /var\(--(?:ink|muted|line|panel|accent|selected|hover)\)/);
  assert.match(source, /\.molstar-view:has\(#molstar-full-host\)/, "retired Full CIF panel must be hidden before JavaScript initializes");
});

test("EF component chrome is entirely Workbench-token driven", () => {
  const renderer = read("public/entry-cases/__entry_ef_site__/ef-heatmap.js");
  const styles = read("public/entry-cases/__entry_v3_site__/workbench.css");
  assert.doesNotMatch(renderer, /style\.cssText\s*=/);
  assert.doesNotMatch(renderer, /\.style\.cursor\s*=/);
  assert.doesNotMatch(renderer, /#[0-9a-fA-F]{3,8}/);
  assert.match(renderer, /class:\s*["']ef-matrix-background["']/);
  assert.match(renderer, /class:\s*["']ef-selection-row["']/);
  assert.match(renderer, /class:\s*["']ef-hover-guide["']/);
  assert.doesNotMatch(renderer, /is-ef-hovered|is-ef-selected/);
  assert.match(renderer, /rmdb-heatmap-gradient ef-colorbar-ramp/);

  const efBlock = styles.slice(styles.indexOf("/* EF mode"));
  assert.match(efBlock, /\.ef-colorbar\s*\{[^}]*var\(--panel\)/s);
  assert.doesNotMatch(efBlock, /--ef-scale-(?:low|center|high)/);
  assert.match(efBlock, /\.ef-selection-row\s*\{[^}]*var\(--selected-soft\)[^}]*var\(--selected\)/s);
  assert.match(efBlock, /\.ef-hover-guide\s*\{[^}]*var\(--accent\)/s);
  assert.match(efBlock, /\.ef-sequence-track\s*\{/);
  assert.match(efBlock, /\.ef-sequence-base\[data-base=["']A["']\]\s*\{[^}]*#4c78a8/s);
  assert.doesNotMatch(efBlock, /\.ef-sequence-base\s*\{[^}]*min-width:\s*44px/s);
  assert.doesNotMatch(efBlock, /is-ef-hovered|is-ef-selected/);
  assert.doesNotMatch(efBlock, /(?:^|\n)\s*\.ef-/, "EF visual rules must remain scoped to Workbench EF mode");
});

test("EF dependency paths are fingerprinted for caches that ignore query strings", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  assert.match(source, new RegExp(`const EF_ASSET_VERSION\\s*=\\s*["']${EF_ASSET_VERSION}["']`));
  for (const assetName of ["ef-heatmap-core.js", "ef-heatmap.js", "ef-case.js"]) {
    assert.match(source, new RegExp(versionedAssetName(assetName).replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(source, /20260826-ef-ui-8/);
  assert.doesNotMatch(source, /scriptUrl\.searchParams\.set\(["']v["']/);
});

test("Case Shell navigation does not force desktop horizontal overflow", () => {
  const source = read("public/entry-cases/__entry_v3_site__/case-shell.css");
  const routeRule = source.match(/\.fb-detail-nav \.bundle-home-route-nav\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(routeRule, /left:\s*220px/);
});

test("ordinary Case exposes one public Profile selector without Family grouping", () => {
  const source = read("public/entry-cases/__entry_v3_site__/workbench.js");
  const pure = read("public/entry-cases/__entry_v3_site__/workbench-pure.mjs");
  const selectorSource = `${source}\n${pure}`;

  assert.equal((selectorSource.match(/className\s*=\s*["']profile-dropdown["']/g) || []).length, 1);
  assert.match(pure, /select\.hidden\s*=\s*true/);
  assert.doesNotMatch(source, /<optgroup|familyBadgeMarkup|data-family/);
  assert.match(source, /state\.profileSelectorItems/);
  assert.match(source, /mountPublicProfileSelectorDom/);
  const mountBody = source.slice(source.indexOf("function mountProfileDropdown"), source.indexOf("function mountTechniqueFilter"));
  assert.doesNotMatch(mountBody, /state\.profiles\.forEach/);
  assert.match(source, /categoryBadgeMarkup/);
  assert.doesNotMatch(source, /familyCandidates|lssContextForProfile\(profile\.profile_id\)\?\.family/);
});

test("ordinary Case category badges copy the five Entry category colors exactly", () => {
  const styles = read("public/entry-cases/__entry_v3_site__/workbench.css");

  assert.match(styles, /\.category-badge\[data-category=["']dms["']\]\s*\{[^}]*color:\s*var\(--family-a\);[^}]*background:\s*var\(--family-a-bg\);/s);
  assert.match(styles, /\.category-badge\[data-category=["']shape["']\]\s*\{[^}]*color:\s*var\(--family-b\);[^}]*background:\s*var\(--family-b-bg\);/s);
  assert.match(styles, /\.category-badge\[data-category=["']cleavage["']\]\s*\{[^}]*color:\s*var\(--family-c\);[^}]*background:\s*var\(--family-c-bg\);/s);
  assert.match(styles, /\.category-badge\[data-category=["']nucleotide["']\]\s*\{[^}]*color:\s*var\(--family-d\);[^}]*background:\s*var\(--family-d-bg\);/s);
  assert.match(styles, /\.category-badge\[data-category=["']interaction["']\]\s*\{[^}]*color:\s*var\(--textAccent\);[^}]*background:\s*#fff2bf;/s);
  const detailTypography = styles.match(/\.workbench-shell\s+:is\(([^)]*)\)\s*\{/s)?.[1] || "";
  assert.doesNotMatch(detailTypography, /\.category-badge/);
  assert.doesNotMatch(styles, /\.family-badge\[data-family=/);
  assert.match(styles, /\.technique-chip:disabled/);
  assert.match(styles, /\.technique-chip:focus-visible/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.technique-filter/);
});
