// Compares a saved Monitor Plan with the wall it is about to be pasted onto, and works out what can safely be carried over.
type Asset = { id: string; name?: string; props?: { mvs?: number[] } };
type Layout = { id: number; name: string; tiles: { n: number }[] };
export type Finding = { level: 'warn' | 'info'; text: string };
export function checkCopy(o: { src: any; srcAssets: Asset[]; tgtAssets: Asset[]; layouts: Layout[]; srcSources: string[] | null; tgtSources: string[] | null }): { data: any; findings: Finding[]; copied: number } {
  const f: Finding[] = [], src = o.src ?? {}, lay = new Map(o.layouts.map(l => [l.id, l]));
  const tgt = new Map(o.tgtAssets.map(a => [a.id, a])), nm = (a?: Asset, id?: string) => a?.name || id || 'monitor';
  const out: any = { assign: {}, mons: {}, srcs: {} };
  // Wall level layout (older plans) must still exist.
  if (src.layoutId) { if (lay.has(src.layoutId)) { out.layoutId = src.layoutId; for (const [n, v] of Object.entries(src.assign ?? {})) if (lay.get(src.layoutId)!.tiles.some(t => String(t.n) === n)) out.assign[n] = v; else f.push({ level: 'warn', text: `Tile ${n} no longer exists in MV Layout "${lay.get(src.layoutId)!.name}": its source was not copied.` }); }
    else f.push({ level: 'warn', text: 'The MV Layout used on the old plan is no longer available: it was not copied.' }); }
  const used = new Set<string>([...Object.keys(src.mons ?? {}), ...Object.keys(src.srcs ?? {})]); let copied = 0;
  const srcA = new Map(o.srcAssets.map(a => [a.id, a]));
  for (const aid of used) {
    const t = tgt.get(aid), s = srcA.get(aid);
    if (!t) { f.push({ level: 'warn', text: `${nm(s, aid)} is not on this wall: its MV Layout and sources were skipped.` }); continue; }
    const allowed: number[] = Array.isArray(t.props?.mvs) ? t.props!.mvs! : [];
    const want = (src.mons ?? {})[aid] as number | undefined;
    let chosen = want;
    if (want != null) {
      if (!lay.has(want)) { f.push({ level: 'warn', text: `${nm(t)}: the MV Layout it used is no longer available, so it was left on this wall's default.` }); chosen = undefined; }
      else if (!allowed.includes(want)) { f.push({ level: 'warn', text: `${nm(t)}: MV Layout "${lay.get(want)!.name}" is not one of the MV Layouts allowed for this monitor here, so it was left on this wall's default.` }); chosen = undefined; }
      else { out.mons[aid] = want; copied++; }
    }
    const lid = chosen ?? allowed[0], L = lid != null ? lay.get(lid) : undefined, sr = (src.srcs ?? {})[aid] as Record<string, string> | undefined;
    if (sr && Object.keys(sr).length) {
      if (chosen == null && want != null) { f.push({ level: 'warn', text: `${nm(t)}: its tile sources were skipped because the MV Layout changed.` }); continue; }
      const keep: Record<string, string> = {};
      for (const [n, v] of Object.entries(sr)) { if (L && L.tiles.some(x => String(x.n) === n)) keep[n] = v; else f.push({ level: 'warn', text: `${nm(t)}: tile ${n} does not exist in the MV Layout "${L?.name ?? ''}" any more: its source "${v}" was skipped.` }); }
      if (Object.keys(keep).length) { out.srcs[aid] = keep; copied += Object.keys(keep).length; }
    }
  }
  // Source names that are not in this Job's source list.
  if (o.tgtSources) { const have = new Set(o.tgtSources.map(x => x.toLowerCase())); const miss = new Set<string>();
    for (const m of Object.values(out.srcs) as Record<string, string>[]) for (const v of Object.values(m)) if (v && !have.has(String(v).toLowerCase())) miss.add(String(v));
    for (const v of Object.values(out.assign) as string[]) if (v && !have.has(String(v).toLowerCase())) miss.add(String(v));
    if (miss.size) f.push({ level: 'warn', text: `These sources are not in this Job's source list (kept, but check them): ${[...miss].slice(0, 12).join(', ')}${miss.size > 12 ? '…' : ''}.` }); }
  if (!o.tgtSources && o.srcSources && o.srcSources.length) f.push({ level: 'info', text: 'This Job has no source list; sources were copied as typed.' });
  if (!Object.keys(out.mons).length) delete out.mons; if (!Object.keys(out.srcs).length) delete out.srcs;
  return { data: out, findings: f, copied };
}
