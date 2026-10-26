'use client';
import { useActionState } from 'react';
import { signIn, verifySignIn2fa } from '@/lib/actions';
export default function SignInForm({ next, email }: { next?: string; email?: string }) {
  const [st, act, pending] = useActionState(signIn, undefined);
  const [st2, act2, pending2] = useActionState(verifySignIn2fa, undefined);
  // After the password is accepted for an account with two-step sign-in, ask for the code. A timeout sends them back to the password.
  if (st?.step === '2fa' && st2?.step !== 'restart') return (<form action={act2} style={{ display: 'grid', gap: 10 }}>
    {next && <input type="hidden" name="next" value={next} />}
    <p className="mut" style={{ margin: 0 }}>Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your recovery codes instead.</p>
    <label>Code<input name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required style={{ width: '100%' }} /></label>
    {st2?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st2.error}</div>}
    <button disabled={pending2}>{pending2 ? 'Checking…' : 'Verify and sign in'}</button></form>);
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    {next && <input type="hidden" name="next" value={next} />}
    <label>Email<input name="email" type="email" autoComplete="username" defaultValue={email} required style={{ width: '100%' }} /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required style={{ width: '100%' }} /></label>
    {(st2?.step === 'restart' ? st2.error : st?.error) && <div role="alert" style={{ color: 'var(--bad)' }}>{st2?.step === 'restart' ? st2.error : st?.error}</div>}
    <button disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button></form>);
}
