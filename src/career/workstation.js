import * as THREE from "three";
import {
  FEATURES, canSeat, assessInspection, readCareer, careerRank, completeWorkOrder
} from "./inspection.js";

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const store = (() => { try { return window.localStorage; } catch { return null; } })();
const featureById = id => FEATURES.find(feature => feature.id === id);
const state = {
  feature: FEATURES[0],
  tool: "caliper",
  zeroed: { caliper: false, micrometer: false },
  opening: 0,
  reading: null,
  captured: new Set(),
  sheet: null,
  scene: null,
  firstInteraction: false
};

const dimensionLabels = {
  height: "OVERALL HEIGHT · H",
  flange: "FLANGE WIDTH · W",
  web: "WEB THICKNESS · t"
};

function updateCareerHeader() {
  const progress = readCareer(store);
  $("xpCount").textContent = progress.xp;
  $("rankLabel").textContent = careerRank(progress);
  if (progress.completed.includes("WO-002")) {
    $("mentorText").textContent = "Promotion earned! Your incoming inspection and proof-load verification are on file. You are now a Junior Technician.";
  } else if (progress.completed.includes("WO-001")) {
    $("mentorText").textContent = "Good work. That web was outside the print. Your report is on file. You can repeat this job or head to the test rig.";
  }
}

function showSheet(name = null) {
  state.sheet = name;
  for (const sheet of ["workOrder", "drawing", "report"]) {
    $(sheet + "Sheet").hidden = sheet !== name;
  }
  $("sheetBackdrop").hidden = !name;
  $("careerApp").dataset.sheet = name || "";
  if (name === "report") {
    $("reportTitle").textContent = state.captured.size === FEATURES.length ? "Accept or reject?" : "Inspection in progress";
  }
  if (!name) state.scene?.resize();
}

function feedback(text, tone = "") {
  $("measureStatus").textContent = text;
  $("measureStatus").className = "instruction " + tone;
  $("sceneCorner").textContent = text;
  $("sceneCorner").className = "scene-feedback " + tone;
}

function setOpening(value) {
  const max = state.feature.maxOpening;
  state.opening = Math.min(max, Math.max(0, Math.round(Number(value) * 100) / 100));
  state.reading = null;
  renderControlState();
}

function selectFeature(id) {
  const feature = featureById(id);
  if (!feature) return;
  state.feature = feature;
  state.tool = feature.tool;
  state.opening = 0;
  state.reading = null;
  renderControlState();
  state.scene?.setFeature(id);
  state.scene?.setTool(state.tool);
  state.scene?.resetView();
  feedback(state.zeroed[state.tool]
    ? "Drag the orange jaw to " + feature.nominal + " mm, then release."
    : "Zero the " + (state.tool === "caliper" ? "caliper" : "micrometer") + " to begin.");
}

function switchTool() {
  state.tool = state.tool === "caliper" ? "micrometer" : "caliper";
  state.opening = 0;
  state.reading = null;
  state.scene?.setTool(state.tool);
  renderControlState();
  feedback(state.tool !== state.feature.tool
    ? "That tool cannot measure this feature. Tap the tool name to change back."
    : state.zeroed[state.tool] ? "Drag the orange jaw toward the part." : "Close the jaws, then zero the instrument.",
    state.tool !== state.feature.tool ? "warning" : "");
}

function zeroTool() {
  if (state.tool !== state.feature.tool) {
    feedback("This feature needs the " + (state.feature.tool === "caliper" ? "caliper" : "micrometer") + ".", "warning");
    return;
  }
  if (state.opening > 0.20) {
    feedback("Close the jaws to 0.00 mm before setting zero.", "warning");
    return;
  }
  state.zeroed[state.tool] = true;
  // Keep the in-world hint until the player first touches the moving jaw.
  state.opening = 0;
  state.reading = null;
  renderControlState();
  feedback("Zero set. Drag the orange jaw to " + state.feature.nominal + " mm.", "good");
}

function seatJaws() {
  if (state.tool !== state.feature.tool) {
    feedback("Wrong instrument. Change tools first.", "warning");
    return false;
  }
  if (!state.zeroed[state.tool]) {
    feedback("Set zero before touching off the part.", "warning");
    return false;
  }
  if (!canSeat(state.feature, state.tool, true, state.opening)) {
    feedback("Move the jaws closer to " + state.feature.nominal + " mm and try again.", "warning");
    return false;
  }
  state.opening = state.feature.actual;
  state.reading = state.feature.actual;
  renderControlState();
  feedback("Contact ✓ " + state.reading.toFixed(2) + " mm. Record the reading.", "good");
  return true;
}

