import { STARTER, CHALLENGES, beamAnalysis, checkChallenge } from "./engineering/beam.js";
import { getBeamSolution } from "./engineering/fem.js";
import { createLaboratory } from "./scene/lab.js";

const $ = (id) => document.getElementById(id);
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const settings = {
  challengeIndex: 0,
  mode: "ready",
  current: { ...STARTER, forceKN: 0 },
  targetLoad: CHALLENGES[0].loadKN,
  heatmap: false,
  completed: false,
  testing: false,
  rig: null,
  lastResult: null
};

const CONTROL_NAMES = {
  length: { min: 1.5, max: 3.5, step: 0.05 },
  depth: { min: 0.08, max: 0.35, step: 0.005 },
  width: { min: 0.07, max: 0.2, step: 0.005 },
  targetLoad: { min: 1, max: 60, step: 0.5 }
};

const closeFloatingMenu = () => {
  $("settingsMenu").hidden = true;
  $("settingsToggle").setAttribute("aria-expanded", "false");
};

function n(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "∞";
}

function setStatus(text, kind = "ready") {
  $("statusText").textContent = text;
  $("statusPill").className = "status-pill " + kind;
}

function updateMaterialButtons() {
  for (const button of document.querySelectorAll("[data-material]")) {
    const selected = button.dataset.material === settings.current.material;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function updateSliderValues() {
  const config = settings.current;
  for (const id of ["length", "depth", "width", "deformationScale"]) $(id).value = config[id];
  $("lengthOutput").textContent = n(config.length, 2) + " m";
  $("depthOutput").textContent = Math.round(config.depth * 1000) + " mm";
  $("widthOutput").textContent = Math.round(config.width * 1000) + " mm";
  $("deformationOutput").textContent = config.deformationScale + "×";
  $("targetLoadControl").value = settings.targetLoad;
  $("targetLoadOutput").textContent = n(settings.targetLoad, 1) + " kN";
  updateMaterialButtons();
}

function updateChallengeHeader() {
  const level = CHALLENGES[settings.challengeIndex];
  $("labChip").textContent = "LAB " + String(settings.challengeIndex + 1).padStart(2, "0");
  $("challengeNumber").textContent = String(settings.challengeIndex + 1).padStart(2, "0") + " / " + String(CHALLENGES.length).padStart(2, "0");
  $("challengeTitle").textContent = level.name;
  $("objectiveText").textContent = "Support " + level.loadKN + " kN · ≤ " + level.maxDeflectionMM + " mm deflection";
  $("loadTarget").textContent = n(settings.targetLoad, 1) + " kN test";
}

function setMode(next) {
  if (settings.testing) return;
  settings.mode = next;
  const build = next === "build";
  const inspect = next === "inspect";
  if (build && settings.completed) {
    settings.current.forceKN = 0;
    settings.completed = false;
    settings.lastResult = null;
  }
  if (build) settings.heatmap = false;
  if (inspect) settings.heatmap = true;
  $("game").dataset.mode = next;
  $("buildSheet").hidden = !build;
  $("inspectSheet").hidden = !inspect;
  $("handleLayer").hidden = !build;
  $("resultCard").hidden = true;
  closeFloatingMenu();
  $("modeBuild").setAttribute("aria-pressed", String(build));
  $("modeInspect").setAttribute("aria-pressed", String(inspect));
  $("modeTest").setAttribute("aria-pressed", "false");
  $("modeBuild").classList.toggle("selected", build);
  $("modeInspect").classList.toggle("selected", inspect);
  if (build) {
    setStatus("Drag a handle or adjust dimensions", "ready");
  } else if (inspect) {
    setStatus(settings.completed ? "Inspect your latest test" : "Inspect the beam before testing", "ready");
  } else {
    setStatus(settings.completed ? "Run another test or improve the beam" : "Build a beam, then press TEST", "ready");
  }
  settings.rig?.setViewForMode(next, settings.current);
  renderAnalysis();
}

function setChallenge(index) {
  if (settings.testing) return;
  settings.challengeIndex = (index + CHALLENGES.length) % CHALLENGES.length;
  const challenge = CHALLENGES[settings.challengeIndex];
  settings.current = { ...STARTER, forceKN: 0, length: challenge.span };
  settings.targetLoad = challenge.loadKN;
  settings.completed = false;
  settings.lastResult = null;
  updateChallengeHeader();
  updateSliderValues();
  setMode("ready");
  renderAnalysis();
  settings.rig?.focusCamera(settings.current, true);
}

function setMetric(id, value, unit) {
  $(id).innerHTML = n(value, id === "deflectionMetric" ? 2 : 1) + " <small>" + unit + "</small>";
}

function updateLearning(mechanics, result) {
  let title = "Where is stress highest?";
  let explanation = "For a cantilever loaded at its tip, the maximum bending moment occurs at the fixed end. The outer fibers carry the greatest bending stress.";
  const challenge = CHALLENGES[settings.challengeIndex];
  if (mechanics.yieldUtilization >= 0.9999) {
    title = "At the first-yield limit";
    explanation = "The linear-elastic model has reached its validity limit. A real beam may plastically deform; permanent deformation, fracture and buckling are not simulated here.";
  } else if (!result.meetsStrength) {
    title = "Strength margin too small";
    explanation = "The section has not yielded, but its factor of safety is below " + challenge.targetFactor.toFixed(1) + ". A deeper section can reduce bending stress.";
  } else if (!result.meetsStiffness) {
    title = "Strong enough, but too flexible";
    explanation = "The material has sufficient yield strength, but the beam deflects too far. Section height strongly influences bending stiffness because I grows rapidly with depth.";
  } else if (result.pass) {
    title = "It survived — now optimize";
    explanation = "You passed the challenge. Try reducing the flange width or switching material while keeping the strength and deflection limits satisfied.";
  } else if (settings.current.material === "aluminum") {
    title = "Stiffness versus weight";
    explanation = "Aluminum weighs less but has a lower Young's modulus. The same beam shape will bend more under an equal load, while bending stress stays similar.";
  }
  $("lessonTitle").textContent = title;
  $("lessonText").textContent = explanation;
}

function renderAnalysis() {
  if (!settings.rig) return;
  const config = settings.current;
  try {
    const mechanics = beamAnalysis(config);
    const solution = getBeamSolution(config);
    settings.rig.updateBeam(config, mechanics, solution, settings.heatmap);

    const result = checkChallenge(config, CHALLENGES[settings.challengeIndex], config.forceKN);
    setMetric("stressMetric", mechanics.maxStressPa / 1e6, "MPa");
    setMetric("deflectionMetric", Math.abs(solution.tipDeflectionM) * 1000, "mm");
    setMetric("massMetric", mechanics.massKG, "kg");
    $("buildMass").textContent = n(mechanics.massKG, 1) + " kg";
    $("safetyMetric").textContent = n(mechanics.factorOfSafety, 2) + "×";
    $("strainMetric").textContent = Math.round(mechanics.bendingStrain * 1e6).toLocaleString() + " µε";
    $("canvasForce").textContent = n(config.forceKN, 1) + " kN";
    $("solverLabel").textContent = solution.engine;
    $("loadOutput").textContent = n(config.forceKN, 1) + " kN";
    $("loadTarget").textContent = n(settings.targetLoad, 1) + " kN test";
    $("miniLoadFill").style.width = Math.max(0, Math.min(100, config.forceKN / Math.max(settings.targetLoad, 0.1) * 100)) + "%";
    $("targetMarker").style.left = "calc(100% - 2px)";
    $("heatToggle").setAttribute("aria-pressed", String(settings.heatmap));
    $("heatToggleLabel").textContent = settings.heatmap ? "STRESS MAP" : "REAL MATERIAL";
    updateLearning(mechanics, result);
    return { mechanics, result, solution };
  } catch (error) {
    console.error("Beam analysis failed", error);
    setStatus("Physics calculation unavailable", "failed");
    $("solverLabel").textContent = "Solver error";
    return null;
  }
}

let renderScheduled = false;
function renderNextFrame() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    updateSliderValues();
    renderAnalysis();
  });
}

