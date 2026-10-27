import { rows, one } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { deleteWall, setWallRooms, wallFromRoom } from '@/lib/actions';
import WallEditor from './WallEditor';
import WallThumb from './WallThumb';
import Menu from '../Menu';
import Link from 'next/link';
export const dynamic = 'force-dynamic';


export default async function Walls({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; f?: string; site?: string; sort?: string; view?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const { id, q: q0, f: fl, site: st0, sort: so, view: vw } = await searchParams; const t = me.tenant_id ?? 0, q = (q0 ?? '').trim().slice(0, 80);
  const list = await rows('select w.* from wall_templates w where w.tenant_id=$1 order by w.name', [t]);
  const lim = (await one('select max_walls_per_broadcaster m, plan, (select count(*)::int from wall_templates where tenant_id=$1) c from tenants where id=$1', [t]))!;
  const rooms = await rows(`select r.id, s.id sid, l.id lid, s.name sname, l.name lname, r.name from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by s.name,l.name,r.name`, [t]);
  const used = await rows(`select rw.wall_template_id w, rw.room_id from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1`, [t]);
  const mvs = ((await rows('select id, name, (tenant_id is null) standard, jsonb_array_length(tiles)::int n, tiles from mv_layouts where tenant_id is null or tenant_id=$1 order by (tenant_id is null), name', [t])) as any[]).map(m => ({ ...m, tiles: (m.tiles ?? []).map((x: any) => ({ x: x.x, y: x.y, w: x.w, h: x.h })) }));
  const dsets = ((await rows(`select ds.id, ds.name, st.name site, coalesce((select json_agg(json_build_object('id', d.id, 'name', d.name) order by d.pos, d.id) from destinations d where d.set_id=ds.id), '[]'::json) dests from destination_sets ds join sites st on st.id=ds.site_id where ds.tenant_id=$1 order by st.name, ds.name`, [t])) as any[]);
  const sites = Array.from(new Map(rooms.map((r: any) => [r.sid, { id: r.sid, name: r.sname }])).values()) as any[];
  const locs = Array.from(new Map(rooms.map((r: any) => [r.lid, { id: r.lid, sid: r.sid, lname: r.lname }])).values()) as any[];
  const label = (r: any) => `${r.sname} › ${r.lname} › ${r.name}`;
  const roomsOf = (w: number) => used.filter((u: any) => u.w === w).map((u: any) => rooms.find((r: any) => r.id === u.room_id)).filter(Boolean);
  const f = ['used', 'unused', 'mv', 'nomv'].includes(fl ?? '') ? fl! : 'all', siteF = Number(st0) || 0, sort = ['name', 'namez', 'new', 'old', 'most', 'fewest', 'rmost', 'rfewest'].includes(so ?? '') ? so! : 'name', view = vw === 'list' ? 'list' : 'cards';
  const keep = new URLSearchParams({ ...(q ? { q } : {}), ...(f !== 'all' ? { f } : {}), ...(siteF ? { site: String(siteF) } : {}), ...(sort !== 'name' ? { sort } : {}), ...(view === 'list' ? { view } : {}) });
  const cur = id === 'new' ? { id: null, name: 'New Wall Template', data: { assets: [] } } : list.find((w: any) => String(w.id) === id);
  if (cur) {
    const mine = cur.id ? roomsOf(cur.id) : [];
    const notice = (<div className="card" style={{ margin: '0 0 8px' }}>
      <b>Used in: </b>{mine.length === 0 ? <span className="mut">no Rooms yet. Save the template, then add it to a Room from the library menu (⋯) or the Room page.</span> : mine.map((r: any) => <form key={r.id} action={wallFromRoom} style={{ display: 'inline' }}><input type="hidden" name="wall" value={cur.id} /><input type="hidden" name="room" value={r.id} /><span className="tag">{label(r)} <button className="del" style={{ padding: '0 6px', marginLeft: 4 }} title="Remove from this Room (Jobs using it there lose it)" aria-label={`Remove from ${label(r)}`}>×</button></span></form>)}
      {mine.length > 1 && <p style={{ margin: '6px 0 0', color: '#b45309' }}><b>Note:</b> a Wall Template can be in only one Room, but this one is in {mine.length} from before. Remove it from the extra Rooms (the × above) to keep just one.</p>}</div>);
    return <WallEditor key={String(cur.id)} id={cur.id} initialName={cur.name} initial={cur.data.assets} notice={notice} mvs={mvs} dsets={dsets} backQuery={keep.toString() ? '?' + keep.toString() : ''} />;
  }
  const isMon = (x: any) => /^(mon|monitor|bvm|pvm)/.test(String(x.type));
  const nMon = (w: any) => (w.data.assets || []).filter(isMon).length;
  const hasMv = (w: any) => (w.data.assets || []).some((x: any) => isMon(x) && x.props?.mvs?.length);
  const qq = q.toLowerCase();
  const shown = list.filter((w: any) => { const rs = roomsOf(w.id);
    if (qq && !(w.name.toLowerCase().includes(qq) || rs.some((r: any) => `${r.sname} ${r.lname} ${r.name}`.toLowerCase().includes(qq)))) return false;
    if (siteF && !rs.some((r: any) => r.sid === siteF)) return false;
    return f === 'all' || (f === 'used' ? rs.length > 0 : f === 'unused' ? rs.length === 0 : f === 'mv' ? hasMv(w) : !hasMv(w)); })
    .sort((a: any, b: any) => sort === 'namez' ? b.name.localeCompare(a.name, undefined, { numeric: true }) : sort === 'new' ? b.id - a.id : sort === 'old' ? a.id - b.id : sort === 'most' ? nMon(b) - nMon(a) : sort === 'fewest' ? nMon(a) - nMon(b)
      : sort === 'rmost' ? roomsOf(b.id).length - roomsOf(a.id).length : sort === 'rfewest' ? roomsOf(a.id).length - roomsOf(b.id).length : a.name.localeCompare(b.name, undefined, { numeric: true }));
  const qs = (v: string, so2 = sort) => new URLSearchParams({ ...(q ? { q } : {}), f, ...(siteF ? { site: String(siteF) } : {}), sort: so2, view: v }).toString();
  const th = (labelT: string, asc: string, desc: string) => { const on = sort === asc || sort === desc, next = sort === asc ? desc : asc;
    return <th><Link href={`/walls?${qs(view, next)}`} className={on ? 'on' : ''}>{labelT}{on ? (sort === asc ? ' ▲' : ' ▼') : ''}</Link></th>; };
  const open = (wid: number) => `/walls?id=${wid}${keep.toString() ? '&' + keep.toString() : ''}`;
  const where = (mine: any[]) => mine.length === 0 ? <span className="mut">Not used in any Room</span> : <>{mine.map((r: any) => <span key={r.id} className="tag">{label(r)}</span>)}</>;
  const menuOf = (w: any, mine: any[]) => { const on = new Set(mine.map((r: any) => r.id)); return (
    <Menu><b>Apply to a Room</b>
            {rooms.length === 0 ? <span className="mut">No Rooms yet. Add Rooms on the Sites page.</span> :
            <form action={setWallRooms} className="stack"><input type="hidden" name="wall" value={w.id} />
              <div style={{ maxHeight: 260, overflow: 'auto', minWidth: 240 }}><label style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', fontWeight: 400, padding: '2px 0' }}><input type="radio" name="room" value="" defaultChecked={on.size === 0} style={{ margin: 0 }} />No Room</label>{sites.map((s: any) => { const sr = rooms.filter((r: any) => r.sid === s.id); const sOn = sr.filter((r: any) => on.has(r.id)).length;
                return (<details key={s.id} open={sOn > 0}><summary style={{ cursor: 'pointer', fontWeight: 600 }}>{s.name} <span className="mut" style={{ fontWeight: 400 }}>{sOn ? `${sOn} of ${sr.length}` : sr.length}</span></summary>
                  <div style={{ marginLeft: 14 }}>{locs.filter((l: any) => l.sid === s.id).map((l: any) => { const lr = sr.filter((r: any) => r.lid === l.id); const lOn = lr.filter((r: any) => on.has(r.id)).length;
                    return (<details key={l.id} open={lOn > 0}><summary style={{ cursor: 'pointer' }}>{l.lname} <span className="mut">{lOn ? `${lOn} of ${lr.length}` : lr.length}</span></summary>
                      <div style={{ marginLeft: 14 }}>{lr.map((r: any) => <label key={r.id} style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', fontWeight: 400, padding: '2px 0' }}><input type="radio" name="room" value={r.id} defaultChecked={on.has(r.id)} style={{ margin: 0 }} />{r.name}</label>)}</div></details>); })}</div></details>); })}</div>
              <span className="mut">A Wall Template can be in only one Room. Choosing a different Room (or No Room) removes it from the old one, and from Jobs using it there.</span><button className="sec">Save</button></form>}
            <form action={deleteWall} className="del-row"><input type="hidden" name="id" value={w.id} /><span className="mut">Delete this Wall Template? It is removed from any Room and Job using it.</span><button className="del">Yes, delete</button></form></Menu> ); };
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Wall Template library</h1><Link href="/walls?id=new" className="btn small">+ New Wall Template</Link></div>
    <p className="mut">{lim.c} Wall Template{lim.c === 1 ? '' : 's'}{lim.m >= 100000 ? '' : ` of ${lim.m} allowed`} <span className="tag">{lim.plan}</span></p>
    <form method="get" className="lay-bar">
      <input type="search" name="q" defaultValue={q} placeholder="Search by name, Site, Location or Room" aria-label="Search Wall Templates" />
      <select name="site" defaultValue={siteF || ''} aria-label="Site"><option value="">All Sites</option>{sites.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select name="f" defaultValue={f} aria-label="Filter"><option value="all">All Wall Templates</option><option value="used">Used in a Room</option><option value="unused">Not used in a Room</option><option value="mv">With multiview templates assigned</option><option value="nomv">No multiview templates assigned</option></select>
      <select name="sort" defaultValue={sort} aria-label="Sort"><option value="name">Name A to Z</option><option value="namez">Name Z to A</option><option value="new">Newest first</option><option value="old">Oldest first</option><option value="most">Most monitors</option><option value="fewest">Fewest monitors</option><option value="rmost">Used in most Rooms</option><option value="rfewest">Used in fewest Rooms</option></select>
      <input type="hidden" name="view" value={view} /><button className="sec small">Apply</button>
      <span className="lay-view"><Link className={view === 'cards' ? 'on' : ''} href={`/walls?${qs('cards')}`}>Cards</Link><Link className={view === 'list' ? 'on' : ''} href={`/walls?${qs('list')}`}>List</Link></span></form>
    <p className="mut">{shown.length} of {list.length} Wall Template{list.length === 1 ? '' : 's'}</p>
    {list.length === 0 && <p className="mut">No Wall Templates yet. Press “+ New Wall Template” to design one.</p>}
    {list.length > 0 && shown.length === 0 && <p className="mut">No Wall Templates match.</p>}
    {view === 'cards' ? <div className="tiles">{shown.map((w: any) => { const mine = roomsOf(w.id);
      return (<div key={w.id} className="card tile" style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><Link href={open(w.id)} className="tilelink"><b>{w.name}</b></Link>{menuOf(w, mine)}</div>
        <Link href={open(w.id)} style={{ display: 'block', margin: '6px 0' }}><WallThumb assets={w.data.assets} /></Link>
        <div className="mut" style={{ fontSize: 13 }}>{mine.length === 0 ? 'Not used in any Room' : <>Used in: {where(mine)}</>}</div></div>); })}</div>
    : <div className="card" style={{ padding: 0, overflowX: 'auto' }}><table className="lay-list"><thead><tr><th></th>{th('Name', 'name', 'namez')}{th('Monitors', 'fewest', 'most')}<th>Multiview</th>{th('Used in', 'rfewest', 'rmost')}<th></th></tr></thead><tbody>
      {shown.map((w: any) => { const mine = roomsOf(w.id); const n = (w.data.assets || []).filter((x: any) => isMon(x) && x.props?.mvs?.length).length;
        return (<tr key={w.id}><td style={{ width: 120 }}><Link href={open(w.id)}><div style={{ width: 110 }}><WallThumb assets={w.data.assets} /></div></Link></td>
          <td><Link href={open(w.id)}><b>{w.name}</b></Link></td><td>{nMon(w)}</td><td>{n ? `${n} monitor${n === 1 ? '' : 's'}` : <span className="mut">none</span>}</td>
          <td style={{ fontSize: 13 }}>{where(mine)}</td><td className="lay-act">{menuOf(w, mine)}</td></tr>); })}</tbody></table></div>}</>);
}
