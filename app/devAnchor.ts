// Dev comments stick to the page item they were made on: we remember which element it was (a selector plus its text), where inside it, and what to call it.
export type Rect = { x: number; y: number; w: number; h: number };
export type Anchor = { sel: string; text: string; tag: string; rect: Rect };
const NAMES: Record<string, string> = { button: 'Button', a: 'Link', input: 'Field', select: 'Dropdown', textarea: 'Text box', h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', img: 'Image', tr: 'Table row', td: 'Table cell', th: 'Column header', li: 'List item', label: 'Label', svg: 'Drawing', canvas: 'Drawing', nav: 'Menu bar', dialog: 'Dialog', form: 'Form', table: 'Table', p: 'Text' };
const MEANINGFUL = 'button,a,input,select,textarea,label,h1,h2,h3,h4,tr,th,td,li,img,canvas,dialog,.card,.tile,.dzi,[role=button],[role=dialog]';
export const pageRect = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
const clip = (s: string, n = 60) => s.replace(/\s+/g, ' ').trim().slice(0, n);
const textOf = (el: Element) => clip((el as HTMLElement).getAttribute?.('aria-label') || (el as HTMLInputElement).placeholder || (el as HTMLImageElement).alt || (el as HTMLElement).innerText || el.textContent || '');

export function describe(el: Element): string {
  const tag = el.tagName.toLowerCase(); let kind = NAMES[tag] ?? (el.classList.contains('card') ? 'Card' : el.classList.contains('tile') ? 'Card' : 'Area');
  if (tag === 'input') { const t = (el as HTMLInputElement).type; kind = t === 'checkbox' ? 'Checkbox' : t === 'radio' ? 'Option' : 'Field'; }
  let label = textOf(el); if (!label || label.length > 50 && !['button', 'a', 'label'].includes(tag)) { const h = el.querySelector('h1,h2,h3,h4,b,strong'); label = h ? clip(h.textContent || '', 50) : clip(label, 50); }
  const where = el.parentElement?.closest('.card,.tile,section,dialog,form,nav'); let ctx = '';
  if (where && where !== el) { const h = where.querySelector('h1,h2,h3,h4'); const t = h ? clip(h.textContent || '', 40) : ''; if (t && t !== label) ctx = ` in “${t}”`; }
  return `${kind}${label ? ` “${label.slice(0, 50)}”` : ''}${ctx}`;
}
export function selectorFor(el: Element): string {
  const uniq = (s: string) => { try { const m = document.querySelectorAll(s); return m.length === 1 && m[0] === el; } catch { return false; } };
  if (el.id && uniq('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id);
  const parts: string[] = []; let cur: Element | null = el;
  while (cur && cur !== document.body && parts.length < 8) {
    if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
    const p: Element | null = cur.parentElement; const i = p ? Array.from(p.children).indexOf(cur) + 1 : 1; parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${i})`); cur = p;
  }
  return parts.join(' > ');
}
export const makeAnchor = (el: Element): Anchor => ({ sel: selectorFor(el), text: textOf(el), tag: el.tagName.toLowerCase(), rect: pageRect(el) });
export function resolveAnchor(a: Anchor): Element | null {
  let el: Element | null = null; try { el = document.querySelector(a.sel); } catch { /* bad selector */ }
  const same = (e: Element) => !a.text || textOf(e).startsWith(a.text.slice(0, 15)) || a.text.startsWith(textOf(e).slice(0, 15));
  if (el && same(el)) return el;
  if (a.text) for (const e of Array.from(document.getElementsByTagName(a.tag))) if (!e.closest('[data-devbar]') && textOf(e) === a.text) return e; // moved: find the same item by its text
  return el;
}
// The element under a point, ignoring our own overlay and bar; climbs to something a person would call "an item".
export function pickAt(clientX: number, clientY: number): Element {
  const hit = document.elementsFromPoint(clientX, clientY).find(e => !e.closest('[data-devbar]') && e !== document.documentElement) ?? document.body;
  return (hit.closest(MEANINGFUL) as Element | null) ?? hit;
}
// For a drawing or box: the smallest item that contains all of it.
export function pickFor(b: Rect): Element {
  let el = pickAt(b.x + b.w / 2 - scrollX, b.y + b.h / 2 - scrollY);
  while (el !== document.body && el.parentElement) { const r = pageRect(el); if (r.x <= b.x + 4 && r.y <= b.y + 4 && r.x + r.w >= b.x + b.w - 4 && r.y + r.h >= b.y + b.h - 4) break; el = el.parentElement; }
  return el;
}
export function mapper(a: Anchor | null | undefined): { f: (p: { x: number; y: number }) => { x: number; y: number }; miss: boolean } {
  if (!a) return { f: p => p, miss: false };
  const el = resolveAnchor(a); if (!el) return { f: p => p, miss: true };
  const c = pageRect(el), o = a.rect, sx = o.w > 0 ? c.w / o.w : 1, sy = o.h > 0 ? c.h / o.h : 1;
  return { f: p => ({ x: c.x + (p.x - o.x) * sx, y: c.y + (p.y - o.y) * sy }), miss: false };
}
