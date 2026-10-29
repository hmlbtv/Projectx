import { one } from './db';
import WallThumb from '@/app/walls/WallThumb';

// A Wall Template as a PNG picture for emails (mail programs do not show SVG). Returns null if it cannot be drawn.
export async function wallPng(assets: any[], width = 480, tenant?: number): Promise<Buffer | null> {
  try {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const sharp = (await import('sharp')).default;
    const imgs: Record<number, string> = {};
    if (tenant) for (const a of assets) { const id = Math.round(Number(a?.props?.img)) || 0; if (id > 0 && !imgs[id]) {
      const r = await one('select mime, data from wall_images where id=$1 and tenant_id=$2', [id, tenant]);
      if (r && /^image\/(png|jpeg|webp|gif)$/.test(r.mime)) imgs[id] = `data:${r.mime};base64,${Buffer.from(r.data).toString('base64')}`; } }
    let svg = renderToStaticMarkup(<WallThumb assets={assets} plain={{ imgs }} />);
    const vb = /viewBox="([-\d.\s]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number); if (!vb || vb.length !== 4 || !(vb[2] > 0)) return null;
    const height = Math.max(60, Math.round((width * vb[3]) / vb[2]));
    svg = svg.replace(/<svg [^>]*>/, m => m.replace(/ width="[^"]*"/, '').replace(/ style="[^"]*"/, '').replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `));
    svg = svg.replace(/(<svg [^>]*>)/, '$1<rect x="-5000" y="-5000" width="10000" height="10000" fill="#1b2027"/>');
    const wm = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="p" width="90" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><g opacity=".035" fill="#fff"><rect width="30" height="28" rx="4"/><rect x="33" width="23" height="13" rx="4"/><rect x="33" y="15" width="23" height="13" rx="4" fill="#e5352b"/><rect y="31" width="56" height="16" rx="4"/></g></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
    return await sharp(Buffer.from(svg), { density: 96 }).composite([{ input: Buffer.from(wm), density: 96 }]).png({ palette: true, quality: 70 }).toBuffer();
  } catch { return null; }
}

// The TelePlanner mark (white, for the dark email header) as a PNG. The wordmark is written as text in the email so it never depends on fonts.
export async function markPng(): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="120" viewBox="0 0 120 100"><rect x="0" y="0" width="64" height="60" rx="10" fill="#fff"/><rect x="70" y="0" width="50" height="28" rx="9" fill="#fff"/><rect x="70" y="33" width="50" height="27" rx="9" fill="#e5352b"/><path d="M85 47.5l7 7 14-14" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="0" y="66" width="120" height="34" rx="10" fill="#fff"/></svg>`;
    return await sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
  } catch { return null; }
}
