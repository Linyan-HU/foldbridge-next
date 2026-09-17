import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { classifyTechniqueFilter, MECHANISM_FAMILIES } from "../src/techniqueFilterModel.js";
import * as WorkbenchPure from "../public/entry-cases/__entry_v3_site__/workbench-pure.mjs";

const {
  PROFILE_PUBLIC_TECHNIQUES_SCHEMA,
  applyPublicTechniqueFilter,
  buildPublicTechniqueModel,
  categoryBadgeMarkup,
  profilePublicTechniqueLabel,
  validateProfilePublicTechniques,
} = WorkbenchPure;

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const PROFILE_IDS = [
  "p-mapped",
  "p-multi",
  "p-partial",
  "p-unmapped",
  "p-background",
  "p-missing",
];

const profileIndex = {
  profiles: PROFILE_IDS.map((profileId) => ({
    profile_id: profileId,
    pair_id: `pair-${profileId}`,
  })),
};

const categoryById = new Map(MECHANISM_FAMILIES.map((category) => [category.id, category]));

function classifyTechniqueToken(label) {
  return classifyTechniqueFilter(label).methods[0];
}

function mappedMethod(label, categoryId) {
  const category = categoryById.get(categoryId);
  return {
    label,
    mappingStatus: "mapped",
    categoryId,
    categoryLabel: category.label,
    categoryShortLabel: category.shortLabel,
  };
}

function unmappedMethod(label) {
  return {
    label,
    mappingStatus: "unmapped",
    categoryId: null,
    categoryLabel: null,
    categoryShortLabel: null,
  };
}

function makePayload() {
  return {
    schemaVersion: "profile-public-techniques.v1",
    pdbId: "9WNR",
    authChain: "a",
    profileCount: PROFILE_IDS.length,
    profiles: [
      {
        profileId: "p-mapped",
        classificationStatus: "mapped",
        methods: [mappedMethod("DMS-seq", "dms")],
      },
      {
        profileId: "p-multi",
        classificationStatus: "mapped",
        methods: [mappedMethod("DMS-MaPseq", "dms"), mappedMethod("SHAPE-MaP", "shape")],
      },
      {
        profileId: "p-partial",
        classificationStatus: "partially_mapped",
        methods: [mappedMethod("DMS", "dms"), unmappedMethod("Mystery-seq")],
      },
      {
        profileId: "p-unmapped",
        classificationStatus: "unmapped",
        methods: [unmappedMethod("NoMap-seq")],
      },
      {
        profileId: "p-background",
        classificationStatus: "background",
        methods: [],
      },
      {
        profileId: "p-missing",
        classificationStatus: "missing",
        methods: [],
      },
    ],
  };
}

function makeContext(overrides = {}) {
  return {
    pdbId: "9WNR",
    authChain: "a",
    categories: MECHANISM_FAMILIES,
    classifyTechniqueToken,
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

class TinyClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return new Set(String(this.element.className || "").split(/\s+/).filter(Boolean));
  }

  contains(name) {
    return this.values().has(name);
  }

  toggle(name, force) {
    const values = this.values();
    const enabled = force === undefined ? !values.has(name) : Boolean(force);
    if (enabled) values.add(name);
    else values.delete(name);
    this.element.className = [...values].join(" ");
    return enabled;
  }
}

class TinyElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.classList = new TinyClassList(this);
    this.hidden = false;
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertAdjacentElement(position, child) {
    assert.equal(position, "afterend");
    const index = this.parentElement.children.indexOf(this);
    child.parentElement = this.parentElement;
    this.parentElement.children.splice(index + 1, 0, child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  matches(selector) {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector === "li[role='option']") {
      return this.tagName === "LI" && this.getAttribute("role") === "option";
    }
    return false;
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function makeTinySelectorDom() {
  const document = { createElement: (tagName) => new TinyElement(tagName) };
  const parent = new TinyElement("label");
  const select = new TinyElement("select");
  parent.appendChild(select);
  return { document, parent, select };
}

function expectInvalid(mutator, pattern) {
  const payload = makePayload();
  mutator(payload);
  assert.throws(
    () => validateProfilePublicTechniques(payload, profileIndex, makeContext()),
    pattern,
  );
}

test("exports the fixed sidecar schema version", () => {
  assert.equal(PROFILE_PUBLIC_TECHNIQUES_SCHEMA, "profile-public-techniques.v1");
});

test("validates the sidecar and builds one ordered public meta record per profile", () => {
  const payload = makePayload();
  const model = validateProfilePublicTechniques(payload, profileIndex, makeContext());

  assert.equal(model.profileMeta.size, profileIndex.profiles.length);
  assert.equal(model.profileMeta.get("p-multi").categoryIds.size, 2);
  assert.deepEqual([...model.profileMeta.get("p-multi").categoryIds], ["dms", "shape"]);
  assert.equal(model.orderedProfileIds.filter((id) => id === "p-multi").length, 1);
  assert.deepEqual(model.orderedProfileIds, PROFILE_IDS);
  assert.ok(model.profileMeta instanceof Map);
  assert.ok(model.profileMeta.get("p-multi").categoryIds instanceof Set);
  assert.ok(model.profileMeta.get("p-partial").methodLabels instanceof Set);

  const rebuilt = buildPublicTechniqueModel(payload, MECHANISM_FAMILIES);
  assert.deepEqual(rebuilt.orderedProfileIds, PROFILE_IDS);
  assert.deepEqual([...rebuilt.profileMeta.get("p-multi").categoryIds], ["dms", "shape"]);
});

test("filters categories and public methods with cross-level OR while preserving index order", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());

  assert.deepEqual(
    [...applyPublicTechniqueFilter(model, { categories: new Set(["shape"]), methods: new Set() })],
    ["p-multi"],
  );
  assert.deepEqual(
    [...applyPublicTechniqueFilter(model, { categories: new Set(["dms"]), methods: new Set() })],
    ["p-mapped", "p-multi", "p-partial"],
  );
  assert.deepEqual(
    [...applyPublicTechniqueFilter(model, {
      categories: new Set(["shape"]),
      methods: new Set(["NoMap-seq"]),
    })],
    ["p-multi", "p-unmapped"],
  );
  assert.deepEqual(
    [...applyPublicTechniqueFilter(model, { categories: new Set(), methods: new Set(["Mystery-seq"]) })],
    ["p-partial"],
  );
  assert.deepEqual([...applyPublicTechniqueFilter(model, {})], PROFILE_IDS);
});

test("rejects non-object filter selections instead of treating them as empty", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  for (const selection of [null, "shape", [], new Map()]) {
    assert.throws(
      () => applyPublicTechniqueFilter(model, selection),
      /selection must be a plain object/i,
    );
  }
  assert.deepEqual([...applyPublicTechniqueFilter(model, undefined)], PROFILE_IDS);
});

test("requires explicitly supplied filter dimensions to be real Sets", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const fakeSet = { size: 0, has: () => false };
  const fakeSetPrototype = Object.create(Set.prototype);
  for (const dimension of ["categories", "methods"]) {
    for (const value of [undefined, false, null, [], fakeSet, fakeSetPrototype]) {
      assert.throws(
        () => applyPublicTechniqueFilter(model, { [dimension]: value }),
        new RegExp(`${dimension} must be a Set`, "i"),
      );
    }
    for (const value of [new Set([""]), new Set(["   "]), new Set([7])]) {
      assert.throws(
        () => applyPublicTechniqueFilter(model, { [dimension]: value }),
        new RegExp(`${dimension}.*non-empty strings`, "i"),
      );
    }
  }
});

test("rejects unknown string and symbol keys in the optional selection schema", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  for (const field of ["techniques", "category", "typo"]) {
    assert.throws(
      () => applyPublicTechniqueFilter(model, { [field]: new Set() }),
      /unknown selection field/i,
    );
  }
  const symbolField = Symbol("typo");
  assert.throws(
    () => applyPublicTechniqueFilter(model, { [symbolField]: new Set() }),
    /unknown selection field.*Symbol\(typo\)/i,
  );
});

test("copies genuine Sets before filtering so own size and has properties cannot shadow Set behavior", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const categories = new Set(["shape"]);
  Object.defineProperty(categories, "size", { value: 0 });
  Object.defineProperty(categories, "has", { value: () => false });

  assert.deepEqual(
    [...applyPublicTechniqueFilter(model, { categories })],
    ["p-multi"],
  );
});

