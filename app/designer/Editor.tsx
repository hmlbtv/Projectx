'use client';
import { useEffect, useRef, useState } from 'react';
import type { DAsset, PaletteItem } from './assets';

// The one editor used by every designer (Tile now; Wall and MV next) so they share layout, controls and keyboard actions.
export type Flag = { key: string; label: string; initial: boolean };
export type SaveArgs = { id: number | null; name: string; assets: DAsset[]; asNew: boolean; flags: Record<string, boolean> };
type Props = {
  kind: string; backHref: string; world: { w: number; h: number }; palette: PaletteItem[]; renderAsset: (a: DAsset) => React.ReactNode;
  id: number | null; initialName: string; initial: DAsset[]; onSave: (a: SaveArgs) => Promise<{ id?: number; error?: string }>;
  canvasName?: string; fitSpace?: boolean; allowOverlap?: boolean; readOnly?: boolean; notice?: React.ReactNode; flags?: Flag[]; backdrop?: React.ReactNode;
};
const SNAP = 10, MIN = 20, HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
const hit = (a: DAsset, b: DAsset) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Shared by every designer on the page, so you can copy in one tile and paste into another.
let pasteN = 0;
const getClip = (): DAsset[] => { try { const v = JSON.parse(sessionStorage.getItem('dz-clip') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const setClip = (v: DAsset[]) => { try { sessionStorage.setItem('dz-clip', JSON.stringify(v)); } catch {} };
const Icon = ({ k }: { k: string }) => {
  const L = (d: string) => <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />;
  const R = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="1" fill="currentColor" />;
  const g: Record<string, any> = {
    left: <>{L('M3 2v16')}{R(5, 4, 11, 4)}{R(5, 12, 7, 4)}</>,
    right: <>{L('M17 2v16')}{R(4, 4, 11, 4)}{R(8, 12, 7, 4)}</>,
    top: <>{L('M2 3h16')}{R(4, 5, 4, 11)}{R(12, 5, 4, 7)}</>,
    bottom: <>{L('M2 17h16')}{R(4, 4, 4, 11)}{R(12, 8, 4, 7)}</>,
    center: <>{L('M10 2v16')}{R(4, 4, 12, 4)}{R(6, 12, 8, 4)}</>,
    middle: <>{L('M2 10h16')}{R(4, 4, 4, 12)}{R(12, 6, 4, 8)}</>,
    sph: <>{L('M2.5 3v14M17.5 3v14')}{R(6, 6, 3, 8)}{R(11, 6, 3, 8)}</>,
    spv: <>{L('M3 2.5h14M3 17.5h14')}{R(6, 6, 8, 3)}{R(6, 11, 8, 3)}</>,
    fit: <>{L('M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4')}{R(7, 7, 6, 6)}</>,
    tile: <><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />{R(7, 7, 6, 6)}</>,
  };
  return <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">{g[k]}</svg>;
};
const rid = () => Math.random().toString(36).slice(2, 8);

export default function Editor(p: Props) {
  const { world, palette, readOnly } = p;
  const [name, setName] = useState(p.initialName), [items, setItems] = useState<DAsset[]>(p.initial), [sel, setSel] = useState<string[]>([]);
  const [marq, setMarq] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const [snapOn, setSnapOn] = useState(true), [grid, setGrid] = useState(10), [showGrid, setShowGrid] = useState(true);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('dz-grid') || 'null'); if (v) { setSnapOn(!!v.snapOn); setGrid([10, 20, 50, 100].includes(v.grid) ? v.grid : 10); setShowGrid(!!v.showGrid); } } catch {} }, []);
  useEffect(() => { try { localStorage.setItem('dz-grid', JSON.stringify({ snapOn, grid, showGrid })); } catch {} }, [snapOn, grid, showGrid]);
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({ props: true, add: true, arrange: true, grid: false });
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem('dz-open') || 'null'); if (v) setOpenSec(o => ({ ...o, ...v })); } catch {} }, []);
  const toggleSec = (id: string, v: boolean) => setOpenSec(o => { if (o[id] === v) return o; const n = { ...o, [id]: v }; try { localStorage.setItem('dz-open', JSON.stringify(n)); } catch {} return n; });
  const g = snapOn ? grid : 1, sn = (v: number) => Math.round(v / g) * g;
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
  // Duplicates sit beside the original (to the right); duplicating again carries on in the same line, wrapping below if the row is full.
  const duplicate = () => { const S = items.filter(a => sel.includes(a.id)); if (!S.length) return;
    const bw = Math.max(...S.map(a => a.x + a.w)) - Math.min(...S.map(a => a.x)), bh = Math.max(...S.map(a => a.y + a.h)) - Math.min(...S.map(a => a.y)), gap = snapOn ? grid : 10;
    for (const [dx, dy] of [[bw + gap, 0], [0, bh + gap], [-(bw + gap), 0], [0, -(bh + gap)]]) {
      const copies = S.map(a => ({ ...a, id: rid(), x: a.x + dx, y: a.y + dy, props: { ...a.props } }));
      if (free([...items, ...copies], copies)) { apply([...items, ...copies]); setSel(copies.map(c => c.id)); return; }
    }
    setMsg('No room for a copy next to it.'); };

  function copy(cut = false) { const S = items.filter(a => sel.includes(a.id)); if (!S.length) return; setClip(S.map(a => ({ ...a, props: { ...a.props } }))); pasteN = 0; setMsg(`${S.length} copied`); if (cut) remove(); }
  function paste() {
    const clip = getClip(); if (readOnly || !clip.length) return; pasteN++;
    const bx = Math.min(...clip.map(a => a.x)), by = Math.min(...clip.map(a => a.y)), bw = Math.max(...clip.map(a => a.x + a.w)) - bx, bh = Math.max(...clip.map(a => a.y + a.h)) - by;
    if (bw > world.w || bh > world.h) { setMsg('That is too big for this canvas.'); return; }
    const nx = Math.min(Math.max(bx + 20 * pasteN, 0), world.w - bw), ny = Math.min(Math.max(by + 20 * pasteN, 0), world.h - bh);
    const copies = clip.filter(a => a && typeof a.x === 'number').map(a => ({ ...a, id: rid(), x: a.x - bx + nx, y: a.y - by + ny, props: { ...a.props } }));
    if (!free([...items, ...copies], copies)) { setMsg('No room to paste there - move things and try again.'); return; }
    apply([...items, ...copies]); setSel(copies.map(c => c.id)); setMsg(`${copies.length} pasted`);
  }

  // ---- pointer: move, and resize from a corner handle ----
  function startMove(e: React.PointerEvent, a: DAsset) {
    if (readOnly) return; e.stopPropagation(); stage.current?.setPointerCapture(e.pointerId);
    const ids = e.shiftKey ? Array.from(new Set([...sel, a.id])) : sel.includes(a.id) ? sel : [a.id];
    setSel(ids); drag.current = { mode: 'move', primary: a.id, sx: e.clientX, sy: e.clientY, orig: items, ids, pushed: false };
  }
  function startResize(e: React.PointerEvent, a: DAsset, hd: string) {
    if (readOnly) return; e.stopPropagation(); stage.current?.setPointerCapture(e.pointerId);
    drag.current = { mode: 'resize', hd, sx: e.clientX, sy: e.clientY, orig: items, ids: [a.id], r0: { ...a }, pushed: false };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    if (d.mode === 'marquee') { const r = stage.current!.getBoundingClientRect(); setMarq(m => m && { ...m, x1: (e.clientX - r.left) / px, y1: (e.clientY - r.top) / px }); return; }
    const rx = (e.clientX - d.sx) / px, ry = (e.clientY - d.sy) / px; let next: DAsset[];
    if (d.mode === 'move') {
      const prim = d.orig.find((a: DAsset) => a.id === d.primary) ?? d.orig.find((a: DAsset) => d.ids.includes(a.id)); // the grabbed item lands on the grid; the rest keep their offsets
      const dx = sn(prim.x + rx) - prim.x, dy = sn(prim.y + ry) - prim.y;
      next = d.orig.map((a: DAsset) => d.ids.includes(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a);
    } else {
      const r = d.r0 as DAsset, hd = d.hd as string; let l = r.x, tp = r.y, rt = r.x + r.w, bt = r.y + r.h;
      if (hd.includes('e')) rt = sn(rt + rx); if (hd.includes('w')) l = sn(l + rx); if (hd.includes('s')) bt = sn(bt + ry); if (hd.includes('n')) tp = sn(tp + ry);
      let w = Math.max(MIN, rt - l), h = Math.max(MIN, bt - tp);
      if (lock) { const ratio = r.w / r.h; if (Math.abs(w - r.w) >= Math.abs(h - r.h) * ratio) h = Math.round(w / ratio); else w = Math.round(h * ratio); }
      const x = hd.includes('w') ? r.x + r.w - w : r.x, y = hd.includes('n') ? r.y + r.h - h : r.y;
      next = d.orig.map((a: DAsset) => a.id === r.id ? { ...a, x, y, w, h } : a);
    }
    const moved = next.filter(a => d.ids.includes(a.id));
    if (!d.pushed && moved.every(m => { const o = d.orig.find((a: DAsset) => a.id === m.id); return o && o.x === m.x && o.y === m.y && o.w === m.w && o.h === m.h; })) return;
    if (!free(next, moved)) return;
    if (!d.pushed) { hist.current.past.push(d.orig); hist.current.future = []; d.pushed = true; bump(n => n + 1); }
    setItems(next); setDirty(true);
  }
  // Drag a box on empty canvas: left-to-right selects anything the box touches; right-to-left only what is completely inside it.
  function endDrag() {
    const d = drag.current; drag.current = null;
    if (d?.mode !== 'marquee') return;
    if (marq) {
      const x = Math.min(marq.x0, marq.x1), y = Math.min(marq.y0, marq.y1), w = Math.abs(marq.x1 - marq.x0), h = Math.abs(marq.y1 - marq.y0), touch = marq.x1 >= marq.x0;
      if (w * px >= 4 || h * px >= 4) {
        const ids = items.filter(a => touch ? a.x < x + w && a.x + a.w > x && a.y < y + h && a.y + a.h > y : a.x >= x && a.y >= y && a.x + a.w <= x + w && a.y + a.h <= y + h).map(a => a.id);
        setSel(Array.from(new Set([...d.base, ...ids])));
      }
    }
    setMarq(null);
  }
  function onKey(e: React.KeyboardEvent) {
    if (readOnly || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    const k = e.key, mod = e.metaKey || e.ctrlKey;
    if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k.toLowerCase() === 'c') { e.preventDefault(); copy(); return; }
    if (mod && k.toLowerCase() === 'x') { e.preventDefault(); copy(true); return; }
    if (mod && k.toLowerCase() === 'v') { e.preventDefault(); paste(); return; }
    if (mod && k.toLowerCase() === 'a') { e.preventDefault(); setSel(items.map(a => a.id)); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(); return; }
    const step = e.shiftKey ? 1 : snapOn ? grid : SNAP, d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as any)[k];
    if (d && sel.length) { e.preventDefault(); const next = items.map(a => sel.includes(a.id) ? { ...a, x: a.x + d[0], y: a.y + d[1] } : a); if (free(next, next.filter(a => sel.includes(a.id)))) apply(next); }
  }

  function align(kind: string) {
    const S = items.filter(a => sel.includes(a.id));
    if (kind === 'tile') { // centre the selection, as a group, on the canvas itself
      if (!S.length) { setMsg('Select something first.'); return; }
      const gx = Math.min(...S.map(a => a.x)), gy = Math.min(...S.map(a => a.y)), gw = Math.max(...S.map(a => a.x + a.w)) - gx, gh = Math.max(...S.map(a => a.y + a.h)) - gy;
      const dx = Math.round((world.w - gw) / 2 - gx), dy = Math.round((world.h - gh) / 2 - gy), next = items.map(a => sel.includes(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a);
      if (free(next, next.filter(a => sel.includes(a.id)))) apply(next); else setMsg('That would not fit - not applied.'); return;
    }
    if (S.length < 2) { setMsg('Select two or more to arrange.'); return; }
    const minX = Math.min(...S.map(a => a.x)), maxR = Math.max(...S.map(a => a.x + a.w)), minY = Math.min(...S.map(a => a.y)), maxB = Math.max(...S.map(a => a.y + a.h));
    // T is in the order the assets were selected: the first one selected is the reference for aligning, and sets the order for spacing.
    const next = items.map(a => ({ ...a })), T = sel.map(id => next.find(a => a.id === id)).filter(Boolean) as DAsset[], r = { ...T[0] };
    if (kind === 'top') T.forEach(a => a.y = r.y); if (kind === 'bottom') T.forEach(a => a.y = r.y + r.h - a.h);
    if (kind === 'left') T.forEach(a => a.x = r.x); if (kind === 'right') T.forEach(a => a.x = r.x + r.w - a.w);
    if (kind === 'middle') T.forEach(a => a.y = Math.round(r.y + r.h / 2 - a.h / 2));
    if (kind === 'center') T.forEach(a => a.x = Math.round(r.x + r.w / 2 - a.w / 2));
    if (kind === 'h' || kind === 'v') {
      // Placed in selection order, spread evenly between the outer edges. If the assets are stacked or overlapping in that direction, they are laid out side by side instead, one grid gap apart.
      const hz = kind === 'h';
      const lo = hz ? minX : minY, span = hz ? maxR - minX : maxB - minY, used = T.reduce((s, a) => s + (hz ? a.w : a.h), 0), room = hz ? world.w : world.h, n = T.length;
      let gap = (span - used) / (n - 1), cur = lo;
      if (gap < 0) {
        gap = snapOn ? grid : 10; if (used + gap * (n - 1) > room) gap = (room - used) / (n - 1);
        if (gap < 0) { setMsg('They are too big to sit side by side on this canvas.'); return; }
        cur = Math.max(0, Math.min(lo, room - used - gap * (n - 1)));
      }
      T.forEach(a => { if (hz) { a.x = Math.round(cur); cur += a.w + gap; } else { a.y = Math.round(cur); cur += a.h + gap; } });
    }
    if (free(next, T)) apply(next); else setMsg('That arrangement would not fit - not applied.');
  }

  const one = sel.length === 1 ? items.find(a => a.id === sel[0]) : undefined, def = one ? palette.find(x => x.type === one.type) : undefined;
  const edit = (patch: Partial<DAsset>, record = false) => { if (!one) return; const next = items.map(a => a.id === one.id ? { ...a, ...patch } : a); if (free(next, next.filter(a => a.id === one.id))) apply(next, record); };
  const editSize = (k: 'w' | 'h', v: number) => { if (!one || !(v >= MIN)) return; const r = one.w / one.h; edit(lock ? (k === 'w' ? { w: v, h: Math.round(v / r) } : { h: v, w: Math.round(v * r) }) : { [k]: v }); };
  const setProp = (key: string, v: any) => {
    if (!one) return; const f = def?.fields?.find(x => x.key === key);
    if (f?.rotates && one.props?.[key] !== v) { // turn the box on its side around its centre, so it can then be stretched the other way
      const w = Math.min(one.h, world.w), h = Math.min(one.w, world.h), x = Math.min(Math.max(Math.round(one.x + one.w / 2 - w / 2), 0), world.w - w), y = Math.min(Math.max(Math.round(one.y + one.h / 2 - h / 2), 0), world.h - h);
      edit({ props: { ...one.props, [key]: v }, w, h, x, y }); return;
    }
    edit({ props: { ...one.props, [key]: v } });
  };

  // Grow the selected item into the largest free space around it, keeping 16:9.
  function fitToSpace() {
    if (sel.length !== 1) { setMsg('Select one to fit it to the space.'); return; }
    const a = items.find(i => i.id === sel[0]); if (!a) return; const others = items.filter(i => i.id !== a.id);
    const xs = [0, world.w, ...others.flatMap(o => [o.x, o.x + o.w])], ys = [0, world.h, ...others.flatMap(o => [o.y, o.y + o.h])];
    let best: { s: number; l: number; r: number; tp: number; b: number } | null = null;
    for (const l of xs) for (const r of xs) {
      if (l > a.x || r < a.x + a.w) continue;
      const inX = others.filter(o => o.x < r && o.x + o.w > l);
      if (inX.some(o => o.y < a.y + a.h && o.y + o.h > a.y)) continue;
      const tp = Math.max(0, ...inX.filter(o => o.y + o.h <= a.y).map(o => o.y + o.h)), b = Math.min(world.h, ...inX.filter(o => o.y >= a.y + a.h).map(o => o.y));
      const s = Math.min((r - l) / 16, (b - tp) / 9); if (!best || s > best.s) best = { s, l, r, tp, b };
    }
    if (!best || best.s * 16 < a.w - 0.5 && best.s * 9 < a.h - 0.5) { setMsg('No room to grow.'); return; }
    const w = Math.floor(best.s * 16), h = Math.round(w * 9 / 16);
    const x = Math.round(Math.min(Math.max(a.x + a.w / 2 - w / 2, best.l), best.r - w)), y = Math.round(Math.min(Math.max(a.y + a.h / 2 - h / 2, best.tp), best.b - h));
    if (w === a.w && h === a.h && x === a.x && y === a.y) { setMsg('Already fills the space.'); return; }
    apply(items.map(i => i.id === a.id ? { ...i, x, y, w, h } : i));
  }

  async function save(asNew: boolean) {
    const nm = (asNew && name === p.initialName ? name + ' copy' : name).trim() || 'Untitled'; setName(nm); setMsg('Saving…');
    const r = await p.onSave({ id: wid, name: nm, assets: items, asNew, flags }); if (r.error) { setMsg(r.error); return; }
    if (r.id) { setWid(r.id); try { history.replaceState(null, '', `${p.backHref}?id=${r.id}`); } catch {} } setDirty(false); setMsg('Saved ✓');
  }
  const numIn = (label: string, v: number, on: (n: number) => void) => (<label className="dz-row"><span>{label}</span><input type="number" step={snapOn ? grid : 1} value={Math.round(v)} disabled={readOnly} onFocus={push} onChange={e => on(+e.target.value)} /></label>);

  return (<div className="dz">
    <div className="dz-bar">
      <a href={p.backHref} className="btn small" onClick={e => { if (dirty && !confirm('Leave without saving your changes?')) e.preventDefault(); }}>← All {p.kind}s</a>
      <input className="dz-name" value={name} disabled={readOnly} onChange={e => { setName(e.target.value); setDirty(true); }} aria-label={`${p.kind} name`} placeholder={`${p.kind} name`} />
      <button className="sec small" onClick={undo} disabled={readOnly || !hist.current.past.length} title="Undo (Ctrl+Z)">↶ Undo</button>
      <button className="sec small" onClick={redo} disabled={readOnly || !hist.current.future.length} title="Redo (Ctrl+Y)">↷ Redo</button>
      {!readOnly && <><button className="small" onClick={() => save(false)}>Save</button><button className="sec small" onClick={() => save(true)} title="Save a new copy under this name">Save as new</button></>}
      {(p.flags ?? []).map(f => (<label key={f.key} className="dz-flag"><input type="checkbox" checked={!!flags[f.key]} disabled={readOnly} onChange={e => { setFlags({ ...flags, [f.key]: e.target.checked }); setDirty(true); }} /> {f.label}</label>))}
    </div>
    <div className="dz-status mut" role="status">{msg || (dirty ? 'Unsaved changes' : '')}</div>
    {p.notice}
    <div className="dz-main">
      <div ref={stage} className="canvas dz-stage" tabIndex={0} onKeyDown={onKey} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}
        onPointerDown={e => {
          if (!(e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg)) return;
          if (readOnly) { setSel([]); return; }
          const r = stage.current!.getBoundingClientRect(), x = (e.clientX - r.left) / px, y = (e.clientY - r.top) / px;
          stage.current!.setPointerCapture(e.pointerId); drag.current = { mode: 'marquee', base: e.shiftKey ? sel : [] }; if (!e.shiftKey) setSel([]); setMarq({ x0: x, y0: y, x1: x, y1: y });
        }} style={{ height: cw * world.h / world.w }}>
        <div data-bg="1" style={{ position: 'absolute', inset: 0 }}>{p.backdrop}</div>
        {showGrid && grid * px >= 4 && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(to right,#ffffff1c 1px,transparent 1px),linear-gradient(to bottom,#ffffff1c 1px,transparent 1px)', backgroundSize: `${grid * px}px ${grid * px}px` }} />}
        {marq && <div className={'dz-marq' + (marq.x1 >= marq.x0 ? '' : ' win')} style={{ left: Math.min(marq.x0, marq.x1) * px, top: Math.min(marq.y0, marq.y1) * px, width: Math.abs(marq.x1 - marq.x0) * px, height: Math.abs(marq.y1 - marq.y0) * px }} />}
        {items.map(a => (<div key={a.id} className={'dzi' + (a.type === 'tally' && a.props?.style === 'border' ? ' ring' : '') + (sel.includes(a.id) ? ' sel' : '')} onPointerDown={e => startMove(e, a)} title={a.name}
          style={{ left: a.x * px, top: a.y * px, width: a.w * px, height: a.h * px }}>{p.renderAsset(a)}
          {sel.length > 1 && sel.includes(a.id) && <span className="dz-ord">{sel.indexOf(a.id) + 1}</span>}
          {!readOnly && sel.length === 1 && sel[0] === a.id && HANDLES.map(h => <span key={h} className={'hdl ' + h} onPointerDown={e => startResize(e, a, h)} />)}</div>))}
      </div>
      <div className="dz-side dz-panel">
        <Sec id="props" title="Properties" badge={one ? <span className="tag">{def?.label ?? one.type}</span> : sel.length > 1 ? <span className="tag">{sel.length} selected</span> : undefined} open={openSec.props} toggle={toggleSec}>
          {one ? (<>
            <div className="dz-grp">General</div>
            <label className="dz-row"><span>Name</span><input value={one.name} disabled={readOnly} onFocus={push} onChange={e => edit({ name: e.target.value })} /></label>
            <div className="dz-row"><span>Type</span><em>{def?.label ?? one.type}</em></div>
            <div className="dz-grp">Position &amp; size</div>
            <div className="dz-two">{numIn('X', one.x, v => edit({ x: v }))}{numIn('Y', one.y, v => edit({ y: v }))}{numIn('W', one.w, v => editSize('w', v))}{numIn('H', one.h, v => editSize('h', v))}</div>
            {!readOnly && <label className="dz-row dz-chk"><span>Lock aspect</span><input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} /></label>}
            {def?.fields && def.fields.length > 0 && <div className="dz-grp">{def.label} settings</div>}
            {def?.fields?.map(f => (<label key={f.key} className="dz-row"><span>{f.label}</span>
              {f.kind === 'select' ? <select disabled={readOnly} value={String(one.props?.[f.key] ?? '')} onChange={e => { push(); setProp(f.key, e.target.value); }}>{f.options!.map(o => <option key={o}>{o}</option>)}</select>
                : <input type={f.kind === 'number' ? 'number' : 'text'} min={f.min} max={f.max} disabled={readOnly} value={one.props?.[f.key] ?? ''} onFocus={push} onChange={e => setProp(f.key, f.kind === 'number' ? Math.min(Math.max(+e.target.value || 0, f.min ?? 0), f.max ?? 9999) : e.target.value.slice(0, 40))} />}</label>))}
            {!readOnly && <div className="dz-pal"><button className="sec small" onClick={duplicate}>Duplicate</button><button className="sec small" onClick={() => copy()}>Copy</button><button className="del small" onClick={remove}>Delete</button></div>}</>)
          : sel.length > 1 ? (<>
            <div className="dz-grp">Selection order</div>
            <ol className="dz-order">{sel.map(id => items.find(a => a.id === id)).filter(Boolean).map(a => <li key={a!.id}>{a!.name}</li>)}</ol>
            <p className="mut dz-help">The first one is the reference for Arrange; Space H and V follow this order.</p>
            {!readOnly && <div className="dz-pal"><button className="sec small" onClick={duplicate}>Duplicate</button><button className="sec small" onClick={() => copy()}>Copy</button><button className="del small" onClick={remove}>Delete</button></div>}</>)
          : (<>
            <div className="dz-grp">{p.kind}</div>
            <div className="dz-row"><span>Canvas</span><em>{world.w} × {world.h}</em></div>
            <div className="dz-row"><span>Assets</span><em>{items.length}</em></div>
            <p className="mut dz-help">{readOnly ? 'Select an item to see its properties.' : 'Click an item to edit it. Drag on empty canvas to select several (left to right touches, right to left encloses). Shift-click adds. Drag a corner to resize; arrows nudge (Shift = fine). Ctrl+C / V / D copy, paste, duplicate; Ctrl+Z undoes.'}</p></>)}
        </Sec>
        {!readOnly && <Sec id="add" title="Add" open={openSec.add} toggle={toggleSec}>
          <div className="dz-pal">{palette.map(pi => <button key={pi.type} className="sec small" onClick={() => add(pi)}>+ {pi.label}</button>)}</div>
          <div className="dz-pal"><button className="sec small" onClick={() => copy()} disabled={!sel.length} title="Copy (Ctrl+C)">Copy</button><button className="sec small" onClick={paste} title="Paste (Ctrl+V)">Paste</button></div></Sec>}
        {!readOnly && <Sec id="arrange" title="Arrange" open={openSec.arrange} toggle={toggleSec}>
          <div className="dz-grp">Align to the first selected</div>
          <div className="dz-ic">{([['left', 'Align left edges'], ['center', 'Centre horizontally (a vertical column)'], ['right', 'Align right edges'], ['top', 'Align top edges'], ['middle', 'Centre vertically (a horizontal row)'], ['bottom', 'Align bottom edges']] as const).map(([k, tip]) => <button key={k} className="sec small" title={tip} aria-label={tip} onClick={() => align(k)}><Icon k={k} /></button>)}</div>
          <div className="dz-grp">Space in selection order</div>
          <div className="dz-ic">{([['h', 'Space horizontally (left to right)'], ['v', 'Space vertically (top to bottom)']] as const).map(([k, tip]) => <button key={k} className="sec small" title={tip} aria-label={tip} onClick={() => align(k)}><Icon k={'sp' + k} /></button>)}</div>
          <div className="dz-grp">On the {p.canvasName ?? 'canvas'}</div>
          <div className="dz-ic"><button className="sec small" title={`Centre the selection on the ${p.canvasName ?? 'canvas'}`} aria-label={`Centre on ${p.canvasName ?? 'canvas'}`} onClick={() => align('tile')}><Icon k="tile" /></button>{p.fitSpace && <button className="sec small" title="Fit to space: grow the selected one into the free space around it, keeping 16:9" aria-label="Fit to space" onClick={fitToSpace}><Icon k="fit" /></button>}</div>
          <p className="mut dz-help">Select two or more to align or space. The first selected is the reference, and spacing follows the order selected.</p></Sec>}
        {!readOnly && <Sec id="grid" title="Grid" badge={<span className="tag">{snapOn ? `snap ${grid}` : 'snap off'}</span>} open={openSec.grid} toggle={toggleSec}>
          <label className="dz-row dz-chk"><span>Snap to grid</span><input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} /></label>
          <label className="dz-row dz-chk"><span>Show grid</span><input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} /></label>
          <label className="dz-row"><span>Grid size</span><select value={grid} onChange={e => setGrid(+e.target.value)}>{[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select></label></Sec>}
      </div></div></div>);
}

function Sec({ id, title, badge, open, toggle, children }: { id: string; title: string; badge?: React.ReactNode; open: boolean; toggle: (id: string, v: boolean) => void; children: React.ReactNode }) {
  return (<details className={'dz-sec dzs-' + id} open={open} onToggle={e => toggle(id, (e.currentTarget as HTMLDetailsElement).open)}><summary><span>{title}</span>{badge}</summary><div className="dz-secbody">{children}</div></details>);
}
