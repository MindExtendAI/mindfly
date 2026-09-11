import * as THREE from 'three';

// Procedural surface detail in object-space millimetres.
const DETAIL = `
varying vec3 vMacroPosition;
float macroHash(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float macroNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(macroHash(i), macroHash(i + vec3(1,0,0)), f.x),
                 mix(macroHash(i + vec3(0,1,0)), macroHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(macroHash(i + vec3(0,0,1)), macroHash(i + vec3(1,0,1)), f.x),
                 mix(macroHash(i + vec3(0,1,1)), macroHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 macroBump(vec3 n, float h) {
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g + n * 1e-15);
}
// Nearest point in a hexagonal lattice. fwidth fades facets before subpixel aliasing.
vec2 macroEye(vec2 p) {
  vec2 tile = vec2(1.0, 1.7320508);
  vec2 a = mod(p, tile) - tile * .5;
  vec2 b = mod(p - tile * .5, tile) - tile * .5;
  vec2 cell = dot(a,a) < dot(b,b) ? a : b;
  float edge = max(abs(cell.x), dot(abs(cell), vec2(.5, .8660254)));
  float aa = max(fwidth(edge), .012);
  float facet = 1.0 - smoothstep(.44 - aa, .5 + aa, edge);
  float resolved = 1.0 - smoothstep(.3, 1.1, max(length(dFdx(p)), length(dFdy(p))));
  return vec2(mix(.84, facet, resolved), exp(-7.5 * dot(cell,cell)) * resolved);
}
float macroSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b-a;
  return length(p-a-ba*clamp(dot(p-a,ba)/dot(ba,ba),0.0,1.0));
}
float macroWingVein(vec3 p) {
  // Illustrative wing veins; paths are not measured anatomy.
  vec2 q = vec2(p.x + .678604, abs(p.y) + .105238) / vec2(1.083644, 2.405973);
  float d = 10.0;
  d = min(d, macroSegment(q,vec2(.62,.05),vec2(.84,.44)));
  d = min(d, macroSegment(q,vec2(.84,.44),vec2(.83,.86)));
  d = min(d, macroSegment(q,vec2(.62,.05),vec2(.60,.49)));
  d = min(d, macroSegment(q,vec2(.60,.49),vec2(.55,.98)));
  d = min(d, macroSegment(q,vec2(.62,.05),vec2(.40,.50)));
  d = min(d, macroSegment(q,vec2(.40,.50),vec2(.28,.91)));
  d = min(d, macroSegment(q,vec2(.62,.05),vec2(.23,.39)));
  d = min(d, macroSegment(q,vec2(.23,.39),vec2(.11,.71)));
  d = min(d, macroSegment(q,vec2(.60,.49),vec2(.81,.55)));
  d = min(d, macroSegment(q,vec2(.40,.50),vec2(.60,.56)));
  d = min(d, macroSegment(q,vec2(.30,.81),vec2(.57,.80)));
  float aa = max(fwidth(d), .0004);
  return 1.0-smoothstep(.0025-aa,.0025+aa,d);
}
`;

