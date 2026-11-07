'use client';
import { useState } from 'react';

export type TRow = { id: number; name: string; status: string; plan: string; owner: string; members: number; walls: number; prods: number; jobs: number; plans: number; logins30: number; active30: number; signed: string; last: string };
const COLS: { k: keyof TRow; label: string }[] = [{ k: 'name', label: 'Tenant' }, { k: 'status', label: 'Status' }, { k: 'plan', label: 'Plan' }, { k: 'owner', label: 'Owner' }, { k: 'members', label: 'Members' }, { k: 'walls', label: 'Templates' }, { k: 'prods', label: 'Productions' }, { k: 'jobs', label: 'Jobs' }, { k: 'plans', label: 'Plans' }, { k: 'logins30', label: 'Sign-ins 30d' }, { k: 'active30', label: 'Active 30d' }, { k: 'signed', label: 'Signed up' }, { k: 'last', label: 'Last login' }];

// One compact line per tenant. Click a heading to sort (click again to reverse, a third time to clear).
export default function TenantTable({ rows }: { rows: TRow[] }) {
  const [by, setBy] = useState<{ k: keyof TRow; dir: 1 | -1 } | null>(null);
  const sorted = by ? [...rows].sort((a, b) => {
    const x = a[by.k], y = b[by.k];
    if (typeof x === 'string' && !x && y) return 1; if (typeof y === 'string' && !y && x) return -1; // blanks last
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })) * by.dir;
  }) : rows;
  const click = (k: keyof TRow) => setBy(by?.k === k ? (by.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 });
  return (<div className="dtab"><style>{`.dtab{width:100%;overflow-x:auto}.dtab table{width:100%;border-collapse:collapse;font-size:.86rem}.dtab th,.dtab td{padding:5px 8px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--line,#ddd)}`}</style>
    <table><thead><tr>{COLS.map(c => (<th key={c.k}><button type="button" onClick={() => click(c.k)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700 }} title={`Sort by ${c.label}`}>{c.label} <span style={{ opacity: by?.k === c.k ? 1 : .3 }}>{by?.k === c.k ? (by.dir === 1 ? '▲' : '▼') : '↕'}</span></button></th>))}</tr></thead>
      <tbody>{sorted.map(t => (<tr key={t.id}>{COLS.map(c => <td key={c.k}>{c.k === 'name' ? <b>{t.name}</b> : String(t[c.k] || '—')}</td>)}</tr>))}</tbody></table></div>);
}