function recordReading() {
  if (state.reading === null) {
    feedback("Move the jaws to the part before recording.", "warning");
    return;
  }
  const id = state.feature.id;
  $("record-" + id).value = state.reading.toFixed(2);
  $("record-" + id).classList.remove("invalid");
  $("error-" + id).textContent = "";
  state.captured.add(id);
  $("feature-" + id + "-status").textContent = state.reading.toFixed(2) + " ✓";
  const remaining = FEATURES.find(feature => !state.captured.has(feature.id));
  if (remaining) {
    selectFeature(remaining.id);
    feedback(state.captured.size + " of 3 measured. Next: " + remaining.label.toLowerCase() + ".", "good");
  } else {
    feedback("All measurements recorded. Review the inspection report.", "good");
    renderControlState();
    showSheet("report");
  }
}

function renderControlState() {
  const feature = state.feature;
  const calibrated = state.zeroed[state.tool];
  const ready = state.tool === feature.tool;
  $("taskProgress").textContent = state.captured.size + " OF 3 MEASUREMENTS";
  $("taskTitle").textContent = state.captured.size === FEATURES.length ? "Complete your inspection"
    : "Measure " + feature.label.toLowerCase();
  $("targetDimensionLabel").textContent = dimensionLabels[feature.id];
  $("targetDimension").innerHTML = feature.nominal.toFixed(2) + ' <small>± ' + feature.tolerance.toFixed(2) + ' mm</small>';
  $("jawOpening").max = String(feature.maxOpening);
  $("jawOpening").value = state.opening.toFixed(2);
  $("openingValue").textContent = state.opening.toFixed(2) + " mm";
  $("meterReading").textContent = calibrated ? state.opening.toFixed(2) : "--.--";
  $("meterState").textContent = state.reading !== null ? "CONTACT ✓" : calibrated ? "ZERO SET ✓" : "NOT ZEROED";
  $("meterName").textContent = state.tool === "caliper" ? "DIGITAL CALIPER" : "MICROMETER";
  $("toolIcon").textContent = state.tool === "caliper" ? "▤" : "◉";
  $("toolHint").textContent = ready ? "Tap to change tool" : "WRONG TOOL — TAP TO SWITCH";
  $("toolPicker").classList.toggle("wrong-tool", !ready);
  $("zeroTool").hidden = calibrated;
  $("seatJaws").hidden = !calibrated || state.reading !== null;
  $("transferReading").hidden = state.reading === null;
  $("transferReading").disabled = state.reading === null;
  $("transferReading").innerHTML = "RECORD " + (state.reading === null ? "READING" : state.reading.toFixed(2) + " mm") + " <span>✓</span>";
  $("zeroTool").textContent = "ZERO " + (state.tool === "caliper" ? "CALIPER" : "MICROMETER") + " →";
  $("contactGuide").hidden = state.reading!==null || state.firstInteraction;
  $("sceneCorner").classList.toggle("quiet",state.reading===null && calibrated);
  $("reportCount").textContent = state.captured.size + "/3";
  for (const button of $$("[data-feature]")) {
    const active = button.dataset.feature === feature.id;
    const done = state.captured.has(button.dataset.feature);
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-complete", done);
    button.setAttribute("aria-pressed", String(active));
  }
  const grip = $("jawGrip");
  grip.setAttribute("aria-valuenow", state.opening.toFixed(2));
  grip.setAttribute("aria-valuemax", String(feature.maxOpening));
  grip.setAttribute("aria-valuetext", state.opening.toFixed(2) + " millimetres");
  grip.setAttribute("aria-label", "Drag the moving " + state.tool + " jaw to adjust the opening");
  $("gripSymbol").textContent = state.tool === "caliper" && feature.id === "height" ? "↕" : "↔";
  state.scene?.setOpening(state.opening);
}

function clearErrors() {
  for (const feature of FEATURES) {
    $("record-" + feature.id).classList.remove("invalid");
    $("error-" + feature.id).textContent = "";
  }
  $("error-disposition").textContent = "";
}

