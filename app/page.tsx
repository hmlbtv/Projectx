import Link from 'next/link';
import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe, canManage, isAdmin } from '@/lib/session';
import { loadDemoData } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const me = await requireMe();
  if (me.role === 'onetime') redirect('/shared');
  const manage = canManage(me);
  // Current = not yet expired. Managers see every Job in their tenant; other users only Jobs they are assigned to.
  const jobs = await rows(`select j.id,j.name,j.job_date,j.expires_at,p.name production,b.name broadcaster
    from jobs j join productions p on p.id=j.production_id join broadcasters b on b.id=p.broadcaster_id
    where b.tenant_id=$1 and (j.expires_at is null or j.expires_at >= current_date)
      and ($2::boolean or exists(select 1 from job_users ju where ju.job_id=j.id and ju.user_id=$3))
    order by j.job_date nulls last, j.id desc limit 12`, [me.tenant_id ?? 0, manage, me.id]);
  const d = (x: any) => x ? new Date(x).toISOString().slice(0, 10) : '';
  return (<><h1>Welcome, {me.name.split(' ')[0]}</h1>
    <p className="mut">Plan your Monitor Wall for your next Production.</p>
    <div className="card"><h2 style={{ marginTop: 0 }}>Current Jobs</h2>
      {jobs.length === 0 ? <p className="mut">No current Jobs yet.{manage ? <> <Link href="/productions">Create one in Productions</Link>.</> : ' You will see Jobs here once you are added to one.'}</p> :
        jobs.map((j: any) => (<Link key={j.id} href={`/plans?job=${j.id}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}><strong>{j.name}</strong> <span className="mut">→ Monitor Plan</span><div className="mut">{j.broadcaster} · {j.production}{j.job_date ? ' · ' + d(j.job_date) : ''}{j.expires_at ? ' · until ' + d(j.expires_at) : ''}</div></Link>))}
      {jobs.length === 0 && isAdmin(me) && me.tenant_id && <form action={loadDemoData}><button className="sec">Load sample Jobs and Monitor Plans</button></form>}
      <Link href={manage ? '/productions' : '/plans'}>{manage ? 'Open Productions' : 'Open Monitor Plans'}</Link></div></>);
}
