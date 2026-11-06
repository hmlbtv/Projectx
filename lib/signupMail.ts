import { one, rows } from './db';
import { baseUrl } from './mail';
import { brandedMail } from './brandMail';
import { mailTemplates as T } from './mailTemplates';
import { logEvent } from './subscriptions';

// Sent once a new account is usable: a welcome to the new owner and a heads-up to every site admin. Never throws, so a mail problem cannot block a sign-up.
export async function notifySignup(userId: number) {
  try {
    const u = await one<any>('select u.name, u.email, t.id tid, t.name org from users u join tenants t on t.id=u.tenant_id where u.id=$1', [userId]); if (!u) return;
    const base = await baseUrl();
    await logEvent(u.tid, 'signed_up', { to: 'demo', detail: u.email }).catch(() => undefined);
    const w = T.welcomeDemo(u.name, u.org, `${base}/signin`); await brandedMail(u.email, w.subject, w.text, w.b);
    const a = T.adminNewSignup(u.name, u.org, u.email, `${base}/webappdev/subscriptions`);
    for (const d of await rows<any>("select email from users where role='webappdev' and not suspended")) await brandedMail(d.email, a.subject, a.text, a.b);
  } catch { /* best effort */ }
}
