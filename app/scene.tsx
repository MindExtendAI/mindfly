'use client';
import { assetUrl } from '@/lib/asset-url';
import { StimulationDisplay, conduitFeedback } from '@/lib/stimulation-display';
import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import {
  maleCnsToScene,
  MALECNS_VOXELS_PER_SCENE_UNIT,
} from '@/lib/malecns-space';
import { layerNodeIndices, neuralLayerOpacity } from '@/lib/neural-layers';
import neuralAtlas from '@/public/neural-layers/manifest.json';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { EegDisplay } from '@/lib/neural-display';
import { Gait } from '@/lib/xenova/gait.js';
import { walkingTiming } from '@/lib/xenova/walking-kinematics.js';
import {
  createFlyMaterial,
  cloneFlyMaterial,
  createBristleMaterial,
  addFlyBristles,
} from '@/lib/xenova/fly-appearance.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AnatomyData } from '@/lib/anatomy';
import type { SimulationState } from './mindfly';

type BodyModel = {
  root: string;
  meshScale: number;
  segments: string[];
  joints: [string, string][];
  rest: Record<string, { pos: number[]; quat: number[] }>;
  meshes: Record<string, { file: string; mirror: boolean }>;
  dofs: {
    name: string;
    parent: string;
    child: string;
    axis: string | number[];
  }[];
  axisVector: Record<string, number[]>;
  neutralDeg: Record<string, number>;
};
const mapCns = (p: (number | null)[]) =>
  new THREE.Vector3(...maleCnsToScene(p));
