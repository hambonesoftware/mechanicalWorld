/**
 * REDLINE v2: small-deflection, one-dimensional elastoplastic cantilever.
 *
 * The cantilever is statically determinate, so M(x) = F (L-x) even as its
 * flexural stiffness changes. At each longitudinal station, a layered
 * I-section integrates a bilinear isotropically hardening uniaxial
 * stress/strain law. A local Newton solve enforces moment equilibrium.
 * Curvature is integrated to recover the rotation and tip displacement.
 *
 * Previous fiber plastic strains and accumulated plastic strain are retained
 * across load steps; this is why unloading leaves a permanent deformation.
 * It is NOT a geometric-nonlinear 3D FEA, cyclic Bauschinger model,
 * calibrated damage/fracture law, buckling model, or design code check.
 */
import { MATERIALS, sectionProperties } from "./beam.js";

const DEFAULT_SEGMENTS = 40;
const EPS = 1e-12;

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 8 || value > 200) {
    throw new RangeError(label + " must be an integer from 8 to 200");
  }
}
function fiberMesh(config) {
  const f = config.flangeThickness;
  const h = config.depth;
  const halfWeb = (h - 2 * f) / 2;
  const bands = [
    { low: -h / 2, high: -halfWeb, width: config.width, count: 6 },
    { low: -halfWeb, high: halfWeb, width: config.webThickness, count: 20 },
    { low: halfWeb, high: h / 2, width: config.width, count: 6 }
  ];
  const fibers = [];
  for (const band of bands) {
    const dy = (band.high - band.low) / band.count;
    for (let k = 0; k < band.count; k++) {
      fibers.push({ y: band.low + (k + 0.5) * dy, area: band.width * dy });
    }
  }
  return fibers;
}

function materialHardening(material, tangentRatio) {
  // Convert desired post-yield slope Et into uniaxial isotropic H.
  const Et = material.youngsModulus * tangentRatio;
  return material.youngsModulus * Et / (material.youngsModulus - Et);
}

function integrateFibers(curvature, fibers, oldP, oldA, E, fy, H) {
  let moment = 0, stiffness = 0, maxStress = 0, maxPlastic = 0, maxStrain = 0;
  const p = new Float64Array(fibers.length);
  const a = new Float64Array(fibers.length);
  const stress = new Float64Array(fibers.length);
  for (let i = 0; i < fibers.length; i++) {
    const f = fibers[i];
    const strain = curvature * f.y;
    const trial = E * (strain - oldP[i]);
    const overstress = Math.abs(trial) - (fy + H * oldA[i]);
    let tangent = E, sigma = trial;
    if (overstress > 0) {
      const flow = Math.sign(trial);
      const gamma = overstress / (E + H);
      p[i] = oldP[i] + gamma * flow;
      a[i] = oldA[i] + gamma;
      sigma = trial - E * gamma * flow;
      tangent = E * H / (E + H);
    } else {
      p[i] = oldP[i];
      a[i] = oldA[i];
    }
    stress[i] = sigma;
    moment += sigma * f.y * f.area;
    stiffness += tangent * f.y * f.y * f.area;
    maxStress = Math.max(maxStress, Math.abs(sigma));
    maxPlastic = Math.max(maxPlastic, a[i]);
    maxStrain = Math.max(maxStrain, Math.abs(strain));
  }
  return { moment, stiffness, p, a, stress, maxStress, maxPlastic, maxStrain };
}

function solveStation(targetMoment, previous, fibers, E, fy, H, elasticEI) {
  // Trial curvature at the previous state, followed by a consistent-tangent
  // Newton solve. This handles loading, unloading, and reload reversals.
  let kappa = previous.curvature + (targetMoment - previous.moment) / elasticEI;
  let evaluated;
  for (let iteration = 0; iteration < 36; iteration++) {
    evaluated = integrateFibers(kappa, fibers, previous.p, previous.a, E, fy, H);
    const residual = evaluated.moment - targetMoment;
    if (Math.abs(residual) <= Math.max(0.02, Math.abs(targetMoment) * 1e-9)) {
      return {
        curvature: kappa, moment: evaluated.moment,
        p: evaluated.p, a: evaluated.a, stress: evaluated.stress,
        maxStress: evaluated.maxStress,
        maxPlastic: evaluated.maxPlastic, maxStrain: evaluated.maxStrain
      };
    }
    if (!Number.isFinite(evaluated.stiffness) || evaluated.stiffness < EPS) {
      throw new Error("Elastoplastic section lost tangent stiffness");
    }
    const change = residual / evaluated.stiffness;
    kappa -= change;
    if (!Number.isFinite(kappa) || Math.abs(kappa) > 20) {
      throw new Error("Elastoplastic curvature outside supported range");
    }
  }
  throw new Error("Elastoplastic section did not converge");
}

