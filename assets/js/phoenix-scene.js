import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm";

const DEFAULT_MODEL_URL = "./assets/models/phoenix-eagle.glb";
const PALETTE_CYCLE_EVENT = "phoenix:palette-cycle";
const PALETTE_CHANGED_EVENT = "phoenix:palette-changed";
const TAU = Math.PI * 2;
const TERRAIN_TILE = 13;

const DEFAULT_PALETTES = Object.freeze([
  Object.freeze({
    name: "Ember",
    sky: 0x6b5436,
    fog: 0xccb089,
    sun: 0xffc878,
    ambient: 0x8f96b5,
    mountain: 0x4a4456,
    mountainFar: 0x6d6678,
    cloud: 0xf3ede2,
    bird: 0xff7a28,
    wing: 0xffc04d,
    accent: 0xfff1b8,
  }),
  Object.freeze({
    name: "Aurora",
    sky: 0x07191d,
    fog: 0x12343a,
    sun: 0x8dffe0,
    ambient: 0x76a9d8,
    mountain: 0x16424a,
    mountainFar: 0x102b38,
    cloud: 0xc4f4ed,
    bird: 0x29d3b2,
    wing: 0x68f6d1,
    accent: 0xe6fff7,
  }),
  Object.freeze({
    name: "Solstice",
    sky: 0x160a21,
    fog: 0x3d183f,
    sun: 0xff7398,
    ambient: 0x9587d8,
    mountain: 0x4a2356,
    mountainFar: 0x281633,
    cloud: 0xf1cbec,
    bird: 0xe84b7a,
    wing: 0xff8a76,
    accent: 0xffe3bd,
  }),
  Object.freeze({
    name: "Daybreak",
    sky: 0x759db0,
    fog: 0xadc1c3,
    sun: 0xffe0a3,
    ambient: 0xc4dcdf,
    mountain: 0x556b68,
    mountainFar: 0x718487,
    cloud: 0xffffff,
    bird: 0xb63f27,
    wing: 0xe67b3d,
    accent: 0xffd27d,
  }),
]);

let sharedPaletteIndex = 0;
let nextSceneId = 1;
const activePaletteScenes = new Set();
let paletteCoordinatorAttached = false;

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function modulo(value, length) {
  return ((value % length) + length) % length;
}

function resolveElement(value) {
  if (!value) return null;
  if (typeof value === "string") return document.querySelector(value);
  return value;
}

function createRandom(seed = 48151623) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function colorValue(value, fallback) {
  try {
    return new THREE.Color(value ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function normalizePalette(palette, fallback) {
  return {
    name: palette?.name || fallback.name,
    sky: colorValue(palette?.sky, fallback.sky),
    fog: colorValue(palette?.fog, fallback.fog),
    sun: colorValue(palette?.sun, fallback.sun),
    ambient: colorValue(palette?.ambient, fallback.ambient),
    mountain: colorValue(palette?.mountain, fallback.mountain),
    mountainFar: colorValue(palette?.mountainFar, fallback.mountainFar),
    cloud: colorValue(palette?.cloud, fallback.cloud),
    bird: colorValue(palette?.bird, fallback.bird),
    wing: colorValue(palette?.wing, fallback.wing),
    accent: colorValue(palette?.accent, fallback.accent),
  };
}

function paletteEventDetail(palette) {
  return {
    primary: `#${palette.bird.getHexString()}`,
    secondary: `#${palette.wing.getHexString()}`,
    glow: `#${palette.accent.getHexString()}`,
  };
}

function handleSharedPaletteCycle(event) {
  if (!activePaletteScenes.size) return;
  const firstScene = activePaletteScenes.values().next().value;
  const requestedIndex = Number(event?.detail?.index);
  const step = Number(event?.detail?.step);
  const nextIndex = Number.isFinite(requestedIndex)
    ? requestedIndex
    : sharedPaletteIndex + (Number.isFinite(step) ? step : 1);
  sharedPaletteIndex = modulo(nextIndex, firstScene.paletteCount);

  let detail = null;
  for (const registeredScene of activePaletteScenes) {
    const sceneDetail = registeredScene.apply(sharedPaletteIndex);
    if (!detail) detail = sceneDetail;
  }

  window.dispatchEvent(
    new CustomEvent(PALETTE_CHANGED_EVENT, {
      detail: detail || firstScene.getDetail(),
    }),
  );
}

function registerPaletteScene(sceneRegistration) {
  activePaletteScenes.add(sceneRegistration);
  if (!paletteCoordinatorAttached) {
    window.addEventListener(PALETTE_CYCLE_EVENT, handleSharedPaletteCycle);
    paletteCoordinatorAttached = true;
  }
}

function unregisterPaletteScene(sceneRegistration) {
  activePaletteScenes.delete(sceneRegistration);
  if (paletteCoordinatorAttached && !activePaletteScenes.size) {
    window.removeEventListener(PALETTE_CYCLE_EVENT, handleSharedPaletteCycle);
    paletteCoordinatorAttached = false;
  }
}

function safelyCall(callback, value, debugLabel) {
  if (typeof callback !== "function") return;
  try {
    callback(value);
  } catch (error) {
    console.error(`[PhoenixScene] ${debugLabel} callback failed.`, error);
  }
}

function disposeMaterial(material, disposedTextures) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture && !disposedTextures.has(value)) {
      disposedTextures.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

function disposeGraph(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) {
      if (material) materials.add(material);
    }
  });

  for (const material of materials) disposeMaterial(material, textures);
}

function createCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, 128, 128);

  const lobes = [
    [64, 67, 50, 0.72],
    [38, 72, 34, 0.48],
    [88, 73, 37, 0.5],
    [57, 44, 31, 0.42],
    [78, 48, 28, 0.36],
  ];
  for (const [x, y, radius, opacity] of lobes) {
    const gradient = context.createRadialGradient(x, y, 2, x, y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${opacity})`);
    gradient.addColorStop(0.42, `rgba(255,255,255,${opacity * 0.52})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function updateTerrainColors(mesh, palette) {
  const position = mesh.geometry.getAttribute("position");
  const profile = mesh.userData.terrainProfile;
  if (!position || !profile) return;

  let color = mesh.geometry.getAttribute("color");
  if (!color) {
    color = new THREE.BufferAttribute(
      new Float32Array(position.count * 3),
      3,
    );
    mesh.geometry.setAttribute("color", color);
  }

  const base = palette.mountain
    .clone()
    .lerp(palette.mountainFar, profile.depthMix);
  const shadow = base.clone().lerp(palette.mountainFar, 0.58);
  const litRock = base.clone().lerp(palette.sun, 0.34);
  const snow = palette.cloud.clone().lerp(palette.sun, 0.16);
  const vertexColor = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    const light = THREE.MathUtils.clamp(
      profile.light[index] + profile.variation[index] * 0.1,
      0,
      1,
    );
    vertexColor.copy(shadow).lerp(litRock, light);
    vertexColor.offsetHSL(
      profile.variation[index] * 0.018,
      profile.variation[index] * 0.035,
      profile.variation[index] * 0.055,
    );
    vertexColor.lerp(snow, profile.snow[index]);
    color.setXYZ(index, vertexColor.r, vertexColor.g, vertexColor.b);
  }

  color.needsUpdate = true;
}

