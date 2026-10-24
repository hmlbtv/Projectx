import { redirect } from 'next/navigation';
import { rows } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { setTenantPlan } from '@/lib/actions';
export const dynamic = 'force-dynamic';
export default async function SiteAdmin() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const ts = await rows(`select t.id,t.name,t.plan,t.max_wall_templates m,
    (select count(*)::int from users u where u.tenant_id=t.id) members,
    (select count(*)::int from wall_templates w where w.tenant_id=t.id) walls,
    (select min(u.email) from users u where u.tenant_id=t.id and u.role='master_admin') owner from tenants t order by t.id desc`);
  return (<><h1>Site admin · Tenants</h1><p className="mut">Set each tenant's plan name and how many Wall Templates they may create. New sign-ups start on the demo plan with 1.</p>
    <table><thead><tr><th>Tenant</th><th>Owner</th><th>Members</th><th>Walls</th><th>Plan</th><th>Max walls</th><th></th></tr></thead><tbody>
      {ts.map((t: any) => (<tr key={t.id}><td>{t.name}</td><td>{t.owner}</td><td>{t.members}</td><td>{t.walls}</td>
        <td colSpan={3}><form action={setTenantPlan} className="row" style={{ margin: 0 }}><input type="hidden" name="id" value={t.id} />
          <input name="plan" defaultValue={t.plan} style={{ width: 110 }} /><input name="max" type="number" min="0" defaultValue={t.m} style={{ width: 90 }} /><button className="sec">Save</button></form></td></tr>))}</tbody></table></>);
}