test("creates neutral public profile labels for every classification state", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const profileFor = (profileId) => profileIndex.profiles.find((profile) => profile.profile_id === profileId);

  assert.equal(
    profilePublicTechniqueLabel(profileFor("p-mapped"), model.profileMeta.get("p-mapped")),
    "pair-p-mapped | DMS-seq",
  );
  assert.equal(
    profilePublicTechniqueLabel(profileFor("p-multi"), model.profileMeta.get("p-multi")),
    "pair-p-multi | DMS-MaPseq, SHAPE-MaP",
  );
  assert.equal(
    profilePublicTechniqueLabel(profileFor("p-partial"), model.profileMeta.get("p-partial")),
    "pair-p-partial | DMS, Mystery-seq",
  );
  assert.equal(
    profilePublicTechniqueLabel(profileFor("p-unmapped"), model.profileMeta.get("p-unmapped")),
    "pair-p-unmapped | NoMap-seq | Technique category unavailable",
  );
  assert.equal(
    profilePublicTechniqueLabel(profileFor("p-background"), model.profileMeta.get("p-background")),
    "pair-p-background | Background / control",
  );
  assert.equal(
    profilePublicTechniqueLabel(profileFor("p-missing"), model.profileMeta.get("p-missing")),
    "pair-p-missing | Technique metadata unavailable",
  );
  assert.equal(
    profilePublicTechniqueLabel(
      { profile_id: "p-mapped", label: "Existing profile label" },
      model.profileMeta.get("p-mapped"),
    ),
    "Existing profile label | DMS-seq",
  );

  for (const profile of profileIndex.profiles) {
    assert.doesNotMatch(
      profilePublicTechniqueLabel(profile, model.profileMeta.get(profile.profile_id)),
      /\b(?:Family|EF|Tier|LSS)\b/,
    );
  }
});

test("renders each public category badge once in taxonomy order and escapes HTML", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  assert.equal(
    categoryBadgeMarkup(model.profileMeta.get("p-multi")),
    '<span class="category-badge" data-category="dms" title="DMS-based methods">DMS</span>'
      + '<span class="category-badge" data-category="shape" title="SHAPE-based methods">SHAPE</span>',
  );
  assert.equal(categoryBadgeMarkup(model.profileMeta.get("p-background")), "");
  assert.equal(categoryBadgeMarkup(), "");

  const escaped = categoryBadgeMarkup({
    categories: [{ id: 'cat"<&', label: 'A & "B" <C>', shortLabel: "<Short>" }],
  });
  assert.equal(
    escaped,
    '<span class="category-badge" data-category="cat&quot;&lt;&amp;" title="A &amp; &quot;B&quot; &lt;C&gt;">&lt;Short&gt;</span>',
  );
  assert.doesNotMatch(escaped, /\b(?:Family|EF|Tier|LSS)\b/);
});

test("rejects a missing, null, array, or otherwise non-object sidecar", () => {
  assert.throws(
    () => validateProfilePublicTechniques(undefined, profileIndex, makeContext()),
    /sidecar is required/i,
  );
  assert.throws(
    () => validateProfilePublicTechniques(null, profileIndex, makeContext()),
    /sidecar is required/i,
  );
  for (const payload of [[], "sidecar", 7]) {
    assert.throws(
      () => validateProfilePublicTechniques(payload, profileIndex, makeContext()),
      /sidecar must be an object/i,
    );
  }
});

test("rejects schema, PDB, and chain drift byte-for-byte", () => {
  expectInvalid((payload) => { payload.schemaVersion = "profile-public-techniques.v2"; }, /schemaVersion/i);
  expectInvalid((payload) => { payload.pdbId = "9wnr"; }, /pdbId/i);
  expectInvalid((payload) => { payload.authChain = "A"; }, /authChain/i);
});

test("rejects invalid PDB and chain identities even when payload and context agree", () => {
  const invalidValuesByField = {
    pdbId: [null, 7, true, "", "   ", " 9WNR "],
    authChain: [null, 7, true, "", "   ", " a "],
  };
  for (const [field, invalidValues] of Object.entries(invalidValuesByField)) {
    for (const value of invalidValues) {
      const payload = makePayload();
      const context = makeContext();
      payload[field] = value;
      context[field] = value;
      assert.throws(
        () => validateProfilePublicTechniques(payload, profileIndex, context),
        new RegExp(`${field} must be a non-empty string without surrounding whitespace`, "i"),
      );
    }
  }
});

