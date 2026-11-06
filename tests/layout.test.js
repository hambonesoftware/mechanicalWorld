import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const js = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");

test("mobile layout uses a fixed height scene and safe-area inset controls", () => {
  assert.match(css, /100dvh/);
  assert.match(css, /overflow:hidden/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(html, /id="laboratory"/);
  assert.match(html, /id="modeDock"|class="mode-dock"/);
});

test("interactive controls have associated labels and required mode anchors", () => {
  for (const id of ["modeBuild", "modeTest", "modeInspect", "buildSheet", "inspectSheet", "resultCard", "handleLayer", "lengthHandle", "depthHandle", "loadHandle", "settingsMenu"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  for (const name of ["length", "depth", "width", "deformationScale", "targetLoadControl"]) {
    assert.match(html, new RegExp('for="' + name + '"'));
    assert.match(html, new RegExp('id="' + name + '"'));
  }
  assert.match(js, /function runTest/);
  assert.match(js, /function attachHandleDrag/);
  assert.match(js, /getHandleAnchors/);
  assert.match(js, /pickBeam/);
});

test("HTML IDs are unique", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("PWA manifest uses the Vite base path for GitHub Pages", () => {
  assert.match(html, /href="%BASE_URL%manifest\.webmanifest"/);
  assert.doesNotMatch(html, /href="\/manifest\.webmanifest"/);
});

test("destructive test actions exist and explain illustrative damage", () => {
  assert.match(html, /id="breakTest"/);
  assert.match(html, /id="destructiveTest"/);
  assert.match(html, /Crack growth, tearing and rupture remain illustrative/);
  assert.match(js, /destructiveTargetKN/);
  assert.match(js, /no longer transmits/);
});

test("Hambone PLAY v1 is wired without replacing existing gameplay controls", () => {
  assert.match(html, /hambone-play\/hambone-play\.css/);
  assert.match(js, /createPlayHUD/);
  assert.match(js, /hud\.placeControl\(\$\(id\), "actions"\)/);
  assert.match(js, /setSafeFrameCallback/);
  assert.match(css, /\.mode-dock\{display:none!important\}/);
});


test("nonlinear unloading UI exposes a labeled and replayable force-displacement history", () => {
  for (const id of ["unloadTest","reloadTest","openHistory","forceDeflectionCurve",
    "historyScrubber","historyLatest","historyPointLabel","residualMetric","plasticMetric"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(js,/createPlasticBeam/);
  assert.match(js,/replayPlasticSnapshot/);
  assert.match(js,/cycle === "unload"/);
});


test("final fracture uses the same root/free seam identifiers as progressive tearing",()=>{
  const scene = readFileSync(new URL("../src/scene/lab.js",import.meta.url),"utf8");
  assert.match(scene,/0, rootLength, 0, 0, "root"/);
  assert.match(scene,/rootLength, config\.length, freeCenter, freeCenterBend, "free"/);
  assert.match(scene,/ruptureInitialGapM = rootFace\.distanceTo\(freeFace\)/);
  assert.match(scene,/Unknown fracture fragment side/);
  assert.doesNotMatch(scene,/freeCenter, freeCenterBend, "left"/);
  assert.doesNotMatch(scene,/0, rootLength, 0, 0, "right"/);
});
