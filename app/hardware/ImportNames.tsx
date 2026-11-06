'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Res = { applied: number; skipped: number; problems?: string[] } | { error: string; problems?: string[] };
// Export the Unit's names to Excel and import them back with the friendly names filled in.
export default function ImportNames({ id }: { id: number }) {
  const ref = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), router = useRouter();
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Res | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); const file = input.current?.files?.[0]; if (!file) { setRes({ error: 'Choose a file first.' }); return; }
    setBusy(true); setRes(null); const fd = new FormData(); fd.append('file', file);
    try { const r = await fetch(`/api/hardware/${id}/import`, { method: 'POST', body: fd }); const j = await r.json(); setRes(r.ok ? j : { error: j.error ?? 'Import failed.', problems: j.problems }); if (r.ok) { router.refresh(); if (input.current) input.current.value = ''; } }
    catch { setRes({ error: 'Import failed. Check your connection and try again.' }); } finally { setBusy(false); }
  }
  return (<div className="row" style={{ margin: 0 }}>
    <a href={`/api/hardware/${id}/export`} download className="btn sec small">⬇ Export to Excel</a>
    <button type="button" className="sec small" onClick={() => { setRes(null); ref.current?.showModal(); }}>Import names</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={go} className="stack">
        <h2 style={{ margin: 0 }}>Import names</h2>
        <p className="mut" style={{ margin: 0 }}>Export the sheet for this Unit, type the friendly names in the <b>Friendly name</b> column and upload it here. The sheet already has the Unit name and its destination and output names. An empty cell keeps the name as it is; type the word <b>Blank</b> in a cell to delete that name.</p>
        <a href={`/api/hardware/${id}/export`} download className="btn sec small" style={{ justifySelf: 'start' }}>⬇ Download the sheet</a>
        <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        {res && 'error' in res && <div role="alert" style={{ color: 'var(--bad)' }}>{res.error}</div>}
        {res?.problems && res.problems.length > 0 && <div role="alert" style={{ color: 'var(--bad)', fontSize: '.9rem' }}><b>{res.problems.length >= 40 ? 'First 40 problems:' : `${res.problems.length} problem${res.problems.length === 1 ? '' : 's'}:`}</b><ul style={{ margin: '4px 0 0', paddingLeft: 18, maxHeight: 200, overflowY: 'auto' }}>{res.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
        {res && !('error' in res) && <div role="status"><b>{res.applied} name{res.applied === 1 ? '' : 's'} applied.</b>{res.skipped > 0 && <span style={{ color: 'var(--bad)' }}> {res.skipped} row{res.skipped === 1 ? '' : 's'} skipped.</span>}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Close</button><button disabled={busy}>{busy ? 'Importing…' : 'Import'}</button></div>
      </form></dialog></div>);
}
