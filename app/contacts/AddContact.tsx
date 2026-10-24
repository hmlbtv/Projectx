'use client';
import { useActionState } from 'react';
import { addContact } from '@/lib/contactActions';
export default function AddContact({ productions }: { productions: { id: number; label: string }[] }) {
  const [st, act, pending] = useActionState(addContact, undefined);
  return (<div><form action={act} className="row"><input name="name" placeholder="Name" required /><input name="email" type="email" placeholder="Email" required /><input name="company" placeholder="Company (optional)" />
    <select name="production"><option value="">Assign to Production…</option>{productions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select><button disabled={pending}>Add contact</button></form>
    {st?.error && <div role="alert" style={{ color: 'var(--bad)' }}>{st.error}</div>}{st?.ok && <div className="mut">{st.ok}</div>}</div>);
}
