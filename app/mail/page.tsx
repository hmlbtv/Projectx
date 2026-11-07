import Link from 'next/link';
import { redirect } from 'next/navigation';
import { one } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { newMail } from '@/lib/mailLib';
export const dynamic = 'force-dynamic';
export default async function Mail() {
  const me = await requireMe(); if (me.role !== 'webappdev') redirect('/');
  const c = await one(`select (select count(*)::int from mail_messages) n, (select count(*)::int from mail_messages where status='sent') sent, (select count(*)::int from mail_groups) g`);
  return (<><h1>Email</h1>
    <p className="mut">Draft press releases, updates and other news. Test it to {'info@teleplanner.tv'}, sign it off, then send it to groups or individuals. Every email is kept with who it went to.</p>
    <form action={newMail}><button>New email</button></form>
    <div className="tiles" style={{ margin: '12px 0 16px' }}>
      {([['/mail/library', 'Library', `${c.n} email${c.n === 1 ? '' : 's'} · ${c.sent} sent`], ['/mail/groups', 'Groups', `${c.g} custom group${c.g === 1 ? '' : 's'} · plus roles and the interest list`], ['/webappdev/email', 'Email log', 'setup, test send and delivery log']] as const).map(([href, title, sub]) => (
        <div key={href} className="card tile"><Link href={href} className="tilelink"><b>{title}</b><span className="mut">{sub}</span></Link></div>))}</div></>);
}
