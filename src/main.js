import { STARTER, CHALLENGES, beamAnalysis, checkChallenge } from "./engineering/beam.js";
import { getBeamSolution } from "./engineering/fem.js";
import { createPlasticBeam, replayPlasticSnapshot } from "./engineering/plasticity.js";
import { renderHistoryCurve, historyEntry } from "./ui/history.js";
import { damageState, destructiveTargetKN, preRuptureGeometryLoadKN, stagedActuatorLoad } from "./engineering/damage.js";
import { createLaboratory } from "./scene/lab.js";
import { createPlayHUD } from "./vendor/hambone-play/hambone-play.js";

const $ = (id) => document.getElementById(id);
let playHUD = null;

function initializeGameHUD() {
  const hud = createPlayHUD({
    root: $("game"),
    viewport: $("scenePanel"),
    style: "workbench",
    title: "REDLINE",
    density: "standard",
    metrics: [
      { id: "force", label: "LOAD", value: "0 kN" },
      { id: "deflection", label: "TIP", value: "0 mm" },
      { id: "target", label: "COMMAND", value: "12 kN" }
    ]
  });
  for (const id of ["modeBuild", "modeTest", "modeInspect"]) {
    hud.placeControl($(id), "actions");
  }
  $("modeTest").classList.add("is-primary");
  hud.placeControl($("settingsToggle"), "utilities");
  // Keep challenge switching available without a persistent top-level header.
  const next = $("challengeNext");
  $("settingsMenu").insertBefore(next, $("cameraReset"));
  next.classList.add("menu-challenge");
  hud.registerOccluder($("buildSheet"));
  hud.registerOccluder($("inspectSheet"));
  hud.registerOccluder($("resultCard"));
  hud.setSafeFrameCallback(rect => {
    settings.rig?.setSafeFrame?.(rect);
  });
  return hud;
}

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
  lastResult: null,
  activeTargetLoad: null,
  lastDamageStage: "elastic",
  plastic: null,
  history: [],
  replayIndex: null,
  cyclePhase: "load",
  lastTargetKN: CHALLENGES[0].loadKN
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
  if (playHUD) {
    const tone = kind === "failed" ? "danger" : kind === "passed" ? "positive" : kind === "testing" ? "warning" : "neutral";
    playHUD.setStatus(text, tone);
  }
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
  playHUD?.setMetric("target", n(settings.targetLoad, 1) + " kN");
}

function setMode(next) {
  if (settings.testing) return;
  settings.replayIndex = null;
  settings.mode = next;
  const build = next === "build";
  const inspect = next === "inspect";
  if (build && settings.completed) {
    settings.rig?.resetDamage();
    settings.current.forceKN = 0;
    settings.plastic = null;
    settings.history = [];
    updateHistoryUI();
    settings.completed = false;
    settings.lastResult = null;
  }
  if (build) settings.heatmap = false;
  if (inspect) settings.heatmap = true;
  $("game").dataset.mode = next;
  playHUD?.setPhase(build || inspect ? "editing" : "ready");
  $("modeBuild").querySelector("b").textContent = build ? "DONE" : "EDIT";
  $("modeInspect").querySelector("b").textContent = inspect ? "CLOSE" : "DETAILS";
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
  settings.activeTargetLoad = null;
  settings.plastic = null;
  settings.history = [];
  settings.replayIndex = null;
  settings.lastTargetKN = challenge.loadKN;
  settings.rig?.resetDamage();
  updateHistoryUI();
  updateChallengeHeader();
  updateSliderValues();
  setMode("ready");
  renderAnalysis();
  settings.rig?.focusCamera(settings.current, true);
}

function setMetric(id, value, unit) {
  $(id).innerHTML = n(value, id === "deflectionMetric" ? 2 : 1) + " <small>" + unit + "</small>";
}

