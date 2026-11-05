import test from "node:test";
import assert from "node:assert/strict";
import { STARTER } from "../src/engineering/beam.js";
import { damageState, destructiveTargetKN, failureEnvelope, failureMilestones, preRuptureGeometryLoadKN, stagedActuatorLoad } from "../src/engineering/damage.js";

test("damage phases are increasing and yield does not mean immediate fracture", () => {
  const f = failureEnvelope(STARTER);
  assert.ok(f.yieldLoadKN > 0);
  assert.ok(f.yieldLoadKN < f.crackLoadKN);
  assert.ok(f.crackLoadKN < f.tearLoadKN);
  assert.ok(f.tearLoadKN < f.ruptureLoadKN);
  assert.equal(damageState(STARTER, 0).stage, "elastic");
  assert.equal(damageState(STARTER, f.yieldLoadKN * 1.05).stage, "yielding");
  assert.equal(damageState(STARTER, (f.crackLoadKN + f.tearLoadKN) / 2).stage, "cracking");
  assert.equal(damageState(STARTER, (f.tearLoadKN + f.ruptureLoadKN) / 2).stage, "tearing");
  assert.equal(damageState(STARTER, f.ruptureLoadKN * 1.02).stage, "ruptured");
});

test("a safe 12kN beam stays intact; an overloaded 60kN steel beam ruptures in the demo", () => {
  assert.equal(damageState(STARTER, 12).stage, "elastic");
  assert.equal(damageState(STARTER, 60).stage, "ruptured");
});

test("destructive mode reaches fracture envelope without arbitrarily capping commanded load", () => {
  const f = failureEnvelope(STARTER);
  const target = destructiveTargetKN(STARTER, 12);
  assert.ok(target > f.ruptureLoadKN);
  assert.equal(damageState(STARTER, target).stage, "ruptured");
  assert.equal(destructiveTargetKN(STARTER, 2 * target), 2 * target);
});

test("larger section reduces damage at a fixed force", () => {
  const thin = { ...STARTER, depth: 0.09, flangeThickness: 0.006, webThickness: 0.005 };
  assert.ok(failureEnvelope(thin).ruptureLoadKN < failureEnvelope(STARTER).ruptureLoadKN);
});

test("milestone values are strictly increasing and damage is bounded", () => {
  const stages = failureMilestones(STARTER);
  assert.deepEqual(stages.map(s => s.stage), ["yielding", "cracking", "tearing", "ruptured"]);
  for (let i = 1; i < stages.length; i++) assert.ok(stages[i].loadKN > stages[i - 1].loadKN);
  const state = damageState(STARTER, 10000);
  assert.equal(state.crackProgress, 1);
  assert.equal(state.tearProgress, 1);
});


test("actuator pacing gives crack and tear visible intervals before rupture",()=>{
  const envelope = failureEnvelope(STARTER);
  const target = envelope.ruptureLoadKN * 1.09;
  const samples = Array.from({length:101},(_,i)=>stagedActuatorLoad(STARTER,target,i/100));
  assert.equal(samples[0],0);
  assert.ok(Math.abs(samples[100]-target)<1e-7);
  for(let i=1;i<samples.length;i++){
    assert.ok(samples[i]>=samples[i-1]-1e-9,"Actuator command must not move backward");
  }
  assert.equal(damageState(STARTER,stagedActuatorLoad(STARTER,target,0.72)).stage,"cracking");
  assert.equal(damageState(STARTER,stagedActuatorLoad(STARTER,target,0.88)).stage,"tearing");
  assert.equal(damageState(STARTER,stagedActuatorLoad(STARTER,target,0.98)).stage,"ruptured");
});
test("after separation the plastic geometry freezes even when the actuator continues",()=>{
  const env = failureEnvelope(STARTER);
  assert.equal(preRuptureGeometryLoadKN(STARTER,12),12);
  assert.equal(preRuptureGeometryLoadKN(STARTER,60),env.ruptureLoadKN);
  assert.equal(preRuptureGeometryLoadKN(STARTER,140),env.ruptureLoadKN);
  assert.throws(()=>preRuptureGeometryLoadKN(STARTER,-1),RangeError);
});
