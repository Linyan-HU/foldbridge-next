import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as ResidueLinkage from "../public/entry-cases/__entry_v3_site__/residue-linkage.mjs";
import * as ResidueRail from "../public/entry-cases/__entry_v3_site__/residue-rail.mjs";

const source = fs.readFileSync(
  new URL("../public/entry-cases/__entry_ef_site__/ef-heatmap-core.js", import.meta.url),
  "utf8"
);
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const core = sandbox.window.EfHeatmapCore;

assert.equal(typeof core.isDisplayCell, "function");
assert.equal(core.isDisplayCell(0, 1, 0, { family: "E", value_kind: "cohcoa_contact" }), false, "E upper-triangle padding is not presentation data");
assert.equal(core.isDisplayCell(1, 0, -6, { family: "E", value_kind: "cohcoa_contact" }), true, "E lower-triangle measurements remain visible");
assert.equal(core.isDisplayCell(5, 0, 6, { family: "E", value_kind: "cohcoa_contact", diag_mask_min_sep: 6 }), false, "E diagonal mask excludes near-diagonal cells");
assert.equal(core.isDisplayCell(6, 0, 6, { family: "E", value_kind: "cohcoa_contact", diag_mask_min_sep: 6 }), true, "E diagonal mask includes the first scientifically valid separation");
assert.equal(core.isDisplayCell(0, 3, 4, { family: "F", value_kind: "m2_coupling_z" }), true, "F keeps its complete rectangular matrix");
assert.deepEqual([...ResidueLinkage.residueKeySet("9WNR|chain|a|1")], ["9WNR|chain|a|1"], "a scalar residue key is one identity, not an iterable of characters");
assert.equal(ResidueLinkage.residueKeySet(null).size, 0, "null clears shared residue state");

const presentationSource = {
  header: { family: "E", value_kind: "cohcoa_contact", n_rows: 2, n_cols: 2, value_min: -900, value_max: 900 },
  axis_i: [{ matrix_index: 0 }, { matrix_index: 1 }],
  axis_j: [{ matrix_index: 0 }, { matrix_index: 1 }],
  cells: [[0, 1, 900], [1, 0, 6]],
};
const presentationSourceSnapshot = JSON.stringify(presentationSource);
const presentation = core.presentationPayload(presentationSource);
assert.deepEqual(JSON.parse(JSON.stringify(presentation.cells)), [[1, 0, 6]], "E presentation cells contain only the measured triangle");
assert.equal(presentation.header.value_min, 6, "presentation minimum ignores hidden upper-triangle padding");
assert.equal(presentation.header.value_max, 6, "presentation maximum ignores hidden upper-triangle padding");
assert.equal(presentationSource.cells.length, 2, "presentation derivation does not mutate scientific cells");
assert.equal(presentationSource.header.value_max, 900, "presentation derivation does not mutate the scientific header");
assert.equal(JSON.stringify(presentationSource), presentationSourceSnapshot, "presentation derivation preserves the complete scientific payload byte-for-byte");

const rebasedPresentation = core.presentationPayload({
  header: { family: "E", value_kind: "cohcoa_contact", n_rows: 2, n_cols: 2, diag_mask_min_sep: 6 },
  axis_i: [{ matrix_index: 0, source_matrix_index: 0 }, { matrix_index: 1, source_matrix_index: 10 }],
  axis_j: [{ matrix_index: 0, source_matrix_index: 0 }, { matrix_index: 1, source_matrix_index: 10 }],
  cells: [[1, 0, 7]],
});
assert.deepEqual(JSON.parse(JSON.stringify(rebasedPresentation.cells)), [[1, 0, 7]], "E diagonal masking uses scientific source indices after mapped-chain rebasing");

const constructPayload = {
  header: {
    pdb_id: "9WNR",
    chain: "a",
    label_asym_id: "HA",
    family: "E",
    n_rows: 4,
    n_cols: 4,
    bg_mean: 0,
    bg_sd: 2,
    value_min: -100,
    value_max: 100,
    color_scale: "bg_sd",
    color_sd_cap: 3,
    render_scope: "mapped_chain",
    focus_chain: true,
  },
  axis_i: [
    { matrix_index: 0, construct_pos: -1, pdb_pos: null, varna_index: null },
    { matrix_index: 1, construct_pos: 2, pdb_pos: 1, varna_index: 0, observed: true, base: "A" },
    { matrix_index: 2, construct_pos: 3, pdb_pos: 2, varna_index: 1, observed: true, base: "C" },
    { matrix_index: 3, construct_pos: 4, pdb_pos: null, varna_index: null },
  ],
  axis_j: [
    { matrix_index: 0, construct_pos: -1, pdb_pos: null, varna_index: null },
    { matrix_index: 1, construct_pos: 2, pdb_pos: 1, varna_index: 0, observed: true, base: "A" },
    { matrix_index: 2, construct_pos: 3, pdb_pos: 2, varna_index: 1, observed: true, base: "C" },
    { matrix_index: 3, construct_pos: 4, pdb_pos: null, varna_index: null },
  ],
  cells: [
    [0, 1, 99],
    [1, 1, 1.5],
    [1, 2, 6],
    [2, 1, -6],
    [2, 2, 2.5],
    [3, 2, 88],
  ],
};

