export const DATA_VERSION = '2026-06-16.generated-rmdb-cases.v1';
export const DETERMINISTIC_SEED = 20260307;

export const portalMetrics = [
  { label: 'Total records', value: '312,540' },
  { label: 'Data types', value: '8' },
  { label: 'Reactivity profiles', value: '26.1K' },
  { label: 'Publications', value: '2,318' }
];

export const dataTypeCards = [
  { name: 'SHAPE-MaP', desc: 'Mutational profiling reactivity', count: '9.8K profiles' },
  { name: 'DMS-MaPseq', desc: 'Base accessibility probing', count: '6.4K profiles' },
  { name: 'RDAT', desc: 'Chemical probing experiments', count: '3.2K files' },
  { name: 'PDB/mmCIF', desc: 'Resolved RNA structures', count: '1,840 structures' }
];

export const stageDiseaseCards = [
  { name: 'Aptamer', count: '4.2K records' },
  { name: 'Riboswitch', count: '7.1K records' },
  { name: 'Viral RNA', count: '8.0K records' },
  { name: 'Ribozyme', count: '6.8K records' }
];

export const featuredRecords = [
  {
    id: 'FB-RDAT-0021',
    title: 'RNA Puzzle reactivity profile linked to tertiary structure',
    confidence: 'high'
  },
  {
    id: 'FB-PDB-0142',
    title: 'Riboswitch structure with ligand-bound probing evidence',
    confidence: 'high'
  },
  {
    id: 'APT-HSA-1007',
    title: 'VEGF DNA aptamer binding assay panel',
    confidence: 'experimental'
  }
];

export const siteSummaries = [
  {
    site: 'RiboCentre',
    scope: 'Curated structured RNA elements',
    records: 12430
  },
  {
    site: 'Riboswitch',
    scope: 'Ligand-responsive RNA motif atlas',
    records: 3912
  },
  {
    site: 'Aptamer',
    scope: 'RNA/DNA binder assays and metadata',
    records: 1884
  }
];

export const recentPublications = [
  {
    doi: '10.1038/s41593-026-01421-3',
    title: 'Chemical probing atlas of structured RNA regulatory elements',
    year: 2026
  },
  {
    doi: '10.1016/j.cell.2026.02.019',
    title: 'Structure-aware integration of RNA probing experiments',
    year: 2026
  },
  {
    doi: '10.1093/nar/gkae1142',
    title: 'Unified evidence grading for structured RNA annotations',
    year: 2026
  }
];

export const browseRows = [
  {
    id: 'PDBCASE-5KPY',
    name: '5-hydroxytryptophan RNA aptamer case',
    species: 'Synthetic RNA',
    ligand: 'N/A',
    evidence: 'High'
  },
  {
    id: 'PDBCASE-4L81',
    name: 'SAM-I/IV riboswitch aptamer case',
    species: 'Synthetic RNA',
    ligand: 'N/A',
    evidence: 'High'
  },
  {
    id: 'RB-014',
    name: 'Glycine tandem switch motif',
    species: 'B. subtilis',
    ligand: 'Glycine',
    evidence: 'Medium'
  }
];

export const aptamerMultiSelectRows = [
  {
    id: 'APT-BC-8K7W',
    sequenceName: 'Broccoli aptamer',
    aptamerName: 'Broccoli',
    year: 2025,
    category: 'Fluorogenic',
    sequence: 'GGGACGGUCGGGUCCAGAUAUUCGUAUCUGUCGAGUAGAGUGUGGGCUC',
    description: 'Broccoli-DFHBI-1T complex; local PDB test model (8K7W).',
    pdbId: '8K7W'
  },
  {
    id: 'APT-PSMA-A9',
    sequenceName: 'PSMA binding aptamer',
    aptamerName: 'A9',
    year: 2010,
    category: 'Cancer Targeting',
    sequence: 'GGGAGGACGAUGCGGAUCAGCCAUGUUUACGUCACUCCU',
    description: 'Cell targeting aptamer for prostate-specific membrane antigen.',
    pdbId: '3D2V'
  },
  {
    id: 'APT-MALAT1',
    sequenceName: 'MALAT1 motif aptamer',
    aptamerName: 'MALAT1-motif',
    year: 2021,
    category: 'RNA Motif',
    sequence: 'GGAUCCGGAUUGAGGCUAGUGAAGCUCC',
    description: 'RNA motif recognition and structure-informed design example.',
    pdbId: '7ELR'
  },
  {
    id: 'APT-G4-DFHBI',
    sequenceName: 'Spinach-like G4 aptamer',
    aptamerName: 'Spinach-like G4',
    year: 2020,
    category: 'Fluorogenic',
    sequence: 'GGGUGGUGGUGGUGGUGAAGCCGAUGC',
    description: 'G-quadruplex fluorogenic aptamer family example.',
    pdbId: '5OB3'
  },
  {
    id: 'APT-THR-SELEX',
    sequenceName: 'Thrombin SELEX aptamer',
    aptamerName: 'TBA-like',
    year: 2008,
    category: 'Protein Binding',
    sequence: 'GGTTGGTGTGGTTGG',
    description: 'Protein-binding aptamer class for assay and sensing workflows.',
    pdbId: '4DII'
  }
];

export const detailRecord = {
  id: 'FB-RNA-001',
  name: 'RNA probing-to-structure evidence map',
  status: 'reviewed',
  organism: 'Homo sapiens',
  family: 'RNA chemical probing and structure bridge',
  updated: '2026-03-07',
  sequenceLength: 76,
  genomicContext: 'Curated RDAT and PDB evidence integration'
};

export const detailEvidenceRows = [
  { method: 'SHAPE-MaP', metric: 'reactivity agreement', score: '0.91' },
  { method: 'PDB projection', metric: 'residue coverage', score: '0.87' }
];

export const provenanceHistory = [
  '2026-02-01 imported from FoldBridge candidate release v1.8',
  '2026-02-20 probing and structure mapping harmonization complete',
  '2026-03-07 unified template validation complete'
];
