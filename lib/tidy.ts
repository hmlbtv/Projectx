// Neaten an MV layout: edges that are almost level are made exactly level, small gaps and small overlaps between windows are closed,
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
  return tiles.map(t => { const x = mx.get(t.x)!, y = my.get(t.y)!, r = mx.get(t.x + t.w)!, b = my.get(t.y + t.h)!;
    return { ...t, x, y, w: Math.max(20, r - x), h: Math.max(20, b - y) }; });
}
