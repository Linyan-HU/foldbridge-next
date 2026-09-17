import { matchesTechniqueFilter } from './techniqueFilterModel.js';
import { moleculeDisplayNameOverride } from './moleculeNameOverrides.js';

export const REQUIRED_ATLAS_CAPABILITIES = [
  { id: 'searchable-web-interface', label: 'Searchable web interface' },
  { id: 'facet-search', label: 'RNA family / probe type / PDB ID / motif / structure class search' },
  { id: 'reactivity-1d', label: '1D reactivity profile' },
  { id: 'paired-unpaired-2d', label: '2D paired/unpaired view' },
  { id: 'residue-coloring-3d', label: '3D residue coloring' },
  { id: 'mapped-residue-table', label: 'Mapped residue table' },
  { id: 'confidence-view-builder', label: 'Confidence view builder' },
  { id: 'conflict-candidate-viewer', label: 'Conflict / discordance candidate viewer' },
  { id: 'download-current-filter', label: 'Download current-filter result' }
];

export const ANNOJOIN_SOURCE_CONTRACT = {
  entryRoot: 'ANNOJOIN',
  annotationRoot: 'ANNOCONFIDENCE',
  version: 'V2.1_RMDB_LINE_A_20260617',
  browserLoadsAnnoconfidenceBigTables: false,
  note: 'ANNOJOIN drives browser lists, filters, routes, presets, and downloads. ANNOCONFIDENCE stays server-side or route-lazy.'
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function truthy(value) {
  return ['true', '1', 'yes', 'y'].includes(text(value).toLowerCase());
}

function numberOrZero(value) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value) {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(';').map((item) => item.trim()).filter(Boolean);
}

function assetFamily(row = {}) {
  return text(row.asset_family || row.assetFamily);
}

function atlasCaseKeyFor(row = {}) {
  const explicit = text(row.atlasCaseKey || row.atlas_case_key);
  if (explicit) return explicit;
  const family = assetFamily(row);
  const caseId = text(row.case_id || row.caseId);
  const pdbId = text(row.pdb_id || row.pdbId) || caseId;
  if (family && (pdbId || caseId)) return `${family}:${pdbId || caseId}`;
  return caseId || pdbId;
}

function caseAssetPathFor(row = {}) {
  const explicit = text(row.caseAssetPath || row.case_asset_path);
  if (explicit) return explicit;
  return `cases/${encodeURIComponent(atlasCaseKeyFor(row))}.json`;
}

function previewProfiles(value) {
  return splitList(value).filter((profileId) => (
    !profileId.startsWith('bundle_')
    && !profileId.startsWith('rmdbv3_exact_')
  ));
}

function normalizeRdatPath(pathValue = '') {
  const parts = text(pathValue).split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === parts[1]) parts.splice(0, 1);
  return parts.join('/');
}

