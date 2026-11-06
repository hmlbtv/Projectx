'use client';
import { useEffect, useRef } from 'react';

// A <details> that stays open (or closed) after the page redraws, even when it is rebuilt with new contents. The state is kept for this browser tab.
export default function KeepDetails({ id, summary, children, style, defaultOpen = false }: { id: string; summary: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; defaultOpen?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null); const K = 'teleplanner.open.' + id;
  useEffect(() => { try { const v = sessionStorage.getItem(K); if (ref.current && v) ref.current.open = v === '1'; } catch { /* ignore */ } }, [K]);
  return (<details ref={ref} style={style} open={defaultOpen || undefined} onToggle={e => { try { const o = (e.currentTarget as HTMLDetailsElement).open; if (defaultOpen) sessionStorage.setItem(K, o ? '1' : '0'); else if (o) sessionStorage.setItem(K, '1'); else sessionStorage.removeItem(K); } catch { /* ignore */ } }}>{summary}{children}</details>);
}
