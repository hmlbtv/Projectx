import type { DAsset } from '../designer/assets';
// Draws a wall item (monitor, Sony BVM/PVM, speaker, clock) to fill its own box. Turned in quarter steps (props.rot), like the Tile Designer.
const kindOf = (t: string) => /^img/.test(t) ? 'img' : /^txt/.test(t) ? 'txt' : /^(mon|monitor)/.test(t) ? 'mon' : /^(bvm|pvm)/.test(t) ? 'crt' : /^(g\d|speaker)/.test(t) ? 'spk' : /^(tc|clock)/.test(t) ? 'clk' : 'mon';
export type Plain = { imgs: Record<number, string> }; // email pictures: no text (mail servers have no fonts), pictures inlined
function Upright({ a, w, h, abs, plain }: { a: DAsset; w: number; h: number; abs?: boolean; plain?: Plain }) {
  const k = kindOf(a.type), m = Math.min(w, h), label = String(a.name ?? '').slice(0, 30);
  let inner: React.ReactNode;
  if (k === 'img') { const id = Math.round(Number(a.props?.img)) || 0;
    return (<svg viewBox={`0 0 ${w} ${h}`} width={abs ? w : '100%'} height={abs ? h : '100%'} style={{ display: 'block' }}><rect width={w} height={h} fill="#1b2027" stroke="#3a414c" strokeDasharray="4 3" />
      {a.props?.useAlpha === false && <defs><filter id="flatalpha" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer></filter></defs>}
      {id > 0 && (!plain || plain.imgs[id]) && <image href={plain ? plain.imgs[id] : `/api/wall-images/${id}`} width={w} height={h} preserveAspectRatio="none" filter={a.props?.useAlpha === false ? 'url(#flatalpha)' : undefined} />}</svg>); }
  if (k === 'txt' && plain) return null;
  if (k === 'txt') { const q = a.props ?? {}, fam = q.font === 'Serif' ? 'Georgia,serif' : q.font === 'Mono' ? 'ui-monospace,Menlo,monospace' : 'system-ui,sans-serif';
    return (<svg viewBox={`0 0 ${w} ${h}`} width={abs ? w : '100%'} height={abs ? h : '100%'} style={{ display: 'block', overflow: 'hidden' }}><foreignObject width={w} height={h}>
      <div style={{ width: w, height: h, boxSizing: 'border-box', padding: 2, overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.2, fontFamily: fam, fontSize: Math.min(Math.max(+q.size || 28, 4), 400), fontWeight: q.bold ? 700 : 400, fontStyle: q.italic ? 'italic' : 'normal', textDecoration: q.underline ? 'underline' : 'none', textAlign: (['left', 'center', 'right'].includes(q.align) ? q.align : 'left') as any, color: /^#[0-9a-f]{6}$/i.test(q.color) ? q.color : '#e6e9ef' }}>{String(q.text ?? '')}</div></foreignObject></svg>); }
  if (k === 'mon') { const b = /^mon\d/.test(a.type) ? 2 : Math.max(2, m * 0.03);
    inner = (<><rect width={w} height={h} rx={m * 0.02} fill={/^mon\d/.test(a.type) ? "#3b424d" : "#15181d"} stroke={/^mon\d/.test(a.type) ? "#69727f" : "#3a414c"} strokeWidth={1} /><rect x={b} y={b} width={w - 2 * b} height={h - 2 * b} fill="#0c2340" />
      <path d={`M${b} ${b}L${w - b} ${b}L${b} ${h * 0.7}Z`} fill="#fff" fillOpacity=".04" /><circle cx={w - b * 2.2} cy={h - b * 0.5} r={Math.max(1, b * 0.25)} fill="#1fb865" />
      {!plain && <text x={w / 2} y={h / 2} fill="#8fb4e3" fontFamily="system-ui,sans-serif" fontWeight="600" fontSize={Math.min(h * 0.16, (w * 0.84) / Math.max(4, label.length * 0.6))} textAnchor="middle" dominantBaseline="central">{label}</text>}</>);
  } else if (k === 'crt') { const b = Math.max(2, m * 0.035), sh = h * 0.78;
    inner = (<><rect width={w} height={h} rx={m * 0.03} fill="#2a2e35" stroke="#454c58" strokeWidth={1} /><rect x={b * 1.5} y={b * 1.5} width={w - 3 * b} height={sh - b} rx={m * 0.03} fill="#06121f" stroke="#10151c" strokeWidth={b * 0.6} />
      <rect x={b * 1.5} y={sh + b} width={w - 3 * b} height={h - sh - 2.5 * b} fill="#20242a" />
      {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={w * (0.62 + i * 0.07)} cy={sh + (h - sh) / 2} r={Math.max(1.2, m * 0.018)} fill="#7b8594" />)}
      <circle cx={w * 0.1} cy={sh + (h - sh) / 2} r={Math.max(1.2, m * 0.02)} fill="#1fb865" />
      {!plain && <text x={w * 0.2} y={sh + (h - sh) / 2} fill="#aab3c0" fontFamily="system-ui,sans-serif" fontWeight="600" fontSize={Math.min((h - sh) * 0.55, (w * 0.34) / Math.max(4, label.length * 0.6))} dominantBaseline="central">{label.replace(/^Sony /, '')}</text>}</>);
  } else if (k === 'spk') { const cx = w / 2;
    inner = (<><rect width={w} height={h} rx={m * 0.1} fill="#23272d" stroke="#3b424d" strokeWidth={1} /><circle cx={cx} cy={h * 0.22} r={m * 0.2} fill="#0d0f12" stroke="#5a6472" strokeWidth={1} /><circle cx={cx} cy={h * 0.22} r={m * 0.07} fill="#3a414c" />
      <circle cx={cx} cy={h * 0.62} r={m * 0.36} fill="#0d0f12" stroke="#5a6472" strokeWidth={1} /><circle cx={cx} cy={h * 0.62} r={m * 0.14} fill="#2c323b" />
      {!plain && <text x={cx} y={h * 0.94} fill="#9aa4b2" fontFamily="system-ui,sans-serif" fontWeight="600" fontSize={Math.min(h * 0.07, (w * 0.9) / Math.max(4, label.length * 0.6))} textAnchor="middle" dominantBaseline="central">{label.replace(/^Genelec /, '')}</text>}</>);
  } else { const text = '10:24:36';
    inner = (<><rect width={w} height={h} rx={m * 0.08} fill="#0a0a0b" stroke="#3a414c" strokeWidth={1} />
      {!plain && <text x={w / 2} y={h / 2} fill="#ff3b30" fontFamily="ui-monospace,Menlo,monospace" fontWeight="700" fontSize={Math.min(h * 0.62, (w * 0.9) / (text.length * 0.62))} textAnchor="middle" dominantBaseline="central">{text}</text>}</>);
  }
  return <svg viewBox={`0 0 ${w} ${h}`} width={abs ? w : '100%'} height={abs ? h : '100%'} style={{ display: 'block' }}>{inner}</svg>;
}
export function WallArt({ a, plain }: { a: DAsset; plain?: Plain }) {
  const rot = (((Math.round(Number(a.props?.rot)) || 0) % 4) + 4) % 4;
  if (rot === 0) return <Upright a={a} w={a.w} h={a.h} plain={plain} />;
  const odd = rot % 2 === 1, uw = odd ? a.h : a.w, uh = odd ? a.w : a.h;
  return (<svg viewBox={`0 0 ${a.w} ${a.h}`} width="100%" height="100%" style={{ display: 'block' }}><g transform={`translate(${a.w / 2} ${a.h / 2}) rotate(${rot * 90}) translate(${-uw / 2} ${-uh / 2})`}><Upright a={a} w={uw} h={uh} abs plain={plain} /></g></svg>);
}
