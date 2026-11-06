import * as THREE from "three";
import {
  FEATURES, canSeat, assessInspection, readCareer, careerRank, completeWorkOrder
} from "./inspection.js";

const byId = id => document.getElementById(id);
const query = selector => [...document.querySelectorAll(selector)];
const store = (() => { try { return window.localStorage; } catch { return null; } })();

const state = {
  feature: FEATURES[0],
  tool: "caliper",
  zeroed: { caliper: false, micrometer: false },
  opening: 0,
  reading: null,
  captured: new Set(),
  pane: "brief",
  scene: null
};

function updateCareerHeader() {
  const progress = readCareer(store);
  byId("xpCount").textContent = progress.xp;
  byId("rankLabel").textContent = careerRank(progress);
  if (progress.completed.includes("WO-002")) {
    byId("mentorText").textContent =
      '"Promotion earned. You have completed the incoming inspection and proof-load test. Keep the measuring instruments sharp, and keep asking good questions."';
  } else if (progress.completed.includes("WO-001")) {
    byId("mentorText").textContent =
      '"Good catch on that web thickness. Your inspection report is on file. Head to the load-test rig when you are ready, or repeat the inspection for practice."';
  }
}

function showPane(pane) {
  state.pane = pane;
  for (const panel of query("[data-panel]")) {
    panel.classList.toggle("mobile-active", panel.dataset.panel === pane);
  }
  for (const button of query("[data-pane]")) {
    const selected = button.dataset.pane === pane;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  if (pane === "bench") state.scene?.resize();
}

function message(text, type = "") {
  byId("measureStatus").textContent = text;
  byId("measureStatus").className = "status " + type;
}

function setOpening(next) {
  const max = state.feature.maxOpening;
  state.opening = Math.min(max, Math.max(0, Math.round(next * 100) / 100));
  state.reading = null;
  byId("transferReading").disabled = true;
  syncMeter();
}

function setFeature(id) {
  const feature = FEATURES.find(item => item.id === id);
  if (!feature) return;
  state.feature = feature;
  for (const button of query("[data-feature]")) {
    const selected = button.dataset.feature === id;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (state.captured.has(button.dataset.feature)) button.dataset.recorded = "true";
  }
  state.opening = 0;
  state.reading = null;
  byId("transferReading").disabled = true;
  byId("toolHint").textContent = feature.tool === "caliper" ? "Digital caliper required" : "Outside micrometer required";
  byId("jawOpening").max = feature.maxOpening;
  syncMeter();
  state.scene?.setFeature(id);
  message(feature.instruction);
}

function setTool(tool) {
  if (tool !== "caliper" && tool !== "micrometer") return;
  state.tool = tool;
  state.opening = 0;
  state.reading = null;
  byId("transferReading").disabled = true;
  for (const button of query("[data-tool]")) {
    const selected = button.dataset.tool === tool;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  byId("meterName").textContent = tool === "caliper" ? "DIGITAL CALIPER" : "OUTSIDE MICROMETER";
  syncMeter();
  state.scene?.setTool(tool);
  message(state.zeroed[tool] ? "Instrument ready. Position the jaws near the indicated dimension." :
    "Close the jaws to 0.00 mm, then press SET ZERO.");
}

function syncMeter() {
  const calibrated = state.zeroed[state.tool];
  byId("jawOpening").value = state.opening.toFixed(2);
  byId("openingValue").textContent = state.opening.toFixed(2) + " mm";
  byId("meterZero").textContent = calibrated ? "ZERO SET ✓" : "ZERO REQUIRED";
  byId("meterZero").style.color = calibrated ? "#a1e6b6" : "";
  byId("meterReading").textContent = state.reading === null
    ? calibrated ? state.opening.toFixed(2) : "--.--"
    : state.reading.toFixed(2);
  byId("meterState").textContent = state.reading === null ? "JAW OPENING" : "CONTACT ✓";
  byId("caliperStatus").textContent = state.zeroed.caliper ? "Zero set ✓" : "Not zeroed";
  byId("micrometerStatus").textContent = state.zeroed.micrometer ? "Zero set ✓" : "Not zeroed";
  state.scene?.setOpening(state.opening, state.feature.maxOpening);
}

function zeroCurrentTool() {
  if (state.opening > 0.2) {
    message("Close the jaws completely before setting zero. Use the slider or −0.1 button.", "warning");
    return;
  }
  state.zeroed[state.tool] = true;
  state.opening = 0;
  syncMeter();
  message((state.tool === "caliper" ? "Caliper" : "Micrometer") + " zero verified. Select a feature and position the jaws.", "good");
}

function seatJaws() {
  const feature = state.feature;
  if (feature.tool !== state.tool) {
    message("Wrong instrument. " + (feature.tool === "caliper"
      ? "Use the digital caliper for this dimension." : "Use the micrometer for web thickness."), "warning");
    return;
  }
  if (!state.zeroed[state.tool]) {
    message("Set the instrument zero before taking a measurement.", "warning");
    return;
  }
  if (!canSeat(feature, state.tool, true, state.opening)) {
    message("The jaws aren't touching yet. Move near the drawing's nominal dimension, then press SEAT JAWS.", "warning");
    return;
  }
  state.opening = feature.actual;
  state.reading = feature.actual;
  byId("transferReading").disabled = false;
  syncMeter();
  message("Contact established. Read the display, then record the measurement.", "good");
}

function transferReading() {
  if (state.reading === null) {
    message("Seat the jaws against the part first.", "warning");
    return;
  }
  const featureId = state.feature.id;
  byId("record-" + featureId).value = state.reading.toFixed(2);
  byId("record-" + featureId).classList.remove("invalid");
  byId("error-" + featureId).textContent = "";
  state.captured.add(featureId);
  const button = query("[data-feature]").find(item => item.dataset.feature === featureId);
  button.dataset.recorded = "true";
  button.querySelector("small").textContent = "✓ RECORDED";
  const remaining = FEATURES.find(feature => !state.captured.has(feature.id));
  if (remaining) {
    message("Reading added to inspection sheet. Next: " + remaining.label + ".", "good");
    setFeature(remaining.id);
  } else {
    message("All measurements recorded. Compare each result to the print, then sign off.", "good");
    showPane("report");
  }
}

function clearErrors() {
  for (const feature of FEATURES) {
    byId("error-" + feature.id).textContent = "";
    byId("record-" + feature.id).classList.remove("invalid");
  }
  byId("error-disposition").textContent = "";
}

function submitInspection(event) {
  event.preventDefault();
  clearErrors();
  const readings = Object.fromEntries(FEATURES.map(feature => [
    feature.id, byId("record-" + feature.id).value
  ]));
  const disposition = document.querySelector('input[name="disposition"]:checked')?.value;
  const result = assessInspection(readings, disposition);
  for (const feature of FEATURES) {
    if (!state.captured.has(feature.id)) {
      result.errors[feature.id] = "Measure with the instrument and record this value first.";
    }
  }
  if (Object.keys(result.errors).length) {
    for (const [key, error] of Object.entries(result.errors)) {
      byId("error-" + key).textContent = error;
      if (key !== "disposition") byId("record-" + key).classList.add("invalid");
    }
    if (Object.keys(result.errors).some(key => key !== "disposition")) {
      const first = FEATURES.find(feature => !state.captured.has(feature.id));
      if (first) {
        byId("error-disposition").textContent = "First finish the hands-on measurements at the workbench.";
      }
    }
    return;
  }
  const award = completeWorkOrder(store, "WO-001");
  updateCareerHeader();
  byId("rewardXP").textContent = award.newlyCompleted ? "+100" : "Earned ✓";
  byId("completionMessage").textContent = "You caught an out-of-tolerance web thickness: " +
    FEATURES.find(feature => feature.id === "web").actual.toFixed(2) +
    " mm measured against a maximum of 8.20 mm. The bad part never reaches assembly. Mike signed off your report.";
  byId("completionOverlay").hidden = false;
  byId("backToBench").focus();
}

function createWorkshop(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x203442);
  scene.fog = new THREE.Fog(0x203442, 9, 22);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
  camera.position.set(4.6, 3.25, 7.6);
  camera.lookAt(0, 1.35, 0);

  const ambient = new THREE.HemisphereLight(0xe4f1ff, 0x30323a, 2.1);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffe3c2, 3.4);
  key.position.set(-3, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.normalBias = 0.035;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x74b7d4, 1.6);
  fill.position.set(5, 3, -4);
  scene.add(fill);

  const steel = new THREE.MeshStandardMaterial({ color: 0x94a5ad, roughness: 0.34, metalness: 0.83 });
  const blackSteel = new THREE.MeshStandardMaterial({ color: 0x293b49, roughness: 0.48, metalness: 0.62 });
  const darkRubber = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.86, metalness: 0.02 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x796f5a, roughness: 0.92 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe9b46d, roughness: 0.38, metalness: 0.4 });
  const highlighter = new THREE.MeshStandardMaterial({ color: 0xf9d097, roughness: 0.5, emissive: 0x664010, emissiveIntensity: 0.23 });

  function box(parent, w, h, d, x, y, z, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x333a40, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Real-scale-inspired fabricated workbench, clamps and a wall tool board.
  box(scene, 5.8, 0.22, 3.0, 0, 0.67, 0, wood);
  box(scene, 5.9, 0.10, 3.05, 0, 0.51, 0, blackSteel);
  for (const x of [-2.55, 2.55]) for (const z of [-1.18, 1.18]) {
    box(scene, 0.17, 0.55, 0.17, x, 0.27, z, blackSteel);
  }
  box(scene, 7.5, 4.0, 0.12, 0, 2.25, -3.5,
    new THREE.MeshStandardMaterial({ color: 0x304553, roughness: 0.94 }), false);
  box(scene, 4.4, 1.7, 0.09, -0.2, 2.28, -3.38,
    new THREE.MeshStandardMaterial({ color: 0x3c525b, roughness: 0.85 }), false);
  for (let x = -2.15; x <= 1.8; x += 0.25) {
    for (let y = 1.58; y <= 3.0; y += 0.25) {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.011, 6), blackSteel);
      dot.rotation.x = Math.PI / 2;
      dot.position.set(x, y, -3.305);
      scene.add(dot);
    }
  }
  // A few tool silhouettes on the pegboard set a workshop atmosphere.
  box(scene, 0.12, 1.02, 0.10, -1.7, 2.25, -3.23, steel);
  box(scene, 0.45, 0.10, 0.14, -1.7, 2.78, -3.22, blackSteel);
  box(scene, 0.45, 0.12, 0.12, -1.7, 1.76, -3.22, blackSteel);
  box(scene, 0.11, 0.7, 0.12, 1.55, 2.3, -3.22, yellow);
  box(scene, 0.5, 0.10, 0.1, 1.55, 2.66, -3.22, steel);

  // A short I-section specimen with a front face visible to touch selection.
  const specimen = new THREE.Group();
  specimen.position.set(-0.1, 0.76, -0.24);
  const upper = box(specimen, 2.55, 0.16, 1.65, 0, 1.53, 0, steel);
  const lower = box(specimen, 2.55, 0.16, 1.65, 0, 0.08, 0, steel);
  const web = box(specimen, 0.13, 1.35, 1.65, 0, 0.8, 0, steel);
  scene.add(specimen);
  for (const item of [upper, lower]) item.userData.feature = "flange";
  web.userData.feature = "web";
  box(scene, 0.9, 0.23, 0.45, -1.6, 0.9, -0.7, blackSteel);
  box(scene, 0.9, 0.23, 0.45, 1.6, 0.9, -0.7, blackSteel);

  // Digital caliper: fixed jaw, movable carriage and long scale.
  const caliper = new THREE.Group();
  caliper.position.set(0.1, 2.35, 1.15);
  box(caliper, 3.1, 0.11, 0.13, 0, 0, 0, steel);
  box(caliper, 0.19, 0.54, 0.17, -1.34, -0.25, 0, steel);
  box(caliper, 0.44, 0.39, 0.24, -0.45, 0.09, 0.02, darkRubber);
  const caliperSlide = new THREE.Group();
  box(caliperSlide, 0.21, 0.55, 0.17, 0, -0.24, 0, steel);
  box(caliperSlide, 0.47, 0.34, 0.24, 0, 0.12, 0, blackSteel);
  box(caliperSlide, 0.30, 0.19, 0.01, 0, 0.15, 0.123, highlighter, false);
  caliper.add(caliperSlide);
  scene.add(caliper);

  // 3D outside micrometer: C frame with anvil and moving spindle.
  const micro = new THREE.Group();
  micro.position.set(0, 2.25, 1.27);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.12, 10, 48, Math.PI * 1.5), blackSteel);
  arc.rotation.z = Math.PI / 4;
  micro.add(arc);
  box(micro, 0.25, 0.22, 0.26, -0.63, -0.08, 0, steel);
  box(micro, 0.56, 0.26, 0.28, 0.72, -0.08, 0, yellow);
  const microSlide = box(micro, 0.48, 0.15, 0.17, 0.18, -0.08, 0, steel);
  scene.add(micro);

  // The featured part glows subtly; this is selection feedback, not stress analysis.
  const targets = [upper, lower, web];
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let lastDown = null;
  canvas.addEventListener("pointerdown", event => {
    lastDown = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", event => {
    if (!lastDown || Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) > 12) return;
    lastDown = null;
    const rect = canvas.getBoundingClientRect();
    mouse.set((event.clientX - rect.left) * 2 / rect.width - 1,
      -(event.clientY - rect.top) * 2 / rect.height + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit?.object?.userData?.feature) setFeature(hit.object.userData.feature);
  });
  canvas.addEventListener("pointercancel", () => { lastDown = null; });

  function setFeatureVisual(featureId) {
    upper.material = featureId === "height" || featureId === "flange" ? highlighter : steel;
    lower.material = featureId === "height" ? highlighter : steel;
    web.material = featureId === "web" || featureId === "height" ? highlighter : steel;
    caliper.rotation.z = featureId === "height" ? Math.PI / 2 : 0;
  }

  function setOpeningVisual(value, max) {
    caliperSlide.position.x = -1.22 + (value / max) * 2.46;
    microSlide.position.x = 0.39 - (value / max) * 0.5;
  }

  function setToolVisual(tool) {
    caliper.visible = tool === "caliper";
    micro.visible = tool === "micrometer";
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(width < 500 ? 4.9 : 4.6, 3.25, width < 500 ? 9.2 : 7.6);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let lastFrame = 0;
  let running = true;
  function draw(time) {
    if (!running) return;
    requestAnimationFrame(draw);
    if (time - lastFrame < 34 || document.hidden || canvas.clientWidth < 2) return;
    lastFrame = time;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(draw);
  window.addEventListener("pagehide", () => {
    running = false;
    observer.disconnect();
    renderer.dispose();
  }, { once: true });

  return { resize, setFeature: setFeatureVisual, setTool: setToolVisual, setOpening: setOpeningVisual };
}

function connect() {
  for (const button of query("[data-pane]")) {
    button.addEventListener("click", () => showPane(button.dataset.pane));
  }
  byId("goBench").addEventListener("click", () => showPane("bench"));
  for (const button of query("[data-feature]")) {
    button.addEventListener("click", () => setFeature(button.dataset.feature));
  }
  for (const button of query("[data-tool]")) {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  }
  byId("jawOpening").addEventListener("input", event => setOpening(Number(event.target.value)));
  byId("jawMinus").addEventListener("click", () => setOpening(state.opening - 0.1));
  byId("jawPlus").addEventListener("click", () => setOpening(state.opening + 0.1));
  byId("zeroTool").addEventListener("click", zeroCurrentTool);
  byId("seatJaws").addEventListener("click", seatJaws);
  byId("transferReading").addEventListener("click", transferReading);
  byId("inspectionForm").addEventListener("submit", submitInspection);
  byId("backToBench").addEventListener("click", () => {
    byId("completionOverlay").hidden = true;
    showPane("report");
  });
  for (const feature of FEATURES) {
    byId("record-" + feature.id).addEventListener("input", () => {
      byId("record-" + feature.id).classList.remove("invalid");
      byId("error-" + feature.id).textContent = "";
    });
  }
}

function main() {
  connect();
  updateCareerHeader();
  showPane("brief");
  try {
    state.scene = createWorkshop(byId("workbench3d"));
    state.scene.setFeature(state.feature.id);
    state.scene.setTool(state.tool);
  } catch (error) {
    console.warn("REDLINE career workshop 3D unavailable", error);
    byId("sceneError").hidden = false;
  }
  syncMeter();
}

main();
