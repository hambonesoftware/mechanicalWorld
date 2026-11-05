import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import RAPIER from "@dimforge/rapier3d-compat";

const BASE_X = -1.53;
const BEAM_Y = 1.42;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function metal(color, roughness = 0.42, metalness = 0.73) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const MATERIALS = {
  frame: metal(0x526478, 0.36),
  trim: metal(0xe5a849, 0.35),
  dark: metal(0x172534, 0.48),
  screw: metal(0xaab7c4, 0.23),
  rubber: metal(0x25313c, 0.9, 0.05),
  floor: metal(0x213441, 0.95, 0.04),
  beam: metal(0x9caebc, 0.37),
  aluminum: metal(0xc4cdd4, 0.25, 0.78),
  heat: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.38, roughness: 0.47, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xaedce3, roughness: 0.1, metalness: 0.12, transparent: true, opacity: 0.22, depthWrite: false })
};

function box(parent, w, h, d, x, y, z, material, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent, radius, height, x, y, z, material, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), material);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeScrew(parent, x, y, z) {
  cyl(parent, 0.022, 0.012, x, y, z, MATERIALS.screw);
  box(parent, 0.026, 0.002, 0.004, x, y + 0.007, z, MATERIALS.dark, false);
}

function makeSign(text, width = 1.2) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#22313c";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#ffcc76";
  ctx.font = "700 41px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 78);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 4),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  mesh.userData.texture = texture;
  return mesh;
}

function makeGrid(scene) {
  const grid = new THREE.GridHelper(20, 32, 0x45606d, 0x2b4652);
  grid.position.y = -0.034;
  grid.material.transparent = true;
  grid.material.opacity = 0.27;
  scene.add(grid);
}

function stressColor(utilization) {
  const t = clamp(utilization, 0, 1.15) / 1.15;
  const samples = [0x3976a4, 0x30b2ba, 0x7bbd83, 0xe7bc60, 0xea6952];
  const region = Math.min(samples.length - 2, Math.floor(t * (samples.length - 1)));
  return new THREE.Color(samples[region]).lerp(
    new THREE.Color(samples[region + 1]),
    t * (samples.length - 1) - region
  );
}

/**
 * Build three continuous rectangular strips composing an I section.
 * Longitudinal and transverse subdivisions support physically meaningful
 * bending deformation and stress colors, without imported mesh assets.
 */
