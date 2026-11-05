import test from "node:test";
import assert from "node:assert/strict";
import {STARTER} from "../src/engineering/beam.js";
import {damageState,failureEnvelope} from "../src/engineering/damage.js";
import {sectionFractureBands,fractureBandPlan,fractureOpening,
  fractureCutX,fractureVertexOffset,geometryFractureFront} from "../src/scene/fractureGeometry.js";

test("I-beam damage layers cover all three real structural members",()=>{
  const bands=sectionFractureBands(STARTER);
  assert.equal(bands.length,17);
  assert.equal(bands.filter(x=>x.region==="top-flange").length,4);
  assert.equal(bands.filter(x=>x.region==="web").length,9);
  assert.equal(bands.filter(x=>x.region==="bottom-flange").length,4);
  assert.ok(bands[0].centerY>bands.at(-1).centerY);
  assert.ok(Math.abs(bands.reduce((sum,b)=>sum+b.height,0)-STARTER.depth)<1e-10);
});
test("material is continuous until damage front reaches each layer",()=>{
  const cfg=STARTER,e=failureEnvelope(cfg);
  const initial=fractureBandPlan(cfg,damageState(cfg,0));
  assert.equal(initial.filter(x=>x.split).length,0);
  const crack=fractureBandPlan(cfg,damageState(cfg,(e.crackLoadKN+e.tearLoadKN)*.5));
  assert.ok(crack.filter(x=>x.split).length>=1 && crack.filter(x=>x.split).length<=4);
  assert.ok(crack.filter(x=>x.region==="web"&&x.split).length<=1);
  const tear=fractureBandPlan(cfg,damageState(cfg,(e.tearLoadKN+e.ruptureLoadKN)*.5));
  assert.ok(tear.filter(x=>x.split).length>=7);
  assert.ok(tear.some(x=>x.region==="web"&&x.split));
  assert.ok(tear.some(x=>!x.split),"unbroken ligament must remain");
  const final=fractureBandPlan(cfg,damageState(cfg,e.ruptureLoadKN));
  assert.equal(final.filter(x=>x.split).length,17);
  assert.equal(geometryFractureFront(damageState(cfg,e.ruptureLoadKN)),1);
});
test("gap opens monotonically with damage and is spatially localized",()=>{
  const cfg=STARTER,e=failureEnvelope(cfg);
  let last=0;
  for(let i=0;i<=100;i++){
    const F=e.crackLoadKN+(e.ruptureLoadKN-e.crackLoadKN)*i/100;
    const opening=fractureBandPlan(cfg,damageState(cfg,F))[0].opening;
    assert.ok(opening>=last-1e-12);
    last=opening;
  }
  assert.ok(last>0.04 && last<0.08);
  const cut=fractureCutX(cfg);
  const first=fractureVertexOffset(cut,.09,.01,cut,.06,true);
  const far=fractureVertexOffset(cfg.length,.09,.01,cut,.06,true);
  const root=fractureVertexOffset(cut,.09,.01,cut,.06,false);
  assert.ok(first.x-root.x>.05);
  assert.ok(Math.abs(far.x)<.002);
  assert.ok(first.y<0);
  assert.equal(fractureOpening(.1,.2),0);
});
test("crack surfaces share a deterministic base seam with finite geometry",()=>{
  const cut=fractureCutX(STARTER);
  const root=fractureVertexOffset(cut,.01,-.03,cut,.053,false);
  const loose=fractureVertexOffset(cut,.01,-.03,cut,.053,true);
  assert.ok(Math.abs(loose.x-root.x-.053)<1e-10);
  assert.ok(Math.abs(root.x)<.005);
});
