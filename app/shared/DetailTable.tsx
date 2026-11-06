'use client';
import Link from 'next/link';
import { useState } from 'react';

export type DRow = { id: number; wall: string; path: string; room: string; org: string; date: string; access: string; unread: number };
const COLS: { k: keyof DRow; label: string }[] = [{ k: 'wall', label: 'Wall' }, { k: 'path', label: 'Broadcaster › Production › Job' }, { k: 'room', label: 'Room' }, { k: 'org', label: 'Organization' }, { k: 'date', label: 'Date' }, { k: 'access', label: 'Access' }, { k: 'unread', label: 'Comments' }];

// One compact line per shared wall. Click a heading to sort by it (click again to reverse), like a spreadsheet table.
export default function DetailTable({ rows }: { rows: DRow[] }) {
  const [by, setBy] = useState<{ k: keyof DRow; dir: 1 | -1 } | null>(null);
  const sorted = by ? [...rows].sort((a, b) => {
    const x = a[by.k], y = b[by.k];
    if (by.k === 'date') { if (!x && y) return 1; if (x && !y) return -1; } // undated always last
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' })) * by.dir;
  }) : rows;
  const click = (k: keyof DRow) => setBy(by?.k === k ? (by.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 });
  return (<div className="dtab"><style>{`.dtab{width:100%;overflow-x:auto}.dtab table{width:100%;table-layout:auto;border-collapse:collapse;font-size:.86rem}.dtab th,.dtab td{padding:5px 8px;vertical-align:middle;overflow-wrap:anywhere;line-height:1.25}.dtab th{white-space:nowrap}.dtab td:nth-child(5),.dtab td:nth-child(6),.dtab td:nth-child(7){white-space:nowrap}.dtab .sub{display:none}@media (max-width:820px){.dtab th:nth-child(3),.dtab td:nth-child(3),.dtab th:nth-child(4),.dtab td:nth-child(4){display:none}.dtab .sub{display:block;font-size:.78rem;opacity:.7}}@media (max-width:520px){.dtab th:nth-child(7),.dtab td:nth-child(7){display:none}}`}</style><table><thead><tr>{COLS.map(c => (<th key={c.k} aria-sort={by?.k === c.k ? (by.dir === 1 ? 'ascending' : 'descending') : 'none'}>
    <button type="button" onClick={() => click(c.k)} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }} title={`Sort by ${c.label}`}>{c.label}{' '}<span style={{ opacity: by?.k === c.k ? 1 : .3 }}>{by?.k === c.k ? (by.dir === 1 ? '▲' : '▼') : '↕'}</span></button></th>))}<th></th></tr></thead>
    <tbody>{sorted.map(i => (<tr key={i.id} style={i.unread > 0 ? { boxShadow: 'inset 4px 0 0 #e5352b' } : undefined}><td><b>{i.wall}</b></td><td>{i.path}<span className="sub">{i.room} · {i.org}</span></td><td>{i.room}</td><td>{i.org}</td><td>{i.date}</td><td><span className="tag">{i.access}</span></td><td>{i.unread > 0 ? <span className="tag" style={{ background: '#e5352b', color: '#fff' }}>{i.unread} new</span> : ''}</td><td><Link href={`/shared/${i.id}`}>Open</Link></td></tr>))}</tbody></table></div>);
}