test("rejects profile-count drift against both the sidecar and profile index", () => {
  expectInvalid((payload) => { payload.profileCount -= 1; }, /profileCount/i);

  const shortIndex = { profiles: profileIndex.profiles.slice(0, -1) };
  assert.throws(
    () => validateProfilePublicTechniques(makePayload(), shortIndex, makeContext()),
    /profileCount/i,
  );
});

test("rejects reordered, duplicate, missing, and extra profile ids", () => {
  expectInvalid((payload) => {
    [payload.profiles[0], payload.profiles[1]] = [payload.profiles[1], payload.profiles[0]];
  }, /order/i);
  expectInvalid((payload) => { payload.profiles[1].profileId = payload.profiles[0].profileId; }, /duplicate/i);
  expectInvalid((payload) => { payload.profiles.at(-1).profileId = "p-extra"; }, /missing|extra|coverage/i);

  const payloadWithExtra = makePayload();
  payloadWithExtra.profiles.push({
    profileId: "p-extra",
    classificationStatus: "missing",
    methods: [],
  });
  payloadWithExtra.profileCount += 1;
  assert.throws(
    () => validateProfilePublicTechniques(payloadWithExtra, profileIndex, makeContext()),
    /profileCount|extra/i,
  );

  const payloadWithMissing = makePayload();
  payloadWithMissing.profiles.pop();
  payloadWithMissing.profileCount -= 1;
  assert.throws(
    () => validateProfilePublicTechniques(payloadWithMissing, profileIndex, makeContext()),
    /profileCount|missing/i,
  );
});

test("rejects unknown and internal fields at every sidecar level", () => {
  for (const [level, field] of [
    ["top", "family"],
    ["top", "ef"],
    ["profile", "tier"],
    ["profile", "lss"],
    ["method", "family"],
    ["method", "ef"],
  ]) {
    expectInvalid((payload) => {
      if (level === "top") payload[field] = "internal";
      if (level === "profile") payload.profiles[0][field] = "internal";
      if (level === "method") payload.profiles[0].methods[0][field] = "internal";
    }, /unknown field/i);
  }
});

test("rejects invalid classification statuses and method combinations", () => {
  expectInvalid((payload) => { payload.profiles[0].classificationStatus = "classified"; }, /classificationStatus/i);
  expectInvalid((payload) => { payload.profiles[0].methods = []; }, /mapped.*methods/i);
  expectInvalid((payload) => { payload.profiles[0].methods.push(unmappedMethod("Unknown")); }, /mapped.*methods/i);
  expectInvalid((payload) => {
    payload.profiles[2].methods = [mappedMethod("DMS", "dms")];
  }, /partially_mapped.*methods/i);
  expectInvalid((payload) => {
    payload.profiles[3].methods = [mappedMethod("DMS", "dms")];
  }, /unmapped.*methods/i);
  expectInvalid((payload) => {
    payload.profiles[4].methods = [unmappedMethod("Control")];
  }, /background.*methods/i);
  expectInvalid((payload) => {
    payload.profiles[5].methods = [unmappedMethod("Unknown")];
  }, /missing.*methods/i);
});

test("rejects mapped category id and public-label drift", () => {
  expectInvalid((payload) => { payload.profiles[0].methods[0].categoryId = "unknown"; }, /categoryId/i);
  expectInvalid((payload) => { payload.profiles[0].methods[0].categoryLabel = "DMS drift"; }, /categoryLabel/i);
  expectInvalid((payload) => { payload.profiles[0].methods[0].categoryShortLabel = "DMS drift"; }, /categoryShortLabel/i);
  expectInvalid((payload) => { payload.profiles[0].methods[0].categoryId = ""; }, /categoryId/i);
});

test("closes mapped and unmapped method labels against the injected shared classifier", () => {
  expectInvalid((payload) => {
    payload.profiles[0].methods[0].label = "SHAPE-MaP";
  }, /canonical method.*category|category.*canonical method|classifier.*category/i);
  expectInvalid((payload) => {
    payload.profiles[0].methods[0].label = "Fabricated-seq";
  }, /mapped method.*(?:canonical|classified as unmapped)/i);
  expectInvalid((payload) => {
    payload.profiles[3].methods[0].label = "DMS";
  }, /unmapped method.*(?:canonical|classified as mapped)/i);
});