const marker = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'white');
  g.addColorStop(0.25, 'rgba(255,255,255,.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
};
export default function LaboratoryScene({
  anatomy,
  eeg,
  contactColors,
  flight,
  onReady,
  onError,
  revision,
}: {
  anatomy: AnatomyData | null;
  eeg: RefObject<EegDisplay>;
  contactColors: string[];
  flight: RefObject<SimulationState>;
  onReady: () => void;
  onError: (s: string) => void;
  revision: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const eegLabel = useRef<HTMLSpanElement>(null);
  const electrodeLabels = useRef<(HTMLSpanElement | null)[]>([]);
  const callbacks = useRef({ onReady, onError });
  useEffect(() => {
    callbacks.current = { onReady, onError };
  }, [onReady, onError]);
  useEffect(() => {
    if (!canvas.current || !anatomy) return;
    let disposed = false,
      frame = 0,
      visible = true;
    const abort = new AbortController();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas.current,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      callbacks.current.onError(
        'This browser could not start 3D graphics. Enable hardware acceleration and reload.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setClearColor(0x111111, 0);
    renderer.autoClear = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x111111, 0.016);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    const flyCamera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 160);
    flyCamera.layers.set(2);
    canvas.current.style.touchAction = 'pan-y';
    const texture = marker();
    scene.add(new THREE.HemisphereLight(0xdddddd, 0x222222, 1.2));
    const key = new THREE.DirectionalLight(0xffdeb0, 2.8);
    key.position.set(3, 5, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb7b7b7, 2.8);
    rim.position.set(-3, 3, -4);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xdededf, 1.4);
    fill.position.set(8, 0, 6);
    scene.add(fill);
    scene.traverse((o) => {
      if (o instanceof THREE.Light) o.layers.enable(2);
    });
    const human = new THREE.Group(),
      cns = new THREE.Group(),
      fly = new THREE.Group();
    scene.add(human, cns, fly);
    // Original generated raster with its alpha channel preserved.
    let humanTexture: THREE.Texture | null = null;
    const humanMat = new THREE.MeshBasicMaterial({
      color: 0xb0b0b0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    const humanImage = new THREE.Mesh(
      new THREE.PlaneGeometry(3.52, 4.4),
      humanMat,
    );
    humanImage.position.set(0, -0.29, 0.8);
    humanImage.visible = false;
    human.add(humanImage);
    // Channel positions are schematic and retain their existing screen layout.
    const sensorSites = [
      new THREE.Vector3(-2.02, -0.85, 0.8),
      new THREE.Vector3(-1.4, 1.8, 0.8),
      new THREE.Vector3(1.4, 1.8, 0.8),
      new THREE.Vector3(2.02, -0.85, 0.8),
    ];
    const humanCrown = new THREE.Vector3(),
      flyLocalCenter = new THREE.Vector3(-0.8, 0, -0.5);
    const orientHuman = () => {
      human.lookAt(camera.position);
      human.updateMatrixWorld(true);
      humanCrown.copy(human.localToWorld(new THREE.Vector3(0, 1.7, 0.8)));
    };
    const loadHuman = async () => {
      const image = await new THREE.TextureLoader().loadAsync(
        assetUrl('/human-brain-illustration.png'),
      );
      if (disposed) {
        image.dispose();
        return;
      }
      image.colorSpace = THREE.SRGBColorSpace;
      humanTexture = image;
      humanMat.map = image;
      humanMat.needsUpdate = true;
      humanImage.visible = true;
    };
    // Every registered raster uses the same plane and source-to-pixel transform.
    const atlasScale =
      neuralAtlas.projection.pixelsPerVoxel * MALECNS_VOXELS_PER_SCENE_UNIT;
    const atlasGeometry = new THREE.PlaneGeometry(
      neuralAtlas.width / atlasScale,
      neuralAtlas.height / atlasScale,
    );
    const atlasCenter = mapCns([
      neuralAtlas.projection.sourceCenter[0],
      35000,
      neuralAtlas.projection.sourceCenter[1],
    ]);
    const atlasTextures: THREE.Texture[] = [];
    const atlasLoader = new THREE.TextureLoader();
    const addAtlasPlane = (opacity: number, order: number) => {
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        fog: false,
      });
      material.visible = false;
      const plane = new THREE.Mesh(atlasGeometry, material);
      plane.position.copy(atlasCenter);
      plane.renderOrder = order;
      cns.add(plane);
      return material;
    };
    const atlasBase = addAtlasPlane(1, 0);
    const atlasIndices = layerNodeIndices(
      neuralAtlas.groups,
      anatomy.circuit.nodes,
    );
    const atlasMaterials = neuralAtlas.groups.map((_, i) =>
      addAtlasPlane(0, i + 1),
    );
    const loadAtlas = async () => {
      const files = [
        neuralAtlas.anatomyBase,
        ...neuralAtlas.groups.map((g) => g.layer),
      ];
      const materials = [atlasBase, ...atlasMaterials];
      await Promise.all(
        files.map(async (file, i) => {
          const t = await atlasLoader.loadAsync(
            assetUrl('/neural-layers/' + file),
          );
          if (disposed) {
            t.dispose();
            return;
          }
          t.colorSpace = THREE.SRGBColorSpace;
          t.generateMipmaps = false;
          t.minFilter = THREE.LinearFilter;
          atlasTextures.push(t);
          materials[i].map = t;
          materials[i].visible = true;
          materials[i].needsUpdate = true;
        }),
      );
    };
    const pulseOpacity = 0.5;
    // One abstract signal conduit links the two brains; not anatomical axons.
    const conduitMat = new THREE.MeshBasicMaterial({
      color: 0xa6a6a6,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
      depthWrite: false,
    });
    const conduits = [new THREE.Mesh(new THREE.BufferGeometry(), conduitMat)];
    // Nested screen-facing strokes leave a dark channel between the tube edges.
    const conduitInterior = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0x0e0e0e,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    const conduitFill = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: 0xc9c9c9,
        transparent: true,
        opacity: 0.16,
        depthTest: false,
        depthWrite: false,
      }),
    );
    conduits[0].renderOrder = 1;
    conduitInterior.renderOrder = 2;
    conduitFill.renderOrder = 3;
    scene.add(conduitInterior, conduitFill);
    let filled = 0,
      conduitReset = -1;
    let conduitKey = '';
    conduits.forEach((x) => {
      scene.add(x);
    });
    let curves: THREE.CubicBezierCurve3[] = [];
    const stimulationDisplay = new StimulationDisplay();
    const conduitPulses = Array.from({ length: 8 }, () => {
      const pulse = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: 0xffffff,
          transparent: true,
          opacity: pulseOpacity,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pulse.scale.setScalar(0.12);
      pulse.visible = false;
      pulse.renderOrder = 5;
      scene.add(pulse);
      return pulse;
    });
    const arena = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(22, 128),
      new THREE.MeshBasicMaterial({
        color: 0x2b2b2b,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.layers.set(2);
    arena.add(floor);
    const arenaRim = new THREE.Mesh(
      new THREE.RingGeometry(22, 22.3, 128),
      new THREE.MeshBasicMaterial({
        color: 0x747474,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    arenaRim.rotation.x = -Math.PI / 2;
    arenaRim.position.y = 0.02;
    arenaRim.layers.set(2);
    arena.add(arenaRim);
    scene.add(arena);

    const trailGeometry = new THREE.BufferGeometry();
    const trailPoints = new Float32Array(180 * 3);
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(trailPoints, 3),
    );
    trailGeometry.setDrawRange(0, 0);
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: 0xbcbcbc,
        transparent: true,
        opacity: 0.42,
        fog: false,
      }),
    );
    trail.layers.set(2);
    trail.frustumCulled = false;
    scene.add(trail);
    let small = false,
      canvasWidth = 1,
      canvasHeight = 1;
    const resize = () => {
      const el = canvas.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      small = window.matchMedia('(max-width: 600px)').matches;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      if (small) {
        camera.position.set(0, 0, 23);
        human.position.set(-2.15, 3.8, 0);
        human.scale.setScalar(0.6);
        cns.position.set(-2.05, -2.35, 0);
        cns.scale.setScalar(0.55);
      } else {
        camera.position.set(
          0,
          0,
          Math.max(15, 18 / camera.aspect / Math.tan(Math.PI * 0.1) / 2),
        );
        human.position.set(-6.2, 0.5, 0);
        human.scale.setScalar(0.95);
        cns.position.set(-2.8, 0.08, 0);
        cns.scale.setScalar(0.85);
      }
      fly.scale.setScalar(3);
      camera.position.y = small ? 0 : 0.5;
      camera.lookAt(0, small ? 0 : 0.5, 0);
      if (!small) {
        const halfWidth =
          camera.position.z * Math.tan(Math.PI * 0.1) * camera.aspect;
        human.position.x = -halfWidth * 0.6;
        cns.position.x = -halfWidth * 0.12;
      } else {
        const halfWidth =
          camera.position.z * Math.tan(Math.PI * 0.1) * camera.aspect;
        human.position.x = cns.position.x = -halfWidth * 0.5;
        human.scale.setScalar(Math.min(0.6, halfWidth * 0.15));
        cns.scale.setScalar(Math.min(0.55, halfWidth * 0.14));
      }
      orientHuman();
      camera.updateProjectionMatrix();
      canvasWidth = width;
      canvasHeight = height;
      const a = human.position
        .clone()
        .add(new THREE.Vector3(0, 1.42 * human.scale.y, 0));
      const b = cns.position
        .clone()
        .add(new THREE.Vector3(0, 2.35 * cns.scale.y, 0));
      curves = [
        new THREE.CubicBezierCurve3(
          a,
          a.clone().add(new THREE.Vector3(small ? 1.7 : 0, 1.25, 0)),
          b.clone().add(new THREE.Vector3(small ? 1.7 : 0, 1.25, 0)),
          b,
        ),
      ];
      conduits.forEach((l, i) => {
        l.geometry.dispose();
        l.geometry = new THREE.TubeGeometry(curves[i], 80, 0.065, 8, false);
      });
      conduitKey = '';
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.current);
    resize();
    const io = new IntersectionObserver((e) => {
      visible = e[0].isIntersecting;
    });
    io.observe(canvas.current);
    const read = async (path: string) => {
      const r = await fetch(path, { signal: abort.signal });
      if (!r.ok) throw Error('An anatomy file could not be loaded.');
      return r;
    };
    const meshEntries: { name: string; mesh: THREE.Mesh }[] = [];
    let model: BodyModel | null = null;
    let gait: Gait | null = null;
    let lastPoseTime = -1;
    const echoes: {
      name: string;
      mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
      offset: number;
    }[] = [];
    const body = new THREE.Group();
    body.rotation.set(-Math.PI / 2, 0, 0);
    fly.add(body);

    const bodyMaterials = {
      cuticle: createFlyMaterial('cuticle'),
      abdomen: createFlyMaterial('abdomen'),
      eye: createFlyMaterial('eye'),
      dark: createFlyMaterial('dark'),
      wing: createFlyMaterial('wing'),
    };
    const bristleMaterial = createBristleMaterial();
    const animateBody = (
      t: number,
      altitude: number,
      velocity: number,
      freeze = false,
      walking = false,
      gaitPhase = 0,
      grooming = false,
    ) => {
      if (!gait || t === lastPoseTime) return;
      lastPoseTime = t;
      const air = walking
        ? 0
        : Math.min(1, (altitude + Math.max(0, velocity) * 0.2) / 0.5);
      const state = {
        time: freeze ? 0 : t,
        studyWalking: walking,
        grooming: grooming && !freeze,
        phase: freeze ? 0 : gaitPhase,
        velocity: walking && !freeze ? velocity : 0,
        yawRate: 0,
        y: altitude,
        flightBlend: air,
        wingOpen: air,
        landing: Math.max(0, 1 - altitude),
      };
      const transforms = gait.update(state) as Record<string, number[]>;
      for (const { name, mesh } of meshEntries) {
        mesh.matrix.fromArray(transforms[name]).transpose();
        mesh.matrixWorldNeedsUpdate = true;
      }
      const blur = freeze ? 0 : Math.max(0, (air - 0.7) / 0.3);
      for (const offset of [(-Math.PI * 2) / 3, (Math.PI * 2) / 3]) {
        const tr =
          blur > 0
            ? (gait.wingTransforms(state, offset) as Record<string, number[]>)
            : null;
        for (const e of echoes.filter((e) => e.offset === offset)) {
          e.mesh.visible = blur > 0;
          if (tr) {
            e.mesh.material.opacity = 0.075 * blur;
            e.mesh.matrix.fromArray(tr[e.name]).transpose();
            e.mesh.matrixWorldNeedsUpdate = true;
          }
        }
      }
    };
    const load = async () => {
      const [m] = await Promise.all([
        read(assetUrl('/fly/model.json')).then(
          (r) => r.json() as Promise<BodyModel>,
        ),
        loadAtlas(),
        loadHuman(),
      ]);
      if (disposed) return;
      model = m;
      gait = new Gait(m);
      orientHuman();
      const files = [
          ...new Set(Object.values(model!.meshes).map((x) => x.file)),
        ],
        raw = new Map<string, ArrayBuffer>();
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 5 }, async () => {
          while (cursor < files.length) {
            const f = files[cursor++];
            raw.set(
              f,
              await read(assetUrl('/fly/meshes/' + f)).then((r) =>
                r.arrayBuffer(),
              ),
            );
          }
        }),
      );
      if (disposed) return;
      const loader = new STLLoader();
      for (const [name, cfg] of Object.entries(model!.meshes)) {
        let g = loader.parse(raw.get(cfg.file)!);
        g.scale(
          model!.meshScale,
          model!.meshScale * (cfg.mirror ? -1 : 1),
          model!.meshScale,
        );
        if (cfg.mirror) {
          const p = g.getAttribute('position');
          for (let i = 0; i < p.count; i += 3) {
            const v = new THREE.Vector3().fromBufferAttribute(p, i + 1);
            p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
            p.setXYZ(i + 2, v.x, v.y, v.z);
          }
        }
        g.deleteAttribute('normal');
        const merged = mergeVertices(g, 0.0001);
        g.dispose();
        g = merged;
        g.computeVertexNormals();
        const mat = name.includes('wing')
          ? bodyMaterials.wing
          : name.endsWith('eye')
            ? bodyMaterials.eye
            : name.includes('abdomen')
              ? bodyMaterials.abdomen
              : /tarsus|arista/.test(name)
                ? bodyMaterials.dark
                : bodyMaterials.cuticle;
        const mesh = new THREE.Mesh(g, mat);
        mesh.layers.set(2);
        mesh.matrixAutoUpdate = false;
        body.add(mesh);
        meshEntries.push({ name, mesh });
        addFlyBristles(mesh, name, bristleMaterial);
        mesh.traverse((o) => o.layers.set(2));
        if (name.includes('wing'))
          for (const offset of [(-Math.PI * 2) / 3, (Math.PI * 2) / 3]) {
            const material = cloneFlyMaterial(bodyMaterials.wing);
            material.opacity = 0;
            const echo = new THREE.Mesh(g, material);
            echo.layers.set(2);
            echo.matrixAutoUpdate = false;
            echo.visible = false;
            body.add(echo);
            echoes.push({ name, mesh: echo, offset });
          }
      }
      body.position.set(-0.4, -0.15, -1.1);
      lastPoseTime = -1; // Assets can arrive after RAF has evaluated the empty rig.
      animateBody(0, 0, 0);
      scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      for (const entry of meshEntries) {
        entry.mesh.geometry.computeBoundingBox();
        bounds.union(
          entry.mesh.geometry
            .boundingBox!.clone()
            .applyMatrix4(entry.mesh.matrixWorld),
        );
      }
      bounds.getCenter(flyLocalCenter);
      fly.worldToLocal(flyLocalCenter);
      body.position.sub(flyLocalCenter);
      arena.position.y = 2 * (body.position.y + 0.1);
      callbacks.current.onReady();
    };
    void load().catch((e) => {
      if (!disposed && e.name !== 'AbortError')
        callbacks.current.onError(
          'Could not load the 3D anatomy. Check your connection and retry.',
        );
    });
    let last = performance.now(),
      elapsed = 0,
      lastReset = -1,
      legPhase = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        const f = flight.current;
        elapsed += dt;
        // Schematic electrode labels only; no scalp dots or surrounding ring.
        sensorSites.forEach((_, i) => {
          const ch = eeg.current.channels[i];
          const valid = !!ch?.valid;
          const label = electrodeLabels.current[i];
          if (label) {
            const p = human
              .localToWorld(sensorSites[i].clone())
              .project(camera);
            // Keep the sensor label readable even when its schematic site is near an edge.
            const margin = Math.max(42, label.offsetWidth / 2 + 6);
            label.style.left = `${Math.max(margin, Math.min(canvasWidth - margin, (p.x * 0.5 + 0.5) * canvasWidth))}px`;
            label.style.top = `${(-p.y * 0.5 + 0.5) * canvasHeight + 9}px`;
            label.dataset.valid = String(valid);
          }
        });
        atlasMaterials.forEach((material, i) => {
          material.opacity = neuralLayerOpacity(
            atlasIndices[i],
            f.active,
            f,
            neuralAtlas.groups[i].role === 'BPN candidate',
          );
        });
        // The illustrative connection terminates at the crown of each brain.
        if (curves[0]) {
          const curve = curves[0];
          curve.v0.copy(humanCrown);
          curve.v3.copy(cns.localToWorld(new THREE.Vector3(0, 2.35, 0)));
          curve.v1
            .copy(curve.v0)
            .add(new THREE.Vector3(small ? 1.7 : 0, 1.25, 0));
          curve.v2
            .copy(curve.v3)
            .add(new THREE.Vector3(small ? 1.7 : 0, 1.25, 0));
          const key = [
            curve.v0.x,
            curve.v0.y,
            curve.v0.z,
            curve.v3.x,
            curve.v3.y,
            curve.v3.z,
            small,
          ].join(',');
          if (key !== conduitKey) {
            for (const [mesh, radius] of [
              [conduits[0], 0.065],
              [conduitInterior, 0.045],
              [conduitFill, 0.025],
            ] as const) {
              mesh.geometry.dispose();
              mesh.geometry = new THREE.TubeGeometry(
                curve,
                80,
                radius,
                8,
                false,
              );
            }
            conduitKey = key;
          }
        }
        const stimulating = f.running && f.inputHz === 10;
        const feedback = conduitFeedback(f.drive, f.running, stimulating);
        if (conduitReset !== f.reset) {
          filled = 0;
          conduitReset = f.reset;
        }
        // Fill advances toward the fly and retreats immediately when focus drops.
        filled = Math.min(feedback.fill, filled + dt / 0.8);
        conduitFill.geometry.setDrawRange(0, Math.floor(filled * 80) * 8 * 6);
        conduitFill.visible = filled > 0;
        const controlPulses = stimulationDisplay.sample(
          now,
          feedback.fill > 0,
          f.reset,
        );
        conduitPulses.forEach((sprite, i) => {
          const pulse = controlPulses[i];
          sprite.visible =
            !!pulse && pulse.progress <= filled && !!curves[0] && !reduced;
          if (sprite.visible)
            sprite.position.copy(curves[0].getPoint(pulse.progress));
        });
        if (eegLabel.current && curves[0]) {
          eegLabel.current.textContent =
            'Focus to Send 10 Hz Stimulation to Fly Brain';
          const midpoint = curves[0].getPoint(0.5).project(camera);
          eegLabel.current.style.left = `${(small ? 0.25 : midpoint.x * 0.5 + 0.5) * canvasWidth}px`;
          eegLabel.current.style.top = `${small ? canvasHeight * 0.365 : (-midpoint.y * 0.5 + 0.5) * canvasHeight - 10}px`;
        }
        const nav = f.navigation;
        fly.position.fromArray(nav.position);
        // Enlarge the displayed body; navigation coordinates stay unchanged.
        fly.scale.setScalar(3);
        const direction = Number.isFinite(nav.heading)
          ? new THREE.Vector3(Math.cos(nav.heading!), 0, Math.sin(nav.heading!))
          : new THREE.Vector3().fromArray(nav.velocity);
        if (direction.lengthSq() > 0.001) {
          const orientation = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(1, 0, 0),
            direction.normalize(),
          );
          fly.quaternion.slerp(orientation, 1 - Math.exp(-dt * 10));
        }
        if (f.reset !== lastReset) {
          fly.quaternion.identity();
          lastReset = f.reset;
          legPhase = 0;
        }
        const walkingSpeed = Math.hypot(...nav.velocity);
        legPhase += walkingTiming(walkingSpeed).frequency * Math.PI * 2 * dt;
        if (!f.posePaused)
          animateBody(
            elapsed,
            0,
            Math.hypot(...nav.velocity),
            reduced,
            true,
            legPhase,
            false,
          );
        if (!f.running) for (const e of echoes) e.mesh.visible = false;
        nav.trail.forEach((p, i) => trailPoints.set(p, i * 3));
        trailGeometry.getAttribute('position').needsUpdate = true;
        trailGeometry.setDrawRange(0, nav.trail.length);
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        renderer.clear();
        renderer.render(scene, camera);
        {
          const left = Math.round(canvasWidth * (small ? 0.47 : 0.54)),
            width = canvasWidth - left;
          const aspect = width / canvasHeight,
            halfHeight = Math.max(34, 25 / aspect) / 0.8,
            halfWidth = halfHeight * aspect;
          flyCamera.left = -halfWidth;
          flyCamera.right = halfWidth;
          // An asymmetric frustum raises the arena without changing its scale.
          flyCamera.top = halfHeight * 0.96;
          flyCamera.bottom = -halfHeight * 1.04;
          flyCamera.up.set(1, 0, 0);
          // Fixed dorsal view of the walking arena.
          flyCamera.position.set(0, 40, 0);
          flyCamera.lookAt(0, 0, 0);
          flyCamera.updateProjectionMatrix();
          flyCamera.updateMatrixWorld();
          renderer.clearDepth();
          renderer.setViewport(left, 0, width, canvasHeight);
          renderer.setScissor(left, 0, width, canvasHeight);
          renderer.setScissorTest(true);
          renderer.render(scene, flyCamera);
          renderer.setScissorTest(false);
        }
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const contextLost = (e: Event) => {
      e.preventDefault();
      callbacks.current.onError(
        '3D graphics paused. Tap Retry to rebuild the scene.',
      );
    };
    canvas.current.addEventListener('webglcontextlost', contextLost);
    const element = canvas.current;
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      element.removeEventListener('webglcontextlost', contextLost);
      scene.traverse((o) => {
        const ob = o as THREE.Mesh;
        if (ob.geometry) ob.geometry.dispose();
        if (ob.material) {
          for (const m of Array.isArray(ob.material)
            ? ob.material
            : [ob.material])
            m.dispose();
        }
      });
      texture.dispose();
      humanTexture?.dispose();
      atlasTextures.forEach((t) => t.dispose());
      bristleMaterial.dispose();
      renderer.dispose();
    };
  }, [anatomy, eeg, flight, revision]);
  return (
    <>
      <canvas
        ref={canvas}
        className="laboratory-canvas"
        aria-label="Generated human brain illustration, MaleCNS brain and nerve cord, and articulated fruit fly"
      />
      <span className="eeg-conduit-label" ref={eegLabel}>
        Focus to Send 10 Hz Stimulation to Fly Brain
      </span>
      {['TP9', 'AF7', 'AF8', 'TP10'].map((name, i) => (
        <span
          className="scalp-electrode-label"
          key={name}
          ref={(el) => {
            electrodeLabels.current[i] = el;
          }}
        >
          <i
            className="scalp-contact-dot"
            style={{ background: contactColors[i] }}
          />
          {name}
        </span>
      ))}
    </>
  );
}
