'use client';
import { useEffect, useRef, useState } from 'react';

type Img = { id: number; name: string; w: number; h: number; alpha?: boolean; usedIn: { id: number; name: string }[] };
const MAX_SIDE = 1600;

// Browsers cannot show .tga files, so read one here (uncompressed or RLE; colour, grey or colour-mapped; 8/15/16/24/32-bit) and turn it into a PNG that keeps its alpha.
async function tgaToPng(file: File): Promise<File> {
  const b = new Uint8Array(await file.arrayBuffer()); if (b.length < 18) throw new Error('That TGA file looks damaged.');
  const idLen = b[0], cmType = b[1], type = b[2], cmStart = b[3] | b[4] << 8, cmLen = b[5] | b[6] << 8, cmBits = b[7], w = b[12] | b[13] << 8, h = b[14] | b[15] << 8, bpp = b[16], desc = b[17];
  if (!w || !h || w > 16384 || h > 16384 || ![1, 2, 3, 9, 10, 11].includes(type) || ![8, 15, 16, 24, 32].includes(bpp)) throw new Error('That TGA type is not supported. Save it as 24 or 32-bit, uncompressed or RLE.');
  const px = bpp >> 3 || (bpp === 15 ? 2 : 1), bytes = Math.ceil(bpp / 8); let o = 18 + idLen; const pal: number[][] = [];
  if (cmType === 1) { const cb = Math.ceil(cmBits / 8); for (let i = 0; i < cmLen; i++, o += cb) pal[cmStart + i] = readPx(b, o, cmBits); }
  const rle = type >= 9, out = new Uint8ClampedArray(w * h * 4), total = w * h; let n = 0;
  const put = (c: number[]) => { if (n < total) { const y = desc & 0x20 ? Math.floor(n / w) : h - 1 - Math.floor(n / w), x = desc & 0x10 ? w - 1 - n % w : n % w, k = (y * w + x) * 4; out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2]; out[k + 3] = c[3]; } n++; };
  const get = (at: number) => (type === 1 || type === 9) ? (pal[b[at]] ?? [0, 0, 0, 255]) : type === 3 || type === 11 ? [b[at], b[at], b[at], bpp === 16 ? b[at + 1] : 255] : readPx(b, at, bpp);
  void px;
  while (n < total && o < b.length) {
    if (rle) { const hd = b[o++], cnt = (hd & 0x7f) + 1; if (hd & 0x80) { const c = get(o); o += bytes; for (let i = 0; i < cnt; i++) put(c); } else for (let i = 0; i < cnt; i++) { put(get(o)); o += bytes; } }
    else { put(get(o)); o += bytes; }
  }
  let any = false; for (let i = 3; i < out.length; i += 4) if (out[i]) { any = true; break; }
  if (!any) for (let i = 3; i < out.length; i += 4) out[i] = 255; // some programs write an empty alpha channel: show the picture rather than nothing
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.putImageData(new ImageData(out, w, h), 0, 0);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('Could not read that TGA file.');
  return new File([blob], file.name.replace(/\.tga$/i, '') + '.png', { type: 'image/png' });
}
function readPx(b: Uint8Array, o: number, bits: number): number[] {
  if (bits === 32) return [b[o + 2], b[o + 1], b[o], b[o + 3]];
  if (bits === 24) return [b[o + 2], b[o + 1], b[o], 255];
  const v = b[o] | b[o + 1] << 8; return [(v >> 10 & 31) * 255 / 31, (v >> 5 & 31) * 255 / 31, (v & 31) * 255 / 31, bits === 16 && !(v & 0x8000) ? 0 : 255];
}
// Scale a picture down (PNG keeps transparency, photos become JPEG) before it is uploaded. SVG is sent as it is.
async function prepare(file: File): Promise<{ blob: Blob; w: number; h: number; alpha: boolean }> {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This browser cannot read that picture. Try a PNG, JPEG or SVG.')); i.src = url; });
    const nw = im.naturalWidth || 300, nh = im.naturalHeight || 150;
    if (file.type === 'image/svg+xml') return { blob: file, w: nw, h: nh, alpha: true };
    const s = Math.min(1, MAX_SIDE / Math.max(nw, nh)), w = Math.max(1, Math.round(nw * s)), h = Math.max(1, Math.round(nh * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
    const jpeg = file.type === 'image/jpeg' || file.type === 'image/bmp'; if (jpeg) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(im, 0, 0, w, h);
    let alpha = false; if (!jpeg) { const d = g.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { alpha = true; break; } }
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, jpeg ? 'image/jpeg' : 'image/png', 0.88));
    if (!blob) throw new Error('Could not scale that picture.');
    return { blob, w, h, alpha };
  } finally { URL.revokeObjectURL(url); }
}

