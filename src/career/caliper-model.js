import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Downloaded source: Innerscene, Measure Slide / Vernier Caliper, CC0 1.0.
 * https://www.innerscene.com/tools/library/3d-parts/measure-slide-vernier-caliper-e27eece9
 *
 * Its GLB has separate meshes: Caliper beam, Outside measuring jaw(.001),
 * Inside measuring point(.001), Sliding scale block and Slider thumb wheel.
 * The .001 parts move on one constrained source Z axis.
 */
export const CALIPER_ASSET_URL = (import.meta.env?.BASE_URL || "/") + "models/vernier-caliper.glb";
export const SOURCE_JAW_OFFSET_M = -0.072;
export const SOURCE_AXIS_SCALE = 17.8;
export const MOVING_MESH_NAMES = Object.freeze([
  "Outside measuring jaw.001",
  "Inside measuring point.001",
  "Sliding scale block",
  "Slider thumb wheel"
]);

// GLTFLoader sanitizes spaces, dots and colons for animation-track safety.
// Resolve both the source Blender names and the names Three.js actually uses.
export function findCaliperPart(scene, sourceName) {
  return scene.getObjectByName(sourceName) ||
    scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(sourceName));
}

export function verifyCaliperParts(scene) {
  const missing = MOVING_MESH_NAMES.filter(name => !findCaliperPart(scene,name));
  for (const fixed of ["Caliper beam", "Outside measuring jaw"]) {
    if (!findCaliperPart(scene,fixed)) missing.push(fixed);
  }
  if (missing.length) throw new Error("GLB is missing caliper assembly nodes: " + missing.join(", "));
}

export function constructCaliperRig(gltf) {
  verifyCaliperParts(gltf.scene);
  const root = new THREE.Group();
  root.name = "Innerscene CC0 Vernier Caliper";
  const orientation = new THREE.Group();
  orientation.rotation.x = -Math.PI / 2;
  root.add(orientation);
  const scale = new THREE.Group();
  scale.scale.set(8.2, 8.2, SOURCE_AXIS_SCALE);
  orientation.add(scale);
  const origin = new THREE.Group();
  origin.position.z = 0.089;
  scale.add(origin);
  origin.add(gltf.scene);

  const moving = new THREE.Group();
  moving.name = "Functional sliding carriage";
  gltf.scene.add(moving);
  gltf.scene.updateWorldMatrix(true, true);
  for (const name of MOVING_MESH_NAMES) {
    moving.attach(findCaliperPart(gltf.scene,name));
  }
  const thumb = findCaliperPart(moving,"Slider thumb wheel");
  const bodyAnchor = new THREE.Object3D();
  bodyAnchor.position.set(0.004, 0.020, -0.008);
  origin.add(bodyAnchor);

  gltf.scene.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });

  const result = {
    root, moving, thumb, bodyAnchor,
    setOpening(mm, nominal, worldSpan) {
      const normalized = Math.max(0, Math.min(1.20, mm / Math.max(1, nominal)));
      moving.position.z = SOURCE_JAW_OFFSET_M + normalized * worldSpan / SOURCE_AXIS_SCALE;
    }
  };
  result.setOpening(0, 200, 1.96);
  return result;
}

export async function loadCaliperRig() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(CALIPER_ASSET_URL);
  return constructCaliperRig(gltf);
}
