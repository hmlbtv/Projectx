'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { addHwCard } from '@/lib/actions';
import { bump } from '../CopyHardware';

type Opt = { value: string; label: string; disabled?: boolean };
type Src = { id: number; name: string; model: string; inputs: number; outputs: number };
const EVENT = 'hw-add-card';

// The "+" in an empty slot: asks the frame's dialog (below) to open for that slot.
export function SlotPlus({ frame, slot }: { frame: number; slot: number }) {
  return <button type="button" onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: { frame, slot } }))} title={`Slot ${slot}: empty. Add a card`} aria-label={`Add a card to slot ${slot}`} style={{ all: 'unset', cursor: 'pointer', flex: 1, width: '100%', textAlign: 'center', fontSize: '.9rem', lineHeight: 1, opacity: .7 }}>+</button>;
}

// A normal button (used in the frame's ⋯ menu) that opens the same dialog. Leave slot out to use the first empty slot.
export function AddCardButton({ frame, slot, children }: { frame: number; slot: number; children: React.ReactNode }) {
  return <button type="button" className="sec small" onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: { frame, slot } }))}>{children}</button>;
}

// One dialog per frame. Add a new card, or copy one already in the frame. Location and monitor are optional.
export default function AddCard({ frame, frameName, rackWhere, where, monitors, sources }: { frame: number; frameName: string; rackWhere: string; where: Opt[]; monitors: Opt[]; sources: Src[] }) {
  const [st, act, pending] = useActionState(addHwCard, undefined); const ref = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null);
  const [slot, setSlot] = useState(0), [mode, setMode] = useState<'new' | 'copy'>('new'), [src, setSrc] = useState<number>(sources[0]?.id ?? 0), [name, setName] = useState(''), [inputs, setInputs] = useState(48), [outputs, setOutputs] = useState(4);
  const pick = (id: number, m: 'new' | 'copy') => { const x = sources.find(y => y.id === id); if (m === 'copy' && x) { setName(bump(x.name) ?? `${x.name} copy`); setInputs(x.inputs); setOutputs(x.outputs); } else { setName(''); setInputs(48); setOutputs(4); } };
  useEffect(() => { const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d.frame !== frame) return; setSlot(d.slot); const m = sources.length ? 'copy' : 'new'; setMode(m); const id = sources[0]?.id ?? 0; setSrc(id); pick(id, m); form.current?.reset(); ref.current?.showModal(); };
    window.addEventListener(EVENT, h); return () => window.removeEventListener(EVENT, h); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, sources]);
  useEffect(() => { if (st?.ok) ref.current?.close(); }, [st]);
  return (<dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }} style={{ width: 'min(560px, 96vw)' }}>
    <form ref={form} action={act} className="stack"><input type="hidden" name="frame" value={frame} /><input type="hidden" name="slot" value={slot} />
      <h2 style={{ margin: 0 }}>Add a card to {frameName}, slot {slot}</h2>
      <p className="mut" style={{ margin: 0 }}>The card goes into this frame and slot{rackWhere ? ` and is placed at ${rackWhere}` : ''}. Location and monitor are optional and can be filled in later.</p>
      <div className="row" style={{ margin: 0 }}><label className="row" style={{ margin: 0, gap: 6 }}><input type="radio" name="mode" value="new" checked={mode === 'new'} onChange={() => { setMode('new'); pick(src, 'new'); }} /> New card</label>
        <label className="row" style={{ margin: 0, gap: 6, opacity: sources.length ? 1 : .5 }}><input type="radio" name="mode" value="copy" disabled={!sources.length} checked={mode === 'copy'} onChange={() => { setMode('copy'); pick(src, 'copy'); }} /> Copy a card in this frame</label></div>
      {mode === 'copy' && <label>Copy from <select name="source" value={src} onChange={e => { const id = Number(e.target.value); setSrc(id); pick(id, 'copy'); }}>{sources.map(x => <option key={x.id} value={x.id}>{x.name}{x.model ? ` · ${x.model}` : ''}</option>)}</select></label>}
      <label>Name <input name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoFocus /></label>
      <div className="row" style={{ margin: 0 }}><label>Inputs <input name="inputs" type="number" min={1} max={1024} value={inputs} onChange={e => setInputs(Number(e.target.value))} style={{ width: 90 }} /></label><label>Outputs <input name="outputs" type="number" min={1} max={256} value={outputs} onChange={e => setOutputs(Number(e.target.value))} style={{ width: 90 }} /></label></div>
      <label>Location <select name="where" defaultValue=""><option value="">{rackWhere ? `Same as the rack (${rackWhere})` : 'Choose later'}</option>{where.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label>Monitor (output 1) <select name="monitor" defaultValue=""><option value="">Not assigned yet</option>{monitors.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select></label>
      {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Cancel</button><button disabled={pending}>{pending ? 'Adding…' : 'Add card'}</button></div>
    </form></dialog>);
}
