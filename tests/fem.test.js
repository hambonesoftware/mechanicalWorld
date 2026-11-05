import test from "node:test";
import assert from "node:assert/strict";
import { STARTER, beamAnalysis } from "../src/engineering/beam.js";
import { solveBeamFEM } from "../src/engineering/fem.js";

test("FEAScript is installed and computes the beam response", () => {
  const solution = solveBeamFEM(STARTER, 10);
  const analytical = beamAnalysis(STARTER);
  assert.equal(solution.engine, "FEAScript FEM");
  assert.equal(solution.nodeCount, 11);
  assert.ok(Number.isFinite(solution.tipDeflectionM));
  assert.ok(Math.abs(solution.tipDeflectionM + analytical.tipDeflectionM) < analytical.tipDeflectionM * 0.015);
});

test("FEAScript tip deflection doubles when applied tip force doubles", () => {
  const first = solveBeamFEM({ ...STARTER, forceKN: 5 }, 8);
  const second = solveBeamFEM({ ...STARTER, forceKN: 10 }, 8);
  assert.ok(Math.abs(second.tipDeflectionM / first.tipDeflectionM - 2) < 0.005);
});

test("FEAScript clamp deflection is essentially zero", () => {
  const solution = solveBeamFEM(STARTER);
  assert.ok(Math.abs(solution.displacementAt(0)) < 1e-10);
});