test("uses the shared classifier output rather than taxonomy declaration aliases", () => {
  const aliasCases = [
    ["Cotranscriptional_SHAPE-seq", "SHAPE-Seq", "shape"],
    ["Nuc-SHAPE-Structure-Seq", "SHAPE-Seq", "shape"],
    ["icLASER", "LASER-seq", "nucleotide"],
  ];

  for (const [alias, canonical, categoryId] of aliasCases) {
    const mappedAlias = makePayload();
    mappedAlias.profiles[0].methods = [mappedMethod(alias, categoryId)];
    assert.throws(
      () => validateProfilePublicTechniques(mappedAlias, profileIndex, makeContext()),
      /canonical label/i,
    );

    const unmappedAlias = makePayload();
    unmappedAlias.profiles[3].methods = [unmappedMethod(alias)];
    assert.throws(
      () => validateProfilePublicTechniques(unmappedAlias, profileIndex, makeContext()),
      /unmapped method.*(?:classified as mapped|canonical method)/i,
    );

    const canonicalPayload = makePayload();
    canonicalPayload.profiles[0].methods = [mappedMethod(canonical, categoryId)];
    assert.doesNotThrow(
      () => validateProfilePublicTechniques(canonicalPayload, profileIndex, makeContext()),
    );
  }

  const unknownPayload = makePayload();
  unknownPayload.profiles[3].methods = [unmappedMethod("Fabricated-seq")];
  assert.doesNotThrow(
    () => validateProfilePublicTechniques(unknownPayload, profileIndex, makeContext()),
  );
});

test("fails loudly when the shared single-token classifier is unavailable or malformed", () => {
  for (const classifyTechniqueTokenValue of [undefined, null, "classifier"]) {
    assert.throws(
      () => validateProfilePublicTechniques(
        makePayload(),
        profileIndex,
        makeContext({ classifyTechniqueToken: classifyTechniqueTokenValue }),
      ),
      /classifyTechniqueToken must be a function/i,
    );
  }
  assert.throws(
    () => validateProfilePublicTechniques(
      makePayload(),
      profileIndex,
      makeContext({ classifyTechniqueToken: () => { throw new Error("classifier exploded"); } }),
    ),
    /classifyTechniqueToken failed.*classifier exploded/i,
  );
  for (const malformedResult of [null, [], {}, { label: "DMS", mappingStatus: "mapped" }]) {
    assert.throws(
      () => validateProfilePublicTechniques(
        makePayload(),
        profileIndex,
        makeContext({ classifyTechniqueToken: () => malformedResult }),
      ),
      /malformed classifyTechniqueToken result/i,
    );
  }
});

test("requires every unmapped category field to be explicitly null", () => {
  for (const field of ["categoryId", "categoryLabel", "categoryShortLabel"]) {
    expectInvalid((payload) => { payload.profiles[3].methods[0][field] = "not-null"; }, new RegExp(field, "i"));
  }

  const payload = makePayload();
  delete payload.profiles[3].methods[0].categoryId;
  assert.throws(
    () => validateProfilePublicTechniques(payload, profileIndex, makeContext()),
    /missing field.*categoryId|categoryId.*required/i,
  );
});

test("rejects duplicate or empty method labels and invalid mapping statuses", () => {
  expectInvalid((payload) => {
    payload.profiles[1].methods.push(clone(payload.profiles[1].methods[0]));
  }, /duplicate method label/i);
  expectInvalid((payload) => { payload.profiles[0].methods[0].label = ""; }, /method label/i);
  expectInvalid((payload) => { payload.profiles[0].methods[0].label = "   "; }, /method label/i);
  expectInvalid((payload) => { payload.profiles[0].methods[0].mappingStatus = "partial"; }, /mappingStatus/i);
});

test("rejects duplicate category ids in the supplied taxonomy", () => {
  const categories = MECHANISM_FAMILIES.map((category) => ({ ...category }));
  categories[1] = { ...categories[1], id: categories[0].id };
  assert.throws(
    () => validateProfilePublicTechniques(makePayload(), profileIndex, makeContext({ categories })),
    /duplicate category id/i,
  );
});

