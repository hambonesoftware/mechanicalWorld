/**
 * The tool-handling experiment is isolated from Three.js and the job rules.
 * A = free placement, B = magnetic placement, C = close-up assisted placement.
 * Distances below are normalized travel from the resting pose to the
 * measurement pose, not actual metrology units.
 */
export const TOOL_MODES = Object.freeze({
  free: Object.freeze({ id: "free", name: "Free grab", threshold: 0.92, closeup: false, assistance: false }),
  assisted: Object.freeze({ id: "assisted", name: "Assisted grab", threshold: 0.62, closeup: false, assistance: true }),
  closeup: Object.freeze({ id: "closeup", name: "Close-up", threshold: 0.72, closeup: true, assistance: true })
});
export const DEFAULT_TOOL_MODE = "assisted";
export const TOOL_MODE_STORAGE_KEY = "redline-tool-mode-v1";

export function validToolMode(mode) {
  return Object.prototype.hasOwnProperty.call(TOOL_MODES, mode) ? mode : DEFAULT_TOOL_MODE;
}
export function readToolMode(storage) {
  try { return validToolMode(storage?.getItem(TOOL_MODE_STORAGE_KEY)); }
  catch { return DEFAULT_TOOL_MODE; }
}
export function saveToolMode(storage, mode) {
  const next = validToolMode(mode);
  try { storage?.setItem(TOOL_MODE_STORAGE_KEY, next); } catch { /* private storage */ }
  return next;
}
export function clampPlacement(progress) {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}
export function travelFromDrag(initialProgress, leftwardPixels, availableTravelPixels) {
  if (!Number.isFinite(availableTravelPixels) || availableTravelPixels <= 0) return clampPlacement(initialProgress);
  return clampPlacement(initialProgress + leftwardPixels / availableTravelPixels);
}
export function placementResult(mode, progress) {
  const config = TOOL_MODES[validToolMode(mode)];
  const raw = clampPlacement(progress);
  const positioned = raw >= config.threshold;
  return Object.freeze({
    positioned,
    progress: positioned ? 1 : raw,
    magnetic: positioned && config.assistance
  });
}
export function toolAction({ held, positioned, zeroed, reading }) {
  if (reading !== null && reading !== undefined) return "record";
  if (!held) return "pickup";
  if (!zeroed) return "zero";
  if (!positioned) return "position";
  return "touch";
}
