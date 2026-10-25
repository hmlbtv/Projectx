'use client';
import { useActionState } from 'react';
import { sendTestEmail } from '@/lib/actions';
export default function TestEmail({ defaultTo }: { defaultTo: string }) {
  const [st, act, pending] = useActionState(sendTestEmail, undefined);
  return (<form action={act} className="stack">
    <label className="mut">Send a test email to<input name="to" type="email" defaultValue={defaultTo} required /></label>
    <div><button disabled={pending}>{pending ? 'Sending…' : 'Send test email'}</button></div>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    {st?.ok && <div className="mut" role="status">{st.ok}</div>}</form>);
}
