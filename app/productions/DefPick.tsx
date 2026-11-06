'use client';
import { useState, useTransition } from 'react';

// The starting layout for one wall in a Job: changing it saves straight away (until the Monitor Plan has sources in it).
export default function DefPick({ action, job, wall, value, options, locked }: { action: (f: FormData) => void | Promise<void>; job: number; wall: number; value: string; options: { id: string; name: string; active?: boolean }[]; locked: boolean }) {
  const [pending, start] = useTransition(); const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle'); const [err, setErr] = useState('');
  const save = (v: string) => {
    const f = new FormData(); f.set('job', String(job)); f.set('wall', String(wall)); f.set('def', v); setState('idle');
    start(async () => { try { await action(f); setState('saved'); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); setState('error'); } });
  };
  return (<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    <span className="mut" style={{ fontSize: 13 }}>Starting configuration</span>
    <select defaultValue={value} disabled={locked || pending} onChange={e => save(e.target.value)} aria-label="Default configuration this Job's Monitor Plan starts from" style={{ maxWidth: 260 }}>
      {value === 'custom' && <option value="custom" disabled>Customised in the plan</option>}
      {options.map(x => <option key={x.id} value={x.id}>{x.name}{x.active ? ' (active default)' : ''}</option>)}
      <option value="none">None (first layout on each monitor)</option>
    </select>
    <span role="status" style={{ fontSize: 12 }} className={state === 'error' ? 'err' : 'mut'}>{pending ? 'Saving…' : state === 'saved' ? 'Saved ✓' : state === 'error' ? `Not saved: ${err}` : locked ? 'fixed: the plan already has sources' : ''}</span>
  </div>);
}
