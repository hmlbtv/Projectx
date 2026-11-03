'use client';
import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { copyHwUnit } from '@/lib/actions';

type U = { id: number; name: string; model: string; inputs: number; outputs: number; where: string; dest_names: Record<string, string>; dest_hw: Record<string, string>; out_names: Record<string, string>; out_hw: Record<string, string> };
type Opt = { value: string; label: string };
// "Copy hardware": a window with the unit's settings and names, all editable, that creates a new unit. Output assignments and destination numbers are not copied.
export default function CopyHardware({ u, where }: { u: U; where: Opt[] }) {
  const [st, act, pending] = useActionState(copyHwUnit, undefined); const ref = useRef<HTMLDialogElement>(null), router = useRouter();
  useEffect(() => { if (st?.ok && st.link) { ref.current?.close(); router.push(st.link); } }, [st, router]);
  const nI = Math.min(u.inputs, 1024), nO = Math.min(u.outputs, 256);
  return (<><button type="button" className="sec small" onClick={() => ref.current?.showModal()}>Copy hardware</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }} style={{ width: 'min(640px, 96vw)' }}>
      <form action={act} className="stack"><input type="hidden" name="id" value={u.id} />
        <h2 style={{ margin: 0 }}>Copy hardware</h2>
        <p className="mut" style={{ margin: 0 }}>Change anything you need. Output assignments and destination numbers are not copied; set them on the new unit.</p>
        <label>Name <input name="name" defaultValue={`${u.name} copy`} required maxLength={80} /></label>
        <label>Make / model <input name="model" defaultValue={u.model} maxLength={80} /></label>
        <label>Where <select name="where" required defaultValue={u.where}>{where.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <div className="row"><label>Inputs <input name="inputs" type="number" min={1} max={1024} defaultValue={u.inputs} /></label><label>Outputs <input name="outputs" type="number" min={1} max={256} defaultValue={u.outputs} /></label></div>
        <details><summary>Names ({nI} destinations, {nO} outputs)</summary>
          <p className="mut" style={{ margin: '6px 0' }}>Hardware name, then friendly name. Empty ones stay empty. Names beyond the new number of inputs or outputs are dropped.</p>
          <div style={{ maxHeight: '40vh', overflow: 'auto', display: 'grid', gap: 4, gridTemplateColumns: 'auto 1fr 1fr', alignItems: 'center' }}>
            {Array.from({ length: nI }, (_, i) => i + 1).map(n => (<div key={'d' + n} style={{ display: 'contents' }}><span style={{ textAlign: 'right' }}>D{n}</span><input name={'dh_' + n} defaultValue={u.dest_hw?.[n] ?? ''} maxLength={60} aria-label={`Destination ${n} hardware name`} /><input name={'dn_' + n} defaultValue={u.dest_names?.[n] ?? ''} maxLength={60} aria-label={`Destination ${n} friendly name`} /></div>))}
            {Array.from({ length: nO }, (_, i) => i + 1).map(n => (<div key={'o' + n} style={{ display: 'contents' }}><span style={{ textAlign: 'right' }}>Out {n}</span><input name={'oh_' + n} defaultValue={u.out_hw?.[n] ?? ''} maxLength={60} aria-label={`Output ${n} hardware name`} /><input name={'on_' + n} defaultValue={u.out_names?.[n] ?? ''} maxLength={60} aria-label={`Output ${n} friendly name`} /></div>))}</div></details>
        {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Cancel</button><button disabled={pending}>{pending ? 'Copying…' : 'Create copy'}</button></div>
      </form></dialog></>);
}
