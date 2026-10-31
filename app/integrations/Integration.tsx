'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Summary } from '../productions/ImportJobs';

type T = { key: string; label: string; required?: boolean; hint: string };
type Init = { name: string; url: string; auth_header: string; hasKey: boolean; records_path: string; mapping: Record<string, string> };
const FIXED = '__fixed__';
async function call(body: any) { const r = await fetch('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return r.ok ? j : { error: j.error ?? 'Failed' }; }

export default function Integration({ targets, initial }: { targets: T[]; initial: Init | null }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? ''), [url, setUrl] = useState(initial?.url ?? ''), [hdr, setHdr] = useState(initial?.auth_header ?? 'Authorization'), [key, setKey] = useState(''), [path, setPath] = useState(initial?.records_path ?? ''), [hasKey, setHasKey] = useState(!!initial?.hasKey);
  const [map, setMap] = useState<Record<string, string>>(initial?.mapping ?? {}), [fields, setFields] = useState<string[]>([]), [sample, setSample] = useState<Record<string, unknown>[]>([]), [total, setTotal] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null), [busy, setBusy] = useState(''), [prev, setPrev] = useState<any[] | null>(null), [res, setRes] = useState<any>(null);
  const save = async (quiet = false) => { setBusy('save'); const r = await call({ action: 'save', name, url, auth_header: hdr, auth_value: key, records_path: path, mapping: map }); setBusy(''); if (r.error) { setMsg({ t: 'err', s: r.error }); return false; } if (key) { setHasKey(true); setKey(''); } if (!quiet) setMsg({ t: 'ok', s: 'Saved.' }); router.refresh(); return true; };
  const test = async () => { if (!(await save(true))) return; setBusy('test'); setPrev(null); setRes(null); const r = await call({ action: 'test' }); setBusy(''); if (r.error) { setMsg({ t: 'err', s: r.error }); return; } setFields(r.fields); setSample(r.sample); setTotal(r.total); setMsg({ t: 'ok', s: `Connected: ${r.total} record${r.total === 1 ? '' : 's'} found.` }); };
  const preview = async () => { if (!(await save(true))) return; setBusy('prev'); setRes(null); const r = await call({ action: 'import', preview: true }); setBusy(''); if (r.error) { setMsg({ t: 'err', s: r.error }); return; } setPrev(r.rows); setMsg({ t: 'ok', s: `Preview of the first ${r.rows.length} of ${r.total}.` }); };
  const run = async () => { if (!confirm('Import these Jobs now?')) return; setBusy('imp'); const r = await call({ action: 'import' }); setBusy(''); setRes(r); if (!r.error) { setPrev(null); router.refresh(); } };
  const sel = (k: string) => (map[k]?.startsWith('=') ? FIXED : map[k] ?? '');
  const miss = targets.filter(t => t.required && !map[t.key]);
  const box = { display: 'grid', gap: 8 } as const;
  return (<div style={{ display: 'grid', gap: 14 }}>
    <section className="card" style={box}><b>1 · Connection</b>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name, e.g. Studio booking system" />
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://scheduler.example.com/api/bookings" inputMode="url" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><input value={hdr} onChange={e => setHdr(e.target.value)} placeholder="Key header, e.g. Authorization" style={{ flex: '1 1 160px', minWidth: 0 }} /><input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={hasKey ? 'Key saved. Type to replace' : 'Key or token, e.g. Bearer abc123'} autoComplete="off" style={{ flex: '2 1 200px', minWidth: 0 }} /></div>
      <input value={path} onChange={e => setPath(e.target.value)} placeholder="Where the list is in the answer (optional), e.g. data.events" />
      <div className="mut" style={{ fontSize: '.85rem' }}>The key is stored encrypted and is never shown again. Only HTTPS addresses on the public internet are allowed.</div>
      <div style={{ display: 'flex', gap: 8 }}><button className="sec" disabled={!!busy || !url} onClick={() => save()}>Save</button><button disabled={!!busy || !url} onClick={test}>{busy === 'test' ? 'Connecting…' : 'Save and fetch a sample'}</button></div></section>
    {msg && <div role={msg.t === 'err' ? 'alert' : 'status'} style={{ color: msg.t === 'err' ? 'var(--bad)' : undefined, fontWeight: 600 }}>{msg.t === 'ok' ? '✓ ' : ''}{msg.s}</div>}
    {total !== null && sample.length > 0 && <section className="card" style={box}><b>Sample from the scheduling system</b><div className="tablewrap"><table className="mlog"><thead><tr>{fields.slice(0, 8).map(f => <th key={f}>{f}</th>)}</tr></thead><tbody>{sample.map((r, i) => <tr key={i}>{fields.slice(0, 8).map(f => <td key={f}>{String(r[f] ?? '')}</td>)}</tr>)}</tbody></table></div>{fields.length > 8 && <span className="mut">+ {fields.length - 8} more fields available in the mapping below.</span>}</section>}
    <section className="card" style={box}><b>2 · Map the fields</b><span className="mut">For each TelePlanner field, choose which field of the scheduling system fills it. “Fixed value” puts the same text on every Job. {fields.length === 0 && 'Fetch a sample first to list the available fields.'}</span>
      {targets.map(t => (<div key={t.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 2fr', gap: 8, alignItems: 'center' }}>
        <div><b>{t.label}{t.required ? ' *' : ''}</b><div className="mut" style={{ fontSize: '.75rem' }}>{t.hint}</div></div>
        <div style={{ display: 'grid', gap: 4 }}><select value={sel(t.key)} onChange={e => setMap({ ...map, [t.key]: e.target.value === FIXED ? '=' : e.target.value })}>
          <option value="">Not mapped</option>{Array.from(new Set([...fields, ...(map[t.key] && !map[t.key].startsWith('=') && !fields.includes(map[t.key]) ? [map[t.key]] : [])])).map(f => <option key={f} value={f}>{f}</option>)}<option value={FIXED}>Fixed value…</option></select>
          {sel(t.key) === FIXED && <input value={map[t.key].slice(1)} onChange={e => setMap({ ...map, [t.key]: '=' + e.target.value })} placeholder="Text to use for every Job" />}</div></div>))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button disabled={!!busy || !url || miss.length > 0} onClick={preview}>{busy === 'prev' ? 'Loading…' : 'Save and preview'}</button>{miss.length > 0 && <span className="mut">Still to map: {miss.map(m => m.label).join(', ')}</span>}</div></section>
    {prev && <section className="card" style={box}><b>3 · Preview and import</b><div className="tablewrap"><table className="mlog"><thead><tr><th>Broadcaster</th><th>Production</th><th>Job</th><th>Date</th><th>Final</th><th>Expires</th><th>Source Set</th></tr></thead><tbody>{prev.map((r, i) => <tr key={i}><td>{String(r.broadcaster)}</td><td>{String(r.production)}</td><td>{String(r.job)}</td><td>{String(r.date ?? '')}</td><td>{String(r.final ?? '')}</td><td>{String(r.expires ?? '')}</td><td>{String(r.sourceSet ?? '')}</td></tr>)}</tbody></table></div>
      <div><button disabled={!!busy} onClick={run}>{busy === 'imp' ? 'Importing…' : 'Import all Jobs'}</button></div></section>}
    {res && <section className="card"><Summary res={res} /></section>}
  </div>);
}
