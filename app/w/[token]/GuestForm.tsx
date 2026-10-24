'use client';
import { useActionState } from 'react';
import { requestGuestCode, verifyGuestCode } from '@/lib/guestActions';
export default function GuestForm({ token }: { token: string }) {
  const [a, reqAct, p1] = useActionState(requestGuestCode, undefined);
  const [b, verAct, p2] = useActionState(verifyGuestCode, undefined);
  const step = a?.step === 'code' || b?.step === 'code';
  return (<div style={{ display: 'grid', gap: 12 }}>
    <form action={reqAct} style={{ display: 'grid', gap: 10 }}><input type="hidden" name="token" value={token} />
      <label>Your email<input name="email" type="email" autoComplete="email" required style={{ width: '100%' }} /></label>
      <button disabled={p1}>{step ? 'Send a new code' : 'Send me a code'}</button></form>
    {a?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{a.error}</div>}{a?.ok && <div className="mut">{a.ok}</div>}
    {step && <form action={verAct} style={{ display: 'grid', gap: 10 }}><input type="hidden" name="token" value={token} />
      <label>6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required style={{ width: '100%' }} /></label>
      <button disabled={p2}>Open the wall</button></form>}
    {b?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{b.error}</div>}</div>);
}