test("does not use category technique declarations as a canonical method registry", () => {
  const categories = MECHANISM_FAMILIES.map(({ id, label, shortLabel }) => ({ id, label, shortLabel }));
  assert.doesNotThrow(
    () => validateProfilePublicTechniques(makePayload(), profileIndex, makeContext({ categories })),
  );
});

test("ordinary Case source uses the strict public sidecar and has no confidence-evidence taxonomy join", () => {
  const workbench = read("public/entry-cases/__entry_v3_site__/workbench.js");
  const pure = read("public/entry-cases/__entry_v3_site__/workbench-pure.mjs");

  assert.match(workbench, /profile-public-techniques\.json\.gz/);
  assert.match(workbench, /resolvePublicProfileSelector/);
  assert.match(pure, /validateProfilePublicTechniques/);
  assert.doesNotMatch(workbench, /\.\.\/\.\.\/confidence-evidence\.json/);
  assert.doesNotMatch(workbench, /PROFILE_FAMILY_ORDER|Unassigned family|Family \$\{/);
  assert.doesNotMatch(workbench, /state\.(?:techniqueByProfile|evidenceRows)/);
  assert.match(workbench, /mountTechniqueFilter\(\)/);
});

test("ordinary and matrix Case entry points are separated by the explicit E/F link", () => {
  assert.equal(typeof WorkbenchPure.parseCaseMatrixFamilyQuery, "function");
  assert.equal(WorkbenchPure.parseCaseMatrixFamilyQuery("?profileId=x"), null);
  assert.equal(WorkbenchPure.parseCaseMatrixFamilyQuery("?family=E"), "E");
  assert.equal(WorkbenchPure.parseCaseMatrixFamilyQuery("?family=F&profileId=x"), "F");
  assert.throws(() => WorkbenchPure.parseCaseMatrixFamilyQuery("?family="), /invalid.*family/i);
  assert.throws(() => WorkbenchPure.parseCaseMatrixFamilyQuery("?family=A"), /invalid.*family/i);
  assert.throws(
    () => WorkbenchPure.parseCaseMatrixFamilyQuery("?family=E&family=F"),
    /exactly once/i,
  );
  assert.equal(typeof WorkbenchPure.resolveCaseViewMode, "function");
  const manifest = {
    chains: {
      C: {
        chainId: "C",
        efMatrixPath: "chains/C/ef-matrix.json.gz",
      },
    },
  };

  assert.deepEqual(
    WorkbenchPure.resolveCaseViewMode({ manifest, chainId: "C", requestedFamily: null }),
    { mode: "profiles", family: null, matrixField: null },
    "a normal Case link must keep all profiles available even when a matrix artifact also exists",
  );
  assert.deepEqual(
    WorkbenchPure.resolveCaseViewMode({ manifest, chainId: "C", requestedFamily: "E" }),
    { mode: "matrix", family: "E", matrixField: "efMatrixPath" },
  );
  const fManifest = {
    chains: {
      C: {
        chainId: "C",
        efMatrixPathF: "chains/C/ef-matrix.F.json.gz",
      },
    },
  };
  assert.deepEqual(
    WorkbenchPure.resolveCaseViewMode({ manifest: fManifest, chainId: "C", requestedFamily: "F" }),
    { mode: "matrix", family: "F", matrixField: "efMatrixPathF" },
  );
  assert.throws(
    () => WorkbenchPure.resolveCaseViewMode({ manifest, chainId: "C", requestedFamily: "F" }),
    /efMatrixPathF/i,
    "an unavailable requested matrix must fail loudly instead of changing modes",
  );
  assert.throws(
    () => WorkbenchPure.resolveCaseViewMode({ manifest, chainId: "C", requestedFamily: "A" }),
    /unsupported.*family/i,
  );
  assert.throws(
    () => WorkbenchPure.resolveCaseViewMode({ manifest, chainId: "C", requestedFamily: "" }),
    /unsupported.*family/i,
    "an explicitly empty family query is invalid rather than an absent query",
  );
  assert.throws(
    () => WorkbenchPure.resolveCaseViewMode({ manifest, chainId: "missing", requestedFamily: null }),
    /selected chain/i,
  );
  assert.throws(
    () => WorkbenchPure.resolveCaseViewMode({ manifest: { chains: {} }, chainId: "__proto__", requestedFamily: null }),
    /selected chain/i,
    "prototype properties are not manifest chains",
  );
  assert.throws(
    () => WorkbenchPure.resolveCaseViewMode({
      manifest: { chains: { C: { chainId: "B", efMatrixPath: "chains/C/ef-matrix.json.gz" } } },
      chainId: "C",
      requestedFamily: "E",
    }),
    /chainId.*selected chain/i,
    "the selected manifest record must identify itself byte-for-byte",
  );
});

test("sidecar failure preserves every profile in order with neutral public labels", () => {
  assert.equal(typeof WorkbenchPure.buildUnavailablePublicTechniqueModel, "function");
  const unavailable = WorkbenchPure.buildUnavailablePublicTechniqueModel(profileIndex);

  assert.equal(unavailable.profileCount, profileIndex.profiles.length);
  assert.deepEqual(unavailable.orderedProfileIds, PROFILE_IDS);
  assert.deepEqual(
    profileIndex.profiles.map((profile) => (
      profilePublicTechniqueLabel(profile, unavailable.profileMeta.get(profile.profile_id))
    )),
    PROFILE_IDS.map((profileId) => `pair-${profileId} | Technique metadata unavailable`),
  );
  assert.deepEqual(
    PROFILE_IDS.map((profileId) => unavailable.profileMeta.get(profileId).classificationStatus),
    PROFILE_IDS.map(() => "missing"),
  );
});

test("filter options keep the five-category order and expose only canonical mapped methods", () => {
  assert.equal(typeof WorkbenchPure.buildPublicTechniqueFilterOptions, "function");
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const options = WorkbenchPure.buildPublicTechniqueFilterOptions(model, MECHANISM_FAMILIES);

  assert.deepEqual(
    options.categories.map(({ id, enabled }) => [id, enabled]),
    [
      ["dms", true],
      ["shape", true],
      ["cleavage", false],
      ["nucleotide", false],
      ["interaction", false],
    ],
  );
  assert.deepEqual(options.methods, ["DMS-seq", "DMS-MaPseq", "SHAPE-MaP", "DMS"]);
  assert.doesNotMatch(options.methods.join(" "), /Mystery-seq|NoMap-seq/);
});

test("one ordered selector view model drives equal native and custom option sets", () => {
  assert.equal(typeof WorkbenchPure.buildPublicProfileSelectorItems, "function");
  assert.equal(typeof WorkbenchPure.buildPublicProfileSelectMarkup, "function");
  assert.equal(typeof WorkbenchPure.mountPublicProfileSelectorDom, "function");
  assert.equal(typeof WorkbenchPure.selectPublicProfileSelectorOption, "function");

  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const items = WorkbenchPure.buildPublicProfileSelectorItems(profileIndex.profiles, model);
  assert.equal(items.length, PROFILE_IDS.length);
  assert.deepEqual(
    items.map(({ index, profileId, label }) => [index, profileId, label]),
    PROFILE_IDS.map((profileId, index) => [
      index,
      profileId,
      profilePublicTechniqueLabel(profileIndex.profiles[index], model.profileMeta.get(profileId)),
    ]),
  );
  assert.equal(new Set(items.map((item) => item.profileId)).size, PROFILE_IDS.length);
  assert.equal(items[1].categories.length, 2, "multi-category membership stays on one selector item");

  const nativeMarkup = WorkbenchPure.buildPublicProfileSelectMarkup(items);
  assert.equal((nativeMarkup.match(/<option\b/g) || []).length, PROFILE_IDS.length);
  assert.deepEqual(
    [...nativeMarkup.matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)]
      .map((match) => Number(match[1])),
    PROFILE_IDS.map((_, index) => index),
  );

  const tiny = makeTinySelectorDom();
  const mounted = WorkbenchPure.mountPublicProfileSelectorDom(items, tiny);
  const mountedAgain = WorkbenchPure.mountPublicProfileSelectorDom(items, tiny);
  const customOptions = mounted.list.querySelectorAll("li[role='option']");
  assert.equal(mountedAgain.root, mounted.root, "re-mount reuses the one visible selector");
  assert.equal(tiny.parent.querySelectorAll(".profile-dropdown").length, 1);
  assert.equal(tiny.parent.querySelectorAll(".profile-dropdown-trigger").length, 1);
  assert.equal(tiny.parent.querySelectorAll(".profile-dropdown-list").length, 1);
  assert.equal(tiny.select.hidden, true);
  assert.equal(customOptions.length, PROFILE_IDS.length);
  assert.deepEqual(
    customOptions.map((option) => [Number(option.dataset.index), option.dataset.profileId]),
    PROFILE_IDS.map((profileId, index) => [index, profileId]),
  );
  assert.equal((customOptions[1].innerHTML.match(/class="category-badge"/g) || []).length, 2);

  const clicked = customOptions[3];
  const selectedItem = WorkbenchPure.selectPublicProfileSelectorOption(items, tiny.select, clicked);
  assert.equal(Number(tiny.select.value), items[3].index);
  assert.equal(selectedItem.profileId, "p-unmapped");
  clicked.dataset.profileId = "p-wrong";
  assert.throws(
    () => WorkbenchPure.selectPublicProfileSelectorOption(items, tiny.select, clicked),
    /identity mismatch/i,
  );
});

