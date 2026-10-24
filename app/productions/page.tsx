import ActionForm from './ActionForm';
import InviteUser from './InviteUser';
import ShareWall from './ShareWall';
import ReassignLink from './ReassignLink';
import { revokeWallLink } from '@/lib/guestActions';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { addBroadcaster, addProduction, addJob, assignRoom, removeJobUser } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Productions() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 0;
  const lim = (await rows('select max_broadcasters b, max_productions p, max_jobs_per_production j from tenants where id=$1', [t]))[0];
  const bs = await rows('select * from broadcasters where tenant_id=$1 order by id', [t]);
  const ps = await rows('select p.* from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by p.id', [t]);
  const js = await rows('select j.*, ss.name ss_name from jobs j left join source_sets ss on ss.id=j.source_set_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 and (j.expires_at is null or j.expires_at >= current_date) order by j.job_date', [t]);
  const rw = await rows(`select jr.job_id, rw.id, rw.name wname, r.name rname from job_rooms jr join rooms r on r.id=jr.room_id join room_walls rw on rw.room_id=r.id
    join locations l on l.id=r.location_id join sites st on st.id=l.site_id where st.tenant_id=$1`, [t]);
  const wl = await rows(`select wl.id, wl.job_id, wl.email, wl.access, wl.revoked, rw.name wname from wall_links wl join room_walls rw on rw.id=wl.room_wall_id
    join jobs jb on jb.id=wl.job_id join productions pr on pr.id=jb.production_id join broadcasters bc on bc.id=pr.broadcaster_id where bc.tenant_id=$1 order by wl.id`, [t]);
  const contacts = await rows('select id,name,email,company from contacts where tenant_id=$1 order by name', [t]);
  const pcs = await rows('select pc.production_id, pc.contact_id from production_contacts pc join contacts c on c.id=pc.contact_id where c.tenant_id=$1', [t]);
  const sets = await rows('select * from source_sets where tenant_id=$1', [t]);
  const rooms = await rows('select r.id, r.name, l.name loc, s.name site from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [t]);
  const jr = await rows('select jr.job_id, r.name from job_rooms jr join rooms r on r.id=jr.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [t]);
  const ju = await rows('select ju.job_id, ju.user_id, u.email from job_users ju join users u on u.id=ju.user_id where u.tenant_id=$1', [t]);
  return (<><h1>Productions</h1>
    <p className="mut">Plan limits: {lim.b} Broadcaster{lim.b === 1 ? '' : 's'}, {lim.p} Productions each, {lim.j} active Jobs each.</p><p className="mut">Broadcaster → Production → Job. Jobs expire on the date set, or 5 days after the final date, and are then archived.</p>
    <ActionForm action={addBroadcaster} className="row"><input name="name" placeholder="New Broadcaster" required /><button>Add Broadcaster</button></ActionForm>
    {bs.map((b: any) => (<div key={b.id} className="card"><b>Broadcaster: {b.name}</b>
      <div className="tree"><ActionForm action={addProduction} className="row"><input type="hidden" name="parent" value={b.id} /><input name="name" placeholder="New Production" required /><button className="sec">Add Production</button></ActionForm>
        {ps.filter((p: any) => p.broadcaster_id === b.id).map((p: any) => (<div key={p.id}><b>Production: {p.name}</b>
          <div className="tree"><ActionForm action={addJob} className="row"><input type="hidden" name="parent" value={p.id} /><input name="name" placeholder="Job name" required />
            <input type="date" name="date" title="Job date" /><input type="date" name="final" title="Final date" /><input type="date" name="expires" title="Expiry (optional)" />
            <select name="sourceSet"><option value="">Source Set…</option>{sets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="sec">Add Job</button></ActionForm>
            {js.filter((j: any) => j.production_id === p.id).map((j: any) => (<div key={j.id} className="card"><b>Job: {j.name}</b> <span className="mut">date {String(j.job_date).slice(0, 10)} · expires {String(j.expires_at).slice(0, 10)} · {j.ss_name ?? 'no Source Set'}</span>
              <div>Rooms: {jr.filter((x: any) => x.job_id === j.id).map((x: any) => <span key={x.name} className="tag">{x.name}</span>)}</div>
              <form action={assignRoom} className="row"><input type="hidden" name="job" value={j.id} /><select name="room">{rooms.map((r: any) => <option key={r.id} value={r.id}>{r.site} / {r.loc} / {r.name}</option>)}</select><button className="sec">Add Room</button></form>
              <div>Users: {ju.filter((x: any) => x.job_id === j.id).map((x: any) => <form key={x.email} action={removeJobUser} style={{ display: 'inline' }}><input type="hidden" name="job" value={j.id} /><input type="hidden" name="user" value={x.user_id} /><span className="tag">{x.email} <button title="Remove from Job" style={{ background: 'none', color: 'inherit', padding: 0 }}>×</button></span></form>)}</div>
              <InviteUser job={j.id} />
              <div style={{ marginTop: 8 }}><b>Share a wall with a guest</b> <span className="mut">(they sign in with the contact's email and see everything shared with them in one place)</span>
                <ShareWall job={j.id} production={p.id} assigned={contacts.filter((c: any) => pcs.some((x: any) => x.production_id === p.id && x.contact_id === c.id))} others={contacts.filter((c: any) => !pcs.some((x: any) => x.production_id === p.id && x.contact_id === c.id))} walls={rw.filter((x: any) => x.job_id === j.id).map((x: any) => ({ id: x.id, label: `${x.rname} / ${x.wname}` }))} />
                {wl.filter((x: any) => x.job_id === j.id).map((x: any) => (<form key={x.id} action={revokeWallLink} className="row" style={{ margin: '2px 0' }}><input type="hidden" name="id" value={x.id} />
                  <span className="tag">{x.wname}</span><span className="tag">{x.email}</span><span className="tag">{x.access === 'edit' ? 'can edit' : 'view only'}</span>
                  {x.revoked ? <span className="tag">switched off</span> : <button className="del" style={{ minHeight: 0, padding: '2px 10px' }}>Switch off</button>}</form>))}
                {wl.filter((x: any) => x.job_id === j.id && !x.revoked).map((x: any) => (<details key={'m' + x.id} style={{ margin: '2px 0' }}><summary className="mut" style={{ cursor: 'pointer' }}>Move or resend: {x.wname} → {x.email}</summary>
                  <ReassignLink id={x.id} current={x.email} contacts={contacts.filter((c: any) => pcs.some((y: any) => y.production_id === p.id && y.contact_id === c.id))} /></details>))}</div></div>))}</div></div>))}</div></div>))}</>);
}