assert.equal(typeof core.materializeMappedChain, "function");
const chainPayload = core.materializeMappedChain(constructPayload);

assert.equal(chainPayload.header.n_rows, 2);
assert.equal(chainPayload.header.n_cols, 2);
assert.deepEqual(
  JSON.parse(JSON.stringify(chainPayload.axis_i.map((row) => [row.matrix_index, row.source_matrix_index, row.pdb_pos, row.varna_index]))),
  [[0, 1, 1, 0], [1, 2, 2, 1]]
);
assert.deepEqual(JSON.parse(JSON.stringify(chainPayload.cells)), [
  [0, 0, 1.5],
  [0, 1, 6],
  [1, 0, -6],
  [1, 1, 2.5],
]);
assert.equal(chainPayload.header.value_min, -6);
assert.equal(chainPayload.header.value_max, 6);
assert.equal(chainPayload.header.color_scale, "matrix_extent");

assert.deepEqual(
  JSON.parse(JSON.stringify(core.colorForValue(6, chainPayload.header))),
  { r: 198, g: 0, b: 0 }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(core.colorForValue(-6, chainPayload.header))),
  { r: 255, g: 255, b: 255 },
  "negative/non-contact signal must use the existing Workbench white baseline, never a blue diverging scale"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(core.colorForValue(0.8, {
    family: "E", bg_mean: 0, value_min: -2, value_max: 8,
  }))),
  { r: 255, g: 211, b: 0 },
  "EF must use the same white-yellow-red response ramp as the existing Workbench heatmap"
);

assert.deepEqual(
  JSON.parse(JSON.stringify(core.buildMolstarChainFocusPayload(chainPayload))),
  {
    data: [{ struct_asym_id: "HA", start_residue_number: 1, end_residue_number: 2, color: { r: 200, g: 200, b: 200 }, focus: true }],
    nonSelectedColor: { r: 255, g: 255, b: 255 },
  }
);
const observedFixture = JSON.parse(JSON.stringify(chainPayload));
observedFixture.axis_i[1].observed = false;
const observedIndices = core.buildIndices(observedFixture);
assert.deepEqual(JSON.parse(JSON.stringify(core.buildHoverTargets(1, 0, observedIndices, observedFixture.header))), [{
  struct_asym_id: "HA", start_residue_number: 1, end_residue_number: 1,
}], "observed=false remains linked in 2D but is excluded from 3D hover while observed=true remains eligible");

