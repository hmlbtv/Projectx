// Neaten an MV layout (every window ends up exactly 16:9, and the layout is spread evenly over the frame): edges that are almost level are made exactly level, small gaps and small overlaps between windows are closed,
// and edges close to the frame border are pulled onto it. Bigger gaps/overlaps are left as the designer drew them.
export function tidyTiles<T extends { x: number; y: number; w: number; h: number }>(tiles: T[], W = 1920, H = 1080, T = 56): T[] {
  const snap = (vals: number[], max: number) => {
    const all = [...new Set([0, max, ...vals])].sort((a, b) => a - b), map = new Map<number, number>();
    let grp: number[] = [];
    const flush = () => { if (!grp.length) return; const v = grp.includes(0) ? 0 : grp.includes(max) ? max : Math.round(grp.reduce((s, n) => s + n, 0) / grp.length); grp.forEach(g => map.set(g, v)); grp = []; };
    for (const v of all) { if (grp.length && v - grp[0] > T) flush(); grp.push(v); }
    flush(); return map;
  };
  const mx = snap(tiles.flatMap(t => [t.x, t.x + t.w]), W), my = snap(tiles.flatMap(t => [t.y, t.y + t.h]), H);
  const slots = tiles.map(t => { const x = mx.get(t.x)!, y = my.get(t.y)!, r = mx.get(t.x + t.w)!, b = my.get(t.y + t.h)!; return { x, y, w: Math.max(20, r - x), h: Math.max(20, b - y) }; });
  // 16:9: the biggest 16:9 picture (a multiple of 16 wide, 9 high per unit) that fits each slot, centred in it.
  const fit = slots.map(s => { const k = Math.max(2, Math.floor(Math.min(s.w / 16, s.h / 9))); return { k, cx: s.x + s.w / 2, cy: s.y + s.h / 2 }; });
  if (!fit.length) return tiles;
  // Spread: scale the whole layout up (never down) to use as much of the frame as it can, and centre it so the margins are even.
  const box = (sc: number) => { const l = Math.min(...fit.map(f => f.cx - 8 * Math.floor(f.k * sc))), r = Math.max(...fit.map(f => f.cx + 8 * Math.floor(f.k * sc))),
    tp = Math.min(...fit.map(f => f.cy - 4.5 * Math.floor(f.k * sc))), bt = Math.max(...fit.map(f => f.cy + 4.5 * Math.floor(f.k * sc))); return { l, r, tp, bt }; };
  let sc = 1; { const b = box(1); const bw = b.r - b.l, bh = b.bt - b.tp; sc = Math.max(1, Math.min(W / bw, H / bh) * 0.999); }
  let b = box(sc); while (sc > 1 && (b.r - b.l > W || b.bt - b.tp > H)) { sc -= 0.01; b = box(sc); }
  const ox = Math.round((W - (b.r - b.l)) / 2 - b.l), oy = Math.round((H - (b.bt - b.tp)) / 2 - b.tp);
  return tiles.map((t, i) => { const f = fit[i], k = Math.max(1, Math.floor(f.k * sc)), w = 16 * k, h = 9 * k;
    return { ...t, x: Math.max(0, Math.min(W - w, Math.round(f.cx - w / 2 + ox))), y: Math.max(0, Math.min(H - h, Math.round(f.cy - h / 2 + oy))), w, h }; });
}
