import { rows, one } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { deleteWall, setWallRooms, wallToRoom, wallFromRoom } from '@/lib/actions';
import WallEditor from './WallEditor';
import { WallArt } from './WallArt';
import { WALL_W, WALL_H } from './wallAssets';
import Menu from '../Menu';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

const Thumb = ({ assets }: { assets: any[] }) => (<svg viewBox={`0 0 ${WALL_W} ${WALL_H}`} width="100%" style={{ display: 'block', borderRadius: 6, background: '#1b2027', aspectRatio: '16/9' }} aria-hidden>
  {assets.map((a: any) => <svg key={a.id} x={a.x} y={a.y} width={a.w} height={a.h} viewBox={`0 0 ${a.w} ${a.h}`}><WallArt a={a} /></svg>)}</svg>);

export default async function Walls({ searchParams }: { searchParams: Promise<{ id?: string; q?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const { id, q } = await searchParams; const t = me.tenant_id ?? 0;
  const list = await rows('select w.* from wall_templates w where w.tenant_id=$1 and w.name ilike $2 order by w.name', [t, `%${q ?? ''}%`]);
  const lim = (await one('select max_walls_per_broadcaster m, plan, (select count(*)::int from wall_templates where tenant_id=$1) c from tenants where id=$1', [t]))!;
  const rooms = await rows(`select r.id, s.name sname, l.name lname, r.name from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by s.name,l.name,r.name`, [t]);
  const used = await rows(`select rw.wall_template_id w, rw.room_id from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1`, [t]);
  const mvs = (await rows('select id, name, (tenant_id is null) standard, jsonb_array_length(tiles)::int n from mv_layouts where tenant_id is null or tenant_id=$1 order by (tenant_id is null), name', [t])) as any[];
  const label = (r: any) => `${r.sname} › ${r.lname} › ${r.name}`;
  const roomsOf = (w: number) => used.filter((u: any) => u.w === w).map((u: any) => rooms.find((r: any) => r.id === u.room_id)).filter(Boolean);
  const cur = id === 'new' ? { id: null, name: 'New Wall Template', data: { assets: [] } } : list.find((w: any) => String(w.id) === id);
  if (cur) {
    const mine = cur.id ? roomsOf(cur.id) : []; const free = rooms.filter((r: any) => !mine.some((m: any) => m.id === r.id));
    const notice = (<div className="card" style={{ margin: '0 0 8px' }}>
      <b>Used in: </b>{mine.length === 0 ? <span className="mut">no Rooms yet. Save the template, then add it to a Room here or from the library.</span> : mine.map((r: any) => <form key={r.id} action={wallFromRoom} style={{ display: 'inline' }}><input type="hidden" name="wall" value={cur.id} /><input type="hidden" name="room" value={r.id} /><span className="tag">{label(r)} <button className="del" style={{ padding: '0 6px', marginLeft: 4 }} title="Remove from this Room (Jobs using it there lose it)" aria-label={`Remove from ${label(r)}`}>×</button></span></form>)}
      {cur.id && free.length > 0 && <form action={wallToRoom} style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}><input type="hidden" name="wall" value={cur.id} /><select name="room" aria-label="Room">{free.map((r: any) => <option key={r.id} value={r.id}>{label(r)}</option>)}</select><button className="sec">Add to Room</button></form>}
      {mine.length > 1 && <p style={{ margin: '6px 0 0', color: '#b45309' }}><b>Warning:</b> this Wall Template is used in {mine.length} Rooms. Changes here change the wall in all of them.</p>}</div>);
    return <WallEditor key={String(cur.id)} id={cur.id} initialName={cur.name} initial={cur.data.assets} notice={notice} mvs={mvs} />;
  }
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Wall Template library</h1><Link href="/walls?id=new" className="btn small">+ New Wall Template</Link></div>
    <p className="mut">{lim.c} Wall Template{lim.c === 1 ? '' : 's'}{lim.m >= 100000 ? '' : ` of ${lim.m} allowed`} <span className="tag">{lim.plan}</span></p>
    <form className="row"><input name="q" placeholder="Search Wall Templates" defaultValue={q} /><button className="sec">Search</button></form>
    {list.length === 0 && <p className="mut">No Wall Templates yet. Press “+ New Wall Template” to design one.</p>}
    <div className="tiles">{list.map((w: any) => { const mine = roomsOf(w.id); const on = new Set(mine.map((r: any) => r.id));
      return (<div key={w.id} className="card tile" style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><Link href={`/walls?id=${w.id}`} className="tilelink"><b>{w.name}</b></Link>
          <Menu><b>Apply to Rooms</b>
            {rooms.length === 0 ? <span className="mut">No Rooms yet. Add Rooms on the Sites page.</span> :
            <form action={setWallRooms} className="stack"><input type="hidden" name="wall" value={w.id} />
              <div style={{ maxHeight: 220, overflow: 'auto' }}>{rooms.map((r: any) => <label key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" name="room" value={r.id} defaultChecked={on.has(r.id)} />{label(r)}</label>)}</div>
              <span className="mut">Unticking a Room removes this wall from it, and from Jobs using it there.</span><button className="sec">Save</button></form>}
            <form action={deleteWall} className="del-row"><input type="hidden" name="id" value={w.id} /><span className="mut">Delete this Wall Template? It is removed from any Room and Job using it.</span><button className="del">Yes, delete</button></form></Menu></div>
        <Link href={`/walls?id=${w.id}`} style={{ display: 'block', margin: '6px 0' }}><Thumb assets={w.data.assets} /></Link>
        <div className="mut" style={{ fontSize: 13 }}>{mine.length === 0 ? 'Not used in any Room' : <>Used in: {mine.map((r: any) => <span key={r.id} className="tag">{label(r)}</span>)}</>}</div></div>); })}</div></>);
}
