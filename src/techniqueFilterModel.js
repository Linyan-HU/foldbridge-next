export const TECHNIQUE_TAXONOMY_VERSION = 'entry-technique-taxonomy.v1';

const TECHNIQUE_TOKEN_SEPARATOR = /[;,]/;
const TECHNIQUE_TOKEN_SEPARATOR_SOURCE = '[;,]';

export const MECHANISM_FAMILIES = [
  {
    id: 'dms',
    label: 'DMS-based methods',
    shortLabel: 'DMS',
    techniques: ['DMS', 'DMS-seq', 'Structure-seq', 'Structure-seq2', 'Mod-seq', 'DMS-MaPseq', 'DIM-2P-seq', 'tNet-MaPseq'],
    filterTechniques: ['DMS', 'DMS-seq', 'Structure-seq', 'Structure-seq2', 'Mod-seq', 'DMS-MaPseq', 'DIM-2P-seq']
  },
  {
    id: 'shape',
    label: 'SHAPE-based methods',
    shortLabel: 'SHAPE',
    techniques: ['SHAPE', 'SHAPE-Seq', 'SHAPE-MaP', '1M7', 'BzCN', '2A3', 'NAI-MaP', 'icSHAPE', 'icSHAPE-MaP', 'smartSHAPE', 'ChemModSeq', 'Cotranscriptional_SHAPE-seq', 'Nuc-SHAPE-Structure-Seq'],
    filterTechniques: ['SHAPE', 'SHAPE-Seq', 'SHAPE-MaP', 'icSHAPE', 'icSHAPE-MaP', 'NAI-MaP', 'smartSHAPE']
  },
  {
    id: 'cleavage',
    label: 'Cleavage-based methods',
    shortLabel: 'Cleavage',
    techniques: ['PARS', 'PARTE', 'HRF-seq', 'Lead-seq', 'RL-Seq', 'tNet-RNase-seq'],
    filterTechniques: ['PARS', 'PARTE', 'HRF-seq']
  },
  {
    id: 'nucleotide',
    label: 'Nucleotide-specific chemical probing methods',
    shortLabel: 'Nucleotide-specific',
    techniques: ['Keth-seq', 'EDC probing', 'LASER-seq', 'icLASER'],
    filterTechniques: ['Keth-seq', 'EDC probing', 'LASER-seq']
  },
  {
    id: 'interaction',
    label: 'RNA–RNA interaction mapping methods',
    shortLabel: 'RNA–RNA interaction',
    techniques: ['PARIS', 'SPLASH', 'LIGR-seq', 'MARIO', 'RIC-seq', 'COMRADES', 'MOHCA', 'Mutate-and-map methods'],
    filterTechniques: ['PARIS', 'SPLASH', 'LIGR-seq', 'MARIO', 'RIC-seq', 'COMRADES', 'MOHCA', 'Mutate-and-map methods']
  }
];

const normalizeTechniqueName = (name = '') => String(name)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

// Existing atlas rows contain a few historical spellings that belong to one
// of the five probing-page families but are not displayed as separate options.
const TECHNIQUE_ALIASES = {
  structureseq: 'Structure-seq',
  cotranscriptionalshapeseq: 'SHAPE-Seq',
  nucshapestructureseq: 'SHAPE-Seq',
  iclaser: 'LASER-seq',
  map: 'Mutate-and-map methods',
  mca: 'MOHCA',
  mutateandmap: 'Mutate-and-map methods'
};

