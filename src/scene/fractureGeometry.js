/**
 * Progressive geometric separation of an I-section at its highly strained root.
 *
 * This is a gameplay fracture-geometry model, not a calibrated damage or
 * crack-growth mechanics model. Each layer is continuous until the damage
 * front reaches it. Failed layers become two genuinely disconnected meshes
 * with exposed, rough cut faces and a gradually opening slit.
 *
 * The exact same band layout and opening field is used by the hanging beam
 * and by both rigid fragments at final separation. No surface-only "crack
 * decal" or swapping to a new straight beam is involved.
 */
export function sectionFractureBands(config) {
  const h = config.depth, f = config.flangeThickness;
  const webHeight = h - 2 * f;
  if (!(h > 2 * f && f > 0 && config.width > 0 && config.webThickness > 0)) {
    throw new RangeError("Invalid I-section for layered fracture");
  }
  const bands = [];
  function push(region, top, bottom, width, count) {
    const dy = (top - bottom) / count;
    for (let j = 0; j < count; j++) {
      const high = top - dy * j;
      const low = high - dy;
      bands.push({
        region,
        centerY: (high + low) / 2,
        height: high - low,
        width,
        index: bands.length
      });
    }
  }
  push("top-flange", h / 2, h / 2 - f, config.width, 4);
  push("web", h / 2 - f, -h / 2 + f, config.webThickness, 9);
  push("bottom-flange", -h / 2 + f, -h / 2, config.width, 4);
  return bands.map((b, i) => ({
    ...b,
    failureThreshold: (i + 0.35) / bands.length
  }));
}

export function geometryFractureFront(damage) {
  if (!damage) return 0;
  const crack = Math.min(1, Math.max(0, Number(damage.crackProgress) || 0));
  const tear = Math.min(1, Math.max(0, Number(damage.tearProgress) || 0));
  if (damage.isSeparated) return 1;
  // First the upper flange, then the web and surviving lower ligament.
  return Math.min(1, 0.26 * crack + 0.74 * tear);
}

export function fractureOpening(front, threshold) {
  if (!Number.isFinite(front) || !Number.isFinite(threshold)) {
    throw new RangeError("Invalid damage front");
  }
  if (front <= threshold) return 0;
  // 1-6 cm visually opening slit at the root: small enough that it does
  // not teleport the free end yet distinct even on a phone screen.
  return 0.002 + 0.062 * Math.sqrt(Math.max(0, front - threshold));
}

export function fractureCutX(config) {
  return Math.min(0.23, config.length * 0.22);
}

export function cutFaceOffset(localY, localZ) {
  // Stable, small-scale jaggedness. Both exposed faces use the same offset,
  // preserving a coherent original seam before they pull apart.
  return 0.003 * Math.sin(localY * 83 + localZ * 49) +
    0.0015 * Math.cos(localY * 167 - localZ * 73);
}

export function fractureVertexOffset(x, localY, localZ, cutX, opening, freeSide) {
  if (opening <= 0) return { x: 0, y: 0 };
  const distance = Math.abs(x - cutX);
  const jagged = cutFaceOffset(localY, localZ) *
    Math.max(0, 1 - distance / 0.085);
  if (!freeSide) return { x: jagged, y: 0 };
  const fade = Math.exp(-Math.max(0, x - cutX) / 0.24);
  return {
    x: jagged + opening * fade,
    y: -opening * 0.20 * fade
  };
}

/**
 * Used by rendering and tests. bands after the front remain truly connected;
 * failed bands have two separate capped solids. At front 1 every band is cut.
 */
export function fractureBandPlan(config, damage) {
  const front = geometryFractureFront(damage);
  return sectionFractureBands(config).map(b => ({
    ...b,
    opening: fractureOpening(front, b.failureThreshold),
    split: front > b.failureThreshold
  }));
}
