import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMe, isAdmin } from '@/lib/session';
import { loadHardware, taken, destNums, fmtNums } from '@/lib/hardware';
export const dynamic = 'force-dynamic';

// Which hardware inputs and outputs are used, by which monitor and layout, and which monitors have no hardware yet.
export default async function Usage() {
  const me = await requireMe(); if (!isAdmin(me)) redirect('/');
  const { units, outs, walls, layouts, dests } = await loadHardware(me.tenant_id ?? 0);
  const monName = (rw: number, id: string) => walls.find(w => w.id === rw)?.mons.find(m => m.id === id);
  const unassigned = walls.flatMap(w => w.mons.map(m => ({ w, m }))).filter(x => !outs.some(o => o.room_wall_id === x.w.id && o.monitor_id === x.m.id));
  return (<><div className="pagehead"><h1 style={{ margin: 0 }}>Hardware usage</h1></div>
    <p className="mut"><Link href="/hardware">MV Hardware</Link></p>
    {units.length === 0 && <p className="mut">No hardware yet.</p>}
    {units.map(u => { const mine = outs.filter(o => o.unit_id === u.id); const t = taken(u.id, outs, dests, layouts); const set = new Set<number>(); t.forEach(r => r.nums.forEach(i => set.add(i)));
      return (<div key={u.id} className="card" style={{ marginBottom: 12 }}><div className="row" style={{ justifyContent: 'space-between' }}><b><Link href={`/hardware?id=${u.id}`}>{u.name}</Link></b><span className="mut">{mine.length}/{u.outputs} outputs · {set.size}/{u.inputs} inputs used · {u.inputs - set.size} free</span></div>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Output</th><th>Room</th><th>Wall</th><th>Monitor</th><th>Layout</th><th>Destinations</th></tr></thead><tbody>
          {mine.length === 0 && <tr><td colSpan={6} className="mut">No outputs assigned.</td></tr>}
          {mine.flatMap(o => { const w = walls.find(x => x.id === o.room_wall_id); const m = monName(o.room_wall_id, o.monitor_id); const ds = dests.filter(d => d.room_wall_id === o.room_wall_id && d.monitor_id === o.monitor_id && layouts.has(d.layout_id));
            const head = [<td key="a">{o.out_no}</td>, <td key="b">{w ? `${w.location} › ${w.room}` : '—'}</td>, <td key="c">{w?.name ?? '—'}</td>, <td key="d">{m?.name ?? 'missing monitor'}</td>];
            if (!ds.length) return [<tr key={o.out_no}>{head}<td colSpan={2} className="mut">No destinations set</td></tr>];
            return ds.map((d, i) => <tr key={o.out_no + '-' + d.layout_id}>{i === 0 ? head : <><td /><td /><td /><td /></>}<td>{layouts.get(d.layout_id)!.name}</td><td>{fmtNums(destNums(d, layouts.get(d.layout_id)!.n))}</td></tr>); })}</tbody></table></div></div>); })}
    <h2 style={{ margin: '18px 0 6px' }}>Monitors with no hardware output</h2>
    {unassigned.length === 0 ? <p className="mut">Every monitor in a Room has an output.</p> : <div className="card" style={{ overflowX: 'auto' }}><table><thead><tr><th>Room</th><th>Wall</th><th>Monitor</th></tr></thead><tbody>{unassigned.map(x => <tr key={x.w.id + x.m.id}><td>{x.w.site} › {x.w.location} › {x.w.room}</td><td>{x.w.name}</td><td>{x.m.name}</td></tr>)}</tbody></table></div>}</>);
}
