/**
 * Mechanics are SI throughout: metres, newtons, pascals, kilograms.
 * This is a linear-elastic, small-deflection Euler-Bernoulli cantilever.
 * Neither yield nor buckling/fracture is modeled in this module.
 */
export const MATERIALS = Object.freeze({
  steel: Object.freeze({
    key: "steel",
    name: "Structural steel",
    youngsModulus: 200e9,
    yieldStrength: 250e6,
    ultimateStrength: 400e6,
    density: 7850,
    color: 0x8796a3
  }),
  aluminum: Object.freeze({
    key: "aluminum",
    name: "Aluminum alloy",
    youngsModulus: 69e9,
    yieldStrength: 150e6,
    ultimateStrength: 260e6,
    density: 2700,
    color: 0xa7b3c4
  })
});

export const STARTER = Object.freeze({
  material: "steel",
  length: 2.0,
  depth: 0.2,
  width: 0.12,
  flangeThickness: 0.012,
  webThickness: 0.008,
  forceKN: 12,
  deformationScale: 2
});

export const CHALLENGES = Object.freeze([
  { label: "01 / FIRST PRINCIPLES", name: "The Cantilever", loadKN: 12, span: 2, targetFactor: 1.5, maxDeflectionMM: 12, description: "Hold 12 kN without yielding or flexing more than 12 mm." },
  { label: "02 / LIGHTWEIGHT", name: "Shave the Steel", loadKN: 16, span: 2.4, targetFactor: 1.5, maxDeflectionMM: 12, description: "Support 16 kN across 2.4 m, then reduce the mass." },
  { label: "03 / LONG REACH", name: "The Long Arm", loadKN: 20, span: 2.8, targetFactor: 1.5, maxDeflectionMM: 15, description: "Control deflection while carrying 20 kN across a long cantilever." }
]);

function validPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite value`);
  }
}

export function sectionProperties({ depth, width, flangeThickness, webThickness }) {
  [depth, width, flangeThickness, webThickness].forEach((value, index) => {
    validPositive(value, ["depth", "width", "flangeThickness", "webThickness"][index]);
  });
  if (2 * flangeThickness >= depth || webThickness >= width) {
    throw new RangeError("Invalid I-section: web and flanges must fit");
  }
  const innerDepth = depth - 2 * flangeThickness;
  const area = 2 * width * flangeThickness + innerDepth * webThickness;
  const inertia = (width * Math.pow(depth, 3) - (width - webThickness) * Math.pow(innerDepth, 3)) / 12;
  validPositive(inertia, "second moment of area");
  return { area, inertia, outerFiber: depth / 2 };
}

export function beamAnalysis(config, forceKN = config.forceKN) {
  const material = MATERIALS[config.material];
  if (!material) throw new RangeError("Unsupported material");
  validPositive(config.length, "length");
  if (!Number.isFinite(forceKN) || forceKN < 0) {
    throw new RangeError("forceKN must be a finite nonnegative value");
  }
  const { area, inertia, outerFiber } = sectionProperties(config);
  const forceN = forceKN * 1000;
  const EI = material.youngsModulus * inertia;
  const maxMoment = forceN * config.length;
  const maxStressPa = maxMoment * outerFiber / inertia;
  const tipDeflectionM = forceN * Math.pow(config.length, 3) / (3 * EI);
  const bendingStrain = maxStressPa / material.youngsModulus;
  const factorOfSafety = forceN === 0 ? Infinity : material.yieldStrength / maxStressPa;
  const massKG = area * config.length * material.density;
  return {
    material,
    area,
    inertia,
    EI,
    forceN,
    maxMoment,
    maxStressPa,
    tipDeflectionM,
    bendingStrain,
    factorOfSafety,
    massKG,
    yieldUtilization: maxStressPa / material.yieldStrength,
    displacementAt(x) {
      const position = Math.min(config.length, Math.max(0, x));
      return -forceN * position * position * (3 * config.length - position) / (6 * EI);
    },
    rotationAt(x) {
      const position = Math.min(config.length, Math.max(0, x));
      return -forceN * position * (2 * config.length - position) / (2 * EI);
    },
    stressAt(x, y) {
      const position = Math.min(config.length, Math.max(0, x));
      return -forceN * (config.length - position) * y / inertia;
    }
  };
}

export function checkChallenge(config, challenge, appliedKN = challenge.loadKN) {
  const result = beamAnalysis(config, appliedKN);
  const completedLoad = appliedKN >= challenge.loadKN - 1e-6;
  const meetsStrength = result.factorOfSafety >= challenge.targetFactor;
  const meetsStiffness = result.tipDeflectionM * 1000 <= challenge.maxDeflectionMM;
  const pass = completedLoad && meetsStrength && meetsStiffness;
  const efficiency = pass ? Math.max(0, Math.round(10000 / Math.max(1, result.massKG))) : 0;
  return { ...result, completedLoad, meetsStrength, meetsStiffness, pass, efficiency };
}