function updateGeometry(key, value) {
  const meta = CONTROL_NAMES[key];
  if (!meta || settings.testing) return;
  const stepped = Math.round((value - meta.min) / meta.step) * meta.step + meta.min;
  const next = Math.max(meta.min, Math.min(meta.max, stepped));
  const rounded = Number(next.toFixed(5));
  if (key === "targetLoad") {
    settings.targetLoad = rounded;
    updateChallengeHeader();
  } else {
    settings.current[key] = rounded;
  }
  settings.completed = false;
  settings.lastResult = null;
  renderNextFrame();
}

function announceResult(data, stoppedAtYield) {
  if (!data) return;
  const { mechanics, result } = data;
  settings.completed = true;
  settings.lastResult = result;
  const success = result.pass && !stoppedAtYield;
  const exceeded = stoppedAtYield || mechanics.yieldUtilization >= 0.9999;
  $("game").dataset.mode = "complete";
  settings.mode = "complete";
  $("resultCard").hidden = false;
  $("resultCard").classList.toggle("failed", !success);
  $("resultIcon").textContent = success ? "✓" : "!";
  $("resultTitle").textContent = success ? "CHALLENGE PASSED" : exceeded ? "FIRST YIELD REACHED" : !result.completedLoad ? "LOAD BELOW TARGET" : !result.meetsStrength ? "SAFETY MARGIN TOO LOW" : "TOO MUCH DEFLECTION";
  $("resultDetail").textContent = success
    ? n(settings.targetLoad, 1) + " kN held using " + n(mechanics.massKG, 1) + " kg of material. Try a lighter design."
    : exceeded
      ? "The test stopped at the elastic limit. Strengthen the beam and try again."
      : !result.completedLoad
        ? "Set the test load to at least " + CHALLENGES[settings.challengeIndex].loadKN + " kN to complete this level."
        : !result.meetsStrength
          ? "Increase the yield factor to " + CHALLENGES[settings.challengeIndex].targetFactor.toFixed(1) + " or more."
          : "Keep tip deflection below " + CHALLENGES[settings.challengeIndex].maxDeflectionMM + " mm.";
  setStatus(success ? "Success — the beam survived" : "Test finished — inspect the limit", success ? "passed" : "failed");
  $("testLabel").textContent = "RETEST";
  $("testIcon").textContent = "↻";
  $("modeTest").disabled = false;
  $("modeTest").setAttribute("aria-pressed", "false");
  $("resultCard").querySelector("#nextChallenge").hidden = !success;
}