class FakeElement {
  constructor(name) {
    this.name = name;
    this.attrs = {};
    this.children = [];
    this.style = {
      setProperty: (property, value) => { this.style[property] = String(value); },
    };
    this.handlers = {};
    this.innerHTML = "";
    this.className = "";
    this.textContent = "";
    this.classList = {
      add: (...names) => {
        const values = new Set(String(this.attrs.class || this.className || "").split(/\s+/).filter(Boolean));
        names.forEach((value) => values.add(value));
        this.attrs.class = [...values].join(" ");
      },
      remove: (...names) => {
        const removed = new Set(names);
        this.attrs.class = String(this.attrs.class || this.className || "").split(/\s+/).filter((value) => value && !removed.has(value)).join(" ");
      },
      contains: (name) => String(this.attrs.class || this.className || "").split(/\s+/).includes(name),
    };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  get firstChild() { return this.children[0] || null; }
  insertBefore(child, before) { child.parentNode = this; this.children.splice(this.children.indexOf(before), 0, child); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  cloneNode(deep) {
    const copy = new FakeElement(this.name);
    copy.attrs = { ...this.attrs };
    copy.className = this.className;
    copy.textContent = this.textContent;
    if (deep) this.children.forEach(child => copy.appendChild(child.cloneNode(true)));
    return copy;
  }
  click() { this.handlers.click?.(); }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  removeEventListener(name) { delete this.handlers[name]; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 340 }; }
  querySelector(selector) {
    const matches = (node) => selector === "svg"
      ? node.name === "svg"
      : selector.startsWith(".") && String(node.attrs.class || node.className || "").split(/\s+/).includes(selector.slice(1));
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }
  querySelectorAll(selector) {
    if (selector.includes(",")) return selector.split(",").flatMap(part => this.querySelectorAll(part.trim()));
    if (selector === 'circle[stroke="none"][r="5.0"]') return this.circles || [];
    const className = selector.startsWith(".") ? selector.slice(1) : null;
    const dataLayer = selector.match(/^circle\[data-layer="([^"]+)"\]/)?.[1] || null;
    const matches = descendants(this, (node) => (
      (className && String(node.attrs.class || node.className || "").split(/\s+/).includes(className))
      || (dataLayer && node.name === "circle" && node.getAttribute("data-layer") === dataLayer)
    ));
    if (className && this.circles) {
      matches.unshift(...this.circles.filter((node) => String(node.attrs.class || "").split(/\s+/).includes(className)));
    }
    return [...new Set(matches)];
  }
}

const linkageRoot = new FakeElement("host");
const linkageMarkA = new FakeElement("rect");
linkageMarkA.setAttribute("class", "residue-mark");
linkageMarkA.setAttribute("data-residue-key", "case|chain|a|1");
const linkageMarkB = new FakeElement("rect");
linkageMarkB.setAttribute("class", "residue-mark");
linkageMarkB.setAttribute("data-residue-key", "case|chain|a|2");
linkageRoot.appendChild(linkageMarkA);
linkageRoot.appendChild(linkageMarkB);
ResidueLinkage.setResidueMarkState(linkageRoot, "selected", "case|chain|a|1");
assert.equal(linkageMarkA.classList.contains("selected"), true, "ordinary Case scalar selection activates one shared residue mark");
assert.equal(linkageMarkB.classList.contains("selected"), false);
ResidueLinkage.setResidueMarkState(linkageRoot, "selected", null);
assert.equal(linkageMarkA.classList.contains("selected"), false, "ordinary Case null selection clears shared residue state");

function descendants(node, predicate) {
  const matches = [];
  for (const child of node.children || []) {
    if (predicate(child)) matches.push(child);
    matches.push(...descendants(child, predicate));
  }
  return matches;
}

const heatmapSource = fs.readFileSync(
  new URL("../public/entry-cases/__entry_ef_site__/ef-heatmap.js", import.meta.url),
  "utf8"
);
const integrationSandbox = {
  URL,
  window: {
    EfHeatmapCore: core,
    FoldBridgeResidueLinkage: ResidueLinkage,
    FoldBridgeResidueRail: ResidueRail,
  },
  document: {
    createElementNS: (_ns, name) => new FakeElement(name),
    createElement: (name) => new FakeElement(name),
  },
};
vm.runInNewContext(heatmapSource, integrationSandbox);

const heatmapHost = new FakeElement("host");
const sequenceHost = new FakeElement("host");
const varnaHost = new FakeElement("host");
const varnaSvg = new FakeElement("svg");
varnaSvg.circles = [new FakeElement("circle"), new FakeElement("circle")];
varnaSvg.circles[0].getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10 });
varnaSvg.circles[1].getBoundingClientRect = () => ({ left: 20, top: 20, width: 10, height: 10 });
varnaHost.appendChild(varnaSvg);
const selectCalls = [];
const molstarPlugin = {
  visual: {
    select(args) { selectCalls.push(args); },
    highlight() {},
    clearHighlight() {},
  },
};
const molstarHost = new FakeElement("host");
const linkedResidues = [
  { chainKey: "9WNR|chain|a", residueKey: "9WNR|chain|a|1", labelSeqId: 1, parentBase: "A" },
  { chainKey: "9WNR|chain|a", residueKey: "9WNR|chain|a|2", labelSeqId: 2, parentBase: "C" },
];