function submitReport(event) {
  event.preventDefault();
  clearErrors();
  const readings = Object.fromEntries(FEATURES.map(feature =>
    [feature.id, $("record-" + feature.id).value]));
  const disposition = document.querySelector('input[name="disposition"]:checked')?.value;
  const result = assessInspection(readings, disposition);
  for (const feature of FEATURES) {
    if (!state.captured.has(feature.id)) {
      result.errors[feature.id] = "Measure this dimension with the instrument first.";
    }
  }
  if (Object.keys(result.errors).length) {
    for (const [id, problem] of Object.entries(result.errors)) {
      $("error-" + id).textContent = problem;
      if (id !== "disposition") $("record-" + id).classList.add("invalid");
    }
    return;
  }
  const award = completeWorkOrder(store, "WO-001");
  updateCareerHeader();
  $("rewardXP").textContent = award.newlyCompleted ? "+100 XP" : "EARNED";
  $("completionMessage").textContent = "You measured an 8.32 mm web against an 8.20 mm maximum. The rejected specimen was stopped before installation.";
  showSheet(null);
  $("completionOverlay").hidden = false;
  $("backToBench").focus();
}

/** A focused, tool-engaged metrology viewport, not a distant decorative workshop. */
function createWorkshop(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: "low-power"
  });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x899b9d);
  scene.fog = new THREE.Fog(0x899b9d, 12, 28);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  const target = new THREE.Vector3(-0.12, 1.85, 0.20);
  const startOffset = new THREE.Vector3(3.15, 2.10, 8.10);
  const spherical = new THREE.Spherical().setFromVector3(startOffset);
  let panMode = false;
  const pointers = new Map();
  let lastGesture = null;
  let tap = null;
  let gripPointer = null;
  let renderNeeded = true;

  function updateCamera() {
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, 2.85, 12.5);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.36, 1.77);
    target.x = THREE.MathUtils.clamp(target.x, -1.8, 1.8);
    target.y = THREE.MathUtils.clamp(target.y, 0.9, 3.0);
    target.z = THREE.MathUtils.clamp(target.z, -1.6, 2);
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
    camera.lookAt(target);
    camera.updateMatrixWorld();
    renderNeeded = true;
    updateGrip();
  }
  function pan(dx, dy) {
    const speed = spherical.radius / Math.max(170, canvas.clientHeight) * 0.72;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    target.addScaledVector(right, -dx * speed).addScaledVector(up, dy * speed);
    updateCamera();
  }
  function resetView() {
    target.set(-0.12, 1.85, 0.20);
    spherical.setFromVector3(startOffset);
    updateCamera();
  }

  scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x516572, 2.25));
  const key = new THREE.DirectionalLight(0xffecd2, 3.0);
  key.position.set(-4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -4;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb5deef, 1.8);
  fill.position.set(4, 4, -4);
  scene.add(fill);
  const mats = {
    steel: new THREE.MeshStandardMaterial({color:0x8499a4,roughness:0.42,metalness:0.48}),
    polished: new THREE.MeshStandardMaterial({color:0xc9d6db,roughness:0.32,metalness:0.60}),
    machine: new THREE.MeshStandardMaterial({color:0x344957,roughness:0.59,metalness:0.31}),
    rubber: new THREE.MeshStandardMaterial({color:0x182730,roughness:0.90}),
    amber: new THREE.MeshStandardMaterial({color:0xf6a951,roughness:0.40,metalness:0.20}),
    bench: new THREE.MeshStandardMaterial({color:0x5c6b68,roughness:0.88}),
    wall: new THREE.MeshStandardMaterial({color:0x84999e,roughness:0.96}),
    selected: new THREE.MeshStandardMaterial({color:0xffc17c,roughness:0.39,metalness:0.25,emissive:0x75450d,emissiveIntensity:0.12})
  };
  function box(parent,w,h,d,x,y,z,material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // An honest I-section silhouette, extruded along the longitudinal axis.
  // The front end is clearly readable, rather than a collection of
  // mutually obstructing box sections seen from an overhead viewpoint.
  box(scene,6.8,0.19,4.5,0,0.67,0,mats.bench);
  box(scene,6.8,0.10,4.5,0,0.53,0,mats.machine);
  box(scene,9,5.6,0.15,0,2.75,-3.25,mats.wall);
  // Engineering lab around the part. All decorative props sit behind the
  // workpiece, leaving the scene camera and jaws accessible on a phone.
  const floorMaterial=new THREE.MeshStandardMaterial({color:0x697977,roughness:0.93});
  const wallTrim=new THREE.MeshStandardMaterial({color:0x354951,roughness:0.56,metalness:0.52});
  const cabinetPaint=new THREE.MeshStandardMaterial({color:0x60766d,roughness:0.57,metalness:0.26});
  const paper=new THREE.MeshStandardMaterial({color:0xf2ede2,roughness:0.98});
  const safetyYellow=new THREE.MeshStandardMaterial({color:0xe7b155,roughness:0.56});
  box(scene,15,0.15,15,0,-0.03,0,floorMaterial);
  for(const x of [-4.2,4.2])box(scene,0.12,5.4,0.14,x,2.65,-3.08,wallTrim);
  for(let x=-3.7;x<3.9;x+=1.23){
    box(scene,0.018,0.018,3.8,x,-0.08,-0.7,wallTrim);
  }
  // Pegboard, instrument hooks and a spare micrometer at the wall.
  box(scene,4.7,1.67,0.12,0.15,3.37,-3.05,cabinetPaint);
  const pegHole=new THREE.MeshStandardMaterial({color:0x31484a,roughness:0.8});
  for(let x=-2.05;x<2.4;x+=0.25){
    for(let y=2.68;y<4.1;y+=0.26){
      box(scene,0.030,0.030,0.006,x,y,-2.98,pegHole);
    }
  }
  box(scene,0.10,0.9,0.14,-1.7,3.34,-2.82,mats.polished);
  box(scene,0.45,0.10,0.14,-1.7,3.73,-2.81,mats.machine);
  box(scene,0.45,0.12,0.14,-1.7,2.90,-2.81,mats.machine);
  box(scene,0.20,0.60,0.12,1.7,3.31,-2.80,mats.amber);
  box(scene,0.52,0.10,0.12,1.7,3.02,-2.80,mats.polished);
  // The translucent window helps convey a larger department beyond the bench.
  const windowMetal=wallTrim;
  const glass=new THREE.MeshStandardMaterial({color:0xb6d5db,roughness:0.16,metalness:0.05,transparent:true,opacity:0.59});
  box(scene,1.20,1.90,0.08,3.36,3.17,-3.00,windowMetal);
  box(scene,1.04,1.72,0.08,3.36,3.17,-2.93,glass);
  box(scene,0.055,1.72,0.12,3.36,3.17,-2.86,wallTrim);
  // Industrial drawers and tool storage behind the working area.
  box(scene,1.13,1.18,0.79,3.35,0.62,-2.35,cabinetPaint);
  for(const y of [0.33,0.69,1.03]){
    box(scene,1.01,0.045,0.035,3.35,y,-1.93,wallTrim);
    box(scene,0.20,0.045,0.04,3.35,y+0.095,-1.9,mats.polished);
  }
  const workLamp=new THREE.Group();
  workLamp.position.set(2.55,0.82,-0.82);
  scene.add(workLamp);
  box(workLamp,0.45,0.10,0.33,0,0,0,mats.machine);
  box(workLamp,0.05,0.95,0.05,-0.10,0.53,0,mats.polished);
  const lampArm=box(workLamp,0.045,0.85,0.045,-0.39,1.27,0,mats.polished);
  lampArm.rotation.z=-0.65;
  box(workLamp,0.55,0.18,0.37,-0.65,1.70,0,mats.machine);
  const glow=new THREE.MeshStandardMaterial({color:0xffedc5,emissive:0xffd89c,emissiveIntensity:0.63,roughness:0.78});
  box(workLamp,0.49,0.025,0.30,-0.65,1.60,0,glow);
  // A physical engineering print and pencil resting on the table.
  const print=box(scene,1.07,0.013,0.72,1.72,0.81,1.12,paper);
  print.rotation.y=-0.17;
  for(const z of [0.91,1.04,1.16]){
    box(scene,0.68,0.004,0.008,1.72,0.826,z,wallTrim);
  }
  const pencil=box(scene,0.035,0.035,0.74,1.05,0.84,1.15,safetyYellow);
  pencil.rotation.y=0.19;
  // Steel inspection gauge blocks next to the print.
  box(scene,0.28,0.14,0.34,-2.30,0.87,1.00,mats.polished);
  box(scene,0.25,0.31,0.24,-2.70,0.95,1.06,mats.steel);
  // Overhead fixtures wash the metal while preserving directional shadows.
  box(scene,2.1,0.12,0.38,-1.5,5.12,-1.35,wallTrim,false);
  box(scene,1.93,0.018,0.29,-1.5,5.04,-1.35,glow,false);
  box(scene,1.75,0.12,0.38,2.15,5.10,-1.38,wallTrim,false);
  box(scene,1.59,0.018,0.29,2.15,5.01,-1.38,glow,false);
  const grid = new THREE.GridHelper(12,20,0x8ea2a8,0xa9bac1);
  grid.position.y=0.79;
  grid.material.opacity=0.26; grid.material.transparent=true;
  scene.add(grid);
  // Two rubber blocks support the specimen, distinctly behind the gauge.
  box(scene,0.68,0.16,0.64,-0.72,0.86,-0.45,mats.rubber);
  box(scene,0.68,0.16,0.64,0.72,0.86,-0.45,mats.rubber);

  const profile = new THREE.Shape();
  const points=[
    [-0.86,0],[0.86,0],[0.86,0.19],[0.12,0.19],
    [0.12,1.77],[0.86,1.77],[0.86,1.96],
    [-0.86,1.96],[-0.86,1.77],[-0.12,1.77],
    [-0.12,0.19],[-0.86,0.19]
  ];
  points.forEach(([x,y],index) => index===0 ? profile.moveTo(x,y) : profile.lineTo(x,y));
  profile.closePath();
  const beamGeo = new THREE.ExtrudeGeometry(profile,{
    depth:1.52,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:0.02,bevelThickness:0.02,curveSegments:1
  });
  const beam = new THREE.Mesh(beamGeo,mats.steel);
  beam.position.set(0,0.94,-0.56);
  beam.castShadow=true;
  beam.receiveShadow=true;
  scene.add(beam);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(beamGeo,25),
    new THREE.LineBasicMaterial({color:0x304955,transparent:true,opacity:0.45}));
  edges.position.copy(beam.position);
  scene.add(edges);

  // Caliper assembled around the selected feature. The fixed jaw is at
  // zero and the sliding jaw travels in the same world axis as the feature.
  const caliper = new THREE.Group();
  const rail = box(caliper,0.13,2.54,0.12,-0.27,1.12,0,mats.polished);
  const engraved = box(caliper,0.025,2.34,0.013,-0.20,1.12,0.071,mats.machine);
  box(caliper,0.64,0.095,0.20,0.13,0,0,mats.polished);
  box(caliper,0.36,0.25,0.26,-0.28,0,0,mats.machine);
  const caliperSlider = new THREE.Group();
  box(caliperSlider,0.67,0.11,0.23,0.12,0,0,mats.polished);
  box(caliperSlider,0.37,0.28,0.30,-0.27,0,0,mats.machine);
  box(caliperSlider,0.28,0.15,0.035,-0.27,0,0.17,mats.rubber);
  // Knurled thumbwheel and edge-etched ruler marks make the instrument
  // read as a physical tool, not a generic orange UI rectangle.
  const thumb=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.09,20),mats.amber);
  thumb.rotation.z=Math.PI/2;
  thumb.position.set(-0.50,0.09,0.12);
  thumb.castShadow=true;
  caliperSlider.add(thumb);
  for(let i=0;i<=35;i++){
    const y=0.12+i*0.065;
    box(caliper, i%5===0?0.065:0.034,0.011,0.009,-0.16,y,0.079,
      i%5===0?mats.machine:mats.steel);
  }
  caliper.add(caliperSlider);
  scene.add(caliper);

  // Outside micrometer occupies a close-up working position at web height.
  const micro = new THREE.Group();
  micro.position.set(0.18,1.85,1.30);
  const micFrame = new THREE.Mesh(new THREE.TorusGeometry(0.59,0.12,12,52,Math.PI*1.5),mats.machine);
  micFrame.rotation.z = Math.PI/4;
  micFrame.position.x=0.24;
  micro.add(micFrame);
  box(micro,0.16,0.20,0.21,-0.30,-0.08,0,mats.polished);
  box(micro,0.52,0.25,0.30,0.74,-0.08,0,mats.polished);
  const micSlider = new THREE.Group();
  box(micSlider,0.25,0.17,0.21,0,-0.08,0,mats.polished);
  box(micSlider,0.23,0.27,0.28,0.22,0,0,mats.amber);
  micro.add(micSlider);
  scene.add(micro);

  // Fine orange measurement indicator in front of the part.
  const dimensionGroup = new THREE.Group();
  scene.add(dimensionGroup);
  function clearDimensions() {
    for (const child of [...dimensionGroup.children]) {
      dimensionGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  }
  function line(a,b) {
    const points=[new THREE.Vector3(...a),new THREE.Vector3(...b)];
    const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({color:0xffb258,linewidth:2,depthTest:false}));
    mesh.renderOrder=3;
    dimensionGroup.add(mesh);
  }
  function drawDimensions(id) {
    clearDimensions();
    if(id==="height"){
      const x=-1.02,z=1.15;line([x,0.94,z],[x,2.90,z]);
      line([x-0.12,0.94,z],[x+0.12,0.94,z]);
      line([x-0.12,2.90,z],[x+0.12,2.90,z]);
    } else if(id==="flange"){
      const y=3.05,z=1.14;line([-0.86,y,z],[0.86,y,z]);
      line([-0.86,y-0.12,z],[-0.86,y+0.12,z]);
      line([0.86,y-0.12,z],[0.86,y+0.12,z]);
    } else {
      const y=1.94,z=1.12;line([-0.12,y,z],[0.12,y,z]);
      line([-0.12,y-0.12,z],[-0.12,y+0.12,z]);
      line([0.12,y-0.12,z],[0.12,y+0.12,z]);
    }
    renderNeeded=true;
  }

  function setFeature(id) {
    if(id==="height"){
      caliper.visible=state.tool==="caliper";
      caliper.position.set(-0.33,0.94,1.58);
      caliper.rotation.z=0;
    } else if(id==="flange"){
      caliper.visible=state.tool==="caliper";
      caliper.position.set(-0.45,3.11,1.58);
      caliper.rotation.z=-Math.PI/2;
    } else {
      caliper.visible=false;
    }
    micro.visible=state.tool==="micrometer";
    drawDimensions(id);
    setOpeningVisual(state.opening);
    updateCamera();
  }

  function setTool(tool) {
    caliper.visible = tool==="caliper";
    micro.visible = tool==="micrometer";
    if(tool==="caliper"){
      caliper.position.set(state.feature.id==="height"?-0.33:-0.45,
        state.feature.id==="height"?0.94:3.11,1.58);
      caliper.rotation.z=state.feature.id==="height"?0:-Math.PI/2;
    }
    renderNeeded=true;
    updateGrip();
  }

  function setOpeningVisual(mm) {
    if (state.tool==="caliper") {
      const ratio=mm/Math.max(1,state.feature.nominal);
      const worldTravel=state.feature.id==="height"?1.96:1.72;
      caliperSlider.position.y=Math.min(2.30,Math.max(0,ratio*worldTravel));
    } else {
      micSlider.position.x=Math.min(0.40,Math.max(0,mm/Math.max(1,state.feature.nominal)*0.28));
    }
    renderNeeded=true;
    updateGrip();
  }

  function updateGrip() {
    if(canvas.clientHeight<2||canvas.clientWidth<2) return;
    const group=state.tool==="caliper"?caliperSlider:micSlider;
    group.updateWorldMatrix(true,false);
    const marker=state.tool==="caliper"
      ?new THREE.Vector3(-0.49,0.08,0.22)
      :new THREE.Vector3(0.26,0.04,0.28);
    const point=group.localToWorld(marker).project(camera);
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y)) return;
    const x=THREE.MathUtils.clamp((point.x+1)*width/2,27,width-27);
    const y=THREE.MathUtils.clamp((1-point.y)*height/2,120,height-130);
    const grip=$("jawGrip");
    grip.style.left=x+"px";
    grip.style.top=y+"px";
    $("contactGuide").style.left=THREE.MathUtils.clamp(x,70,width-70)+"px";
    $("contactGuide").style.top=(y-43)+"px";
  }

  // Tap the part to select its feature; all 3 features are also available
  // as large accessible buttons immediately under the viewport.
  const raycaster=new THREE.Raycaster();
  const ndc=new THREE.Vector2();
  function tapObject(clientX,clientY){
    const rect=canvas.getBoundingClientRect();
    ndc.set(((clientX-rect.left)/rect.width)*2-1,1-((clientY-rect.top)/rect.height)*2);
    raycaster.setFromCamera(ndc,camera);
    const hit=raycaster.intersectObject(beam,false)[0];
    if (!hit) return;
    const local=beam.worldToLocal(hit.point.clone());
    if(local.y>1.72) selectFeature("flange");
    else if(Math.abs(local.x)<0.17 && local.y>0.25) selectFeature("web");
    else selectFeature("height");
  }

  function getGesture(){
    const pts=[...pointers.values()];
    if(pts.length<2) return null;
    const a=pts[0],b=pts[1];
    return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(6,Math.hypot(a.x-b.x,a.y-b.y))};
  }
  canvas.addEventListener("pointerdown",event=>{
    if(event.pointerType==="mouse"&&event.button!==0) return;
    event.preventDefault();
    try{canvas.setPointerCapture(event.pointerId);}catch{ /* test synthetic input */ }
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    tap=pointers.size===1?{id:event.pointerId,x:event.clientX,y:event.clientY,moved:false}:null;
    lastGesture=getGesture();
  });
  canvas.addEventListener("pointermove",event=>{
    const prev=pointers.get(event.pointerId);
    if(!prev) return;
    event.preventDefault();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const two=getGesture();
    if(two&&lastGesture) {
      pan(two.x-lastGesture.x,two.y-lastGesture.y);
      spherical.radius*=lastGesture.distance/two.distance;
      updateCamera();
    } else if(pointers.size===1) {
      const dx=event.clientX-prev.x,dy=event.clientY-prev.y;
      if(tap&&Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>9)tap.moved=true;
      if(panMode||event.shiftKey)pan(dx,dy);
      else{spherical.theta-=dx*0.007;spherical.phi-=dy*0.007;updateCamera();}
    }
    lastGesture=two;
  });
  function pointerEnd(event){
    if(tap&&tap.id===event.pointerId&&!tap.moved&&
      Math.hypot(event.clientX-tap.x,event.clientY-tap.y)<9)tapObject(event.clientX,event.clientY);
    tap=null;
    pointers.delete(event.pointerId);
    lastGesture=getGesture();
  }
  canvas.addEventListener("pointerup",pointerEnd);
  canvas.addEventListener("pointercancel",pointerEnd);
  canvas.addEventListener("wheel",event=>{
    event.preventDefault();
    spherical.radius*=Math.exp(event.deltaY*0.001);
    updateCamera();
  },{passive:false});

  const grip=$("jawGrip");
  grip.addEventListener("pointerdown",event=>{
    if(event.pointerType==="mouse"&&event.button!==0)return;
    event.preventDefault();event.stopPropagation();
    gripPointer={id:event.pointerId,x:event.clientX,y:event.clientY,opening:state.opening,moved:false};
    try{grip.setPointerCapture(event.pointerId);}catch{/* synthetic pointer */}
    grip.classList.add("dragging");
    state.firstInteraction=true;
    $("contactGuide").hidden=true;
    if(!state.zeroed[state.tool])feedback("Close jaws and zero the tool first, then slide to the part.","warning");
  });
  grip.addEventListener("pointermove",event=>{
    if(!gripPointer||gripPointer.id!==event.pointerId)return;
    event.preventDefault();
    const vertical=state.tool==="caliper"&&state.feature.id==="height";
    const delta=vertical?gripPointer.y-event.clientY:event.clientX-gripPointer.x;
    const track=Math.max(105,Math.min(215,(vertical?canvas.clientHeight:canvas.clientWidth)*0.52));
    if(Math.abs(delta)>3)gripPointer.moved=true;
    setOpening(gripPointer.opening+delta*state.feature.maxOpening/track);
  });
  function jawRelease(event){
    if(!gripPointer||gripPointer.id!==event.pointerId)return;
    const moved=gripPointer.moved;
    gripPointer=null;
    grip.classList.remove("dragging");
    if(moved&&state.zeroed[state.tool]&&state.tool===state.feature.tool){
      if(canSeat(state.feature,state.tool,true,state.opening))seatJaws();
      else feedback("Slide toward "+state.feature.nominal+" mm, then release near the part.");
    }
  }
  grip.addEventListener("pointerup",jawRelease);
  grip.addEventListener("pointercancel",jawRelease);
  grip.addEventListener("keydown",event=>{
    if(!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key))return;
    event.preventDefault();
    const direction=["ArrowUp","ArrowRight"].includes(event.key)?1:-1;
    setOpening(state.opening+direction*(event.shiftKey?1:0.1));
  });

  const resizeObserver=new ResizeObserver(()=>resize());
  resizeObserver.observe(canvas);
  let frameId=0;
  let lastFrame=0;
  let running=true;
  function resize(){
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if(width<2||height<2)return;
    const pixelW=Math.round(width*renderer.getPixelRatio());
    const pixelH=Math.round(height*renderer.getPixelRatio());
    if(canvas.width!==pixelW||canvas.height!==pixelH)renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
    updateCamera();
  }
  function render(timestamp){
    if(!running)return;
    frameId=requestAnimationFrame(render);
    if(document.hidden||timestamp-lastFrame<33)return;
    lastFrame=timestamp;
    if(renderNeeded){
      renderer.render(scene,camera);
      renderNeeded=false;
      updateGrip();
    }
  }
  resetView();
  resize();
  frameId=requestAnimationFrame(render);
  window.addEventListener("pagehide",()=>{
    running=false;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    renderer.dispose();
  },{once:true});
  return{
    resize,setFeature,setTool,setOpening:setOpeningVisual,
    zoom(factor){spherical.radius*=factor;updateCamera();},
    resetView,updateGrip,
    setPan(enabled){panMode=enabled;},
    debug(){return{
      radius:spherical.radius,theta:spherical.theta,phi:spherical.phi,
      target:target.toArray(),opening:state.opening,panMode,
      feature:state.feature.id,tool:state.tool
    };}
  };
}