export default function ImagePicker({ onPick, onClose }: { onPick: (i: { id: number; name: string; w: number; h: number; alpha?: boolean }) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), file = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<Img[] | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState(false), [del, setDel] = useState<number | null>(null);
  const load = async () => { try { const r = await fetch('/api/wall-images'); const j = await r.json(); if (!r.ok) throw new Error(j.error); setList(j.images); } catch (e: any) { setErr(e.message || 'Could not load images.'); setList([]); } };
  useEffect(() => { ref.current?.showModal(); load(); }, []);
  async function upload(f: File) {
    setErr(''); setBusy(true);
    try {
      if (/\.tga$/i.test(f.name)) f = await tgaToPng(f);
      if (!f.type.startsWith('image/')) throw new Error('That is not a picture file.');
      const { blob, w, h, alpha } = await prepare(f); const ext = blob.type === 'image/svg+xml' ? 'svg' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
      const fd = new FormData(); fd.append('file', new File([blob], 'image.' + ext, { type: blob.type })); fd.append('name', f.name.replace(/\.[^.]+$/, '')); fd.append('w', String(w)); fd.append('h', String(h)); fd.append('alpha', alpha ? '1' : '0');
      const r = await fetch('/api/wall-images', { method: 'POST', body: fd }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload failed.');
      await load();
    } catch (e: any) { setErr(e.message || 'Upload failed.'); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  async function rename(i: Img, name: string) { name = name.trim(); if (!name || name === i.name) return; const r = await fetch('/api/wall-images/' + i.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); if (r.ok) load(); else setErr('Could not rename.'); }
  async function remove(i: Img) { const r = await fetch('/api/wall-images/' + i.id, { method: 'DELETE' }); setDel(null); if (r.ok) load(); else setErr('Could not delete.'); }
  return (<dialog ref={ref} className="dlg" style={{ width: 'min(640px,calc(100vw - 24px))' }} onClose={onClose} onCancel={onClose}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><b>{editing ? 'Edit images' : 'Add an image'}</b>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input ref={file} type="file" accept="image/*,.tga" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button type="button" className="sec small" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Uploading…' : 'Upload image'}</button>
        <button type="button" className={'small' + (editing ? '' : ' sec')} aria-pressed={editing} onClick={() => { setEditing(!editing); setDel(null); }}>{editing ? 'Done' : 'Edit images'}</button></span></div>
    <p className="mut" style={{ margin: '6px 0', fontSize: '.8rem' }}>{editing ? 'Rename or delete your images. Deleting an image used on a Wall Template leaves an empty space there.' : 'Pick an image to put on the wall. PNG, JPEG and SVG; large pictures are scaled down for you.'}</p>
    {err && <p style={{ color: 'var(--bad)', margin: '4px 0' }}>{err}</p>}
    <div style={{ maxHeight: 'min(420px,55vh)', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
      {list === null && <span className="mut">Loading…</span>}
      {list?.length === 0 && <span className="mut">No images yet. Press “Upload image”.</span>}
      {list?.map(i => { const used = i.usedIn.length > 0; return (<div key={i.id} style={{ border: '1px solid ' + (used && editing ? '#d97706' : 'var(--line)'), borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg)' }}>
        <button type="button" disabled={editing} onClick={() => { onPick(i); ref.current?.close(); }} style={{ all: 'unset', cursor: editing ? 'default' : 'pointer', display: 'block' }} aria-label={`Add ${i.name}`}>
          <div style={{ background: 'repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 0 0/12px 12px', borderRadius: 6, aspectRatio: '4/3', display: 'grid', placeItems: 'center', overflow: 'hidden' }}><img src={`/api/wall-images/${i.id}`} alt={i.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div></button>
        {editing ? (<>
          <input defaultValue={i.name} maxLength={60} aria-label="Image name" onBlur={e => rename(i, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: '100%', boxSizing: 'border-box' }} />
          {used && <div style={{ color: '#b45309', fontSize: '.78rem' }} role="alert">⚠ Used on {i.usedIn.length} Wall Template{i.usedIn.length === 1 ? '' : 's'}: {i.usedIn.map(u => u.name).join(', ')}</div>}
          {del === i.id ? (<div style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: '.78rem', color: used ? '#b45309' : undefined }}>{used ? 'Those walls will show an empty space where it was. Delete anyway?' : 'Delete this image?'}</span>
            <span style={{ display: 'flex', gap: 6 }}><button type="button" className="del small" onClick={() => remove(i)}>Yes, delete</button><button type="button" className="sec small" onClick={() => setDel(null)}>No</button></span></div>)
            : <button type="button" className="del small" onClick={() => setDel(i.id)}>Delete</button>}</>)
          : <span style={{ fontSize: '.82rem', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{i.name}<span className="mut" style={{ display: 'block', fontSize: '.72rem' }}>{i.w} × {i.h}</span></span>}</div>); })}</div>
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" className="sec" onClick={() => ref.current?.close()}>Close</button></div>
  </dialog>);
}