function createDeformedStrip(length, h, width, centerY, config, mechanics, displacementAt) {
  const geometry = new THREE.BoxGeometry(length, h, width, 68, 8, 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const deformationScale = config.deformationScale;
  const yieldStrength = mechanics.material.yieldStrength;
  for (let i = 0; i < positions.count; i += 1) {
    const x = clamp(positions.getX(i) + length / 2, 0, length);
    const localY = positions.getY(i) + centerY;
    const currentDeflection = displacementAt(x) * deformationScale;
    const currentRotation = mechanics.rotationAt(x) * deformationScale;
    const translatedX = positions.getX(i) - Math.sin(currentRotation) * localY;
    const translatedY = centerY + positions.getY(i) * Math.cos(currentRotation) + currentDeflection;
    positions.setXYZ(i, translatedX, translatedY, positions.getZ(i));
    const stress = Math.abs(mechanics.stressAt(x, localY));
    const color = stressColor(stress / yieldStrength);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export async function createLaboratory(canvas, onLoadStatus = () => {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101d29);
  scene.fog = new THREE.FogExp2(0x101d29, 0.038);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.27;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 65);
  camera.position.set(1.1, 2.55, 5.2);
  const orbit = new OrbitControls(camera, canvas);
  orbit.target.set(-0.45, 1.15, 0);
  orbit.minDistance = 2.1;
  orbit.maxDistance = 18;
  orbit.minPolarAngle = 0.21;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.075;
  orbit.update();

  scene.add(new THREE.HemisphereLight(0xb2d9f9, 0x2b2630, 2.1));
  const light = new THREE.DirectionalLight(0xffedcf, 3.1);
  light.position.set(-3.8, 8, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -6;
  light.shadow.camera.right = 6;
  light.shadow.camera.top = 6;
  light.shadow.camera.bottom = -6;
  light.shadow.normalBias = 0.025;
  scene.add(light);
  const rim = new THREE.DirectionalLight(0x73d6ff, 2.0);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  makeGrid(scene);
  box(scene, 5.15, 0.26, 2.15, 0, 0.08, 0, MATERIALS.dark);
  box(scene, 4.92, 0.06, 1.94, 0, 0.25, 0, MATERIALS.frame);
  for (const x of [-2.34, 2.34]) {
    for (const z of [-0.87, 0.87]) {
      box(scene, 0.13, 0.17, 0.13, x, -0.12, z, MATERIALS.dark);
      makeScrew(scene, x, 0.298, z);
    }
  }
  for (const z of [-0.72, 0.72]) {
    box(scene, 4.68, 0.035, 0.025, 0, 0.30, z, MATERIALS.trim);
  }

  // Left-hand rigid clamp: the beam is cantilevered from this vise.
  box(scene, 0.47, 1.05, 1.02, BASE_X - 0.23, 0.79, 0, MATERIALS.frame);
  box(scene, 0.32, 0.51, 0.71, BASE_X - 0.22, 1.35, 0, MATERIALS.dark);
  box(scene, 0.29, 0.12, 0.88, BASE_X - 0.13, BEAM_Y - 0.18, 0, MATERIALS.screw);
  box(scene, 0.26, 0.12, 0.88, BASE_X - 0.13, BEAM_Y + 0.18, 0, MATERIALS.screw);
  for (const z of [-0.36, 0.36]) {
    makeScrew(scene, BASE_X - 0.16, BEAM_Y + 0.25, z);
  }

  // Load frame and telescopic actuator at the cantilever's free end.
  const stand = new THREE.Group();
  scene.add(stand);
  for (const z of [-0.56, 0.56]) {
    box(stand, 0.12, 2.25, 0.14, 0, 1.36, z, MATERIALS.frame);
    box(stand, 0.19, 0.085, 0.2, 0, 0.33, z, MATERIALS.screw);
  }
  box(stand, 0.38, 0.18, 1.36, 0, 2.49, 0, MATERIALS.frame);
  const housing = cyl(stand, 0.18, 0.66, 0, 2.11, 0, MATERIALS.frame);
  housing.castShadow = true;
  cyl(stand, 0.205, 0.075, 0, 1.80, 0, MATERIALS.dark);
  const ram = cyl(stand, 0.068, 0.64, 0, 1.49, 0, MATERIALS.screw);
  const tip = cyl(stand, 0.14, 0.095, 0, 1.13, 0, MATERIALS.trim);

  const nameplate = makeSign("REDLINE / LAB 01", 1.44);
  nameplate.position.set(0.72, 0.52, 1.04);
  scene.add(nameplate);
  const machineGroup = new THREE.Group();
  scene.add(machineGroup);
  const beamGroup = new THREE.Group();
  beamGroup.position.set(BASE_X, BEAM_Y, 0);
  machineGroup.add(beamGroup);
  const stripMeshes = [];

  let rapier = null;
  let world = null;
  let weightBody = null;
  let weightMesh = null;
  let animationId = 0;
  let lastTick = 0;
  let frameAccumulator = 0;
  let cachedWidth = 0;
  let cachedHeight = 0;
  let lastConfig = null;
  let lastTipDeflection = 0;
  let lastFullFrame = false;
  let lastSceneMode = "ready";

  // Rapier is used for rigid sample motion; the beam itself uses FEAScript.
  try {
    await RAPIER.init();
    rapier = RAPIER;
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    world.createCollider(RAPIER.ColliderDesc.cuboid(2.575, 0.13, 1.075).setTranslation(0, 0.08, 0));
    onLoadStatus("Rapier rigid-body simulation ready");
  } catch (error) {
    console.error("Rapier could not initialize:", error);
    onLoadStatus("Rapier unavailable: rigid-body demonstration disabled");
  }

  function dropWeight() {
    if (!world || !rapier) return false;
    if (weightMesh) {
      scene.remove(weightMesh);
      weightMesh.geometry.dispose();
      weightMesh = null;
    }
    if (weightBody) world.removeRigidBody(weightBody);
    weightBody = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic().setTranslation(1.52, 3.3, 0.68).setLinearDamping(0.12)
    );
    world.createCollider(rapier.ColliderDesc.cuboid(0.15, 0.15, 0.15).setRestitution(0.26), weightBody);
    weightMesh = box(scene, 0.30, 0.30, 0.30, 1.52, 3.3, 0.68, MATERIALS.trim);
    return true;
  }

  function updateBeam(config, mechanics, solution, showHeatmap) {
    lastConfig = { ...config };
    lastTipDeflection = solution.tipDeflectionM * config.deformationScale;
    const oldMeshes = [...stripMeshes];
    for (const mesh of oldMeshes) {
      beamGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    stripMeshes.length = 0;
    const strips = [
      { h: config.flangeThickness, w: config.width, y: config.depth / 2 - config.flangeThickness / 2 },
      { h: config.depth - 2 * config.flangeThickness, w: config.webThickness, y: 0 },
      { h: config.flangeThickness, w: config.width, y: -config.depth / 2 + config.flangeThickness / 2 }
    ];
    for (const strip of strips) {
      const geometry = createDeformedStrip(
        config.length, strip.h, strip.w, strip.y, config, mechanics, solution.displacementAt
      );
      const mesh = new THREE.Mesh(geometry, showHeatmap ? MATERIALS.heat : config.material === "aluminum" ? MATERIALS.aluminum : MATERIALS.beam);
      mesh.position.x = config.length / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      beamGroup.add(mesh);
      stripMeshes.push(mesh);
    }
    stand.position.x = BASE_X + config.length;
    const deflection = solution.tipDeflectionM * config.deformationScale;
    const contact = BEAM_Y + deflection + config.depth / 2 + 0.05;
    tip.position.y = contact - stand.position.y;
    ram.position.y = contact + 0.37;
    // Clip extreme motion in visual-only actuator movement.
    ram.position.y = Math.max(0.56, ram.position.y);
    const overstress = mechanics.yieldUtilization >= 1;
    tip.material = overstress ? MATERIALS.trim : MATERIALS.screw;
    return { overstress };
  }

  function focusCamera(config = lastConfig, beamOnly = true, mode = lastSceneMode) {
    if (!config) return;
    lastFullFrame = !beamOnly;
    lastSceneMode = mode;
    const viewport = canvas.getBoundingClientRect();
    const aspect = Math.max(0.32, viewport.width / Math.max(1, viewport.height));
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspect);
    const span = beamOnly ? config.length + 0.65 : 5.5;
    const vertical = beamOnly ? 1.5 : 2.9;
    const widthFit = span / (2 * Math.tan(horizontalFov / 2)) * 1.08;
    const heightFit = vertical / (2 * Math.tan(fov / 2)) * 1.18;
    const distance = THREE.MathUtils.clamp(Math.max(widthFit, heightFit, 2.8), 2.8, 18);
    const centerX = beamOnly ? BASE_X + config.length * 0.48 : 0;
    const isEditing = mode === "build" || mode === "inspect";
    const centerY = isEditing && aspect < 0.95 ? 0.63 : 1.27;
    orbit.target.set(centerX, centerY, 0);
    camera.position.set(centerX + distance * 0.19, centerY + distance * 0.28, distance * 0.94);
    camera.lookAt(orbit.target);
    orbit.update();
  }

  function setViewForMode(mode, config) {
    focusCamera(config, !lastFullFrame, mode);
  }

  function worldToScreen(worldPoint) {
    const bounds = canvas.getBoundingClientRect();
    const projected = worldPoint.clone().project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * bounds.width,
      y: (1 - (projected.y * 0.5 + 0.5)) * bounds.height
    };
  }

  function getHandleAnchors(config) {
    const tipX = BASE_X + config.length;
    const tipY = BEAM_Y + lastTipDeflection;
    return {
      length: worldToScreen(new THREE.Vector3(tipX - 0.10, tipY + 0.24, 0.2)),
      depth: worldToScreen(new THREE.Vector3(BASE_X + Math.min(config.length * 0.39, 0.9), BEAM_Y + config.depth * 0.55 + 0.25, 0.1)),
      load: worldToScreen(new THREE.Vector3(tipX + 0.10, tipY + 0.81, 0.1))
    };
  }

  // A forgiving screen-space hit area is more usable than pixel-perfect
  // raycasting against a 6–12 pixel thick beam on a phone.
  function pickBeam(clientX, clientY) {
    if (!lastConfig) return false;
    const bounds = canvas.getBoundingClientRect();
    const a = worldToScreen(new THREE.Vector3(BASE_X, BEAM_Y, 0));
    const b = worldToScreen(new THREE.Vector3(BASE_X + lastConfig.length, BEAM_Y + lastTipDeflection, 0));
    const pointX = clientX - bounds.left;
    const pointY = clientY - bounds.top;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = THREE.MathUtils.clamp(((pointX - a.x) * dx + (pointY - a.y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
    return Math.hypot(pointX - (a.x + dx * t), pointY - (a.y + dy * t)) < 44;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    if (width === cachedWidth && height === cachedHeight) return;
    const oldAspect = camera.aspect;
    cachedWidth = width;
    cachedHeight = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (lastConfig && Math.abs(oldAspect - camera.aspect) > 0.13) {
      focusCamera(lastConfig, !lastFullFrame, lastSceneMode);
    }
  }
  function frame(timestamp) {
    animationId = requestAnimationFrame(frame);
    const dt = Math.min(0.08, Math.max(0, (timestamp - (lastTick || timestamp)) / 1000));
    lastTick = timestamp;
    frameAccumulator += dt;
    if (world) {
      let steps = 0;
      while (frameAccumulator >= 1 / 60 && steps < 4) {
        world.step();
        frameAccumulator -= 1 / 60;
        steps += 1;
      }
      if (weightBody && weightMesh) {
        const translation = weightBody.translation();
        const rotation = weightBody.rotation();
        weightMesh.position.set(translation.x, translation.y, translation.z);
        weightMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
    }
    resize();
    orbit.update();
    renderer.render(scene, camera);
  }
  animationId = requestAnimationFrame(frame);

  return {
    updateBeam,
    dropWeight,
    focusCamera,
    setViewForMode,
    getHandleAnchors,
    pickBeam,
    dispose() {
      cancelAnimationFrame(animationId);
      orbit.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.userData.texture) object.userData.texture.dispose();
      });
      renderer.dispose();
      if (world && typeof world.free === "function") world.free();
    }
  };
}
