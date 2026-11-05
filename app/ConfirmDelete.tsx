'use client';
import { useEffect, useRef, useState } from 'react';

// Site-wide "are you sure?" pop-up. Any red delete/remove button (class del or danger) asks first; Cancel leaves everything as it was.
// Skip one with data-noconfirm (for example a button that only opens a second confirm step).
export default function ConfirmDelete() {
  const ref = useRef<HTMLDialogElement>(null);
  const pending = useRef<HTMLButtonElement | null>(null);
  const bypass = useRef(false);
  const [msg, setMsg] = useState('');
  const [label, setLabel] = useState('Delete');
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bypass.current) return;
      const b = (e.target as HTMLElement | null)?.closest?.('button') as HTMLButtonElement | null;
      if (!b || b.disabled || !(b.classList.contains('del') || b.classList.contains('danger')) || b.hasAttribute('data-noconfirm') || b.closest('.dz-pal,[role=menu],[data-noconfirm]')) return;
      e.preventDefault(); e.stopPropagation();
      const row = b.closest('.del-row'); const t = row?.querySelector('.mut')?.textContent?.trim();
      pending.current = b;
      setMsg(t || b.getAttribute('title') || b.getAttribute('aria-label') || 'This cannot be undone.');
      const txt = (b.textContent ?? '').trim().replace(/^Yes,\s*/i, '');
      setLabel(/^[A-Za-z]/.test(txt) ? txt.charAt(0).toUpperCase() + txt.slice(1) : 'Delete');
      ref.current?.showModal();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  const go = () => { const b = pending.current; ref.current?.close(); pending.current = null; if (!b) return; bypass.current = true; try { if (b.form && b.type !== 'button') b.form.requestSubmit(b); else b.click(); } finally { bypass.current = false; } };
  return (<dialog ref={ref} className="dlg" onClose={() => { pending.current = null; }}>
    <h3 style={{ margin: '0 0 8px', color: 'var(--bad)' }}>Are you sure?</h3>
    <p style={{ margin: '0 0 16px' }}>{msg}</p>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" className="sec" autoFocus onClick={() => ref.current?.close()}>Cancel</button><button type="button" className="del" style={{ background: 'var(--bad)', color: '#fff' }} onClick={go}>{label}</button></div>
  </dialog>);
}
