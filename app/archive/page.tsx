import { rows } from '@/lib/db';
import { requireMe, isAdmin } from '@/lib/session';
import { deleteJob } from '@/lib/actions';
export const dynamic = 'force-dynamic';

// Expired Jobs are kept until an Admin deletes them. Users see only Jobs they were part of.
export default async function Archive() {
  const me = await requireMe();
  const js = await rows(`select j.*, p.name prod from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    where j.expires_at < current_date and (j.id in (select job_id from job_users where user_id=$1) or ($2 and b.tenant_id=$3)) order by j.expires_at desc`, [me.id, isAdmin(me) || me.role === 'manager', me.tenant_id ?? 0]);
  return (<><h1>Archive</h1><p className="mut">Expired Jobs. View and search past Monitor Plans; reuse in a new Job (same Monitor Wall only) is planned.</p>
    {js.length === 0 && <p className="mut">Nothing archived yet.</p>}
    {js.map((j: any) => (<div key={j.id} className="card"><b>{j.prod} / {j.name}</b> <span className="mut">expired {String(j.expires_at).slice(0, 10)}</span>
      {isAdmin(me) && <form action={deleteJob}><input type="hidden" name="id" value={j.id} /><button className="del">Delete permanently</button></form>}</div>))}</>);
}
