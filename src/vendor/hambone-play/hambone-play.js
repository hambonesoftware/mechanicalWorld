/**
 * Hambone PLAY v1 — shared gameplay HUD primitives.
 * Framework-free; works with canvas, Three.js and existing DOM games.
 * Game logic, rendering and physics remain owned by each game.
 * See README.md for the vendoring/versioning contract.
 */
export const PLAY_VERSION = "1.0.0";
const ALLOWED_STYLES = new Set(["workbench", "broadcast", "arcade", "adventure"]);
const PHASES = new Set(["ready", "editing", "playing", "paused", "result"]);
const DENSITIES = new Set(["standard", "compact"]);

function number(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function calculateSafeRect(width, height, obstacles = [], edge = 10) {
  const W = Math.max(1, number(width, 1));
  const H = Math.max(1, number(height, 1));
  const bounds = { left: Math.max(0, edge), top: Math.max(0, edge), right: W - Math.max(0, edge), bottom: H - Math.max(0, edge) };
  const valid = obstacles.filter(r => r && Number.isFinite(r.left) && Number.isFinite(r.top) && Number.isFinite(r.right) && Number.isFinite(r.bottom));
  // Only edge-anchored elements reduce the camera frame. Floating popovers
  // and in-world markers are intentionally not allowed to collapse it.
  for (const r of valid) {
    const rw = Math.max(0, r.right - r.left);
    const rh = Math.max(0, r.bottom - r.top);
    if (r.top <= H * 0.20 && rw >= W * 0.29) {
      bounds.top = Math.max(bounds.top, Math.min(H * 0.49, r.bottom + edge));
    }
    if (r.bottom >= H * 0.80 && rw >= W * 0.29) {
      bounds.bottom = Math.min(bounds.bottom, Math.max(H * 0.52, r.top - edge));
    }
    if (r.left <= W * 0.12 && rh >= H * 0.46 && rw < W * 0.65) {
      bounds.left = Math.max(bounds.left, Math.min(W * 0.47, r.right + edge));
    }
    if (r.right >= W * 0.88 && rh >= H * 0.46 && rw < W * 0.65) {
      bounds.right = Math.min(bounds.right, Math.max(W * 0.53, r.left - edge));
    }
  }
  const result = {
    x: bounds.left,
    y: bounds.top,
    width: Math.max(1, bounds.right - bounds.left),
    height: Math.max(1, bounds.bottom - bounds.top)
  };
  result.centerX = result.x + result.width / 2;
  result.centerY = result.y + result.height / 2;
  return result;
}

export function shouldAnnounceChange(previous, next, options = {}) {
  if (previous === next) return false;
  const quiet = options.quiet ?? ["ready", "editing"];
  return !quiet.includes(next);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function uniqueMetrics(metrics) {
  const result = new Map();
  for (const item of metrics || []) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) continue;
    result.set(item.id, { label: String(item.label || item.id), value: String(item.value ?? "—") });
  }
  return result;
}

/**
 * createPlayHUD({ root, viewport, style, title, metrics, density, onSafeRect })
 * Client-owned lifecycle. Designed to fail loudly if mounted to the wrong
 * element, and avoids mutating gameplay-specific state or input events.
 */
