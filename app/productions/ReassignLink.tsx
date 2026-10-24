'use client';
import { useActionState } from 'react';
import { reassignWallLink } from '@/lib/guestActions';
export default function ReassignLink({ id, contacts, current }: { id: number; contacts: { id: number; name: string; email: string }[]; current: string }) {
  const [st, act, pending] = useActionState(reassignWallLink, undefined);
  return (<div><form action={act} className="row" style={{ margin: '2px 0' }}><input type="hidden" name="id" value={id} />
    <select name="contact">{contacts.map(c => <option key={c.id} value={c.id}>{c.email === current ? `Resend to ${c.name}` : `Move to ${c.name}`} ({c.email})</option>)}</select>
    <button className="sec" disabled={pending} style={{ minHeight: 0, padding: '3px 12px' }}>Send new link</button></form>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.ok && <div className="mut">{st.ok}</div>}
    {st?.link && <input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} />}</div>);
}
