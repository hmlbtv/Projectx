'use client';
import { useActionState } from 'react';
import { changePassword } from '@/lib/actions';
export default function PasswordForm() {
  const [st, act, pending] = useActionState(changePassword, undefined);
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    <label>Current password<input name="current" type="password" autoComplete="current-password" required style={{ width: '100%' }} /></label>
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required style={{ width: '100%' }} /></label>
    <label>Repeat new password<input name="password2" type="password" autoComplete="new-password" minLength={10} required style={{ width: '100%' }} /></label>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.ok && <div style={{ color: 'var(--ok)' }}>{st.ok}</div>}
    <button disabled={pending}>Change password</button></form>);
}
