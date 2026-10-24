import { rows } from '@/lib/db';
import { requireMe, isAdmin, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { addSite, addLocation, addRoom, renameNode, addRoomWall, removeRoomWall } from '@/lib/actions';
export const dynamic = 'force-dynamic';

function Add({ action, parent, ph }: any) {
  return <form action={action} className="row"><input type="hidden" name="parent" value={parent} /><input name="name" placeholder={ph} required /><button className="sec">Add</button></form>;
}
function Rename({ table, id, name }: any) {
  return <form action={renameNode} className="row"><input type="hidden" name="table" value={table} /><input type="hidden" name="id" value={id} /><input name="name" defaultValue={name} /><button className="sec">Rename</button></form>;
}

export default async function Tenant() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const sites = await rows('select * from sites where tenant_id=$1 order by id', [t]);
  const locs = await rows('select l.* from locations l join sites s on s.id=l.site_id where s.tenant_id=$1 order by l.id', [t]);
  const rms = await rows('select r.* from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1 order by r.id', [t]);
  const walls = await rows('select id,name from wall_templates where tenant_id=$1 or tenant_id is null order by name', [t]);
  const rw = await rows('select rw.*, w.name wall from room_walls rw join wall_templates w on w.id=rw.wall_template_id join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [t]);
  return (<><h1>Tenant Tree</h1><p className="mut">Tenant → Site → Location → Room. Wall Templates are placed in Rooms, each with its own name.</p>
    <Add action={addSite} ph="New Site" />
    {sites.map((s: any) => (<div key={s.id} className="card"><b>Site</b><Rename table="sites" id={s.id} name={s.name} />
      <div className="tree"><Add action={addLocation} parent={s.id} ph="New Location" />
        {locs.filter((l: any) => l.site_id === s.id).map((l: any) => (<div key={l.id}><b>Location</b><Rename table="locations" id={l.id} name={l.name} />
          <div className="tree"><Add action={addRoom} parent={l.id} ph="New Room" />
            {rms.filter((r: any) => r.location_id === l.id).map((r: any) => (<div key={r.id}><b>Room</b><Rename table="rooms" id={r.id} name={r.name} />
              <div className="tree">{rw.filter((x: any) => x.room_id === r.id).map((x: any) => <form key={x.id} action={removeRoomWall} className="row" style={{ margin: '4px 0' }}><input type="hidden" name="id" value={x.id} />▫ {x.name} <span className="mut">({x.wall})</span><button className="del" style={{ minHeight: 0, padding: '2px 10px' }} title="Remove this Wall Template from the Room">Remove</button></form>)}
                {rw.filter((x: any) => x.room_id === r.id).length === 0 && <div className="mut">No Wall Template yet. The Room is saved and can be used now; add a wall whenever it is ready.</div>}
                {walls.length === 0 ? <div className="mut">No Wall Templates built yet - <a href="/walls">build one in the Wall Designer</a>, then add it here.</div> :
                <form action={addRoomWall} className="row"><input type="hidden" name="room" value={r.id} /><input name="name" placeholder="Wall name in this Room" required />
                  <select name="wall">{walls.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select><button className="sec">Add Wall Template</button></form>}</div></div>))}
          </div></div>))}</div></div>))}</>);
}