function createMountainField(
  side,
  zOffset,
  depthMix,
  material,
  random,
  detail,
) {
  const zSegments = detail.zSegments;
  const xSegments = detail.xSegments;
  const positions = [];
  const indices = [];
  const variations = [];
  const uvs = [];
  const phaseA = random() * TAU;
  const phaseB = random() * TAU;
  const phaseC = random() * TAU;

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const zRatio = zIndex / zSegments;
    const z = 62 - zRatio * 225 + zOffset;
    const ridgeHeight =
      21 +
      Math.sin(zRatio * TAU * 1.7 + phaseA) * 7.5 +
      Math.sin(zRatio * TAU * 4.9 + phaseB) * 4.2 +
      Math.sin(zRatio * TAU * 11.3 + phaseC) * 1.8;
    const valleyWander =
      Math.sin(zRatio * TAU * 1.35 + phaseB) * 5.5 +
      Math.sin(zRatio * TAU * 3.8 + phaseA) * 2.1;

    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const xRatio = xIndex / xSegments;
      const distance = 8.5 + xRatio * 78;
      const ridgeProfile = Math.pow(Math.sin(xRatio * Math.PI), 0.58);
      const shoulder =
        Math.pow(Math.sin(Math.min(1, xRatio * 1.42) * Math.PI), 1.8) * 0.24;
      const rockNoise =
        Math.sin(xRatio * 19.7 + zRatio * 33.1 + phaseA) * 0.54 +
        Math.sin(xRatio * 43.2 - zRatio * 21.7 + phaseB) * 0.28 +
        Math.sin(xRatio * 91.4 + zRatio * 67.3 + phaseC) * 0.12;
      const erosion =
        Math.abs(Math.sin(xRatio * 12.3 + zRatio * 15.7 + phaseC)) * 0.16;
      const localHeight =
        ridgeHeight *
        (0.82 + shoulder + rockNoise * 0.22 - erosion) *
        ridgeProfile;
      const crags =
        rockNoise * (1.2 + ridgeProfile * 3.1) +
        Math.sin(zRatio * 83 + xRatio * 37 + phaseB) * ridgeProfile * 0.72;
      const x =
        side * distance +
        valleyWander * (1 - xRatio * 0.38) +
        rockNoise * 0.62;
      const y = -8.2 + localHeight + crags;
      positions.push(x, y, z);
      variations.push(rockNoise);
      uvs.push(x / TERRAIN_TILE, z / TERRAIN_TILE);
    }
  }

  const rowLength = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * rowLength + xIndex;
      const b = a + 1;
      const c = a + rowLength;
      const d = c + 1;
      if (side > 0) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = side < 0 ? "mountains-left" : "mountains-right";
  const normals = geometry.getAttribute("normal");
  const snow = new Float32Array(variations.length);
  const light = new Float32Array(variations.length);
  const variation = new Float32Array(variations.length);
  for (let index = 0; index < variations.length; index += 1) {
    const y = positions[index * 3 + 1];
    const nx = normals.getX(index);
    const ny = normals.getY(index);
    const nz = normals.getZ(index);
    const elevation = THREE.MathUtils.smoothstep(y, 9.0, 22.0);
    const shelf = THREE.MathUtils.smoothstep(ny, 0.3, 0.78);
    snow[index] =
      elevation *
      shelf *
      THREE.MathUtils.clamp(0.85 + variations[index] * 0.2, 0.5, 1.0);
    light[index] = THREE.MathUtils.clamp(
      0.24 + ny * 0.58 - nx * 0.18 + nz * 0.12,
      0,
      1,
    );
    variation[index] = variations[index];
  }
  mesh.userData.terrainProfile = {
    depthMix,
    snow,
    light,
    variation,
  };
  return mesh;
}

function createValleyFloor(material, random, detail) {
  const xSegments = detail.xSegments;
  const zSegments = detail.zSegments;
  const positions = [];
  const indices = [];
  const variations = [];
  const uvs = [];
  const phaseA = random() * TAU;
  const phaseB = random() * TAU;

  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const zRatio = zIndex / zSegments;
    const z = 64 - zRatio * 240;
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const xRatio = xIndex / xSegments;
      const x = -52 + xRatio * 104;
      const bank = Math.pow(Math.max(0, Math.abs(x) - 13) / 39, 1.7) * 8;
      const variation =
        Math.sin(x * 0.17 + z * 0.08 + phaseA) * 0.55 +
        Math.sin(x * 0.46 - z * 0.19 + phaseB) * 0.22;
      const channel =
        Math.sin(z * 0.037 + phaseB) * 2.8 +
        Math.sin(z * 0.091 + phaseA) * 1.1;
      const channelBed = Math.exp(-Math.pow((x - channel) / 8, 2)) * -0.7;
      positions.push(x, -8.2 + bank + variation * 0.48 + channelBed, z);
      variations.push(variation);
      uvs.push(x / TERRAIN_TILE, z / TERRAIN_TILE);
    }
  }

  const rowLength = xSegments + 1;
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * rowLength + xIndex;
      const b = a + 1;
      const c = a + rowLength;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const normals = geometry.getAttribute("normal");
  const light = new Float32Array(variations.length);
  const variation = new Float32Array(variations.length);
  for (let index = 0; index < variations.length; index += 1) {
    light[index] = THREE.MathUtils.clamp(
      0.16 + normals.getY(index) * 0.5 - normals.getX(index) * 0.12,
      0,
      0.72,
    );
    variation[index] = variations[index];
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "valley-floor";
  mesh.userData.terrainProfile = {
    depthMix: 0.58,
    snow: new Float32Array(variations.length),
    light,
    variation,
  };
  return mesh;
}

function createCloudLayer(count, spread, texture, material, random) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * spread.x;
    positions[index * 3 + 1] = spread.yMin + random() * spread.yRange;
    positions[index * 3 + 2] = spread.zStart - random() * spread.zRange;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();

  const points = new THREE.Points(geometry, material);
  points.userData.baseX = (random() - 0.5) * 8;
  points.userData.speed = 0.35 + random() * 0.4;
  points.userData.texture = texture;
  return points;
}

function createWingGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0, 0, 0,
        1.45, 0.18, 0.78,
        3.35, 0.08, 0.9,
        5.15, -0.05, -0.15,
        3.25, 0.02, -0.72,
        1.2, 0.14, -0.55,
      ],
      3,
    ),
  );
  geometry.setIndex([0, 1, 5, 1, 2, 5, 2, 4, 5, 2, 3, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

function createTailGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.48, 0, -1.2,
        0, 0.08, -3.35,
        0.18, 0, -1.05,
        0.48, 0, -1.2,
        -0.18, 0, -1.05,
      ],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 3, 1, 4]);
  geometry.computeVertexNormals();
  return geometry;
}

function createFallbackBird(materials) {
  const root = new THREE.Group();
  root.name = "procedural-phoenix";

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 10),
    materials.body,
  );
  body.scale.set(0.78, 0.8, 2.45);
  body.rotation.x = -0.08;
  root.add(body);

  const chest = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 14, 8),
    materials.accent,
  );
  chest.position.set(0, -0.12, 0.82);
  chest.scale.set(0.72, 0.5, 1.05);
  root.add(chest);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 14, 9),
    materials.body,
  );
  head.position.set(0, 0.24, 1.65);
  root.add(head);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.23, 0.75, 5),
    materials.accent,
  );
  beak.position.set(0, 0.14, 2.24);
  beak.rotation.x = Math.PI / 2;
  root.add(beak);

  const wingGeometry = createWingGeometry();
  const leftWing = new THREE.Group();
  const rightWing = new THREE.Group();
  leftWing.position.set(0.3, 0.1, 0.2);
  rightWing.position.set(-0.3, 0.1, 0.2);

  const leftWingMesh = new THREE.Mesh(wingGeometry, materials.wing);
  const rightWingMesh = new THREE.Mesh(wingGeometry, materials.wing);
  rightWingMesh.scale.x = -1;
  leftWing.add(leftWingMesh);
  rightWing.add(rightWingMesh);
  root.add(leftWing, rightWing);

  const tail = new THREE.Mesh(createTailGeometry(), materials.wing);
  tail.position.y = 0.04;
  root.add(tail);

  const crestGeometry = new THREE.ConeGeometry(0.12, 0.72, 5);
  for (let index = 0; index < 3; index += 1) {
    const crest = new THREE.Mesh(crestGeometry, materials.accent);
    crest.position.set((index - 1) * 0.13, 0.58, 1.55 - index * 0.13);
    crest.rotation.z = (index - 1) * 0.2;
    root.add(crest);
  }

  root.userData.wings = { left: leftWing, right: rightWing };
  root.userData.isFallbackBird = true;
  return root;
}

