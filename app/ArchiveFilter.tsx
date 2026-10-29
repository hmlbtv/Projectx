'use client';
import { useState } from 'react';

// Search and filters for an Archive list. Each item carries the text to search and the Production / year to filter on; its card is passed in ready-made.
export type ArchiveItem = { key: string | number; text: string; prod: string; year: string; node: React.ReactNode };
export default function ArchiveFilter({ items, tiles }: { items: ArchiveItem[]; tiles?: boolean }) {
  const [q, setQ] = useState(''), [prod, setProd] = useState(''), [year, setYear] = useState('');
  const prods = Array.from(new Set(items.map(i => i.prod))).filter(Boolean).sort(), years = Array.from(new Set(items.map(i => i.year))).filter(Boolean).sort().reverse();
  const k = q.trim().toLowerCase(), shown = items.filter(i => (!k || i.text.toLowerCase().includes(k)) && (!prod || i.prod === prod) && (!year || i.year === year));
  return (<div>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '0 0 10px' }}>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the archive…" aria-label="Search the archive" style={{ flex: '1 1 220px' }} />
      {prods.length > 1 && <select value={prod} onChange={e => setProd(e.target.value)} aria-label="Filter by Production"><option value="">All Productions</option>{prods.map(p => <option key={p}>{p}</option>)}</select>}
      {years.length > 1 && <select value={year} onChange={e => setYear(e.target.value)} aria-label="Filter by year"><option value="">All years</option>{years.map(y => <option key={y}>{y}</option>)}</select>}
      {(q || prod || year) && <button type="button" className="sec small" onClick={() => { setQ(''); setProd(''); setYear(''); }}>Clear</button>}
      <span className="mut" style={{ fontSize: '.85rem' }}>{shown.length} of {items.length}</span></div>
    {shown.length === 0 ? <div className="card mut">Nothing in the archive matches.</div> : <div className={tiles ? 'tiles' : undefined}>{shown.map(i => <div key={i.key} style={tiles ? { display: 'contents' } : undefined}>{i.node}</div>)}</div>}
  </div>);
}
