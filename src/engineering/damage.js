/**
 * REDLINE's first gameplay damage envelope is an ILLUSTRATIVE overload model.
 *
 * A linear-elastic bending trial stress can identify first yield, but it cannot
 * predict ductile failure after yield. The thresholds below are art-directed
 * ratios scaled by nominal material strengths. They are not a nonlinear FEA,
 * calibrated ductile-damage model or real-world structural capacity estimate.
 *
 * Full commanded actuator load is allowed; after separation, it is NOT carried
 * by the specimen. The renderer is responsible for showing that distinction.
 */
import { MATERIALS, sectionProperties } from "./beam.js";

export function failureEnvelope(config) {
  const material = MATERIALS[config.material];
  if (!material) throw new RangeError("Unsupported material");
  if (!Number.isFinite(config.length) || config.length <= 0) throw new RangeError("Invalid span");
  const section = sectionProperties(config);
  const yieldLoadKN = (material.yieldStrength * section.inertia)
    / (section.outerFiber * config.length * 1000);
  // Nominal tensile ultimate strength is NOT a bending fracture criterion.
  const strengthRatio = material.ultimateStrength / material.yieldStrength;
  const fractureRatio = Math.max(1.45, strengthRatio);
  const crackRatio = 1 + (fractureRatio - 1) * 0.42;
  const tearRatio = 1 + (fractureRatio - 1) * 0.72;
  return {
    yieldLoadKN,
    crackLoadKN: yieldLoadKN * crackRatio,
    tearLoadKN: yieldLoadKN * tearRatio,
    ruptureLoadKN: yieldLoadKN * fractureRatio,
    fractureRatio,
    crackRatio,
    tearRatio
  };
}

function range01(v) {
  return Math.min(1, Math.max(0, v));
}

export function damageState(config, forceKN) {
  if (!Number.isFinite(forceKN) || forceKN < 0) throw new RangeError("Invalid load");
  const envelope = failureEnvelope(config);
  const ratio = forceKN / envelope.yieldLoadKN;
  const crackProgress = range01(
    (ratio - envelope.crackRatio) / (envelope.tearRatio - envelope.crackRatio)
  );
  const tearProgress = range01(
    (ratio - envelope.tearRatio) / (envelope.fractureRatio - envelope.tearRatio)
  );
  let stage = "elastic";
  if (ratio >= envelope.fractureRatio) stage = "ruptured";
  else if (ratio >= envelope.tearRatio) stage = "tearing";
  else if (ratio >= envelope.crackRatio) stage = "cracking";
  else if (ratio >= 1) stage = "yielding";
  return {
    ...envelope,
    ratio,
    stage,
    crackProgress,
    tearProgress,
    plasticVisual: range01((ratio - 1) / (envelope.fractureRatio - 1)),
    isBeyondElastic: ratio >= 1,
    isSeparated: stage === "ruptured"
  };
}

export function destructiveTargetKN(config, commandedLoadKN) {
  if (!Number.isFinite(commandedLoadKN) || commandedLoadKN < 0) {
    throw new RangeError("Invalid commanded load");
  }
  const envelope = failureEnvelope(config);
  return Math.max(commandedLoadKN, envelope.ruptureLoadKN * 1.09);
}

export function failureMilestones(config) {
  const env = failureEnvelope(config);
  return [
    { stage: "yielding", loadKN: env.yieldLoadKN },
    { stage: "cracking", loadKN: env.crackLoadKN },
    { stage: "tearing", loadKN: env.tearLoadKN },
    { stage: "ruptured", loadKN: env.ruptureLoadKN }
  ];
}
