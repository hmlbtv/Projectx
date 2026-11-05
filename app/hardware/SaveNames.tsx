'use client';
import { useEffect, useRef, useState } from 'react';

// The "Save names" button. It lights up (accent colour, pulsing dot) as soon as any name in its form differs from what is saved, as a prompt to save.
export default function SaveNames() {
  const ref = useRef<HTMLButtonElement>(null); const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const form = ref.current?.closest('form'); if (!form) return;
    const check = () => setDirty(Array.from(form.querySelectorAll<HTMLInputElement>('input[name^="dn_"],input[name^="dh_"],input[name^="on_"],input[name^="oh_"]')).some(i => i.value !== i.defaultValue));
    const done = () => setTimeout(() => setDirty(false), 0);
    form.addEventListener('input', check); form.addEventListener('change', check); form.addEventListener('submit', done);
    return () => { form.removeEventListener('input', check); form.removeEventListener('change', check); form.removeEventListener('submit', done); };
  }, []);
  return <button ref={ref} className={dirty ? 'small savedirty' : 'sec small'} style={{ justifySelf: 'start' }} title={dirty ? 'You have unsaved name changes' : undefined}>Save names{dirty ? ' ●' : ''}</button>;
}
