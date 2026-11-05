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
  for (const name of ["length", "depth", "width", "deformationScale"]) {
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