function connectControls(){
  $("goBench").addEventListener("click",()=>showSheet(null));
  $("openWorkOrder").addEventListener("click",()=>showSheet("workOrder"));
  $("closeWorkOrder").addEventListener("click",()=>showSheet(null));
  $("openDrawing").addEventListener("click",()=>showSheet("drawing"));
  $("closeDrawing").addEventListener("click",()=>showSheet(null));
  $("closeDrawingBottom").addEventListener("click",()=>showSheet(null));
  $("openReport").addEventListener("click",()=>showSheet("report"));
  $("closeReport").addEventListener("click",()=>showSheet(null));
  $("resumeBench").addEventListener("click",()=>showSheet(null));
  $("sheetBackdrop").addEventListener("click",()=>showSheet(null));
  $("backToBench").addEventListener("click",()=>{
    $("completionOverlay").hidden=true;
    showSheet("report");
  });
  for(const button of $$("[data-feature]")){
    button.addEventListener("click",()=>selectFeature(button.dataset.feature));
  }
  $("toolPicker").addEventListener("click",switchTool);
  $("cameraToggle").addEventListener("click",()=>{
    const open=$("sceneCameraTools").hidden;
    $("sceneCameraTools").hidden=!open;
    $("cameraToggle").setAttribute("aria-expanded",String(open));
    $("cameraToggle").setAttribute("aria-label",open?"Hide camera controls":"Show camera controls");
  });
  $("fineToggle").addEventListener("click",()=>{
    const open=$("fineControls").hidden;
    $("fineControls").hidden=!open;
    $("fineToggle").setAttribute("aria-expanded",String(open));
    $("fineToggle").setAttribute("aria-label",open?"Hide precision jaw adjustment":"Show precision jaw adjustment");
  });
  $("zeroTool").addEventListener("click",zeroTool);
  $("seatJaws").addEventListener("click",seatJaws);
  $("transferReading").addEventListener("click",recordReading);
  $("jawOpening").addEventListener("input",event=>setOpening(Number(event.target.value)));
  $("jawMinus").addEventListener("click",()=>setOpening(state.opening-0.1));
  $("jawPlus").addEventListener("click",()=>setOpening(state.opening+0.1));
  $("zoomIn").addEventListener("click",()=>state.scene?.zoom(0.79));
  $("zoomOut").addEventListener("click",()=>state.scene?.zoom(1.25));
  $("resetView").addEventListener("click",()=>state.scene?.resetView());
  $("panMode").addEventListener("click",()=>{
    const enabled=$("panMode").getAttribute("aria-pressed")!=="true";
    $("panMode").setAttribute("aria-pressed",String(enabled));
    state.scene?.setPan(enabled);
    $("gestureHint").textContent=enabled?"PAN MODE · Drag to move the view · Pinch to zoom":
      "One finger: rotate · Pinch: zoom · Two fingers: pan";
  });
  $("inspectionForm").addEventListener("submit",submitReport);
  for(const feature of FEATURES){
    $("record-"+feature.id).addEventListener("input",()=>{
      $("record-"+feature.id).classList.remove("invalid");
      $("error-"+feature.id).textContent="";
    });
  }
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&state.sheet)showSheet(null);
  });
}

function main(){
  connectControls();
  updateCareerHeader();
  renderControlState();
  try{
    state.scene=createWorkshop($("workbench3d"));
    state.scene.setFeature(state.feature.id);
    state.scene.setTool(state.tool);
    state.scene.setOpening(state.opening);
    if(new URLSearchParams(location.search).has("debug")){
      window.redlineCareerDebug=()=>state.scene?.debug();
    }
  }catch(error){
    console.warn("REDLINE 3D metrology scene failed",error);
    $("sceneError").hidden=false;
  }
  showSheet("workOrder");
}
main();
