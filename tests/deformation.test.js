import test from "node:test";
import assert from "node:assert/strict";
import {STARTER,beamAnalysis} from "../src/engineering/beam.js";
import {createPlasticBeam} from "../src/engineering/plasticity.js";
import {beamVisualPose,beamVisualPoint,fragmentVisualPoint,DISPLAY_FLOOR_TOP,DISPLAY_CLEARANCE_M} from "../src/scene/deformation.js";

function atLoad(config,loadKN) {
  return createPlasticBeam(config).stepTo(loadKN);
}
test("exaggerated cantilever never crosses the actual 0.28 m machine top",()=>{
  for(const depth of [0.08,0.2,0.35]){
    for(const force of [0,12,42,50,58,70]){
      const config={...STARTER,depth,deformationScale:20};
      const solution=atLoad(config,force);
      for(let i=0;i<=64;i++){
        const x=config.length*i/64;
        const p=beamVisualPose(config,solution,x);
        assert.ok(p.bottomSurfaceY>=DISPLAY_FLOOR_TOP+DISPLAY_CLEARANCE_M-1e-8,
          "Floor penetration at "+force+" kN, depth "+depth+", x "+x+": "+p.bottomSurfaceY);
        assert.ok(Number.isFinite(p.rotation));
      }
    }
  }
});
test("pose varies continuously near the compression transition",()=>{
  const c={...STARTER,deformationScale:8};
  const p1=beamVisualPose(c,atLoad(c,52),c.length);
  const p2=beamVisualPose(c,atLoad(c,52.05),c.length);
  assert.ok(Math.abs(p2.displacement-p1.displacement)<0.03);
  assert.ok(Math.abs(p2.rotation-p1.rotation)<0.07);
  assert.ok(p1.displacement<0);
});
test("detached curved fragment matches previous attached position at separation",()=>{
  const c={...STARTER,deformationScale:12};
  const sol=atLoad(c,57);
  const cut=0.23, mid=(cut+c.length)/2;
  const center=beamVisualPose(c,sol,mid).displacement;
  for(const x of [cut,cut+0.01,mid,c.length]){
    for(const y of [-c.depth/2,0,c.depth/2]){
      const prev=beamVisualPoint(c,sol,x,y);
      const relative=fragmentVisualPoint(c,sol,x,y,mid,center);
      assert.ok(Math.abs(relative.x+mid-prev.x)<1e-10);
      assert.ok(Math.abs(relative.y+center-prev.y)<1e-10);
    }
  }
});
test("elastic small load follows the selected visual scale and zero stays zero",()=>{
  const c={...STARTER};
  const base=atLoad(c,0);
  assert.equal(beamVisualPose(c,base,c.length).displacement,0);
  const sol=atLoad(c,10);
  const raw=beamAnalysis(c,10).tipDeflectionM*c.deformationScale;
  const display=Math.abs(beamVisualPose(c,sol,c.length).displacement);
  assert.ok(display/raw>.95 && display/raw<=1.01);
});

test("elastic FEAScript displacement uses analytical rotation when FEM omits it",()=>{
  const c={...STARTER};
  const model={
    displacementAt:x=>-0.004*x*x,
    tipDeflectionM:-0.004*c.length*c.length
  };
  const pose=beamVisualPose(c,model,1,{rotationAt:x=>-0.008*x});
  assert.ok(pose.rotation< -0.02,"The section must rotate as it bends");
  const withoutFallback=beamVisualPose(c,model,1);
  assert.equal(withoutFallback.rotation,0);
});

test("overlarge legacy display scales cannot fold the beam into the floor",()=>{
  const c={...STARTER,deformationScale:20};
  const sol=atLoad(c,55);
  const pose=beamVisualPose(c,sol,c.length);
  assert.ok(pose.bottomSurfaceY>DISPLAY_FLOOR_TOP+DISPLAY_CLEARANCE_M);
  const limited=beamVisualPose({...c,deformationScale:3},sol,c.length);
  assert.ok(Math.abs(pose.displacement-limited.displacement)<1e-10);
});