export function createPlayHUD(options = {}) {
  const root = options.root;
  const viewport = options.viewport || root;
  if (!root || !viewport || typeof root.appendChild !== "function") {
    throw new TypeError("Hambone PLAY requires a root and a viewport element.");
  }
  const style = ALLOWED_STYLES.has(options.style) ? options.style : "workbench";
  const metrics = uniqueMetrics(options.metrics);
  const state = { phase: "ready", density: DENSITIES.has(options.density) ? options.density : "standard", title: String(options.title || ""), paused: false };
  const container = el("div", "hb-play hb-play--" + style);
  container.dataset.phase = state.phase;
  container.dataset.density = state.density;
  container.setAttribute("aria-label", state.title ? state.title + " game interface" : "Game interface");
  const scorebug = el("div", "hb-play__scorebug");
  const caption = el("div", "hb-play__identity", state.title);
  const readouts = el("div", "hb-play__readouts");
  const status = el("div", "hb-play__status");
  const statusText = el("span", "hb-play__status-text");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.appendChild(statusText);
  const announcement = el("div", "hb-play__announcement");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.hidden = true;
  const actions = el("div", "hb-play__actions");
  actions.setAttribute("role", "group");
  actions.setAttribute("aria-label", "Game actions");
  const utilities = el("div", "hb-play__utilities");
  utilities.setAttribute("role", "group");
  utilities.setAttribute("aria-label", "Game options");
  const tray = el("aside", "hb-play__tray");
  tray.setAttribute("aria-label", "Game tools");
  tray.hidden = true;
  const trayHeader = el("div", "hb-play__tray-head");
  const trayTitle = el("strong", "", "Tools");
  const trayClose = el("button", "hb-play__tray-close", "×");
  trayClose.type = "button";
  trayClose.setAttribute("aria-label", "Close tools");
  trayHeader.append(trayTitle, trayClose);
  const trayContent = el("div", "hb-play__tray-content");
  tray.append(trayHeader, trayContent);
  scorebug.append(caption, readouts);
  container.append(scorebug, utilities, status, announcement, actions, tray);
  root.appendChild(container);

  const metricNodes = new Map();
  for (const [id, item] of metrics) {
    const node = el("div", "hb-play__readout");
    node.dataset.metric = id;
    const key = el("span", "hb-play__readout-label", item.label);
    const value = el("strong", "hb-play__readout-value", item.value);
    node.append(key, value);
    readouts.appendChild(node);
    metricNodes.set(id, value);
  }
  const registered = new Set();
  const moved = [];
  let observers = [];
  let resizeObserver = null;
  let visualListener = null;
  let frameCallback = typeof options.onSafeRect === "function" ? options.onSafeRect : null;
  let framePending = false;
  let announceTimer = null;
  let lastFocus = null;
  const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setMetric(id, value) {
    const target = metricNodes.get(id);
    if (!target) return false;
    const text = String(value);
    if (target.textContent !== text) target.textContent = text;
    return true;
  }

  function setStatus(text, tone = "neutral") {
    statusText.textContent = String(text || "");
    status.dataset.tone = ["neutral", "positive", "warning", "danger"].includes(tone) ? tone : "neutral";
    status.hidden = !statusText.textContent;
  }

  function showEvent(message, config = {}) {
    clearTimeout(announceTimer);
    announcement.textContent = String(message || "");
    announcement.dataset.tone = String(config.tone || "neutral");
    announcement.hidden = !announcement.textContent;
    if (!announcement.hidden && config.duration !== 0) {
      announceTimer = setTimeout(() => {
        announcement.hidden = true;
      }, Math.max(reducedMotion ? 120 : 500, Math.min(10000, number(config.duration, 2200))));
    }
  }

  function setPhase(phase) {
    if (!PHASES.has(phase)) throw new RangeError("Unsupported HUD phase: " + phase);
    if (state.phase === phase) return;
    const previous = state.phase;
    state.phase = phase;
    container.dataset.phase = phase;
    if (shouldAnnounceChange(previous, phase) && typeof options.onPhaseChange === "function") {
      options.onPhaseChange(phase, previous);
    }
    scheduleSafeFrame();
  }

  function setDensity(density) {
    if (!DENSITIES.has(density)) throw new RangeError("Invalid density");
    state.density = density;
    container.dataset.density = density;
    scheduleSafeFrame();
  }

  function placeControl(node, location = "actions") {
    if (!node || typeof node.addEventListener !== "function") throw new TypeError("Expected a DOM control");
    const slot = location === "utilities" ? utilities : actions;
    const home = { node, parent: node.parentNode, nextSibling: node.nextSibling };
    moved.push(home);
    node.classList.add("hb-play__control");
    slot.appendChild(node);
    scheduleSafeFrame();
    return node;
  }

  function addAction({ label, id, className, onClick, location = "actions" } = {}) {
    if (typeof onClick !== "function") throw new TypeError("Action requires onClick");
    const button = el("button", "hb-play__control " + (className || ""), String(label || "Action"));
    button.type = "button";
    if (id) button.id = String(id);
    button.addEventListener("click", onClick);
    (location === "utilities" ? utilities : actions).appendChild(button);
    scheduleSafeFrame();
    return button;
  }

  function openTray({ title = "Tools", content } = {}) {
    if (!content || typeof content.nodeType !== "number") throw new TypeError("Tray requires a DOM Node");
    lastFocus = document.activeElement;
    trayTitle.textContent = String(title);
    trayContent.replaceChildren(content);
    tray.hidden = false;
    trayClose.focus();
    scheduleSafeFrame();
  }

  function closeTray() {
    if (tray.hidden) return;
    tray.hidden = true;
    trayContent.replaceChildren();
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    lastFocus = null;
    scheduleSafeFrame();
  }

  function registerOccluder(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") {
      throw new TypeError("Occluder must be an Element");
    }
    registered.add(node);
    scheduleSafeFrame();
    return () => { registered.delete(node); scheduleSafeFrame(); };
  }

  function getSafeRect() {
    const base = viewport.getBoundingClientRect();
    const rects = [scorebug, actions, status, tray, ...registered]
      .filter(node => node && node.isConnected && !node.hidden && getComputedStyle(node).display !== "none")
      .map(node => {
        const r = node.getBoundingClientRect();
        return {
          left: r.left - base.left, top: r.top - base.top,
          right: r.right - base.left, bottom: r.bottom - base.top
        };
      });
    return calculateSafeRect(base.width, base.height, rects, 10);
  }

  function notifySafeFrame() {
    framePending = false;
    if (frameCallback) frameCallback(getSafeRect());
  }

  function scheduleSafeFrame() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(notifySafeFrame);
  }

  function setSafeFrameCallback(callback) {
    frameCallback = typeof callback === "function" ? callback : null;
    scheduleSafeFrame();
  }

  function bindReadout(source, id, format = value => value) {
    if (!source || typeof source.textContent !== "string") throw new TypeError("Source must be a DOM element");
    if (!metricNodes.has(id)) throw new RangeError("Unknown metric: " + id);
    let scheduled = false;
    const update = () => {
      scheduled = false;
      setMetric(id, format(source.textContent.trim()));
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    });
    observer.observe(source, { childList: true, characterData: true, subtree: true });
    observers.push(observer);
    update();
    return () => {
      observer.disconnect();
      observers = observers.filter(o => o !== observer);
    };
  }

  const onKeyDown = (event) => {
    if (event.key === "Escape" && !tray.hidden) {
      event.stopPropagation();
      closeTray();
    }
  };
  trayClose.addEventListener("click", closeTray);
  root.addEventListener("keydown", onKeyDown);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(scheduleSafeFrame);
    resizeObserver.observe(viewport);
    resizeObserver.observe(container);
  }
  visualListener = scheduleSafeFrame;
  window.addEventListener("resize", visualListener, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener("resize", visualListener, { passive: true });
  scheduleSafeFrame();

  return {
    version: PLAY_VERSION,
    element: container,
    nodes: { scorebug, readouts, actions, utilities, tray, status, announcement },
    get phase() { return state.phase; },
    setPhase, setMetric, setStatus, showEvent, setDensity,
    placeControl, addAction, openTray, closeTray, registerOccluder,
    getSafeRect, setSafeFrameCallback, bindReadout,
    destroy() {
      clearTimeout(announceTimer);
      for (const obs of observers) obs.disconnect();
      observers = [];
      resizeObserver?.disconnect();
      root.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", visualListener);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", visualListener);
      for (let i = moved.length - 1; i >= 0; i -= 1) {
        const item = moved[i];
        item.node.classList.remove("hb-play__control");
        if (item.parent) item.parent.insertBefore(item.node, item.nextSibling?.parentNode === item.parent ? item.nextSibling : null);
      }
      container.remove();
    }
  };
}