let testFrame = 0;
function runTest() {
  if (settings.testing || !settings.rig) return;
  cancelAnimationFrame(testFrame);
  closeFloatingMenu();
  $("helpPanel").hidden = true;
  $("buildSheet").hidden = true;
  $("inspectSheet").hidden = true;
  $("handleLayer").hidden = true;
  $("resultCard").hidden = true;
  settings.testing = true;
  settings.completed = false;
  settings.mode = "testing";
  settings.heatmap = true;
  $("game").dataset.mode = "testing";
  $("modeTest").disabled = true;
  $("modeTest").setAttribute("aria-pressed", "true");
  $("modeBuild").setAttribute("aria-pressed", "false");
  $("modeInspect").setAttribute("aria-pressed", "false");
  $("testIcon").textContent = "●";
  $("testLabel").textContent = "LOADING";
  settings.current.forceKN = 0;
  renderAnalysis();
  settings.rig.setViewForMode("testing", settings.current);
  setStatus("Hydraulic test running", "testing");

  // The structural solver is elastic-only. Stop loading when it reaches first yield.
  const reference = beamAnalysis({ ...settings.current, forceKN: settings.targetLoad });
  const ratioAtTarget = reference.yieldUtilization;
  const stopAtYield = ratioAtTarget >= 1;
  const actualTarget = stopAtYield
    ? settings.targetLoad / ratioAtTarget
    : settings.targetLoad;
  const duration = prefersReducedMotion ? 420 : 2200;
  let start = 0;
  let lastRender = -100;
  const animate = (timestamp) => {
    if (!start) start = timestamp;
    const progress = Math.min(1, (timestamp - start) / duration);
    const eased = progress * progress * (3 - 2 * progress);
    if (timestamp - lastRender >= 40 || progress >= 1) {
      settings.current.forceKN = actualTarget * eased;
      renderAnalysis();
      lastRender = timestamp;
    }
    if (progress < 1) {
      testFrame = requestAnimationFrame(animate);
    } else {
      settings.current.forceKN = actualTarget;
      const outcome = renderAnalysis();
      settings.testing = false;
      announceResult(outcome, stopAtYield);
    }
  };
  testFrame = requestAnimationFrame(animate);
}

