import { rows } from '@/lib/db';
import { requireMe, canManage } from '@/lib/session';
import { addComment } from '@/lib/actions';
import Plan from './Plan';
export const dynamic = 'force-dynamic';

export default async function Plans({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const me = await requireMe(); const { job } = await searchParams;
  const jobs = await rows(`select j.id,j.name,j.job_date,p.name prod from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    where j.expires_at >= current_date and (j.id in (select job_id from job_users where user_id=$1) or ($2 and b.tenant_id=$3)) order by j.job_date`, [me.id, canManage(me), me.tenant_id ?? 1]);
  const cur = jobs.find((j: any) => String(j.id) === job);
  if (!cur) return (<><h1>Monitor Plans</h1>{jobs.length === 0 && <p className="mut">No active Jobs assigned to you.</p>}
    {jobs.map((j: any) => <div key={j.id} className="card"><a href={`/plans?job=${j.id}`}>{j.prod} / {j.name}</a> <span className="mut">{String(j.job_date).slice(0, 10)}</span></div>)}</>);
  const j = (await rows('select j.*, ss.sources from jobs j left join source_sets ss on ss.id=j.source_set_id where j.id=$1', [cur.id]))[0];
  const rws = await rows(`select r.id room_id, r.name room, rw.id, rw.name from job_rooms jr join rooms r on r.id=jr.room_id join room_walls rw on rw.room_id=r.id where jr.job_id=$1 order by r.id, rw.id`, [cur.id]);
  const layouts = await rows('select id,name,tiles from mv_layouts where tenant_id=$1 or tenant_id is null order by tenant_id nulls first,id', [me.tenant_id ?? 1]);
  const saved = await rows('select name,data from monitor_plans where job_id=$1 and user_id=$2 order by id', [cur.id, me.id]);
  const comments = await rows('select c.*, u.name uname from comments c join users u on u.id=c.user_id where c.job_id=$1 order by c.id', [cur.id]);
  const roomIds = [...new Set(rws.map((r: any) => r.room_id))];
  return (<><a href="/plans">← Jobs</a><h1>{cur.prod} / {cur.name}</h1>
    {roomIds.map(rid => { const rs = rws.filter((r: any) => r.room_id === rid); return (<div key={rid}><h2>Room: {rs[0].room}</h2>
      <Plan jobId={cur.id} walls={rs.map((r: any) => ({ id: r.id, name: r.name }))} layouts={layouts} sources={j.sources ?? []} saved={saved} />
      <div className="card"><b>Comments</b>{comments.filter((c: any) => c.room_id === rid).map((c: any) => <div key={c.id}><b>{c.uname}</b>: {c.body}</div>)}
        <form action={addComment} className="row"><input type="hidden" name="job" value={cur.id} /><input type="hidden" name="room" value={rid} /><input name="body" placeholder="Add a comment" required style={{ flex: 1 }} /><button className="sec">Post</button></form></div></div>); })}</>);
}
