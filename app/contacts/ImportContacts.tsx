'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Res = { added: number; duplicates: number; invalid: number; problems: { row: number; why: string }[]; notAdded: number } | { error: string };
// Import contacts from an Excel (.xlsx) or CSV file, with a blank template to fill in.
export default function ImportContacts() {
  const ref = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null), router = useRouter();
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Res | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); const file = input.current?.files?.[0]; if (!file) { setRes({ error: 'Choose a file first.' }); return; }
    setBusy(true); setRes(null); const fd = new FormData(); fd.append('file', file);
    try { const r = await fetch('/api/contacts/import', { method: 'POST', body: fd }); const j = await r.json(); setRes(r.ok ? j : { error: j.error ?? 'Import failed.' }); if (r.ok) { router.refresh(); if (input.current) input.current.value = ''; } }
    catch { setRes({ error: 'Import failed. Check your connection and try again.' }); } finally { setBusy(false); }
  }
  return (<div className="addrow inline">
    <button type="button" className="sec small" onClick={() => { setRes(null); ref.current?.showModal(); }}>Import from Excel</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      <form onSubmit={go} className="stack">
        <h2 style={{ margin: 0 }}>Import contacts</h2>
        <p className="mut" style={{ margin: 0 }}>Upload an Excel (.xlsx) or CSV file with the columns <b>Name</b>, <b>Email</b>, and <b>Company</b> (Company is optional). People already in your list are skipped.</p>
        <a href="/api/contacts/template" download className="btn sec small" style={{ justifySelf: 'start' }}>⬇ Download the template</a>
        <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        {res && 'error' in res && <div role="alert" style={{ color: 'var(--bad)' }}>{res.error}</div>}
        {res && !('error' in res) && (<div role="status" style={{ display: 'grid', gap: 4 }}>
          <b>{res.added} contact{res.added === 1 ? '' : 's'} added.</b>
          {res.duplicates > 0 && <span className="mut">{res.duplicates} already in your list (skipped).</span>}
          {res.notAdded > 0 && <span style={{ color: 'var(--bad)' }}>{res.notAdded} not added: the contact list is full (2000).</span>}
          {res.invalid > 0 && <span style={{ color: 'var(--bad)' }}>{res.invalid} row{res.invalid === 1 ? '' : 's'} skipped: {res.problems.map(p => `row ${p.row} (${p.why})`).join(', ')}{res.invalid > res.problems.length ? '…' : ''}</span>}
</div>)}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Close</button><button disabled={busy}>{busy ? 'Importing…' : 'Import'}</button></div>
      </form></dialog></div>);
}
