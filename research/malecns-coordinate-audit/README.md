# MaleCNS coordinate verification

The 54 modeled-cell soma coordinates are correctly located in the source coordinate system. Each body ID, cell type, soma side, and XYZ position exactly matches the official MaleCNS v1.0 annotation release. All 141,781 background points also match official soma locations. The background is a soma point cloud, not a neuropil mesh or a separately registered brain image.

## Sources and reproducibility

- Janelia release and coordinate-unit documentation: https://male-cns.janelia.org/download/
- Official annotations: https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather
- Soma-location semantics: https://natverse.org/malecns/reference/mcns_soma_side.html
- Secondary anatomical classification: https://www.virtualflybrain.org/term/smp459-fbbt_20003321/
- Bidaye et al. 2020: https://doi.org/10.1016/j.neuron.2020.07.032

Run `python verify.py /path/to/official-annotations.feather` with pyarrow installed. The checked source SHA-256 and all 54 official annotation records are in result.json. The script fails on any mismatched ID, coordinate, type, side or unmatched background position. Background membership checks establish coordinate membership, not that the app includes every annotated neuron.

As an additional coordinate-space check, downloaded official unmirrored 8-nm SWC skeletons for CL209 body 13100 and VNC interneuron 800296. Their nearest skeleton samples to the official soma positions were 0.780 and 2.033 micrometres away, respectively. Skeleton samples are not soma-centroid annotations; this is a consistency check, not a second exact soma measurement.

- https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/13100.swc
- https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/800296.swc

## Display coordinates

The coordinate transform in `lib/malecns-space.ts` applies an axis permutation
and sign change with a uniform divisor of 23,000. Source coordinates are
unchanged. Regression checks cover all 1,431 modeled soma pairs and reject
missing or nonfinite positions. The visible neuron overlays use registered
skeleton projections; see [visualization provenance](../../docs/neural-visualization.md).

## Limits

- Of 54 modeled somata, 44 are in the brain and 10 in the VNC. The VNC cells comprise ascending, efferent-ascending and intrinsic types with T1–T3 soma-neuromere annotations. Lower dots are not misplaced brain somata.
- Soma annotations locate cell bodies, not synapses. Overlay brightness represents simulated activity, not a measured recording.
- The model has 24 candidate inputs (CL208: 4, CL209: 2, SMP459: 8, SMP460: 2, SMP461: 8). Bidaye describes approximately eight BPN cells per hemisphere. VFB classifies SMP459 under BPN, but an exact mapping from the study's genetic driver to these 24 male-CNS bodies is not established. No source coordinates or model inputs were changed to force a visual match to a different specimen.
- The screen is a projection. An anatomically posterior soma can appear over the central-brain silhouette; a screenshot does not reveal depth. Soma correctness does not validate modeled activity or the EEG-to-walking rule.
