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
