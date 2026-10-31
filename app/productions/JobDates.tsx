'use client';
import { useEffect, useRef, useState } from 'react';

const plus = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// Job date, Final date and Expires for a new Job. Each later date starts from the one before it, so its calendar opens on the right month
// (Final starts on the Job date; Expires starts 5 days after the Final date, which is the normal default). Anything you pick yourself is kept.
export default function JobDates() {
  const [date, setDate] = useState(''), [fin, setFin] = useState(''), [exp, setExp] = useState(''), [finOwn, setFinOwn] = useState(false), [expOwn, setExpOwn] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => { const f = box.current?.closest('form'); if (!f) return; const clear = () => setTimeout(() => { setDate(''); setFin(''); setExp(''); setFinOwn(false); setExpOwn(false); }, 0); f.addEventListener('reset', clear); return () => f.removeEventListener('reset', clear); }, []); // the form is cleared after a Job is added
  const setFinal = (f: string, own: boolean) => { setFin(f); setFinOwn(own); if (!expOwn) setExp(f ? plus(f, 5) : ''); };
  return (<span ref={box} style={{ display: 'contents' }}>
    <label className="mut">Job date<input type="date" name="date" value={date} onChange={e => { const v = e.target.value; setDate(v); if (v && (!finOwn || !fin || fin < v)) setFinal(v, false); }} /></label>
    <label className="mut">Final date<input type="date" name="final" value={fin} min={date || undefined} onChange={e => setFinal(e.target.value, !!e.target.value)} /></label>
    <label className="mut">Expires (optional)<input type="date" name="expires" value={exp} min={fin || undefined} onChange={e => { setExp(e.target.value); setExpOwn(!!e.target.value); }} /></label></span>);
}
