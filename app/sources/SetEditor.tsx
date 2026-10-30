'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSourceSetData } from '@/lib/actions';

type Set_ = { id: number; name: string; sources: string[]; categories: Record<string, string>; cat_names: string[]; jobs: number };
const OTHER = '';
const lc = (s: string) => s.toLowerCase();
// A Source Set opened up: categories on the left, the sources of the chosen category on the right.
export default function SetEditor({ set }: { set: Set_ }) {
  const ref = useRef<HTMLDialogElement>(null), router = useRouter();
  const [name, setName] = useState(set.name), [names, setNames] = useState<string[]>(set.sources), [cats, setCats] = useState<Record<string, string>>(set.categories ?? {}),
    [extra, setExtra] = useState<string[]>(set.cat_names ?? []), [sel, setSel] = useState<string>(''), [dirty, setDirty] = useState(false), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState(''), [newSrc, setNewSrc] = useState(''), [base, setBase] = useState(''), [count, setCount] = useState(8), [start, setStart] = useState(1), [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState(''), [renCat, setRenCat] = useState(false), [catDraft, setCatDraft] = useState(''), [confirmDel, setConfirmDel] = useState(false);
  const catList = Array.from(new Set([...extra, ...Object.values(cats)])).sort((a, b) => a.localeCompare(b));
  const hasOther = names.some(n => !cats[n]);
  const shown = names.filter(n => (cats[n] ?? OTHER) === sel);
  const touch = () => { setDirty(true); setMsg(''); };
  const open = () => { setName(set.name); setNames(set.sources); setCats(set.categories ?? {}); setExtra(set.cat_names ?? []); setSel(''); setDirty(false); setMsg(''); ref.current?.showModal(); if (!(set.cat_names ?? []).length && !Object.keys(set.categories ?? {}).length) setSel(OTHER); else setSel(Array.from(new Set([...(set.cat_names ?? []), ...Object.values(set.categories ?? {})])).sort((a, b) => a.localeCompare(b))[0] ?? OTHER); };
  const close = () => { if (dirty && !confirm('Close without saving your changes?')) return; ref.current?.close(); };
  function addCat() { const c = newCat.trim().slice(0, 60); if (!c) return; const ex = catList.find(x => lc(x) === lc(c)); if (!ex) { setExtra([...extra, c]); touch(); } setSel(ex ?? c); setNewCat(''); }
  function renameCat() { const c = catDraft.trim().slice(0, 60); setRenCat(false); if (!c || c === sel) return; if (catList.some(x => lc(x) === lc(c) && x !== sel)) { setMsg(`There is already a category called ${c}.`); return; }
    setExtra(extra.map(x => (x === sel ? c : x))); const n: Record<string, string> = {}; for (const [k, v] of Object.entries(cats)) n[k] = v === sel ? c : v; setCats(n); setSel(c); touch(); }
  function deleteCat() { setConfirmDel(false); setExtra(extra.filter(x => x !== sel)); const n: Record<string, string> = {}; for (const [k, v] of Object.entries(cats)) if (v !== sel) n[k] = v; setCats(n); setSel(OTHER); touch(); }
  function add(list: string[]) { const have = new Set(names.map(lc)), fresh: string[] = []; for (const x of list.map(v => v.trim().slice(0, 120))) if (x && !have.has(lc(x))) { have.add(lc(x)); fresh.push(x); }
    if (!fresh.length) { setMsg('Those sources are already in this set.'); return; } setNames([...names, ...fresh]); if (sel) setCats({ ...cats, ...Object.fromEntries(fresh.map(f => [f, sel])) }); touch(); }
  function rename(old: string) { const v = draft.trim().slice(0, 120); setEditing(null); if (!v || v === old) return; if (names.some(x => lc(x) === lc(v) && x !== old)) { setMsg(`${v} already exists.`); return; }
    setNames(names.map(x => (x === old ? v : x))); const n = { ...cats }; if (n[old]) { n[v] = n[old]; delete n[old]; } setCats(n); touch(); }
  function del(old: string) { setNames(names.filter(x => x !== old)); const n = { ...cats }; delete n[old]; setCats(n); touch(); }
  async function save() { setBusy(true); const r: any = await saveSourceSetData(set.id, name, names, cats, extra); setBusy(false); if (r?.error) { setMsg(r.error); return; } setDirty(false); setMsg('Saved.'); router.refresh(); }
  const bulk = Math.max(1, Math.min(200, Math.floor(count) || 1)), st = Math.floor(start) || 0, b = base.trim();
  const catBtn = (c: string, label: string) => { const n = names.filter(x => (cats[x] ?? OTHER) === c).length; return (<button key={'c' + c} type="button" className={sel === c ? '' : 'sec'} onClick={() => { setSel(c); setRenCat(false); setConfirmDel(false); setEditing(null); }} style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%' }}><span>{label}</span><span style={{ opacity: .7 }}>{n}</span></button>); };
  return (<>
    <button type="button" className="tilelink" style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 4, width: '100%' }} onClick={open} aria-label={`Open ${set.name}`}>
      <b>{set.name}</b><span className="mut">{set.sources.length} sources{catList.length ? ` in ${catList.length} categor${catList.length === 1 ? 'y' : 'ies'}` : ''} · used by {set.jobs} Job{set.jobs === 1 ? '' : 's'}</span>
      <span className="mut" style={{ fontSize: '.85rem' }}>{set.sources.slice(0, 4).join(', ')}{set.sources.length > 4 ? '…' : ''}</span></button>
    <dialog ref={ref} className="dlg" style={{ width: 'min(900px, 96vw)' }} onClick={e => { if (e.target === ref.current) close(); }}>
      <div className="stack">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input value={name} onChange={e => { setName(e.target.value); touch(); }} aria-label="Source Set name" style={{ flex: 1, fontWeight: 700, fontSize: '1.1rem' }} />
          <button disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="sec" onClick={close}>Close</button></div>
        {msg && <div role="status" style={{ color: msg === 'Saved.' ? 'var(--ok, #1fb865)' : 'var(--bad)' }}>{msg}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) 2fr', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <b>Categories</b>
            {catList.map(c => catBtn(c, c))}{hasOther && catBtn(OTHER, 'Other')}{!hasOther && sel === OTHER && catBtn(OTHER, 'Other')}
            <div style={{ display: 'flex', gap: 6 }}><input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} style={{ minWidth: 0, flex: 1 }} /><button type="button" className="sec" onClick={addCat}>+</button></div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ flex: 1 }}>{sel === OTHER ? 'Other (no category)' : renCat ? '' : sel}</b>
              {sel !== OTHER && !renCat && !confirmDel && <><button type="button" className="sec small" onClick={() => { setCatDraft(sel); setRenCat(true); }}>Rename category</button><button type="button" className="del small" onClick={() => setConfirmDel(true)}>Delete category</button></>}
              {renCat && <><input value={catDraft} onChange={e => setCatDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); renameCat(); } }} autoFocus style={{ flex: 1 }} /><button type="button" className="small" onClick={renameCat}>OK</button><button type="button" className="sec small" onClick={() => setRenCat(false)}>Cancel</button></>}
              {confirmDel && <><span className="mut">Delete {sel}? Its sources move to Other.</span><button type="button" className="del small" onClick={deleteCat}>Yes, delete</button><button type="button" className="sec small" onClick={() => setConfirmDel(false)}>Cancel</button></>}</div>
            {shown.length === 0 && <div className="mut">No sources here yet.</div>}
            {shown.map(n => (<div key={n} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {editing === n ? <><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); rename(n); } if (e.key === 'Escape') setEditing(null); }} autoFocus style={{ flex: 1, minWidth: 0 }} /><button type="button" className="small" onClick={() => rename(n)}>OK</button></>
                : <><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span><button type="button" className="sec small" onClick={() => { setEditing(n); setDraft(n); }}>Rename</button><button type="button" className="del small" aria-label={`Delete ${n}`} onClick={() => del(n)}>✕</button></>}</div>))}
            <div style={{ display: 'flex', gap: 6 }}><input value={newSrc} onChange={e => setNewSrc(e.target.value)} placeholder="Add a source" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add([newSrc]); setNewSrc(''); } }} style={{ minWidth: 0, flex: 1 }} /><button type="button" className="sec" onClick={() => { add([newSrc]); setNewSrc(''); }}>Add</button></div>
            <div className="card" style={{ display: 'grid', gap: 6, padding: 10 }}><b style={{ fontSize: '.9rem' }}>Add several at once</b>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={base} onChange={e => setBase(e.target.value)} placeholder="Name, e.g. Camera" style={{ flex: '2 1 120px', minWidth: 0 }} />
                <label style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center', fontWeight: 400 }}>How many<input type="number" min={1} max={200} value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: 64 }} /></label>
                <label style={{ display: 'flex', flexDirection: 'row', gap: 4, alignItems: 'center', fontWeight: 400 }}>Start at<input type="number" value={start} onChange={e => setStart(Number(e.target.value))} style={{ width: 64 }} /></label></div>
              <button type="button" disabled={!b} onClick={() => add(Array.from({ length: bulk }, (_, i) => `${b} ${st + i}`))}>{b ? `Add ${bulk} × ${b} ${st} to ${st + bulk - 1}` : 'Add several'}</button></div>
          </div></div>
      </div></dialog></>);
}
