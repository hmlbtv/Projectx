import './globals.css';
import Link from 'next/link';
import { getMe, canManage, isAdmin } from '@/lib/session';
import { Logo } from './Logo';
import NavMenu from './NavMenu';
import '@fontsource-variable/space-grotesk';
import { signOut } from '@/lib/actions';
import ThemeToggle from './ThemeToggle';
import { headers } from 'next/headers';
import DevBar from './DevBar';
import DevStamp from './DevStamp';
import { devSite } from '@/lib/devmode';
import { devAccess } from '@/lib/devfeedback';

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1217' };
export const metadata = { title: 'TelePlanner', description: 'Monitor plans for live production' };

export default async function Root({ children }: { children: React.ReactNode }) {
  const me = await getMe(); const dev = me && devSite() ? await devAccess() : null; const nonce = (await headers()).get('x-nonce') ?? undefined; // the page's CSP only runs scripts that carry this
  return (<html lang="en" suppressHydrationWarning><head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('tp-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}" }} /></head><body>
    {me && <nav><Link href="/" className="brand" style={devSite() ? { position: 'relative' } : undefined}><Logo size={24} />{devSite() && <DevStamp />}</Link>
      <NavMenu links={[
        ...(isAdmin(me) ? [{ href: '/tenant', label: 'Sites' }] : []),
        ...(canManage(me) ? [{ href: '/team', label: 'Team' }, { label: 'Designers', children: [{ href: '/walls', label: 'Wall Designer' }, { href: '/layouts', label: 'MV Designer' }, { href: '/tiles', label: 'Tile Designer' }] }, { href: '/productions', label: 'Productions' }, { href: '/sources', label: 'Source Sets' }, { href: '/contacts', label: 'Contacts' }] : []),
        ...(me.role === 'onetime' ? [] : [{ href: '/plans', label: 'Monitor Plans' }, { href: '/archive', label: 'Archive' }]),
        { href: '/shared', label: 'Shared with me' },
        ...(dev?.on ? [{ href: '/my-comments', label: 'My comments' }] : []),
        ...(me.role === 'webappdev' ? [{ href: '/webappdev', label: 'Site admin' }, ...(devSite() ? [{ href: '/webappdev/markup', label: 'Markup' }] : [])] : []),
      ]}>
        <Link href="/account" className="who">{me.name} <span className="tag">{me.role}</span></Link>
        <ThemeToggle />
        <form action={signOut}><button className="sec">Sign out</button></form>
      </NavMenu></nav>}<main>{children}</main>{dev?.on && <DevBar owner={dev.owner} />}</body></html>);
}
