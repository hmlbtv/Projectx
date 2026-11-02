'use client';
import { switchOrg } from '@/lib/orgActions';
export default function OrgSwitch({ orgs, current }: { orgs: { key: string; name: string; role: string }[]; current: string }) {
  return (<form action={switchOrg} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <label className="mut" style={{ fontSize: 12, whiteSpace: 'nowrap' }} htmlFor="orgsel">Working in</label>
    <select id="orgsel" name="org" defaultValue={current} onChange={e => e.currentTarget.form?.requestSubmit()} style={{ maxWidth: 180 }}>
      {orgs.map(o => <option key={o.key} value={o.key}>{o.name} ({o.role})</option>)}</select></form>);
}
