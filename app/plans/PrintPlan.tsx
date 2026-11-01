'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Logo } from '../Logo';
import { loadPlanMeta } from '@/lib/actions';

type Meta = { version: number; updatedAt: string | null; updatedBy: string; who: Record<string, string>; printedBy: string; now: string };
export const PALETTE = ['#e5352b', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#4d7c0f'];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'not saved yet');
const isScreen = (t: string) => /^(mon|monitor|bvm|pvm)/.test(t);

// Full-screen print preview of one wall's Monitor Plan on A4 landscape, with a source list, colour key and footer.
export default function PrintPlan({ Wall, wl, layouts, cur, job, onClose }: { Wall: any; wl: any; layouts: any[]; cur: any; job: { id: number; bc: string; prod: string; name: string; dates?: [string, string][]; load?: (wallId: number) => Promise<any> }; onClose: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(''), [scale, setScale] = useState(0.5), page = useRef<HTMLDivElement>(null), [canShare, setCanShare] = useState(false), [ready, setReady] = useState<{ url: string; name: string; file: File } | null>(null);
  useEffect(() => { (job.load ?? ((w: number) => loadPlanMeta(job.id, w)))(wl.id).then(setMeta).catch(() => setErr('Could not load the plan details.')); }, [job.id, wl.id]);
  useEffect(() => { const f = () => setScale(Math.max(0.2, Math.min((window.innerWidth - 16) / 794, (window.innerHeight - 70) / 1123))); f(); window.addEventListener('resize', f); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => { window.removeEventListener('resize', f); window.removeEventListener('keydown', k); }; }, [onClose]);
  useEffect(() => { try { setCanShare(!!navigator.canShare && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] })); } catch { setCanShare(false); } }, []);
  useEffect(() => { const b = document.body, o = b.style.overflow; b.style.overflow = 'hidden'; return () => { b.style.overflow = o; }; }, []);

  const who = meta?.who ?? {}, people = useMemo(() => Array.from(new Set(Object.values(who))).sort(), [who]), colors = useMemo(() => Object.fromEntries(people.map((n, i) => [n, PALETTE[i % PALETTE.length]])), [people]);
  const rowsOut = useMemo(() => (wl.assets ?? []).filter((a: any) => isScreen(a.type)).map((a: any) => {
    const opts = (Array.isArray(a.props?.mvs) ? a.props.mvs : []).map((id: number) => layouts.find(l => l.id === id)).filter(Boolean), lay = opts.find((l: any) => l.id === cur?.mons?.[a.id]) ?? opts[0];
    const picks = cur?.srcs?.[a.id] ?? {}, items = lay ? lay.tiles.filter((t: any) => picks[t.n]).map((t: any) => ({ n: t.n, src: picks[t.n], by: who[`s:${a.id}:${t.n}`] })) : [];
    return { id: a.id, name: a.name ?? 'Monitor', lay: lay?.name ?? '', items, by: who[`m:${a.id}`] };
  }).filter((r: any) => r.items.length > 0).sort((x: any, y: any) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true })), [wl, layouts, cur, who]);
  const total = rowsOut.reduce((n: number, r: any) => n + r.items.length, 0);

  async function pdf(share: boolean, portrait = false) {
    if (!page.current) return; setBusy(portrait ? 'print' : share ? 'share' : 'pdf');
    try { const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const el = page.current, opt = { pixelRatio: 2, width: 1123, height: 794, style: { transform: 'none', margin: '0' } };
      // Embedding web fonts can stall on phones, so give it a few seconds and then fall back to a render without it. Never hang.
      const tm = <T,>(p: Promise<T>, ms: number) => new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
      // Several attempts, because Safari often fails or returns a blank picture on the first try (a known quirk), and font embedding can stall.
      let png = '', last: any = null;
      // Safari refuses to draw a page that has text boxes nested inside its pictures (foreignObject), so later attempts leave those out.
      const noFO = (n: any) => !(n && n.tagName && String(n.tagName).toLowerCase() === 'foreignobject');
      for (const [o2, ms] of [[{}, 8000], [{ skipFonts: true }, 12000], [{ skipFonts: true, filter: noFO }, 12000], [{ skipFonts: true, filter: noFO }, 12000], [{ skipFonts: true, filter: noFO, pixelRatio: 1 }, 12000]] as [any, number][]) {
        try { const r = await tm(toPng(el, { ...opt, ...o2 }), ms); if (r.length > 5000) { png = r; break; } last = new Error('blank render'); } catch (e) { last = e; }
        await new Promise(r => setTimeout(r, 250)); }
      if (!png) throw last ?? new Error('render failed');
      let doc: any;
      if (portrait) { // turn the landscape sheet a quarter turn so it fills an upright A4 page
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = png; });
        const cv = document.createElement('canvas'); cv.width = img.height; cv.height = img.width; const cx = cv.getContext('2d')!; cx.translate(cv.width, 0); cx.rotate(Math.PI / 2); cx.drawImage(img, 0, 0);
        doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); doc.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      } else { doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); doc.addImage(png, 'PNG', 0, 0, 297, 210); }
      const name = `${job.prod} - ${wl.name} v${meta?.version ?? 0}.pdf`.replace(/[\\/:*?"<>|]/g, ' '), blob = doc.output('blob'), file = new File([blob], name, { type: 'application/pdf' });
      if (portrait) { setReady(r => { if (r) URL.revokeObjectURL(r.url); return { url: URL.createObjectURL(blob), name, file }; }); }
      else if (share && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch { /* cancelled */ } }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch (e: any) { setErr(`Could not make the PDF. Please try again. (${String(e?.message ?? e?.type ?? e).slice(0, 120)})`); } finally { setBusy(''); }
  }
  const ink = '#111827', mut = '#5b6472';
  const view = (<div className="pv-host" style={{ position: 'fixed', inset: 0, zIndex: 5000, background: '#2b3039', display: 'flex', flexDirection: 'column' }}>
    <style>{`@media print{@page{size:A4 portrait;margin:0}html,body{background:#fff!important;overflow:visible!important}body>*:not(.pv-host){display:none!important}.pv-host{position:static!important;background:#fff!important;display:block!important}.pv-bar{display:none!important}.pv-scroll{display:block!important;overflow:visible!important;padding:0!important}.pv-wrap{width:210mm!important;height:296mm!important;overflow:hidden!important;position:relative!important;page-break-inside:avoid;break-inside:avoid}.pv-page{position:absolute!important;top:0;left:0;transform-origin:top left!important;transform:translateX(210mm) rotate(90deg)!important;box-shadow:none!important;width:297mm!important;height:209mm!important}.pv-page,.pv-page *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
    <div className="pv-bar" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 10px', background: '#161a21', flex: '0 0 auto' }}>
      <b style={{ color: '#f4f5f8', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', fontSize: '.8rem' }}>Preview</b>
      <button type="button" onClick={() => window.print()} disabled={!meta}>🖨 Print</button>
      <button type="button" className="sec" style={{ color: '#f4f5f8' }} onClick={() => pdf(false)} disabled={!meta || !!busy}>{busy === 'pdf' ? 'Making PDF…' : '⬇ Save PDF'}</button>
      {canShare && <button type="button" className="sec" style={{ color: '#f4f5f8' }} onClick={() => pdf(true)} disabled={!meta || !!busy}>{busy === 'share' ? 'Making PDF…' : '↗ Share PDF'}</button>}
      <button type="button" className="sec" style={{ color: '#f4f5f8' }} onClick={onClose}>✕ Close</button></div>
    {ready && <div role="dialog" aria-label="PDF ready" style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', color: '#111827', borderRadius: 14, padding: 18, maxWidth: 340, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b style={{ fontSize: '1.05rem' }}>Your PDF is ready</b><span style={{ fontSize: '.85rem', color: '#5b6472' }}>A4, upright. Open it to print, or share it.</span>
        <a href={ready.url} target="_blank" rel="noopener" className="btn" style={{ display: 'block', textAlign: 'center', padding: '12px 14px', borderRadius: 10, background: '#0f131a', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>Open to print</a>
        {canShare && <button type="button" className="sec" onClick={async () => { try { await navigator.share({ files: [ready.file], title: ready.name }); } catch { /* cancelled */ } }}>Share / Save to Files</button>}
        <a href={ready.url} download={ready.name} style={{ textAlign: 'center', fontSize: '.85rem' }}>Download</a>
        <button type="button" className="sec" onClick={() => { URL.revokeObjectURL(ready.url); setReady(null); }}>Close</button></div></div>}
    {err && <div role="alert" style={{ color: '#ff8a80', padding: '6px 12px' }}>{err}</div>}
    <div className="pv-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 8 }}>
      <div className="pv-wrap" style={{ width: 794 * scale, height: 1123 * scale, flex: '0 0 auto', position: 'relative' }}>
        <div ref={page} className="pv-page" style={{ position: 'absolute', top: 0, left: 0, width: 1123, height: 794, transform: `scale(${scale}) translateX(794px) rotate(90deg)`, transformOrigin: 'top left', background: '#fff', color: ink, boxShadow: '0 10px 40px rgba(0,0,0,.5)', boxSizing: 'border-box', padding: '26px 30px 20px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: "'Space Grotesk Variable', system-ui, sans-serif", overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottom: '3px solid #e5352b', paddingBottom: 8 }}>
            <div><div style={{ fontSize: 12, color: mut }}>{job.bc} \ {job.prod}</div><div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 760 }}>{job.name} · {wl.name}</div>
              {!!job.dates?.length && <div style={{ fontSize: 11.5, color: mut, marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>{job.dates.map(([k, v]) => <span key={k}><b style={{ color: ink }}>{k}</b> {v}</span>)}</div>}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: ink }}><Logo size={26} /><div style={{ fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: mut, marginTop: 4 }}>Monitor plans for live production</div><div style={{ fontSize: 9.5, color: mut, marginTop: 1 }}>teleplanner.tv</div></div></div>
          <div style={{ flex: '1 1 0', minHeight: 300, position: 'relative', border: '1px solid #d5dae1', borderRadius: 6, overflow: 'hidden' }}>
            <Wall printView wl={wl} layouts={layouts} cur={cur} srcs={cur?.srcs} readOnly setMon={() => {}} who={who} colors={colors} /></div>
          {total > 0 && <div style={{ flex: '0 0 auto' }}><div style={{ fontSize: 11, fontWeight: 700, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '.05em', color: mut }}>Sources assigned ({total})</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rowsOut.length > 16 ? 6 : rowsOut.length > 8 ? 5 : 4}, minmax(0, 1fr))`, gap: '4px 14px', fontSize: total > 40 ? 8.5 : 9.5, lineHeight: 1.3, alignItems: 'start' }}>
              {rowsOut.map((r: any) => (<div key={r.id} style={{ minWidth: 0 }}><b>{r.name}</b>{r.lay ? <span style={{ color: mut }}> · {r.lay}</span> : null}
                {r.items.map((i: any) => <div key={i.n} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}><span style={{ width: 8, height: 8, flex: 'none', borderRadius: 2, background: i.by ? colors[i.by] : 'transparent', border: i.by ? 'none' : '1px solid #cbd2db', transform: 'translateY(1px)' }} /><span style={{ color: mut, width: 14 }}>{i.n}</span><span>{i.src}</span></div>)}</div>))}</div></div>}
          {total === 0 && <div style={{ fontSize: 11, color: mut }}>No sources have been assigned to this plan yet.</div>}
          <div style={{ flex: '0 0 auto', borderTop: '1px solid #d5dae1', paddingTop: 6, display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 1fr', gap: 14, fontSize: 9.5, color: mut, lineHeight: 1.4 }}>
            <div><div><b style={{ color: ink }}>Printed</b> {fmt(meta?.now ?? null)}</div><div><b style={{ color: ink }}>Printed by</b> {meta?.printedBy ?? ''}</div></div>
            <div><div><b style={{ color: ink }}>Last saved</b> {fmt(meta?.updatedAt ?? null)}{meta?.updatedBy ? ` by ${meta.updatedBy}` : ''}</div><div><b style={{ color: ink }}>Plan version</b> {meta ? `v${meta.version}` : ''}</div>
              {people.length > 0 && <div><b style={{ color: ink }}>Sources assigned by</b> {people.map(n => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }}><span style={{ width: 10, height: 7, border: `1.5px solid ${colors[n]}`, borderRadius: 1.5 }} />{n}</span>)}</div>}</div>
            <div>{people.length > 1 ? (<><b style={{ color: ink }}>Key</b> <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '2px 10px' }}>{people.map(n => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 8, border: `1.5px solid ${colors[n]}`, borderRadius: 2 }} />{n}</span>)}</span><div>Outline = tiles that person changed. Dashed outline = monitor layout changed.</div></>) : people.length === 1 ? <span>All changes made by {people[0]}.</span> : null}</div></div>
        </div></div></div></div>);
  return typeof document === 'undefined' ? null : createPortal(view, document.body);
}
