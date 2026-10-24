'use client';
import { useActionState } from 'react';
import { signIn } from '@/lib/actions';
export default function SignInForm({ next, email }: { next?: string; email?: string }) {
  const [st, act, pending] = useActionState(signIn, undefined);
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    {next && <input type="hidden" name="next" value={next} />}
    <label>Email<input name="email" type="email" autoComplete="username" defaultValue={email} required style={{ width: '100%' }} /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required style={{ width: '100%' }} /></label>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    <button disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button></form>);
}