const invalidObservedPayload = JSON.parse(JSON.stringify(constructPayload));
delete invalidObservedPayload.axis_i[1].observed;
assert.throws(() => integrationSandbox.window.createEfHeatmap({
  sequenceHost, heatmapHost, varnaHost, molstarHost, molstarPlugin,
  payload: invalidObservedPayload, residues: linkedResidues,
}), /missing boolean observed state/, "mapped observed=undefined fails loudly instead of entering 3D");
assert.throws(() => integrationSandbox.window.createEfHeatmap({
  sequenceHost, heatmapHost, varnaHost, molstarHost, molstarPlugin,
  payload: constructPayload,
  residues: [linkedResidues[0], { ...linkedResidues[1], residueKey: linkedResidues[0].residueKey }],
}), /duplicate residueKey/, "duplicate canonical residue keys fail loudly");
assert.throws(() => integrationSandbox.window.createEfHeatmap({
  sequenceHost, heatmapHost, varnaHost, molstarHost, molstarPlugin,
  payload: constructPayload,
  residues: [{ ...linkedResidues[0], chainKey: "9WNR|chain|b" }, linkedResidues[1]],
}), /does not match 9WNR\|chain\|a/, "linked-view chain identity must match the EF header authority");

const controller = integrationSandbox.window.createEfHeatmap({
  sequenceHost,
  heatmapHost,
  varnaHost,
  molstarHost,
  molstarPlugin,
  payload: constructPayload,
  matrixUrl: "https://example.test/entry-cases/cases/9WNR/chains/a/ef-matrix.json.gz",
  residues: linkedResidues,
});
assert.equal(controller.viewHeader.n_rows, 2);
assert.equal(controller.viewHeader.n_cols, 2);
assert.ok(heatmapHost.querySelector(".ef-axes"), "heatmap must render coordinate axes");
assert.ok(heatmapHost.querySelector(".ef-hover"), "heatmap must render hover crosshair layer");
assert.ok(heatmapHost.querySelector(".ef-selection"), "heatmap must render locked selection layer");
const sequenceTrack = sequenceHost.querySelector(".ef-sequence-track");
assert.ok(sequenceTrack, "sequence host must render the Workbench-style SVG 1D track");
assert.equal(sequenceTrack.getAttribute("role"), "group", "interactive SVG track must expose a group, not flattened image semantics");
assert.equal(heatmapHost.querySelector(".ef-sequence-track"), null, "matrix host must not duplicate the 1D track");
const trackLabels = descendants(sequenceTrack, (node) => node.getAttribute("class") === "residue-rail-label").map((node) => node.textContent);
assert.deepEqual(trackLabels, ["PDB pos", "Sequence", "Signal"]);
const baseMarks = descendants(sequenceTrack, (node) => node.getAttribute("data-track-kind") === "mapped_chain_sequence");
const intensityMarks = descendants(sequenceTrack, (node) => node.getAttribute("data-track-kind") === "ef_intensity");
const publicTrackCopy = [
  sequenceTrack.getAttribute("aria-label"),
  ...trackLabels,
  ...intensityMarks.map((mark) => mark.getAttribute("aria-label")),
  ...descendants(sequenceTrack, (node) => node.name === "title").map((node) => node.textContent),
].filter(Boolean).join("\n");
assert.doesNotMatch(publicTrackCopy, /\bEF\b|mapped(?:-| )chain sequence/i, "rendered sequence labels, ARIA, and titles must not expose internal matrix terminology");
const baseCells = descendants(sequenceTrack, (node) => String(node.getAttribute("class") || "").split(/\s+/).includes("ef-sequence-base"));
const intensityCells = descendants(sequenceTrack, (node) => String(node.getAttribute("class") || "").split(/\s+/).includes("ef-sequence-intensity"));
const renderedECells = descendants(heatmapHost.querySelector(".ef-cells"), (node) => node.name === "rect");
assert.equal(renderedECells.length, 1, "E renderer must omit diagonal and upper-triangle padding cells");
assert.equal(baseMarks.length, 2, "mapped chain sequence row must render one interactive cell per mapped residue");
assert.equal(intensityMarks.length, 2, "intensity row must align one cell per mapped residue");
assert.ok(baseMarks.every((mark) => Number(mark.getAttribute("data-hit-width")) >= 24), "every interactive sequence target must be at least 24 px wide");
assert.ok(baseCells.every((cell, index) => Number(cell.getAttribute("width")) <= Number(baseMarks[index].getAttribute("data-hit-width")) - 1), "visible sequence cells retain the normal Workbench inter-cell gap");
assert.ok([...baseMarks, ...intensityMarks].every((mark) => mark.getAttribute("aria-pressed") === "false"), "track cells start unpressed");
assert.deepEqual(baseMarks.map((mark) => mark.getAttribute("data-residue-key")), linkedResidues.map((row) => row.residueKey), "1D marks use canonical linked-view residue keys");
assert.deepEqual(intensityCells.map((cell) => cell.getAttribute("fill")), ["rgb(255,255,255)", "rgb(255,255,255)"], "intensity row starts at the no-signal baseline");
assert.ok(heatmapHost.querySelector(".ef-colorbar"), "heatmap must render a visible colorbar");
const interactionStatus = heatmapHost.querySelector(".ef-interaction-status");
baseMarks[0].handlers.mousemove({ clientX: 5, clientY: 5 });
assert.equal(interactionStatus.textContent, "hover Sequence · PDB 1 A");
assert.doesNotMatch(interactionStatus.textContent, /\b(?:EF|Family|Tier|LSS)\b|mapped_chain|ef_intensity/i);
baseMarks[0].handlers.mouseleave();
intensityMarks[0].handlers.mousemove({ clientX: 5, clientY: 5 });
assert.equal(interactionStatus.textContent, "hover Signal · PDB 1 A");
assert.doesNotMatch(interactionStatus.textContent, /\b(?:EF|Family|Tier|LSS)\b|mapped_chain|ef_intensity/i);
intensityMarks[0].handlers.mouseleave();
const hitgrid = heatmapHost.querySelector(".ef-hitgrid");
const hoverLayer = heatmapHost.querySelector(".ef-hover");
const tooltip = heatmapHost.querySelector(".ef-tooltip");
hitgrid.handlers.mousemove({ clientX: 205, clientY: 105 });
assert.equal(hoverLayer.getAttribute("visibility"), "hidden", "E upper triangle must not expose hover state");
assert.equal(tooltip.style.display, "none", "E upper triangle must not expose a value tooltip");
hitgrid.handlers.click({ clientX: 205, clientY: 105 });
assert.equal(controller.state.selected, null, "E upper triangle must not be selectable");
hitgrid.handlers.mousemove({ clientX: 195, clientY: 115 });
assert.equal(hoverLayer.getAttribute("visibility"), "visible", "matrix hover must reveal the crosshair layer");
assert.equal(tooltip.style.display, "block", "matrix hover must reveal the value tooltip");
assert.equal(varnaSvg.circles[0].classList.contains("hovered"), true, "matrix hover uses the shared VARNA hover state");
assert.equal(varnaSvg.circles[1].classList.contains("hovered"), true, "matrix hover marks both pair endpoints");
hitgrid.handlers.mouseleave();
assert.equal(hoverLayer.getAttribute("visibility"), "hidden", "matrix leave must hide the crosshair layer");
assert.equal(tooltip.style.display, "none", "matrix leave must hide the value tooltip");
assert.equal(varnaSvg.circles[0].classList.contains("hovered"), false, "matrix leave must clear linked VARNA hover");
assert.deepEqual(JSON.parse(JSON.stringify(selectCalls[0])), {
  data: [{ struct_asym_id: "HA", start_residue_number: 1, end_residue_number: 2, color: { r: 200, g: 200, b: 200 }, focus: true }],
  nonSelectedColor: { r: 255, g: 255, b: 255 },
});
controller.selectAxis("i", 0);
assert.deepEqual(JSON.parse(JSON.stringify(selectCalls[1].nonSelectedColor)), { r: 255, g: 255, b: 255 });
assert.equal(controller.state.selected.axis, "i");
assert.equal(controller.state.selected.index, 0);
assert.deepEqual(intensityMarks.map((mark) => mark.getAttribute("data-value")), ["", "-6"], "E residue intensity merges its valid row and column instead of reading hidden cells");
assert.equal(baseMarks[0].classList.contains("selected"), true, "selection uses the existing Workbench residue-mark state");
assert.equal(intensityMarks[0].classList.contains("selected"), true, "selection stays linked across sequence and intensity rows");
assert.equal(baseMarks[0].getAttribute("aria-pressed"), "true", "selected sequence cell exposes pressed state");
assert.equal(intensityMarks[0].getAttribute("aria-pressed"), "true", "selected intensity cell exposes pressed state");
const varnaHits = descendants(varnaSvg, (node) => String(node.getAttribute("class") || "").split(/\s+/).includes("varna-hit"));
assert.equal(varnaHits.length, 2, "EF VARNA uses the same per-residue hit layer as ordinary Case pages");
assert.deepEqual(varnaSvg.circles.map((circle) => circle.getAttribute("data-residue-key")), linkedResidues.map((row) => row.residueKey));
assert.equal(varnaSvg.handlers.click, undefined, "EF must not use nearest-circle SVG click scanning");
varnaHits[1].handlers.click({ preventDefault() {} });
assert.equal(controller.state.selected.index, 1, "clicking a VARNA base label must select its nearest nucleotide circle");
assert.equal(varnaSvg.circles[1].classList.contains("selected"), true, "VARNA selection uses the shared locked state");
assert.notEqual(varnaSvg.circles[1].getAttribute("fill"), "var(--selected)", "VARNA selection does not overwrite the intensity fill");

