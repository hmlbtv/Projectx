import InviteUser from './InviteUser';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { redirect } from 'next/navigation';
import { addBroadcaster, addProduction, addJob, addSourceSet, assignRoom } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Productions() {
  const me = await requireMe(); if (!canManage(me)) redirect('/');
  const t = me.tenant_id ?? 1;
  const bs = await rows('select * from broadcasters where tenant_id=$1 order by id', [t]);
  const ps = await rows('select p.* from productions p join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 order by p.id', [t]);
  const js = await rows('select j.*, ss.name ss_name from jobs j left join source_sets ss on ss.id=j.source_set_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where b.tenant_id=$1 and (j.expires_at is null or j.expires_at >= current_date) order by j.job_date', [t]);
  const sets = await rows('select * from source_sets where tenant_id=$1', [t]);
  const rooms = await rows('select r.id, r.name, l.name loc, s.name site from rooms r join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [t]);
  const jr = await rows('select jr.job_id, r.name from job_rooms jr join rooms r on r.id=jr.room_id join locations l on l.id=r.location_id join sites s on s.id=l.site_id where s.tenant_id=$1', [t]);
  const ju = await rows('select ju.job_id, u.email from job_users ju join users u on u.id=ju.user_id where u.tenant_id=$1 or u.tenant_id is null', [t]);
  return (<><h1>Productions</h1><p className="mut">Broadcaster → Production → Job. Jobs expire on the date set, or 5 days after the final date, and are then archived.</p>
    <div className="card"><b>Source Sets</b>{sets.map((s: any) => <div key={s.id}>{s.name} <span className="mut">({s.sources.length} sources)</span></div>)}
      <form action={addSourceSet} className="row"><input name="name" placeholder="Source Set name" required /><textarea name="sources" placeholder="One source per line" rows={2} /><button className="sec">Add Source Set</button></form></div>
    <form action={addBroadcaster} className="row"><input name="name" placeholder="New Broadcaster" required /><button>Add Broadcaster</button></form>
    {bs.map((b: any) => (<div key={b.id} className="card"><b>Broadcaster: {b.name}</b>
      <div className="tree"><form action={addProduction} className="row"><input type="hidden" name="parent" value={b.id} /><input name="name" placeholder="New Production" required /><button className="sec">Add Production</button></form>
        {ps.filter((p: any) => p.broadcaster_id === b.id).map((p: any) => (<div key={p.id}><b>Production: {p.name}</b>
          <div className="tree"><form action={addJob} className="row"><input type="hidden" name="parent" value={p.id} /><input name="name" placeholder="Job name" required />
            <input type="date" name="date" title="Job date" /><input type="date" name="final" title="Final date" /><input type="date" name="expires" title="Expiry (optional)" />
            <select name="sourceSet"><option value="">Source Set…</option>{sets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="sec">Add Job</button></form>
            {js.filter((j: any) => j.production_id === p.id).map((j: any) => (<div key={j.id} className="card"><b>Job: {j.name}</b> <span className="mut">date {String(j.job_date).slice(0, 10)} · expires {String(j.expires_at).slice(0, 10)} · {j.ss_name ?? 'no Source Set'}</span>
              <div>Rooms: {jr.filter((x: any) => x.job_id === j.id).map((x: any) => <span key={x.name} className="tag">{x.name}</span>)}</div>
              <form action={assignRoom} className="row"><input type="hidden" name="job" value={j.id} /><select name="room">{rooms.map((r: any) => <option key={r.id} value={r.id}>{r.site} / {r.loc} / {r.name}</option>)}</select><button className="sec">Add Room</button></form>
              <div>Users: {ju.filter((x: any) => x.job_id === j.id).map((x: any) => <span key={x.email} className="tag">{x.email}</span>)}</div>
              <InviteUser job={j.id} /></div>))}</div></div>))}</div></div>))}</>);
}
