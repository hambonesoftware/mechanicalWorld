/**
 * Visual deformation constraints for the REDLINE beam scene.
 *
 * The fiber solver computes the unconstrained beam displacement. The scene
 * exaggerates that displacement for teaching; without a display constraint
 * heavy display exaggeration can penetrate the machine's top plate even though the beam
 * never contacts a physical floor in the 1D bending model.
 *
 * These functions act ONLY on the 3D display. They do not change measured
 * force, stress, material history, predicted permanent set, or failure loads.
 * Geometry is progressively compressed toward clearance rather than clamped
 * suddenly. The crack and detached mesh use this SAME pose field.
 */
export const DISPLAY_FLOOR_TOP = 0.28;
export const DISPLAY_CLEARANCE_M = 0.065;

export function beamVisualPose(config, solution, x, options = {}) {
  const beamY = options.beamY ?? 1.42;
  const floorTop = options.floorTop ?? DISPLAY_FLOOR_TOP;
  const clearance = options.clearance ?? DISPLAY_CLEARANCE_M;
  const length = config.length;
  if (!Number.isFinite(length) || length <= 0) throw new RangeError("Invalid span");
  const position = Math.max(0, Math.min(length, x));
  const maxDownward = beamY - floorTop - config.depth / 2 - clearance;
  if (!(maxDownward > 0)) throw new RangeError("Insufficient machine clearance");
  const hasPlastic = Number.isFinite(solution.maxPlasticStrain);
  // Preserve the teaching slider but limit extreme cartoon bending.
  // Numerical tip deflection, permanent set and stress remain unchanged.
  const deformationScale = Math.min(3, Math.max(1, config.deformationScale));
  const visualExtra = hasPlastic ? 0 : (options.plasticVisual ?? 0) * 0.12 * (position / length) ** 1.4;
  const raw = solution.displacementAt(position) * deformationScale - visualExtra;
  const slope = (solution.rotationAt
    ? solution.rotationAt(position)
    : options.rotationAt?.(position) ?? 0) * deformationScale;
  // For compression of negative bends, d[limit*tanh(raw/limit)]/dx =
  // sech²(raw/limit) * d(raw)/dx. This flattens the beam naturally as
  // exaggerated deformation approaches the platform.
  const saturated = raw < 0;
  const ratio = saturated ? -raw / maxDownward : 0;
  const slopeScale = saturated ? 1 / Math.cosh(Math.min(30, ratio)) ** 2 : 1;
  const displacement = saturated ? -maxDownward * Math.tanh(ratio) : raw;
  const rotation = Math.atan(slope * slopeScale);
  return {
    displacement,
    rotation,
    maxDownward,
    floorTop,
    beamY,
    displayCompressed: saturated && ratio > 0.45,
    // Minimum conservative bottom-fiber y when local section rotates.
    bottomSurfaceY: beamY + displacement - config.depth / 2
  };
}

/**
 * Map a local section point onto the curved beam. Returned values are in
 * beam coordinates (the clamp origin is still x=0, y=0).
 */
export function beamVisualPoint(config, solution, x, localY, options = {}) {
  const pose = beamVisualPose(config, solution, x, options);
  return {
    x: x - Math.sin(pose.rotation) * localY,
    y: pose.displacement + Math.cos(pose.rotation) * localY,
    z: 0,
    pose
  };
}

/**
 * A detached mesh must start at exactly the same world-space coordinates as
 * the attached mesh, regardless of fragment origin. This is the transform
 * shared by intact, root and moving-fragment geometries.
 */
export function fragmentVisualPoint(config, solution, x, localY, originX, originDisplacement, options = {}) {
  const point = beamVisualPoint(config, solution, x, localY, options);
  return {
    x: point.x - originX,
    y: point.y - originDisplacement,
    z: point.z
  };
}
