import { escMail as e, type Brand } from './brandMail';
import { money } from './money';

// Every email the site sends is defined here, so they all share one look (see brandMail.ts) and wording lives in one place.
export type Tpl = { subject: string; text: string; b: Brand };
export const mailTemplates = {
  addedToOrg: (name: string, org: string, url: string): Tpl => ({ subject: `You have been added to ${org} on TelePlanner`,
    text: `${name} added you to ${org} on TelePlanner.\nYou keep your existing login. Sign in and use the "Working in" menu to switch to ${org}.\n${url}`,
    b: { heading: `${e(name)} added you to <b>${e(org)}</b>`, lines: [`You keep your existing TelePlanner login. Sign in and pick <b>${e(org)}</b> from the <b>Working in</b> menu to switch to it.`, 'Each organization is kept separate: they only see their own part of your account.'], button: { label: 'Open TelePlanner', url } } }),
  orgInvite: (name: string, org: string, url: string): Tpl => ({ subject: `${name} invited you to ${org} on TelePlanner`,
    text: `${name} invited you to join ${org} on TelePlanner.\nSign in with your existing login and accept or decline the invitation here:\n${url}`,
    b: { heading: `${e(name)} invited you to <b>${e(org)}</b>`, lines: ['You can join with your existing TelePlanner login. Nothing changes until you accept.', 'Each organization is kept separate: they only see their own part of your account.'], button: { label: 'Review invitation', url } } }),
  interestThanks: (name: string): Tpl => ({ subject: 'Thank you for your interest in TelePlanner',
    text: `Hi ${name},\n\nThank you for your interest in TelePlanner. We will email you when the site is ready.\n\nTelePlanner.tv`,
    b: { heading: 'Thank you for your interest', lines: [`Hi ${e(name)},`, 'Thank you for your interest in <b>TelePlanner</b>. We will email you when the site is ready.'], small: 'You are receiving this because you registered your interest at teleplanner.tv.' } }),
  // ---- Subscriptions (no payment provider yet: these follow what the site admin records) ----
  subscriptionStarted: (name: string, org: string, plan: string, period: string, price: number, cur: string, end: string, kind: string, url: string): Tpl => {
    const cost = price > 0 ? `${money(price, cur)} ${period === 'yearly' ? 'a year' : period === 'monthly' ? 'a month' : ''}`.trim() : 'no charge';
    const head = kind === 'renewed' ? `Your ${plan} plan has been renewed` : kind === 'changed' ? `Your plan is now ${plan}` : `Thank you for subscribing to ${plan}`;
    const line = `${org} is on the ${plan} plan (${cost})${end ? `, paid up to ${end}` : ''}.`;
    return { subject: `${head} - TelePlanner`, text: `Hi ${name},\n\n${head}.\n${line}\nSee your plan and what it includes: ${url}\n\nTelePlanner.tv`,
      b: { heading: e(head), lines: [`Hi ${e(name)},`, e(line), 'Your new limits are in place now. You can see what your plan includes, and how much of it you have used, on your Account page.'], button: { label: 'View your plan', url } } };
  },
  subscriptionEnding: (name: string, org: string, plan: string, end: string, days: number, url: string): Tpl => ({ subject: `Your ${plan} plan ends ${days <= 1 ? 'tomorrow' : `in ${days} days`} - TelePlanner`,
    text: `Hi ${name},\n\nThe ${plan} plan for ${org} ends on ${end}. After that your workspace returns to the Demo plan. Nothing is deleted, but you will not be able to add more than Demo allows.\nTo keep your plan, contact us before then: ${url}\n\nTelePlanner.tv`,
    b: { heading: `Your ${e(plan)} plan ends on ${e(end)}`, lines: [`Hi ${e(name)},`, `After that, <b>${e(org)}</b> returns to the Demo plan. <b>Nothing is deleted</b>, but you will not be able to add more than the Demo plan allows until you subscribe again.`, 'To keep your plan, contact us before it ends.'], button: { label: 'View your plan', url } } }),
  subscriptionGrace: (name: string, org: string, plan: string, until: string, url: string): Tpl => ({ subject: `Your ${plan} plan has ended - extra time until ${until}`,
    text: `Hi ${name},\n\nThe ${plan} plan for ${org} has ended. To give you time, everything keeps working until ${until}. After that your workspace returns to the Demo plan (nothing is deleted).\nContact us to continue: ${url}\n\nTelePlanner.tv`,
    b: { heading: `Your ${e(plan)} plan has ended`, lines: [`Hi ${e(name)},`, `To give you time, everything keeps working until <b>${e(until)}</b>. After that, <b>${e(org)}</b> returns to the Demo plan. Nothing is deleted.`, 'Contact us to continue your plan.'], button: { label: 'View your plan', url } } }),
  subscriptionEnded: (name: string, org: string, plan: string, url: string): Tpl => ({ subject: `${org} is back on the Demo plan - TelePlanner`,
    text: `Hi ${name},\n\nThe ${plan} plan for ${org} has ended, so your workspace is back on the Demo plan.\nEverything you made is kept. You can still open and edit it; you just cannot add more than Demo allows. Subscribe again at any time to get everything back.\n${url}\n\nTelePlanner.tv`,
    b: { heading: 'You are back on the Demo plan', lines: [`Hi ${e(name)},`, `The ${e(plan)} plan for <b>${e(org)}</b> has ended, so your workspace is back on the Demo plan.`, '<b>Everything you made is kept.</b> You can still open and edit it. You just cannot add more than the Demo plan allows. Subscribe again at any time to carry on where you left off.'], button: { label: 'View your plan', url } } }),
  subscriptionCancelled: (name: string, org: string, plan: string, end: string, url: string): Tpl => ({ subject: `Your ${plan} plan will not renew - TelePlanner`,
    text: `Hi ${name},\n\nThe ${plan} plan for ${org} will end${end ? ` on ${end}` : ''} and will not renew. Nothing is deleted when it ends.\n${url}\n\nTelePlanner.tv`,
    b: { heading: `Your ${e(plan)} plan will not renew`, lines: [`Hi ${e(name)},`, `It stays active${end ? ` until <b>${e(end)}</b>` : ''}, then <b>${e(org)}</b> returns to the Demo plan. Nothing is deleted.`], button: { label: 'View your plan', url } } }),
  adminSubscription: (org: string, subject: string, url: string): Tpl => ({ subject: `[TelePlanner] ${org}: ${subject}`,
    text: `${org}: ${subject}\n${url}`, b: { heading: e(org), lines: [e(subject)], button: { label: 'Open Subscriptions', url } } }),
  welcomeDemo: (name: string, org: string, url: string): Tpl => ({ subject: 'Welcome to TelePlanner',
    text: `Hi ${name},\n\nYour demo workspace ${org} is ready. It includes a small set of Wall Templates, Broadcasters, Productions and Jobs so you can try everything out.\nSign in: ${url}\nWhen you need more, contact us about a plan.\n\nTelePlanner.tv`,
    b: { heading: 'Welcome to TelePlanner', lines: [`Hi ${e(name)},`, `Your demo workspace <b>${e(org)}</b> is ready. It includes a small set of Wall Templates, Broadcasters, Productions and Jobs so you can try everything out.`, 'When you need more, contact us about a plan. Your work is always kept.'], button: { label: 'Open TelePlanner', url } } }),
  adminNewSignup: (name: string, org: string, email: string, url: string): Tpl => ({ subject: `[TelePlanner] New sign-up: ${org}`,
    text: `New demo sign-up.\nName: ${name}\nWorkspace: ${org}\nEmail: ${email}\n${url}`, b: { heading: 'New demo sign-up', lines: [`<b>${e(name)}</b> (${e(email)}) created the workspace <b>${e(org)}</b>.`], button: { label: 'Open Subscriptions', url } } }),
  announcement: (subject: string, body: string, btn: { label: string; url: string } | undefined, cat: 'marketing' | 'important', unsub: string): Tpl => {
    const noun = cat === 'marketing' ? 'marketing emails' : 'important update emails';
    return { subject, text: `${body}${btn ? `\n\n${btn.label}: ${btn.url}` : ''}\n\nYou are receiving this ${cat === 'marketing' ? 'marketing' : 'important update'} email from TelePlanner.tv.\nUnsubscribe from ${noun}: ${unsub}`,
      b: { heading: e(subject), lines: body.split(/\n\s*\n/).map(x => e(x.trim()).replace(/\n/g, '<br>')).filter(Boolean), ...(btn ? { button: btn } : {}),
        small: `You are receiving this ${cat === 'marketing' ? 'marketing' : 'important update'} email from TelePlanner.tv. <a href="${unsub}" style="color:#777">Unsubscribe from ${noun}</a>` } };
  },
  signupExists: (url: string): Tpl => ({ subject: 'Someone tried to create a TelePlanner account with your email',
    text: `Someone tried to sign up for TelePlanner with this email address, but you already have an account.\nSign in here: ${url}\nForgot your password? Use "Forgot password" on that page.\n\nWere you invited to another organization and want a workspace of your own? Sign in, open Organizations and choose "Start your own workspace". You do not need to sign up again.\n\nIf this was not you, you can ignore this email.`,
    b: { heading: 'You already have a TelePlanner account', lines: ['Someone tried to sign up for TelePlanner with this email address, but you already have an account.', 'Forgot your password? Use <b>Forgot password</b> on the sign-in page.', 'Were you invited to another organization and want a workspace of your own? Sign in, open <b>Organizations</b> and choose <b>Start your own workspace</b>. You do not need to sign up again.'], button: { label: 'Sign in', url }, small: 'If this was not you, you can ignore this email.' } }),
  verify: (url: string, forWall = false): Tpl => ({ subject: 'Verify your TelePlanner account',
    text: `Welcome to TelePlanner.\nConfirm your email to ${forWall ? 'open the wall shared with you' : 'finish setting up your account'}:\n${url}\n\nThis link expires in 2 days.`,
    b: { heading: 'Welcome to TelePlanner', lines: [forWall ? 'Confirm your email address to open the wall shared with you.' : 'Confirm your email address to finish setting up your account.'], button: { label: 'Confirm my email', url }, small: 'This link expires in 2 days.' } }),
  reset: (url: string): Tpl => ({ subject: 'Reset your TelePlanner password',
    text: `Use this link to set a new password (valid for 1 hour):\n${url}\n\nIf you did not ask for this, ignore this email.`,
    b: { heading: 'Reset your password', lines: ['Use the button below to set a new password. The link is valid for 1 hour.'], button: { label: 'Set a new password', url }, small: 'If you did not ask for this, ignore this email.' } }),
  inviteUnusable: (name: string): Tpl => ({ subject: 'A TelePlanner invitation could not be used',
    text: `${name} tried to invite you to TelePlanner, but this email address is already part of another team.\nIf you want to join them, ask them to invite a different email address.`,
    b: { heading: 'An invitation could not be used', lines: [`${e(name)} tried to invite you to TelePlanner, but this email address is already part of another team.`, 'If you want to join them, ask them to invite a different email address.'] } }),
  teamInvite: (name: string, url: string): Tpl => ({ subject: 'You have been invited to TelePlanner',
    text: `${name} invited you to TelePlanner.\nSet your password to join:\n${url}\n\nThis link expires in 7 days.`,
    b: { heading: `${e(name)} invited you to <b>TelePlanner</b>`, lines: ['Set your password to join the team.'], button: { label: 'Join TelePlanner', url }, small: 'This link expires in 7 days.' } }),
  wallShared: (name: string, access: string, url: string): Tpl => ({ subject: 'A monitor wall has been shared with you',
    text: `${name} shared a monitor wall with you on TelePlanner (${access === 'edit' ? 'you can edit it' : 'view only'}).\nOpen this link to sign in or create your account:\n${url}\n\nAccess ends when the Job ends.`,
    b: { heading: `${e(name)} shared a monitor wall with you`, lines: [`<b>${access === 'edit' ? 'You can edit it' : 'View only'}</b> on TelePlanner.tv`], button: { label: 'Open the wall', url }, small: 'You will sign in or create your account with this email address. Access ends when the Job ends.' } }),
  planInvite: (name: string, access: string, count: number, url: string, note: string, updated: boolean): Tpl => {
    const what = count === 1 ? 'a monitor wall' : `${count} monitor walls`, acc = access === 'edit' ? 'you can edit' : 'view only';
    return { subject: updated ? 'Your Monitor Plan access has been updated on TelePlanner.tv' : 'Monitor Plans have been shared with you on TelePlanner.tv',
      text: `${updated ? `${name} updated your access on TelePlanner.tv. You now have ${count} monitor wall${count === 1 ? '' : 's'} (${acc}).` : `${name} shared ${count} monitor wall${count === 1 ? '' : 's'} with you on TelePlanner.tv (${acc}).`}\nOpen this link to sign in or create your account:\n${url}${note ? `\n\n${name} wrote:\n${note}` : ''}\n\nThe account is tied to this email address. Everything shared with you appears in one place after you sign in. Access ends when the Job ends.`,
      b: { heading: updated ? `${e(name)} updated your access on <b>TelePlanner.tv</b>` : `${e(name)} shared ${what} with you on <b>TelePlanner.tv</b>`, lines: updated ? [`You now have ${what} · <b>${acc}</b>`] : [], ...(note ? { note: { text: note, by: name } } : {}), button: { label: 'Open my Monitor Plans', url },
        small: 'You will sign in or create your account with this email address. Everything shared with you appears in one place after you sign in. Access ends when the Job ends.' } }; },
  test: (from: string, site: string): Tpl => ({ subject: 'TelePlanner test email',
    text: `This is a test email from TelePlanner.\n\nSent: ${new Date().toISOString()}\nFrom: ${from}\nSite: ${site}\n\nIf you can read this, email sending works.`,
    b: { heading: 'Email is working', lines: ['This is a test email from TelePlanner. If you can read this, email sending works.', `<span style="color:#777;font-size:13px">Sent ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC · From ${e(from)} · Site ${e(site)}</span>`] } }),
};
