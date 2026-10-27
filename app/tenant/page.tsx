import Link from 'next/link';
import WallThumb from '../walls/WallThumb';
import Menu from '../Menu';
import { rows } from '@/lib/db';
import { requireMe, isAdmin, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import AddDialog from '../AddDialog';
import { addSite, addLocation, addRoom, renameNode, addRoomWall, removeRoomWall, renameRoomWall, deleteNode, addDestSet, updateDestSet, deleteDestSet } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Sites({ searchParams }: { searchParams: Promise<{ s?: string; l?: string; r?: string }> }) {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0; const q = await searchParams; const adm = isAdmin(me);
  const sites = await rows('select * from sites where tenant_id=$1 order by name', [t]);
  const locs = await rows('select l.* from locations l join sites s on s.id=l.site_id where s.tenant_id=$1 order by l.name', [t]);
  const rms = await rows('select r.* from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by r.name', [t]);
  const dsets = (await rows('select s.id, s.site_id, s.name, coalesce((select json_agg(d.name order by d.pos, d.id) from destinations d where d.set_id=s.id), \'[]\'::json) dests from destination_sets s where s.tenant_id=$1 order by s.name', [t])) as any[];
  const walls = await rows('select id,name,site_id from wall_templates where tenant_id=$1 order by name', [t]);
  const rw = await rows('select rw.*, w.name wall, w.data wdata from room_walls rw join wall_templates w on w.id=rw.wall_template_id join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by rw.name', [t]);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const Edit = ({ table, id, name, what }: { table: string; id: number; name: string; what: string }) => (<>
    <b>Edit {what}</b><form action={renameNode} className="stack"><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><input name="name" defaultValue={name} required /><button className="sec">Save</button></form>
    {adm && <form action={deleteNode} className="del-row"><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><span className="mut">Delete this {what} and everything inside it? This cannot be undone.</span><button className="del">Yes, delete</button></form>}</>);
  // Little previews of the walls in a Room, Location or Site (first three, then "+N more").
  const Strip = ({ list }: { list: any[] }) => list.length === 0 ? null : (<div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(list.length, 3)},1fr)`, gap: 6, marginTop: 8 }}>
    {list.slice(0, 3).map((x: any) => <div key={x.id} title={x.name}><WallThumb assets={x.wdata?.assets} /></div>)}{list.length > 3 && <span className="mut" style={{ gridColumn: '1 / -1', fontSize: '.78rem' }}>+{list.length - 3} more</span>}</div>);
  const Bar = ({ back }: { back: string }) => (<div className="crumbs"><Link href={back} className="btn sec">← Back</Link><Link href="/tenant" className="btn sec">Sites home</Link></div>);
  const Head = ({ crumb, title, sub, children }: any) => (<div className="card tile head"><div>{crumb && <div className="mut">{crumb}</div>}<h1 style={{ margin: 0 }}>{title}</h1><div className="mut">{sub}</div></div><Menu>{children}</Menu></div>);

  // ---- Room: walls ----
  const rid = Number(q.r) || 0;
  if (rid) {
    const r = rms.find((x: any) => x.id === rid); if (!r) redirect('/tenant');
    const l = locs.find((x: any) => x.id === r.location_id)!; const s = sites.find((x: any) => x.id === l.site_id)!; const mine = rw.filter((x: any) => x.room_id === r.id); const siteWalls = walls.filter((w: any) => !rw.some((m: any) => m.wall_template_id === w.id)); // a Wall Template can be in only one Room
    return (<><Bar back={`/tenant?l=${l.id}`} />
      <Head crumb={`${s.name} › ${l.name}`} title={r.name} sub={`Room · ${plural(mine.length, 'Wall Template')}`}><Edit table="rooms" id={r.id} name={r.name} what="Room" /></Head>
      {walls.length === 0 ? <p className="mut">No Wall Templates built yet. <Link href="/walls">Build one in the Wall Designer</Link>, then add it here.</p> : siteWalls.length === 0 ? <p className="mut">Every Wall Template in your library is already in a Room (a Wall Template can be in only one Room).</p> :
        <AddDialog action={addRoomWall} label="Add Wall Template" title="Choose a Wall Template from your library" noName><input type="hidden" name="room" value={r.id} />
          <select name="wall">{siteWalls.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></AddDialog>}
      {mine.length === 0 && <p className="mut">No Wall Template yet. The Room is saved and can be used now; add a wall whenever it is ready.</p>}
      <div className="tiles">{mine.map((x: any) => (<div key={x.id} className="card tile"><div className="tilelink"><b>{x.name}</b><span className="mut">{x.wall}</span><div style={{ marginTop: 8 }}><WallThumb assets={x.wdata?.assets} /></div></div>
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
      <div className="tiles">{mine.map((r: any) => (<div key={r.id} className="card tile"><Link href={`/tenant?r=${r.id}`} className="tilelink"><b>{r.name}</b><span className="mut">{plural(rw.filter((x: any) => x.room_id === r.id).length, 'Wall Template')}</span><Strip list={rw.filter((x: any) => x.room_id === r.id)} /></Link>
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
      <div className="tiles">{mine.map((l: any) => (<div key={l.id} className="card tile"><Link href={`/tenant?l=${l.id}`} className="tilelink"><b>{l.name}</b><span className="mut">{plural(rms.filter((r: any) => r.location_id === l.id).length, 'Room')}</span><Strip list={rw.filter((x: any) => rms.some((r: any) => r.id === x.room_id && r.location_id === l.id))} /></Link>
        <Menu><Edit table="locations" id={l.id} name={l.name} what="Location" /></Menu></div>))}</div>
      <h2 style={{ margin: '22px 0 4px' }}>Destination Sets</h2>
      <p className="mut" style={{ margin: '0 0 8px' }}>The named outputs of this Site (for example “UHD 5”). A monitor in a Wall Template is given some of them, and the multiview windows take those names.</p>
      <AddDialog action={addDestSet} label="Add Destination Set" title="New Destination Set" placeholder="Destination Set name (e.g. UHD 5)"><input type="hidden" name="site" value={s.id} /><textarea name="dests" placeholder="One destination per line" rows={8} /></AddDialog>
      {dsets.filter((d: any) => d.site_id === s.id).length === 0 && <p className="mut">No Destination Sets yet.</p>}
      <div className="tiles">{dsets.filter((d: any) => d.site_id === s.id).map((d: any) => (<div key={d.id} className="card tile"><div className="tilelink"><b>{d.name}</b><span className="mut">{plural(d.dests.length, 'destination')}</span><span className="mut" style={{ fontSize: '.85rem' }}>{d.dests.slice(0, 5).join(' · ')}{d.dests.length > 5 ? ` · +${d.dests.length - 5} more` : ''}</span></div>
        <Menu><b>Edit Destination Set</b><form action={updateDestSet} className="stack"><input type="hidden" name="id" value={d.id} /><input name="name" defaultValue={d.name} required /><textarea name="dests" rows={Math.min(12, Math.max(4, d.dests.length + 1))} defaultValue={d.dests.join('\n')} /><button className="sec">Save</button></form>
          <form action={deleteDestSet} className="del-row"><input type="hidden" name="id" value={d.id} /><span className="mut">Delete this Destination Set? Monitors using it lose their destinations.</span><button className="del">Yes, delete</button></form></Menu></div>))}</div></>);
  }
  // ---- Home: sites ----
  return (<><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h1 style={{ margin: 0 }}>Sites</h1><AddDialog action={addSite} inline label="Add Site" title="New Site" placeholder="Site name" /></div>
    <p className="mut">Site → Location → Room. Wall Templates are placed in Rooms, each with its own name, and then assigned to Jobs.</p>
    {sites.length === 0 && <p className="mut">No Sites yet. Add one to get started.</p>}
    <div className="tiles">{sites.map((s: any) => (<div key={s.id} className="card tile"><Link href={`/tenant?s=${s.id}`} className="tilelink"><b>{s.name}</b><span className="mut">{plural(locs.filter((l: any) => l.site_id === s.id).length, 'Location')}</span><Strip list={rw.filter((x: any) => rms.some((r: any) => r.id === x.room_id && locs.some((l: any) => l.id === r.location_id && l.site_id === s.id)))} /></Link>
      <Menu><Edit table="sites" id={s.id} name={s.name} what="Site" /></Menu></div>))}</div></>);
}
