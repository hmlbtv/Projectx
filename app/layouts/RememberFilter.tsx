'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Remembers the Layout Designer's filter, sort and view in this browser. Opening the list with nothing chosen brings back the last choice;
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
  return null;
}
