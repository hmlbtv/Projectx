'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Res = { broadcasters: number; productions: number; jobs: number; skipped: number; duplicates: number; problems: string[] } | { error: string };
export function Summary({ res }: { res: Res }) {
  if ('error' in res) return <div role="alert" style={{ color: 'var(--bad)' }}>{res.error}</div>;
  return (<div role="status" style={{ display: 'grid', gap: 4 }}><b>{res.jobs} Job{res.jobs === 1 ? '' : 's'} imported.</b>
    <span className="mut">{res.broadcasters} new Broadcaster{res.broadcasters === 1 ? '' : 's'}, {res.productions} new Production{res.productions === 1 ? '' : 's'}. {res.duplicates} already existed.</span>
    {res.skipped > 0 && <span style={{ color: 'var(--bad)' }}>{res.skipped} row{res.skipped === 1 ? '' : 's'} skipped.</span>}
    {res.problems.map((p, i) => <span key={i} style={{ color: 'var(--bad)', fontSize: '.85rem' }}>{p}</span>)}</div>);
}
// Import Broadcasters, Productions and Jobs from an Excel workbook (one tab per Broadcaster), with a template to fill in.
export default function ImportJobs() {
  const ref = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), router = useRouter();
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Res | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); const file = input.current?.files?.[0]; if (!file) { setRes({ error: 'Choose a file first.' }); return; }
    setBusy(true); setRes(null); const fd = new FormData(); fd.append('file', file);
    try { const r = await fetch('/api/productions/import', { method: 'POST', body: fd }); const j = await r.json(); setRes(r.ok ? j : { error: j.error ?? 'Import failed.' }); if (r.ok) { router.refresh(); if (input.current) input.current.value = ''; } }
    catch { setRes({ error: 'Import failed. Check your connection and try again.' }); } finally { setBusy(false); }
  }
  return (<>
    <button type="button" className="sec" onClick={() => { setRes(null); ref.current?.showModal(); }}>Import from Excel</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={go} className="stack">
        <h2 style={{ margin: 0 }}>Import Productions and Jobs</h2>
        <p className="mut" style={{ margin: 0 }}>The template has a tab for each Broadcaster, a drop-down of its Productions, and a row per Job (name, dates, Source Set). New Broadcasters and Productions are created; Jobs that already exist are skipped.</p>
        <a href="/api/productions/template" download className="btn sec small" style={{ justifySelf: 'start' }}>⬇ Download the template</a>
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        {res && <Summary res={res} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Close</button><button disabled={busy}>{busy ? 'Importing…' : 'Import'}</button></div>
      </form></dialog></>);
}
