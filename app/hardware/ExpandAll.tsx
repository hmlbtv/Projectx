'use client';
// Expands or collapses every branch of the hardware list.
export default function ExpandAll({ target }: { target: string }) {
  const set = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>(`${target} details:not(.dots)`).forEach(d => { d.open = open; });
  return (<span className="row" style={{ margin: 0 }}><button type="button" className="sec small" onClick={() => set(true)}>Expand all</button><button type="button" className="sec small" onClick={() => set(false)}>Collapse all</button></span>);
}
