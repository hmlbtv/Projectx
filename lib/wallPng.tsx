import WallThumb from '@/app/walls/WallThumb';

// A Wall Template as a PNG picture for emails (mail programs do not show SVG). Returns null if it cannot be drawn.
export async function wallPng(assets: any[], width = 560): Promise<Buffer | null> {
  try {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const sharp = (await import('sharp')).default;
    let svg = renderToStaticMarkup(<WallThumb assets={assets} />);
    const vb = /viewBox="([-\d.\s]+)"/.exec(svg)?.[1].trim().split(/\s+/).map(Number); if (!vb || vb.length !== 4 || !(vb[2] > 0)) return null;
    const height = Math.max(60, Math.round((width * vb[3]) / vb[2]));
    svg = svg.replace(/<svg [^>]*>/, m => m.replace(/ width="[^"]*"/, '').replace(/ style="[^"]*"/, '').replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `));
    return await sharp(Buffer.from(svg), { density: 96 }).png().toBuffer();
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