test("selector item construction fails loudly on model count, order, or identity drift", () => {
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const reversed = [...profileIndex.profiles].reverse();
  assert.throws(
    () => WorkbenchPure.buildPublicProfileSelectorItems(reversed, model),
    /order|profileId/i,
  );
  assert.throws(
    () => WorkbenchPure.buildPublicProfileSelectorItems(profileIndex.profiles.slice(1), model),
    /count/i,
  );
  const duplicate = profileIndex.profiles.map((profile) => ({ ...profile }));
  duplicate[1].profile_id = duplicate[0].profile_id;
  assert.throws(
    () => WorkbenchPure.buildPublicProfileSelectorItems(duplicate, model),
    /duplicate/i,
  );
});

test("sidecar fetch or validation errors resolve to N neutral selector items without throwing", () => {
  assert.equal(typeof WorkbenchPure.resolvePublicProfileSelector, "function");
  for (const result of [
    { payload: null, error: new Error("fetch failed") },
    { payload: { schemaVersion: "invalid" }, error: null },
  ]) {
    const resolved = WorkbenchPure.resolvePublicProfileSelector(profileIndex, result, makeContext());
    assert.ok(resolved.error instanceof Error);
    assert.equal(resolved.selectorItems.length, PROFILE_IDS.length);
    assert.deepEqual(resolved.selectorItems.map((item) => item.profileId), PROFILE_IDS);
    assert.deepEqual(
      resolved.selectorItems.map((item) => item.label),
      PROFILE_IDS.map((profileId) => `pair-${profileId} | Technique metadata unavailable`),
    );
  }
});

