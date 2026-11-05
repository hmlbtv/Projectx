'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Remembers the MV Designer's filter, sort and view in this browser. Opening the list with nothing chosen brings back the last choice;
// choosing something saves it. (The search words are not remembered.)
export default function RememberFilter() {
  const router = useRouter();
  useEffect(() => {
    const KEY = 'teleplanner.layouts', p = new URLSearchParams(window.location.search);
    try {
      if (['f', 'sort', 'view'].some(k => p.has(k))) {
        const prev = JSON.parse(localStorage.getItem(KEY) ?? '{}'); const next = { f: p.get('f') ?? prev.f, sort: p.get('sort') ?? prev.sort, view: p.get('view') ?? prev.view };
        localStorage.setItem(KEY, JSON.stringify(next));
      } else if (!p.has('id') && !p.has('q')) {
        const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (!s) return;
        const n = new URLSearchParams(); for (const k of ['f', 'sort', 'view'] as const) if (s[k]) n.set(k, String(s[k]));
        if (n.toString()) router.replace('/layouts?' + n.toString());
      }
    } catch { /* storage unavailable: nothing is remembered */ }
  }, [router]);
  // Remember how far down the list was when a layout is opened, and go back to the same place when the list returns.
  useEffect(() => {
    const SK = 'teleplanner.layouts.scroll', p = new URLSearchParams(window.location.search);
    const click = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest?.('a[href*="/layouts?id="]'); if (a) { try { sessionStorage.setItem(SK, String(window.scrollY)); } catch { /* ignore */ } } };
    document.addEventListener('click', click, true);
    if (!p.has('id')) { try { const y = Number(sessionStorage.getItem(SK)); if (y > 0) { sessionStorage.removeItem(SK); [0, 80, 250, 600].forEach(t => setTimeout(() => window.scrollTo(0, y), t)); } } catch { /* ignore */ } }
    return () => document.removeEventListener('click', click, true);
  }, []);
  return null;
}
