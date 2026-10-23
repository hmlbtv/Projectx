'use client';
import { useActionState } from 'react';
import { acceptInvite } from '@/lib/actions';
export default function InviteForm({ token }: { token: string }) {
  const [st, act, pending] = useActionState(acceptInvite, undefined);
  return (<form action={act} style={{ display: 'grid', gap: 10 }}><input type="hidden" name="token" value={token} />
    <label>Your name<input name="name" autoComplete="name" style={{ width: '100%' }} /></label>
    <label>New password<input name="password" type="password" autoComplete="new-password" minLength={10} required style={{ width: '100%' }} /></label>
    <label>Repeat password<input name="password2" type="password" autoComplete="new-password" minLength={10} required style={{ width: '100%' }} /></label>
    <span className="mut">At least 10 characters, with letters and a number.</span>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    <button disabled={pending}>{pending ? 'Saving…' : 'Set password and sign in'}</button></form>);
}