varnaHits[0].handlers.mousemove({ clientX: 5, clientY: 5 });
assert.equal(baseMarks[0].classList.contains("hovered"), true, "VARNA hover links back to 1D");
assert.equal(hoverLayer.getAttribute("visibility"), "visible", "VARNA hover links back to the heatmap guides");
varnaHits[0].handlers.mouseleave();
assert.equal(baseMarks[0].classList.contains("hovered"), false, "VARNA mouseleave clears hover without clearing selection");
assert.equal(varnaSvg.circles[1].classList.contains("selected"), true, "hover clear preserves locked selection");

assert.equal(typeof molstarHost.handlers["PDB.molstar.click"], "function", "3D host must listen for PDBe Mol* residue clicks");
molstarHost.handlers["PDB.molstar.click"]({
  detail: {
    label_asym_id: "HA",
    auth_asym_id: "a",
    label_seq_id: 1,
  },
});
assert.equal(controller.state.selected.index, 0, "clicking a 3D residue must select its mapped matrix axis");
assert.equal(controller.state.selected.source, "3d", "3D selection must retain its interaction source");
assert.equal(varnaSvg.circles[0].classList.contains("selected"), true, "3D selection must update the linked VARNA residue");
assert.equal(sequenceHost.querySelector(".selected")?.getAttribute("data-pdb-pos"), "1", "3D selection must update the 1D track");
assert.equal(typeof molstarHost.handlers["PDB.molstar.mouseover"], "function", "3D host must listen for residue hover");
molstarHost.handlers["PDB.molstar.mouseover"]({ detail: { label_asym_id: "HA", auth_asym_id: "a", label_seq_id: 2, auth_seq_id: 999 } });
assert.equal(varnaSvg.circles[1].classList.contains("hovered"), true, "3D label identity hovers the matching VARNA residue");
molstarHost.handlers["PDB.molstar.mouseout"]();
assert.equal(varnaSvg.circles[1].classList.contains("hovered"), false, "3D mouseout clears linked hover");
assert.equal(core.pdbPositionFromMolstarEvent({ eventData: { auth_asym_id: "a", seq_id: 2, auth_seq_id: 999 } }, chainPayload.header), 2, "PDBe Molstar seq_id is treated as label_seq_id");
assert.equal(core.pdbPositionFromMolstarEvent({ detail: { auth_asym_id: "a", auth_seq_id: 999 } }, chainPayload.header), null, "auth numbering is never guessed as labelSeqId");

