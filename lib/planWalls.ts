import { rows } from './db';

// A Wall Template as the Monitor Plan needs it: its assets, and for each monitor and MV layout the names of the hardware destinations its windows take
// (window 1 is the layout's start destination on the monitor's hardware unit, window 2 the next, and so on).
export async function planWalls(list: { id: number; name: string; data: any; defaults?: any }[], tenant: number, hardware = true) {
  const assetsOf = (d: any): any[] => (Array.isArray(d?.assets) ? d.assets : []);
  const ids = list.map(w => w.id);
  const hw = hardware && ids.length ? await rows<any>('select o.room_wall_id rw, o.monitor_id mon, u.dest_names, u.dest_hw from hw_outputs o join hw_units u on u.id=o.unit_id where u.tenant_id=$1 and o.room_wall_id = any($2::int[])', [tenant, ids]) : [];
  const ds = hardware && ids.length ? await rows<any>('select room_wall_id rw, monitor_id mon, layout_id lay, first_dest first, tiles from hw_dests where room_wall_id = any($1::int[])', [ids]) : [];
  const lays = ds.length ? await rows<any>('select id, jsonb_array_length(tiles) n from mv_layouts where id = any($1::int[])', [Array.from(new Set(ds.map((d: any) => d.lay)))]) : [];
  const nOf = new Map<number, number>(lays.map((l: any) => [l.id, l.n]));
  return list.map(w => {
    const dests: Record<string, Record<string, string[]>> = {};
    for (const d of ds.filter((x: any) => x.rw === w.id)) {
      const u = hw.find((h: any) => h.rw === w.id && h.mon === d.mon); const n = nOf.get(d.lay) ?? 0; if (!u || !n) continue;
      const t = d.tiles ?? {}, has = Object.keys(t).length > 0; const names = Array.from({ length: n }, (_, i) => { const k = has ? Number(t[i + 1]) : d.first + i; return k > 0 ? String(u.dest_names?.[k] || u.dest_hw?.[k] || '') : ''; });
      if (names.some(Boolean)) (dests[d.mon] ??= {})[d.lay] = names;
    }
    const act = (Array.isArray(w.defaults) ? w.defaults : []).find((x: any) => x?.active) as { mons?: Record<string, number> } | undefined;
    return { id: w.id, name: w.name, assets: assetsOf(w.data), dests, defaultMons: act?.mons };
  });
}
