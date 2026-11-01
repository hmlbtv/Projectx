import { sendMailDetailed } from './mail';
import { markPng } from './wallPng';

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const font = "font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif";
export type Brand = { heading: string; lines?: string[]; button?: { label: string; url: string }; note?: { text: string; by: string }; small?: string };

// The TelePlanner email look (same as the monitor plan invitation): dark header with the mark, red rule, white card, red button.
export async function brandedMailDetailed(to: string, subject: string, text: string, b: Brand) {
  const mark = await markPng(), images = mark ? [{ cid: 'tpmark', png: mark }] : [];
  const html = `<div style="background:#f3f5f8;padding:24px 12px;${font};color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:collapse">
<tr><td style="background:#0f1217;border-bottom:3px solid #e5352b;padding:16px 22px;border-radius:12px 12px 0 0">
 <table role="presentation" cellpadding="0" cellspacing="0"><tr>${mark ? '<td style="padding-right:12px"><img src="cid:tpmark" width="40" height="33" alt="" style="display:block"></td>' : ''}
 <td style="color:#fff;font-size:24px;letter-spacing:-0.02em;line-height:1"><b>Tele</b>Planner</td></tr></table>
 <div style="color:#9aa4b2;font-size:11px;letter-spacing:.08em;margin-top:6px">TelePlanner.tv · Monitor plans for live production</div></td></tr>
<tr><td style="background:#fff;padding:26px 22px;border-radius:0 0 12px 12px">
 <p style="margin:0 0 10px;font-size:20px;font-weight:700;color:#111">${b.heading}</p>
 ${(b.lines ?? []).map(l => `<p style="margin:0 0 10px;font-size:15px;color:#444;line-height:1.5">${l}</p>`).join('')}
 ${b.note ? `<div style="margin:6px 0 18px;padding:12px 14px;background:#f3f5f8;border-left:3px solid #e5352b;border-radius:4px;font-size:15px;color:#222;white-space:pre-wrap">${esc(b.note.text).replace(/\n/g, '<br>')}<div style="margin-top:8px;font-size:12px;color:#777">— ${esc(b.note.by)}</div></div>` : ''}
 ${b.button ? `<div style="height:8px;line-height:8px">&nbsp;</div><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr><td style="background:#e5352b;border-radius:8px"><a href="${b.button.url}" style="display:inline-block;padding:13px 26px;color:#fff;font-size:16px;font-weight:700;text-decoration:none;${font}">${esc(b.button.label)}</a></td></tr></table>
 <p style="margin:0 0 6px;color:#777;font-size:12px">Button not working? Copy this link into your browser:<br><a href="${b.button.url}" style="color:#777;word-break:break-all">${b.button.url}</a></p>` : ''}
 ${b.small ? `<p style="margin:20px 0 0;color:#777;font-size:12px;border-top:1px solid #e5e7eb;padding-top:14px">${b.small}</p>` : ''}</td></tr></table></div>`;
  return sendMailDetailed(to, subject, text, { html, images });
}
export async function brandedMail(to: string, subject: string, text: string, b: Brand): Promise<boolean> { return (await brandedMailDetailed(to, subject, text, b)).ok; }
export { esc as escMail };
