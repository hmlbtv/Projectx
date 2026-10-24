import { one, rows } from '@/lib/db';
import { sha256 } from '@/lib/password';
import { getGuest } from '@/lib/guest';
import { savePlanGuest, addCommentGuest, guestSignOut } from '@/lib/guestActions';
import { Logo } from '@/app/Logo';
import Plan from '@/app/plans/Plan';
import GuestForm from './GuestForm';
export const dynamic = 'force-dynamic';

export default async function SharedWall({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await one(`select wl.id, wl.job_id, wl.room_wall_id, wl.access, j.name job, j.source_set_id, p.name prod, t.name tenant, t.id tenant_id, rw.name wall, r.id room_id, r.name room
    from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id join tenants t on t.id=b.tenant_id
    join room_walls rw on rw.id=wl.room_wall_id join rooms r on r.id=rw.room_id
    where wl.token_hash=$1 and not wl.revoked and (j.expires_at is null or j.expires_at >= current_date)`, [sha256(token)]);
  const head = <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 22px' }}><Logo size={30} /></div>;
  if (!link) return (<div className="auth">{head}<div className="card"><h1>Link not active</h1><p>This shared wall link has expired or been switched off. Ask the person who sent it for a new one.</p></div></div>);
  const g = await getGuest();
  if (!g || g.link_id !== link.id) return (<div className="auth">{head}<div className="card"><h1>Confirm your email</h1>
    <p className="mut">{link.tenant} shared a monitor wall with you. Enter the email address this link was sent to and we will send you a one-time code.</p><GuestForm token={token} /></div></div>);

  const layouts = await rows('select id,name,tiles from mv_layouts where tenant_id is null or tenant_id=$1 order by tenant_id nulls first,id', [link.tenant_id]);
  const src = link.source_set_id ? await one('select sources from source_sets where id=$1', [link.source_set_id]) : null;
  const edit = link.access === 'edit';
  // Editors see their own saved plans for this wall; view-only guests see the latest plan anyone saved for it.
  const saved = edit ? await rows('select name,data from monitor_plans where link_id=$1 order by id', [link.id])
    : await rows('select name,data from monitor_plans where job_id=$1 and jsonb_exists(data,$2) order by updated_at desc limit 1', [link.job_id, String(link.room_wall_id)]);
  const comments = await rows(`select c.body, coalesce(u.name, c.guest_email || ' (guest)') who from comments c left join users u on u.id=c.user_id where c.job_id=$1 and c.room_id=$2 order by c.id`, [link.job_id, link.room_id]);
  return (<div style={{ maxWidth: 900, margin: '0 auto' }}>{head}
    <div className="row" style={{ justifyContent: 'space-between' }}><div><h1 style={{ marginBottom: 4 }}>{link.wall}</h1><div className="mut">{link.tenant} · {link.prod} / {link.job} · {link.room}</div></div>
      <form action={guestSignOut}><button className="sec">Sign out</button></form></div>
    <p><span className="tag">{edit ? 'You can edit this wall' : 'View only'}</span></p>
    {saved.length === 0 && !edit && <div className="card mut">No plan has been saved for this wall yet.</div>}
    <Plan walls={[{ id: link.room_wall_id, name: link.wall }]} layouts={layouts} sources={src?.sources ?? []} saved={saved} save={edit ? savePlanGuest : undefined} readOnly={!edit} />
    <div className="card"><b>Comments</b>{comments.map((c: any, i: number) => <div key={i}><b>{c.who}</b>: {c.body}</div>)}
      {edit && <form action={addCommentGuest} className="row"><input name="body" placeholder="Add a comment" required style={{ flex: 1 }} /><button className="sec">Post</button></form>}</div></div>);
}
