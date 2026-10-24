'use client';
import { useActionState, useEffect, useRef } from 'react';
import type { FormState } from '@/lib/actions';
// Small "+ Add" button that opens a dialog with a single-name form. Closes itself when the item has been added.
export default function AddDialog({ action, label, title, placeholder, children, inline, noName }: { noName?: boolean; inline?: boolean; children?: React.ReactNode; action: (s: FormState, f: FormData) => Promise<FormState>; label: string; title: string; placeholder?: string }) {
  const [st, act] = useActionState(action, undefined);
  const ref = useRef<HTMLDialogElement>(null), form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (st?.ok && !st?.link) { form.current?.reset(); ref.current?.close(); } }, [st]);
  return (<div className={inline ? 'addrow inline' : 'addrow'}>
    <button type="button" className="sec small" onClick={() => ref.current?.showModal()}>+ {label}</button>
    <dialog ref={ref} className="dlg" onClick={e => { if (e.target === ref.current) ref.current?.close(); }}>
      <form ref={form} action={act} className="stack">
        <h2 style={{ margin: 0 }}>{title}</h2>
        {!noName && <input name="name" placeholder={placeholder} required autoFocus />}
        {children}
        {st?.ok && st?.link && <div><div className="mut">{st.ok}</div><input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} /></div>}
        {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Cancel</button><button>{noName ? label : 'Add'}</button></div>
      </form>
    </dialog></div>);
}