controller.clearSelection("keyboard-test");
let matrixEnterPrevented = false;
hitgrid.handlers.keydown({ key: "Enter", preventDefault() { matrixEnterPrevented = true; } });
assert.equal(matrixEnterPrevented, true, "Enter activates the first scientifically displayed heatmap cell");
assert.equal(controller.state.selectedKeys.length, 2, "heatmap keyboard selection locks both pair endpoints");
let matrixEscapePrevented = false;
hitgrid.handlers.keydown({ key: "Escape", preventDefault() { matrixEscapePrevented = true; } });
assert.equal(matrixEscapePrevented, true, "Escape clears the heatmap selection without browser default behavior");
assert.equal(controller.state.selected, null);
assert.deepEqual(intensityMarks.map((mark) => mark.getAttribute("data-value")), ["", ""], "clear restores the 1D intensity baseline");

const fPayload = {
  header: {
    pdb_id: "8QO5",
    chain: "A",
    label_asym_id: "A",
    family: "F",
    n_rows: 2,
    n_cols: 4,
    value_min: -1,
    value_max: 8,
    render_scope: "mapped_chain",
    focus_chain: true,
  },
  axis_i: [
    { matrix_index: 0, pdb_pos: 10, varna_index: 0, observed: true, base: "A" },
    { matrix_index: 1, pdb_pos: 20, varna_index: 1, observed: true, base: "C" },
  ],
  axis_j: [
    { matrix_index: 0, pdb_pos: 10, varna_index: 0, observed: true, base: "A" },
    { matrix_index: 1, pdb_pos: 20, varna_index: 1, observed: true, base: "C" },
    { matrix_index: 2, pdb_pos: 30, varna_index: 2, observed: true, base: "G" },
    { matrix_index: 3, pdb_pos: 40, varna_index: 3, observed: true, base: "U" },
  ],
  cells: [
    [0, 0, 1], [0, 1, 2], [0, 2, 3], [0, 3, 4],
    [1, 0, 5], [1, 1, 6], [1, 2, 7], [1, 3, 8],
  ],
};
const fSequenceHost = new FakeElement("host");
const fHeatmapHost = new FakeElement("host");
const fVarnaHost = new FakeElement("host");
const fVarnaSvg = new FakeElement("svg");
fVarnaSvg.circles = Array.from({ length: 4 }, (_, index) => {
  const circle = new FakeElement("circle");
  circle.getBoundingClientRect = () => ({ left: index * 20, top: index * 20, width: 10, height: 10 });
  return circle;
});
fVarnaHost.appendChild(fVarnaSvg);
const fMolstarHost = new FakeElement("host");
const fInteractions = [];
const fSelectCalls = [];
const fResidues = [10, 20, 30, 40].map((labelSeqId, index) => ({
  chainKey: "8QO5|chain|A",
  residueKey: `8QO5|chain|A|${labelSeqId}`,
  labelSeqId,
  parentBase: "ACGU"[index],
}));
const fController = integrationSandbox.window.createEfHeatmap({
  sequenceHost: fSequenceHost,
  heatmapHost: fHeatmapHost,
  varnaHost: fVarnaHost,
  molstarHost: fMolstarHost,
  molstarPlugin: { visual: { select(args) { fSelectCalls.push(args); }, highlight() {}, clearHighlight() {} } },
  payload: fPayload,
  residues: fResidues,
  onInteraction(event) { fInteractions.push(event); },
});
assert.deepEqual(JSON.parse(JSON.stringify(fSelectCalls[0].data)), [{
  struct_asym_id: "A", start_residue_number: 10, end_residue_number: 40,
  color: { r: 200, g: 200, b: 200 }, focus: true,
}], "F initial focus spans the observed union of i and longer j axes");
const fTrack = fSequenceHost.querySelector(".ef-sequence-track");
const fBases = descendants(fTrack, (node) => node.getAttribute("data-track-kind") === "mapped_chain_sequence");
const fIntensities = descendants(fTrack, (node) => node.getAttribute("data-track-kind") === "ef_intensity");
assert.equal(fBases.length, 4, "F sequence track follows the longer j axis");
assert.equal(descendants(fHeatmapHost.querySelector(".ef-cells"), (node) => node.name === "rect").length, 8, "F renderer preserves every rectangular cell");

