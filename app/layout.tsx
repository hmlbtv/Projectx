import './globals.css';
import Link from 'next/link';
import { getMe, canManage, isAdmin } from '@/lib/session';
import { Logo } from './Logo';
import NavMenu from './NavMenu';
import '@fontsource-variable/space-grotesk';
import { signOut } from '@/lib/actions';

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1217' };
export const metadata = { title: 'Gallery Planner', description: 'Monitor plans for live production' };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (<html lang="en"><body>
    {me && <nav><Link href="/" className="brand"><Logo size={24} /></Link>
      <NavMenu links={[
        ...(isAdmin(me) ? [{ href: '/tenant', label: 'Sites' }] : []),
        ...(canManage(me) ? [{ href: '/team', label: 'Team' }, { href: '/walls', label: 'Wall Designer' }, { href: '/layouts', label: 'MV Designer' }, { href: '/productions', label: 'Productions' }, { href: '/contacts', label: 'Contacts' }] : []),
        { href: '/plans', label: 'Monitor Plans' }, { href: '/archive', label: 'Archive' },
        ...(me.role === 'webappdev' ? [{ href: '/webappdev', label: 'Site admin' }] : []),
      ]}>
        <Link href="/account" className="who">{me.name} <span className="tag">{me.role}</span></Link>
        <form action={signOut}><button className="sec">Sign out</button></form>
      </NavMenu></nav>}<main>{children}</main></body></html>);
}
