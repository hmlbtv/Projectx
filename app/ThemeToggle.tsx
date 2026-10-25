'use client';
import { useEffect, useState } from 'react';
// System / Light / Dark. Saved in this browser only; the page script in the layout applies it before first paint.
const ORDER = ['system', 'light', 'dark'] as const; type M = typeof ORDER[number];
const LABEL: Record<M, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };
export default function ThemeToggle() {
  const [m, setM] = useState<M>('system');
  useEffect(() => { try { const v = localStorage.getItem('tp-theme'); if (v === 'light' || v === 'dark') { setM(v); document.documentElement.setAttribute('data-theme', v); } } catch {} }, []);
  const set = (n: M) => { setM(n); try { if (n === 'system') localStorage.removeItem('tp-theme'); else localStorage.setItem('tp-theme', n); } catch {}
    if (n === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', n); };
  const next = ORDER[(ORDER.indexOf(m) + 1) % 3];
  return (<button type="button" className="sec theme-btn" title={`Colour mode: ${LABEL[m]}. Click for ${LABEL[next]}.`} aria-label={`Colour mode: ${LABEL[m]}. Switch to ${LABEL[next]}`} onClick={() => set(next)}>
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {m === 'light' ? <><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>
        : m === 'dark' ? <path d="M16.5 11.5A7 7 0 0 1 8.5 3.5a7 7 0 1 0 8 8z" /> : <><circle cx="10" cy="10" r="7" /><path d="M10 3v14" /><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" /></>}
    </svg><span>{LABEL[m]}</span></button>);
}
