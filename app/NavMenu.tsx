'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type L = { href: string; label: string };
type Item = L | { label: string; children: L[] };
const isGroup = (i: Item): i is { label: string; children: L[] } => 'children' in i;

// A group (like Designers) is one button on the bar that opens a list of its links.
function Group({ label, children, path }: { label: string; children: L[]; path: string }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  const active = children.some(c => path === c.href || path.startsWith(c.href + '/'));
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const out = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('touchstart', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('touchstart', out); document.removeEventListener('keydown', esc); };
  }, []);
  return (<div className="ngroup" ref={ref}>
    <button type="button" className={'nl ngbtn' + (active ? ' on' : '')} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>{label} <span className="caret" aria-hidden="true" /></button>
    {open && <div className="ndrop" role="menu">{children.map(c => <Link key={c.href} href={c.href} role="menuitem" onClick={() => setOpen(false)} className={'nl' + (path === c.href || path.startsWith(c.href + '/') ? ' on' : '')}>{c.label}</Link>)}</div>}
  </div>);
}

export default function NavMenu({ links, children }: { links: Item[]; children: React.ReactNode }) {
  const path = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const link = (l: L) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={'nl' + (path === l.href || path.startsWith(l.href + '/') ? ' on' : '')}>{l.label}</Link>;
  return (<>
    <div className="navlinks">{links.map(i => isGroup(i) ? <Group key={i.label} label={i.label} path={path}>{i.children}</Group> : link(i))}</div>
    <div className="navright">{children}</div>
    <button className="burger sec" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
      <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><path d={open ? 'M3 1l14 12M17 1L3 13' : 'M0 1h20M0 7h20M0 13h20'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg></button>
    {open && <div className="sheet">{links.map(i => isGroup(i)
      ? <div key={i.label} className="sgroup"><div className="sgtitle">{i.label}</div>{i.children.map(link)}</div> : link(i))}<div className="sheetfoot">{children}</div></div>}
  </>);
}