export function buildTechniqueClassifierRegistry({ families = [], aliases = {} } = {}) {
  if (!Array.isArray(families)) throw new Error('Technique families must be an array');
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
    throw new Error('Technique aliases must be an object');
  }

  const familyById = new Map();
  families.forEach((family, index) => {
    const familyId = family?.id;
    if (typeof familyId !== 'string' || !familyId || familyId.trim() !== familyId || familyById.has(familyId)) {
      throw new Error(`Invalid family id at index ${index}`);
    }
    if (!Array.isArray(family.techniques)) {
      throw new Error(`Invalid techniques for family ${familyId}`);
    }
    familyById.set(familyId, family);
  });

  const declaredTechniques = [];
  const declaredByNormalizedToken = new Map();
  for (const family of families) {
    for (const technique of family.techniques) {
      const label = String(technique ?? '');
      const normalizedToken = normalizeTechniqueName(label);
      if (!normalizedToken) throw new Error(`Invalid technique label in family ${family.id}`);
      const existing = declaredByNormalizedToken.get(normalizedToken);
      if (existing && (existing.label !== label || existing.family.id !== family.id)) {
        throw new Error(`Conflicting technique registration for normalized token "${normalizedToken}"`);
      }
      const declared = { normalizedToken, label, family };
      if (!existing) declaredByNormalizedToken.set(normalizedToken, declared);
      declaredTechniques.push(declared);
    }
  }

  const aliasByNormalizedToken = new Map();
  const aliasRecords = [];
  for (const [aliasToken, requestedCanonicalLabel] of Object.entries(aliases)) {
    const normalizedToken = normalizeTechniqueName(aliasToken);
    if (!normalizedToken) throw new Error(`Invalid alias token "${aliasToken}"`);
    const target = declaredByNormalizedToken.get(normalizeTechniqueName(requestedCanonicalLabel));
    if (!target) throw new Error(`Alias target "${requestedCanonicalLabel}" does not exist`);
    const alias = { normalizedToken, canonicalLabel: target.label, family: target.family };
    const existing = aliasByNormalizedToken.get(normalizedToken);
    if (existing && (existing.canonicalLabel !== alias.canonicalLabel || existing.family.id !== alias.family.id)) {
      throw new Error(`Conflicting alias normalized token "${normalizedToken}"`);
    }
    if (!existing) {
      aliasByNormalizedToken.set(normalizedToken, alias);
      aliasRecords.push(alias);
    }
  }

  for (const alias of aliasRecords) {
    const targetAlias = aliasByNormalizedToken.get(normalizeTechniqueName(alias.canonicalLabel));
    if (targetAlias && targetAlias.canonicalLabel !== alias.canonicalLabel) {
      throw new Error(`Alias target "${alias.canonicalLabel}" is not canonical`);
    }
  }

  const registrations = new Map();
  const registerToken = (normalizedToken, canonicalLabel, family) => {
    if (!family || !familyById.has(family.id)) throw new Error(`Invalid family id for "${canonicalLabel}"`);
    const existing = registrations.get(normalizedToken);
    if (existing && (existing.label !== canonicalLabel || existing.family.id !== family.id)) {
      throw new Error(`Conflicting technique registration for normalized token "${normalizedToken}"`);
    }
    if (!existing) registrations.set(normalizedToken, { label: canonicalLabel, family });
  };

  for (const declared of declaredTechniques) {
    const alias = aliasByNormalizedToken.get(declared.normalizedToken);
    const canonicalLabel = alias?.canonicalLabel || declared.label;
    const family = alias?.family || declared.family;
    if (family.id !== declared.family.id) {
      throw new Error(`Conflicting technique registration for normalized token "${declared.normalizedToken}"`);
    }
    registerToken(declared.normalizedToken, canonicalLabel, family);
  }
  for (const alias of aliasRecords) {
    registerToken(alias.normalizedToken, alias.canonicalLabel, alias.family);
  }

  const classifyToken = (value = '') => {
    const token = String(value ?? '').trim();
    const registered = registrations.get(normalizeTechniqueName(token));
    if (!registered) {
      return {
        label: token,
        mappingStatus: 'unmapped',
        categoryId: null,
        categoryLabel: null,
        categoryShortLabel: null
      };
    }
    return {
      label: registered.label,
      mappingStatus: 'mapped',
      categoryId: registered.family.id,
      categoryLabel: registered.family.label,
      categoryShortLabel: registered.family.shortLabel
    };
  };

  return {
    classifyToken,
    familyForId: (familyId) => familyById.get(familyId) || null,
    aliases: aliasRecords.map(({ normalizedToken, canonicalLabel }) => ({ normalizedToken, canonicalLabel })),
    canonicalTechniques: declaredTechniques.map(({ normalizedToken, label }) => ({
      normalizedToken,
      ...classifyToken(label)
    }))
  };
}

const TECHNIQUE_REGISTRY = buildTechniqueClassifierRegistry({
  families: MECHANISM_FAMILIES,
  aliases: TECHNIQUE_ALIASES
});

export function mechanismFamilyForTechnique(name = '') {
  const method = TECHNIQUE_REGISTRY.classifyToken(name);
  return method.categoryId ? TECHNIQUE_REGISTRY.familyForId(method.categoryId) : null;
}

