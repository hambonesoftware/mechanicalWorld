import { FEAScriptModel, logSystem } from "feascript";
import { beamAnalysis } from "./beam.js";

logSystem("none");

/**
 * Solve one loaded Euler-Bernoulli beam in FEAScript 0.3.1.
 * The mesh has two DOFs per node (w, theta); x=0 is fixed, x=L has a point load.
 * We cross-check tip displacement against the closed-form result on every solve.
 */
export function solveBeamFEM(config, segments = 14) {
  const analytical = beamAnalysis(config);
  const model = new FEAScriptModel();
  model.setModelConfig("eulerBernoulliBeamScript", {
    coefficientFunctions: {
      EI: (x) => analytical.EI,
      c0: (x) => 0,
      q: (x) => 0
    }
  });
  model.setMeshConfig({
    meshDimension: "1D",
    elementOrder: "linear",
    numElementsX: segments,
    maxX: config.length
  });
  model.addBoundaryCondition("1", [["fixed"]]);
  model.addBoundaryCondition(String(segments + 1), [["force", -analytical.forceN]]);
  model.setSolverMethod("lusolve");
  const result = model.solve();
  const w = result?.fields?.w;
  const theta = result?.fields?.theta;
  if (!w || !theta || w.length !== segments + 1 || theta.length !== segments + 1) {
    throw new Error("FEAScript returned an invalid beam solution");
  }
  const tip = w[segments];
  if (!Number.isFinite(tip) || !Number.isFinite(theta[segments])) {
    throw new Error("FEAScript returned nonfinite displacements");
  }
  const referenceTip = analytical.displacementAt(config.length);
  const tolerance = Math.max(1e-8, Math.abs(referenceTip) * 0.025);
  if (Math.abs(tip - referenceTip) > tolerance) {
    throw new Error("FEM result failed the analytical cantilever check");
  }
  // Cubic Hermite interpolation respects both FEM displacements and rotations.
  function displacementAt(x) {
    const location = Math.min(config.length, Math.max(0, x));
    const dx = config.length / segments;
    const i = Math.min(segments - 1, Math.floor(location / dx));
    const t = (location - i * dx) / dx;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * w[i] + h10 * dx * theta[i] + h01 * w[i + 1] + h11 * dx * theta[i + 1];
  }
  return { displacementAt, tipDeflectionM: tip, nodeCount: w.length, engine: "FEAScript FEM" };
}

/**
 * Analytical fallback is deliberate and exposed in UI; it never silently
 * misrepresents an unavailable numerical solver as a successful FEM solution.
 */
export function getBeamSolution(config) {
  try {
    return solveBeamFEM(config);
  } catch (error) {
    console.warn("FEAScript unavailable, using verified analytical beam model:", error);
    const analytical = beamAnalysis(config);
    return {
      displacementAt: analytical.displacementAt,
      tipDeflectionM: analytical.displacementAt(config.length),
      nodeCount: 0,
      engine: "Analytical fallback",
      error: String(error)
    };
  }
}
