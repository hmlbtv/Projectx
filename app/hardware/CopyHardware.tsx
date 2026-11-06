'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { copyHwUnit } from '@/lib/actions';

type U = { id: number; name: string; model: string; inputs: number; outputs: number; where: string; dest_names: Record<string, string>; dest_hw: Record<string, string>; out_names: Record<string, string>; out_hw: Record<string, string> };
type Opt = { value: string; label: string };
type Ticks = { name: boolean; model: boolean; hw: boolean; fn: boolean };
const NO_TICKS: Ticks = { name: false, model: false, hw: false, fn: false };
const KEY = 'teleplanner.copyInc';
// "prod 22" -> "prod 23", "CAM-007" -> "CAM-008". Only text that ends in a number can be incremented.
export const bump = (v: string): string | null => { const m = /(\d+)$/.exec(v); return m ? v.slice(0, m.index) + String(Number(m[1]) + 1).padStart(m[1].length, '0') : null; };
// "Copy hardware": a window with the Unit's settings and names, all editable, that creates a new Unit. Output assignments and destination numbers are not copied.
export default function CopyHardware({ u, where }: { u: U; where: Opt[] }) {
  const [st, act, pending] = useActionState(copyHwUnit, undefined); const ref = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null), router = useRouter();
  const [ticks, setTicks] = useState<Ticks>(NO_TICKS), [made, setMade] = useState<string[]>([]), [, redraw] = useState(0);
  const mode = useRef<'copy' | 'inc'>('copy'), lastName = useRef(''), orig = useRef(new Map<HTMLInputElement, string>()), snap = useRef<[HTMLInputElement | HTMLSelectElement, string][]>([]);
  // The inputs each tick box controls.
  const fields = (k: keyof Ticks): HTMLInputElement[] => { const f = form.current; if (!f) return []; const q = (sel: string) => Array.from(f.querySelectorAll<HTMLInputElement>(sel)); return k === 'name' ? q('input[name=name]') : k === 'model' ? q('input[name=model]') : k === 'hw' ? q('input[name^=dh_],input[name^=oh_]') : q('input[name^=dn_],input[name^=on_]'); };
  const step = (k: keyof Ticks) => { let n = 0; for (const i of fields(k)) { const b = bump(i.value); if (b != null) { if (!orig.current.has(i)) orig.current.set(i, i.value); i.value = b; n++; } } return n; };
  const undo = (k: keyof Ticks) => { for (const i of fields(k)) { const o = orig.current.get(i); if (o != null) { i.value = o; orig.current.delete(i); } } };
  const nextName = () => { const v = (form.current?.elements.namedItem('name') as HTMLInputElement | null)?.value ?? ''; return bump(v); };
  const tick = (k: keyof Ticks, on: boolean) => { if (on) { if (k === 'name') { const i = fields('name')[0]; if (i && i.value === `${u.name} copy`) { orig.current.set(i, i.value); i.value = u.name; } } step(k); } else undo(k); const next = { ...ticks, [k]: on }; setTicks(next); redraw(x => x + 1); };
  function open() { form.current?.reset(); orig.current.clear(); setMade([]); let t = NO_TICKS; try { t = { ...NO_TICKS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* no saved setting */ }
    ref.current?.showModal(); const f = form.current; if (f && (t.name || t.model || t.hw || t.fn)) { (Object.keys(t) as (keyof Ticks)[]).forEach(k => { if (t[k]) { if (k === 'name') { const i = fields('name')[0]; if (i && i.value === `${u.name} copy`) { orig.current.set(i, i.value); i.value = u.name; } } step(k); } }); } setTicks(t); }
  useEffect(() => { if (!st?.ok || !st.link) return;
    if (mode.current === 'inc') { setMade(m => [...m, lastName.current]); router.refresh();
      // React clears the form once the action finishes: put back what was typed, then add 1 to the ticked fields.
      setTimeout(() => { for (const [el, v] of snap.current) el.value = v; (Object.keys(ticks) as (keyof Ticks)[]).forEach(k => { if (ticks[k]) step(k); }); redraw(x => x + 1); }, 60); }
    else { ref.current?.close(); router.push(st.link); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);
  const nI = Math.min(u.inputs, 1024), nO = Math.min(u.outputs, 256);
  return (<><button type="button" className="sec small" onClick={open}>Copy hardware</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }} style={{ width: 'min(640px, 96vw)' }}>
      <form ref={form} action={act} className="stack"><input type="hidden" name="id" value={u.id} />
        <h2 style={{ margin: 0 }}>Copy hardware</h2>
        <p className="mut" style={{ margin: 0 }}>Change anything you need. Output assignments and destination numbers are not copied; set them on the new Unit.</p>
        <label>Name <input name="name" defaultValue={`${u.name} copy`} required maxLength={80} onInput={() => redraw(x => x + 1)} /></label>
        <label className="row" style={{ margin: 0, gap: 6 }}><input type="checkbox" checked={ticks.name} onChange={e => tick('name', e.target.checked)} /> <span>Add 1 to the number at the end of the name</span></label>
        {ticks.name && <div className="mut" role="status" style={{ fontSize: '.9rem' }}>{nextName() == null && !fields('name')[0]?.value ? '' : <>This copy is named <b>{fields('name')[0]?.value}</b>{nextName() ? <>; the next Copy Inc will be <b>{nextName()}</b>.</> : <>. The name doesn’t end in a number, so there is nothing to add 1 to.</>}</>}</div>}
        <label>Make / model <input name="model" defaultValue={u.model} maxLength={80} /></label>
        <label className="row" style={{ margin: 0, gap: 6 }}><input type="checkbox" checked={ticks.model} onChange={e => tick('model', e.target.checked)} /> <span>Add 1 to the number at the end of the model</span></label>
        <label>Where <select name="where" required defaultValue={u.where}>{where.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <div className="row"><label>Inputs <input name="inputs" type="number" min={1} max={1024} defaultValue={u.inputs} /></label><label>Outputs <input name="outputs" type="number" min={1} max={256} defaultValue={u.outputs} /></label></div>
        <details><summary>Names ({nI} destinations, {nO} outputs)</summary>
          <label className="row" style={{ margin: '6px 0 0', gap: 6 }}><input type="checkbox" checked={ticks.hw} onChange={e => tick('hw', e.target.checked)} /> <span>Add 1 to every hardware name that ends in a number{ticks.hw ? ` (${fields('hw').filter(i => /\d$/.test(i.value) || orig.current.has(i)).length} changed)` : ''}</span></label>
          <label className="row" style={{ margin: '0 0 6px', gap: 6 }}><input type="checkbox" checked={ticks.fn} onChange={e => tick('fn', e.target.checked)} /> <span>Add 1 to every friendly name that ends in a number{ticks.fn ? ` (${fields('fn').filter(i => /\d$/.test(i.value) || orig.current.has(i)).length} changed)` : ''}</span></label>
          <p className="mut" style={{ margin: '6px 0' }}>Hardware name, then friendly name. Friendly names start blank on a copy (fill them in or use Auto-name friendly names later). Empty ones stay empty. Names beyond the new number of inputs or outputs are dropped.</p>
          <div style={{ maxHeight: '40vh', overflow: 'auto', display: 'grid', gap: 4, gridTemplateColumns: 'auto 1fr 1fr', alignItems: 'center' }}>
            {Array.from({ length: nI }, (_, i) => i + 1).map(n => (<div key={'d' + n} style={{ display: 'contents' }}><span style={{ textAlign: 'right' }}>D{n}</span><input name={'dh_' + n} defaultValue={u.dest_hw?.[n] ?? ''} maxLength={60} aria-label={`Destination ${n} hardware name`} /><input name={'dn_' + n} defaultValue={''} maxLength={60} aria-label={`Destination ${n} friendly name`} /></div>))}
            {Array.from({ length: nO }, (_, i) => i + 1).map(n => (<div key={'o' + n} style={{ display: 'contents' }}><span style={{ textAlign: 'right' }}>Out {n}</span><input name={'oh_' + n} defaultValue={u.out_hw?.[n] ?? ''} maxLength={60} aria-label={`Output ${n} hardware name`} /><input name={'on_' + n} defaultValue={''} maxLength={60} aria-label={`Output ${n} friendly name`} /></div>))}</div></details>
        {made.length > 0 && <div role="status"><b>Created:</b> {made.join(', ')}</div>}
        {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>{made.length ? 'Done' : 'Cancel'}</button><button className="sec" disabled={pending} title="Create this copy, then get the form ready for the next one with the ticked numbers added to" onClick={() => { mode.current = 'inc'; snap.current = Array.from(form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=checkbox]):not([type=hidden]), select') ?? []).map(el => [el, el.value]); lastName.current = (form.current?.elements.namedItem('name') as HTMLInputElement | null)?.value ?? ''; try { localStorage.setItem(KEY, JSON.stringify(ticks)); } catch { /* ignore */ } }}>Copy Inc</button><button disabled={pending} onClick={() => { mode.current = 'copy'; }}>{pending ? 'Copying…' : 'Create copy'}</button></div>
      </form></dialog></>);
}
