'use client';
import { useActionState, useState } from 'react';
import { begin2fa, confirm2fa, disable2fa, type TfState } from '@/lib/twofa';
// Set up / turn off two-step sign-in with an authenticator app. Recovery codes are shown once, when it is switched on.
export default function TwoFactor({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<TfState>();
  const [st, act, pending] = useActionState(confirm2fa, undefined);
  const [off, offAct, offPending] = useActionState(disable2fa, undefined);
  if (st?.codes) return (<div><p style={{ color: 'var(--ok)' }}>{st.ok}</p><p><b>Save these recovery codes now.</b> Each works once if you lose your phone. They will not be shown again.</p>
    <pre style={{ background: 'var(--bg)', padding: 12, borderRadius: 10, userSelect: 'all' }}>{st.codes.join('\n')}</pre></div>);
  if (enabled && !off?.ok) return (<form action={offAct} style={{ display: 'grid', gap: 10 }}>
    <p><span className="tag">on</span> You are asked for a code from your authenticator app each time you sign in.</p>
    <details><summary>Turn off two-step sign-in</summary><div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
      <label>Password<input name="password" type="password" autoComplete="current-password" required style={{ width: '100%' }} /></label>
      <label>Current code or a recovery code<input name="code" required style={{ width: '100%' }} /></label>
      {off?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{off.error}</div>}
      <button className="sec" disabled={offPending}>Turn off</button></div></details></form>);
  if (off?.ok) return <p style={{ color: 'var(--ok)' }}>{off.ok}</p>;
  const view = st?.secret ? st : setup;
  if (!view?.secret) return (<div><p className="mut">Add a second step to sign-in with a free authenticator app (Google Authenticator, Microsoft Authenticator, Authy, Bitwarden, 1Password).</p>
    <button type="button" onClick={async () => setSetup(await begin2fa())}>Set up 2FA</button></div>);
  return (<form action={act} style={{ display: 'grid', gap: 10 }}>
    <p>1. Scan this with your authenticator app, or type the key in by hand.</p>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={view.qr} alt="QR code for your authenticator app" width={220} height={220} style={{ background: '#fff', borderRadius: 10 }} />
    <code style={{ wordBreak: 'break-all' }}>{view.secret}</code>
    <label>2. Enter the 6-digit code it shows<input name="code" inputMode="numeric" autoComplete="one-time-code" required style={{ width: '100%' }} /></label>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    <button disabled={pending}>Turn on 2FA</button></form>);
}
