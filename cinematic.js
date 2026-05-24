import * as THREE from "./node_modules/three/build/three.module.js";
import { GLTFLoader } from "./node_modules/three/examples/jsm/loaders/GLTFLoader.js";

window.__cinematicModuleStatus = "started";
const canvas = document.querySelector("#cinematicCanvas");
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
window.__cinematicModuleStatus = "renderer-created";
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const textureLoader = new THREE.TextureLoader();
const horseTexture = textureLoader.load("assets/horse-knight.png", () => renderer.render(scene, camera));
const gltfLoader = new GLTFLoader();
const pieceLabels = { K: "King", Q: "Queen", R: "Fort", B: "Elephant", N: "Horse", P: "Soldier" };
const activeAnimations = [];
let horseModel = null;
let horseModelReady = false;
let pendingKnightMove = null;
let heroPiece = null;
let heroArc = null;
let sparkleField = null;
let fadeTimer = null;
let frameId = 0;

scene.add(new THREE.HemisphereLight(0xfff0d4, 0x18202b, 2.2));
const keyLight = new THREE.DirectionalLight(0xffc46b, 5);
keyLight.position.set(1.5, 3, 6);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x8cc8ff, 2.5, 12);
rimLight.position.set(-3, 3, 5);
scene.add(rimLight);

resize();
window.addEventListener("resize", resize);
window.addEventListener("chess:move", (event) => playMove(event.detail));
renderer.render(scene, camera);
window.__horseModelStatus = "loading";
gltfLoader.load(
  "assets/models/horse.glb",
  (gltf) => {
    horseModel = gltf.scene;
    horseModelReady = true;
    horseModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
    window.__horseModelStatus = "loaded";
    renderer.render(scene, camera);
    if (pendingKnightMove) {
      const queued = pendingKnightMove;
      pendingKnightMove = null;
      playMove(queued);
    }
  },
  undefined,
  (error) => {
    horseModel = null;
    horseModelReady = false;
    window.__horseModelStatus = `failed: ${error?.message || "unknown"}`;
  },
);
window.__cinematicModuleStatus = "loader-requested";

function playMove(detail) {
  const type = detail.type || "N";
  const color = detail.color || "w";
  const from = boardPosition(detail.from.row, detail.from.col, detail.flipped);
  const to = boardPosition(detail.to.row, detail.to.col, detail.flipped);

  if (type === "N" && !horseModelReady) {
    pendingKnightMove = detail;
    return;
  }

  clearHero();
  canvas.classList.add("active");
  window.clearTimeout(fadeTimer);

  heroPiece = makePiece(type, color, type === "N" ? 0.46 : 0.32);
  heroPiece.position.set(from.x, from.y, 0.4);
  heroPiece.rotation.y = color === "w" ? Math.PI : 0;
  scene.add(heroPiece);

  heroArc = makeArc(from, to, type);
  scene.add(heroArc);
  sparkleField = makeSparkles(from, to);
  scene.add(sparkleField);

  activeAnimations.length = 0;
  activeAnimations.push({
    piece: heroPiece,
    from,
    to,
    type,
    baseScale: heroPiece.scale.x,
    start: performance.now(),
    duration: type === "N" ? 980 : 720,
  });

  fadeTimer = window.setTimeout(() => {
    canvas.classList.remove("active");
  }, type === "N" ? 1550 : 1250);
  startRenderLoop();
}

function clearHero() {
  if (heroPiece) scene.remove(heroPiece);
  if (heroArc) scene.remove(heroArc);
  if (sparkleField) scene.remove(sparkleField);
  heroPiece = null;
  heroArc = null;
  sparkleField = null;
}

function makePiece(type, color, scale = 0.32) {
  if (type === "N") return makeHorse(color, scale);
  if (type === "B") return makeElephant(color, scale);
  if (type === "R") return makeFort(color, scale);
  if (type === "Q") return makeRoyal(color, scale, true);
  if (type === "K") return makeRoyal(color, scale, false);
  return makeSoldier(color, scale);
}

function materialSet(color) {
  const white = color === "w";
  return {
    body: new THREE.MeshStandardMaterial({
      color: white ? 0xf2e4cf : 0x16191c,
      roughness: 0.34,
      metalness: 0.16,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: white ? 0xb87932 : 0x050607,
      roughness: 0.45,
      metalness: 0.18,
    }),
    glow: new THREE.MeshStandardMaterial({
      color: white ? 0xffdc8f : 0x9dd0ff,
      emissive: white ? 0xff9f2f : 0x2478ff,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    }),
  };
}

