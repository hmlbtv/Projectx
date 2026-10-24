'use client';
import { useActionState } from 'react';
import { signUp } from '@/lib/actions';
export default function SignUpForm() {
  const [st, act, pending] = useActionState(signUp, undefined);
  if (st?.ok) return <div style={{ color: 'var(--ok)' }}>{st.ok}</div>;
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    <label>Your name<input name="name" autoComplete="name" required maxLength={100} style={{ width: '100%' }} /></label>
    <label>Company or team name<input name="tenant" autoComplete="organization" required maxLength={100} style={{ width: '100%' }} /></label>
    <label>Email<input name="email" type="email" autoComplete="username" required style={{ width: '100%' }} /></label>
    <label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required style={{ width: '100%' }} /></label>
    <label>Repeat password<input name="password2" type="password" autoComplete="new-password" minLength={10} required style={{ width: '100%' }} /></label>
    <span className="mut">At least 10 characters, with letters and a number.</span>
    <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }} />
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    <button disabled={pending}>{pending ? 'Creating…' : 'Create account'}</button></form>);
}
