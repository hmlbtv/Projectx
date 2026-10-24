'use client';
import { useActionState } from 'react';
import { addAltEmail } from '@/lib/actions';
export default function AltEmails() {
  const [st, act, pending] = useActionState(addAltEmail, undefined);
  return (<div><form action={act} className="row"><input name="email" type="email" placeholder="other@email" required /><button className="sec" disabled={pending}>Add and confirm</button></form>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.ok && <div className="mut">{st.ok}</div>}
    {st?.link && <input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} />}</div>);
}