function attachHandleDrag(buttonId, key, factor) {
  const button = $(buttonId);
  let state = null;
  button.addEventListener("pointerdown", (event) => {
    if (settings.mode !== "build" || settings.testing) return;
    event.preventDefault();
    event.stopPropagation();
    button.setPointerCapture(event.pointerId);
    state = {
      pointerId: event.pointerId,
      initialX: event.clientX,
      initialY: event.clientY,
      initialValue: key === "targetLoad" ? settings.targetLoad : settings.current[key]
    };
    button.classList.add("dragging");
  });
  button.addEventListener("pointermove", (event) => {
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const delta = key === "length"
      ? event.clientX - state.initialX
      : state.initialY - event.clientY;
    updateGeometry(key, state.initialValue + delta * factor);
  });
  const finish = (event) => {
    if (!state || event.pointerId !== state.pointerId) return;
    state = null;
    button.classList.remove("dragging");
  };
  button.addEventListener("pointerup", finish);
  button.addEventListener("pointercancel", finish);
  button.addEventListener("lostpointercapture", () => {
    state = null;
    button.classList.remove("dragging");
  });
  button.addEventListener("click", (event) => event.preventDefault());
}

function connectControls() {
  $("modeBuild").addEventListener("click", () => setMode(settings.mode === "build" ? "ready" : "build"));
  $("modeInspect").addEventListener("click", () => setMode(settings.mode === "inspect" ? "ready" : "inspect"));
  $("modeTest").addEventListener("click", runTest);
  $("closeBuild").addEventListener("click", () => setMode("ready"));
  $("closeInspect").addEventListener("click", () => setMode("ready"));
  $("retryTest").addEventListener("click", runTest);
  $("editAgain").addEventListener("click", () => setMode("build"));
  $("nextChallenge").addEventListener("click", () => setChallenge(settings.challengeIndex + 1));
  $("challengeNext").addEventListener("click", () => setChallenge(settings.challengeIndex + 1));
  $("resetBeam").addEventListener("click", () => {
    const challenge = CHALLENGES[settings.challengeIndex];
    settings.current = { ...STARTER, length: challenge.span, forceKN: 0 };
    settings.targetLoad = challenge.loadKN;
    settings.completed = false;
    updateChallengeHeader();
    updateSliderValues();
    renderAnalysis();
    setStatus("Design restored — tap TEST when ready");
  });
  $("settingsToggle").addEventListener("click", () => {
    const open = $("settingsMenu").hidden;
    $("settingsMenu").hidden = !open;
    $("settingsToggle").setAttribute("aria-expanded", String(open));
  });
  $("cameraReset").addEventListener("click", () => {
    settings.rig?.focusCamera(settings.current, true);
    closeFloatingMenu();
  });
  $("cameraPreset").addEventListener("click", () => {
    settings.rig?.focusCamera(settings.current, false);
    closeFloatingMenu();
  });
  $("toggleHelp").addEventListener("click", () => {
    $("helpPanel").hidden = false;
    closeFloatingMenu();
  });
  $("closeHelp").addEventListener("click", () => { $("helpPanel").hidden = true; });
  $("heatToggle").addEventListener("click", () => {
    settings.heatmap = !settings.heatmap;
    renderAnalysis();
  });
  $("dropWeight").addEventListener("click", () => {
    if (!settings.rig?.dropWeight()) setStatus("Rapier is not available", "failed");
  });
  $("targetLoadControl").addEventListener("input", (event) => updateGeometry("targetLoad", Number(event.currentTarget.value)));
  for (const key of ["length", "depth", "width"]) {
    $(key).addEventListener("input", (event) => updateGeometry(key, Number(event.currentTarget.value)));
  }
  $("deformationScale").addEventListener("input", (event) => {
    if (settings.testing) return;
    settings.current.deformationScale = Number(event.currentTarget.value);
    renderNextFrame();
  });
  for (const button of document.querySelectorAll("[data-material]")) {
    button.addEventListener("click", () => {
      if (settings.testing) return;
      settings.current.material = button.dataset.material;
      settings.completed = false;
      updateMaterialButtons();
      renderAnalysis();
    });
  }
  attachHandleDrag("lengthHandle", "length", 0.008);
  attachHandleDrag("depthHandle", "depth", 0.0008);
  attachHandleDrag("loadHandle", "targetLoad", 0.16);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    $("helpPanel").hidden = true;
    closeFloatingMenu();
    if (settings.mode === "build" || settings.mode === "inspect") setMode("ready");
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".settings-menu") && !event.target.closest("#settingsToggle")) closeFloatingMenu();
  });
}

