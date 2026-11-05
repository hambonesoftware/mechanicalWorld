/**
 * Read-only SVG force/deflection playback for a single specimen test.
 * X: downward tip displacement (mm); Y: commanded force (kN) before rupture.
 * Colors identify load/unload/reload paths; the curve is not a fracture test.
 */
const NS = "http://www.w3.org/2000/svg";
function svgNode(tag, attributes = {}, text = "") {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  return node;
}
export function renderHistoryCurve(svg, entries, selectedIndex = null) {
  if (!svg || typeof svg.replaceChildren !== "function") return;
  svg.setAttribute("viewBox", "0 0 352 186");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Commanded force versus downward beam tip displacement with loading and unloading paths");
  const left = 43, top = 13, w = 295, h = 139;
  const grid = svgNode("g", { class: "cycle-grid" });
  const lines = [
    svgNode("line", { x1:left,y1:top,x2:left,y2:top+h }),
    svgNode("line", { x1:left,y1:top+h,x2:left+w,y2:top+h })
  ];
  lines.forEach(n=>grid.appendChild(n));
  svg.replaceChildren(grid);
  if (!entries.length) {
    svg.appendChild(svgNode("text", { x: 175, y: 89, "text-anchor":"middle", class:"cycle-empty" }, "Run a test to record the curve"));
    return;
  }
  const maxKN = Math.max(1, ...entries.map(x => x.forceKN)) * 1.08;
  const maxMM = Math.max(1, ...entries.map(x => Math.abs(x.tipMM))) * 1.10;
  const x = point => left + Math.abs(point.tipMM) / maxMM * w;
  const y = point => top + h - point.forceKN / maxKN * h;
  for (let i = 1; i <= 4; i++) {
    const gx = left + i * w / 4, gy = top + h - i * h / 4;
    grid.appendChild(svgNode("line", {x1:gx,y1:top,x2:gx,y2:top+h,class:"cycle-guide"}));
    grid.appendChild(svgNode("line", {x1:left,y1:gy,x2:left+w,y2:gy,class:"cycle-guide"}));
  }
  svg.appendChild(svgNode("text", {x:14,y:19,class:"cycle-axis"}, Math.round(maxKN)+" kN"));
  svg.appendChild(svgNode("text", {x:left+w,y:174,"text-anchor":"end",class:"cycle-axis"},maxMM.toFixed(1)+" mm"));
  svg.appendChild(svgNode("text", {x:14,y:top+h+4,class:"cycle-axis"}, "0"));
  const colors = { load:"#efc181", unload:"#68ddd1", reload:"#a3a9ff" };
  let run = [];
  let phase = entries[0].phase || "load";
  function drawRun() {
    if (!run.length) return;
    svg.appendChild(svgNode("polyline",{
      points:run.map(p=>x(p).toFixed(2)+","+y(p).toFixed(2)).join(" "),
      fill:"none",stroke:colors[phase]||colors.load,
      "stroke-width":3.1,"stroke-linecap":"round","stroke-linejoin":"round"
    }));
    run = [];
  }
  for (let i = 0; i < entries.length; i++) {
    const p = entries[i];
    if ((p.phase||"load") !== phase) {
      drawRun();
      phase=p.phase||"load";
      if (i>0) run.push(entries[i-1]);
    }
    run.push(p);
  }
  drawRun();
  const selected = entries[Math.max(0,Math.min(entries.length-1,selectedIndex??entries.length-1))];
  svg.appendChild(svgNode("circle",{cx:x(selected),cy:y(selected),r:6,fill:"#f8f1d7",stroke:"#1a2830","stroke-width":2}));
}

export function historyEntry(snapshot, phase) {
  return {
    phase, forceKN:snapshot.forceKN,
    tipMM:snapshot.tipDeflectionM*1000,
    residualMM:snapshot.permanentTipM*1000,
    peakKN:snapshot.peakKN,
    snapshot
  };
}
