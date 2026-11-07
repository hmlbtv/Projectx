import { redirect } from 'next/navigation';
import Link from 'next/link';
import { rows } from '@/lib/db';
import { requireMe, sessionLimits } from '@/lib/session';
import { emailOn } from '@/lib/mail';
import { demoInfo } from '@/lib/demoSite';
export const dynamic = 'force-dynamic';
export default async function SiteAdmin() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const demo = await demoInfo(), lim = await sessionLimits();
  const c = (await rows(`select (select count(*)::int from tenants where id<>1) n, (select count(*)::int from tenants where id<>1 and status<>'active') off,
    (select count(*)::int from users where tenant_id is not null and tenant_id<>1) u`))[0];
  return (<><h1>Site admin</h1>
    <div className="tiles" style={{ margin: '8px 0 16px' }}>
      {([['/webappdev/tenants', 'Tenants', `${c.n} workspace${c.n === 1 ? '' : 's'}${c.off ? ` · ${c.off} not active` : ''} · ${c.u} user${c.u === 1 ? '' : 's'}`], ['/webappdev/subscriptions', 'Subscriptions', 'plans, revenue and who is subscribed'],
        ['/webappdev/demo-site', 'Demo Site', demo ? `published ${new Date(demo.at).toISOString().slice(0, 10)}` : 'not published yet'],
        ['/webappdev/import-layouts', 'Import from manufacturer', 'add MV Layouts from a manufacturer'], ['/webappdev/tidy-layouts', 'Tidy Standard MV Layouts', 'neat 16:9 versions'],
        ['/webappdev/sign-in-length', 'Sign-in length', `${lim.idleHours ? lim.idleHours + ' h idle' : 'no idle sign-out'} · ${lim.maxDays} day maximum`], ['/webappdev/email', 'Email', emailOn() ? 'Resend is set up · test and log' : 'Not set up']] as const).map(([href, title, sub]) => (
        <div key={href} className="card tile"><Link href={href} className="tilelink"><b>{title}</b><span className="mut">{sub}</span></Link></div>))}</div>
  </>);
}
