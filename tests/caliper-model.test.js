import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  MOVING_MESH_NAMES, SOURCE_JAW_OFFSET_M,
  verifyCaliperParts, constructCaliperRig
} from "../src/career/caliper-model.js";

function testModel() {
  const root=new THREE.Group();
  const names=["Caliper beam","Outside measuring jaw","Inside measuring point",
    ...MOVING_MESH_NAMES];
  for (const name of names) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.01,0.01),new THREE.MeshStandardMaterial());
    mesh.name=name;
    mesh.position.z=name.endsWith(".001")?-0.017:-0.089;
    root.add(mesh);
  }
  return {scene:root};
}

test("downloaded GLB rig groups only the movable jaw/carriage parts",()=>{
  const model=testModel();
  const fixed=model.scene.getObjectByName("Outside measuring jaw");
  const fixedBefore=fixed.position.z;
  const rig=constructCaliperRig(model);
  assert.equal(rig.moving.children.length,4);
  assert.equal(fixed.parent,model.scene);
  for(const name of MOVING_MESH_NAMES)assert.equal(rig.moving.getObjectByName(name)?.parent,rig.moving);
  rig.setOpening(0,200,1.96);
  assert.ok(Math.abs(rig.moving.position.z-SOURCE_JAW_OFFSET_M)<1e-8);
  const closed=rig.moving.position.z;
  rig.setOpening(200,200,1.96);
  assert.ok(rig.moving.position.z>closed);
  assert.equal(fixed.position.z,fixedBefore);
  assert.equal(rig.root.name,"Innerscene CC0 Vernier Caliper");
});

test("GLB with missing mechanical part cannot silently become a fake animated asset",()=>{
  const model=testModel();
  const slider=model.scene.getObjectByName("Sliding scale block");
  slider.parent.remove(slider);
  assert.throws(()=>verifyCaliperParts(model.scene),/Sliding scale block/);
});

test("jaw travel scales by chosen inspected feature and clamps overreach",()=>{
  const rig=constructCaliperRig(testModel());
  rig.setOpening(120,120,1.72);
  const flangeTravel=rig.moving.position.z;
  rig.setOpening(200,200,1.96);
  const heightTravel=rig.moving.position.z;
  assert.ok(heightTravel>flangeTravel);
  rig.setOpening(-50,200,1.96);
  assert.equal(rig.moving.position.z,SOURCE_JAW_OFFSET_M);
  rig.setOpening(10_000,200,1.96);
  assert.ok(rig.moving.position.z<1);
});
