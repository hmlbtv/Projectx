import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { addComment, copyPlan } from '@/lib/actions';
import Plan from './Plan';
import CopyPlan from './CopyPlan';
import { planWalls } from '@/lib/planWalls';
import { savePlan } from '@/lib/actions';
export const dynamic = 'force-dynamic';

export default async function Plans({ searchParams }: { searchParams: Promise<{ job?: string; plan?: string; copied?: string }> }) {
  const me = await requireMe(); if (me.role === 'onetime') redirect('/shared'); const { job, plan: planQ, copied } = await searchParams;
  const jobs = await rows(`select j.id,j.name,j.job_date,p.name prod from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    where (j.expires_at is null or j.expires_at >= current_date) and (j.id in (select job_id from job_users where user_id=$1) or ($2 and b.tenant_id=$3)) order by j.job_date`, [me.id, canManage(me), me.tenant_id ?? 0]);
  const cur = jobs.find((j: any) => String(j.id) === job);
  if (!cur) return (<><h1>Monitor Plans</h1>{jobs.length === 0 && <p className="mut">No active Jobs assigned to you.</p>}
    {jobs.map((j: any) => <div key={j.id} className="card"><a href={`/plans?job=${j.id}`}>{j.prod} / {j.name}</a> <span className="mut">{String(j.job_date).slice(0, 10)}</span></div>)}</>);
  const j = (await rows('select j.*, ss.sources from jobs j left join source_sets ss on ss.id=j.source_set_id where j.id=$1', [cur.id]))[0];
  const rws = await rows(`select r.id room_id, r.name room, rw.id, rw.name, wt.data, wt.defaults from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join wall_templates wt on wt.id=rw.wall_template_id join rooms r on r.id=rw.room_id where jw.job_id=$1 order by r.id, rw.id`, [cur.id]);
  // MV Layouts come from the Job's own tenant (plus shared presets) - never from the viewer's tenant.
  const layouts = await rows('select l.id,l.name,l.tiles from mv_layouts l where l.tenant_id is null or l.tenant_id=(select b.tenant_id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1) order by l.tenant_id nulls first,l.id', [cur.id]);
  const saved = await rows('select name,data from monitor_plans where job_id=$1 and user_id=$2 order by id', [cur.id, me.id]);
  const comments = await rows(`select c.*, coalesce(u.name, c.guest_email || ' (guest)') uname from comments c left join users u on u.id=c.user_id where c.job_id=$1 order by c.id`, [cur.id]);
  const tenantId = (await rows('select b.tenant_id from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id where j.id=$1', [cur.id]))[0].tenant_id;
  const pw = await planWalls(rws.filter((r: any) => r.id).map((r: any) => ({ id: r.id, name: r.name, data: r.data, defaults: r.defaults })), tenantId);
  // Saved plans this person may copy into this Job: other Jobs (finished ones too) of the same workspace, and only plans for walls in a Location this Job also uses.
  // A person sees their own plans; Admin/Manager see all. Grouped by Production, then Job, in the dialog.
  const locIds = (await rows('select distinct r.location_id from job_walls jw join room_walls rw on rw.id=jw.room_wall_id join rooms r on r.id=rw.room_id where jw.job_id=$1', [cur.id])).map((x: any) => x.location_id);
  const cands = locIds.length === 0 ? [] : await rows(`select mp.id, mp.name, mp.updated_at, j.id job_id, j.name job, p.id prod_id, p.name prod, (j.expires_at < current_date) expired, coalesce(u.name, u.email) who, mp.user_id,
      (select string_agg(distinct st.name || ' › ' || l.name, ', ') from jsonb_object_keys(mp.data) k join room_walls rw on rw.id=(case when k ~ '^[0-9]+$' then k::int end) join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id join sites st on st.id=l.site_id where k ~ '^[0-9]+$' and l.id = any($5::int[])) place
    from monitor_plans mp join jobs j on j.id=mp.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id left join users u on u.id=mp.user_id
    where mp.job_id<>$1 and mp.link_id is null and b.tenant_id=$2 and ($3::boolean or (mp.user_id=$4 and j.id in (select job_id from job_users where user_id=$4)))
      and exists (select 1 from jsonb_object_keys(mp.data) k join room_walls rw on rw.id=(case when k ~ '^[0-9]+$' then k::int end) join rooms r on r.id=rw.room_id where k ~ '^[0-9]+$' and r.location_id = any($5::int[]))
    order by p.name, j.job_date desc nulls last, mp.updated_at desc limit 200`, [cur.id, tenantId, canManage(me), me.id, locIds]);
  const roomIds = [...new Set(rws.map((r: any) => r.room_id))];
  return (<><a href="/plans">← Jobs</a><h1>{cur.prod} / {cur.name}</h1>
    {copied === 'none' && <p role="alert" style={{ color: '#b45309' }}>Nothing was copied: that plan has no walls in common with this Job.</p>}
    {cands.length > 0 && <CopyPlan job={cur.id} action={copyPlan} plans={cands.map((c: any) => ({ id: c.id, name: c.name, prod: c.prod, prodId: c.prod_id, job: c.job, jobId: c.job_id, place: c.place ?? '', expired: !!c.expired, when: String(c.updated_at).slice(0, 10), who: c.user_id === me.id ? '' : c.who }))} />}
    {roomIds.map(rid => { const rs = rws.filter((r: any) => r.room_id === rid); return (<div key={rid}><h2>Room: {rs[0].room}</h2>
      {rs.filter((r: any) => r.id).length === 0 ? <div className="card mut">No Wall Template has been added to this Room yet. Check back once it has been set up.</div> : <Plan save={savePlan.bind(null, cur.id)} walls={pw.filter(w => rs.some((r: any) => r.id === w.id))} layouts={layouts} sources={j.sources ?? []} saved={saved} start={planQ} />}
      <div className="card"><b>Comments</b>{comments.filter((c: any) => c.room_id === rid).map((c: any) => <div key={c.id}><b>{c.uname}</b>: {c.body}</div>)}
        <form action={addComment} className="row"><input type="hidden" name="job" value={cur.id} /><input type="hidden" name="room" value={rid} /><input name="body" placeholder="Add a comment" required style={{ flex: 1 }} /><button className="sec">Post</button></form></div></div>); })}</>);
}
