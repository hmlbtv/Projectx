import type { DAsset } from '../designer/assets';
// Draws a wall item (monitor, Sony BVM/PVM, speaker, clock) to fill its own box. Turned in quarter steps (props.rot), like the Tile Designer.
const kindOf = (t: string) => /^(mon|monitor)/.test(t) ? 'mon' : /^(bvm|pvm)/.test(t) ? 'crt' : /^(g\d|speaker)/.test(t) ? 'spk' : /^(tc|clock)/.test(t) ? 'clk' : 'mon';
function Upright({ a, w, h, abs }: { a: DAsset; w: number; h: number; abs?: boolean }) {
  const k = kindOf(a.type), m = Math.min(w, h), label = String(a.name ?? '').slice(0, 30);
  let inner: React.ReactNode;
  if (k === 'mon') { const b = /^mon\d/.test(a.type) ? 2 : Math.max(2, m * 0.03);
    inner = (<><rect width={w} height={h} rx={m * 0.02} fill={/^mon\d/.test(a.type) ? "#3b424d" : "#15181d"} stroke={/^mon\d/.test(a.type) ? "#69727f" : "#3a414c"} strokeWidth={1} /><rect x={b} y={b} width={w - 2 * b} height={h - 2 * b} fill="#0c2340" />
      <path d={`M${b} ${b}L${w - b} ${b}L${b} ${h * 0.7}Z`} fill="#fff" fillOpacity=".04" /><circle cx={w - b * 2.2} cy={h - b * 0.5} r={Math.max(1, b * 0.25)} fill="#1fb865" />
      <text x={w / 2} y={h / 2} fill="#8fb4e3" fontFamily="system-ui,sans-serif" fontWeight="600" fontSize={Math.min(h * 0.16, (w * 0.84) / Math.max(4, label.length * 0.6))} textAnchor="middle" dominantBaseline="central">{label}</text></>);
  } else if (k === 'crt') { const b = Math.max(2, m * 0.035), sh = h * 0.78;
    inner = (<><rect width={w} height={h} rx={m * 0.03} fill="#2a2e35" stroke="#454c58" strokeWidth={1} /><rect x={b * 1.5} y={b * 1.5} width={w - 3 * b} height={sh - b} rx={m * 0.03} fill="#06121f" stroke="#10151c" strokeWidth={b * 0.6} />
      <rect x={b * 1.5} y={sh + b} width={w - 3 * b} height={h - sh - 2.5 * b} fill="#20242a" />
      {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={w * (0.62 + i * 0.07)} cy={sh + (h - sh) / 2} r={Math.max(1.2, m * 0.018)} fill="#7b8594" />)}
      <circle cx={w * 0.1} cy={sh + (h - sh) / 2} r={Math.max(1.2, m * 0.02)} fill="#1fb865" />
      <text x={w * 0.2} y={sh + (h - sh) / 2} fill="#aab3c0" fontFamily="system-ui,sans-serif" fontWeight="600" fontSize={Math.min((h - sh) * 0.55, (w * 0.34) / Math.max(4, label.length * 0.6))} dominantBaseline="central">{label.replace(/^Sony /, '')}</text></>);
  } else if (k === 'spk') { const cx = w / 2;
    inner = (<><rect width={w} height={h} rx={m * 0.1} fill="#23272d" stroke="#3b424d" strokeWidth={1} /><circle cx={cx} cy={h * 0.22} r={m * 0.2} fill="#0d0f12" stroke="#5a6472" strokeWidth={1} /><circle cx={cx} cy={h * 0.22} r={m * 0.07} fill="#3a414c" />
      <circle cx={cx} cy={h * 0.62} r={m * 0.36} fill="#0d0f12" stroke="#5a6472" strokeWidth={1} /><circle cx={cx} cy={h * 0.62} r={m * 0.14} fill="#2c323b" />
      <text x={cx} y={h * 0.94} fill="#9aa4b2" fontFamily="system-ui,sans-serif" fontWeight="600" fontSize={Math.min(h * 0.07, (w * 0.9) / Math.max(4, label.length * 0.6))} textAnchor="middle" dominantBaseline="central">{label.replace(/^Genelec /, '')}</text></>);
  } else { const text = '10:24:36';
    inner = (<><rect width={w} height={h} rx={m * 0.08} fill="#0a0a0b" stroke="#3a414c" strokeWidth={1} />
      <text x={w / 2} y={h / 2} fill="#ff3b30" fontFamily="ui-monospace,Menlo,monospace" fontWeight="700" fontSize={Math.min(h * 0.62, (w * 0.9) / (text.length * 0.62))} textAnchor="middle" dominantBaseline="central">{text}</text></>);
  }
  return <svg viewBox={`0 0 ${w} ${h}`} width={abs ? w : '100%'} height={abs ? h : '100%'} style={{ display: 'block' }}>{inner}</svg>;
}
export function WallArt({ a }: { a: DAsset }) {
  const rot = (((Math.round(Number(a.props?.rot)) || 0) % 4) + 4) % 4;
  if (rot === 0) return <Upright a={a} w={a.w} h={a.h} />;
  const odd = rot % 2 === 1, uw = odd ? a.h : a.w, uh = odd ? a.w : a.h;
  return (<svg viewBox={`0 0 ${a.w} ${a.h}`} width="100%" height="100%" style={{ display: 'block' }}><g transform={`translate(${a.w / 2} ${a.h / 2}) rotate(${rot * 90}) translate(${-uw / 2} ${-uh / 2})`}><Upright a={a} w={uw} h={uh} abs /></g></svg>);
}
