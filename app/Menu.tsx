'use client';
import { useEffect, useRef } from 'react';
// Three-dot options menu. Closes when a form inside it is saved, or when you click elsewhere / press Escape.
export default function Menu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: Event) => { if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && ref.current) ref.current.open = false; };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, []);
  return (<details className="dots" ref={ref}><summary aria-label="Options" title="Options">⋯</summary>
    <div className="pop" onSubmit={() => setTimeout(() => { if (ref.current) ref.current.open = false; }, 0)}>{children}</div></details>);
}
