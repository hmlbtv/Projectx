'use client';
import { useActionState } from 'react';
import { requestReset } from '@/lib/actions';
export default function ForgotForm() {
  const [st, act, pending] = useActionState(requestReset, undefined);
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    <label>Email<input name="email" type="email" autoComplete="username" required style={{ width: '100%' }} /></label>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.ok && <div style={{ color: 'var(--ok)' }}>{st.ok}</div>}
    <button disabled={pending}>Send reset link</button></form>);
}
