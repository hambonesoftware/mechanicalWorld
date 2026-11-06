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
  scene: null,
  hasDraggedJaw: false
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
  if (pane === "bench") {
    state.scene?.resize();
    state.scene?.updateGrip();
  }
}

function message(text, type = "") {
  byId("measureStatus").textContent = text;
  byId("measureStatus").className = "status " + type;
}

function updateGuide() {
  const feature = state.feature;
  const toolName = feature.tool === "caliper" ? "caliper" : "micrometer";
  const toolIsCorrect = state.tool === feature.tool;
  const zero = state.zeroed[state.tool];
  let step, title, detail;
  if (!toolIsCorrect) {
    step = "STEP 1 OF 3";
    title = "Pick up the " + toolName;
    detail = "Choose the correct measuring tool for " + feature.label.toLowerCase() + ".";
  } else if (!zero) {
    step = "STEP 1 OF 3";
    title = "Zero the " + toolName;
    detail = "Close the jaws to 0.00 mm and tap Set zero. The orange DRAG JAW handle is on the tool above.";
  } else if (state.reading === null) {
    step = "STEP 2 OF 3";
    title = "Drag the orange jaw";
    detail = "Place your finger on DRAG JAW above, slide until the opening is near " + feature.nominal + " mm, then release. You can also fine-adjust below.";
  } else {
    step = "STEP 3 OF 3";
    title = "Record the measurement";
    detail = "Contact confirmed at " + state.reading.toFixed(2) + " mm. Tap Record reading, then measure the next dimension.";
  }
  byId("guideStep").textContent = step;
  byId("guideTitle").textContent = title;
  byId("guideDetail").textContent = detail;
  byId("sceneCorner").textContent = state.reading !== null
    ? "CONTACT ✓ · Record the measured value below"
    : !toolIsCorrect ? "Select the correct tool below"
      : !zero ? "Close jaws and press Set zero"
        : "Put your finger on DRAG JAW and slide it";
}

function setOpening(next) {
  const max = state.feature.maxOpening;
  state.opening = Math.min(max, Math.max(0, Math.round(next * 100) / 100));
  state.reading = null;
  byId("transferReading").disabled = true;
  syncMeter();
  updateGuide();
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
  updateGuide();
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
  message(state.zeroed[tool] ? "Instrument ready. Drag the orange jaw grip to the specified dimension." :
    "Close the jaws to 0.00 mm, then press SET ZERO.");
  updateGuide();
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
  byId("jawGrip").setAttribute("aria-valuemax", String(state.feature.maxOpening));
  byId("jawGrip").setAttribute("aria-valuenow", String(state.opening));
  byId("jawGrip").setAttribute("aria-valuetext", state.opening.toFixed(2) + " millimetres");
  byId("jawGrip").setAttribute("aria-label", "Drag this " + state.tool + " jaw handle to open or close the jaws");
  byId("gripSymbol").textContent = state.feature.id === "height" && state.tool === "caliper" ? "↕" : "↔";
}