function cloneModelMaterials(model, materialSet) {
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;

    if (Array.isArray(object.material)) {
      object.material = object.material.map((material) => material.clone());
      for (const material of object.material) materialSet.add(material);
    } else {
      object.material = object.material.clone();
      materialSet.add(object.material);
    }

    object.frustumCulled = true;
  });
}

function fitModel(model, targetSize) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z);
  if (largestDimension > 0 && Number.isFinite(largestDimension)) {
    model.scale.multiplyScalar(targetSize / largestDimension);
  }

  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
}

/**
 * Creates a scroll-driven Three.js phoenix scene.
 *
 * @param {object} [options]
 * @param {HTMLElement|string} [options.container] Container or selector.
 * @param {HTMLCanvasElement|string} [options.canvas] Existing canvas or selector.
 * @param {HTMLElement|string} [options.scrollTarget] Element whose passage through
 *   the viewport maps to flight progress. Defaults to document scroll progress.
 * @param {Function} [options.onReady] Called after the GLTF or fallback is ready.
 * @returns {{dispose: Function, ready: Promise, cyclePalette: Function, renderer:
 *   THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera}}
 */
export function initPhoenixScene(options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("initPhoenixScene requires a browser environment.");
  }

  const suppliedCanvas = resolveElement(options.canvas);
  const suppliedContainer = resolveElement(options.container);
  const discoveredContainer = document.querySelector("[data-phoenix-scene]");
  const canvas =
    suppliedCanvas instanceof HTMLCanvasElement
      ? suppliedCanvas
      : document.createElement("canvas");
  const createdCanvas = canvas !== suppliedCanvas;
  const container =
    suppliedContainer ||
    canvas.parentElement ||
    discoveredContainer ||
    document.body;

  if (!(container instanceof HTMLElement)) {
    throw new TypeError("Phoenix scene container must be an HTMLElement.");
  }

  if (createdCanvas) {
    canvas.dataset.phoenixCanvas = "";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "pan-y";
    container.appendChild(canvas);
  }

  const maxDpr = Math.max(1, Number(options.maxDpr) || 1.75);
  const compactScene =
    window.matchMedia("(max-width: 699px)").matches ||
    (Number(navigator.deviceMemory) > 0 &&
      Number(navigator.deviceMemory) <= 4);
  const sceneId = `phoenix-scene-${nextSceneId++}`;
  const rawPalettes =
    Array.isArray(options.palettes) && options.palettes.length
      ? options.palettes
      : DEFAULT_PALETTES;
  const palettes = rawPalettes.map((palette, index) =>
    normalizePalette(palette, DEFAULT_PALETTES[index % DEFAULT_PALETTES.length]),
  );
  let paletteIndex = modulo(
    Number.isFinite(options.paletteIndex)
      ? options.paletteIndex
      : sharedPaletteIndex,
    palettes.length,
  );
  sharedPaletteIndex = paletteIndex;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const followsMotionPreference = options.reducedMotion == null;
  let reducedMotion = followsMotionPreference
    ? motionQuery.matches
    : Boolean(options.reducedMotion);
  let disposed = false;
  let animationFrame = 0;
  let lastFrameTime = performance.now();
  let targetProgress = 0;
  let currentProgress = 0;
  let currentPalette = palettes[paletteIndex];
  let modelMixer = null;
  let modelWingRig = null;
  let birdFlapUniforms = [];
  let birdBurnUniforms = [];
  const finaleFlash = document.querySelector(".finale-flash");
  let activeBirdVisual = null;
  let fallbackBird = null;
  let resizeObserver = null;
  const modelMaterials = new Set();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: options.antialias ?? true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = Number(options.exposure) || 1.26;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(currentPalette.fog, compactScene ? 0.014 : 0.0118);

  const baseFov = Number(options.fov) || 48;
  const camera = new THREE.PerspectiveCamera(
    baseFov,
    1,
    0.1,
    420,
  );

  const world = new THREE.Group();
  world.name = "phoenix-world";
  scene.add(world);

  const hemisphereLight = new THREE.HemisphereLight(
    currentPalette.ambient,
    currentPalette.mountainFar,
    2.1,
  );
  scene.add(hemisphereLight);

  const sunLight = new THREE.DirectionalLight(currentPalette.sun, 4.65);
  sunLight.position.set(-42, 52, 36);
  sunLight.target.position.set(0, 5, -66);
  scene.add(sunLight, sunLight.target);

  const fillLight = new THREE.DirectionalLight(currentPalette.ambient, 1.9);
  fillLight.position.set(32, 18, -18);
  fillLight.target.position.set(0, 8, -58);
  scene.add(fillLight, fillLight.target);

  const rimLight = new THREE.PointLight(currentPalette.accent, 34, 48, 1.6);
  scene.add(rimLight);

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
  function loadRockTexture(url, srgb) {
    const tex = textureLoader.load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(8, maxAnisotropy);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  }
  const rockAlbedo = loadRockTexture("./assets/textures/rock_albedo.webp", true);
  const rockNormal = loadRockTexture("./assets/textures/rock_normal.webp", false);

  const mountainMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
    metalness: 0.02,
    vertexColors: true,
    map: rockAlbedo,
    normalMap: rockNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    flatShading: false,
    side: THREE.DoubleSide,
    dithering: true,
  });
  const mountainFarMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    vertexColors: true,
    map: rockAlbedo,
    normalMap: rockNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    flatShading: false,
    side: THREE.DoubleSide,
    dithering: true,
  });
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    vertexColors: true,
    map: rockAlbedo,
    normalMap: rockNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    dithering: true,
  });

  const random = createRandom(Number(options.seed) || 73191);
  const mountainGroup = new THREE.Group();
  mountainGroup.name = "procedural-mountains";
  const nearTerrainDetail = compactScene
    ? { xSegments: 18, zSegments: 68 }
    : { xSegments: 30, zSegments: 108 };
  const farTerrainDetail = compactScene
    ? { xSegments: 13, zSegments: 46 }
    : { xSegments: 20, zSegments: 72 };
  const floorDetail = compactScene
    ? { xSegments: 14, zSegments: 42 }
    : { xSegments: 22, zSegments: 72 };
  // A wide, tall distant range that closes the far end of the valley so the
  // flight never opens onto a hard gap / the flat photo backdrop. It sits far
  // back and high and fades into the fog, reading as hazy distant peaks.
  const createBackdropRange = (zCenter, peak, material) => {
    const positions = [];
    const indices = [];
    const variations = [];
    const uvs = [];
    const pA = random() * TAU;
    const pB = random() * TAU;
    const pC = random() * TAU;
    const half = 172;
    const rows = compactScene ? 3 : 4;
    const cols = compactScene ? 40 : 62;
    for (let r = 0; r <= rows; r += 1) {
      const rt = r / rows;
      const z = zCenter - rt * 44;
      for (let c = 0; c <= cols; c += 1) {
        const ct = c / cols;
        const x = -half + ct * half * 2;
        const ridge =
          Math.sin(ct * TAU * 3.1 + pA) * 0.5 +
          Math.sin(ct * TAU * 7.3 + pB) * 0.28 +
          Math.sin(ct * TAU * 16.0 + pC) * 0.13;
        const y = -8 + peak * (0.5 + 0.5 * (ridge * 0.5 + 0.5)) - rt * 5;
        positions.push(x, y, z);
        variations.push(ridge);
        uvs.push(x / TERRAIN_TILE, z / TERRAIN_TILE);
      }
    }
    const rowLen = cols + 1;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const a = r * rowLen + c;
        const b = a + 1;
        const cc = a + rowLen;
        const d = cc + 1;
        indices.push(a, cc, b, b, cc, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = "backdrop-range";
    const n = variations.length;
    const snow = new Float32Array(n);
    const light = new Float32Array(n);
    const variation = new Float32Array(n);
    const normals = g.getAttribute("normal");
    for (let i = 0; i < n; i += 1) {
      const y = positions[i * 3 + 1];
      snow[i] = THREE.MathUtils.smoothstep(y, peak * 0.35, peak * 0.9) * 0.7;
      light[i] = THREE.MathUtils.clamp(0.32 + normals.getY(i) * 0.45, 0, 1);
      variation[i] = variations[i];
    }
    mesh.userData.terrainProfile = { depthMix: 0.88, snow, light, variation };
    return mesh;
  };
  const terrainMeshes = [
    createMountainField(
      -1,
      0,
      0.05,
      mountainMaterial,
      random,
      nearTerrainDetail,
    ),
    createMountainField(
      1,
      -7,
      0.08,
      mountainMaterial,
      random,
      nearTerrainDetail,
    ),
    createMountainField(
      -1,
      -72,
      0.5,
      mountainFarMaterial,
      random,
      farTerrainDetail,
    ),
    createMountainField(
      1,
      -83,
      0.58,
      mountainFarMaterial,
      random,
      farTerrainDetail,
    ),
    createValleyFloor(groundMaterial, random, floorDetail),
    createBackdropRange(-168, 50, mountainFarMaterial),
    createBackdropRange(-198, 58, mountainFarMaterial),
    createBackdropRange(-230, 44, mountainFarMaterial),
  ];
  mountainGroup.add(...terrainMeshes);
  world.add(mountainGroup);

  // Winding river along the valley floor — flows and recolours with the palette.
  const waterUniforms = {
    uTime: { value: 0 },
    uWaterColor: { value: new THREE.Color() },
    uSkyColor: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
  };
  function updateWaterColors(palette) {
    // Deep water body — cool and dark so it reads as water, lightly scene-tinted.
    waterUniforms.uWaterColor.value
      .copy(palette.mountainFar)
      .lerp(palette.fog, 0.4)
      .multiplyScalar(0.85);
    // Reflected sky/horizon — bright, so the river reads as a sky-lit ribbon.
    waterUniforms.uSkyColor.value
      .copy(palette.cloud)
      .lerp(palette.sun, 0.35)
      .multiplyScalar(1.18);
    // Sun glint colour.
    waterUniforms.uSunColor.value.copy(palette.sun);
  }
  updateWaterColors(currentPalette);
  const riverGeometry = (() => {
    const zStart = 66;
    const zEnd = -188;
    const segs = 150;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= segs; i += 1) {
      const t = i / segs;
      const z = zStart + (zEnd - zStart) * t;
      const cx =
        Math.sin(z * 0.035 + 0.4) * 5 + Math.sin(z * 0.085 + 1.3) * 2.5;
      const hw = 3.2 + Math.sin(z * 0.06 + 0.5) * 0.8;
      pos.push(cx - hw, -7.9, z);
      uv.push(0, t * 20);
      pos.push(cx + hw, -7.9, z);
      uv.push(1, t * 20);
    }
    for (let i = 0; i < segs; i += 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin(uTime * 1.1 + position.z * 0.5) * 0.05
             + sin(uTime * 1.8 + position.x * 0.8) * 0.035;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      uniform float uTime;
      uniform vec3 uWaterColor;
      uniform vec3 uSkyColor;
      uniform vec3 uSunColor;
      // moving ripple height field; its slope gives the surface normal
      float ripple(vec2 p, float t) {
        float h = sin(p.x * 1.8 + p.y * 3.4 - t * 1.5) * 0.5;
        h += sin(p.x * 4.6 - p.y * 2.7 + t * 1.05) * 0.28;
        h += sin(p.x * 9.2 + p.y * 6.3 - t * 2.0) * 0.15;
        return h;
      }
      void main() {
        vec2 p = vec2(vUv.x * 3.0, vUv.y * 11.0);
        float t = uTime;
        float e = 0.05;
        float h  = ripple(p, t);
        float hx = ripple(p + vec2(e, 0.0), t) - h;
        float hy = ripple(p + vec2(0.0, e), t) - h;
        // perturbed surface normal (base points up in world Y)
        vec3 N = normalize(vec3(-hx * 0.9, 1.0, -hy * 0.9));
        vec3 V = normalize(cameraPosition - vWorldPos);
        // Fresnel — dark water looking in, sky reflection at grazing angles
        float fres = clamp(0.4 + pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.6, 0.0, 1.0);
        vec3 col = mix(uWaterColor, uSkyColor, fres);
        // sun specular glints riding the ripple crests
        vec3 L = normalize(vec3(-0.55, 0.68, 0.47));
        vec3 H = normalize(L + V);
        float ndh = max(dot(N, H), 0.0);
        col += uSunColor * pow(ndh, 140.0) * 1.6;
        col += uSunColor * pow(ndh, 14.0) * 0.22;
        float edge = smoothstep(0.0, 0.13, vUv.x) * smoothstep(1.0, 0.87, vUv.x);
        // Fade the river IN at its near source and OUT into the far haze so the
        // ends melt into mist instead of cutting off as hard broken edges.
        float ends = smoothstep(0.0, 1.8, vUv.y) * (1.0 - smoothstep(17.2, 20.0, vUv.y));
        float alpha = edge * ends * (0.62 + fres * 0.32);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const riverMesh = new THREE.Mesh(riverGeometry, waterMaterial);
  riverMesh.name = "valley-river";
  riverMesh.frustumCulled = false;
  riverMesh.renderOrder = 1;
  world.add(riverMesh);

  const cloudTexture = createCloudTexture();
  const cloudMaterials = [
    // Low valley mist — large soft warm fog hugging the valley floor (the photo's
    // signature flowing mist); also softens seams and the river's far end.
    new THREE.PointsMaterial({
      color: currentPalette.cloud,
      map: cloudTexture,
      size: 32,
      opacity: 0.16,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }),
    new THREE.PointsMaterial({
      color: currentPalette.cloud,
      map: cloudTexture,
      size: 15,
      opacity: 0.13,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }),
    new THREE.PointsMaterial({
      color: currentPalette.cloud,
      map: cloudTexture,
      size: 24,
      opacity: 0.06,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.NormalBlending,
    }),
  ];
  const clouds = new THREE.Group();
  clouds.name = "volumetric-cloud-layers";
  clouds.add(
    createCloudLayer(
      compactScene ? 130 : 230,
      { x: 94, yMin: -5, yRange: 14, zStart: 64, zRange: 252 },
      cloudTexture,
      cloudMaterials[0],
      random,
    ),
    createCloudLayer(
      compactScene ? 145 : 250,
      { x: 122, yMin: 7, yRange: 20, zStart: 48, zRange: 240 },
      cloudTexture,
      cloudMaterials[1],
      random,
    ),
    createCloudLayer(
      compactScene ? 62 : 120,
      { x: 195, yMin: 24, yRange: 28, zStart: 18, zRange: 275 },
      cloudTexture,
      cloudMaterials[2],
      random,
    ),
  );
  world.add(clouds);

  const birdMaterials = {
    body: new THREE.MeshStandardMaterial({
      color: currentPalette.bird,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: true,
    }),
    wing: new THREE.MeshStandardMaterial({
      color: currentPalette.wing,
      roughness: 0.7,
      metalness: 0.02,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: currentPalette.accent,
      roughness: 0.52,
      emissive: currentPalette.sun,
      emissiveIntensity: 0.13,
      side: THREE.DoubleSide,
    }),
  };

  const birdRoot = new THREE.Group();
  birdRoot.name = "phoenix-flight-root";
  birdRoot.scale.setScalar(Number(options.birdScale) || 1);
  world.add(birdRoot);

  fallbackBird = createFallbackBird(birdMaterials);
  activeBirdVisual = fallbackBird;
  birdRoot.add(fallbackBird);

  const birdCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-5, 11, 42),
      new THREE.Vector3(2, 14, 20),
      new THREE.Vector3(7, 18, -4),
      new THREE.Vector3(-1, 15, -29),
      new THREE.Vector3(-7, 20, -57),
      new THREE.Vector3(4, 18, -86),
      new THREE.Vector3(-3, 23, -117),
      new THREE.Vector3(1, 21, -150),
    ],
    false,
    "catmullrom",
    0.32,
  );
  const pointerTarget = new THREE.Vector2();
  const pointerCurrent = new THREE.Vector2();
  const birdPosition = new THREE.Vector3();
  const birdAhead = new THREE.Vector3();
  const birdTangent = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const cameraLookAt = new THREE.Vector3();
  const desiredLookAt = new THREE.Vector3();
  const parallaxOffset = new THREE.Vector3();
  const lookAtLift = new THREE.Vector3(0, 0.25, 0);
  const rimLightOffset = new THREE.Vector3(0, 3, 2);
  const cameraSide = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const wingRotation = new THREE.Quaternion();
  const wingAxis = new THREE.Vector3(0, 0, 1);
  const birdPrevQuat = new THREE.Quaternion();
  const birdTargetQuat = new THREE.Quaternion();
  const birdBase = new THREE.Vector3();
  const birdTangentAhead = new THREE.Vector3();
  let birdOrientInit = false;
  const smoothCamPos = new THREE.Vector3();
  let camPosInit = false;
  let renderedFov = baseFov;

  function getScrollProgress() {
    if (typeof options.getScrollProgress === "function") {
      return clamp01(Number(options.getScrollProgress()) || 0);
    }

    const scrollTarget = resolveElement(options.scrollTarget);
    if (scrollTarget instanceof HTMLElement) {
      const rect = scrollTarget.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      if (rect.height > viewportHeight) {
        return clamp01(-rect.top / (rect.height - viewportHeight));
      }
      return clamp01(
        (viewportHeight - rect.top) / (viewportHeight + rect.height),
      );
    }

    const scrollingElement = document.scrollingElement || document.documentElement;
    const maximumScroll =
      scrollingElement.scrollHeight - scrollingElement.clientHeight;
    return maximumScroll > 0
      ? clamp01(scrollingElement.scrollTop / maximumScroll)
      : 0;
  }

  function updateScene(progress, elapsedSeconds, deltaSeconds) {
    const safeProgress = Number.isFinite(progress) ? clamp01(progress) : 0;
    // Gentle ease-in/out, but blended toward linear so the mid-scroll velocity
    // doesn't spike — smootherstep alone makes the middle of the flight rush.
    const pathProgress = clamp01(
      THREE.MathUtils.lerp(
        safeProgress,
        THREE.MathUtils.smootherstep(safeProgress, 0, 1),
        0.42,
      ),
    );
    birdCurve.getPointAt(pathProgress, birdPosition);
    birdCurve.getTangentAt(pathProgress, birdTangent);
    birdCurve.getTangentAt(clamp01(pathProgress + 0.02), birdTangentAhead);
    // Apply the vertical bob before deriving the look-ahead point so the bird
    // bobs without nodding (the look direction stays level).
    if (!reducedMotion) {
      birdPosition.y += Math.sin(elapsedSeconds * 1.5) * 0.28;
    }
    // Camera anchor captured before the finale ascent, so the camera holds
    // steady while the phoenix rockets up and out of frame.
    birdBase.copy(birdPosition);

    // Finale: the phoenix ignites, climbs straight up and dissolves away.
    // Ignite + dissolve over 0.80-1.0; the upward launch holds off until 0.90
    // so the phoenix burns in place first, then rockets straight up.
    const burn = THREE.MathUtils.smoothstep(safeProgress, 0.8, 1.0);
    const launch = THREE.MathUtils.smoothstep(safeProgress, 0.88, 1.0);
    for (let i = 0; i < birdBurnUniforms.length; i += 1) {
      birdBurnUniforms[i].value = burn;
    }
    birdPosition.y += launch * 66;
    // Cross-fade the WebGL scene out to reveal the still mountain backdrop, with
    // a bright phoenix flash masking the hand-off so the 3D mountains and the
    // photo backdrop never visibly overlap.
    const reveal = THREE.MathUtils.smoothstep(safeProgress, 0.87, 0.96);
    canvas.style.opacity = reveal > 0.001 ? String(1 - reveal) : "";
    if (finaleFlash) {
      const flash = Math.sin(
        THREE.MathUtils.smoothstep(safeProgress, 0.86, 1.0) * Math.PI,
      );
      finaleFlash.style.opacity = flash > 0.002 ? flash.toFixed(3) : "";
    }

    birdAhead.copy(birdPosition).addScaledVector(birdTangent, 5);
    birdAhead.y += launch * 55; // nose up as it climbs out

    birdRoot.position.copy(birdPosition);
    // Build the target orientation on birdRoot, then damp toward it (slerp) so
    // rotation changes glide instead of snapping each frame.
    birdRoot.lookAt(birdAhead);
    // Bank like a real bird — roll into the direction the heading is turning.
    let headingTurn =
      Math.atan2(birdTangentAhead.x, -birdTangentAhead.z) -
      Math.atan2(birdTangent.x, -birdTangent.z);
    if (headingTurn > Math.PI) headingTurn -= TAU;
    if (headingTurn < -Math.PI) headingTurn += TAU;
    const bank = THREE.MathUtils.clamp(
      -headingTurn * 3.6 - birdTangent.x * 0.1,
      -0.4,
      0.4,
    );
    birdRoot.rotateZ(bank);
    if (!reducedMotion) {
      // Gentle soaring adjustments — a living glide without a wing rig.
      birdRoot.rotateZ(Math.sin(elapsedSeconds * 0.8) * 0.04);
      birdRoot.rotateX(Math.sin(elapsedSeconds * 1.05 + 0.6) * 0.025);
    }
    if (birdOrientInit && !reducedMotion && deltaSeconds > 0) {
      birdTargetQuat.copy(birdRoot.quaternion);
      birdRoot.quaternion
        .copy(birdPrevQuat)
        .slerp(birdTargetQuat, 1 - Math.exp(-deltaSeconds * 5.2));
    }
    birdPrevQuat.copy(birdRoot.quaternion);
    birdOrientInit = true;

    const wings = fallbackBird?.userData.wings;
    if (wings && fallbackBird.visible) {
      const flap = reducedMotion
        ? -0.08
        : Math.sin(elapsedSeconds * 6.2) * 0.36 - 0.08;
      wings.left.rotation.z = flap;
      wings.right.rotation.z = -flap;
    }

    if (modelMixer && !reducedMotion && deltaSeconds > 0) {
      modelMixer.update(deltaSeconds * (Number(options.animationSpeed) || 1));
    }
    if (modelWingRig && !modelMixer) {
      const flap = reducedMotion ? 0 : Math.sin(elapsedSeconds * 4.8) * 0.16;
      const featherFlex = reducedMotion ? 0 : Math.sin(elapsedSeconds * 4.8 - 0.55) * 0.08;
      for (const wing of modelWingRig) {
        wing.upper.quaternion
          .copy(wing.upperRest)
          .multiply(wingRotation.setFromAxisAngle(wingAxis, flap));
        wing.fore.quaternion
          .copy(wing.foreRest)
          .multiply(wingRotation.setFromAxisAngle(wingAxis, featherFlex));
        wing.hand.quaternion
          .copy(wing.handRest)
          .multiply(wingRotation.setFromAxisAngle(wingAxis, featherFlex * 1.25));
      }
    }
    if (birdFlapUniforms.length) {
      const flapTime = reducedMotion ? 0.4 : elapsedSeconds;
      for (let i = 0; i < birdFlapUniforms.length; i += 1) {
        birdFlapUniforms[i].value = flapTime;
      }
    }
    waterUniforms.uTime.value = elapsedSeconds;

    // Cinematic aerial chase — orbit to one shoulder and above the eagle so its
    // head and profile stay in frame, never a flat straight-down-the-back shot.
    cameraSide.crossVectors(worldUp, birdTangent).normalize();
    const camDist = compactScene ? 11 : 13;
    const camLift = compactScene ? 4.5 : 6;
    // orbit ~1.3-1.6 rad: nearly abeam so the eagle's full side profile — head,
    // beak and wing silhouette — stays readable, not a small top-down blob.
    const orbit =
      1.42 +
      Math.sin(pathProgress * Math.PI * 1.5) * 0.12 +
      (reducedMotion ? 0 : Math.sin(elapsedSeconds * 0.11) * 0.1);
    cameraPosition
      .copy(birdBase)
      .addScaledVector(birdTangent, -Math.cos(orbit) * camDist)
      .addScaledVector(cameraSide, Math.sin(orbit) * camDist)
      .addScaledVector(worldUp, camLift);
    cameraPosition.y += Math.sin(pathProgress * Math.PI) * 1.4;
    if (!reducedMotion) {
      cameraPosition.x += Math.sin(elapsedSeconds * 0.31) * 0.18;
      cameraPosition.y += Math.sin(elapsedSeconds * 0.27 + 1.2) * 0.14;
    }
    parallaxOffset.set(
      pointerCurrent.x * 2.0,
      pointerCurrent.y * 1.3,
      pointerCurrent.x * 0.5,
    );
    // Glide the camera toward its target instead of snapping to the bird's fast
    // turns — this is what stops the terrain from lurching while scrolling.
    if (!camPosInit || reducedMotion) {
      smoothCamPos.copy(cameraPosition);
      camPosInit = true;
    } else {
      smoothCamPos.lerp(
        cameraPosition,
        1 - Math.exp(-Math.max(deltaSeconds, 0.001) * 2.3),
      );
    }
    camera.position.copy(smoothCamPos).add(parallaxOffset);

    // Aim at the eagle's head — a touch ahead of centre and slightly up. At the
    // landing view (low scroll) drop the aim point so the eagle rides high in the
    // frame, clear of the hero text/stat tiles, easing to the centred chase once
    // the flight begins.
    const landingFrame = 1 - clamp01(pathProgress / 0.14);
    desiredLookAt
      .copy(birdBase)
      .addScaledVector(birdTangent, 2.6)
      .add(lookAtLift);
    desiredLookAt.y += 0.8 - landingFrame * 6.0;
    if (reducedMotion) {
      cameraLookAt.copy(desiredLookAt);
    } else {
      cameraLookAt.lerp(
        desiredLookAt,
        1 - Math.exp(-Math.max(deltaSeconds, 0.001) * 4.5),
      );
    }
    camera.lookAt(cameraLookAt);
    if (!reducedMotion) {
      camera.rotateZ(
        THREE.MathUtils.clamp(-birdTangent.x * 0.025, -0.018, 0.018) +
          Math.sin(elapsedSeconds * 0.22) * 0.0025,
      );
    }

    const desiredFov =
      baseFov +
      Math.sin(pathProgress * Math.PI) * (compactScene ? 1.3 : 2.8) -
      Math.sin(pathProgress * Math.PI * 3) * 0.65;
    if (Math.abs(desiredFov - renderedFov) > 0.025) {
      renderedFov = desiredFov;
      camera.fov = renderedFov;
      camera.updateProjectionMatrix();
    }

    rimLight.position.copy(birdPosition).add(rimLightOffset);
    sunLight.target.position.set(
      birdPosition.x * 0.18,
      5,
      THREE.MathUtils.lerp(-28, -126, pathProgress),
    );
    if (!reducedMotion) {
      clouds.children.forEach((layer, index) => {
        layer.position.x =
          layer.userData.baseX +
          Math.sin(elapsedSeconds * 0.04 * layer.userData.speed + index) * 5;
        layer.position.z =
          Math.sin(elapsedSeconds * 0.022 * layer.userData.speed + index) * 1.8;
        layer.rotation.y =
          Math.sin(elapsedSeconds * 0.025 + index * 1.7) * 0.018;
      });
    }
  }

  function renderOnce(time = performance.now(), deltaSeconds = 0) {
    if (disposed) return;
    pointerCurrent.lerp(pointerTarget, reducedMotion ? 1 : 0.08);
    updateScene(currentProgress, time * 0.001, deltaSeconds);
    renderer.render(scene, camera);
  }

  function frame(time) {
    animationFrame = 0;
    if (disposed || document.hidden || reducedMotion) return;

    const deltaSeconds = Math.min((time - lastFrameTime) / 1000, 0.05);
    lastFrameTime = time;
    currentProgress +=
      (targetProgress - currentProgress) *
      (1 - Math.exp(-deltaSeconds * 4.0));
    pointerCurrent.lerp(pointerTarget, 1 - Math.exp(-deltaSeconds * 6));
    updateScene(currentProgress, time * 0.001, deltaSeconds);
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(frame);
  }

  function startAnimation() {
    if (disposed || reducedMotion || document.hidden || animationFrame) return;
    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(frame);
  }

  function stopAnimation() {
    if (!animationFrame) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function requestStaticRender() {
    if (!reducedMotion || disposed) return;
    currentProgress = targetProgress;
    renderOnce();
  }

  function updateSize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const width = Math.max(
      1,
      Math.round(rect.width || containerRect.width || window.innerWidth),
    );
    const height = Math.max(
      1,
      Math.round(rect.height || containerRect.height || window.innerHeight),
    );
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestStaticRender();
  }

  function updateScroll() {
    targetProgress = getScrollProgress();
    requestStaticRender();
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointerTarget.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
    pointerTarget.multiplyScalar(Number(options.parallaxStrength) || 0.65);
    requestStaticRender();
  }

  function resetPointer() {
    pointerTarget.set(0, 0);
    requestStaticRender();
  }

  function applyPalette(index) {
    paletteIndex = modulo(index, palettes.length);
    sharedPaletteIndex = paletteIndex;
    currentPalette = palettes[paletteIndex];

    // Keep the distant photographic mountain plate visible behind WebGL terrain.
    scene.background = null;
    scene.fog.color.copy(currentPalette.fog);
    hemisphereLight.color.copy(currentPalette.ambient);
    hemisphereLight.groundColor.copy(currentPalette.mountainFar);
    sunLight.color.copy(currentPalette.sun);
    fillLight.color.copy(currentPalette.ambient);
    rimLight.color.copy(currentPalette.accent);
    terrainMeshes.forEach((mesh) =>
      updateTerrainColors(mesh, currentPalette),
    );
    updateWaterColors(currentPalette);
    cloudMaterials[0].color
      .copy(currentPalette.cloud)
      .lerp(currentPalette.fog, 0.24);
    cloudMaterials[1].color.copy(currentPalette.cloud);
    cloudMaterials[2].color
      .copy(currentPalette.cloud)
      .lerp(currentPalette.fog, 0.48);
    birdMaterials.body.color.copy(currentPalette.bird);
    birdMaterials.wing.color.copy(currentPalette.wing);
    birdMaterials.accent.color.copy(currentPalette.accent);
    birdMaterials.accent.emissive.copy(currentPalette.sun);

    for (const material of modelMaterials) {
      if (!material.userData.phoenixOriginalColor && material.color) {
        material.userData.phoenixOriginalColor = material.color.clone();
      }
      if (material.color) {
        const materialName = material.name.toLowerCase();
        let paletteColor = currentPalette.bird;
        let blendAmount = paletteIndex === 0 ? 0.06 : 0.2;
        if (materialName.includes("gold") || materialName.includes("beak")) {
          paletteColor = currentPalette.wing;
          blendAmount = paletteIndex === 0 ? 0.16 : 0.48;
        } else if (materialName.includes("eye")) {
          paletteColor = currentPalette.accent;
          blendAmount = paletteIndex === 0 ? 0.3 : 0.7;
        } else if (materialName.includes("charcoal")) {
          blendAmount = paletteIndex === 0 ? 0.02 : 0.12;
        }
        material.color
          .copy(material.userData.phoenixOriginalColor)
          .lerp(paletteColor, blendAmount);
      }
      if (material.emissive) {
        const materialName = material.name.toLowerCase();
        if (!material.userData.phoenixOriginalEmissive) {
          material.userData.phoenixOriginalEmissive = material.emissive.clone();
          material.userData.phoenixOriginalEmissiveIntensity =
            Number(material.emissiveIntensity) || 0;
        }
        const isGlowMaterial =
          materialName.includes("molten") || materialName.includes("eye");
        if (isGlowMaterial) {
          material.emissive.copy(currentPalette.sun);
          material.emissiveIntensity = Math.max(
            material.userData.phoenixOriginalEmissiveIntensity,
            paletteIndex === 0 ? 0.22 : 0.5,
          );
        } else {
          material.emissive.copy(material.userData.phoenixOriginalEmissive);
          material.emissiveIntensity =
            material.userData.phoenixOriginalEmissiveIntensity;
        }
      }
      material.needsUpdate = true;
    }

    requestStaticRender();
    return paletteEventDetail(currentPalette);
  }

  function cyclePalette(step = 1) {
    window.dispatchEvent(
      new CustomEvent(PALETTE_CYCLE_EVENT, {
        detail: {
          step: Number(step) || 1,
          sourceId: sceneId,
        },
      }),
    );
    return sharedPaletteIndex;
  }

  function handleVisibility() {
    if (document.hidden) {
      stopAnimation();
    } else if (reducedMotion) {
      requestStaticRender();
    } else {
      startAnimation();
    }
  }

  function handleContextLost(event) {
    event.preventDefault();
    stopAnimation();
    document.documentElement.classList.remove("webgl-ready");
  }

  function handleContextRestored() {
    updateSize();
    renderOnce();
    document.documentElement.classList.add("webgl-ready");
    startAnimation();
  }

  function handleMotionPreference(event) {
    if (!followsMotionPreference) return;
    reducedMotion = event.matches;
    if (reducedMotion) {
      stopAnimation();
      currentProgress = targetProgress;
      pointerCurrent.copy(pointerTarget);
      renderOnce();
    } else {
      startAnimation();
    }
  }

  const scrollSource = options.scrollSource || window;
  scrollSource.addEventListener("scroll", updateScroll, { passive: true });
  window.addEventListener("resize", updateSize, { passive: true });
  window.addEventListener("pointermove", updatePointer, { passive: true });
  window.addEventListener("blur", resetPointer);
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);
  document.addEventListener("visibilitychange", handleVisibility);
  motionQuery.addEventListener?.("change", handleMotionPreference);

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
  }

  applyPalette(paletteIndex);
  const paletteRegistration = {
    paletteCount: palettes.length,
    apply: applyPalette,
    getDetail: () => paletteEventDetail(currentPalette),
  };
  registerPaletteScene(paletteRegistration);
  updateSize();
  updateScroll();
  currentProgress = targetProgress;
  cameraLookAt.copy(birdCurve.getPointAt(currentProgress));
  renderOnce();
  startAnimation();

  const loader = new GLTFLoader();
  loader.setCrossOrigin("anonymous");
  const modelUrl = options.modelUrl || DEFAULT_MODEL_URL;
  const ready = loader
    .loadAsync(modelUrl)
    .then((gltf) => {
      const model = gltf.scene;
      if (disposed) {
        disposeGraph(model);
        return { loaded: false, reason: "disposed" };
      }

      cloneModelMaterials(model, modelMaterials);

      // Procedural wing-flap: a GPU vertex bend on the un-rigged eagle mesh.
      // Wings span local X; the flap lifts them along local Z (dorsoventral),
      // strongest at the tips, with a slight inward fold and a tip phase-lag.
      birdFlapUniforms = [];
      model.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        const halfSpan = Math.max(
          0.001,
          Math.abs(box.min.x),
          Math.abs(box.max.x),
        );
        const halfH = Math.max(0.001, Math.abs(box.min.y), Math.abs(box.max.y));
        const halfD = Math.max(0.001, Math.abs(box.min.z), Math.abs(box.max.z));
        const flapAmp = (Number(options.flapAmplitude) || 0.32) * halfSpan;
        const flapSpeed = Number(options.flapSpeed) || 3.8;
        const mats = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of mats) {
          if (!material || material.userData.flapTimeUniform) continue;
          const uFlapTime = { value: 0 };
          const uBurn = { value: 0 };
          const flapUniforms = {
            uFlapTime,
            uFlapAmp: { value: flapAmp },
            uFlapSpeed: { value: flapSpeed },
            uFlapPhase: { value: 1.15 },
            uHalfSpan: { value: halfSpan },
            uHalfH: { value: halfH },
            uHalfD: { value: halfD },
            uBurn,
          };
          material.userData.flapTimeUniform = uFlapTime;
          material.userData.burnUniform = uBurn;
          birdFlapUniforms.push(uFlapTime);
          birdBurnUniforms.push(uBurn);
          material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, flapUniforms);
            shader.vertexShader =
              "uniform float uFlapTime;uniform float uFlapAmp;uniform float uFlapSpeed;uniform float uFlapPhase;uniform float uHalfSpan;uniform float uHalfH;uniform float uHalfD;\nvarying vec3 vLocalPos;\n" +
              shader.vertexShader.replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\n" +
                  "  vLocalPos = position;\n" +
                  "  float _nx = abs(position.x) / uHalfSpan;\n" +
                  "  float _ny = position.y / uHalfH;\n" +
                  "  float _wf = smoothstep(0.08, 1.0, _nx);\n" +
                  "  float _flap = sin(uFlapTime * uFlapSpeed - abs(position.x) * uFlapPhase);\n" +
                  "  transformed.z += _wf * _flap * uFlapAmp;\n" +
                  "  transformed.x -= sign(position.x) * _wf * (_flap * 0.5 + 0.5) * uFlapAmp * 0.16;\n" +
                  "  transformed.z += _wf * sin(uFlapTime * 5.0 - position.x * 7.0) * uFlapAmp * 0.05;\n" +
                  "  float _tail = smoothstep(-0.42, -0.92, _ny);\n" +
                  "  transformed.z += _tail * sin(uFlapTime * 2.1) * uHalfD * 0.13;\n" +
                  "  float _body = (1.0 - smoothstep(0.30, 0.62, _nx)) * (1.0 - smoothstep(0.30, 0.78, abs(_ny)));\n" +
                  "  transformed.z += sign(position.z) * _body * sin(uFlapTime * 1.1) * uHalfD * 0.07;\n" +
                  "  float _head = smoothstep(0.44, 0.85, _ny) * (1.0 - smoothstep(0.16, 0.42, _nx));\n" +
                  "  float _yaw = sin(uFlapTime * 0.5) * 0.26 * _head;\n" +
                  "  float _nod = sin(uFlapTime * 0.9 + 1.0) * 0.10 * _head;\n" +
                  "  vec3 _pivot = vec3(0.0, uHalfH * 0.44, 0.0);\n" +
                  "  vec3 _hp = transformed - _pivot;\n" +
                  "  float _cz = cos(_yaw), _sz = sin(_yaw);\n" +
                  "  _hp = vec3(_hp.x * _cz - _hp.y * _sz, _hp.x * _sz + _hp.y * _cz, _hp.z);\n" +
                  "  float _cx = cos(_nod), _sx = sin(_nod);\n" +
                  "  _hp = vec3(_hp.x, _hp.y * _cx - _hp.z * _sx, _hp.y * _sx + _hp.z * _cx);\n" +
                  "  transformed = _pivot + _hp;\n",
              );
            shader.fragmentShader =
              "uniform float uBurn;\nuniform float uHalfSpan;\nvarying vec3 vLocalPos;\n" +
              "float _bhash(vec3 p){return fract(sin(dot(p,vec3(17.1,113.5,53.7)))*43758.5453);}\n" +
              "float _bnoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);\n" +
              "return mix(mix(mix(_bhash(i),_bhash(i+vec3(1,0,0)),f.x),mix(_bhash(i+vec3(0,1,0)),_bhash(i+vec3(1,1,0)),f.x),f.y),\n" +
              "mix(mix(_bhash(i+vec3(0,0,1)),_bhash(i+vec3(1,0,1)),f.x),mix(_bhash(i+vec3(0,1,1)),_bhash(i+vec3(1,1,1)),f.x),f.y),f.z);}\n" +
              shader.fragmentShader
                .replace(
                  "#include <clipping_planes_fragment>",
                  "#include <clipping_planes_fragment>\n" +
                    "  float _dn = _bnoise(vLocalPos * 9.0) * 0.7 + _bnoise(vLocalPos * 23.0) * 0.3;\n" +
                    "  float _tip = clamp(abs(vLocalPos.x) / uHalfSpan, 0.0, 1.0) * 0.32;\n" +
                    "  float _edge = _dn - _tip;\n" +
                    "  float _diss = clamp((uBurn - 0.2) / 0.8, 0.0, 1.0);\n" +
                    "  if (uBurn > 0.001 && _edge < _diss) discard;\n" +
                    "  float _bglow = (uBurn > 0.001) ? (1.0 - smoothstep(_diss, _diss + 0.16, _edge)) : 0.0;\n",
                )
                .replace(
                  "#include <emissivemap_fragment>",
                  "#include <emissivemap_fragment>\n" +
                    "  vec3 _fire = mix(vec3(1.0, 0.30, 0.05), vec3(1.0, 0.96, 0.75), _bglow);\n" +
                    "  totalEmissiveRadiance += _fire * (_bglow * 4.5 + uBurn * 0.9);\n",
                );
          };
          material.customProgramCacheKey = () =>
            "phoenix-static-flight-deformation-v1";
          material.needsUpdate = true;
        }
      });

      fitModel(model, Number(options.modelSize) || 6.5);
      const rotation = Array.isArray(options.modelRotation)
        ? options.modelRotation
        : [0, 0, 0];
      model.rotation.set(
        Number(rotation[0]) || 0,
        Number(rotation[1]) || 0,
        Number(rotation[2]) || 0,
      );
      model.name = "phoenix-gltf";

      if (fallbackBird) {
        birdRoot.remove(fallbackBird);
        disposeGraph(fallbackBird);
        fallbackBird = null;
      }
      activeBirdVisual = model;
      birdRoot.add(model);

      const wingNodes = ["L", "R"].map((side) => ({
        upper: model.getObjectByName(`wing.${side}.upper`),
        fore: model.getObjectByName(`wing.${side}.fore`),
        hand: model.getObjectByName(`wing.${side}.hand`),
      }));
      if (wingNodes.every((wing) => wing.upper && wing.fore && wing.hand)) {
        modelWingRig = wingNodes.map((wing) => ({
          ...wing,
          upperRest: wing.upper.quaternion.clone(),
          foreRest: wing.fore.quaternion.clone(),
          handRest: wing.hand.quaternion.clone(),
        }));
      }

      if (gltf.animations?.length && options.useModelAnimation !== false) {
        const preferredClip =
          gltf.animations.find((clip) =>
            /fly|flight|soar|wing/i.test(clip.name),
          ) || gltf.animations[0];
        modelMixer = new THREE.AnimationMixer(model);
        const action = modelMixer.clipAction(preferredClip);
        action
          .reset()
          .setLoop(THREE.LoopRepeat, Infinity)
          .setEffectiveWeight(1)
          .play();
        if (reducedMotion) {
          modelMixer.setTime(Math.max(0, preferredClip.duration * 0.18));
        }
      }

      applyPalette(paletteIndex);
      renderOnce();
      safelyCall(options.onModelLoaded, gltf, "onModelLoaded");
      const result = {
        loaded: true,
        model,
        animations: gltf.animations || [],
      };
      safelyCall(options.onReady, result, "onReady");
      return result;
    })
    .catch((error) => {
      if (!disposed) {
        activeBirdVisual = fallbackBird;
        if (fallbackBird) fallbackBird.visible = true;
        renderOnce();
        safelyCall(options.onModelError, error, "onModelError");
        if (options.debug) {
          console.warn(
            `[PhoenixScene] Could not load ${modelUrl}; using procedural bird.`,
            error,
          );
        }
      }
      const result = { loaded: false, fallback: true, error };
      if (!disposed) safelyCall(options.onReady, result, "onReady");
      return result;
    });

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopAnimation();

    scrollSource.removeEventListener("scroll", updateScroll);
    window.removeEventListener("resize", updateSize);
    window.removeEventListener("pointermove", updatePointer);
    window.removeEventListener("blur", resetPointer);
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    document.removeEventListener("visibilitychange", handleVisibility);
    motionQuery.removeEventListener?.("change", handleMotionPreference);
    resizeObserver?.disconnect();
    unregisterPaletteScene(paletteRegistration);

    modelMixer?.stopAllAction();
    modelMixer = null;
    modelWingRig = null;
    activeBirdVisual = null;
    disposeGraph(scene);
    renderer.renderLists.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();

    if (createdCanvas) canvas.remove();
  }

  return {
    scene,
    camera,
    renderer,
    ready,
    dispose,
    cyclePalette,
    get paletteIndex() {
      return paletteIndex;
    },
    get reducedMotion() {
      return reducedMotion;
    },
    eventName: PALETTE_CYCLE_EVENT,
  };
}
