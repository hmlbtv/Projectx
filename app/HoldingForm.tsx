'use client';
import { useActionState } from 'react';
import { registerInterest } from '@/lib/interest';
export default function HoldingForm() {
  const [st, act, pending] = useActionState(registerInterest, undefined);
  if (st?.ok) return <div role="status" style={{ padding: '18px 0', textAlign: 'center' }}><b style={{ fontSize: 18 }}>Thank you!</b><p className="mut" style={{ margin: '6px 0 0' }}>We have your details and will be in touch as soon as TelePlanner is ready.</p></div>;
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    <label>Name<input name="name" autoComplete="name" required maxLength={120} style={{ width: '100%' }} /></label>
    <label>Company<input name="company" autoComplete="organization" maxLength={160} style={{ width: '100%' }} /></label>
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={200} style={{ width: '100%' }} /></label>
    <label>Comment<textarea name="comment" rows={3} maxLength={2000} style={{ width: '100%' }} /></label>
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    <button disabled={pending}>{pending ? 'Sending…' : 'Register your interest'}</button></form>);
}
