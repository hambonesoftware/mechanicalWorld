import { STARTER, CHALLENGES, beamAnalysis, checkChallenge } from "./engineering/beam.js";
import { getBeamSolution } from "./engineering/fem.js";
import { createLaboratory } from "./scene/lab.js";

const $ = (id) => document.getElementById(id);
let challengeIndex = 0;
let heatmap = true;
let rig = null;
let updateScheduled = false;
let current = { ...STARTER };
const numericControls = ["load", "length", "depth", "width", "deformationScale"];

function format(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "∞";
}

function updateOutputValues() {
  $("loadOutput").textContent = format(current.forceKN) + " kN";
  $("lengthOutput").textContent = format(current.length, 2) + " m";
  $("depthOutput").textContent = Math.round(current.depth * 1000) + " mm";
  $("widthOutput").textContent = Math.round(current.width * 1000) + " mm";
  $("deformationOutput").textContent = current.deformationScale + "×";
  $("canvasForce").innerHTML = format(current.forceKN) + " <small>kN</small>";
  $("canvasScale").textContent = current.deformationScale + "×";
  $("miniLoadFill").style.width = Math.min(100, current.forceKN / 60 * 100) + "%";
  $("load").value = current.forceKN;
  $("length").value = current.length;
  $("depth").value = current.depth;
  $("width").value = current.width;
  $("deformationScale").value = current.deformationScale;
  document.querySelectorAll("[data-material]").forEach((button) => {
    const selected = button.dataset.material === current.material;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function setStatusBanner(status, title, detail) {
  const banner = $("resultBanner");
  banner.className = "result-banner " + status;
  $("resultTitle").textContent = title;
  $("resultDetail").textContent = detail;
  banner.querySelector(".result-icon").textContent = status === "passed" ? "✓" : status === "failed" ? "!" : "●";
}

function setLesson(mechanics, pass) {
  const lesson = {
    title: "Why is the root stressed?",
    text: "The bending moment is highest at the clamp. The outer fibers of the I-section experience the greatest normal stress."
  };
  if (mechanics.yieldUtilization >= 1) {
    lesson.title = "Yield limit exceeded";
    lesson.text = "This is where linear-elastic assumptions stop being valid. We flag first yield, rather than pretending the beam is still elastic. Plastic deformation is a later physics pass.";
  } else if (mechanics.factorOfSafety < CHALLENGES[challengeIndex].targetFactor) {
    lesson.title = "Strength is not enough";
    lesson.text = "Your section has not reached first yield, but it lacks the challenge's required yield margin. Increase section depth or reduce load.";
  } else if (mechanics.tipDeflectionM * 1000 > CHALLENGES[challengeIndex].maxDeflectionMM) {
    lesson.title = "Stiffness matters";
    lesson.text = "A beam can be strong enough yet still bend too far. Raising its section depth boosts second moment of area and lowers deflection.";
  } else if (pass) {
    lesson.title = "Mission passed — can you do it lighter?";
    lesson.text = "Try reducing flange width or selecting aluminum, then run the same test. A more efficient structure earns a higher score.";
  } else if (current.material === "aluminum") {
    lesson.title = "Stiffness versus weight";
    lesson.text = "Aluminum has less elastic stiffness than steel, but much lower density. Geometry changes can compensate for its lower Young's modulus.";
  }
  $("lessonTitle").textContent = lesson.title;
  $("lessonText").textContent = lesson.text;
}

function updateReadouts() {
  if (!rig) return;
  let mechanics;
  let solution;
  try {
    mechanics = beamAnalysis(current);
    solution = getBeamSolution(current);
    rig.updateBeam(current, mechanics, solution, heatmap);
  } catch (error) {
    console.error("Analysis error", error);
    setStatusBanner("failed", "SOLVER ERROR", "The calculation could not be completed. Check the browser console.");
    $("solverLabel").textContent = "Solver error";
    return;
  }

  const challenge = CHALLENGES[challengeIndex];
  const result = checkChallenge(current, challenge, current.forceKN);
  $("stressMetric").innerHTML = format(mechanics.maxStressPa / 1e6, 1) + "<small> MPa</small>";
  $("deflectionMetric").innerHTML = format(Math.abs(solution.tipDeflectionM) * 1000, 2) + "<small> mm</small>";
  $("strainMetric").innerHTML = Math.round(mechanics.bendingStrain * 1e6).toLocaleString() + "<small> µε</small>";
  $("safetyMetric").innerHTML = format(mechanics.factorOfSafety, 2) + "<small> ×</small>";
  $("massMetric").innerHTML = format(mechanics.massKG, 1) + "<small> kg</small>";
  $("solverLabel").textContent = "Solver: " + solution.engine;
  $("safetyMetric").style.color = mechanics.yieldUtilization >= 1 ? "#f68a74" : "#eaf4f4";

  if (mechanics.yieldUtilization >= 1) {
    setStatusBanner("failed", "FIRST YIELD EXCEEDED", "Elastic calculation only; plasticity and fracture are not simulated.");
  } else if (result.pass) {
    setStatusBanner("passed", "CHALLENGE CLEARED · " + result.efficiency + " PTS", format(current.forceKN) + " kN supported with " + format(mechanics.massKG, 1) + " kg of material.");
  } else if (!result.completedLoad) {
    setStatusBanner("pending", "LOAD BELOW TARGET", "Reach " + challenge.loadKN + " kN to complete this challenge.");
  } else if (!result.meetsStrength) {
    setStatusBanner("failed", "SAFETY FACTOR TOO LOW", "Raise it to " + challenge.targetFactor.toFixed(1) + " or higher.");
  } else {
    setStatusBanner("failed", "DEFLECTION TOO HIGH", "Keep tip deflection below " + challenge.maxDeflectionMM + " mm.");
  }
  setLesson(mechanics, result.pass);
}

function scheduleUpdate() {
  if (updateScheduled) return;
  updateScheduled = true;
  requestAnimationFrame(() => {
    updateScheduled = false;
    updateOutputValues();
    updateReadouts();
  });
}

function selectChallenge(index) {
  challengeIndex = index;
  const challenge = CHALLENGES[index];
  current = { ...STARTER, forceKN: challenge.loadKN, length: challenge.span };
  $("challengeTitle").textContent = challenge.name;
  $("challengeDescription").textContent = challenge.description;
  $("challengeNumber").textContent = String(index + 1).padStart(2, "0") + " / " + String(CHALLENGES.length).padStart(2, "0");
  document.querySelectorAll("[data-challenge]").forEach((button) => {
    const selected = Number(button.dataset.challenge) === index;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  scheduleUpdate();
}

function attachControls() {
  const map = { load: "forceKN", length: "length", depth: "depth", width: "width", deformationScale: "deformationScale" };
  for (const id of numericControls) {
    $(id).addEventListener("input", (event) => {
      current[map[id]] = Number(event.currentTarget.value);
      scheduleUpdate();
    });
  }
  document.querySelectorAll("[data-material]").forEach((button) => {
    button.addEventListener("click", () => {
      current.material = button.dataset.material;
      scheduleUpdate();
    });
  });
  document.querySelectorAll("[data-challenge]").forEach((button) => {
    button.addEventListener("click", () => selectChallenge(Number(button.dataset.challenge)));
  });
  $("resetBeam").addEventListener("click", () => selectChallenge(challengeIndex));
  $("heatToggle").addEventListener("click", () => {
    heatmap = !heatmap;
    $("heatToggle").classList.toggle("active", heatmap);
    $("heatToggle").setAttribute("aria-pressed", String(heatmap));
    $("heatToggle").querySelector("span").textContent = heatmap ? "STRESS MAP" : "REAL MATERIAL";
    scheduleUpdate();
  });
  $("dropWeight").addEventListener("click", () => {
    if (!rig?.dropWeight()) {
      setStatusBanner("failed", "RAPIER NOT READY", "Rigid-body simulation is unavailable on this device.");
    }
  });
  $("cameraReset").addEventListener("click", () => rig?.focusCamera());
}

async function main() {
  attachControls();
  updateOutputValues();
  try {
    rig = await createLaboratory($("laboratory"), (status) => {
      $("engineStatus").textContent = status.includes("ready") ? "PHYSICS READY" : "RAPIER OFFLINE";
    });
    $("sceneLoading").classList.add("hidden");
    updateReadouts();
  } catch (error) {
    console.error("Could not start the 3D laboratory", error);
    $("sceneLoading").innerHTML = '<strong>3D renderer unavailable</strong><small>Try another browser with WebGL 2 enabled.</small>';
    setStatusBanner("failed", "RENDERER ERROR", "Unable to initialize 3D graphics.");
  }
}

main();
