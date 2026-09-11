# Neural visualization

[Documentation index](README.md)

MindFly displays three different things: measured or generated EEG, recorded fly
anatomy, and simulated neural activity. Their visual roles are kept separate.

## Human brain and EEG

The human brain is a fixed [generated illustration](human-brain-image.md).
It does not rotate, brighten when focus passes the threshold, or show activity
localized inside the brain. TP9, AF7, AF8 and TP10 labels mark schematic headset
positions rather than registered anatomical coordinates.

The EEG panel displays four scalp-electrode waveforms. In demo mode, these are
generated signals. Dots beside the channel labels show estimated contact quality:

| Color | Meaning |
| --- | --- |
| Green | Good contact |
| Yellow | Fair contact |
| Red | Poor contact or missing recent data |
| Gray | Disconnected |

The dots do not show alpha power or attention. The current panel has no numeric
per-channel alpha-power readout. EEG processing runs in the private Rust/WASM
module; the public code handles the connection, display and module interface.

Four scalp channels cannot resolve individual neurons. The illustration is not
an EEG source-localization result, and accepted signals may still contain artifacts.

## Fly anatomy and neuron layers

The gray background and white overlays share one registered projection of
[MaleCNS](https://male-cns.janelia.org/download/) coordinates. The lower anatomical
structure is the ventral nerve cord, not an extension of the brain.

The [layer manifest](../public/neural-layers/manifest.json) defines **25 cell-type
groups covering all 54 modeled neurons**. Groups are based on cell type, not an
assumption that every left neuron has a mirrored right partner. Each layer contains
official skeleton centerlines and separately annotated cell-body positions.

| Projection property | Value |
| --- | --- |
| Runtime canvas | 768 × 1024 pixels |
| Original export | 3072 × 4096 pixels |
| Horizontal axis | Negative source X |
| Vertical axis | Positive source Z |
| Depth | Source Y, projected out |
| Source coordinate unit | 8 nm |

All layers use the same canvas and transform. Coordinates are not mirrored,
jittered or moved to improve the composition. The
[coordinate audit](../research/malecns-coordinate-audit/README.md) records the
source checks; [registration tests](../tests/neural-layers.test.mjs) check that
all model cells are included exactly once.

## Brightness and timing

Each layer's opacity follows the mean modeled spike afterglow of its cells,
scaled to a maximum of 0.85. Group brightness does not mean that every cell in
the group fired simultaneously. The decay is a display choice, not measured
calcium dynamics.

Overlays are hidden when control is inactive or usable focus is below 65%.
Candidate BPN layers additionally require stimulation to be on. Downstream
layers follow their modeled activity while the display gate is open.
See [lib/neural-layers.ts](../lib/neural-layers.ts) for the exact rule.

The fly display is grayscale. Highlighted branches show neuron anatomy, and
their brightness represents modeled activity. They do not depict measured action
potentials traveling along the branches.

## Connecting curve

The curve between the human and fly brains shows progress toward stimulation.
At 30% focus it fills to about 46% of its length; it reaches the fly at 65% when
stimulation is enabled. If stimulation is inactive, it remains short of the endpoint.

White dots repeat every 100 ms and take 800 ms to traverse the full curve.
These are visual feedback timings. The neural model starts stimulation when its
gate opens, without waiting for a dot to arrive. Reduced-motion settings hide
the moving dots. See [lib/stimulation-display.ts](../lib/stimulation-display.ts).

The curve does not represent raw EEG transmission, synchronization between species,
or the conduction speed of a biological axon.

## Interpreting the result

Recorded anatomy establishes where structures were reconstructed. It does not
validate the simulated firing pattern or identify the exact cells activated in
the Bidaye experiment. An unlit layer is a display/model state, not evidence that
a real neuron is silent. See the [walking model](BPN_RECONSTRUCTION.md) for the
circuit assumptions and validation limits.
