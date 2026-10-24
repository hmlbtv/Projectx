'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function NavMenu({ links, children }: { links: { href: string; label: string }[]; children: React.ReactNode }) {
  const path = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const items = links.map(l => <Link key={l.href} href={l.href} className={'nl' + (path === l.href || path.startsWith(l.href + '/') ? ' on' : '')}>{l.label}</Link>);
  return (<>
    <div className="navlinks">{items}</div>
    <div className="navright">{children}</div>
    <button className="burger sec" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d={open ? 'M3 1l14 12M17 1L3 13' : 'M0 1h20M0 7h20M0 13h20'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg></button>
    {open && <div className="sheet">{items}<div className="sheetfoot">{children}</div></div>}
  </>);
}
