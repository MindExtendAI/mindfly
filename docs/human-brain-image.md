# Human brain illustration

[Documentation index](README.md)

MindFly uses a static PNG illustration for the human brain. It is a visual
reference beside the EEG channel labels, not a scan or a reconstruction of
activity inside the user's brain.

## Asset and origin

- **File:** [human-brain-illustration.png](../public/human-brain-illustration.png).
- **Generated:** 11 September 2026, using OpenAI image generation.
- **Input:** the text prompt below, with no reference image or mesh supplied.
- **Style:** simplified grayscale folds, matte shading and a transparent background.

The source PNG retains its generated alpha channel.

## Rendering

[app/scene.tsx](../app/scene.tsx) draws the image on a plane in a fixed superior
view. The material uses **0.85 opacity** and a gray tint (`0xb0b0b0`). Effective
transparency also depends on each pixel's original alpha.

The illustration stays static as focus changes. Channel labels are positioned
separately at schematic headset locations; they are not part of the image.

## Generation prompt

The original prompt is retained verbatim for provenance. The generated file,
rather than a new generation from the same prompt, is the reproducible asset.

<details>
<summary>Show the original prompt</summary>

Use case: stylized-concept. Create an original human brain sprite for a dark scientific web interface. A simple matte charcoal-gray 3D mesh-style render, with large smooth rounded simplified folds, subtly irregular lobes, soft low-contrast diffuse shading and deep gray creases. It should look like a basic smooth untextured computer graphics anatomical model, NOT a realistic medical specimen or photograph. NO veins, tissue texture, pores, fine surface detail, glossy wet material or dramatic highlights. Superior dorsal view directly from above, frontal lobes toward top, two cerebral hemispheres and vertical central fissure. Rounded oval silhouette, height 1.25 times width. Cerebrum only, no brainstem. Centered portrait canvas, entire brain visible with 5% transparent margins, TRUE TRANSPARENT ALPHA BACKGROUND. Neutral grayscale only, matte medium-dark gray. No cast shadow outside silhouette. No text, labels, electrodes, dots, cord, border, other objects. Independently invent the folds from this description; no source image. The goal is a restrained low-detail gray 3D anatomical mesh appearance, not photorealistic.

</details>
