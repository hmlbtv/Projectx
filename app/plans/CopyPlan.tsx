'use client';
import { useRef, useState, useTransition } from 'react';
import { copyPlanPreview } from '@/lib/actions';

type P = { id: number; name: string; prod: string; prodId: number; job: string; jobId: number; place: string; expired: boolean; when: string; who: string };
// "Copy from another Job": plans are kept by Production, then Job (finished Jobs included). Only plans for the same Location as this Job's walls are offered.
export default function CopyPlan({ job, wall, plans, action }: { job: number; wall: number; plans: P[]; action: (f: FormData) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null); const [q, setQ] = useState(''), [prod, setProd] = useState(0), [state, setState] = useState('all');
  const [pick, setPick] = useState<P | null>(null), [res, setRes] = useState<any>(null), [ok, setOk] = useState(false), [busy, go] = useTransition();
  const choose = (p: P) => { setPick(p); setRes(null); setOk(false); go(async () => setRes(await copyPlanPreview(job, p.id, wall))); };
  const warns = (res?.findings ?? []).filter((x: any) => x.level === 'warn');
  const prods = Array.from(new Map(plans.map(p => [p.prodId, p.prod])).entries());
  const shown = plans.filter(p => (!prod || p.prodId === prod) && (state === 'all' || (state === 'finished') === p.expired) && `${p.name} ${p.job} ${p.prod} ${p.who} ${p.place}`.toLowerCase().includes(q.toLowerCase()));
  const groups = Array.from(new Set(shown.map(p => p.prodId))).map(pid => ({ pid, name: shown.find(p => p.prodId === pid)!.prod, jobs: Array.from(new Set(shown.filter(p => p.prodId === pid).map(p => p.jobId))).map(jid => ({ jid, items: shown.filter(p => p.jobId === jid) })) }));
  return (<div style={{ margin: '10px 0 0' }}><button type="button" className="sec small" onClick={() => ref.current?.showModal()}>Copy a saved plan from another Job</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }} style={{ width: 'min(680px, 96vw)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Copy a saved plan onto this wall</h2><button type="button" className="sec small" onClick={() => ref.current?.close()}>Close</button></div>
      <p className="mut" style={{ margin: '4px 0 8px' }}>Plans are kept by Production, then Job, including finished Jobs. Only plans for the same Location as this Job's walls are listed, and they are copied onto walls in that Location.</p>
      <div className="row" style={{ gap: 8, margin: '0 0 8px', flexWrap: 'wrap' }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search plans" aria-label="Search plans" style={{ flex: '1 1 160px' }} />
        <select value={prod} onChange={e => setProd(Number(e.target.value))} aria-label="Production"><option value={0}>All Productions</option>{prods.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select value={state} onChange={e => setState(e.target.value)} aria-label="Jobs"><option value="all">All Jobs</option><option value="active">Active Jobs</option><option value="finished">Finished Jobs</option></select></div>
      <div style={{ maxHeight: '55vh', overflow: 'auto', display: 'grid', gap: 10 }}>
        {groups.length === 0 && <p className="mut">No plans match.</p>}
        {groups.map(g => (<div key={g.pid}><b>{g.name}</b>
          {g.jobs.map(j => (<div key={j.jid} style={{ margin: '6px 0 0 10px' }}><div className="mut" style={{ fontSize: '.85rem' }}>{j.items[0].job}{j.items[0].expired ? ' · finished' : ''}</div>
            <div style={{ display: 'grid', gap: 4, marginTop: 3 }}>{j.items.map(p => (<button type="button" key={p.id} className={pick?.id === p.id ? '' : 'sec'} onClick={() => choose(p)} style={{ width: '100%', textAlign: 'left', display: 'grid', gap: 2, padding: 8 }}><b>{p.name}</b><span className="mut" style={{ fontSize: '.8rem' }}>{p.place} · saved {p.when}{p.who ? ` · by ${p.who}` : ''}</span></button>))}</div></div>))}</div>))}</div>
      {pick && <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}><b>{pick.job}</b>
        {busy && !res && <p className="mut">Checking it fits…</p>}
        {res?.error && <p role="alert" style={{ color: 'var(--bad)' }}>{res.error}</p>}
        {res?.findings?.length > 0 && <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{res.findings.map((x: any, i: number) => <li key={i} style={{ color: x.level === 'warn' ? '#b45309' : undefined }}><b>{x.wall}:</b> {x.text}</li>)}</ul>}
        {res && !res.error && warns.length === 0 && <p>This plan fits with no differences.</p>}
        {res && !res.error && warns.length > 0 && <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /> I have reviewed these differences</label>}
        {res && !res.error && <form action={action} style={{ marginTop: 8 }}><input type="hidden" name="job" value={job} /><input type="hidden" name="wall" value={wall} /><input type="hidden" name="plan" value={pick.id} /><input type="hidden" name="confirm" value={ok ? '1' : ''} /><button disabled={busy || (warns.length > 0 && !ok)}>Paste into this monitor plan</button></form>}</div>}
    </dialog></div>);
}
