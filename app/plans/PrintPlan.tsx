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
export default function PrintPlan({ Wall, wl, layouts, cur, job, onClose }: { Wall: any; wl: any; layouts: any[]; cur: any; job: { id: number; bc: string; prod: string; name: string; dates?: [string, string][] }; onClose: () => void }) {
  const [meta, setMeta] = useState<Meta | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(''), [scale, setScale] = useState(0.5), page = useRef<HTMLDivElement>(null), [canShare, setCanShare] = useState(false);
  useEffect(() => { loadPlanMeta(job.id, wl.id).then(setMeta).catch(() => setErr('Could not load the plan details.')); }, [job.id, wl.id]);
  useEffect(() => { const f = () => setScale(Math.max(0.2, Math.min((window.innerWidth - 16) / 1123, (window.innerHeight - 80) / 794))); f(); window.addEventListener('resize', f); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => { window.removeEventListener('resize', f); window.removeEventListener('keydown', k); }; }, [onClose]);
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
    // Print opens the PDF in a new tab (the phone's own viewer has working print and share). The tab has to be opened now, inside the tap.
    const win = portrait ? window.open('', '_blank') : null;
    try { const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const el = page.current, opt = { pixelRatio: 2, width: 1123, height: 794, style: { transform: 'none', margin: '0' } };
      // Embedding web fonts can stall on phones, so give it a few seconds and then fall back to a render without it. Never hang.
      const tm = <T,>(p: Promise<T>, ms: number) => new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
      let png = ''; try { png = await tm(toPng(el, opt), 8000); } catch { png = await tm(toPng(el, { ...opt, skipFonts: true, pixelRatio: 1.5 }), 15000); }
      if (png.length < 5000) png = await tm(toPng(el, { ...opt, skipFonts: true, pixelRatio: 1.5 }), 15000); // Safari sometimes returns a blank first render
      let doc: any;
      if (portrait) { // turn the landscape sheet a quarter turn so it fills an upright A4 page
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = png; });
        const cv = document.createElement('canvas'); cv.width = img.height; cv.height = img.width; const cx = cv.getContext('2d')!; cx.translate(cv.width, 0); cx.rotate(Math.PI / 2); cx.drawImage(img, 0, 0);
        doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }); doc.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      } else { doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); doc.addImage(png, 'PNG', 0, 0, 297, 210); }
      const name = `${job.prod} - ${wl.name} v${meta?.version ?? 0}.pdf`.replace(/[\\/:*?"<>|]/g, ' '), blob = doc.output('blob'), file = new File([blob], name, { type: 'application/pdf' });
      if (portrait) { const u = URL.createObjectURL(blob); if (win) win.location.href = u; else window.location.href = u; }
      else if (share && navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); } catch { /* cancelled */ } }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    } catch { win?.close(); setErr('Could not make the PDF. Please try again.'); } finally { setBusy(''); }
  }
  const ink = '#111827', mut = '#5b6472';
  const view = (<div className="pv-host" style={{ position: 'fixed', inset: 0, zIndex: 5000, background: '#2b3039', display: 'flex', flexDirection: 'column' }}>
    <style>{`@media print{@page{size:A4 portrait;margin:0}html,body{background:#fff!important;overflow:visible!important}body>*:not(.pv-host){display:none!important}.pv-host{position:static!important;background:#fff!important;display:block!important}.pv-bar{display:none!important}.pv-scroll{display:block!important;overflow:visible!important;padding:0!important}.pv-wrap{width:210mm!important;height:297mm!important;position:relative!important;overflow:hidden!important;page-break-after:avoid}.pv-page{position:absolute!important;top:0;left:0;transform-origin:top left!important;transform:translateX(210mm) rotate(90deg)!important;box-shadow:none!important;width:297mm!important;height:210mm!important}.pv-page,.pv-page *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
    <div className="pv-bar" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: '#161a21', flex: '0 0 auto', flexWrap: 'wrap' }}>
      <b style={{ color: '#f4f5f8', flex: 1, minWidth: 120 }}>Print preview · A4 landscape</b>
      <button type="button" onClick={() => pdf(false, true)} disabled={!meta || !!busy}>{busy === 'print' ? 'Making PDF…' : '🖨 Print'}</button>
      <button type="button" className="sec" style={{ color: '#f4f5f8' }} onClick={() => pdf(false)} disabled={!meta || !!busy}>{busy === 'pdf' ? 'Making PDF…' : '⬇ Save PDF'}</button>
      {canShare && <button type="button" className="sec" style={{ color: '#f4f5f8' }} onClick={() => pdf(true)} disabled={!meta || !!busy}>{busy === 'share' ? 'Making PDF…' : '↗ Share PDF'}</button>}
      <button type="button" className="sec" style={{ color: '#f4f5f8' }} onClick={onClose}>✕ Close</button></div>
    {err && <div role="alert" style={{ color: '#ff8a80', padding: '6px 12px' }}>{err}</div>}
    <div className="pv-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 8 }}>
      <div className="pv-wrap" style={{ width: 1123 * scale, height: 794 * scale, flex: '0 0 auto' }}>
        <div ref={page} className="pv-page" style={{ width: 1123, height: 794, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#fff', color: ink, boxShadow: '0 10px 40px rgba(0,0,0,.5)', boxSizing: 'border-box', padding: '26px 30px 20px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: "'Space Grotesk Variable', system-ui, sans-serif", overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottom: '3px solid #e5352b', paddingBottom: 8 }}>
            <div><div style={{ fontSize: 12, color: mut }}>{job.bc} \ {job.prod}</div><div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{job.name} · {wl.name}</div>
              {!!job.dates?.length && <div style={{ fontSize: 11.5, color: mut, marginTop: 3, display: 'flex', gap: 14, flexWrap: 'wrap' }}>{job.dates.map(([k, v]) => <span key={k}><b style={{ color: ink }}>{k}</b> {v}</span>)}</div>}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', color: ink }}><Logo size={26} /><div style={{ fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: mut, marginTop: 4 }}>Monitor plans for live production</div><div style={{ fontSize: 9.5, color: mut, marginTop: 1 }}>teleplanner.tv</div></div></div>
          <div style={{ flex: 1, minHeight: 0, border: '1px solid #d5dae1', borderRadius: 6, overflow: 'hidden' }}>
            <Wall printView wl={wl} layouts={layouts} cur={cur} srcs={cur?.srcs} readOnly setMon={() => {}} who={who} colors={colors} /></div>
          {total > 0 && <div style={{ flex: '0 0 auto' }}><div style={{ fontSize: 11, fontWeight: 700, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '.05em', color: mut }}>Sources assigned ({total})</div>
            <div style={{ columnCount: rowsOut.length > 10 ? 4 : 3, columnGap: 18, fontSize: 9.5, lineHeight: 1.35 }}>
              {rowsOut.map((r: any) => (<div key={r.id} style={{ breakInside: 'avoid', marginBottom: 4 }}><b>{r.name}</b>{r.lay ? <span style={{ color: mut }}> · {r.lay}</span> : null}
                {r.items.map((i: any) => <div key={i.n} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}><span style={{ width: 8, height: 8, flex: 'none', borderRadius: 2, background: i.by ? colors[i.by] : 'transparent', border: i.by ? 'none' : '1px solid #cbd2db', transform: 'translateY(1px)' }} /><span style={{ color: mut, width: 14 }}>{i.n}</span><span>{i.src}</span></div>)}</div>))}</div></div>}
          {total === 0 && <div style={{ fontSize: 11, color: mut }}>No sources have been assigned to this plan yet.</div>}
          <div style={{ flex: '0 0 auto', borderTop: '1px solid #d5dae1', paddingTop: 6, display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 1fr', gap: 14, fontSize: 9.5, color: mut, lineHeight: 1.4 }}>
            <div><div><b style={{ color: ink }}>Printed</b> {fmt(meta?.now ?? null)}</div><div><b style={{ color: ink }}>Printed by</b> {meta?.printedBy ?? ''}</div></div>
            <div><div><b style={{ color: ink }}>Last saved</b> {fmt(meta?.updatedAt ?? null)}{meta?.updatedBy ? ` by ${meta.updatedBy}` : ''}</div><div><b style={{ color: ink }}>Plan version</b> {meta ? `v${meta.version}` : ''}</div>
              {people.length > 0 && <div><b style={{ color: ink }}>Sources assigned by</b> {people.join(', ')}</div>}</div>
            <div>{people.length > 1 ? (<><b style={{ color: ink }}>Key</b> <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '2px 10px' }}>{people.map(n => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 8, border: `2.5px solid ${colors[n]}`, borderRadius: 2 }} />{n}</span>)}</span><div>Outline = tiles that person changed. Dashed outline = monitor layout changed.</div></>) : people.length === 1 ? <span>All changes made by {people[0]}.</span> : null}</div></div>
        </div></div></div></div>);
  return typeof document === 'undefined' ? null : createPortal(view, document.body);
}
