'use client';
import { useRef } from 'react';

// The starting layout for one wall in a Job: changing it saves straight away (until the Monitor Plan has sources in it).
export default function DefPick({ action, job, wall, value, options, locked }: { action: (f: FormData) => void | Promise<void>; job: number; wall: number; value: string; options: { id: string; name: string; active?: boolean }[]; locked: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return (<form ref={form} action={action} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <input type="hidden" name="job" value={job} /><input type="hidden" name="wall" value={wall} />
    <span className="mut" style={{ fontSize: 13 }}>Starting layout</span>
    <select name="def" defaultValue={value} disabled={locked} onChange={() => form.current?.requestSubmit()} aria-label="Default layout this Job's Monitor Plan starts from" style={{ maxWidth: 260 }}>
      {value === 'custom' && <option value="custom" disabled>Customised in the plan</option>}
      {options.map(x => <option key={x.id} value={x.id}>{x.name}{x.active ? ' (active default)' : ''}</option>)}
      <option value="none">None (first layout on each monitor)</option>
    </select>
    {locked && <span className="mut" style={{ fontSize: 12 }}>fixed: the plan already has sources</span>}
  </form>);
}
