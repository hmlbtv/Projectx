import { rows } from './db';

// A Wall Template as the Monitor Plan needs it: its assets, and for each monitor the names of the destinations assigned to it (in the Destination Set's order).
export async function planWalls(list: { id: number; name: string; data: any; defaults?: any }[], tenant: number) {
  const assetsOf = (d: any): any[] => (Array.isArray(d?.assets) ? d.assets : []);
  const ids = Array.from(new Set(list.flatMap(w => assetsOf(w.data).flatMap(a => (Array.isArray(a.props?.dests) ? a.props.dests.map(Number) : [])))));
  const dn = ids.length ? await rows('select d.id, d.name, d.pos from destinations d join destination_sets s on s.id=d.set_id where s.tenant_id=$1 and d.id = any($2::int[])', [tenant, ids]) : [];
  const by = new Map<number, { name: string; pos: number }>(dn.map((d: any) => [d.id, { name: d.name, pos: d.pos }]));
  return list.map(w => {
    const dests: Record<string, string[]> = {};
    for (const a of assetsOf(w.data)) if (Array.isArray(a.props?.dests)) dests[a.id] = a.props.dests.map(Number).filter((i: number) => by.has(i)).sort((x: number, y: number) => by.get(x)!.pos - by.get(y)!.pos).map((i: number) => by.get(i)!.name);
    const act = (Array.isArray(w.defaults) ? w.defaults : []).find((x: any) => x?.active) as { mons?: Record<string, number> } | undefined;
    return { id: w.id, name: w.name, assets: assetsOf(w.data), dests, defaultMons: act?.mons };
  });
}