function profileTraceFromProfileId(profileId = '', { pairId = '', routeId = '' } = {}) {
  const value = text(profileId);
  if (!value || value.startsWith('rmdbv3_exact_')) return null;
  const rdatMatch = value.match(/(.+?\.rdat)#([^|#]+)/i);
  if (rdatMatch) {
    const rdatPath = normalizeRdatPath(rdatMatch[1]);
    const lineValue = Number(rdatMatch[2]);
    return {
      pairId: text(pairId),
      profileId: value,
      traceType: Number.isFinite(lineValue) ? 'rdat_line' : 'rdat_record',
      rdatPath,
      rdatFile: rdatPath.split('/').pop() || rdatPath,
      ...(Number.isFinite(lineValue) ? { rdatLine: lineValue } : { rdatRecord: rdatMatch[2] }),
      routeId: text(routeId)
    };
  }
  return {
    pairId: text(pairId),
    profileId: value,
    traceType: 'route_profile_id',
    routeId: text(routeId)
  };
}

function normalizeProfileTraceEntry(row = {}) {
  if (row.traceType || row.rdatPath || row.rdatFile || row.rdatLine || row.rdatRecord) {
    return {
      pairId: text(row.pairId || row.pair_id),
      profileId: text(row.profileId || row.profile_id),
      traceType: text(row.traceType || row.trace_type),
      rdatPath: normalizeRdatPath(row.rdatPath || row.rdat_path),
      rdatFile: text(row.rdatFile || row.rdat_file),
      ...(numberOrNull(row.rdatLine ?? row.rdat_line) ? { rdatLine: numberOrNull(row.rdatLine ?? row.rdat_line) } : {}),
      ...(text(row.rdatRecord || row.rdat_record) ? { rdatRecord: text(row.rdatRecord || row.rdat_record) } : {}),
      routeId: text(row.routeId || row.route_id || row.track_route_id)
    };
  }
  return profileTraceFromProfileId(row.profileId || row.profile_id, {
    pairId: row.pairId || row.pair_id,
    routeId: row.routeId || row.route_id || row.track_route_id
  });
}

function profileTracePreview(rows = [], maxEntries = 8) {
  const traces = [];
  const seen = new Set();
  for (const row of asArray(rows)) {
    const trace = normalizeProfileTraceEntry(row);
    if (!trace) continue;
    const key = [trace.pairId, trace.rdatPath || trace.profileId, trace.rdatLine || trace.rdatRecord || ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    traces.push(trace);
    if (traces.length >= maxEntries) break;
  }
  return traces;
}

function normalizeSourceCaseDescriptor(row = {}) {
  return {
    assetFamily: text(row.assetFamily || row.asset_family),
    familyLabel: text(row.familyLabel || row.family_label),
    atlasCaseKey: text(row.atlasCaseKey || row.atlas_case_key),
    caseId: text(row.caseId || row.case_id),
    pdbId: text(row.pdbId || row.pdb_id),
    caseAssetPath: text(row.caseAssetPath || row.case_asset_path),
    detailRouteId: text(row.detailRouteId || row.detail_route_id),
    recommendedDefaultPreset: text(row.recommendedDefaultPreset || row.recommended_default_preset),
    moleculeName: text(row.moleculeName || row.molecule_name),
    confidenceDisplayLabel: text(row.confidenceDisplayLabel || row.confidence_display_label),
    compactConfidenceLabel: text(row.compactConfidenceLabel || row.compact_confidence_label),
    profileCount: numberOrZero(row.profileCount ?? row.profile_count),
    chains: splitList(row.chains || row.pdb_chain_ids)
  };
}

function includesFolded(haystack, needle) {
  if (!needle) return true;
  return text(haystack).toLowerCase().includes(text(needle).toLowerCase());
}

function normalizeChainPlacements(value) {
  return asArray(value)
    .map((entry) => ({
      classLabel: text(entry?.classLabel || entry?.class_label),
      nameLabel: text(entry?.nameLabel || entry?.name_label)
    }))
    .filter((entry) => entry.classLabel || entry.nameLabel);
}

function normalizeCase(row) {
  const atlasCaseKey = atlasCaseKeyFor(row);
  const rowAssetFamily = assetFamily(row);
  const rowCaseId = text(row.case_id || row.caseId);
  const rowPdbId = text(row.pdb_id || row.pdbId);
  const moleculeDisplayName = moleculeDisplayNameOverride({
    atlasCaseKey,
    assetFamily: rowAssetFamily,
    caseId: rowCaseId,
    pdbId: rowPdbId
  });
  const isMergedDisplayRow = row.isMergedDisplayRow === true || truthy(row.is_merged_display_row);
  return {
    assetFamily: rowAssetFamily,
    sourceLine: text(row.source_line || row.sourceLine),
    evidenceNamespace: text(row.evidence_namespace || row.evidenceNamespace),
    sourceAssetRoot: text(row.source_asset_root || row.sourceAssetRoot),
    sourcePublicRoot: text(row.source_public_root || row.sourcePublicRoot),
    publicCaseStatus: text(row.public_case_status || row.publicCaseStatus),
    caseUid: text(row.case_uid || row.caseUid),
    atlasCaseKey,
    caseId: rowCaseId,
    pdbId: rowPdbId,
    chains: splitList(row.pdb_chain_ids || row.chains),
    chainPlacements: normalizeChainPlacements(row.chainPlacements || row.chain_placements),
    moleculeDisplayName: moleculeDisplayName || text(row.molecule_display_name || row.moleculeDisplayName),
    biologicalMoleculeName: text(row.biological_molecule_name || row.biologicalMoleculeName),
    biologicalMoleculeNameSource: text(row.biological_molecule_name_source || row.biologicalMoleculeNameSource),
    pdbMoleculeName: text(row.pdb_molecule_name || row.pdbMoleculeName),
    pdbMoleculeNameSource: text(row.pdb_molecule_name_source || row.pdbMoleculeNameSource),
    confidenceDisplayLabel: text(row.confidence_display_label || row.confidenceDisplayLabel),
    confidenceSource: text(row.confidence_source || row.confidenceSource),
    sourceDatabases: splitList(row.source_databases || row.sourceDatabases),
    assayFamilies: splitList(row.assay_family_set || row.assayFamilies),
    techniqueFamilies: splitList(row.technique_families || row.techniqueFamilies),
    techniqueNames: splitList(row.technique_names || row.techniqueNames),
    measurementFamilies: splitList(row.measurement_families || row.measurementFamilies),
    rnaFamily: text(row.rna_family_label || row.rnaFamily),
    rnaFamilyProvenance: text(row.rna_family_provenance || row.rnaFamilyProvenance),
    motif: text(row.motif_label || row.motif),
    motifProvenance: text(row.motif_provenance || row.motifProvenance),
    structureClass: text(row.structure_class_label || row.structureClass),
    structureClassProvenance: text(row.structure_class_provenance || row.structureClassProvenance),
    profilePreview: previewProfiles(row.profilePreview || row.profile_ids),
    profileCount: numberOrZero(row.profile_count ?? row.profileCount),
    profilePreviewIsComplete: row.profilePreviewIsComplete === true || truthy(row.profile_ids_complete),
    profileMembershipRouteId: text(row.profile_membership_route_id || row.profileMembershipRouteId),
    profileTracePreview: profileTracePreview(row.profileTracePreview || row.profile_trace_preview),
    fecClaimCeilingDistribution: text(row.fec_claim_ceiling_distribution || row.fecClaimCeilingDistribution),
    coverageShapeDistribution: text(row.coverage_shape_distribution || row.coverageShapeDistribution),
    conflictCandidateCount: numberOrZero(row.conflict_candidate_count ?? row.conflictCandidateCount),
    hasContextAnnotation: row.hasContextAnnotation === true || truthy(row.has_context_annotation),
    hasLssAnnotation: row.hasLssAnnotation === true || truthy(row.has_lss_annotation),
    searchText: [text(row.search_text || row.searchText), moleculeDisplayName].filter(Boolean).join(' '),
    routeId: text(row.route_id || row.routeId),
    caseAssetPath: isMergedDisplayRow ? text(row.caseAssetPath || row.case_asset_path) : caseAssetPathFor({ ...row, atlasCaseKey }),
    isMergedDisplayRow,
    sourceCaseCount: numberOrZero(row.sourceCaseCount ?? row.source_case_count),
    sourceFamilies: splitList(row.sourceFamilies || row.source_families),
    sourceCaseKeys: splitList(row.sourceCaseKeys || row.source_case_keys),
    sourceCaseAssetPaths: asArray(row.sourceCaseAssetPaths || row.source_case_asset_paths).map(normalizeSourceCaseDescriptor)
  };
}

function normalizeFacet(row) {
  return {
    name: text(row.facet_name || row.name),
    label: text(row.display_label || row.label || row.facet_name || row.name),
    sourceTable: text(row.source_table || row.sourceTable),
    sourceColumn: text(row.source_column || row.sourceColumn),
    group: text(row.facet_group || row.group)
  };
}

function normalizePreset(row) {
  return {
    id: text(row.preset_id || row.id),
    name: text(row.preset_name || row.display_name || row.name || row.preset_id || row.id),
    description: text(row.preset_description || row.description),
    filterExpression: text(row.filter_expression || row.filterExpression),
    requiredAnnotationTables: splitList(row.required_annotation_tables || row.requiredAnnotationTables),
    isDefault: row.isDefault === true || truthy(row.is_default),
    userEditable: row.userEditable === true || truthy(row.user_editable || row.editable_by_user),
    warningText: text(row.warning_text || row.warningText)
  };
}

function normalizeDownload(row) {
  return {
    id: text(row.download_id || row.id),
    label: text(row.download_label || row.label || row.download_id || row.id),
    sourceTables: text(row.source_tables || row.sourceTables),
    filterExpression: text(row.filter_expression || row.filterExpression),
    filePath: text(row.file_path || row.artifact_path || row.filePath),
    fileFormat: text(row.file_format || row.fileFormat),
    rowCount: numberOrZero(row.row_count ?? row.rowCount),
    sha256: text(row.sha256)
  };
}

function normalizeSummary(row) {
  return {
    profileCount: numberOrZero(row.profile_count),
    pairCount: numberOrZero(row.pair_count),
    residueEvidenceCount: numberOrZero(row.residue_evidence_count),
    recommendedDefaultPreset: text(row.recommended_default_preset),
    summaryRouteId: text(row.summary_route_id)
  };
}

function normalizeRoute(row) {
  return {
    detailRouteId: text(row.detail_route_id),
    mappingTableRouteId: text(row.mapping_table_route_id),
    coverageAnnotationRouteId: text(row.coverage_annotation_route_id),
    fecAnnotationRouteId: text(row.fec_annotation_route_id),
    assayNumericRouteId: text(row.assay_numeric_route_id),
    structureContextRouteId: text(row.structure_context_route_id),
    lssAnnotationRouteId: text(row.lss_annotation_route_id),
    conflictAnnotationRouteId: text(row.conflict_annotation_route_id),
    sourceDownloadRouteId: text(row.source_download_route_id)
  };
}

function normalizeTrackRoute(row) {
  return {
    profileId: text(row.profile_id),
    trackRouteId: text(row.track_route_id),
    trackDataPath: text(row.track_data_path),
    trackSchemaId: text(row.track_schema_id),
    supports1d: truthy(row.supports_1d),
    supportsTable: truthy(row.supports_table),
    colorPolicyId: text(row.color_policy_id)
  };
}

function normalizePair2d(row) {
  return {
    contextRouteId: text(row.context_route_id),
    pairContextDataPath: text(row.pair_context_data_path),
    pairContextSchemaId: text(row.pair_context_schema_id),
    contextEngine: text(row.context_engine),
    supportsPairArcView: truthy(row.supports_pair_arc_view),
    supportsDotBracketView: truthy(row.supports_dot_bracket_view),
    supportsResidueHover: truthy(row.supports_residue_hover)
  };
}

function normalizeColor3d(row) {
  return {
    structureFilePath: text(row.structure_file_path || row.structureFilePath),
    structureUrl: text(row.structure_url || row.structureUrl),
    structureFileFormat: text(row.structure_file_format || row.structureFileFormat),
    residueColoringDataPath: text(row.residue_coloring_data_path || row.residueColoringDataPath),
    viewerCompatibility: text(row.viewer_compatibility || row.viewerCompatibility),
    colorPolicyId: text(row.color_policy_id || row.colorPolicyId),
    coordinateKeyColumn: text(row.pdb_residue_coordinate_key_column || row.coordinateKeyColumn),
    valueColumn: text(row.value_column || row.valueColumn)
  };
}

function reactivityColorBin(value) {
  if (!Number.isFinite(value)) return 'missing';
  if (value < 0.35) return 'low';
  if (value < 1) return 'mid';
  return 'high';
}

function residueLabel(row = {}) {
  const chain = text(row.label_asym_id || row.labelAsymId || row.auth_asym_id || row.authAsymId || row.chain_id_display);
  const seq = text(row.auth_seq_id || row.authSeqId || row.label_seq_id || row.labelSeqId || row.rmdb_position || row.rmdbPosition);
  const base = text(row.parent_base || row.parentBase || row.comp_id || row.compId || row.rmdb_base || row.rmdbBase);
  return [chain && seq ? `${chain}:${seq}` : seq || chain, base].filter(Boolean).join(' ');
}

function normalizeResidueEvidence(row = {}) {
  const reactivityValue = numberOrNull(row.reactivity_value ?? row.reactivityValue);
  const reactivityError = numberOrNull(row.reactivity_error ?? row.reactivityError);
  return {
    pairId: text(row.pair_id || row.pairId),
    profileId: text(row.rmdb_profile_id || row.profile_id || row.profileId),
    rmdbPosition: numberOrNull(row.rmdb_position ?? row.rmdbPosition),
    rmdbBase: text(row.rmdb_base || row.rmdbBase),
    pdbResidue: residueLabel(row),
    labelAsymId: text(row.label_asym_id || row.labelAsymId),
    labelSeqId: numberOrNull(row.label_seq_id ?? row.labelSeqId),
    authSeqId: text(row.auth_seq_id || row.authSeqId),
    compId: text(row.comp_id || row.compId),
    parentBase: text(row.parent_base || row.parentBase),
    coordinateKey: text(row.pdb_residue_coordinate_key || row.residue_key || row.coordinateKey),
    reactivityValue,
    reactivityError,
    numericStatus: text(row.numeric_status || row.numericStatus),
    projectionStatus: text(row.residue_projection_status || row.projection_status || row.projectionStatus),
    structureReactivityStatus: text(row.structure_reactivity_status || row.structureReactivityStatus),
    colorBin: reactivityColorBin(reactivityValue)
  };
}

function parseSegmentRange(value) {
  const match = text(value).match(/:(\d+)-(\d+)$/);
  if (!match) return { start: null, end: null };
  return { start: Number(match[1]), end: Number(match[2]) };
}

function normalizeLssContext(row = {}) {
  const segmentLabel = text(row.residue_key_or_segment_key || row.segmentLabel);
  const range = parseSegmentRange(segmentLabel);
  return {
    pairId: text(row.pair_id || row.pairId),
    pairSegmentId: text(row.pair_segment_id || row.pairSegmentId),
    profileId: text(row.profile_id || row.profileId),
    segmentLabel,
    start: range.start,
    end: range.end,
    pairedEvaluable: numberOrZero(row.n_paired_evaluable ?? row.pairedEvaluable),
    unpairedEvaluable: numberOrZero(row.n_unpaired_evaluable ?? row.unpairedEvaluable),
    lssStatus: text(row.lss_status || row.lssStatus),
    contextEngine: text(row.context_engine || row.contextEngine)
  };
}

function buildVisualPreview({ residueEvidence = [], lssContexts = [], structureRoutes = [] } = {}) {
  const residuePoints = asArray(residueEvidence).map(normalizeResidueEvidence);
  const firstStructureRoute = structureRoutes[0] || {};
  return {
    browserLoadsAnnoconfidenceBigTables: false,
    source: 'build-time derived preview from route-indexed evidence; full ANNOCONFIDENCE tables stay server-side',
    reactivity1d: {
      pointCount: residuePoints.length,
      points: residuePoints.map((point, index) => ({
        index: index + 1,
        pdbResidue: point.pdbResidue,
        rmdbPosition: point.rmdbPosition,
        rmdbBase: point.rmdbBase,
        profileId: point.profileId,
        reactivityValue: point.reactivityValue,
        reactivityError: point.reactivityError,
        numericStatus: point.numericStatus,
        colorBin: point.colorBin
      }))
    },
    pairArcs: asArray(lssContexts).map(normalizeLssContext),
    structureColoring: {
      structureFilePath: text(firstStructureRoute.structureFilePath || firstStructureRoute.structure_file_path),
      structureUrl: text(firstStructureRoute.structureUrl || firstStructureRoute.structure_url),
      coordinateKeyColumn: text(firstStructureRoute.coordinateKeyColumn || firstStructureRoute.pdb_residue_coordinate_key_column || 'pdb_residue_coordinate_key'),
      valueColumn: text(firstStructureRoute.valueColumn || firstStructureRoute.value_column || 'reactivity_value'),
      points: residuePoints.map((point) => ({
        coordinateKey: point.coordinateKey,
        pdbResidue: point.pdbResidue,
        reactivityValue: point.reactivityValue,
        colorBin: point.colorBin
      }))
    },
    mappedResidues: residuePoints
  };
}

function normalizeConflict(row) {
  return {
    id: text(row.conflict_candidate_id || row.conflict_candidate_route_id || row.route_id),
    routeId: text(row.route_id || row.conflict_candidate_route_id),
    type: text(row.conflict_type),
    status: text(row.conflict_status || row.discordance_status),
    fecClaimCeiling: text(row.fec_claim_ceiling),
    claimScope: text(row.claim_scope),
    lssStatus: text(row.lss_status),
    reviewPriorityHint: text(row.review_priority_hint || row.candidate_reason)
  };
}

function matchesSelectedCase(row = {}, caseId = '', caseKey = '') {
  const selectedKey = text(caseKey);
  if (selectedKey && atlasCaseKeyFor(row) === selectedKey) return true;
  if (selectedKey && assetFamily(row)) return false;
  return text(row.case_id || row.caseId) === text(caseId);
}

function byCase(rows, caseId, caseKey = '') {
  return asArray(rows).filter((row) => matchesSelectedCase(row, caseId, caseKey));
}

function firstByCase(rows, caseId, caseKey = '') {
  return byCase(rows, caseId, caseKey)[0] || null;
}

function filterCases(cases, filters = {}) {
  return cases.filter((row) => {
    const queryTarget = [
      row.searchText,
      row.caseId,
      row.pdbId,
      row.parentClassLabel,
      row.childClassLabel,
      row.biologicalMoleculeName,
      row.pdbMoleculeName,
      row.confidenceDisplayLabel,
      row.rnaFamily,
      row.motif,
      row.structureClass,
      ...row.assayFamilies
    ].join(' ');
    return includesFolded(queryTarget, filters.query)
      && includesFolded(row.rnaFamily, filters.rnaFamily)
      && includesFolded(row.pdbId, filters.pdbId)
      && includesFolded(row.motif, filters.motif)
      && includesFolded(row.structureClass, filters.structureClass)
      && matchesTechniqueFilter(row, {
        families: new Set(filters.techniqueFamilies || []),
        techniques: new Set(filters.techniqueNames || [])
      });
  });
}

export function buildAtlasSearchState(tables = {}, filters = {}) {
  const membershipsByCase = new Map();
  for (const row of asArray(tables.memberships)) {
    const caseKey = atlasCaseKeyFor(row);
    if (!caseKey) continue;
    const entry = {
      pairId: text(row.pair_id),
      profileId: text(row.profile_id),
      routeId: text(row.profile_membership_route_id)
    };
    if (!membershipsByCase.has(caseKey)) membershipsByCase.set(caseKey, []);
    membershipsByCase.get(caseKey).push(entry);
  }
  const profileTracesByCase = new Map();
  for (const row of asArray(tables.tracks)) {
    const caseKey = atlasCaseKeyFor(row);
    if (!caseKey) continue;
    if (!profileTracesByCase.has(caseKey)) profileTracesByCase.set(caseKey, []);
    profileTracesByCase.get(caseKey).push(row);
  }
  const sourceRows = asArray(tables.cases);
  const displayRows = asArray(tables.displayCases).length ? asArray(tables.displayCases) : sourceRows;
  const normalizedCases = displayRows.map((row) => {
    const normalized = normalizeCase(row);
    const routeTracePreview = profileTracePreview(profileTracesByCase.get(normalized.atlasCaseKey));
    return {
      ...normalized,
      profileMembershipPreview: membershipsByCase.get(normalized.atlasCaseKey) || [],
      profileTracePreview: routeTracePreview.length ? routeTracePreview : normalized.profileTracePreview
    };
  });
  const cases = filterCases(normalizedCases, filters);
  return {
    source: {
      ...ANNOJOIN_SOURCE_CONTRACT,
      ...(tables.source || {}),
      browserLoadsAnnoconfidenceBigTables: false
    },
    filters: {
      query: text(filters.query),
      rnaFamily: text(filters.rnaFamily),
      probeType: text(filters.probeType),
      pdbId: text(filters.pdbId),
      motif: text(filters.motif),
      structureClass: text(filters.structureClass),
      techniqueFamilies: asArray(filters.techniqueFamilies),
      techniqueNames: asArray(filters.techniqueNames)
    },
    cases,
    unfilteredCases: normalizedCases,
    totalCaseCount: numberOrZero(tables.totalCaseCount) || normalizedCases.length,
    totalSourceCaseCount: numberOrZero(tables.totalSourceCaseCount) || sourceRows.length || normalizedCases.length,
    totalPlacementCount: numberOrZero(tables.totalPlacementCount),
    facets: asArray(tables.facets).map(normalizeFacet),
    presets: asArray(tables.presets).map(normalizePreset),
    downloads: asArray(tables.downloads).map(normalizeDownload)
  };
}

export function createAtlasCaseDetail(tables = {}, caseIdInput = '') {
  const caseKey = text(caseIdInput);
  const caseId = caseKey.includes(':') ? caseKey.split(':').pop() : caseKey;
  const caseRow = firstByCase(tables.cases, caseId, caseKey);
  if (!caseRow) return null;
  const selectedCaseKey = atlasCaseKeyFor(caseRow);
  const structureRoutes = byCase(tables.colors3d, caseId, selectedCaseKey).map(normalizeColor3d);
  return {
    ...normalizeCase(caseRow),
    summary: firstByCase(tables.summaries, caseId, selectedCaseKey) ? normalizeSummary(firstByCase(tables.summaries, caseId, selectedCaseKey)) : null,
    detailRoutes: firstByCase(tables.routes, caseId, selectedCaseKey) ? normalizeRoute(firstByCase(tables.routes, caseId, selectedCaseKey)) : null,
    memberships: byCase(tables.memberships, caseId, selectedCaseKey).map((row) => ({
      pairId: text(row.pair_id),
      profileId: text(row.profile_id),
      routeId: text(row.profile_membership_route_id)
    })),
    trackRoutes: byCase(tables.tracks, caseId, selectedCaseKey).map(normalizeTrackRoute),
    pairContextRoutes: byCase(tables.pairs2d, caseId, selectedCaseKey).map(normalizePair2d),
    structureRoutes,
    conflicts: byCase(tables.conflicts, caseId, selectedCaseKey).map(normalizeConflict),
    visualPreview: buildVisualPreview({
      residueEvidence: byCase(tables.residueEvidence, caseId, selectedCaseKey),
      lssContexts: byCase(tables.lssContexts, caseId, selectedCaseKey),
      structureRoutes
    })
  };
}

export function createAtlasCaseDetailFromAsset(asset) {
  if (!asset?.case) return null;
  return {
    ...asset.case,
    summary: asset.summary || null,
    detailRoutes: asset.detailRoutes || null,
    memberships: asset.memberships || [],
    trackRoutes: asset.trackRoutes || [],
    pairContextRoutes: asset.pairContextRoutes || [],
    structureRoutes: asset.structureRoutes || [],
    conflicts: asset.conflicts || [],
    visualPreview: asset.visualPreview || buildVisualPreview()
  };
}
