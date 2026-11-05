import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireMe, isAdmin } from '@/lib/session';
import { rows } from '@/lib/db';
import { loadHardware } from '@/lib/hardware';
import type { Unit } from '@/lib/hardware';
export const dynamic = 'force-dynamic';

// A picture of each rack: every MV unit drawn at its rack position, with its cards, so a unit can be found in the facility.
const RU = 22; // pixels per rack unit
const TYPE_COLOR: Record<string, string> = { Input: '#1d6b3a', Output: '#8a5a12', Other: '#46506a' };

export default async function Racks() {
  const me = await requireMe(); if (!isAdmin(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const [{ units, outs }, sites, locs, rooms] = await Promise.all([loadHardware(t), rows<any>('select id,name from sites where tenant_id=$1', [t]), rows<any>('select l.id,l.name,l.site_id from locations l join sites s on s.id=l.site_id where s.tenant_id=$1', [t]), rows<any>('select r.id,r.name,r.location_id from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [t])]);
  const place = (u: Unit) => { const r = rooms.find((x: any) => x.id === u.room_id); const l = locs.find((x: any) => x.id === (r?.location_id ?? u.location_id)); return [sites.find((x: any) => x.id === u.site_id)?.name, l?.name, r?.name].filter(Boolean).join(' › '); };
  const racked = units.filter(u => u.rack && u.rack_ru), loose = units.filter(u => !(u.rack && u.rack_ru));
  // One rack per (Site, rack name): the same name in two Sites is two different racks.
  const racks = new Map<string, { site: string; name: string; units: Unit[] }>();
  for (const u of racked) { const site = sites.find((x: any) => x.id === u.site_id)?.name ?? ''; const k = site + '\u0000' + u.rack.toLowerCase(); if (!racks.has(k)) racks.set(k, { site, name: u.rack, units: [] }); racks.get(k)!.units.push(u); }
  const list = [...racks.values()].sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const bySite = new Map<string, typeof list>(); for (const r of list) bySite.set(r.site, [...(bySite.get(r.site) ?? []), r]);
  return (<><div className="pagehead"><h1 style={{ margin: 0 }}>Rack view</h1></div>
    <p className="mut"><Link href="/hardware">MV Hardware</Link> · Set a unit's rack and position under Edit hardware.</p>
    {units.length === 0 && <p className="mut">No hardware yet.</p>}
    {[...bySite.entries()].map(([site, rs]) => (<section key={site}><h2 style={{ margin: '18px 0 6px' }}>{site}</h2>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
        {rs.map(r => { const top = Math.max(42, ...r.units.map(u => (u.rack_ru ?? 1) + u.rack_h - 1)); const clash = new Set<number>();
          for (const a of r.units) for (const b of r.units) if (a.id < b.id && (a.rack_ru ?? 0) <= (b.rack_ru ?? 0) + b.rack_h - 1 && (b.rack_ru ?? 0) <= (a.rack_ru ?? 0) + a.rack_h - 1) { clash.add(a.id); clash.add(b.id); }
          return (<div key={r.name} style={{ flex: '0 0 auto', width: 300 }}><div className="row" style={{ justifyContent: 'space-between', margin: '0 0 4px' }}><b>{r.name}</b><span className="mut">{r.units.length} unit{r.units.length === 1 ? '' : 's'} · {top}U</span></div>
            <div style={{ position: 'relative', height: top * RU, border: '3px solid var(--line)', borderRadius: 8, background: 'repeating-linear-gradient(to bottom, transparent 0, transparent ' + (RU - 1) + 'px, var(--line) ' + (RU - 1) + 'px, var(--line) ' + RU + 'px)', boxSizing: 'content-box' }} aria-label={`${r.name}, ${top} rack units`}>
              {r.units.map(u => { const y = (top - ((u.rack_ru ?? 1) + u.rack_h - 1)) * RU; const mine = outs.filter(o => o.unit_id === u.id).length;
                return (<Link key={u.id} href={`/hardware?id=${u.id}`} title={`${u.name} · ${place(u)}`} style={{ position: 'absolute', left: 3, right: 3, top: y + 1, height: u.rack_h * RU - 2, overflow: 'hidden', boxSizing: 'border-box', padding: '3px 6px', borderRadius: 5, background: 'var(--panel)', border: clash.has(u.id) ? '2px dashed #ff3b30' : '2px solid #5b6b8a', color: 'var(--text)', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: '.78rem', lineHeight: 1.2 }}><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</b><span className="mut" style={{ whiteSpace: 'nowrap' }}>RU {u.rack_ru}{u.rack_h > 1 ? `–${(u.rack_ru ?? 1) + u.rack_h - 1}` : ''}</span></span>
                  {u.rack_h >= 2 && <span className="mut" style={{ fontSize: '.7rem', lineHeight: 1.2 }}>{u.model ? u.model + ' · ' : ''}{u.inputs} in · {u.outputs} out · {mine} used</span>}
                  {u.rack_h >= 2 && u.cards.length > 0 && <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap', marginTop: 'auto' }}>{u.cards.map((c, i) => <span key={i} title={`Slot ${c.slot}: ${c.name} (${c.type})`} style={{ fontSize: '.62rem', padding: '1px 4px', borderRadius: 3, background: TYPE_COLOR[c.type] ?? TYPE_COLOR.Other, color: '#fff', whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.slot}: {c.name}</span>)}</span>}
                </Link>); })}</div>
            {clash.size > 0 && <p role="alert" style={{ color: '#ff6b60', fontSize: '.85rem', margin: '6px 0 0' }}>Some units overlap in this rack (red outline).</p>}
            <details style={{ marginTop: 8 }}><summary className="mut">Units and cards in {r.name}</summary><ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '.88rem' }}>{[...r.units].sort((a, b) => (b.rack_ru ?? 0) - (a.rack_ru ?? 0)).map(u => <li key={u.id}><Link href={`/hardware?id=${u.id}`}>{u.name}</Link> <span className="mut">· {place(u)} · RU {u.rack_ru}{u.rack_h > 1 ? `–${(u.rack_ru ?? 1) + u.rack_h - 1}` : ''}</span>{u.cards.length > 0 && <ul style={{ paddingLeft: 16 }}>{u.cards.map((c, i) => <li key={i}>Slot {c.slot}: {c.name} <span className="mut">({c.type})</span></li>)}</ul>}</li>)}</ul></details></div>); })}</div></section>))}
    {loose.length > 0 && (<><h2 style={{ margin: '18px 0 6px' }}>Not in a rack yet</h2><div className="card"><ul style={{ margin: 0, paddingLeft: 18 }}>{loose.map(u => <li key={u.id}><Link href={`/hardware?id=${u.id}`}>{u.name}</Link> <span className="mut">· {place(u)}{u.rack ? ` · ${u.rack} (no position)` : ''}</span></li>)}</ul></div></>)}
  </>);
}
