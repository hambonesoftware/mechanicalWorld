import test from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_MODES, DEFAULT_TOOL_MODE, TOOL_MODE_STORAGE_KEY, validToolMode,
  readToolMode, saveToolMode, clampPlacement, travelFromDrag,
  placementResult, toolAction
} from "../src/career/tool-grab.js";

test("three comparison modes share measurement rules but differ in assistance", () => {
  assert.equal(DEFAULT_TOOL_MODE, "assisted");
  assert.deepEqual(Object.keys(TOOL_MODES), ["free", "assisted", "closeup"]);
  assert.equal(placementResult("free", 0.7).positioned, false);
  assert.equal(placementResult("assisted", 0.7).positioned, true);
  assert.equal(placementResult("closeup", 0.7).positioned, false);
  assert.equal(placementResult("assisted", 0.7).magnetic, true);
  assert.equal(placementResult("free", 0.99).magnetic, false);
  assert.equal(TOOL_MODES.closeup.closeup, true);
});

test("normalized drag travel clamps beyond either end", () => {
  assert.equal(travelFromDrag(0, 125, 200), 0.625);
  assert.equal(travelFromDrag(0.3, -90, 200), 0);
  assert.equal(travelFromDrag(0.5, 400, 200), 1);
  assert.equal(travelFromDrag(0.5, 100, 0), 0.5);
  assert.equal(clampPlacement(NaN), 0);
  assert.equal(placementResult("free", 1.4).progress, 1);
});

test("working tool states require grab, zero and placement before contact", () => {
  assert.equal(toolAction({held: false, positioned: false, zeroed: false, reading: null}), "pickup");
  assert.equal(toolAction({held: true, positioned: false, zeroed: false, reading: null}), "zero");
  assert.equal(toolAction({held: true, positioned: false, zeroed: true, reading: null}), "position");
  assert.equal(toolAction({held: true, positioned: true, zeroed: true, reading: null}), "touch");
  assert.equal(toolAction({held: true, positioned: true, zeroed: true, reading: 200.18}), "record");
});

test("mode selection persists locally and safely falls back", () => {
  const map = new Map();
  const storage = {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value)
  };
  assert.equal(readToolMode(storage), "assisted");
  assert.equal(saveToolMode(storage, "free"), "free");
  assert.equal(map.get(TOOL_MODE_STORAGE_KEY), "free");
  assert.equal(readToolMode(storage), "free");
  assert.equal(saveToolMode(storage, "unknown"), "assisted");
  assert.equal(readToolMode({getItem: () => {throw Error("private");}}), "assisted");
  assert.equal(validToolMode("__proto__"), "assisted");
});
