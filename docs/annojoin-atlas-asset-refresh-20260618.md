# ANNOJOIN Atlas Asset Refresh - 2026-06-18

## Scope

This refresh regenerates the `src/assets/generated/annojoin-atlas` web assets after the upstream PDB/JOIN display repair on 133.

The upstream repair changed PDB-side biological display names before ANNOJOIN consumption. ANNOJOIN remains the web entry layer; the browser still does not parse mmCIF files or infer chain/entity mappings.

## Source Staging

Remote source root:

```text
sunhao@10.40.0.133:/data/hsBack/05_devSpace/04_foldbridge_data
```

Local staging root:

```text
/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/web_staging/annojoin_pdb_display_20260618_221108
```

Synced directories:

```text
ANNOJOIN/
ANNOCONFIDENCE/
```

Staging sizes after sync:

```text
ANNOJOIN        411M
ANNOCONFIDENCE 24G
```

## Build Inputs

The Atlas build was run with explicit roots:

```bash
FOLDBRIDGE_ANNOJOIN_ROOT=/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/web_staging/annojoin_pdb_display_20260618_221108/ANNOJOIN
FOLDBRIDGE_ANNOCONFIDENCE_ROOT=/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/web_staging/annojoin_pdb_display_20260618_221108/ANNOCONFIDENCE
FOLDBRIDGE_FEC_EVIDENCE_ROOT=/Users/joseperezmartinez/docs/rmdb2pdb/task_packages/confidence_v3_restart_20260613/remote_root/06_fec_evidence
```

Key staged input checks:

```text
ANNOJOIN/anno_case_search_index.tsv rows=1126 sha256=2559b61f57e2b61df65eb0d815a63e2a458abe0f78c590515b117c9c56395ab9
ANNOJOIN/atlas_download_manifest.tsv rows=24 sha256=dec232c60d188e16ae00c9c0727f669f9d7c6cb220f62a5402750600c5f2bb09
ANNOCONFIDENCE/lss_structure_context_annotation.tsv rows=189354 sha256=fe7a51a1ae5d98cfe2318e78e82116cbd15978978da72bc335749e93d147f991
```

## Display Regression Target

`3NKB` must display the repaired author entity description:

```text
pdb_chain_ids=B
parent_class_label=The hepatitis delta virus ribozyme
child_class_label=The hepatitis delta virus ribozyme
biological_molecule_name=The hepatitis delta virus ribozyme
biological_molecule_name_source=pdb_author_entity_description_author_provided_display_name
pdb_molecule_name=The hepatitis delta virus ribozyme
pdb_molecule_name_source=pdb_author_entity_description
```

## Generated Asset Checks

Generated Atlas output:

```text
case_count=1126
asset_count=9178
total_size=400.02 MiB
visual_preview_residue_rows=54015
visual_preview_lss_rows=189354
```

Generated `index.json` checks:

```text
3NKB biological_molecule_name=The hepatitis delta virus ribozyme
biological_molecule_name_source distribution:
  pdb_author_entity_description_author_provided_display_name=910
  PDB/biological_layer/pdb_child_identity_index.tsv=189
  PDB/biological_layer/governance_context_display_name=27
parent_class_label unique buckets=823
unannotated parent/display residual=0
profileTracePreview case coverage=1126
internal rmdbv3 profile trace count=0
internal rmdbv3 profile preview count=0
```

## Validation Commands

The refresh must be considered valid only after these pass:

```bash
npm run verify:annojoin-atlas
npm test
npm run build
```