export function canonicalTechniqueName(name = '') {
  const method = TECHNIQUE_REGISTRY.classifyToken(name);
  return method.mappingStatus === 'mapped' ? method.label : '';
}

export function classifyTechniqueFilter(value = '') {
  const methods = [];
  const seenMethods = new Set();
  const categoryIds = new Set();
  let mappedCount = 0;

  const tokens = String(value ?? '')
    .split(TECHNIQUE_TOKEN_SEPARATOR)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const method = TECHNIQUE_REGISTRY.classifyToken(token);
    const methodKey = method.label;
    if (seenMethods.has(methodKey)) continue;
    seenMethods.add(methodKey);

    if (method.mappingStatus === 'mapped') {
      mappedCount += 1;
      categoryIds.add(method.categoryId);
    }
    methods.push(method);
  }

  let classificationStatus = 'empty';
  if (methods.length > 0 && mappedCount === methods.length) classificationStatus = 'mapped';
  else if (methods.length > 0 && mappedCount === 0) classificationStatus = 'unmapped';
  else if (methods.length > 0) classificationStatus = 'partially_mapped';

  return {
    methods,
    categoryIds: MECHANISM_FAMILIES.map((family) => family.id).filter((id) => categoryIds.has(id)),
    classificationStatus
  };
}

export function buildTechniqueTaxonomySnapshot() {
  return {
    taxonomyVersion: TECHNIQUE_TAXONOMY_VERSION,
    tokenSeparator: TECHNIQUE_TOKEN_SEPARATOR_SOURCE,
    families: MECHANISM_FAMILIES.map((family) => ({
      id: family.id,
      label: family.label,
      shortLabel: family.shortLabel,
      techniques: [...family.techniques],
      filterTechniques: [...family.filterTechniques]
    })),
    aliases: TECHNIQUE_REGISTRY.aliases.map((alias) => ({ ...alias })),
    canonicalTechniques: TECHNIQUE_REGISTRY.canonicalTechniques.map(({ mappingStatus, ...technique }) => ({
      ...technique
    }))
  };
}

export function mechanismFamiliesForRow(row = {}) {
  const familyIds = new Set();
  for (const id of row.techniqueFamilies || []) {
    if (TECHNIQUE_REGISTRY.familyForId(id)) familyIds.add(id);
  }
  for (const name of row.techniqueNames || []) {
    const family = mechanismFamilyForTechnique(name);
    if (family) familyIds.add(family.id);
  }
  return MECHANISM_FAMILIES.map((family) => family.id).filter((id) => familyIds.has(id));
}

export function buildMechanismFilterModel() {
  return {
    families: MECHANISM_FAMILIES.map((family) => ({
      ...family,
      techniques: [...family.filterTechniques]
    }))
  };
}

export function buildTechniqueFilterModel(cases = []) {
  const byFamily = new Map();
  for (const row of cases) {
    const fams = mechanismFamiliesForRow(row);
    const names = row.techniqueNames || [];
    for (const fam of fams) {
      if (!byFamily.has(fam)) byFamily.set(fam, new Set());
    }
    for (const fam of fams) {
      for (const name of names) {
        if (mechanismFamilyForTechnique(name)?.id === fam) byFamily.get(fam).add(name);
      }
    }
  }
  const families = MECHANISM_FAMILIES.filter((family) => byFamily.has(family.id)).map((family) => ({
    id: family.id,
    techniques: [...byFamily.get(family.id)].sort()
  }));
  return { families };
}

export function matchesTechniqueFilter(row, selection = {}) {
  const famSel = selection.families || new Set();
  const techSel = selection.techniques || new Set();
  if (famSel.size === 0 && techSel.size === 0) return true;
  const fams = row.techniqueFamilies || [];
  const names = row.techniqueNames || [];
  if (fams.some((f) => famSel.has(f)) || mechanismFamiliesForRow(row).some((f) => famSel.has(f))) return true;
  if (names.some((n) => techSel.has(n) || techSel.has(canonicalTechniqueName(n)))) return true;
  return false;
}

export function toggleTechniqueSelection(selection, kind, value) {
  const next = {
    families: new Set(selection.families || []),
    techniques: new Set(selection.techniques || [])
  };
  const target = next[kind];
  if (target.has(value)) target.delete(value);
  else target.add(value);
  return next;
}
