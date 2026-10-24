'use client';
import { useActionState } from 'react';
import { inviteUser } from '@/lib/actions';
export default function InviteUser({ job }: { job: number }) {
  const [st, act, pending] = useActionState(inviteUser, undefined);
  return (<div><form action={act} className="row"><input type="hidden" name="job" value={job} />
    <input name="email" type="email" placeholder="user@email" required />
    
    <button className="sec" disabled={pending}>Invite</button></form>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    {st?.ok && <div className="mut">{st.ok}</div>}{st?.link && <input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} />}</div>);
}
