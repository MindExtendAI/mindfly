/** MaleCNS v1.0 somaLocation uses isotropic 8 nm voxels.
 * https://male-cns.janelia.org/download/
 * Apply one scale and an axis reorientation to every anatomy point and soma.
 * This preserves distances and angles; it is not a template registration.
 */
export const MALECNS_VOXELS_PER_SCENE_UNIT = 23000;
export function maleCnsToScene(p: readonly (number | null)[]): [number, number, number] {
  if (p.length < 3 || !p.slice(0, 3).every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('MaleCNS point requires three finite source coordinates');
  }
  const [x, y, z] = p as number[];
  const scale = MALECNS_VOXELS_PER_SCENE_UNIT;
  return [-(x - 48000) / scale, -(z - 65000) / scale, (y - 35000) / scale];
}
