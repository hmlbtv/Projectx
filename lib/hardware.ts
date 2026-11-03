import { rows } from './db';

// Hardware: MV units with a number of inputs and outputs. Each output drives one monitor of a Wall Template in a particular Room (a "room wall").
// A monitor shows one of its MV layouts; each layout on that monitor starts at a destination number on the unit and its tiles take the next numbers in turn.
export const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(String(t ?? ''));
export type Mon = { id: string; name: string; mvs: number[] };
export const monitorsOf = (data: any): Mon[] => (Array.isArray(data?.assets) ? data.assets : []).filter((a: any) => isScreen(a.type) && a.id != null)
  .map((a: any, i: number) => ({ id: String(a.id), name: String(a.name || `Monitor ${i + 1}`), mvs: (Array.isArray(a.props?.mvs) ? a.props.mvs : []).map(Number).filter(Boolean) }));

export type Names = Record<string, string>;
export type Unit = { dest_names: Names; out_names: Names; dest_hw: Names; out_hw: Names; id: number; site_id: number | null; location_id: number | null; room_id: number | null; name: string; model: string; inputs: number; outputs: number };
export type Out = { unit_id: number; out_no: number; room_wall_id: number; monitor_id: string };
export type RW = { id: number; site_id: number; location_id: number; room_id: number; name: string; room: string; location: string; site: string; mons: Mon[] };
export type Lay = { id: number; name: string; n: number };
export type Dest = { room_wall_id: number; monitor_id: string; layout_id: number; first_dest: number; tiles: Record<string, number> };

export async function loadHardware(tenant: number) {
  const [units, outs, rw, lays, dests] = await Promise.all([
    rows<Unit>('select id, site_id, location_id, room_id, name, model, inputs, outputs, dest_names, out_names, dest_hw, out_hw from hw_units where tenant_id=$1 order by name, id', [tenant]),
    rows<Out>('select o.unit_id, o.out_no, o.room_wall_id, o.monitor_id from hw_outputs o join hw_units u on u.id=o.unit_id where u.tenant_id=$1 order by o.unit_id, o.out_no', [tenant]),
    rows<any>('select rw.id, rw.name, s.id site_id, l.id location_id, r.id room_id, r.name room, l.name location, s.name site, w.data from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id join wall_templates w on w.id=rw.wall_template_id where s.tenant_id=$1 order by s.name, l.name, r.name, rw.name', [tenant]),
    rows<any>('select id, name, tiles from mv_layouts where tenant_id=$1 or tenant_id is null', [tenant]),
    rows<Dest>('select d.room_wall_id, d.monitor_id, d.layout_id, d.first_dest, d.tiles from hw_dests d join room_walls rw on rw.id=d.room_wall_id join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [tenant]),
  ]);
  const walls: RW[] = rw.map((x: any) => ({ id: x.id, site_id: x.site_id, location_id: x.location_id, room_id: x.room_id, name: x.name, room: x.room, location: x.location, site: x.site, mons: monitorsOf(x.data) }));
  const layouts = new Map<number, Lay>(lays.map((l: any) => [l.id, { id: l.id, name: l.name, n: Array.isArray(l.tiles) ? l.tiles.length : 0 }]));
  return { units, outs, walls, layouts, dests };
}

// The destination each tile of a layout takes: the numbers set tile by tile, or (older rows) consecutive from the start number. null = no destination.
export const destNums = (d: Pick<Dest, 'tiles' | 'first_dest'>, n: number): (number | null)[] => {
  const t = d.tiles ?? {}; const has = Object.keys(t).length > 0;
  return Array.from({ length: n }, (_, i) => has ? (Number(t[i + 1]) > 0 ? Number(t[i + 1]) : null) : d.first_dest + i);
};
// Destination numbers taken on a unit by each monitor (all of the monitor's layouts), skipping one monitor if asked: used to refuse a destination used by two different monitors.
export function taken(unit: number, outs: Out[], dests: Dest[], layouts: Map<number, Lay>, skip?: { rw: number; mon: string }) {
  const mine = new Map(outs.filter(o => o.unit_id === unit).map(o => [o.room_wall_id + ':' + o.monitor_id, o]));
  const r: { rw: number; mon: string; nums: number[]; from: number; to: number; layout: number }[] = [];
  for (const d of dests) { const k = d.room_wall_id + ':' + d.monitor_id; if (!mine.has(k) || (skip && skip.rw === d.room_wall_id && skip.mon === d.monitor_id)) continue;
    const n = layouts.get(d.layout_id)?.n ?? 0; const nums = destNums(d, n).filter((x): x is number => x != null); if (nums.length) r.push({ rw: d.room_wall_id, mon: d.monitor_id, nums, from: Math.min(...nums), to: Math.max(...nums), layout: d.layout_id }); }
  return r;
}
// "10–18", "1, 3, 7–9"
export const fmtNums = (list: (number | null)[]) => { const v = list.filter((x): x is number => x != null).sort((a, b) => a - b); if (!v.length) return 'unset'; const out: string[] = []; let i = 0;
  while (i < v.length) { let j = i; while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++; out.push(j > i ? `${v[i]}–${v[j]}` : String(v[i])); i = j + 1; } return out.join(', '); };
export const range = (from: number, n: number) => n <= 1 ? String(from) : `${from}–${from + n - 1}`;

// What a destination or output is called: the friendly name given in TelePlanner, else the hardware's own name, else its number.
export const destLabel = (u: Unit, n: number) => u.dest_names?.[n] || u.dest_hw?.[n] || '';
export const destFull = (u: Unit, n: number) => `${n}${destLabel(u, n) ? ' · ' + destLabel(u, n) : ''}`;
export const outFull = (u: Unit, n: number) => `Output ${n}${u.out_names?.[n] || u.out_hw?.[n] ? ' · ' + (u.out_names?.[n] || u.out_hw?.[n]) : ''}`;
