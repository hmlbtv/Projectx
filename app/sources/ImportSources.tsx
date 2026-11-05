'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Res = { created: number; updated: number; addedSources: number; skipped: number; notAdded: number } | { error: string };
// Import sources into ONE Source Set (the card it sits on) from an Excel (.xlsx) or CSV file; the sheet downloads with that set's sources already in it.
export default function ImportSources({ setId, setName }: { setId: number; setName: string }) {
  const ref = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), router = useRouter();
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Res | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); const file = input.current?.files?.[0]; if (!file) { setRes({ error: 'Choose a file first.' }); return; }
    setBusy(true); setRes(null); const fd = new FormData(); fd.append('file', file); fd.append('set', String(setId));
    try { const r = await fetch('/api/sources/import', { method: 'POST', body: fd }); const j = await r.json(); setRes(r.ok ? j : { error: j.error ?? 'Import failed.' }); if (r.ok) { router.refresh(); if (input.current) input.current.value = ''; } }
    catch { setRes({ error: 'Import failed. Check your connection and try again.' }); } finally { setBusy(false); }
  }
  return (<div className="addrow inline">
    <button type="button" className="sec small" onClick={() => { setRes(null); ref.current?.showModal(); }}>Import from Excel</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={go} className="stack">
        <h2 style={{ margin: 0 }}>Import into “{setName}”</h2>
        <p className="mut" style={{ margin: 0 }}>Upload an Excel (.xlsx) or CSV file with the columns <b>Category</b> and <b>Source</b>, one source per row. They are added to this Source Set only; sources it already has stay, and nothing is removed.</p>
        <a href={`/api/sources/template?set=${setId}`} download className="btn sec small" style={{ justifySelf: 'start' }}>⬇ Download the sheet for this set</a>
        <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        {res && 'error' in res && <div role="alert" style={{ color: 'var(--bad)' }}>{res.error}</div>}
        {res && !('error' in res) && (<div role="status" style={{ display: 'grid', gap: 4 }}>
          <b>{res.addedSources} source{res.addedSources === 1 ? '' : 's'} added.</b>
                    {res.skipped > 0 && <span style={{ color: 'var(--bad)' }}>{res.skipped} row{res.skipped === 1 ? '' : 's'} skipped (the Source was missing).</span>}
          {res.notAdded > 0 && <span style={{ color: 'var(--bad)' }}>{res.notAdded} source{res.notAdded === 1 ? '' : 's'} not added: this set is full (500).</span>}</div>)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Close</button><button disabled={busy}>{busy ? 'Importing…' : 'Import'}</button></div>
      </form></dialog></div>);
}
