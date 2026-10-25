// Neaten an MV layout: every window becomes exactly 16:9 on one shared grid of equal cells, so small windows match, edges line up
// and the layout is centred in the 1920x1080 frame. A window can span k x k cells (a "big" window).
type R = { x: number; y: number; w: number; h: number };
const W = 1920, H = 1080;
function gridFor(C: number, R_: number) { const cw = Math.min(W / C, (H / R_) * 16 / 9), ch = cw * 9 / 16; return { cw, ch, ox: (W - cw * C) / 2, oy: (H - ch * R_) / 2 }; }
function fit(t: R[], C: number, Rn: number) {
  const { cw, ch, ox, oy } = gridFor(C, Rn), cells: [number, number, number][] = [], occ = new Set<string>();
  for (const a of t) {
    const k = Math.max(1, Math.round((a.w / cw + a.h / ch) / 2)); if (k > Math.min(C, Rn)) return null;
    const c = Math.min(Math.max(Math.round((a.x - ox) / cw), 0), C - k), r = Math.min(Math.max(Math.round((a.y - oy) / ch), 0), Rn - k);
    for (let i = c; i < c + k; i++) for (let j = r; j < r + k; j++) { const key = i + ',' + j; if (occ.has(key)) return null; occ.add(key); }
    cells.push([c, r, k]);
  }
  let iou = 0;
  t.forEach((a, i) => { const [c, r, k] = cells[i], x0 = ox + c * cw, y0 = oy + r * ch, x1 = x0 + k * cw, y1 = y0 + k * ch;
    const ix = Math.max(0, Math.min(x1, a.x + a.w) - Math.max(x0, a.x)), iy = Math.max(0, Math.min(y1, a.y + a.h) - Math.max(y0, a.y)); iou += ix * iy / ((x1 - x0) * (y1 - y0) + a.w * a.h - ix * iy); });
  const cover = cells.reduce((s, [, , k]) => s + k * k, 0) * cw * ch / (W * H);
  return { score: iou / t.length + 0.8 * cover, cells, cw, ch, ox, oy };
}
/** Returns the neat positions (same order as the input), or null when the layout can't be placed on a clean grid. */
export function neatenTiles(t: R[]): R[] | null {
  if (!t.length) return null; let best: ReturnType<typeof fit> = null;
  for (let C = 1; C <= 8; C++) for (let Rn = 1; Rn <= 8; Rn++) { const f = fit(t, C, Rn); if (f && (!best || f.score > best.score)) best = f; }
  if (!best) return null; const b = best;
  return b.cells.map(([c, r, k]) => ({ x: Math.round(b.ox + c * b.cw), y: Math.round(b.oy + r * b.ch), w: Math.round(k * b.cw), h: Math.round(k * b.ch) }));
}
/** Use the hand-checked version when this layout's name is one of the built-in ones; otherwise fall back to neatenTiles. */
export function neatenWithPreset(t: R[], preset?: R[]): R[] | null {
  if (preset && preset.length === t.length) { // match each window to the nearest preset window so numbers and tiles stay with their place
    const free = preset.map((p, i) => i), out: R[] = new Array(t.length);
    const order = t.map((a, i) => i).sort((i, j) => t[j].w * t[j].h - t[i].w * t[i].h);
    for (const i of order) { const cx = t[i].x + t[i].w / 2, cy = t[i].y + t[i].h / 2; let bj = free[0], bd = Infinity;
      for (const j of free) { const p = preset[j], d = (p.x + p.w / 2 - cx) ** 2 + (p.y + p.h / 2 - cy) ** 2; if (d < bd) { bd = d; bj = j; } }
      free.splice(free.indexOf(bj), 1); out[i] = { x: preset[bj].x, y: preset[bj].y, w: preset[bj].w, h: preset[bj].h }; }
    return out;
  }
  return neatenTiles(t);
}

/** For free-form designs (Tile Designer): edges that are nearly level are made exactly level, small gaps and overlaps are closed and edges near the border sit on it. Sizes stay as drawn apart from that. */
export function neatenEdges(t: R[], Wd = W, Hd = H, T = 24): R[] {
  const snap = (vals: number[], max: number) => {
    const all = [...new Set([0, max, ...vals])].sort((a, b) => a - b), map = new Map<number, number>(); let g: number[] = [];
    const flush = () => { if (!g.length) return; const v = g.includes(0) ? 0 : g.includes(max) ? max : Math.round(g.reduce((s, n) => s + n, 0) / g.length); g.forEach(n => map.set(n, v)); g = []; };
    for (const v of all) { if (g.length && v - g[0] > T) flush(); g.push(v); } flush(); return map;
  };
  const mx = snap(t.flatMap(a => [a.x, a.x + a.w]), Wd), my = snap(t.flatMap(a => [a.y, a.y + a.h]), Hd);
  return t.map(a => { const x = mx.get(a.x)!, y = my.get(a.y)!; return { x, y, w: Math.max(20, mx.get(a.x + a.w)! - x), h: Math.max(20, my.get(a.y + a.h)! - y) }; });
}
