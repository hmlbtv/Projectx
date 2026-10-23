import './globals.css';
import Link from 'next/link';
import { getMe, canManage, isAdmin } from '@/lib/session';
import { signOut } from '@/lib/actions';

export const metadata = { title: 'Wall Maker', description: 'Monitor Plan configurator' };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (<html lang="en"><body>
    <nav><b>Wall Maker</b>
      {me && <>
        {isAdmin(me) && <Link href="/tenant">Admin / Tenant Sites</Link>}
        {canManage(me) && <><Link href="/walls">Wall Designer</Link><Link href="/layouts">MV Designer</Link><Link href="/productions">Productions</Link></>}
        <Link href="/plans">Monitor Plans</Link><Link href="/archive">Archive</Link>
        <span className="sp" /><Link href="/account">{me.name} · <span className="tag">{me.role}</span></Link>
        <form action={signOut}><button className="sec">Sign out</button></form></>}
    </nav><main>{children}</main></body></html>);
}
