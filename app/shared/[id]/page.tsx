import Link from 'next/link';
import { notFound } from 'next/navigation';
import { one, rows } from '@/lib/db';
import { myEmails } from '@/lib/emails';
import { requireMe } from '@/lib/session';
import { savePlanLink, addCommentLink } from '@/lib/guestActions';
import { wallComments, markSeen } from '@/lib/comments';
import WallComments from '@/app/plans/WallComments';
import Plan from '@/app/plans/Plan';
import { planWalls } from '@/lib/planWalls';
export const dynamic = 'force-dynamic';

export default async function SharedWall({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe(); const { id } = await params;
  const link = await one(`select wl.id, wl.job_id, wl.room_wall_id, wl.access, j.name job, j.source_set_id, p.name prod, t.name tenant, t.id tenant_id, rw.name wall, r.id room_id, r.name room
    from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id join tenants t on t.id=b.tenant_id
    join room_walls rw on rw.id=wl.room_wall_id join rooms r on r.id=rw.room_id
    where wl.id=$1 and lower(wl.email) in ${myEmails(2)} and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date) and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id where pp.id=j.production_id)='active'`, [Number(id) || 0, me.id]);
  if (!link) notFound();
  const layouts = await rows('select id,name,tiles from mv_layouts where tenant_id is null or tenant_id=$1 order by tenant_id nulls first,id', [link.tenant_id]);
  const src = link.source_set_id ? await one('select sources from source_sets where id=$1', [link.source_set_id]) : null;
  const edit = link.access === 'edit';
  const wtd = await one('select wt.data, wt.defaults from room_walls rw join wall_templates wt on wt.id=rw.wall_template_id where rw.id=$1', [link.room_wall_id]);
  const pw = await planWalls([{ id: link.room_wall_id, name: link.wall, data: wtd?.data, defaults: wtd?.defaults }], link.tenant_id);
  // Editors see their own saved plans for this wall; view-only guests see the latest plan anyone saved for it.
  const saved = edit ? await rows('select name,data from monitor_plans where link_id=$1 and user_id=$2 order by id', [link.id, me.id])
    : await rows('select name,data from monitor_plans where job_id=$1 and jsonb_exists(data,$2) order by updated_at desc limit 1', [link.job_id, String(link.room_wall_id)]);
  const comments = await wallComments(link.job_id, link.room_wall_id); await markSeen(me.id, link.job_id, [link.room_wall_id]);
  return (<><Link href="/shared">← Shared with me</Link><h1 style={{ marginTop: 8 }}>{link.wall}</h1>
    <p className="mut">{link.tenant} · {link.prod} / {link.job} · {link.room} <span className="tag">{edit ? 'You can edit this wall' : 'View only'}</span></p>
    {saved.length === 0 && !edit && <div className="card mut">No plan has been saved for this wall yet.</div>}
    <Plan walls={pw} layouts={layouts} sources={src?.sources ?? []} saved={saved} save={edit ? savePlanLink.bind(null, link.id) : undefined} readOnly={!edit} />
    <WallComments title={`${link.wall} · ${link.job}`} comments={comments as any} action={edit ? addCommentLink : undefined} hidden={{ link: link.id }} /></>);
}
