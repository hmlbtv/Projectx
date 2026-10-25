'use client';
import { useEffect, useRef, useState } from 'react';
import type { DAsset, PaletteItem } from './assets';

// The one editor used by every designer (Tile now; Wall and MV next) so they share layout, controls and keyboard actions.
export type Flag = { key: string; label: string; initial: boolean };
export type SaveArgs = { id: number | null; name: string; assets: DAsset[]; asNew: boolean; flags: Record<string, boolean> };
type Props = {
  kind: string; backHref: string; world: { w: number; h: number }; palette: PaletteItem[]; renderAsset: (a: DAsset) => React.ReactNode;
  id: number | null; initialName: string; initial: DAsset[]; onSave: (a: SaveArgs) => Promise<{ id?: number; error?: string }>;
  allowOverlap?: boolean; readOnly?: boolean; notice?: React.ReactNode; flags?: Flag[]; backdrop?: React.ReactNode;
};
const SNAP = 10, MIN = 20, HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
const hit = (a: DAsset, b: DAsset) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rid = () => Math.random().toString(36).slice(2, 8);

export default function Editor(p: Props) {
  const { world, palette, readOnly } = p;
  const [name, setName] = useState(p.initialName), [items, setItems] = useState<DAsset[]>(p.initial), [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState(''), [wid, setWid] = useState<number | null>(p.id), [lock, setLock] = useState(true), [dirty, setDirty] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>(Object.fromEntries((p.flags ?? []).map(f => [f.key, f.initial])));
  const hist = useRef<{ past: DAsset[][]; future: DAsset[][] }>({ past: [], future: [] }), [, bump] = useState(0);
  const stage = useRef<HTMLDivElement>(null), [cw, setCw] = useState(800), drag = useRef<any>(null);
  useEffect(() => { const el = stage.current; if (!el) return; const ro = new ResizeObserver(() => setCw(el.clientWidth || 800)); ro.observe(el); setCw(el.clientWidth || 800); return () => ro.disconnect(); }, []);
  const px = cw / world.w;

  const inside = (a: DAsset) => a.x >= 0 && a.y >= 0 && a.x + a.w <= world.w && a.y + a.h <= world.h && a.w >= MIN && a.h >= MIN;
  const free = (list: DAsset[], moved: DAsset[]) => moved.every(inside) && (p.allowOverlap || !moved.some(m => list.some(o => !moved.some(x => x.id === o.id) && hit(m, o))));
  const push = () => { hist.current.past.push(items); if (hist.current.past.length > 100) hist.current.past.shift(); hist.current.future = []; bump(n => n + 1); };
  const apply = (next: DAsset[], record = true) => { if (record) push(); setItems(next); setDirty(true); setMsg(''); };
  const undo = () => { const h = hist.current; const prev = h.past.pop(); if (!prev) return; h.future.push(items); setItems(prev); setSel(s => s.filter(i => prev.some(a => a.id === i))); setDirty(true); bump(n => n + 1); };
  const redo = () => { const h = hist.current; const nx = h.future.pop(); if (!nx) return; h.past.push(items); setItems(nx); setDirty(true); bump(n => n + 1); };

  function add(pi: PaletteItem) {
    if (readOnly) return;
    const w = Math.min(pi.w, world.w), h = Math.min(pi.h, world.h); let pos = { x: 0, y: 0 }, found = false;
    for (let y = 0; y <= world.h - h && !found; y += SNAP * 2) for (let x = 0; x <= world.w - w && !found; x += SNAP * 2) {
      const t: DAsset = { id: '', type: '', name: '', x, y, w, h }; if (!items.some(a => hit(t, a))) { pos = { x, y }; found = true; } }
    if (!found && !p.allowOverlap) { setMsg('No free space on the canvas.'); return; } // tiles may overlap, so fall back to the corner
    const a: DAsset = { id: rid(), type: pi.type, name: pi.label, ...pos, w, h, props: { ...pi.props } }; apply([...items, a]); setSel([a.id]);
  }
  const remove = () => { if (!sel.length) return; apply(items.filter(a => !sel.includes(a.id))); setSel([]); };
  const duplicate = () => { const S = items.filter(a => sel.includes(a.id)); if (!S.length) return;
    const copies = S.map(a => ({ ...a, id: rid(), x: Math.min(a.x + 20, world.w - a.w), y: Math.min(a.y + 20, world.h - a.h), props: { ...a.props } }));
    if (!free([...items, ...copies], copies)) { setMsg('No room for a copy there.'); return; } apply([...items, ...copies]); setSel(copies.map(c => c.id)); };

  // ---- pointer: move, and resize from a corner handle ----
  function startMove(e: React.PointerEvent, a: DAsset) {
    if (readOnly) return; e.stopPropagation(); stage.current?.setPointerCapture(e.pointerId);
    const ids = e.shiftKey ? Array.from(new Set([...sel, a.id])) : sel.includes(a.id) ? sel : [a.id];
    setSel(ids); drag.current = { mode: 'move', sx: e.clientX, sy: e.clientY, orig: items, ids, pushed: false };
  }
  function startResize(e: React.PointerEvent, a: DAsset, hd: string) {
    if (readOnly) return; e.stopPropagation(); stage.current?.setPointerCapture(e.pointerId);
    drag.current = { mode: 'resize', hd, sx: e.clientX, sy: e.clientY, orig: items, ids: [a.id], r0: { ...a }, pushed: false };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = Math.round((e.clientX - d.sx) / px / SNAP) * SNAP, dy = Math.round((e.clientY - d.sy) / px / SNAP) * SNAP; if (!dx && !dy && !d.pushed) return;
    let next: DAsset[];
    if (d.mode === 'move') next = d.orig.map((a: DAsset) => d.ids.includes(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a);
    else {
      const r = d.r0 as DAsset, hd = d.hd as string; let { x, y, w, h } = r;
      if (hd.includes('e')) w = r.w + dx; if (hd.includes('w')) w = r.w - dx; if (hd.includes('s')) h = r.h + dy; if (hd.includes('n')) h = r.h - dy;
      w = Math.max(MIN, w); h = Math.max(MIN, h);
      if (lock) { const ratio = r.w / r.h; if (Math.abs(w - r.w) * 1 >= Math.abs(h - r.h) * ratio) h = Math.round(w / ratio); else w = Math.round(h * ratio); }
      if (hd.includes('w')) x = r.x + r.w - w; if (hd.includes('n')) y = r.y + r.h - h;
      next = d.orig.map((a: DAsset) => a.id === r.id ? { ...a, x, y, w, h } : a);
    }
    const moved = next.filter(a => d.ids.includes(a.id));
    if (!free(next, moved)) return;
    if (!d.pushed) { hist.current.past.push(d.orig); hist.current.future = []; d.pushed = true; bump(n => n + 1); }
    setItems(next); setDirty(true);
  }
  function onKey(e: React.KeyboardEvent) {
    if (readOnly || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    const k = e.key, mod = e.metaKey || e.ctrlKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSel(items.map(a => a.id)); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(); return; }
    const step = e.shiftKey ? 1 : SNAP, d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as any)[k];
    if (d && sel.length) { e.preventDefault(); const next = items.map(a => sel.includes(a.id) ? { ...a, x: a.x + d[0], y: a.y + d[1] } : a); if (free(next, next.filter(a => sel.includes(a.id)))) apply(next); }
  }

  function align(kind: string) {
    const S = items.filter(a => sel.includes(a.id)); if (S.length < 2) { setMsg('Select two or more to arrange.'); return; }
    const minX = Math.min(...S.map(a => a.x)), maxR = Math.max(...S.map(a => a.x + a.w)), minY = Math.min(...S.map(a => a.y)), maxB = Math.max(...S.map(a => a.y + a.h));
    const next = items.map(a => ({ ...a })), T = next.filter(a => sel.includes(a.id));
    if (kind === 'top') T.forEach(a => a.y = minY); if (kind === 'left') T.forEach(a => a.x = minX); if (kind === 'right') T.forEach(a => a.x = maxR - a.w);
    if (kind === 'bottom') T.forEach(a => a.y = maxB - a.h);
    if (kind === 'middle') T.forEach(a => a.y = Math.round(((minY + maxB) / 2 - a.h / 2) / SNAP) * SNAP);
    if (kind === 'center') T.forEach(a => a.x = Math.round(((minX + maxR) / 2 - a.w / 2) / SNAP) * SNAP);
    if (kind === 'h' || kind === 'v') { if (T.length < 3) { setMsg('Select three or more to space evenly.'); return; }
      const hz = kind === 'h'; T.sort((a, b) => hz ? a.x - b.x : a.y - b.y);
      const total = hz ? maxR - minX : maxB - minY, used = T.reduce((s, a) => s + (hz ? a.w : a.h), 0), gap = (total - used) / (T.length - 1); let cur = hz ? minX : minY;
      T.forEach(a => { if (hz) { a.x = Math.round(cur); cur += a.w + gap; } else { a.y = Math.round(cur); cur += a.h + gap; } }); }
    if (free(next, T)) apply(next); else setMsg('That arrangement would not fit - not applied.');
  }

  const one = sel.length === 1 ? items.find(a => a.id === sel[0]) : undefined, def = one ? palette.find(x => x.type === one.type) : undefined;
  const edit = (patch: Partial<DAsset>, record = false) => { if (!one) return; const next = items.map(a => a.id === one.id ? { ...a, ...patch } : a); if (free(next, next.filter(a => a.id === one.id))) apply(next, record); };
  const editSize = (k: 'w' | 'h', v: number) => { if (!one || !(v >= MIN)) return; const r = one.w / one.h; edit(lock ? (k === 'w' ? { w: v, h: Math.round(v / r) } : { h: v, w: Math.round(v * r) }) : { [k]: v }); };
  const setProp = (key: string, v: any) => edit({ props: { ...one!.props, [key]: v } });

  async function save(asNew: boolean) {
    const nm = (asNew && name === p.initialName ? name + ' copy' : name).trim() || 'Untitled'; setName(nm); setMsg('Saving…');
    const r = await p.onSave({ id: wid, name: nm, assets: items, asNew, flags }); if (r.error) { setMsg(r.error); return; }
    if (r.id) { setWid(r.id); try { history.replaceState(null, '', `${p.backHref}?id=${r.id}`); } catch {} } setDirty(false); setMsg('Saved ✓');
  }
  const numIn = (label: string, v: number, on: (n: number) => void, step = SNAP) => (<label className="dz-num">{label}<input type="number" step={step} value={Math.round(v)} disabled={readOnly} onFocus={push} onChange={e => on(+e.target.value)} /></label>);

  return (<div className="dz">
    <div className="dz-bar">
      <a href={p.backHref} className="btn small" onClick={e => { if (dirty && !confirm('Leave without saving your changes?')) e.preventDefault(); }}>← All {p.kind}s</a>
      <input className="dz-name" value={name} disabled={readOnly} onChange={e => { setName(e.target.value); setDirty(true); }} aria-label={`${p.kind} name`} placeholder={`${p.kind} name`} />
      <button className="sec small" onClick={undo} disabled={readOnly || !hist.current.past.length} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button className="sec small" onClick={redo} disabled={readOnly || !hist.current.future.length} title="Redo (Ctrl+Y)">↷ Redo</button>
      {!readOnly && <><button className="small" onClick={() => save(false)}>Save</button><button className="sec small" onClick={() => save(true)} title="Save a new copy under this name">Save as new</button></>}
      {(p.flags ?? []).map(f => (<label key={f.key} className="dz-flag"><input type="checkbox" checked={!!flags[f.key]} disabled={readOnly} onChange={e => { setFlags({ ...flags, [f.key]: e.target.checked }); setDirty(true); }} /> {f.label}</label>))}
      <span className="mut" role="status">{msg || (dirty ? 'Unsaved changes' : '')}</span></div>
    {p.notice}
    <div className="dz-main">
      <div ref={stage} className="canvas dz-stage" tabIndex={0} onKeyDown={onKey} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onPointerDown={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg) setSel([]); }} style={{ height: cw * world.h / world.w }}>
        <div data-bg="1" style={{ position: 'absolute', inset: 0 }}>{p.backdrop}</div>
        {items.map(a => (<div key={a.id} className={'dzi' + (sel.includes(a.id) ? ' sel' : '')} onPointerDown={e => startMove(e, a)} title={a.name}
          style={{ left: a.x * px, top: a.y * px, width: a.w * px, height: a.h * px }}>{p.renderAsset(a)}
          {!readOnly && sel.length === 1 && sel[0] === a.id && HANDLES.map(h => <span key={h} className={'hdl ' + h} onPointerDown={e => startResize(e, a, h)} />)}</div>))}
      </div>
      <div className="dz-side">
        {!readOnly && <div className="card"><b>Add</b><div className="dz-pal">{palette.map(pi => <button key={pi.type} className="sec small" onClick={() => add(pi)}>+ {pi.label}</button>)}</div></div>}
        {!readOnly && <div className="card"><b>Arrange</b><div className="dz-pal">
          {[['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom'], ['h', 'Space H'], ['v', 'Space V']].map(([k, l]) => <button key={k} className="sec small" onClick={() => align(k)}>{l}</button>)}</div>
          <label className="dz-flag"><input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} /> Lock aspect ratio</label></div>}
        <div className="card"><b>Properties</b>
          {one ? (<div className="stack" style={{ marginTop: 8 }}>
            <label className="dz-num">Name<input value={one.name} disabled={readOnly} onFocus={push} onChange={e => edit({ name: e.target.value })} /></label>
            <div className="dz-grid">{numIn('X', one.x, v => edit({ x: v }))}{numIn('Y', one.y, v => edit({ y: v }))}{numIn('W', one.w, v => editSize('w', v))}{numIn('H', one.h, v => editSize('h', v))}</div>
            {def?.fields?.map(f => (<label key={f.key} className="dz-num">{f.label}
              {f.kind === 'select' ? <select disabled={readOnly} value={String(one.props?.[f.key] ?? '')} onChange={e => { push(); setProp(f.key, e.target.value); }}>{f.options!.map(o => <option key={o}>{o}</option>)}</select>
                : <input type={f.kind === 'number' ? 'number' : 'text'} min={f.min} max={f.max} disabled={readOnly} value={one.props?.[f.key] ?? ''} onFocus={push} onChange={e => setProp(f.key, f.kind === 'number' ? Math.min(Math.max(+e.target.value || 0, f.min ?? 0), f.max ?? 9999) : e.target.value.slice(0, 40))} />}</label>))}
            {!readOnly && <div className="dz-pal"><button className="sec small" onClick={duplicate}>Duplicate</button><button className="del small" onClick={remove}>Delete</button></div>}</div>)
            : sel.length > 1 ? <div className="stack" style={{ marginTop: 8 }}><span className="mut">{sel.length} selected</span>{!readOnly && <div className="dz-pal"><button className="sec small" onClick={duplicate}>Duplicate</button><button className="del small" onClick={remove}>Delete</button></div>}</div>
            : <p className="mut" style={{ margin: '8px 0 0' }}>{readOnly ? 'Select an item to see its properties.' : 'Click an item. Shift-click for several, drag to move, drag a corner to resize, arrows nudge (Shift = fine), Delete removes, Ctrl+Z undoes.'}</p>}
        </div>
      </div></div></div>);
}
