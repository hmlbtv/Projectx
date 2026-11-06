import DevVersion from './DevVersion';
import ConfirmDelete from './ConfirmDelete';
import './globals.css';
import Link from 'next/link';
import { getMe, myOrgs, pendingInvites, canManage, isAdmin } from '@/lib/session';
import OrgSwitch from './OrgSwitch';
import OrgBanner from './OrgBanner';
import { Logo } from './Logo';
import NavMenu from './NavMenu';
import '@fontsource-variable/space-grotesk';
import { signOut } from '@/lib/actions';
import ThemeToggle from './ThemeToggle';
import { headers } from 'next/headers';
import { devSite } from '@/lib/devmode';

export const viewport = { width: 'device-width', initialScale: 1, minimumScale: 1, themeColor: '#0f1217' };
export async function generateMetadata() {
  const me = await getMe(); const orgs = me ? await myOrgs(me.id) : [];
  const cur = me && orgs.length > 1 ? orgs.find(o => o.key === (me.membership_id ? String(me.membership_id) : 'home')) : null;
  return { title: cur ? `${cur.name} · TelePlanner` : 'TelePlanner', description: 'Monitor Plans for live production' };
}
const hueOf = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export default async function Root({ children }: { children: React.ReactNode }) {
  // Only present in builds that include the dev tools (never the production build: the condition is fixed at build time, so the imports are dropped).
  const devAccess = process.env.DEV_TOOLS_BUILD === '1' ? (await import('@/lib/devfeedback')).devAccess : null;
  const DevBar = process.env.DEV_TOOLS_BUILD === '1' ? (await import('./DevBar')).default : null;
  const DevStamp = process.env.DEV_TOOLS_BUILD === '1' ? (await import('./DevStamp')).default : null;
  const me = await getMe(); const orgs = me ? await myOrgs(me.id) : []; const pend = me && me.role !== 'webappdev' ? await pendingInvites(me.id) : []; const dev = me && devSite() && devAccess ? await devAccess() : null; const nonce = (await headers()).get('x-nonce') ?? undefined; // the page's CSP only runs scripts that carry this
  return (<html lang="en" suppressHydrationWarning><head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('tp-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}" }} /></head><body>
    {me && <nav><Link href="/" className="brand" style={devSite() ? { position: 'relative' } : undefined}><Logo size={24} />{devSite() && DevStamp && <DevStamp />}</Link>
      <NavMenu account={<><div style={{ color: '#9aa4b2', fontSize: 13, padding: '2px 14px' }}>Signed in as {me.name} <span className="tag">{me.role}</span></div><Link href="/account" className="nl">Account settings</Link><form action={signOut}><button className="signout">Sign out</button></form></>} links={[
        ...(isAdmin(me) ? [{ href: '/tenant', label: 'Sites' }] : []),
        ...(canManage(me) ? [{ href: '/team', label: 'Team' }, { href: '/productions', label: 'Productions' }, { href: '/sources', label: 'Source Sets' }, { href: '/contacts', label: 'Contacts' }] : []),
        ...(isAdmin(me) ? [{ label: 'Hardware', children: [{ href: '/hardware', label: 'MV Hardware' }, { href: '/hardware/usage', label: 'Usage report' }, { href: '/hardware/racks', label: 'Rack view' }] }] : []),
        ...(isAdmin(me) ? [{ label: 'Designers', children: [{ href: '/walls', label: 'Wall Designer' }, { href: '/layouts', label: 'MV Designer' }, { href: '/tiles', label: 'Tile Designer' }] }] : []),
        ...(me.role === 'onetime' ? [] : [{ href: '/plans', label: 'Monitor Plans' }, { href: '/archive', label: 'Archive' }]),
        { href: '/shared', label: 'Shared with me' },
        ...((orgs.length > 1 || pend.length) && me.role !== 'webappdev' ? [{ href: '/organizations', label: pend.length ? `Organizations (${pend.length})` : 'Organizations' }] : []),
        ...(dev?.on ? [{ href: '/my-comments', label: 'My comments' }] : []),
        ...(me.role === 'webappdev' ? [{ href: '/webappdev', label: 'Site admin' }, { href: '/mail', label: 'Email' }, ...(devSite() ? [{ href: '/webappdev/markup', label: 'Markup' }, { href: '/interest', label: 'Interest' }] : [])] : []),
      ]}>
        {orgs.length > 1 && <OrgSwitch orgs={orgs} current={me.membership_id ? String(me.membership_id) : 'home'} />}
        <Link href="/account" className="who">{me.name} <span className="tag">{me.role}</span></Link>
        <ThemeToggle />
        <form action={signOut}><button className="sec">Sign out</button></form>
      </NavMenu></nav>}{me && me.role !== 'webappdev' && orgs.length > 1 && (() => { const c = orgs.find(o => o.key === (me.membership_id ? String(me.membership_id) : 'home')); return c ? <OrgBanner name={c.name} role={c.role} hue={hueOf(c.name)} /> : null; })()}{DevStamp && <DevVersion />}<main>{children}</main><ConfirmDelete />{dev?.on && DevBar && <DevBar owner={dev.owner} />}</body></html>);
}
