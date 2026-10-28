'use client';
import { useRef, useState } from 'react';

type P = { id: number; name: string; job: string; expired: boolean; when: string; who: string };
// "Copy from another Job": pick a saved Monitor Plan (expired Jobs included); it is copied into this Job as a new plan of your own.
export default function CopyPlan({ job, plans, action }: { job: number; plans: P[]; action: (f: FormData) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null); const [q, setQ] = useState('');
  const shown = plans.filter(p => `${p.name} ${p.job} ${p.who}`.toLowerCase().includes(q.toLowerCase()));
  return (<div style={{ margin: '0 0 12px' }}><button type="button" className="sec small" onClick={() => ref.current?.showModal()}>Copy a saved plan from another Job</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }} style={{ width: 'min(640px, 96vw)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>Copy a saved plan</h2><button type="button" className="sec small" onClick={() => ref.current?.close()}>Close</button></div>
      <p className="mut" style={{ margin: '4px 0 8px' }}>Choose a plan from another Job, including Jobs that have finished. It is copied here as a new plan; monitors keep their chosen MV layouts where the wall still allows them.</p>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search plans" aria-label="Search plans" style={{ width: '100%', marginBottom: 8 }} />
      <div style={{ maxHeight: '55vh', overflow: 'auto', display: 'grid', gap: 6 }}>
        {shown.length === 0 && <p className="mut">No plans match.</p>}
        {shown.map(p => (<form key={p.id} action={action}><input type="hidden" name="job" value={job} /><input type="hidden" name="plan" value={p.id} />
          <button className="sec" style={{ width: '100%', textAlign: 'left', display: 'grid', gap: 2, padding: 10 }}><b>{p.name}</b><span className="mut" style={{ fontSize: '.85rem' }}>{p.job}{p.expired ? ' · finished' : ''} · saved {p.when}{p.who ? ` · by ${p.who}` : ''}</span></button></form>))}</div>
    </dialog></div>);
}
