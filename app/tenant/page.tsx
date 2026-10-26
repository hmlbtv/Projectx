import Link from 'next/link';
import Menu from '../Menu';
import { rows } from '@/lib/db';
import { requireMe, isAdmin, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import AddDialog from '../AddDialog';
import { addSite, addLocation, addRoom, renameNode, addRoomWall, removeRoomWall, renameRoomWall, deleteNode } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Sites({ searchParams }: { searchParams: Promise<{ s?: string; l?: string; r?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0; const q = await searchParams; const adm = isAdmin(me);
  const sites = await rows('select * from sites where tenant_id=$1 order by name', [t]);
  const locs = await rows('select l.* from locations l join sites s on s.id=l.site_id where s.tenant_id=$1 order by l.name', [t]);
  const rms = await rows('select r.* from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by r.name', [t]);
  const walls = await rows('select id,name,site_id from wall_templates where tenant_id=$1 order by name', [t]);
  const rw = await rows('select rw.*, w.name wall from room_walls rw join wall_templates w on w.id=rw.wall_template_id join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by rw.name', [t]);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const Edit = ({ table, id, name, what }: { table: string; id: number; name: string; what: string }) => (<>
    <b>Edit {what}</b><form action={renameNode} className="stack"><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><input name="name" defaultValue={name} required /><button className="sec">Save</button></form>
    {adm && <form action={deleteNode} className="del-row"><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><span className="mut">Delete this {what} and everything inside it? This cannot be undone.</span><button className="del">Yes, delete</button></form>}</>);
  const Bar = ({ back }: { back: string }) => (<div className="crumbs"><Link href={back} className="btn sec">← Back</Link><Link href="/tenant" className="btn sec">Sites home</Link></div>);
  const Head = ({ crumb, title, sub, children }: any) => (<div className="card tile head"><div>{crumb && <div className="mut">{crumb}</div>}<h1 style={{ margin: 0 }}>{title}</h1><div className="mut">{sub}</div></div><Menu>{children}</Menu></div>);

  // ---- Room: walls ----
  const rid = Number(q.r) || 0;
  if (rid) {
    const r = rms.find((x: any) => x.id === rid); if (!r) redirect('/tenant');
    const l = locs.find((x: any) => x.id === r.location_id)!; const s = sites.find((x: any) => x.id === l.site_id)!; const mine = rw.filter((x: any) => x.room_id === r.id); const siteWalls = walls.filter((w: any) => !mine.some((m: any) => m.wall_template_id === w.id));
    return (<><Bar back={`/tenant?l=${l.id}`} />
      <Head crumb={`${s.name} › ${l.name}`} title={r.name} sub={`Room · ${plural(mine.length, 'Wall Template')}`}><Edit table="rooms" id={r.id} name={r.name} what="Room" /></Head>
      {walls.length === 0 ? <p className="mut">No Wall Templates built yet. <Link href="/walls">Build one in the Wall Designer</Link>, then add it here.</p> : siteWalls.length === 0 ? <p className="mut">Every Wall Template in your library is already in this Room.</p> :
        <AddDialog action={addRoomWall} label="Add Wall Template" title="Choose a Wall Template from your library" noName><input type="hidden" name="room" value={r.id} />
          <select name="wall">{siteWalls.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></AddDialog>}
      {mine.length === 0 && <p className="mut">No Wall Template yet. The Room is saved and can be used now; add a wall whenever it is ready.</p>}
      <div className="tiles">{mine.map((x: any) => (<div key={x.id} className="card tile"><div className="tilelink"><b>{x.name}</b><span className="mut">{x.wall}</span></div>
        <Menu><b>Edit Wall Template</b><form action={renameRoomWall} className="stack"><input type="hidden" name="id" value={x.id} /><input name="name" defaultValue={x.name} required /><button className="sec">Save</button></form>
          <form action={removeRoomWall} className="del-row"><span className="mut">Remove this Wall Template from the Room? Jobs using it lose it.</span><input type="hidden" name="id" value={x.id} /><button className="del">Yes, remove</button></form></Menu></div>))}</div></>);
  }
  // ---- Location: rooms ----
  const lid = Number(q.l) || 0;
  if (lid) {
    const l = locs.find((x: any) => x.id === lid); if (!l) redirect('/tenant');
    const s = sites.find((x: any) => x.id === l.site_id)!; const mine = rms.filter((x: any) => x.location_id === l.id);
    return (<><Bar back={`/tenant?s=${s.id}`} />
      <Head crumb={s.name} title={l.name} sub={`Location · ${plural(mine.length, 'Room')}`}><Edit table="locations" id={l.id} name={l.name} what="Location" /></Head>
      <AddDialog action={addRoom} label="Add Room" title="New Room" placeholder="Room name"><input type="hidden" name="parent" value={l.id} /></AddDialog>
      {mine.length === 0 && <p className="mut">No Rooms yet.</p>}
      <div className="tiles">{mine.map((r: any) => (<div key={r.id} className="card tile"><Link href={`/tenant?r=${r.id}`} className="tilelink"><b>{r.name}</b><span className="mut">{plural(rw.filter((x: any) => x.room_id === r.id).length, 'Wall Template')}</span></Link>
        <Menu><Edit table="rooms" id={r.id} name={r.name} what="Room" /></Menu></div>))}</div></>);
  }
  // ---- Site: locations ----
  const sid = Number(q.s) || 0;
  if (sid) {
    const s = sites.find((x: any) => x.id === sid); if (!s) redirect('/tenant');
    const mine = locs.filter((x: any) => x.site_id === s.id);
    return (<><Bar back="/tenant" />
      <Head title={s.name} sub={`Site · ${plural(mine.length, 'Location')}`}><Edit table="sites" id={s.id} name={s.name} what="Site" /></Head>
      <AddDialog action={addLocation} label="Add Location" title="New Location" placeholder="Location name"><input type="hidden" name="parent" value={s.id} /></AddDialog>
      {mine.length === 0 && <p className="mut">No Locations yet.</p>}
      <div className="tiles">{mine.map((l: any) => (<div key={l.id} className="card tile"><Link href={`/tenant?l=${l.id}`} className="tilelink"><b>{l.name}</b><span className="mut">{plural(rms.filter((r: any) => r.location_id === l.id).length, 'Room')}</span></Link>
        <Menu><Edit table="locations" id={l.id} name={l.name} what="Location" /></Menu></div>))}</div></>);
  }
  // ---- Home: sites ----
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Sites</h1><AddDialog action={addSite} inline label="Add Site" title="New Site" placeholder="Site name" /></div>
    <p className="mut">Site → Location → Room. Wall Templates are placed in Rooms, each with its own name, and then assigned to Jobs.</p>
    {sites.length === 0 && <p className="mut">No Sites yet. Add one to get started.</p>}
    <div className="tiles">{sites.map((s: any) => (<div key={s.id} className="card tile"><Link href={`/tenant?s=${s.id}`} className="tilelink"><b>{s.name}</b><span className="mut">{plural(locs.filter((l: any) => l.site_id === s.id).length, 'Location')}</span></Link>
      <Menu><Edit table="sites" id={s.id} name={s.name} what="Site" /></Menu></div>))}</div></>);
}