fController.selectCell(0, 1);
const firstPairSignature = fController.state.selected.signature;
fController.selectCell(1, 3);
assert.notEqual(fController.state.selected.signature, firstPairSignature, "selecting a different F pair replaces the previous pair instead of clearing it");
assert.deepEqual(JSON.parse(JSON.stringify(fController.state.selectedCell)), { i_index: 1, j_index: 3 });
fController.clearSelection("pair-replacement-test");
assert.deepEqual(fIntensities.map((mark) => mark.getAttribute("data-value")), ["", "", "", ""], "clearing a replaced pair restores F intensity cells");

fController.selectCell(1, 2);
assert.equal(fController.state.selected.axis, "i", "matrix selection locks its i row");
assert.equal(fController.state.selected.source, "matrix");
assert.deepEqual(fIntensities.map((mark) => mark.getAttribute("data-value")), ["5", "6", "7", "8"], "i selection renders the full j-axis matrix row");

fBases[2].handlers.click();
assert.equal(fController.state.selected.axis, "j", "clicking a j-only sequence residue selects the j axis");
assert.equal(fController.state.selected.index, 2);
assert.equal(fController.state.selected.source, "sequence");
assert.deepEqual(fIntensities.map((mark) => mark.getAttribute("data-value")), ["3", "7", "", ""], "j selection renders the i-axis column and leaves j-only positions blank");
assert.ok(fSelectCalls.at(-1).data.some((target) => target.start_residue_number === 30 && target.color.r === 155), "F j-only selection includes the selected residue itself in Mol* with selected styling");

let enterPrevented = false;
fBases[3].handlers.keydown({ key: "Enter", preventDefault() { enterPrevented = true; } });
assert.equal(enterPrevented, true, "Enter activates a sequence cell without browser default behavior");
assert.equal(fController.state.selected.index, 3);
let spacePrevented = false;
fIntensities[2].handlers.keydown({ key: " ", preventDefault() { spacePrevented = true; } });
assert.equal(spacePrevented, true, "Space activates an intensity cell without scrolling");
assert.equal(fController.state.selected.index, 2);

