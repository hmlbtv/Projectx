import ActionForm from './ActionForm';
import InviteUser from './InviteUser';
import ShareWall from './ShareWall';
import ReassignLink from './ReassignLink';
import { revokeWallLink } from '@/lib/guestActions';
import { rows } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { redirect } from 'next/navigation';
import { addBroadcaster, addProduction, addJob, assignRoom, removeJobUser, updateBroadcaster, updateProduction, updateJob, deleteBroadcaster, deleteProduction, deleteJob } from '@/lib/actions';
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
  const adm = isAdmin(me); const d = (x: any) => x ? new Date(x).toISOString().slice(0, 10) : '';
  const Del = ({ action, id, what }: { action: any; id: number; what: string }) => adm ? (<details className="sub"><summary className="mut">Delete…</summary>
    <form action={action} className="row"><input type="hidden" name="id" value={id} /><span>Delete this {what} and everything inside it? This cannot be undone.</span><button className="del">Yes, delete</button></form></details>) : null;
  return (<><h1>Productions</h1>
    <p className="mut">Choose a Broadcaster to see its Productions, then a Production to see its Jobs. Limits: {lim.b} Broadcaster{lim.b === 1 ? '' : 's'}, {lim.p} Productions each, {lim.j} active Jobs each. Jobs are archived when they expire.</p>
    <ActionForm action={addBroadcaster} className="row"><input name="name" placeholder="New Broadcaster" required /><button>Add Broadcaster</button></ActionForm>
    {bs.map((b: any) => (<details key={b.id} className="card acc"><summary><b>{b.name}</b> <span className="mut">Broadcaster · {ps.filter((p: any) => p.broadcaster_id === b.id).length} Production{ps.filter((p: any) => p.broadcaster_id === b.id).length === 1 ? '' : 's'}</span></summary>
      <details className="sub"><summary className="mut">Edit Broadcaster</summary><form action={updateBroadcaster} className="row"><input type="hidden" name="id" value={b.id} /><input name="name" defaultValue={b.name} required /><button className="sec">Save</button></form></details>
      <Del action={deleteBroadcaster} id={b.id} what="Broadcaster" />
      <div className="tree"><ActionForm action={addProduction} className="row"><input type="hidden" name="parent" value={b.id} /><input name="name" placeholder="New Production" required /><button className="sec">Add Production</button></ActionForm>
        {ps.filter((p: any) => p.broadcaster_id === b.id).map((p: any) => (<details key={p.id} className="acc"><summary><b>{p.name}</b> <span className="mut">Production · {js.filter((j: any) => j.production_id === p.id).length} Job{js.filter((j: any) => j.production_id === p.id).length === 1 ? '' : 's'}</span></summary>
          <details className="sub"><summary className="mut">Edit Production</summary><form action={updateProduction} className="row"><input type="hidden" name="id" value={p.id} /><input name="name" defaultValue={p.name} required /><button className="sec">Save</button></form></details>
          <Del action={deleteProduction} id={p.id} what="Production" />
          <div className="tree"><ActionForm action={addJob} className="row"><input type="hidden" name="parent" value={p.id} /><input name="name" placeholder="Job name" required />
            <input type="date" name="date" title="Job date" /><input type="date" name="final" title="Final date" /><input type="date" name="expires" title="Expiry (optional)" />
            <select name="sourceSet"><option value="">Source Set…</option>{sets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="sec">Add Job</button></ActionForm>
            {js.filter((j: any) => j.production_id === p.id).map((j: any) => (<details key={j.id} className="card acc"><summary><b>{j.name}</b> <span className="mut">Job · {d(j.job_date)} · expires {d(j.expires_at)} · {j.ss_name ?? 'no Source Set'}</span></summary>
              <details className="sub"><summary className="mut">Edit Job</summary><form action={updateJob} className="row"><input type="hidden" name="id" value={j.id} /><input name="name" defaultValue={j.name} required />
                <input type="date" name="date" title="Job date" defaultValue={d(j.job_date)} /><input type="date" name="final" title="Final date" defaultValue={d(j.final_date)} /><input type="date" name="expires" title="Expiry" defaultValue={d(j.expires_at)} />
                <select name="sourceSet" defaultValue={j.source_set_id ?? ''}><option value="">Source Set…</option>{sets.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="sec">Save</button></form></details>
              <Del action={deleteJob} id={j.id} what="Job" />
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
                  <ReassignLink id={x.id} current={x.email} contacts={contacts.filter((c: any) => pcs.some((y: any) => y.production_id === p.id && y.contact_id === c.id))} /></details>))}</div></details>))}</div></details>))}</div></details>))}</>);
}
