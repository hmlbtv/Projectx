'use client';
import { useActionState } from 'react';
import { sendInterestMail } from '@/lib/interest';
export default function MailAll({ count }: { count: number }) {
  const [st, act, pending] = useActionState(sendInterestMail, undefined);
  return (<form action={act} className="card" style={{ display: 'grid', gap: 10 }}>
    <h2 style={{ margin: 0 }}>Email everyone who registered</h2>
    <p className="mut" style={{ margin: 0 }}>Sent in the TelePlanner email template to {count} {count === 1 ? 'address' : 'addresses'}. Send yourself a test first.</p>
    <label>Subject<input name="subject" required maxLength={150} style={{ width: '100%' }} /></label>
    <label>Message<textarea name="body" rows={6} required maxLength={5000} style={{ width: '100%' }} /></label>
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="confirm" value="yes" style={{ width: 'auto' }} />I am ready to email all {count}</label>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.msg && <div role="status">{st.msg}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button name="mode" value="test" className="sec" disabled={pending}>Send me a test</button><button name="mode" value="all" disabled={pending}>Send to everyone</button></div></form>);
}
