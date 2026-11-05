import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMe, isAdmin } from '@/lib/session';
import { rows } from '@/lib/db';
import { loadHardware } from '@/lib/hardware';
import type { Frame, Rack, Unit } from '@/lib/hardware';
import { addHwRack, updateHwRack, deleteHwRack, addHwFrame, updateHwFrame, deleteHwFrame } from '@/lib/actions';
import AddDialog from '../../AddDialog';
import Menu from '../../Menu';
export const dynamic = 'force-dynamic';

// A picture of each rack: every Frame drawn at its rack position, split into slots, showing which MV unit or card is in each slot.
const RU = 36; // pixels per rack unit
const UNIT_BG = '#2b5fa8', CARD_BG = '#46506a';

export default async function Racks() {
  const me = await requireMe(); if (!isAdmin(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const [{ units, racks, frames }, sites, locs, rooms] = await Promise.all([loadHardware(t), rows<any>('select id,name from sites where tenant_id=$1 order by name', [t]), rows<any>('select l.id,l.name,l.site_id from locations l join sites s on s.id=l.site_id where s.tenant_id=$1 order by l.name', [t]), rows<any>('select r.id,r.name,r.location_id from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by r.name', [t])]);
  const siteName = (id: number | null) => sites.find((x: any) => x.id === id)?.name ?? '';
  const place = (r: { site_id: number | null; location_id: number | null; room_id: number | null }) => { const rm = rooms.find((x: any) => x.id === r.room_id); const l = locs.find((x: any) => x.id === (rm?.location_id ?? r.location_id)); return [siteName(r.site_id), l?.name, rm?.name].filter(Boolean).join(' › '); };
  const whereOpts = sites.flatMap((s: any) => [<option key={'s' + s.id} value={'s:' + s.id}>{s.name} (whole Site)</option>, ...locs.filter((l: any) => l.site_id === s.id).flatMap((l: any) => [<option key={'l' + l.id} value={'l:' + l.id}>{s.name} › {l.name}</option>, ...rooms.filter((r: any) => r.location_id === l.id).map((r: any) => <option key={'r' + r.id} value={'r:' + r.id}>{s.name} › {l.name} › {r.name}</option>)])]);
  const WhereSel = ({ cur }: { cur?: Rack }) => (<select name="where" required defaultValue={cur ? (cur.room_id ? 'r:' + cur.room_id : cur.location_id ? 'l:' + cur.location_id : 's:' + cur.site_id) : ''} aria-label="Where is the rack"><option value="" disabled>Where is it?</option>{whereOpts}</select>);
  const RackSel = ({ cur }: { cur?: number | null }) => (<select name="rack" defaultValue={cur ?? ''} aria-label="Rack"><option value="">Not in a rack</option>{racks.map(r => <option key={r.id} value={r.id}>{r.name} · {place(r)}</option>)}</select>);
  const unitAt = (f: Frame, n: number) => units.find(u => u.frame_id === f.id && u.slot === n);
  const FrameFields = ({ cur, rack }: { cur?: Frame; rack?: number }) => (<>
    <input name="model" defaultValue={cur?.model ?? ''} placeholder="Make / model (optional)" /><input name="serial" defaultValue={cur?.serial ?? ''} placeholder="Serial number (optional)" />
    <div className="row" style={{ margin: 0 }}><label>Slots <input name="slots" type="number" min={1} max={64} defaultValue={cur?.slots ?? 8} style={{ width: 80 }} /></label>
      {rack ? <input type="hidden" name="rack" value={rack} /> : <RackSel cur={cur?.rack_id} />}</div>
    <div className="row" style={{ margin: 0 }}><label>Position (RU) <input name="rack_ru" type="number" min={1} max={100} defaultValue={cur?.rack_ru ?? ''} placeholder="bottom RU" style={{ width: 90 }} /></label><label>Height (RU) <input name="rack_h" type="number" min={1} max={60} defaultValue={cur?.rack_h ?? 1} style={{ width: 70 }} /></label></div>
    <input name="notes" defaultValue={cur?.notes ?? ''} placeholder="Notes (optional)" /></>);
  const occupantLabel = (f: Frame, n: number) => unitAt(f, n)?.name ?? f.slot_cards[n]?.name ?? '';
  const framesIn = (r: Rack) => frames.filter(f => f.rack_id === r.id);
  const bySite = new Map<string, Rack[]>(); for (const r of [...racks].sort((a, b) => siteName(a.site_id).localeCompare(siteName(b.site_id)) || a.name.localeCompare(b.name, undefined, { numeric: true }))) bySite.set(siteName(r.site_id), [...(bySite.get(siteName(r.site_id)) ?? []), r]);
  const loneFrames = frames.filter(f => !f.rack_id); const loose = units.filter(u => !u.frame_id);
  return (<><div className="pagehead"><h1 style={{ margin: 0 }}>Rack view</h1>
    <div className="row" style={{ margin: 0 }}>
      <AddDialog action={addHwRack} inline label="Add rack" title="New rack" placeholder="Rack name (e.g. Rack A)"><WhereSel /><label>Height (RU) <input name="ru" type="number" min={1} max={100} defaultValue={42} style={{ width: 80 }} /></label></AddDialog>
      <AddDialog action={addHwFrame} inline label="Add frame" title="New frame" placeholder="Frame name (e.g. MV Frame 1)"><FrameFields /></AddDialog></div></div>
    <p className="mut"><Link href="/hardware">MV Hardware</Link> · Put an MV unit in a frame slot under Edit hardware. Use ⋯ on a rack or frame to change it.</p>
    {racks.length === 0 && frames.length === 0 && <p className="mut">No racks yet. Add a rack, then add frames to it.</p>}
    {[...bySite.entries()].map(([site, rs]) => (<section key={site}><h2 style={{ margin: '18px 0 6px' }}>{site || 'No site'}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', paddingBottom: 24 }}>
        {rs.map(r => { const fs = framesIn(r).filter(f => f.rack_ru); const nopos = framesIn(r).filter(f => !f.rack_ru); const top = Math.max(r.ru, ...fs.map(f => (f.rack_ru ?? 1) + f.rack_h - 1)); const clash = new Set<number>();
          for (const a of fs) for (const b of fs) if (a.id < b.id && (a.rack_ru ?? 0) <= (b.rack_ru ?? 0) + b.rack_h - 1 && (b.rack_ru ?? 0) <= (a.rack_ru ?? 0) + a.rack_h - 1) { clash.add(a.id); clash.add(b.id); }
          return (<div key={r.id} style={{ flex: '0 0 auto', width: 'min(340px, 100%)' }}>
            <div className="row" style={{ justifyContent: 'space-between', margin: '0 0 4px', flexWrap: 'nowrap' }}><div style={{ minWidth: 0 }}><b>{r.name}</b><div className="mut" style={{ fontSize: '.8rem' }}>{place(r)} · {top}U · {framesIn(r).length} frame{framesIn(r).length === 1 ? '' : 's'}</div></div>
              <span className="row" style={{ margin: 0, flexWrap: 'nowrap' }}><AddDialog action={addHwFrame} inline label="Frame" title={`New frame in ${r.name}`} placeholder="Frame name (e.g. MV Frame 1)"><FrameFields rack={r.id} /></AddDialog>
                <Menu><b>Edit rack</b><form action={updateHwRack} className="stack"><input type="hidden" name="id" value={r.id} /><input name="name" defaultValue={r.name} required /><WhereSel cur={r} /><label>Height (RU) <input name="ru" type="number" min={1} max={100} defaultValue={r.ru} style={{ width: 80 }} /></label><button className="sec">Save</button></form>
                  <form action={deleteHwRack} className="del-row"><input type="hidden" name="id" value={r.id} /><span className="mut">Delete this rack? Its frames are kept but no longer in a rack.</span><button className="del">Yes, delete</button></form></Menu></span></div>
            <div style={{ position: 'relative', height: top * RU, border: '3px solid var(--line)', borderRadius: 8, background: 'repeating-linear-gradient(to bottom, transparent 0, transparent ' + (RU - 1) + 'px, var(--line) ' + (RU - 1) + 'px, var(--line) ' + RU + 'px)', boxSizing: 'content-box' }} aria-label={`${r.name}, ${top} rack units`}>
              {fs.map(f => { const y = (top - ((f.rack_ru ?? 1) + f.rack_h - 1)) * RU; const vert = f.slots > 6;
                return (<div key={f.id} className="rackfr" style={{ position: 'absolute', left: 3, right: 3, top: y + 1, height: f.rack_h * RU - 2, boxSizing: 'border-box', borderRadius: 5, background: 'var(--panel)', border: clash.has(f.id) ? '2px dashed #ff3b30' : '2px solid #5b6b8a', display: 'flex', flexDirection: 'column' }}>
                  <div className="fh" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, padding: '0 4px', height: 18, flex: '0 0 18px', fontSize: '.72rem' }}>
                    <span title={[f.name, f.model, f.serial && 'S/N ' + f.serial, `RU ${f.rack_ru}${f.rack_h > 1 ? '–' + ((f.rack_ru ?? 1) + f.rack_h - 1) : ''}`].filter(Boolean).join(' · ')} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{f.name}</b>{f.model ? <span className="mut"> · {f.model}</span> : null}{f.serial ? <span className="mut"> · S/N {f.serial}</span> : null}</span>
                    <FrameMenu f={f} />
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${f.slots}, minmax(0, 1fr))`, gap: 2, padding: '0 3px 3px' }}>
                    {Array.from({ length: f.slots }, (_, i) => i + 1).map(n => { const u = unitAt(f, n), c = f.slot_cards[n]; const label = u?.name ?? c?.name ?? '';
                      const cell = (<><span style={{ fontSize: '.58rem', opacity: .8, lineHeight: 1 }}>{n}</span>{label && <span style={{ fontSize: '.64rem', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: vert ? 'nowrap' : 'normal', writingMode: vert ? 'vertical-rl' : undefined, minHeight: 0 }}>{label}</span>}</>);
                      const st = { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, overflow: 'hidden', borderRadius: 3, padding: '1px 2px', minWidth: 0, textAlign: 'center' as const, color: u || c ? '#fff' : 'var(--mut, #8a93a6)', background: u ? UNIT_BG : c ? CARD_BG : 'transparent', border: u || c ? '1px solid transparent' : '1px dashed var(--line)' };
                      return u ? <Link key={n} href={`/hardware?id=${u.id}`} title={`Slot ${n}: ${u.name} (MV unit)`} style={{ ...st, textDecoration: 'none' }}>{cell}</Link> : <div key={n} title={c ? `Slot ${n}: ${c.name}` : `Slot ${n}: empty`} style={st}>{cell}</div>; })}
                  </div></div>); })}</div>
            {clash.size > 0 && <p role="alert" style={{ color: '#ff6b60', fontSize: '.85rem', margin: '6px 0 0' }}>Some frames overlap in this rack (red dashed outline).</p>}
            {nopos.length > 0 && <p className="mut" style={{ fontSize: '.85rem', margin: '6px 0 0' }}>No position set: {nopos.map((f, i) => <span key={f.id}>{i ? ', ' : ''}{f.name}</span>)}. Use ⋯ on the frame to set it.</p>}
            <details style={{ marginTop: 8 }}><summary className="mut">Frames and slots in {r.name}</summary><ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.88rem' }}>{[...framesIn(r)].sort((a, b) => (b.rack_ru ?? 0) - (a.rack_ru ?? 0)).map(f => <li key={f.id}><b>{f.name}</b> <span className="mut">{[f.model, f.serial && 'S/N ' + f.serial, f.rack_ru ? `RU ${f.rack_ru}${f.rack_h > 1 ? '–' + (f.rack_ru + f.rack_h - 1) : ''}` : ''].filter(Boolean).join(' · ')}</span>
              <ul style={{ paddingLeft: 16 }}>{Array.from({ length: f.slots }, (_, i) => i + 1).map(n => { const u = unitAt(f, n); return <li key={n}>Slot {n}: {u ? <Link href={`/hardware?id=${u.id}`}>{u.name}</Link> : occupantLabel(f, n) || <span className="mut">empty</span>}</li>; })}</ul></li>)}</ul></details></div>); })}</div></section>))}
    {loneFrames.length > 0 && (<><h2 style={{ margin: '18px 0 6px' }}>Frames not in a rack</h2><div className="card"><ul style={{ margin: 0, paddingLeft: 18 }}>{loneFrames.map(f => <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span><b>{f.name}</b> <span className="mut">· {f.slots} slots{f.model ? ' · ' + f.model : ''}{f.serial ? ' · S/N ' + f.serial : ''}</span></span><FrameMenu f={f} /></li>)}</ul></div></>)}
    {loose.length > 0 && (<><h2 style={{ margin: '18px 0 6px' }}>MV units not in a frame yet</h2><div className="card"><ul style={{ margin: 0, paddingLeft: 18 }}>{loose.map(u => <li key={u.id}><Link href={`/hardware?id=${u.id}`}>{u.name}</Link> <span className="mut">· {place(u)}</span></li>)}</ul></div></>)}
  </>);

  function FrameMenu({ f }: { f: Frame }) {
    return (<Menu><b>Edit frame</b><form action={updateHwFrame} className="stack"><input type="hidden" name="id" value={f.id} /><input name="name" defaultValue={f.name} required placeholder="Frame name" /><FrameFields cur={f} />
            <b style={{ fontSize: '.85rem' }}>Slots</b>
      {Array.from({ length: f.slots }, (_, i) => i + 1).map(n => { const u = unitAt(f, n); return (<div key={n} className="stack" style={{ gap: 4 }}><span className="mut" style={{ fontSize: '.85rem' }}>Slot {n}</span>
        <select name={'su_' + n} defaultValue={u?.id ?? ''} aria-label={`MV unit in slot ${n}`}><option value="">No MV unit</option>{units.map(x => <option key={x.id} value={x.id}>{x.name}{x.frame_id && x.frame_id !== f.id ? ` (now in ${frames.find(z => z.id === x.frame_id)?.name ?? 'another frame'})` : ''}</option>)}</select>
        {!u && <input name={'sc_' + n} defaultValue={f.slot_cards[n]?.name ?? ''} placeholder="or another card (optional)" aria-label={`Slot ${n} other card`} />}</div>); })}
      <button className="sec">Save</button></form>
      <form action={deleteHwFrame} className="del-row"><input type="hidden" name="id" value={f.id} /><span className="mut">Delete this frame? Its MV units stay but are no longer in a frame.</span><button className="del">Yes, delete</button></form></Menu>);
  }
}
