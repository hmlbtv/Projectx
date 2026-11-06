'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Every "← Back" style link returns you to the same place on the page you left.
// Leaving a page (any link click, or closing it) remembers how far down it was, in this browser tab. Arriving by a link that starts with "←" or "Back"
// (or is marked data-back) scrolls the page you land on back to that spot. The browser's own Back button is left to the browser.
// Saving or pressing a button on a page must not move it either: when a form is submitted and the action sends you back to the same page (even with a
// message added to the address), the page is put back to where it was.
const KEY = 'teleplanner.scroll', PEND = 'teleplanner.scroll.pending', SAME = 'teleplanner.scroll.same';
const NOTE = ['err', 'msg', 'copied', 'imported', 'tidied', 'of', 'saved']; // address parts that only carry a message
const page = (search: string) => { const p = new URLSearchParams(search); NOTE.forEach(k => p.delete(k)); p.sort(); return p.toString(); };
type Saved = Record<string, Record<string, number>>;
const read = (): Saved => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } };
function remember() {
  const m = read(); (m[location.pathname] ??= {})[location.search] = Math.round(window.scrollY);
  const keys = Object.keys(m); if (keys.length > 60) delete m[keys[0]];
  try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage unavailable */ }
}
const spot = (path: string, search: string): number | null => { const e = read()[path]; if (!e) return null; if (search in e) return e[search]; const list = Object.entries(e).filter(([k]) => !/[?&]id=/.test(k)).map(([, v]) => v); return list.length ? list[list.length - 1] : null; }; // a list page whose address was tidied on arrival: use the last list position (never an open item's)
const isBack = (a: HTMLAnchorElement) => a.hasAttribute('data-back') || /^\s*(←|‹|Back\b)/.test(a.textContent ?? '') || /^\s*Back\b/i.test(a.getAttribute('aria-label') ?? '');

export default function BackScroll() {
  const path = usePathname(), qs = useSearchParams().toString();
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null; if (!a || a.target === '_blank' || e.ctrlKey || e.metaKey) return;
      remember(); try { sessionStorage.removeItem(SAME); } catch { /* ignore */ } try { const u = new URL(a.href, location.href); if (u.origin === location.origin && isBack(a)) sessionStorage.setItem(PEND, u.pathname); else sessionStorage.removeItem(PEND); } catch { /* ignore */ }
    };
    const submit = () => { try { sessionStorage.setItem(SAME, JSON.stringify({ path: location.pathname, page: page(location.search), y: Math.round(window.scrollY), t: Date.now() })); } catch { /* ignore */ } };
    const hide = () => remember();
    document.addEventListener('click', click, true); document.addEventListener('submit', submit, true); window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('click', click, true); document.removeEventListener('submit', submit, true); window.removeEventListener('pagehide', hide); };
  }, []);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(SAME); if (raw) { sessionStorage.removeItem(SAME); const v = JSON.parse(raw); // the page you just used a form on, shown again
      if (Date.now() - v.t < 15000 && v.path === location.pathname && v.page === page(location.search) && v.y > 0) { const t = [0, 60, 200, 500].map(ms => setTimeout(() => { if (Math.abs(window.scrollY - v.y) > 4) window.scrollTo(0, v.y); }, ms)); return () => t.forEach(clearTimeout); } } } catch { /* ignore */ }
    let pend: string | null = null; try { pend = sessionStorage.getItem(PEND); sessionStorage.removeItem(PEND); } catch { /* ignore */ }
    if (!pend || pend !== location.pathname) return;
    const y = spot(location.pathname, location.search); if (y == null || y < 1) return;
    const t = [0, 60, 200, 500, 1000].map(ms => setTimeout(() => window.scrollTo(0, y), ms)); return () => t.forEach(clearTimeout);
  }, [path, qs]);
  return null;
}