function enableBeamSelection() {
  let down = null;
  $("laboratory").addEventListener("pointerdown", (event) => {
    down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });
  $("laboratory").addEventListener("pointerup", (event) => {
    if (!down || down.pointerId !== event.pointerId || settings.testing) return;
    const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (distance < 12 && settings.rig?.pickBeam(event.clientX, event.clientY)) setMode("build");
  });
  $("laboratory").addEventListener("pointercancel", () => { down = null; });
}

function followHandleAnchors() {
  if (settings.rig && settings.mode === "build") {
    const anchors = settings.rig.getHandleAnchors(settings.current);
    for (const [key, id] of [["length", "lengthHandle"], ["depth", "depthHandle"], ["load", "loadHandle"]]) {
      const anchor = anchors[key];
      if (!anchor) continue;
      const element = $(id);
      const visible = anchor.x > 25 && anchor.y > 140 && anchor.x < $("scenePanel").clientWidth - 25 && anchor.y < $("scenePanel").clientHeight - 95;
      element.style.display = visible ? "flex" : "none";
      element.style.left = anchor.x + "px";
      element.style.top = anchor.y + "px";
    }
  }
  requestAnimationFrame(followHandleAnchors);
}

async function main() {
  connectControls();
  updateChallengeHeader();
  updateSliderValues();
  try {
    settings.rig = await createLaboratory($("laboratory"), (status) => {
      console.info(status);
    });
    settings.rig.focusCamera(settings.current, true);
    $("sceneLoading").classList.add("hidden");
    renderAnalysis();
    enableBeamSelection();
    requestAnimationFrame(followHandleAnchors);
    setStatus("Build a beam, then press TEST");
  } catch (error) {
    console.error("Could not initialize REDLINE", error);
    $("sceneLoading").innerHTML = "<strong>3D GRAPHICS UNAVAILABLE</strong><span>Try a browser with WebGL support.</span>";
    setStatus("The 3D lab failed to initialize", "failed");
  }
}

main();