function sampleFromStations(stations, length, dx) {
  const curvatures = stations.map(s => s.curvature);
  const stresses = stations.map(s => Array.from(s.stress));
  let tip = 0, rootRotation = 0;
  for (let i = 0; i < curvatures.length; i++) {
    const xmid = (i + 0.5) * dx;
    tip -= (length - xmid) * curvatures[i] * dx;
    rootRotation -= curvatures[i] * dx;
  }
  function displacementAt(x) {
    const limit = Math.max(0, Math.min(length, x));
    let result = 0;
    for (let i = 0; i < curvatures.length; i++) {
      const a = i * dx, b = Math.min(limit, (i + 1) * dx);
      if (limit <= a) break;
      // Exact integral of (x-s) for constant-curvature segment.
      result -= curvatures[i] * ((limit - a) ** 2 - (limit - b) ** 2) / 2;
    }
    return result;
  }
  function rotationAt(x) {
    const limit = Math.max(0, Math.min(length, x));
    let result = 0;
    for (let i = 0; i < curvatures.length; i++) {
      const a = i * dx;
      if (limit <= a) break;
      result -= curvatures[i] * Math.min(dx, limit - a);
    }
    return result;
  }
  return {
    displacementAt, rotationAt, tipDeflectionM: tip, tipRotationRad: rootRotation,
    curvatures, stresses
  };
}

export function createPlasticBeam(config, options = {}) {
  const material = MATERIALS[config.material];
  if (!material) throw new RangeError("Unsupported beam material");
  if (!Number.isFinite(config.length) || config.length <= 0) {
    throw new RangeError("Invalid beam length");
  }
  sectionProperties(config);
  const segments = options.segments ?? DEFAULT_SEGMENTS;
  positiveInteger(segments, "segments");
  const ratio = options.hardeningRatio ?? 0.015;
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 0.2) {
    throw new RangeError("Hardening ratio must be between 0 and 0.2");
  }
  const E = material.youngsModulus;
  const fy = material.yieldStrength;
  const H = materialHardening(material, ratio);
  const fibers = fiberMesh(config);
  const Iquad = fibers.reduce((sum, fiber) => sum + fiber.area * fiber.y * fiber.y, 0);
  const EI = E * Iquad;
  const dx = config.length / segments;
  const empty = () => ({
    curvature: 0, moment: 0,
    p: new Float64Array(fibers.length), a: new Float64Array(fibers.length),
    stress: new Float64Array(fibers.length), maxStress: 0, maxPlastic: 0, maxStrain: 0
  });
  let stations = Array.from({ length: segments }, empty);
  let loadKN = 0, peakKN = 0, plasticMax = 0, strainMax = 0, stressMax = 0;
  let solution = sampleFromStations(stations, config.length, dx);

  const current = () => ({
    forceKN: loadKN, peakKN, tipDeflectionM: solution.tipDeflectionM,
    tipRotationRad: solution.tipRotationRad,
    displacementAt: solution.displacementAt,
    rotationAt: solution.rotationAt,
    stressAt(x, y) {
      const i = Math.max(0, Math.min(segments - 1, Math.floor(x / dx)));
      const data = solution.stresses[i];
      let j = 0, distance = Infinity;
      for (let f = 0; f < fibers.length; f++) {
        const diff = Math.abs(fibers[f].y - y);
        if (diff < distance) { j = f; distance = diff; }
      }
      return data[j];
    },
    maxStressPa: stressMax,
    maxStrain: strainMax,
    maxPlasticStrain: plasticMax,
    permanentTipM: permanentTip,
    engine: "Fiber elastoplastic beam",
    nodeCount: segments + 1,
    // Snapshots are plain numerical arrays, not mutable references into the
    // solver. Replay can reconstruct the original geometry without changing
    // material history or advancing the current simulation.
    curvatures: Array.from(solution.curvatures),
    stresses: solution.stresses.map(s => Array.from(s)),
    fibers: fibers.map(f => f.y),
    length: config.length
  });

  let permanentTip = 0;
  function stepTo(targetKN) {
    if (!Number.isFinite(targetKN) || targetKN < 0) {
      throw new RangeError("Load must be nonnegative finite kN");
    }
    const next = stations.map((old, i) => {
      const midx = (i + 0.5) * dx;
      const M = targetKN * 1000 * (config.length - midx);
      return solveStation(M, old, fibers, E, fy, H, EI);
    });
    stations = next;
    loadKN = targetKN;
    peakKN = Math.max(peakKN, targetKN);
    stressMax = Math.max(...next.map(s => s.maxStress));
    plasticMax = Math.max(...next.map(s => s.maxPlastic));
    strainMax = Math.max(...next.map(s => s.maxStrain));
    solution = sampleFromStations(stations, config.length, dx);
    if (targetKN === 0) permanentTip = solution.tipDeflectionM;
    return current();
  }
  return {
    stepTo,
    snapshot: current,
    get loadKN() { return loadKN; },
    get peakKN() { return peakKN; },
    get hasPlasticSet() { return plasticMax > 1e-12; }
  };
}

/** Reconstruct a recorded step for replay without altering the physical solver. */
export function replayPlasticSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.curvatures) || !snapshot.curvatures.length ||
      !Number.isFinite(snapshot.length) || snapshot.length <= 0) {
    throw new TypeError("Invalid beam history snapshot");
  }
  const dx = snapshot.length / snapshot.curvatures.length;
  const stations = snapshot.curvatures.map((curvature, i) => ({
    curvature, stress: snapshot.stresses[i]
  }));
  const view = sampleFromStations(stations, snapshot.length, dx);
  return {
    ...snapshot,
    ...view,
    stressAt(x,y) {
      const i = Math.max(0,Math.min(stations.length - 1,Math.floor(x/dx)));
      let closest=0,near=Infinity;
      for(let j=0;j<snapshot.fibers.length;j++){
        const d=Math.abs(y-snapshot.fibers[j]);
        if(d<near){near=d;closest=j;}
      }
      return snapshot.stresses[i][closest];
    }
  };
}
