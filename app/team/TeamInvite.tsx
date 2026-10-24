'use client';
import { useActionState } from 'react';
import { inviteTeam } from '@/lib/actions';
export default function TeamInvite({ canAddManagers }: { canAddManagers: boolean }) {
  const [st, act, pending] = useActionState(inviteTeam, undefined);
  return (<div><form action={act} className="row"><input name="email" type="email" placeholder="colleague@email" required />
    <select name="role"><option value="user">User</option>{canAddManagers && <option value="manager">Manager</option>}</select>
    <button disabled={pending}>Invite</button></form>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}
    {st?.ok && <div className="mut">{st.ok}</div>}{st?.link && <input readOnly value={st.link} style={{ width: '100%' }} onFocus={e => e.currentTarget.select()} />}</div>);
}