test("DOM visibility applies category-method OR without reordering and clearing restores all states", () => {
  assert.equal(typeof WorkbenchPure.applyPublicProfileSelectorVisibility, "function");
  const model = validateProfilePublicTechniques(makePayload(), profileIndex, makeContext());
  const items = WorkbenchPure.buildPublicProfileSelectorItems(profileIndex.profiles, model);
  const tiny = makeTinySelectorDom();
  const { list } = WorkbenchPure.mountPublicProfileSelectorDom(items, tiny);
  const options = list.querySelectorAll("li[role='option']");
  const originalIdentity = options.map((option) => [option.dataset.index, option.dataset.profileId]);

  const hits = applyPublicTechniqueFilter(model, {
    categories: new Set(["shape"]),
    methods: new Set(["NoMap-seq"]),
  });
  WorkbenchPure.applyPublicProfileSelectorVisibility(items, options, hits, true);
  assert.deepEqual(
    options.filter((option) => !option.classList.contains("filtered-out"))
      .map((option) => option.dataset.profileId),
    ["p-multi", "p-unmapped"],
  );
  assert.deepEqual(options.map((option) => [option.dataset.index, option.dataset.profileId]), originalIdentity);

  WorkbenchPure.applyPublicProfileSelectorVisibility(items, options, new Set(PROFILE_IDS), false);
  assert.deepEqual(
    options.filter((option) => !option.classList.contains("filtered-out"))
      .map((option) => option.dataset.profileId),
    PROFILE_IDS,
  );
  assert.deepEqual(
    options.slice(3).map((option) => option.dataset.profileId),
    ["p-unmapped", "p-background", "p-missing"],
  );
});
