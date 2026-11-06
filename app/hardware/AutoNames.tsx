'use client';
import { useRef, useState } from 'react';

// Fills the destination name boxes above it from the Unit's frame/slot and from the monitor tiles it feeds. Nothing is saved until "Save names" is pressed.
export default function AutoNames({ hw, fn, dup }: { hw: string[]; fn: (string | null)[]; dup: number; noFrame?: boolean }) {
  const box = useRef<HTMLDivElement>(null); const [msg, setMsg] = useState('');
  function fill(prefix: 'dh_' | 'dn_', vals: (string | null)[], what: string) {
    const form = box.current?.closest('form'); if (!form) return; let n = 0;
    vals.forEach((v, i) => { if (!v) return; const el = form.elements.namedItem(prefix + (i + 1)) as HTMLInputElement | null; if (el) { el.value = v.slice(0, 60); el.dispatchEvent(new Event('input', { bubbles: true })); n++; } });
    setMsg(n ? `${n} ${what} filled in. Press Save names to keep them, or reload to undo.${prefix === 'dn_' && dup ? ` ${dup} destination${dup === 1 ? ' is' : 's are'} used by more than one monitor tile; the first is used.` : ''}` : prefix === 'dh_' ? 'Put this Unit in a Frame slot first (Edit hardware, or Rack view).' : 'No destinations are set on any monitor tile yet. Assign them under Outputs below.');
  }
  return (<div ref={box} className="row" style={{ margin: 0 }}>
    <button type="button" className="sec small" onClick={() => fill('dh_', hw, 'hardware names')} title="Frame name / slot number / input number">Auto-name hardware names</button>
    <button type="button" className="sec small" onClick={() => fill('dn_', fn, 'friendly names')} title="Monitor name and tile number, e.g. Prod 14-1">Auto-name friendly names</button>
    {msg && <span role="status" className="mut" style={{ fontSize: '.9rem' }}>{msg}</span>}</div>);
}