function makeHorse(color, scale) {
  if (horseModel) {
    const group = new THREE.Group();
    const model = horseModel.clone(true);
    normalizeModel(model, color);
    model.rotation.x = 0;
    model.rotation.y = color === "w" ? Math.PI / 2 : -Math.PI / 2;
    model.rotation.z = 0;
    model.position.set(0, 0.08, 0.35);
    model.scale.setScalar(3.2);
    group.add(model);
    group.scale.setScalar(scale);
    centerPiece(group);
    return group;
  }

  const group = new THREE.Group();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: horseTexture,
      color: color === "w" ? 0xffffff : 0x7f8892,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(5.2, 6.6, 1);
  sprite.position.set(0.2, 1.05, 0.2);
  group.add(sprite);
  group.scale.setScalar(scale);
  centerPiece(group);
  return group;
}

function normalizeModel(model, color) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSide = Math.max(size.x, size.y, size.z) || 1;
  model.position.sub(center);
  model.scale.setScalar(1 / maxSide);
  model.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: color === "w" ? 0xf2eadb : 0x171b20,
        roughness: 0.34,
        metalness: 0.12,
        emissive: color === "w" ? 0x201000 : 0x000814,
        emissiveIntensity: 0.08,
      });
    }
  });
}

function makeCodeHorse(color, scale) {
  const mat = materialSet(color);
  const group = new THREE.Group();
  add(group, new THREE.SphereGeometry(0.46, 32, 20), mat.body, [0, 0.68, 0], [1.25, 0.68, 0.52]);
  add(group, new THREE.CapsuleGeometry(0.22, 0.75, 8, 18), mat.body, [0.46, 1.03, 0], [0.75, 1, 0.75], [0, 0, -0.58]);
  add(group, new THREE.SphereGeometry(0.28, 24, 16), mat.body, [0.8, 1.36, 0], [0.78, 1.05, 0.66]);
  add(group, new THREE.ConeGeometry(0.08, 0.34, 12), mat.accent, [0.72, 1.65, -0.13], [1, 1, 1], [0.35, 0, 0.1]);
  add(group, new THREE.ConeGeometry(0.08, 0.34, 12), mat.accent, [0.72, 1.65, 0.13], [1, 1, 1], [0.35, 0, -0.1]);
  for (const x of [-0.38, 0.1, 0.42]) {
    add(group, new THREE.CapsuleGeometry(0.055, 0.66, 6, 10), mat.accent, [x, 0.14, x === 0.1 ? 0.2 : -0.2], [1, 1, 1], [0.2, 0, x > 0 ? -0.25 : 0.18]);
  }
  add(group, new THREE.ConeGeometry(0.18, 0.7, 16), mat.glow, [-0.62, 0.74, 0], [0.55, 1, 0.55], [0, 0, 1.2]);
  group.scale.setScalar(scale);
  centerPiece(group);
  return group;
}

function makeElephant(color, scale) {
  const mat = materialSet(color);
  const group = new THREE.Group();
  add(group, new THREE.SphereGeometry(0.42, 32, 20), mat.body, [0, 0.82, 0], [1.18, 0.95, 0.95]);
  add(group, new THREE.SphereGeometry(0.25, 24, 16), mat.body, [0.34, 1.2, 0], [0.95, 0.95, 0.9]);
  add(group, new THREE.SphereGeometry(0.18, 20, 12), mat.accent, [0.34, 1.2, -0.24], [0.45, 1, 1.25]);
  add(group, new THREE.SphereGeometry(0.18, 20, 12), mat.accent, [0.34, 1.2, 0.24], [0.45, 1, 1.25]);
  add(group, new THREE.CapsuleGeometry(0.06, 0.42, 6, 10), mat.accent, [0.58, 0.94, 0], [1, 1, 1], [0, 0, 0.48]);
  group.scale.setScalar(scale);
  centerPiece(group);
  return group;
}