function updateLearning(mechanics, result, damage, solution) {
  let title = "Where is stress highest?";
  let explanation = "For a cantilever loaded at its tip, the maximum bending moment occurs at the fixed end. The outer fibers carry the greatest bending stress.";
  const challenge = CHALLENGES[settings.challengeIndex];
  if (settings.plastic?.hasPlasticSet && settings.current.forceKN < 0.001 && !damage.isSeparated) {
    title = "Permanent set after unloading";
    explanation = "The fiber-integrated bilinear elastoplastic beam retains plastic strain when the load returns to zero. The residual tip deflection is " + n(Math.abs(solution.permanentTipM || solution.tipDeflectionM) * 1000, 2) + " mm. Reload to compare the path with the original loading curve.";
  } else if (damage.isSeparated) {
    title = "Rupture and loss of load path";
    explanation = "The illustrative tear has separated the beam near its fixed end. The hydraulic actuator can complete its commanded stroke, but the detached specimen no longer carries that load. Fracture location and load are not validated.";
  } else if (damage.stage === "tearing" || damage.stage === "cracking") {
    title = "The crack is propagating";
    explanation = "This illustrative damage model grows a crack on the tension flange and through the web. Real tearing would require material plasticity, crack-tip mechanics and calibrated fracture data.";
  } else if (damage.isBeyondElastic) {
    title = "Permanent deformation begins at yield";
    explanation = "The longitudinal fiber model now integrates bilinear elastoplastic steel or aluminum behavior and estimates permanent bending. It neglects geometric nonlinearity, local buckling, connection slip and calibrated damage. The cracking/tearing animation is still illustrative.";
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


function updateHistoryUI() {
  const entries = settings.history;
  const replayIndex = settings.replayIndex ?? Math.max(0, entries.length - 1);
  renderHistoryCurve($("forceDeflectionCurve"), entries, replayIndex);
  const scrubber = $("historyScrubber");
  scrubber.min = "0";
  scrubber.max = String(Math.max(1, entries.length - 1));
  scrubber.value = String(replayIndex);
  scrubber.disabled = entries.length < 2;
  const sample = entries[replayIndex];
  $("historyPointLabel").textContent = sample
    ? n(sample.forceKN, 1) + " kN  ·  " + n(Math.abs(sample.tipMM), 2) + " mm  ·  " + sample.phase.toUpperCase()
    : "No recording yet";
  $("historyCount").textContent = String(entries.length) + " samples";
}
function storeHistory(snapshot) {
  if (!settings.testing || !snapshot) return;
  const history = settings.history;
  const prev = history[history.length - 1];
  if (prev && Math.abs(prev.forceKN - snapshot.forceKN) < 0.03 &&
      prev.phase === settings.cyclePhase) return;
  history.push(historyEntry(snapshot, settings.cyclePhase));
  updateHistoryUI();
}
function clearPlasticHistory() {
  settings.plastic = null;
  settings.history = [];
  settings.replayIndex = null;
  updateHistoryUI();
}

function renderAnalysis() {
  if (!settings.rig) return;
  const config = settings.current;
  try {
    const replay = settings.replayIndex === null ? null : settings.history[settings.replayIndex];
    // The actuator may continue to its commanded target after fracture, but
    // the detached specimen no longer accepts further bending load. Keep the
    // final pre-rupture shape frozen for the gravity-driven fragment.
    const modeledForceKN = preRuptureGeometryLoadKN(config, config.forceKN);
    const solution = replay
      ? replayPlasticSnapshot(replay.snapshot)
      : settings.plastic
        ? settings.plastic.stepTo(modeledForceKN)
        : getBeamSolution(config);
    if (settings.plastic && !replay && !damageState(config, config.forceKN).isSeparated) {
      storeHistory(solution);
    }
    const displayedKN = replay ? solution.forceKN : config.forceKN;
    const mechanics = beamAnalysis(config, displayedKN);
    const peakKN = replay ? solution.peakKN : settings.plastic?.peakKN ?? displayedKN;
    const damage = damageState(config, peakKN);
    settings.rig.updateBeam(config, mechanics, solution, settings.heatmap, damage);
    $("game").dataset.damageStage = damage.stage;
    playHUD?.setMetric("force", n(displayedKN, 1) + " kN");
    playHUD?.setMetric("target", n(settings.activeTargetLoad ?? settings.targetLoad, 1) + " kN");
    playHUD?.setMetric("deflection", n(Math.abs(solution.tipDeflectionM) * 1000, 2) + " mm");
    if (settings.testing && settings.cyclePhase === "load" && damage.stage !== settings.lastDamageStage) {
      const captions = {
        elastic: "Elastic response",
        yielding: "First yield — permanent bending begins",
        cracking: "A crack is opening on the tension flange",
        tearing: "The crack is tearing through the web",
        ruptured: "Specimen separated — actuator command continues"
      };
      setStatus(captions[damage.stage] || "Loading specimen", damage.isSeparated ? "failed" : "testing");
      // Keep the central scene unobstructed during crack and tear growth.
      // The context label tells the story; only separation gets a brief event.
      if (damage.isSeparated) playHUD?.showEvent("SPECIMEN SEPARATED", {
        tone: "danger", duration: 950
      });
      settings.lastDamageStage = damage.stage;
    }

    const result = checkChallenge(config, CHALLENGES[settings.challengeIndex], config.forceKN);
    setMetric("stressMetric", (solution.maxStressPa ?? mechanics.maxStressPa) / 1e6, "MPa");
    setMetric("deflectionMetric", Math.abs(solution.tipDeflectionM) * 1000, "mm");
    setMetric("massMetric", mechanics.massKG, "kg");
    $("buildMass").textContent = n(mechanics.massKG, 1) + " kg";
    $("safetyMetric").textContent = n(mechanics.factorOfSafety, 2) + "×";
    $("strainMetric").textContent = Math.round((solution.maxStrain ?? mechanics.bendingStrain) * 1e6).toLocaleString() + " µε";
    $("canvasForce").textContent = n(displayedKN, 1) + " kN";
    $("solverLabel").textContent = damage.isSeparated
      ? solution.engine + " · failed, shape frozen"
      : solution.engine + (damage.isBeyondElastic ? " · model, not certified" : "");
    $("loadOutput").textContent = n(config.forceKN, 1) + " kN";
    $("residualMetric").textContent = n(Math.abs(solution.permanentTipM || 0) * 1000, 2) + " mm";
    $("plasticMetric").textContent = n((solution.maxPlasticStrain || 0) * 1e6, 0) + " µε";
    const commandKN = settings.activeTargetLoad ?? settings.targetLoad;
    $("loadTarget").textContent = n(commandKN, 1) + " kN command";
    $("miniLoadFill").style.width = Math.max(0, Math.min(100, config.forceKN / Math.max(commandKN, 0.1) * 100)) + "%";
    $("targetMarker").style.left = "calc(100% - 2px)";
    $("heatToggle").setAttribute("aria-pressed", String(settings.heatmap));
    $("heatToggleLabel").textContent = settings.heatmap ? "STRESS MAP" : "REAL MATERIAL";
    updateLearning(mechanics, result, damage, solution);
    return { mechanics, result, solution, damage };
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
  if (key !== "targetLoad") clearPlasticHistory();
  renderNextFrame();
}

function announceResult(data, destructive = false, cycle = "load") {
  if (!data) return;
  const { mechanics, result, damage } = data;
  settings.completed = true;
  settings.lastResult = result;
  const success = result.pass && !damage.isBeyondElastic && !destructive;
  const ruptured = damage.isSeparated;
  const unloading = cycle === "unload";
  const remainingMM = Math.abs(settings.plastic?.snapshot().tipDeflectionM ?? 0) * 1000;
  $("game").dataset.mode = "complete";
  settings.mode = "complete";
  playHUD?.setPhase("result");
  $("resultCard").hidden = false;
  $("resultCard").classList.toggle("failed", !success && !unloading);
  $("resultCard").classList.toggle("fracture-compact", ruptured);
  $("resultExpand").hidden = !ruptured;
  $("resultExpand").setAttribute("aria-expanded", "false");
  $("resultExpand").textContent = "Details ↓";
  $("resultIcon").textContent = unloading ? "↘" : success ? "✓" : "!";
  $("unloadTest").hidden = ruptured || settings.current.forceKN < 0.05;
  $("reloadTest").hidden = ruptured || settings.current.forceKN > 0.05 || !settings.lastTargetKN;
  $("openHistory").hidden = settings.history.length < 2;
  $("resultTitle").textContent = unloading
    ? "UNLOADED · RESIDUAL SET"
    : success ? "CHALLENGE PASSED"
    : ruptured ? "CRACK → TEAR → RUPTURE"
      : damage.isBeyondElastic ? "PERMANENT DEFORMATION"
        : !result.completedLoad ? "BELOW CHALLENGE LOAD"
          : !result.meetsStrength ? "SAFETY MARGIN TOO LOW" : "TOO MUCH DEFLECTION";
  $("resultDetail").textContent = unloading
    ? "Actuator command is zero. The elastoplastic beam model predicts " + n(remainingMM, 2) + " mm permanent tip displacement. Select RELOAD to compare paths, or CURVE to scrub the recorded test."
    : ruptured ? "The actuator completed " + n(settings.current.forceKN, 1) + " kN of command. The specimen separated near " + n(damage.ruptureLoadKN, 1) + " kN in the illustrative damage model; it no longer transmits the commanded load."
    : success
      ? n(settings.current.forceKN, 1) + " kN held using " + n(mechanics.massKG, 1) + " kg. Can you make it lighter?"
      : damage.isBeyondElastic
        ? "Full " + n(settings.current.forceKN, 1) + " kN reached. The fiber beam estimates plastic bending; crack and tear visuals remain illustrative. Try UNLOAD to measure residual set."
        : !result.completedLoad
          ? "Set at least " + CHALLENGES[settings.challengeIndex].loadKN + " kN for this level."
          : !result.meetsStrength
            ? "Increase yield safety factor to " + CHALLENGES[settings.challengeIndex].targetFactor.toFixed(1) + "."
            : "Keep the tip within " + CHALLENGES[settings.challengeIndex].maxDeflectionMM + " mm.";
  setStatus(unloading ? "Actuator released — inspect the residual bend" : success ? "Success — structure survived" : ruptured ? "Ruptured — inspect the fracture" : "Limit exceeded — improve your design", unloading || success ? "passed" : "failed");
  $("testLabel").textContent = "RETEST";
  $("testIcon").textContent = "↻";
  $("modeTest").disabled = false;
  $("modeTest").setAttribute("aria-pressed", "false");
  $("resultCard").querySelector("#nextChallenge").hidden = !success;
  $("breakTest").hidden = ruptured;
  settings.activeTargetLoad = null;
}

let testFrame = 0;
let finishTimer = null;
function runTest({ destructive = false, cycle = "load" } = {}) {
  if (settings.testing || !settings.rig) return;
  const fresh = cycle === "load";
  const unloading = cycle === "unload";
  if (!fresh && (!settings.plastic ||
      damageState(settings.current, settings.plastic.peakKN).isSeparated)) return;
  if (unloading && settings.current.forceKN <= 0.01) return;
  cancelAnimationFrame(testFrame);
  if (finishTimer !== null) clearTimeout(finishTimer);
  if (fresh) {
    settings.rig.resetDamage();
    settings.plastic = createPlasticBeam(settings.current);
    settings.history = [];
    settings.lastDamageStage = "elastic";
  }
  settings.replayIndex = null;
  settings.cyclePhase = unloading ? "unload" : fresh ? "load" : "reload";
  closeFloatingMenu();
  $("helpPanel").hidden = true;
  $("buildSheet").hidden = true;
  $("inspectSheet").hidden = true;
  $("handleLayer").hidden = true;
  $("resultCard").hidden = true;
  settings.testing = true;
  settings.completed = false;
  settings.mode = "testing";
  playHUD?.setPhase("playing");
  settings.heatmap = false;
  $("game").dataset.mode = "testing";
  $("modeTest").disabled = true;
  $("modeTest").setAttribute("aria-pressed", "true");
  $("modeBuild").setAttribute("aria-pressed", "false");
  $("modeInspect").setAttribute("aria-pressed", "false");
  $("testIcon").textContent = "●";
  $("testLabel").textContent = unloading ? "UNLOADING" : cycle === "reload" ? "RELOADING" : destructive ? "OVERLOAD" : "LOADING";
  if (fresh) settings.current.forceKN = 0;
  const fromKN = settings.current.forceKN;
  const toKN = unloading ? 0 : fresh
    ? destructive ? destructiveTargetKN(settings.current, settings.targetLoad) : settings.targetLoad
    : settings.lastTargetKN;
  if (fresh) settings.lastTargetKN = toKN;
  settings.activeTargetLoad = Math.max(fromKN, toKN);
  renderAnalysis();
  settings.rig.setViewForMode("testing", settings.current);
  setStatus(unloading ? "Releasing actuator — watch the permanent set" :
    cycle === "reload" ? "Reloading along the material history" :
    destructive ? "Destructive test — applying overload" : "Hydraulic test — applying commanded load", "testing");
  const duration = prefersReducedMotion ? 650 : unloading ? 2350 : cycle === "reload" ? 2850 : 3550;
  let start = 0, lastRender = -100;
  const animate = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min(1, (timestamp - start) / duration);
    const eased = progress * progress * (3 - 2 * progress);
    if (timestamp - lastRender >= 34 || progress >= 1) {
      settings.current.forceKN = fresh
        ? stagedActuatorLoad(settings.current, toKN, progress)
        : fromKN + (toKN - fromKN) * eased;
      renderAnalysis();
      lastRender = timestamp;
    }
    if (progress < 1) {
      testFrame = requestAnimationFrame(animate);
    } else {
      settings.current.forceKN = toKN;
      renderAnalysis();
      finishTimer = setTimeout(() => {
        const outcome = renderAnalysis();
        settings.testing = false;
        finishTimer = null;
        announceResult(outcome, destructive, cycle);
      }, prefersReducedMotion ? 120 : 900);
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
  $("modeTest").addEventListener("click", () => runTest());
  $("closeBuild").addEventListener("click", () => setMode("ready"));
  $("closeInspect").addEventListener("click", () => setMode("ready"));
  $("resultExpand").addEventListener("click", () => {
    const card = $("resultCard");
    const expanded = card.classList.toggle("fracture-compact") === false;
    $("resultExpand").setAttribute("aria-expanded", String(expanded));
    $("resultExpand").textContent = expanded ? "Close ↑" : "Details ↓";
  });
  $("retryTest").addEventListener("click", () => runTest());
  $("unloadTest").addEventListener("click", () => runTest({ cycle: "unload" }));
  $("reloadTest").addEventListener("click", () => runTest({ cycle: "reload" }));
  $("openHistory").addEventListener("click", () => setMode("inspect"));
  $("historyScrubber").addEventListener("input", event => {
    if (settings.testing || !settings.history.length) return;
    settings.replayIndex = Math.min(settings.history.length - 1, Math.max(0, Number(event.target.value) || 0));
    settings.rig?.resetDamage();
    renderAnalysis();
    updateHistoryUI();
  });
  $("historyLatest").addEventListener("click", () => {
    if (settings.testing) return;
    settings.replayIndex = null;
    settings.rig?.resetDamage();
    renderAnalysis();
    updateHistoryUI();
  });
  $("breakTest").addEventListener("click", () => runTest({ destructive: true }));
  $("destructiveTest").addEventListener("click", () => runTest({ destructive: true }));
  $("editAgain").addEventListener("click", () => setMode("build"));
  $("nextChallenge").addEventListener("click", () => setChallenge(settings.challengeIndex + 1));
  $("challengeNext").addEventListener("click", () => setChallenge(settings.challengeIndex + 1));
  $("resetBeam").addEventListener("click", () => {
    const challenge = CHALLENGES[settings.challengeIndex];
    settings.rig?.resetDamage();
    settings.current = { ...STARTER, length: challenge.span, forceKN: 0 };
    settings.targetLoad = challenge.loadKN;
    settings.activeTargetLoad = null;
    settings.completed = false;
    clearPlasticHistory();
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
      clearPlasticHistory();
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
  playHUD = initializeGameHUD();
  updateChallengeHeader();
  updateSliderValues();
  try {
    settings.rig = await createLaboratory($("laboratory"), (status) => {
      console.info(status);
    });
    settings.rig.focusCamera(settings.current, true);
    if (new URLSearchParams(location.search).has("debug")) {
      window.redlineVisualDebug = () => settings.rig?.getVisualDiagnostics?.();
    }
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
