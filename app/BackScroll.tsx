'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Every "← Back" style link returns you to the same place on the page you left.
// Leaving a page (any link click, or closing it) remembers how far down it was, in this browser tab. Arriving by a link that starts with "←" or "Back"
// (or is marked data-back) scrolls the page you land on back to that spot. The browser's own Back button is left to the browser.
const KEY = 'teleplanner.scroll', PEND = 'teleplanner.scroll.pending';
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
      remember(); try { const u = new URL(a.href, location.href); if (u.origin === location.origin && isBack(a)) sessionStorage.setItem(PEND, u.pathname); else sessionStorage.removeItem(PEND); } catch { /* ignore */ }
    };
    const hide = () => remember();
    document.addEventListener('click', click, true); window.addEventListener('pagehide', hide);
    return () => { document.removeEventListener('click', click, true); window.removeEventListener('pagehide', hide); };
  }, []);
  useEffect(() => {
    let pend: string | null = null; try { pend = sessionStorage.getItem(PEND); sessionStorage.removeItem(PEND); } catch { /* ignore */ }
    if (!pend || pend !== location.pathname) return;
    const y = spot(location.pathname, location.search); if (y == null || y < 1) return;
    const t = [0, 60, 200, 500, 1000].map(ms => setTimeout(() => window.scrollTo(0, y), ms)); return () => t.forEach(clearTimeout);
  }, [path, qs]);
  return null;
}
