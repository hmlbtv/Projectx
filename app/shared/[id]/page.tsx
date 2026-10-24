import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one, rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { savePlanLink, addCommentLink } from '@/lib/guestActions';
import Plan from '@/app/plans/Plan';
export const dynamic = 'force-dynamic';

export default async function SharedWall({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe(); const { id } = await params;
  const link = await one(`select wl.id, wl.job_id, wl.room_wall_id, wl.access, j.name job, j.source_set_id, p.name prod, t.name tenant, t.id tenant_id, rw.name wall, r.id room_id, r.name room
    from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id join tenants t on t.id=b.tenant_id
    join room_walls rw on rw.id=wl.room_wall_id join rooms r on r.id=rw.room_id
    where wl.id=$1 and lower(wl.email)=lower($2) and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date)`, [Number(id) || 0, me.email]);
  if (!link) notFound();
  const layouts = await rows('select id,name,tiles from mv_layouts where tenant_id is null or tenant_id=$1 order by tenant_id nulls first,id', [link.tenant_id]);
  const src = link.source_set_id ? await one('select sources from source_sets where id=$1', [link.source_set_id]) : null;
  const edit = link.access === 'edit';
  // Editors see their own saved plans for this wall; view-only guests see the latest plan anyone saved for it.
  const saved = edit ? await rows('select name,data from monitor_plans where link_id=$1 and user_id=$2 order by id', [link.id, me.id])
    : await rows('select name,data from monitor_plans where job_id=$1 and jsonb_exists(data,$2) order by updated_at desc limit 1', [link.job_id, String(link.room_wall_id)]);
  const comments = await rows(`select c.body, u.name who from comments c left join users u on u.id=c.user_id where c.job_id=$1 and c.room_id=$2 order by c.id`, [link.job_id, link.room_id]);
  return (<><Link href="/shared">← Shared with me</Link><h1 style={{ marginTop: 8 }}>{link.wall}</h1>
    <p className="mut">{link.tenant} · {link.prod} / {link.job} · {link.room} <span className="tag">{edit ? 'You can edit this wall' : 'View only'}</span></p>
    {saved.length === 0 && !edit && <div className="card mut">No plan has been saved for this wall yet.</div>}
    <Plan walls={[{ id: link.room_wall_id, name: link.wall }]} layouts={layouts} sources={src?.sources ?? []} saved={saved} save={edit ? savePlanLink.bind(null, link.id) : undefined} readOnly={!edit} />
    <div className="card"><b>Comments</b>{comments.map((c: any, i: number) => <div key={i}><b>{c.who}</b>: {c.body}</div>)}
      {edit && <form action={addCommentLink} className="row"><input type="hidden" name="link" value={link.id} /><input name="body" placeholder="Add a comment" required style={{ flex: 1 }} /><button className="sec">Post</button></form>}</div></>);
}
