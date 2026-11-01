'use client';
import { useActionState, useRef, useState } from 'react';
import { mailAction } from '@/lib/mailLib';
type M = { id: number; subject: string; body: string; btn_label: string; btn_url: string; status: string };
export default function Editor({ m, opts, test }: { m: M; opts: { tok: string; label: string; n: number }[]; test: string }) {
  const [st, act, pending] = useActionState(mailAction, undefined);
  // controlled fields: React resets uncontrolled forms after an action, which would blank them
  const [v, setV] = useState({ subject: m.subject, body: m.body, btn_label: m.btn_label, btn_url: m.btn_url });
  const bind = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: any) => setV(x => ({ ...x, [k]: e.target.value })) });
  const actRef = useRef<HTMLInputElement>(null); // which button was pressed (the button's own value is not passed to the action)
  const pick = (a: string) => () => { if (actRef.current) actRef.current.value = a; };
  const signed = m.status === 'signed_off';
  return (<form action={act} className="card" style={{ display: 'grid', gap: 10 }}>
    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="act" defaultValue="save" ref={actRef} />
    <label>Subject<input {...bind('subject')} maxLength={150} style={{ width: '100%' }} /></label>
    <label>Message (a blank line starts a new paragraph)<textarea {...bind('body')} rows={10} maxLength={8000} style={{ width: '100%' }} /></label>
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      <label>Button text (optional)<input {...bind('btn_label')} maxLength={60} style={{ width: '100%' }} /></label>
      <label>Button link (optional)<input {...bind('btn_url')} placeholder="https://" maxLength={500} style={{ width: '100%' }} /></label></div>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.msg && <div role="status">{st.msg}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="submit" onClick={pick('save')} className="sec" disabled={pending}>Save draft</button>
      <button type="submit" onClick={pick('test')} className="sec" disabled={pending}>Send test to {test}</button>
      {m.status === 'tested' && <button type="submit" onClick={pick('signoff')} disabled={pending}>Sign off</button>}</div>
    {signed && <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line, #8883)', paddingTop: 12 }}>
      <b>Send to</b>
      {opts.map(o => <label key={o.tok} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="aud" value={o.tok} style={{ width: 'auto' }} />{o.label} <span className="mut">({o.n})</span></label>)}
      <label>Individual addresses (optional, one per line or separated by commas)<textarea name="extra" rows={3} style={{ width: '100%' }} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="confirm" value="yes" style={{ width: 'auto' }} />I have checked the test and want to send this</label>
      <div><button type="submit" onClick={pick('send')} disabled={pending}>{pending ? 'Sending…' : 'Send'}</button></div></div>}
  </form>);
}
