import test from "node:test";
import assert from "node:assert/strict";
import { STARTER, beamAnalysis, sectionProperties } from "../src/engineering/beam.js";
import { createPlasticBeam, replayPlasticSnapshot } from "../src/engineering/plasticity.js";

function close(actual, expected, relative = 0.018) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * relative),
    "Expected " + actual + " to be near " + expected);
}
test("fiber section recovers the existing verified elastic cantilever", () => {
  const beam=createPlasticBeam(STARTER);
  const response=beam.stepTo(12);
  const elastic=beamAnalysis(STARTER,12);
  close(response.tipDeflectionM,-elastic.tipDeflectionM,0.015);
  close(response.rotationAt(STARTER.length),elastic.rotationAt(STARTER.length),0.018);
  assert.equal(response.maxPlasticStrain,0);
  assert.ok(response.tipDeflectionM<0);
  assert.equal(response.displacementAt(0),0);
});
test("first yield and bilinear hardening produce larger deflection than elastic trial",()=>{
  const beam=createPlasticBeam(STARTER);
  const res=beam.stepTo(47);
  const trial=beamAnalysis(STARTER,47);
  assert.ok(res.maxPlasticStrain>0,"Some I-beam fibers should have yielded");
  assert.ok(-res.tipDeflectionM>trial.tipDeflectionM*1.1,"Plastic curvature causes extra tip deflection");
  assert.ok(res.maxStressPa>0 && res.maxStressPa<trial.maxStressPa,"True section stress is lower than linear elastic trial");
});
test("unloading returns load to zero but retains a nonzero residual bend",()=>{
  const model=createPlasticBeam(STARTER);
  model.stepTo(48);
  const peak=model.snapshot();
  const end=model.stepTo(0);
  assert.equal(end.forceKN,0);
  assert.ok(end.maxPlasticStrain>0);
  assert.ok(Math.abs(end.tipDeflectionM)>0.001);
  assert.ok(Math.abs(end.tipDeflectionM)<Math.abs(peak.tipDeflectionM));
  assert.equal(end.permanentTipM,end.tipDeflectionM);
});
test("reloading initially follows approximately elastic stiffness and retains loading history",()=>{
  const model=createPlasticBeam(STARTER);
  model.stepTo(47);
  const released=model.stepTo(0);
  const reload=model.stepTo(8);
  const elastic=beamAnalysis(STARTER,8);
  close(reload.tipDeflectionM-released.tipDeflectionM,-elastic.tipDeflectionM,0.03);
  assert.equal(reload.peakKN,47);
  assert.ok(reload.maxPlasticStrain>0);
});
test("aluminum, section geometry and low loads are supported",()=>{
  const model=createPlasticBeam({...STARTER,material:"aluminum",depth:0.23});
  const response=model.stepTo(6);
  assert.ok(response.tipDeflectionM<0);
  assert.equal(response.maxPlasticStrain,0);
  assert.ok(sectionProperties(STARTER).inertia>0);
});
test("replay snapshots preserve earlier geometry after unloading and reloading",()=>{
  const model=createPlasticBeam(STARTER);
  model.stepTo(46);
  const saved=model.snapshot();
  model.stepTo(0);
  model.stepTo(34);
  const restored=replayPlasticSnapshot(saved);
  close(restored.tipDeflectionM,saved.tipDeflectionM,1e-8);
  assert.equal(restored.forceKN,46);
  close(restored.displacementAt(STARTER.length),saved.tipDeflectionM,1e-8);
  assert.ok(Math.abs(restored.rotationAt(1))>0);
});
test("invalid loads and incomplete inputs fail explicitly",()=>{
  assert.throws(()=>createPlasticBeam({...STARTER,webThickness:1}),RangeError);
  assert.throws(()=>createPlasticBeam(STARTER,{hardeningRatio:0}),RangeError);
  const model=createPlasticBeam(STARTER);
  assert.throws(()=>model.stepTo(-1),RangeError);
  assert.throws(()=>replayPlasticSnapshot({}),TypeError);
});