function makeSoldier(color, scale) {
  const mat = materialSet(color);
  const group = new THREE.Group();
  add(group, new THREE.CylinderGeometry(0.34, 0.42, 0.5, 24), mat.body, [0, 0.5, 0]);
  add(group, new THREE.SphereGeometry(0.24, 24, 16), mat.body, [0, 0.95, 0]);
  add(group, new THREE.CylinderGeometry(0.26, 0.22, 0.16, 24), mat.accent, [0, 1.18, 0]);
  add(group, new THREE.CapsuleGeometry(0.045, 0.45, 6, 10), mat.glow, [-0.38, 0.6, 0], [1, 1, 1], [0, 0, -0.7]);
  add(group, new THREE.CapsuleGeometry(0.045, 0.45, 6, 10), mat.accent, [0.38, 0.6, 0], [1, 1, 1], [0, 0, 0.7]);
  group.scale.setScalar(scale);
  centerPiece(group);
  return group;
}

function makeFort(color, scale) {
  const mat = materialSet(color);
  const group = new THREE.Group();
  add(group, new THREE.CylinderGeometry(0.4, 0.48, 1.1, 8), mat.body, [0, 0.68, 0]);
  add(group, new THREE.CylinderGeometry(0.5, 0.42, 0.18, 8), mat.accent, [0, 1.3, 0]);
  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI / 2) * i;
    add(group, new THREE.BoxGeometry(0.18, 0.22, 0.16), mat.accent, [Math.cos(angle) * 0.33, 1.5, Math.sin(angle) * 0.33]);
  }
  group.scale.setScalar(scale);
  centerPiece(group);
  return group;
}

function makeRoyal(color, scale, queen) {
  const mat = materialSet(color);
  const group = new THREE.Group();
  add(group, new THREE.CylinderGeometry(0.38, 0.48, 0.75, 32), mat.body, [0, 0.58, 0]);
  add(group, new THREE.SphereGeometry(0.28, 28, 16), mat.body, [0, 1.11, 0]);
  for (let i = 0; i < 5; i += 1) {
    const angle = (Math.PI * 2 * i) / 5;
    const height = queen ? 0.42 : i === 0 ? 0.6 : 0.35;
    add(group, new THREE.ConeGeometry(0.08, height, 12), mat.glow, [Math.cos(angle) * 0.2, 1.45, Math.sin(angle) * 0.2]);
  }
  if (!queen) add(group, new THREE.BoxGeometry(0.42, 0.06, 0.08), mat.glow, [0, 1.75, 0]);
  group.scale.setScalar(scale);
  centerPiece(group);
  return group;
}

function makeArc(from, to, type) {
  const height = type === "N" ? 1.25 : 0.55;
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(from.x, from.y, 0.15),
    new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2 + height, 0.2),
    new THREE.Vector3(to.x, to.y, 0.15),
  );
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(42));
  const material = new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.96 });
  return new THREE.Line(geometry, material);
}

function makeSparkles(from, to) {
  const count = 140;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const t = Math.random();
    positions[i * 3] = THREE.MathUtils.lerp(from.x, to.x, t) + (Math.random() - 0.5) * 0.34;
    positions[i * 3 + 1] = THREE.MathUtils.lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * 0.95 + (Math.random() - 0.5) * 0.24;
    positions[i * 3 + 2] = 0.18;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffbd5f, size: 0.055, transparent: true, opacity: 0.92 });
  return new THREE.Points(geometry, material);
}

function boardPosition(row, col, flipped) {
  const displayRow = flipped ? 7 - row : row;
  const displayCol = flipped ? 7 - col : col;
  return {
    x: displayCol - 3.5,
    y: 3.5 - displayRow,
  };
}

function add(group, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function centerPiece(group) {
  group.position.z = 0.4;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
}

function startRenderLoop() {
  if (!frameId) frameId = requestAnimationFrame(render);
}

function render() {
  activeAnimations.forEach((animation) => {
    const progress = Math.min(1, (performance.now() - animation.start) / animation.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    animation.piece.position.x = THREE.MathUtils.lerp(animation.from.x, animation.to.x, eased);
    animation.piece.position.y =
      THREE.MathUtils.lerp(animation.from.y, animation.to.y, eased) + Math.sin(progress * Math.PI) * (animation.type === "N" ? 1.2 : 0.4);
    animation.piece.rotation.y += 0.055;
    animation.piece.scale.setScalar(animation.baseScale * (1 + Math.sin(progress * Math.PI) * 0.28));
    if (progress === 1) activeAnimations.splice(activeAnimations.indexOf(animation), 1);
  });
  if (sparkleField) sparkleField.rotation.z += 0.002;
  renderer.render(scene, camera);
  if (canvas.classList.contains("active") || activeAnimations.length > 0) {
    frameId = requestAnimationFrame(render);
  } else {
    frameId = 0;
  }
}
