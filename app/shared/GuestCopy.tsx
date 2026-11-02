'use client';
import { useRef, useState, useTransition } from 'react';
import { guestCopyPreview, guestCopyApply } from '@/lib/guestActions';
type C = { id: number; job: string; prod: string; wall: string; expired: boolean; when: string };
// Copy a saved plan from another of your shared Jobs in this organization, after checking it fits this wall.
export default function GuestCopy({ link, cands }: { link: number; cands: C[] }) {
  const ref = useRef<HTMLDialogElement>(null); const [pick, setPick] = useState<C | null>(null), [res, setRes] = useState<any>(null), [ok, setOk] = useState(false), [busy, go] = useTransition();
  const choose = (c: C) => { setPick(c); setRes(null); setOk(false); go(async () => setRes(await guestCopyPreview(link, c.id))); };
  const paste = () => go(async () => { const r = await guestCopyApply(link, pick!.id, ok); if (r.ok) { ref.current?.close(); location.reload(); } else setRes((x: any) => ({ ...x, error: r.error })); });
  const warns = (res?.findings ?? []).filter((f: any) => f.level === 'warn');
  return (<div style={{ margin: '0 0 12px' }}><button type="button" className="sec small" onClick={() => ref.current?.showModal()}>Copy a saved plan from another Job</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }} style={{ width: 'min(640px, 96vw)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Copy a saved plan</h2><button type="button" className="sec small" onClick={() => ref.current?.close()}>Close</button></div>
      <p className="mut">Only plans from other Jobs shared with you by this same organization are listed. The plan is checked against this wall before anything is changed, and replaces this wall's current plan.</p>
      {cands.length === 0 && <p className="mut">No other saved plans are shared with you.</p>}
      <div style={{ display: 'grid', gap: 6, maxHeight: '35vh', overflow: 'auto' }}>{cands.map(c => (<button key={c.id} type="button" className={pick?.id === c.id ? '' : 'sec'} style={{ textAlign: 'left', padding: 8 }} onClick={() => choose(c)}><b>{c.prod} / {c.job}</b>{c.expired ? ' · finished' : ''}<br /><span className="mut" style={{ fontSize: '.8rem' }}>{c.wall} · saved {c.when}</span></button>))}</div>
      {pick && <div style={{ marginTop: 12 }}>{busy && !res && <p className="mut">Checking…</p>}
        {res?.error && <p role="alert" style={{ color: 'var(--bad)' }}>{res.error}</p>}
        {res?.findings?.length > 0 && <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{res.findings.map((f: any, i: number) => <li key={i} style={{ color: f.level === 'warn' ? '#b45309' : undefined }}>{f.text}</li>)}</ul>}
        {res && !res.error && warns.length === 0 && <p>This plan fits this wall with no differences.</p>}
        {res && !res.error && warns.length > 0 && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I have reviewed these differences</label>}
        {res && !res.error && <div style={{ marginTop: 8 }}><button disabled={busy || (warns.length > 0 && !ok)} onClick={paste}>Paste into this plan</button></div>}</div>}
    </dialog></div>);
}
