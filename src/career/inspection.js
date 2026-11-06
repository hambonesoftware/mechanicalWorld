/**
 * REDLINE career-mode work order data, assessment and durable progress.
 * Pure functions are deliberately separate from the Three.js renderer and DOM.
 * All dimensions are millimetres. The parts are fictional training specimens.
 */
export const CAREER_STORAGE_KEY = "redline-career-v1";

export const FEATURES = Object.freeze([
  Object.freeze({
    id: "height",
    label: "Overall height",
    nominal: 200,
    tolerance: 0.5,
    actual: 200.18,
    tool: "caliper",
    maxOpening: 250,
    contactWindow: 7,
    instruction: "Use the outside jaws across the full section height."
  }),
  Object.freeze({
    id: "flange",
    label: "Flange width",
    nominal: 120,
    tolerance: 0.5,
    actual: 119.76,
    tool: "caliper",
    maxOpening: 150,
    contactWindow: 5,
    instruction: "Place the jaws across the upper flange width."
  }),
  Object.freeze({
    id: "web",
    label: "Web thickness",
    nominal: 8,
    tolerance: 0.2,
    actual: 8.32,
    tool: "micrometer",
    maxOpening: 15,
    contactWindow: 1.2,
    instruction: "Use the micrometer across the web, away from the fillets."
  })
]);

export const WORK_ORDERS = Object.freeze([
  Object.freeze({ id: "WO-001", title: "Incoming inspection", xp: 100 }),
  Object.freeze({ id: "WO-002", title: "Proof-load test", xp: 150 })
]);

export function isWithinTolerance(feature, reading) {
  return Number.isFinite(reading) &&
    reading >= feature.nominal - feature.tolerance - 1e-8 &&
    reading <= feature.nominal + feature.tolerance + 1e-8;
}

export function expectedDisposition(features = FEATURES) {
  return features.every(feature => isWithinTolerance(feature, feature.actual)) ? "ACCEPT" : "REJECT";
}

/**
 * The measuring tool must be zeroed, correct for the feature, and brought
 * close enough to contact before the game can seat its jaws and reveal a
 * deterministic digital reading. This prevents answer-by-button-spamming.
 */
export function canSeat(feature, tool, zeroed, opening) {
  if (!feature || tool !== feature.tool || !zeroed || !Number.isFinite(opening)) return false;
  return Math.abs(opening - feature.actual) <= feature.contactWindow;
}

export function assessInspection(readings, disposition, features = FEATURES) {
  const errors = {};
  for (const feature of features) {
    const raw = readings?.[feature.id];
    const value = raw === "" || raw == null ? NaN : Number(raw);
    if (!Number.isFinite(value)) {
      errors[feature.id] = "Record the instrument reading.";
    } else if (Math.abs(value - feature.actual) > 0.051) {
      errors[feature.id] = "Recorded value does not match the measured reading.";
    }
  }
  if (disposition !== "ACCEPT" && disposition !== "REJECT") {
    errors.disposition = "Choose ACCEPT or REJECT.";
  } else if (disposition !== expectedDisposition(features)) {
    errors.disposition = "Check the drawing limits. One incorrect dimension means REJECT.";
  }
  return { pass: Object.keys(errors).length === 0, errors, expected: expectedDisposition(features) };
}

export function initialCareer() {
  return { version: 1, completed: [], xp: 0 };
}

export function normalizeCareer(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.completed)) return initialCareer();
  const known = WORK_ORDERS.filter(order => data.completed.includes(order.id)).map(order => order.id);
  const xp = WORK_ORDERS.filter(order => known.includes(order.id))
    .reduce((total, order) => total + order.xp, 0);
  return { version: 1, completed: known, xp };
}

export function readCareer(storage) {
  try {
    return normalizeCareer(JSON.parse(storage?.getItem(CAREER_STORAGE_KEY) || "null"));
  } catch {
    return initialCareer();
  }
}

export function careerRank(progress) {
  return WORK_ORDERS.every(order => progress.completed.includes(order.id))
    ? "Junior Technician" : "Engineering Trainee";
}

export function completeWorkOrder(storage, id) {
  const order = WORK_ORDERS.find(item => item.id === id);
  if (!order) throw new RangeError("Unknown work order");
  const current = readCareer(storage);
  if (current.completed.includes(id)) return { progress: current, newlyCompleted: false };
  const next = normalizeCareer({ version: 1, completed: [...current.completed, id] });
  try {
    storage?.setItem(CAREER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private or full storage must not prevent finishing a game session.
  }
  return { progress: next, newlyCompleted: true };
}
