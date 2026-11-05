import test from "node:test";
import assert from "node:assert/strict";
import { beamAnalysis, sectionProperties, STARTER, checkChallenge, CHALLENGES } from "../src/engineering/beam.js";

function near(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

test("I-beam area and second moment match hand calculation", () => {
  const section = sectionProperties(STARTER);
  near(section.area, 0.004288, 1e-10);
  near(section.inertia, 0.000029117, 0.00000001);
});

test("2 m cantilever at 10 kN matches reference stress and tip deflection", () => {
  const result = beamAnalysis(STARTER, 10);
  near(result.maxStressPa / 1e6, 68.7, 0.25);
  near(result.tipDeflectionM * 1000, 4.58, 0.03);
  near(result.factorOfSafety, 250 / 68.7, 0.02);
  near(result.displacementAt(0), 0, 1e-12);
  near(result.displacementAt(STARTER.length), -result.tipDeflectionM, 1e-11);
});

test("linearity in applied load holds only in the modeled elastic regime", () => {
  const a = beamAnalysis(STARTER, 4);
  const b = beamAnalysis(STARTER, 8);
  near(b.tipDeflectionM / a.tipDeflectionM, 2, 1e-12);
  near(b.maxStressPa / a.maxStressPa, 2, 1e-12);
});

test("longer beam is more flexible and stiffer material deflects less", () => {
  const original = beamAnalysis(STARTER);
  const longBeam = beamAnalysis({ ...STARTER, length: 3 });
  const aluminum = beamAnalysis({ ...STARTER, material: "aluminum" });
  assert.ok(longBeam.tipDeflectionM > original.tipDeflectionM);
  assert.ok(aluminum.tipDeflectionM > original.tipDeflectionM);
});

test("zero load produces no stress or deflection", () => {
  const result = beamAnalysis(STARTER, 0);
  assert.equal(result.maxStressPa, 0);
  assert.equal(result.tipDeflectionM, 0);
  assert.equal(result.factorOfSafety, Infinity);
});

test("incorrect physical dimensions and negative loads are rejected", () => {
  assert.throws(() => sectionProperties({ ...STARTER, flangeThickness: 0.12 }), RangeError);
  assert.throws(() => beamAnalysis({ ...STARTER, material: "unknown" }), RangeError);
  assert.throws(() => beamAnalysis(STARTER, -5), RangeError);
});

test("challenge pass requires target load, strength and stiffness", () => {
  const challenge = CHALLENGES[0];
  assert.equal(checkChallenge(STARTER, challenge, 0).pass, false);
  assert.equal(checkChallenge(STARTER, challenge, challenge.loadKN).pass, true);
  const slender = { ...STARTER, depth: 0.08, flangeThickness: 0.005, webThickness: 0.004 };
  assert.equal(checkChallenge(slender, challenge, challenge.loadKN).pass, false);
});
