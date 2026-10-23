'use client';
import { useRef, useState } from 'react';
import { saveWall } from '@/lib/actions';

type A = { id: string; type: string; name: string; x: number; y: number; w: number; h: number };
const PALETTE = [
  { type: 'monitor', label: 'Monitor 16:9', w: 320, h: 180, color: '#1d3a6b' },
  { type: 'monitor43', label: 'Monitor 4:3', w: 240, h: 180, color: '#1d3a6b' },
  { type: 'speaker', label: 'Speaker', w: 60, h: 120, color: '#5a3a1d' },
  { type: 'clock', label: 'Clock', w: 100, h: 100, color: '#3a1d5a' },
];
const SNAP = 10, W = 1600, H = 900;
const hit = (a: A, b: A) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export default function Designer({ id, initialName, initial }: { id: number | null; initialName: string; initial: A[] }) {
  const [name, setName] = useState(initialName);
  const [assets, setAssets] = useState<A[]>(initial);
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [wid, setWid] = useState<number | null>(id);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<any>(null);

  // Canvas scales to fit all assets (min 1600x900 world), per spec.
  const maxX = Math.max(W, ...assets.map(a => a.x + a.w)), maxY = Math.max(H, ...assets.map(a => a.y + a.h));
  const scale = Math.min(1, 100 / 100) * (1 / Math.max(maxX / W, maxY / H));
  const cw = ref.current?.clientWidth || 800; const px = cw / maxX;
  const ok = (list: A[], moved: A[]) => !moved.some(m => list.some(o => !moved.includes(o) && o.id !== m.id && hit(m, o)));

  function place(w: number, h: number): { x: number; y: number } {
    for (let y = 0; y < 3000; y += SNAP * 2) for (let x = 0; x < 3000; x += SNAP * 2) {
      const t = { id: '', type: '', name: '', x, y, w, h }; if (!assets.some(a => hit(t, a))) return { x, y };
    } return { x: 0, y: 0 };
  }
  function add(p: typeof PALETTE[number]) {
    const pos = place(p.w, p.h);
    const a: A = { id: Math.random().toString(36).slice(2, 8), type: p.type, name: p.label, ...pos, w: p.w, h: p.h };
    setAssets([...assets, a]); setSel([a.id]);
  }
  function move(ids: string[], dx: number, dy: number) {
    const next = assets.map(a => ids.includes(a.id) ? { ...a, x: Math.max(0, a.x + dx), y: Math.max(0, a.y + dy) } : a);
    if (ok(next, next.filter(a => ids.includes(a.id)))) setAssets(next);
  }
  function down(e: React.PointerEvent, a: A) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ids = e.shiftKey ? Array.from(new Set([...sel, a.id])) : sel.includes(a.id) ? sel : [a.id];
    setSel(ids); drag.current = { sx: e.clientX, sy: e.clientY, orig: assets };
  }
  function dragMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = Math.round((e.clientX - d.sx) / px / SNAP) * SNAP, dy = Math.round((e.clientY - d.sy) / px / SNAP) * SNAP;
    const next = d.orig.map((a: A) => sel.includes(a.id) ? { ...a, x: Math.max(0, a.x + dx), y: Math.max(0, a.y + dy) } : a);
    if (ok(next, next.filter((a: A) => sel.includes(a.id)))) setAssets(next);
  }
  function key(e: React.KeyboardEvent) {
    const d = { ArrowLeft: [-SNAP, 0], ArrowRight: [SNAP, 0], ArrowUp: [0, -SNAP], ArrowDown: [0, SNAP] }[e.key];
    if (d && sel.length) { e.preventDefault(); move(sel, d[0], d[1]); }
    if (e.key === 'Delete' && sel.length) { setAssets(assets.filter(a => !sel.includes(a.id))); setSel([]); }
  }
  function align(kind: string) {
    const S = assets.filter(a => sel.includes(a.id)); if (S.length < 2) return;
    const minX = Math.min(...S.map(a => a.x)), maxR = Math.max(...S.map(a => a.x + a.w)), minY = Math.min(...S.map(a => a.y)), maxB = Math.max(...S.map(a => a.y + a.h));
    let next = assets.map(a => ({ ...a }));
    const T = next.filter(a => sel.includes(a.id));
    if (kind === 'top') T.forEach(a => a.y = minY);
    if (kind === 'left') T.forEach(a => a.x = minX);
    if (kind === 'right') T.forEach(a => a.x = maxR - a.w);
    if (kind === 'middle') T.forEach(a => a.y = Math.round(((minY + maxB) / 2 - a.h / 2) / SNAP) * SNAP);
    if (kind === 'h' || kind === 'v') {
      const hz = kind === 'h'; T.sort((a, b) => hz ? a.x - b.x : a.y - b.y);
      const total = hz ? maxR - minX : maxB - minY, used = T.reduce((s, a) => s + (hz ? a.w : a.h), 0), gap = (total - used) / (T.length - 1);
      let cur = hz ? minX : minY; T.forEach(a => { if (hz) { a.x = Math.round(cur); cur += a.w + gap; } else { a.y = Math.round(cur); cur += a.h + gap; } });
    }
    if (ok(next, T)) setAssets(next); else setMsg('Alignment would overlap assets - not applied');
  }
  const one = assets.find(a => a.id === sel[0]);
  const upd = (patch: Partial<A>) => { const next = assets.map(a => a.id === one!.id ? { ...a, ...patch } : a); if (ok(next, next.filter(a => a.id === one!.id))) setAssets(next); };

  async function save() { const r = await saveWall(wid, name || 'Untitled Wall', assets); setWid(r); setMsg('Saved'); }
  const color = (t: string) => PALETTE.find(p => p.type === t)?.color || '#333';

  return (<div>
    <div className="row"><input value={name} onChange={e => setName(e.target.value)} placeholder="Wall Template name" /><button onClick={save}>Save</button><span className="mut">{msg}</span></div>
    <div className="split" style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 12 }}>
      <div ref={ref} className="canvas" tabIndex={0} onKeyDown={key} onPointerMove={dragMove} onPointerUp={() => (drag.current = null)}
        onPointerDown={e => { if (e.target === e.currentTarget) setSel([]); }} style={{ height: (ref.current?.clientWidth || 800) * maxY / maxX || 450, minHeight: 300, background: '#000' }}>
        {assets.map(a => (<div key={a.id} className={'asset' + (sel.includes(a.id) ? ' sel' : '')} onPointerDown={e => down(e, a)}
          style={{ left: a.x * px, top: a.y * px, width: a.w * px, height: a.h * px, background: color(a.type) }}>{a.name}</div>))}
      </div>
      <div>
        <div className="card"><b>Add asset</b>{PALETTE.map(p => <div key={p.type}><button className="sec" onClick={() => add(p)}>+ {p.label}</button></div>)}</div>
        <div className="card"><b>Align (select several)</b><div className="row">
          {[['top', 'Top'], ['left', 'Left'], ['right', 'Right'], ['middle', 'Middle'], ['h', 'Space H'], ['v', 'Space V']].map(([k, l]) => <button key={k} className="sec" onClick={() => align(k)}>{l}</button>)}</div></div>
        <div className="card"><b>Properties</b>{one ? <div>
          <div><input value={one.name} onChange={e => upd({ name: e.target.value })} /></div>
          X <input type="number" style={{ width: 70 }} value={one.x} onChange={e => upd({ x: +e.target.value })} /> Y <input type="number" style={{ width: 70 }} value={one.y} onChange={e => upd({ y: +e.target.value })} />
          <div><button className="del" onClick={() => { setAssets(assets.filter(a => a.id !== one.id)); setSel([]); }}>Delete</button></div></div> : <span className="mut">Select an asset. Shift-click for several; arrows nudge; Delete removes.</span>}</div>
      </div></div></div>);
}
