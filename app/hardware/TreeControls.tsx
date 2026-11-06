'use client';
import { useEffect, useState } from 'react';

// Controls for a collapsible tree: Expand all / Collapse all, the last open/closed state remembered per browser, and (optionally) Cards / List view.
// Branches start closed; ones marked data-k are reopened from what was open last time.
export default function TreeControls({ target, store, views }: { target: string; store: string; views?: boolean }) {
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const root = () => document.querySelector<HTMLElement>(target);
  const keyed = () => Array.from(root()?.querySelectorAll<HTMLDetailsElement>('details[data-k]') ?? []);
  useEffect(() => {
    const r = root(); if (!r) return;
    try { const open: string[] = JSON.parse(localStorage.getItem(store + '.open') ?? '[]'); keyed().forEach(d => { if (open.includes(d.dataset.k!)) d.open = true; }); } catch { /* nothing saved */ }
    let v: 'cards' | 'list' = 'cards'; try { if (views && localStorage.getItem(store + '.view') === 'list') v = 'list'; } catch { /* ignore */ }
    setView(v); r.dataset.view = v;
    const save = (e: Event) => { if (!(e.target as HTMLElement).dataset?.k) return; try { localStorage.setItem(store + '.open', JSON.stringify(keyed().filter(d => d.open).map(d => d.dataset.k))); } catch { /* ignore */ } };
    r.addEventListener('toggle', save, true); return () => r.removeEventListener('toggle', save, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const all = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>(`${target} details:not(.dots)`).forEach(d => { d.open = open; });
  const show = (v: 'cards' | 'list') => { setView(v); const r = root(); if (r) r.dataset.view = v; try { localStorage.setItem(store + '.view', v); } catch { /* ignore */ } };
  return (<span className="row" style={{ margin: 0, gap: 6 }}><button type="button" className="sec small" onClick={() => all(true)}>Expand all</button><button type="button" className="sec small" onClick={() => all(false)}>Collapse all</button>
    {views && <span className="row" style={{ margin: 0, gap: 0 }} role="group" aria-label="View"><button type="button" className={view === 'cards' ? 'small' : 'sec small'} aria-pressed={view === 'cards'} onClick={() => show('cards')}>Cards</button><button type="button" className={view === 'list' ? 'small' : 'sec small'} aria-pressed={view === 'list'} onClick={() => show('list')}>List</button></span>}</span>);
}