function zeroCurrentTool() {
  if (state.opening > 0.2) {
    message("Close the jaws completely before setting zero. Use the slider or −0.1 button.", "warning");
    return;
  }
  state.zeroed[state.tool] = true;
  state.opening = 0;
  syncMeter();
  message((state.tool === "caliper" ? "Caliper" : "Micrometer") + " zero verified. Drag the orange jaw handle in the 3D view.", "good");
  updateGuide();
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
  message("Contact ✓ The jaws are seated. Tap RECORD READING to save the measurement.", "good");
  updateGuide();
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
  renderer.toneMappingExposure = 1.46;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8c9eaa);
  scene.fog = new THREE.Fog(0x8c9eaa, 13, 27);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  const target = new THREE.Vector3(-0.05, 1.48, 0);
  const initialOffset = new THREE.Vector3(3.7, 2.2, 6.1);
  const spherical = new THREE.Spherical().setFromVector3(initialOffset);
  let panMode = false;
  function updateCamera() {
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, 2.8, 13);
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.42, 1.7);
    target.x = THREE.MathUtils.clamp(target.x, -2.5, 2.5);
    target.y = THREE.MathUtils.clamp(target.y, 0.7, 2.8);
    target.z = THREE.MathUtils.clamp(target.z, -2.3, 2.3);
    camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  function panCamera(dx, dy) {
    const speed = spherical.radius / Math.max(170, canvas.clientHeight) * 0.82;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    target.addScaledVector(right, -dx * speed);
    target.addScaledVector(up, dy * speed);
    updateCamera();
  }
  function resetCamera() {
    target.set(-0.05, 1.48, 0);
    spherical.setFromVector3(initialOffset);
    updateCamera();
  }
  updateCamera();

  const ambient = new THREE.HemisphereLight(0xffffff, 0x728394, 3.3);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff7e9, 4.2);
  key.position.set(-3, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.normalBias = 0.035;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd4eafa, 2.4);
  fill.position.set(5, 3, -4);
  scene.add(fill);

  const steel = new THREE.MeshStandardMaterial({ color: 0xb3c6cf, roughness: 0.44, metalness: 0.45 });
  const blackSteel = new THREE.MeshStandardMaterial({ color: 0x425967, roughness: 0.53, metalness: 0.38 });
  const darkRubber = new THREE.MeshStandardMaterial({ color: 0x20262b, roughness: 0.86, metalness: 0.02 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xb0a18a, roughness: 0.87 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffc56d, roughness: 0.4, metalness: 0.28 });
  const highlighter = new THREE.MeshStandardMaterial({ color: 0xffd68b, roughness: 0.55, emissive: 0xb37a35, emissiveIntensity: 0.24 });

  function box(parent, w, h, d, x, y, z, material, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x879299, roughness: 0.92 }));
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
    new THREE.MeshStandardMaterial({ color: 0xa3b0b7, roughness: 0.94 }), false);
  box(scene, 4.4, 1.7, 0.09, -0.2, 2.28, -3.38,
    new THREE.MeshStandardMaterial({ color: 0x778d95, roughness: 0.85 }), false);
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
  caliper.position.set(0.15, 2.39, 1.22);
  box(caliper, 3.1, 0.11, 0.13, 0, 0, 0, steel);
  box(caliper, 0.19, 0.54, 0.17, -1.34, -0.25, 0, steel);
  box(caliper, 0.44, 0.39, 0.24, -0.45, 0.09, 0.02, darkRubber);
  const caliperSlide = new THREE.Group();
  box(caliperSlide, 0.21, 0.55, 0.17, 0, -0.24, 0, steel);
  box(caliperSlide, 0.50, 0.34, 0.27, 0, 0.12, 0, yellow);
  box(caliperSlide, 0.33, 0.20, 0.04, 0, 0.15, 0.15, darkRubber, false);
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

  // Pointer gestures: one finger rotates (or pans in PAN mode), two fingers
  // pinch to zoom and translate the target, mouse wheel zooms, Shift-drag pans.
  // Taps still raycast to select a feature. The jaw handle uses a separate
  // accessible DOM hit area and its own captured pointer stream.
  const targets = [upper, lower, web];
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const pointers = new Map();
  let lastGesture = null;
  let tapStart = null;
  function getGesture() {
    const items = [...pointers.values()];
    if (items.length < 2) return null;
    const a = items[0], b = items[1];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      distance: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y))
    };
  }
  function tapFeature(x, y) {
    const rect = canvas.getBoundingClientRect();
    mouse.set((x - rect.left) * 2 / rect.width - 1,
      -(y - rect.top) * 2 / rect.height + 1);
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit?.object?.userData?.feature) setFeature(hit.object.userData.feature);
  }
  canvas.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    tapStart = pointers.size === 1 ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false } : null;
    lastGesture = getGesture();
  });
  canvas.addEventListener("pointermove", event => {
    const prev = pointers.get(event.pointerId);
    if (!prev) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = getGesture();
    if (gesture && lastGesture) {
      panCamera(gesture.x - lastGesture.x, gesture.y - lastGesture.y);
      spherical.radius *= lastGesture.distance / gesture.distance;
      updateCamera();
    } else if (pointers.size === 1) {
      const dx = event.clientX - prev.x;
      const dy = event.clientY - prev.y;
      if (tapStart && Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 8) tapStart.moved = true;
      if (panMode || event.shiftKey) {
        panCamera(dx, dy);
      } else {
        spherical.theta -= dx * 0.0075;
        spherical.phi -= dy * 0.0075;
        updateCamera();
      }
    }
    lastGesture = gesture;
    updateGrip();
  });
  function endPointer(event) {
    const started = tapStart;
    if (started && started.id === event.pointerId && !started.moved &&
        Math.hypot(event.clientX - started.x, event.clientY - started.y) < 8) {
      tapFeature(event.clientX, event.clientY);
    }
    pointers.delete(event.pointerId);
    lastGesture = getGesture();
    tapStart = null;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    spherical.radius *= Math.exp(event.deltaY * 0.0012);
    updateCamera();
    updateGrip();
  }, { passive: false });

  const grip = byId("jawGrip");
  let jawPointer = null;
  grip.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    jawPointer = {
      id: event.pointerId,
      x: event.clientX, y: event.clientY, opening: state.opening,
      moved: false
    };
    try { grip.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    grip.classList.add("dragging");
    byId("gestureHint").textContent = "Move the orange jaw to the target opening, then release.";
  });
  grip.addEventListener("pointermove", event => {
    if (!jawPointer || jawPointer.id !== event.pointerId) return;
    event.preventDefault();
    const isVertical = state.feature.id === "height" && state.tool === "caliper";
    const delta = isVertical ? event.clientY - jawPointer.y : event.clientX - jawPointer.x;
    const maxDistance = Math.max(118, Math.min(235,
      (isVertical ? canvas.clientHeight : canvas.clientWidth) * 0.62));
    if (Math.abs(delta) > 3) jawPointer.moved = true;
    setOpening(jawPointer.opening + delta * state.feature.maxOpening / maxDistance);
    updateGrip();
  });
  function finishJaw(event) {
    if (!jawPointer || jawPointer.id !== event.pointerId) return;
    const moved = jawPointer.moved;
    jawPointer = null;
    grip.classList.remove("dragging");
    if (moved) {
      state.hasDraggedJaw = true;
      if (canSeat(state.feature, state.tool, state.zeroed[state.tool], state.opening)) {
        seatJaws();
      } else if (!state.zeroed[state.tool]) {
        message("Great, that moves the jaw. Close it back to zero and tap Set zero first.", "warning");
      } else if (state.tool !== state.feature.tool) {
        message("Switch to the instrument requested by this drawing.", "warning");
      } else {
        message("Keep sliding toward " + state.feature.nominal + " mm, then release near the part.", "warning");
      }
      byId("gestureHint").textContent = "One finger: rotate · Two: pan + pinch · PAN: drag view";
    }
    updateGrip();
  }
  grip.addEventListener("pointerup", finishJaw);
  grip.addEventListener("pointercancel", finishJaw);
  grip.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowDown" &&
        event.key !== "ArrowRight" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const sign = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : -1;
    setOpening(state.opening + sign * (event.shiftKey ? 1 : 0.1));
    updateGrip();
  });

  function updateGrip() {
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return;
    const instrument = state.tool === "caliper" ? caliperSlide : microSlide;
    instrument.updateWorldMatrix(true, false);
    const point = new THREE.Vector3(0, 0.2, 0.30);
    instrument.localToWorld(point);
    point.project(camera);
    const width = canvas.clientWidth, height = canvas.clientHeight;
    const x = THREE.MathUtils.clamp((point.x + 1) * width / 2, 70, width - 70);
    const y = THREE.MathUtils.clamp((1 - point.y) * height / 2, 67, height - 77);
    grip.style.left = x + "px";
    grip.style.top = y + "px";
    grip.classList.toggle("grip-vertical", state.feature.id === "height" && state.tool === "caliper");
    grip.hidden = false;
  }

  function setFeatureVisual(featureId) {
    upper.material = featureId === "height" || featureId === "flange" ? highlighter : steel;
    lower.material = featureId === "height" ? highlighter : steel;
    web.material = featureId === "web" || featureId === "height" ? highlighter : steel;
    caliper.rotation.z = featureId === "height" ? -Math.PI / 2 : 0;
    caliper.position.y = featureId === "height" ? 1.86 : 2.39;
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
    camera.updateProjectionMatrix();
    updateCamera();
    updateGrip();
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
    updateGrip();
  }
  requestAnimationFrame(draw);
  window.addEventListener("pagehide", () => {
    running = false;
    observer.disconnect();
    renderer.dispose();
  }, { once: true });

  return {
    resize, updateGrip, setFeature: setFeatureVisual, setTool: setToolVisual,
    setOpening: setOpeningVisual, zoom(factor) { spherical.radius *= factor; updateCamera(); updateGrip(); },
    resetView() { resetCamera(); updateGrip(); },
    setPan(enabled) { panMode = enabled; },
    getDiagnostics() {
      return { radius: spherical.radius, theta: spherical.theta, phi: spherical.phi,
        target: target.toArray(), opening: state.opening, panMode };
    }
  };
}

function connect() {
  for (const button of query("[data-pane]")) {
    button.addEventListener("click", () => showPane(button.dataset.pane));
  }
  byId("goBench").addEventListener("click", () => showPane("bench"));
  byId("zoomIn").addEventListener("click", () => state.scene?.zoom(0.8));
  byId("zoomOut").addEventListener("click", () => state.scene?.zoom(1.25));
  byId("resetView").addEventListener("click", () => state.scene?.resetView());
  byId("panMode").addEventListener("click", () => {
    const button = byId("panMode");
    const enabled = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(enabled));
    state.scene?.setPan(enabled);
    byId("gestureHint").textContent = enabled
      ? "PAN MODE · Drag one finger to move the view · Pinch to zoom"
      : "One finger: rotate · Two: pan + pinch · PAN: drag view";
  });
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
    if (new URLSearchParams(window.location.search).has("debug")) {
      window.redlineCareerDebug = () => state.scene?.getDiagnostics();
    }
  } catch (error) {
    console.warn("REDLINE career workshop 3D unavailable", error);
    byId("sceneError").hidden = false;
  }
  syncMeter();
  updateGuide();
}

main();
