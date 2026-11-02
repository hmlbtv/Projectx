'use client';
import { useId } from 'react';
import { switchOrg } from '@/lib/orgActions';
export default function OrgSwitch({ orgs, current }: { orgs: { key: string; name: string; role: string }[]; current: string }) {
  const id = useId();
  return (<form action={switchOrg} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <label className="mut" style={{ fontSize: 12, whiteSpace: 'nowrap' }} htmlFor={id}>Working in</label>
    <select id={id} name="org" defaultValue={current} onChange={e => e.currentTarget.form?.requestSubmit()} style={{ maxWidth: 180 }}>
      {orgs.map(o => <option key={o.key} value={o.key}>{o.name} ({o.role})</option>)}</select></form>);
}
