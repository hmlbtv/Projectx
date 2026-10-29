import Link from 'next/link';
import { rows } from '@/lib/db';
import { myEmails } from '@/lib/emails';
import { requireMe } from '@/lib/session';
import { unreadByWall } from '@/lib/comments';
export const dynamic = 'force-dynamic';

// Every active invitation sent to this account's email, from any tenant, in one place.
export default async function Shared() {
  const me = await requireMe();
  const items = await rows(`select wl.id, wl.job_id, wl.room_wall_id, wl.access, (j.expires_at < current_date) expired, t.name tenant, b.name broadcaster, p.name prod, j.name job, r.name room, rw.name wall, j.expires_at
    from wall_links wl join jobs j on j.id=wl.job_id join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id join tenants t on t.id=b.tenant_id
    join room_walls rw on rw.id=wl.room_wall_id join rooms r on r.id=rw.room_id
    where lower(wl.email) in ${myEmails(1)} and not wl.revoked and (select tn.status from tenants tn join broadcasters bb on bb.tenant_id=tn.id join productions pp on pp.broadcaster_id=bb.id where pp.id=j.production_id)='active' order by t.name, j.job_date desc nulls last, wl.id`, [me.id]);
  const unread = await unreadByWall(me.id);
  const render = (list: any[], archived: boolean) => [...new Set(list.map((x: any) => x.tenant))].map(g => (<div key={g}><h2>{g}</h2>{list.filter((i: any) => i.tenant === g).map((i: any) => (
      <div key={i.id} className="card" style={unread[`${i.job_id}:${i.room_wall_id}`] > 0 ? { borderLeft: '6px solid #e5352b', boxShadow: '0 0 0 2px rgba(229,53,43,.35)' } : undefined}><div className="row" style={{ justifyContent: 'space-between' }}><div><b>{i.wall}</b> <div className="mut" style={{ fontSize: '.85rem' }}>{i.broadcaster} \ {i.prod} \ {i.job} · {i.room}</div></div>
        <div>{unread[`${i.job_id}:${i.room_wall_id}`] > 0 && <Link href={`/shared/${i.id}`} style={{ textDecoration: 'none', marginRight: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e5352b', color: '#fff', fontWeight: 800, fontSize: '.9rem', padding: '7px 13px', borderRadius: 999, boxShadow: '0 0 0 4px rgba(229,53,43,.25)' }}>🔔 {unread[`${i.job_id}:${i.room_wall_id}`]} new</span></Link>}<span className="tag">{archived ? 'Expired' : i.access === 'edit' ? 'Can edit' : 'View only'}</span> <Link href={`/shared/${i.id}`}><button className="sec" type="button">Open</button></Link></div></div></div>))}</div>));
  const live = items.filter((x: any) => !x.expired), old = items.filter((x: any) => x.expired);
  return (<><h1>Shared with me</h1><p className="mut">Monitor walls other teams have shared with you (sent to {me.email} or any other email you have added in Account). You can edit or only view each one, depending on the invitation.</p>
    {items.length === 0 && <div className="card mut">Nothing is shared with you right now. When someone invites you to a wall it will appear here.</div>}
    {render(live, false)}
    {old.length > 0 && <details><summary style={{ cursor: 'pointer', fontSize: '1.4rem', fontWeight: 700, margin: '28px 0 10px' }}>Archive ({old.length})</summary><><p className="mut">Expired Jobs, kept for reference (view only).</p>{render(old, true)}</></details>}</>);
}