function installDetail(material, kind) {
  material.userData.flySurface = kind;
  material.customProgramCacheKey = () => `fly-macro-surface-1-${kind}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacroPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + DETAIL,
    );
    let colour, roughness, normal;
    if (kind === 'eye') {
      colour = `
        vec2 macroFacet = macroEye(vMacroPosition.xz * 74.0);
        float macroHeight = macroFacet.y * .0011;
        diffuseColor.rgb *= mix(.38, 1.07, macroFacet.x);
      `;
      roughness = 'roughnessFactor = clamp(roughnessFactor + (1.0-macroFacet.x)*.13, .18, .7);';
      normal = 'normal = macroBump(normal, macroHeight);';
    } else if (kind === 'wing') {
      colour = `
        float macroVein = macroWingVein(vMacroPosition);
        float macroMembrane = macroNoise(vMacroPosition * 17.0);
        diffuseColor.rgb *= .90 + .12*macroMembrane;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.40,.24,.105), macroVein*.8);
        diffuseColor.a *= mix(1.0, 2.15, macroVein);
      `;
      roughness = 'roughnessFactor = mix(roughnessFactor, .32, macroVein);';
      normal = '';
    } else {
      colour = `
        float macroGrain = macroNoise(vMacroPosition * 34.0);
        float macroPigment = macroNoise(vMacroPosition * 7.0);
        float macroResolution = 1.0-smoothstep(.008,.045,max(length(dFdx(vMacroPosition)),length(dFdy(vMacroPosition))));
        float macroHeight = (macroGrain-.5)*.0012*macroResolution;
        diffuseColor.rgb *= .87 + .19*macroPigment + .045*macroGrain;
      `;
      roughness = 'roughnessFactor = clamp(roughnessFactor + (macroGrain-.5)*.09, .3, .85);';
      normal = 'normal = macroBump(normal, macroHeight);';
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + colour)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + roughness)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + normal);
  };
  return material;
}

export function createFlyMaterial(kind) {
  const wing = kind === 'wing',
    eye = kind === 'eye';
  const colours = {
    cuticle: 0xd4a154,
    abdomen: 0xa77637,
    dark: 0x674323,
    eye: 0xad1820,
    wing: 0xbec6d5,
  };
  return installDetail(
    new THREE.MeshPhysicalMaterial({
      color: colours[kind] ?? colours.cuticle,
      roughness: eye ? 0.29 : wing ? 0.26 : 0.47,
      metalness: 0,
      ior: 1.46,
      clearcoat: eye ? 0.18 : wing ? 0.1 : 0.13,
      clearcoatRoughness: 0.34,
      transparent: wing,
      opacity: wing ? 0.33 : 1,
      side: wing ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !wing,
      forceSinglePass: wing,
      iridescence: wing ? 0.32 : 0,
      iridescenceIOR: 1.31,
      iridescenceThicknessRange: [210, 390],
    }),
    kind,
  );
}

// Three.js Material.clone() intentionally does not copy onBeforeCompile.
// Use this for temporal wing exposures to retain the surface implementation.
export function cloneFlyMaterial(material) {
  return installDetail(material.clone(), material.userData.flySurface || 'cuticle');
}

export function createBristleMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x805021,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
}

/** Bristle geometry shares its parent segment’s articulated transform. */
export function addFlyBristles(mesh, name, material) {
  const thorax = name === 'c_thorax',
    head = name === 'c_head';
  const abdomen = name.includes('abdomen'),
    tibia = name.endsWith('_tibia');
  if (!thorax && !head && !abdomen && !tibia) return null;
  const count = thorax ? 95 : head ? 24 : abdomen ? 22 : 15;
  const positions = mesh.geometry.getAttribute('position'),
    normals = mesh.geometry.getAttribute('normal');
  const index = mesh.geometry.index;
  if (!positions || !normals) return null;
  const triCount = Math.floor((index?.count ?? positions.count) / 3);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    fn = new THREE.Vector3();
  const triangles = [],
    cdf = [];
  let area = 0;
  for (let t = 0; t < triCount; t++) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
    a.fromBufferAttribute(positions, ids[0]);
    b.fromBufferAttribute(positions, ids[1]);
    c.fromBufferAttribute(positions, ids[2]);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    fn.crossVectors(ab, ac);
    const weight = fn.length() * 0.5;
    if (!(weight > 1e-10)) continue;
    fn.normalize();
    // Dorsal body surfaces only; keep hairs out of the ventral body and eyes.
    if (!tibia && (fn.z < (head ? 0.38 : 0.12) || (a.z + b.z + c.z) / 3 < (thorax ? 0.04 : 0)))
      continue;
    triangles.push(ids);
    area += weight;
    cdf.push(area);
  }
  if (!triangles.length) return null;
  let seed = 2166136261;
  for (const ch of name) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const vertices = [],
    faceIndices = [];
  const n = new THREE.Vector3(),
    nb = new THREE.Vector3(),
    nc = new THREE.Vector3();
  const tangent = new THREE.Vector3(),
    binormal = new THREE.Vector3(),
    base = new THREE.Vector3(),
    bend = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1),
    sideways = new THREE.Vector3(0, 1, 0);
  for (let h = 0; h < count; h++) {
    const target = random() * area;
    let lo = 0,
      hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const [ia, ib, ic] = triangles[lo];
    a.fromBufferAttribute(positions, ia);
    b.fromBufferAttribute(positions, ib);
    c.fromBufferAttribute(positions, ic);
    const r = Math.sqrt(random()),
      s = random(),
      wa = 1 - r,
      wb = r * (1 - s),
      wc = r * s;
    base.copy(a).multiplyScalar(wa).addScaledVector(b, wb).addScaledVector(c, wc);
    n.fromBufferAttribute(normals, ia).multiplyScalar(wa);
    nb.fromBufferAttribute(normals, ib);
    nc.fromBufferAttribute(normals, ic);
    n.addScaledVector(nb, wb).addScaledVector(nc, wc).normalize();
    tangent.crossVectors(n, Math.abs(n.z) > 0.85 ? sideways : up).normalize();
    binormal.crossVectors(n, tangent).normalize();
    const length = (tibia ? 0.04 : thorax ? 0.062 : 0.034) * (0.6 + random() * 0.9);
    const radius = tibia ? 0.0017 : 0.002;
    const angle = random() * Math.PI * 2;
    bend.copy(tangent).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
    const start = vertices.length / 3;
    for (let ring = 0; ring < 3; ring++) {
      const t = ring * 0.5,
        rad = radius * (1 - t) + 0.00012;
      for (let side = 0; side < 3; side++) {
        const theta = (side * Math.PI * 2) / 3;
        const p = base
          .clone()
          .addScaledVector(n, length * t + 0.0005)
          .addScaledVector(bend, length * 0.23 * t * t)
          .addScaledVector(tangent, Math.cos(theta) * rad)
          .addScaledVector(binormal, Math.sin(theta) * rad);
        vertices.push(p.x, p.y, p.z);
      }
    }
    for (let ring = 0; ring < 2; ring++)
      for (let side = 0; side < 3; side++) {
        const p = start + ring * 3 + side,
          q = start + ring * 3 + ((side + 1) % 3);
        faceIndices.push(p, q, p + 3, q, q + 3, p + 3);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(faceIndices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const bristles = new THREE.Mesh(geometry, material);
  bristles.name = name + '-bristles';
  bristles.castShadow = false;
  bristles.receiveShadow = true;
  bristles.userData.surfaceBristles = count;
  mesh.add(bristles);
  return bristles;
}
