'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { mailAction } from '@/lib/mailLib';
type M = { id: number; subject: string; body: string; btn_label: string; btn_url: string; status: string; category: string };
export default function Editor({ m, opts, test }: { m: M; opts: { tok: string; label: string; n: number; emails: string[] }[]; test: string }) {
  const [st, act, pending] = useActionState(mailAction, undefined);
  // controlled fields: React resets uncontrolled forms after an action, which would blank them
  const [v, setV] = useState({ subject: m.subject, body: m.body, btn_label: m.btn_label, btn_url: m.btn_url, category: m.category });
  const bind = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: any) => setV(x => ({ ...x, [k]: e.target.value })) });
  const actRef = useRef<HTMLInputElement>(null); // which button was pressed (the button's own value is not passed to the action)
  const pick = (a: string) => () => { if (actRef.current) actRef.current.value = a; };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const all = [...new Set(opts.flatMap(o => o.emails))];
  const setMany = (l: string[], on: boolean) => setSel(x => { const n = new Set(x); l.forEach(e => on ? n.add(e) : n.delete(e)); return n; });
  const msgRef = useRef<HTMLDivElement>(null);
  // The buttons are at the bottom of a long form: bring the result (saved, test sent, error) into view.
  useEffect(() => { if (st) msgRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [st]);
  const signed = m.status === 'signed_off';
  return (<form action={act} className="card" style={{ display: 'grid', gap: 10 }}>
    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="act" defaultValue="save" ref={actRef} />
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}><legend style={{ padding: 0, marginBottom: 4 }}>This email is</legend>
      {([['marketing', 'Marketing', 'news, press releases, promotions'], ['important', 'Important update', 'changes people need to know about']] as const).map(([k, l, d]) =>
        <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" name="category" value={k} checked={v.category === k} onChange={() => setV(x => ({ ...x, category: k }))} style={{ width: 'auto' }} /><span><b>{l}</b> <span className="mut">· {d}</span></span></label>)}
      <span className="mut">Every email has an unsubscribe link for its kind. People who have unsubscribed from that kind are skipped.</span></fieldset>
    <label>Subject<input {...bind('subject')} maxLength={150} style={{ width: '100%' }} /></label>
    <label>Message (a blank line starts a new paragraph)<textarea {...bind('body')} rows={10} maxLength={8000} style={{ width: '100%' }} /></label>
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      <label>Button text (optional)<input {...bind('btn_label')} maxLength={60} style={{ width: '100%' }} /></label>
      <label>Button link (optional)<input {...bind('btn_url')} placeholder="https://" maxLength={500} style={{ width: '100%' }} /></label></div>
    <div ref={msgRef}>{st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.msg && <div role="status">{st.msg}</div>}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="submit" onClick={pick('save')} className="sec" disabled={pending}>Save draft</button>
      <button type="submit" onClick={pick('test')} className="sec" disabled={pending}>Send test to {test}</button>
      {m.status === 'tested' && <button type="submit" onClick={pick('signoff')} disabled={pending}>Sign off</button>}</div>
    {signed && <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line, #8883)', paddingTop: 12 }}>
      <b>Send to</b> <span className="mut">(open a group to pick people)</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="sec" onClick={() => setMany(all, true)}>Select all</button>
        <button type="button" className="sec" onClick={() => setMany(all, false)}>Deselect all</button>
        <span className="mut">{sel.size} selected</span></div>
      {opts.map(o => { const k = o.emails.filter(e => sel.has(e)).length;
        return (<details key={o.tok} className="card" style={{ margin: 0 }}>
          <summary style={{ cursor: 'pointer' }}><label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <input type="checkbox" style={{ width: 'auto' }} disabled={!o.n} checked={o.n > 0 && k === o.n} ref={el => { if (el) el.indeterminate = k > 0 && k < o.n; }} onChange={e => setMany(o.emails, e.target.checked)} />{o.label}</label> <span className="mut">({k} of {o.n})</span></summary>
          {o.n === 0 ? <p className="mut">No addresses.</p> : <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
            {o.emails.map(e => <label key={e} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={sel.has(e)} onChange={ev => setMany([e], ev.target.checked)} />{e}</label>)}</div>}</details>); })}
      {[...sel].map(e => <input key={e} type="hidden" name="to" value={e} />)}
      <label>Individual addresses (optional, one per line or separated by commas)<textarea name="extra" rows={3} style={{ width: '100%' }} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="confirm" value="yes" style={{ width: 'auto' }} />I have checked the test and want to send this</label>
      <div><button type="submit" onClick={pick('send')} disabled={pending}>{pending ? 'Sending…' : 'Send'}</button></div></div>}
  </form>);
}
