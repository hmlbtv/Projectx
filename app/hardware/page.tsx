import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMe, isAdmin } from '@/lib/session';
import { rows } from '@/lib/db';
import { loadHardware, taken, range, outFull } from '@/lib/hardware';
import ImportNames from './ImportNames';
import CopyHardware from './CopyHardware';
import { addHwUnit, updateHwUnit, deleteHwUnit, setHwOutput, setHwDest, setHwMonitorStart, autoHwDests, clearHwDests, saveHwNames } from '@/lib/actions';
import AddDialog from '../AddDialog';
import Menu from '../Menu';
export const dynamic = 'force-dynamic';

export default async function Hardware({ searchParams }: { searchParams: Promise<{ id?: string; err?: string }> }) {
  const me = await requireMe(); if (!isAdmin(me)) redirect('/');
  const t = me.tenant_id ?? 0, q = await searchParams;
  const [hw, sites, locs, rooms] = await Promise.all([loadHardware(t),
    rows<any>('select id,name from sites where tenant_id=$1 order by name', [t]),
    rows<any>('select l.id, l.name, l.site_id from locations l join sites s on s.id=l.site_id where s.tenant_id=$1 order by l.name', [t]),
    rows<any>('select r.id, r.name, r.location_id from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by r.name', [t])]);
  const { units, outs, walls, layouts, dests } = hw;
  const siteName = (id: number | null) => sites.find((s: any) => s.id === id)?.name ?? '';
  const whereOf = (u: any) => u.room_id ? (() => { const r = rooms.find((x: any) => x.id === u.room_id); return `${siteName(u.site_id)} › ${locs.find((l: any) => l.id === r?.location_id)?.name ?? ''} › ${r?.name ?? ''}`; })() : u.location_id ? `${siteName(u.site_id)} › ${locs.find((l: any) => l.id === u.location_id)?.name ?? ''}` : siteName(u.site_id);
  const Where = ({ cur }: { cur?: any }) => (<select name="where" required defaultValue={cur ? (cur.room_id ? 'r:' + cur.room_id : cur.location_id ? 'l:' + cur.location_id : 's:' + cur.site_id) : ''} aria-label="Where is the unit">
    <option value="" disabled>Where is it?</option>
    {sites.map((s: any) => (<optgroup key={s.id} label={s.name}><option value={'s:' + s.id}>{s.name} (whole Site)</option>
      {locs.filter((l: any) => l.site_id === s.id).flatMap((l: any) => [<option key={'l' + l.id} value={'l:' + l.id}>{s.name} › {l.name}</option>, ...rooms.filter((r: any) => r.location_id === l.id).map((r: any) => <option key={'r' + r.id} value={'r:' + r.id}>{s.name} › {l.name} › {r.name}</option>)])}</optgroup>))}</select>);

  const whereOpts = sites.flatMap((s: any) => [{ value: 's:' + s.id, label: `${s.name} (whole Site)` }, ...locs.filter((l: any) => l.site_id === s.id).flatMap((l: any) => [{ value: 'l:' + l.id, label: `${s.name} › ${l.name}` }, ...rooms.filter((r: any) => r.location_id === l.id).map((r: any) => ({ value: 'r:' + r.id, label: `${s.name} › ${l.name} › ${r.name}` }))])]);
  const u = q.id ? units.find(x => String(x.id) === q.id) : null;
  if (!u) {
    return (<><div className="pagehead"><h1 style={{ margin: 0 }}>MV Hardware</h1>
      <AddDialog action={addHwUnit} inline label="Add Hardware" title="New hardware unit" placeholder="Name (e.g. MV Frame 1)">
        <input name="model" placeholder="Make / model (optional)" /><Where />
        <label>Inputs <input name="inputs" type="number" min={1} max={1024} defaultValue={48} /></label><label>Outputs <input name="outputs" type="number" min={1} max={256} defaultValue={4} /></label></AddDialog></div>
      <p className="mut">Multiviewer hardware defines the monitors' MV layouts. Give each unit its inputs and outputs, put it in a Site, Location or Room (any monitor in that Site can use it), then assign each output to a monitor. <Link href="/hardware/usage">Usage report</Link></p>
      {units.length === 0 && <p className="mut">No hardware yet.</p>}
      <div className="tiles">{units.map(x => { const o = outs.filter(y => y.unit_id === x.id); const used = taken(x.id, outs, dests, layouts); const set = new Set<number>(); used.forEach(r => { for (let i = r.from; i <= r.to; i++) set.add(i); });
        return (<div key={x.id} className="card tile"><Link href={`/hardware?id=${x.id}`} className="tilelink"><b>{x.name}</b><span className="mut">{x.model ? x.model + ' · ' : ''}{whereOf(x)}</span>
          <span className="mut">{o.length}/{x.outputs} outputs in use · {set.size}/{x.inputs} inputs used</span></Link></div>); })}</div></>);
  }
  // ---- One unit ----
  const mine = outs.filter(o => o.unit_id === u.id);
  const usedRanges = taken(u.id, outs, dests, layouts); const used = new Set<number>(); usedRanges.forEach(r => { for (let i = r.from; i <= r.to; i++) used.add(i); });
  const siteWalls = walls.filter(w => w.site_id === u.site_id);
  const where = (rwId: number, monId: string) => outs.find(o => o.room_wall_id === rwId && o.monitor_id === monId);
  const wallOf = (id: number) => walls.find(w => w.id === id);
  return (<><div className="crumbs"><Link href="/hardware" className="btn sec small">← All hardware</Link></div>
    <div className="card tile head"><div><div className="mut">{whereOf(u)}</div><h1 style={{ margin: 0 }}>{u.name}</h1><div className="mut">{u.model ? u.model + ' · ' : ''}{u.inputs} inputs · {u.outputs} outputs</div></div>
      <Menu><b>Edit hardware</b><form action={updateHwUnit} className="stack"><input type="hidden" name="id" value={u.id} /><input name="name" defaultValue={u.name} required /><input name="model" defaultValue={u.model} placeholder="Make / model" /><Where cur={u} />
        <label>Inputs <input name="inputs" type="number" min={Math.max(1, usedRanges.reduce((m, r) => Math.max(m, r.to), 0))} max={1024} defaultValue={u.inputs} /></label>
        <label>Outputs <input name="outputs" type="number" min={Math.max(1, ...mine.map(o => o.out_no))} max={256} defaultValue={u.outputs} /></label><button className="sec">Save</button></form>
        <form action={deleteHwUnit} className="del-row"><input type="hidden" name="id" value={u.id} /><span className="mut">Delete this unit? Its outputs and destination numbers are removed.</span><button className="del">Yes, delete</button></form></Menu></div>
    {q.err && <p role="alert" style={{ color: 'var(--bad)' }}>{q.err}</p>}
    <div className="card"><b>Inputs: {used.size} of {u.inputs} used</b>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 8 }} aria-label="Input usage">{Array.from({ length: u.inputs }, (_, i) => i + 1).map(n => <span key={n} title={used.has(n) ? 'In use' : 'Free'} style={{ minWidth: 26, textAlign: 'center', fontSize: '.72rem', padding: '2px 0', borderRadius: 4, background: used.has(n) ? '#1d6b3a' : 'transparent', border: '1px solid var(--line)', color: used.has(n) ? '#fff' : undefined }}>{n}</span>)}</div>
      <div className="row" style={{ marginTop: 10 }}>
        <form action={autoHwDests} className="row"><input type="hidden" name="unit" value={u.id} /><label>Auto-assign from <input name="start" type="number" min={1} defaultValue={1} style={{ width: 80 }} /></label><button className="sec small">Auto-assign all monitors</button></form>
        <form action={clearHwDests}><input type="hidden" name="unit" value={u.id} /><button className="sec small">Clear all destinations</button></form>
        <CopyHardware key={u.id} u={{ id: u.id, name: u.name, model: u.model, inputs: u.inputs, outputs: u.outputs, where: u.room_id ? 'r:' + u.room_id : u.location_id ? 'l:' + u.location_id : 's:' + u.site_id, dest_names: u.dest_names ?? {}, dest_hw: u.dest_hw ?? {}, out_names: u.out_names ?? {}, out_hw: u.out_hw ?? {} }} where={whereOpts} /></div>
      <p className="mut" style={{ fontSize: '.85rem', margin: '6px 0 0' }}>Auto-assign stacks the monitors in output order. Each monitor takes as many destinations as its biggest MV layout, and all of its layouts start at its first one (a full-screen layout sits on the first destination).</p></div>
    <h2 style={{ margin: '18px 0 6px' }}>Destination and output names</h2>
    <div className="card"><div className="row" style={{ justifyContent: 'space-between' }}><span className="mut">Friendly names are what people see in Monitor Plans. The hardware name is the unit's own name for it. Names belong to this unit only.</span><ImportNames id={u.id} /></div>
      <details key={u.id} style={{ marginTop: 8 }}><summary>Edit names here</summary>
        <form action={saveHwNames} className="stack" style={{ marginTop: 8 }}><input type="hidden" name="id" value={u.id} /><button className="sec small" style={{ justifySelf: 'start' }}>Save names</button>
          <b>Destinations (inputs)</b>
          <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'auto 1fr 1fr', alignItems: 'center' }}><span /><span className="mut">Hardware name</span><span className="mut">Friendly name</span>
            {Array.from({ length: u.inputs }, (_, i) => i + 1).map(n => (<div key={n} style={{ display: 'contents' }}><span style={{ textAlign: 'right' }}>{n}</span><input name={'dh_' + n} defaultValue={u.dest_hw?.[n] ?? ''} maxLength={60} aria-label={`Destination ${n} hardware name`} /><input name={'dn_' + n} defaultValue={u.dest_names?.[n] ?? ''} maxLength={60} aria-label={`Destination ${n} friendly name`} /></div>))}</div>
          <b>Outputs</b>
          <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'auto 1fr 1fr', alignItems: 'center' }}>
            {Array.from({ length: u.outputs }, (_, i) => i + 1).map(n => (<div key={n} style={{ display: 'contents' }}><span style={{ textAlign: 'right' }}>{n}</span><input name={'oh_' + n} defaultValue={u.out_hw?.[n] ?? ''} maxLength={60} aria-label={`Output ${n} hardware name`} /><input name={'on_' + n} defaultValue={u.out_names?.[n] ?? ''} maxLength={60} aria-label={`Output ${n} friendly name`} /></div>))}</div>
          <button className="sec small" style={{ justifySelf: 'start' }}>Save names</button></form></details></div>
    <h2 style={{ margin: '18px 0 6px' }}>Outputs</h2>
    {siteWalls.every(w => w.mons.length === 0) && <p className="mut">No monitors in Wall Templates placed in Rooms of this Site yet.</p>}
    <div style={{ display: 'grid', gap: 8 }}>{Array.from({ length: u.outputs }, (_, i) => i + 1).map(n => { const o = mine.find(x => x.out_no === n); const w = o ? wallOf(o.room_wall_id) : null; const m = w?.mons.find(x => x.id === o!.monitor_id);
      return (<div key={n} className="card"><div className="row" style={{ justifyContent: 'space-between' }}><b>{outFull(u, n)}</b>
        <form action={setHwOutput} className="row"><input type="hidden" name="unit" value={u.id} /><input type="hidden" name="out" value={n} />
          <select name="target" defaultValue={o ? `${o.room_wall_id}:${o.monitor_id}` : ''} aria-label={`Monitor for output ${n}`}><option value="">Not assigned</option>
            {siteWalls.filter(x => x.mons.length).map(x => (<optgroup key={x.id} label={`${x.location} › ${x.room} › ${x.name}`}>{x.mons.map(mm => { const at = where(x.id, mm.id); const other = at && !(at.unit_id === u.id && at.out_no === n); return <option key={mm.id} value={`${x.id}:${mm.id}`}>{mm.name}{other ? ` (now on ${units.find(z => z.id === at!.unit_id)?.name} out ${at!.out_no})` : ''}</option>; })}</optgroup>))}</select>
          <button className="sec small">Save</button></form></div>
        {o && !m && <p className="mut" style={{ margin: '6px 0 0' }}>The assigned monitor no longer exists on its wall.</p>}
        {o && m && w && (<div style={{ marginTop: 8 }}><div className="mut" style={{ fontSize: '.85rem' }}>{w.location} › {w.room} › {w.name} › {m.name}</div>
          {m.mvs.length === 0 ? <p className="mut" style={{ margin: '4px 0' }}>This monitor has no MV layouts chosen in its Wall Template.</p> : (<>
            <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{m.mvs.filter(l => layouts.has(l)).map(l => { const lay = layouts.get(l)!; const d = dests.find(x => x.room_wall_id === w.id && x.monitor_id === m.id && x.layout_id === l);
              return (<form key={l} action={setHwDest} className="row" style={{ margin: 0 }}><input type="hidden" name="unit" value={u.id} /><input type="hidden" name="rw" value={w.id} /><input type="hidden" name="mon" value={m.id} /><input type="hidden" name="layout" value={l} />
                <span style={{ flex: '1 1 160px' }}>{lay.name} <span className="mut">({lay.n} tile{lay.n === 1 ? '' : 's'})</span></span>
                <label className="mut">starts at <input name="first" type="number" min={1} max={u.inputs} defaultValue={d?.first_dest ?? ''} style={{ width: 80 }} /></label>
                <span style={{ minWidth: 70 }}>{d ? range(d.first_dest, lay.n) : <span className="mut">unset</span>}</span><button className="sec small">Set</button></form>); })}</div>
            <form action={setHwMonitorStart} className="row" style={{ marginTop: 6 }}><input type="hidden" name="unit" value={u.id} /><input type="hidden" name="rw" value={w.id} /><input type="hidden" name="mon" value={m.id} />
              <label className="mut">All layouts of this monitor start at <input name="first" type="number" min={1} max={u.inputs} required style={{ width: 80 }} /></label><button className="sec small">Set all</button></form></>)}</div>)}</div>); })}</div></>);
}