const fVarnaHits = descendants(fVarnaSvg, (node) => String(node.getAttribute("class") || "").split(/\s+/).includes("varna-hit"));
fVarnaHits[2].handlers.click({ preventDefault() {} });
assert.equal(fController.state.selected, null, "repeating the same residue selection clears the linked state");
let varnaEnterPrevented = false;
fVarnaHits[2].handlers.keydown({ key: "Enter", preventDefault() { varnaEnterPrevented = true; } });
assert.equal(varnaEnterPrevented, true, "VARNA Enter activates the same residue path as click");
assert.equal(fController.state.selected.axis, "j");
assert.equal(fController.state.selected.index, 2);
assert.equal(fController.state.selected.source, "varna");
assert.deepEqual(fIntensities.map((mark) => mark.getAttribute("data-value")), ["3", "7", "", ""], "VARNA uses the same F column intensity slice");

fMolstarHost.handlers["PDB.molstar.click"]({ detail: { label_asym_id: "A", auth_asym_id: "A", label_seq_id: 40 } });
assert.equal(fController.state.selected.axis, "j");
assert.equal(fController.state.selected.index, 3);
assert.equal(fController.state.selected.source, "3d");
assert.deepEqual(fIntensities.map((mark) => mark.getAttribute("data-value")), ["4", "8", "", ""], "3D uses the same F column intensity slice");
assert.ok(fInteractions.some((event) => event.source === "matrix"), "matrix path emits a normalized interaction event");
assert.ok(fInteractions.some((event) => event.source === "sequence"), "sequence path emits a normalized interaction event");
assert.ok(fInteractions.some((event) => event.source === "varna"), "VARNA path emits a normalized interaction event");
assert.ok(fInteractions.some((event) => event.source === "3d"), "3D path emits a normalized interaction event");

// Exercise the actual download handler with a detached DOM and captured Blob.
const blobs = [];
const exportedTrees = [];
const scheduledCleanup = [];
integrationSandbox.Blob = Blob;
integrationSandbox.URL = URL;
integrationSandbox.console = console;
integrationSandbox.XMLSerializer = class {
  serializeToString(tree) { exportedTrees.push(tree); return JSON.stringify(treeSnapshot(tree)); }
};
integrationSandbox.window.getComputedStyle = () => ({getPropertyValue: () => "none"});
integrationSandbox.window.setTimeout = callback => scheduledCleanup.push(callback);
integrationSandbox.document.body = new FakeElement("body");
integrationSandbox.URL = {
  createObjectURL(blob) { blobs.push(blob); return "blob:test-export"; },
  revokeObjectURL() {},
};
function treeSnapshot(node) {
  return {name:node.name,attrs:node.attrs,text:node.textContent,children:node.children.map(treeSnapshot)};
}
const dataLink = descendants(heatmapHost, node => node.name === "a")[0];
assert.equal(dataLink.href, "https://example.test/entry-cases/cases/9WNR/chains/a/ef-matrix.json.gz");
assert.equal(dataLink.download, "9WNR_a_E_matrix.json.gz", "download preserves case-sensitive chain and matrix family");
for (const [host, expectedCells, family] of [[heatmapHost, 1, "E"], [fHeatmapHost, 8, "F"]]) {
  const button = descendants(host, node => node.name === "button")[0];
  const matrix = host.querySelector(".ef-matrix-svg");
  const before = JSON.stringify(treeSnapshot(matrix));
  button.click();
  assert.equal(host.querySelector(".ef-download-status").textContent, "Heatmap download started.");
  assert.equal(JSON.stringify(treeSnapshot(matrix)), before, "download preserves the live DOM and selection");
  const exported = exportedTrees.at(-1);
  assert.equal(exported.querySelectorAll(".ef-hover, .ef-selection, .ef-hitgrid").length, 0);
  assert.equal(exported.querySelector(".ef-cells").children.length, expectedCells);
  assert.ok(exported.querySelector(".ef-axes"));
  const metadata = JSON.parse(descendants(exported, node => node.name === "metadata")[0].textContent);
  assert.equal(metadata.sourceHeader.family, family);
  assert.equal(metadata.displayedCells, expectedCells);
  assert.ok(descendants(exported, node => node.name === "text").some(node => node.textContent === integrationSandbox.window.FoldBridgeMatrixPublicCopy.signalLegend));
  assert.equal(blobs.at(-1).type, "image/svg+xml;charset=utf-8");
  assert.equal(integrationSandbox.document.body.children.length, 0, "temporary download link is removed");
}
scheduledCleanup.forEach(fn => fn());
console.log("ok - EF chain view uses one 2D/3D coordinate system and exports E/F without changing it");
