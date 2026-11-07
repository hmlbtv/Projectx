// End-to-end checks against a throw-away local database.  Run: npm run build && npm test
// It starts the production server on a spare port, signs in, seeds a Site / Wall Template / Job, then drives the pages in Chromium.
const { spawn } = require('child_process'); const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PORT = process.env.TEST_PORT || 3951, DIR = path.join(require('os').tmpdir(), 'teleplanner-e2e'), B = `http://localhost:${PORT}`;
const env = { ...process.env, ADMIN_EMAIL: 'a@test.com', ADMIN_PASSWORD: 'Testpass#12345', PGLITE_DIR: DIR, DEV_FEEDBACK: '1', PORT: String(PORT) };
let srv; const fails = []; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
const start = async () => { srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { env, stdio: ['ignore', fs.openSync(path.join(require('os').tmpdir(), 'e2e-server.log'), 'a'), fs.openSync(path.join(require('os').tmpdir(), 'e2e-server.log'), 'a')], detached: true }); for (let i = 0; i < 60; i++) { try { await fetch(B + '/signin'); return; } catch { await new Promise(r => setTimeout(r, 500)); } } throw new Error('server did not start'); };
const alive = async () => { try { await fetch(B + '/signin'); return true; } catch { return false; } };
const stop = async () => { // ask nicely first (the database flushes to disk on exit), then force
  try { if (srv && srv.pid) process.kill(-srv.pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 20 && await alive(); i++) await new Promise(r => setTimeout(r, 500));
  if (await alive()) { try { require('child_process').execSync(`fuser -k ${PORT}/tcp || true`, { stdio: 'ignore' }); } catch {} await new Promise(r => setTimeout(r, 1000)); }
};
const openAll = async p => { await p.waitForLoadState('networkidle'); for (let k = 0; k < 6; k++) { await p.waitForTimeout(300); const closed = await p.evaluate(() => { let n = 0; document.querySelectorAll('details:not(.head details)').forEach(e => { if (!e.open) { e.open = true; n++; } }); return n; }); if (!closed && k > 0) return; } };
const click = async (p, loc, o = {}) => { for (let k = 0; k < 4; k++) { await openAll(p); try { await loc.click({ timeout: 4000, ...o }); return; } catch (e) { if (k === 3) throw e; } } };
(async () => {
  await stop(); fs.rmSync(DIR, { recursive: true, force: true }); await start();
  const b = await chromium.launch(); const p = await b.newPage(); globalThis.PAGE = p; const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 500) errs.push(r.status() + ' ' + r.url()); });
  const signin = async () => { await p.goto(B + '/signin'); if (!(await p.$('input[name=email]'))) return; await p.fill('input[name=email]', env.ADMIN_EMAIL); await p.fill('input[name=password]', env.ADMIN_PASSWORD); await p.click('form button'); await p.waitForTimeout(2500); };
  await signin(); await p.goto('about:blank'); await stop(); // leave the app page first: with the server down its background requests would fail and be mistaken for site errors
  const { PGlite } = require('@electric-sql/pglite'); const db = new PGlite(DIR); const q = async (s, a) => (await db.query(s, a)).rows;
  const s = (await q("insert into sites(tenant_id,name) values(1,'S') returning id"))[0].id, l = (await q("insert into locations(site_id,name) values($1,'L') returning id", [s]))[0].id, r = (await q("insert into rooms(location_id,name) values($1,'R') returning id", [l]))[0].id;
  const wt = (await q("insert into wall_templates(name,defaults) values('WT',$1) returning id", [JSON.stringify([{ id: 'd1', name: 'Layout A', mons: { m1: 1 }, active: true }, { id: 'd2', name: 'Layout B', mons: { m1: 2 }, active: false }])]))[0].id;
  for (const n of ['W1', 'W2']) await q('insert into room_walls(room_id,wall_template_id,name) values($1,$2,$3)', [r, wt, n]);
  const bc = (await q("insert into broadcasters(tenant_id,name) values(1,'B') returning id"))[0].id, pr = (await q("insert into productions(broadcaster_id,name) values($1,'P') returning id", [bc]))[0].id;
  const jobId = (await q("insert into jobs(production_id,name) values($1,'J') returning id", [pr]))[0].id;
  const mvId = (await q("insert into mv_layouts(tenant_id,name,tiles) values(1,'TESTMV',$1) returning id", [JSON.stringify([1, 2, 3].map(n => ({ n, x: (n - 1) * 600, y: 100, w: 580, h: 400 })))]))[0].id; await db.close(); await start(); await signin();

  for (const u of ['/', '/productions', '/layouts', '/tiles', '/walls', '/hardware', '/sources', '/plans', '/team', '/tenant']) { const res = await p.goto(B + u); ok(res.status() === 200, `page ${u} loads (got ${res.status()} ${res.url()})`); }

  await p.goto(B + '/productions?j=' + jobId); await openAll(p); if (process.env.DBG) console.log(p.url(), (await p.locator('details').evaluateAll(a => a.map(d => d.open + ':' + d.innerText.slice(0, 40).replace(/\n/g, '|')))));
  await click(p, p.locator('button', { hasText: 'Use in this Job' }).first()); await p.waitForTimeout(1500); await openAll(p);
  const pick = p.locator('select[aria-label^="Default configuration"]');
  ok(await pick.count() === 1 && await pick.first().inputValue() === 'd1', 'adding a wall applies the active default layout');
  await pick.first().selectOption('d2'); await p.waitForTimeout(1500); await p.reload(); await openAll(p);
  ok(await pick.first().inputValue() === 'd2', 'changing the starting layout is saved');
  await click(p, p.locator('button', { hasText: /^Add all/ }).first()); await p.waitForTimeout(1500); await openAll(p);
  ok((await pick.evaluateAll(a => a.map(x => x.value))).join() === 'd2,d1', 'Add all seeds the default for walls that have no plan, and keeps the existing one');
  await click(p, p.locator('button', { hasText: 'Remove' }).first()); await p.waitForTimeout(500);
  ok(await p.locator('text=Are you sure').count() + await p.locator('dialog[open]').count() >= 1, 'removing asks for confirmation');

  // ---- Layout Designer: window numbers and undo ----
  await p.goto(B + '/layouts?id=' + mvId); await p.locator('svg text', { hasText: /^3$/ }).first().waitFor({ timeout: 15000 });
  const nums = async () => (await p.locator('svg text').allTextContents()).filter(t => /^(\d+|\+)$/.test(t.trim())).join();
  ok(await nums() === '1,2,3', 'Layout Designer shows windows numbered 1,2,3 (got ' + await nums() + ')');
  { const fl = p.locator('button', { hasText: 'Flip left–right' }); const box = async () => (await p.locator('.dzi').first().boundingBox())?.x ?? 0; const x0 = await box(); await fl.click(); await p.waitForTimeout(200); const x1 = await box(); await fl.click(); await p.waitForTimeout(200); ok(x1 !== x0 && Math.abs(await box() - x0) < 1, 'Flip left-right mirrors the layout and flipping twice restores it'); }
  { await p.goto(B + '/layouts?q=TESTMV'); await p.waitForLoadState('networkidle'); await p.locator('details.dots summary').first().click(); await p.locator('input[name="tags"]').first().fill('sports, UMD'); await p.locator('button', { hasText: 'Save tags' }).first().click(); await p.waitForTimeout(1500);
    await p.goto(B + '/layouts?q=sport'); await p.waitForLoadState('networkidle'); ok(await p.locator('.tag', { hasText: 'sports' }).count() > 0 && await p.locator('.tagbar').count() === 1, 'Layout tags: added from the three dot menu, shown, searchable and filterable');
    await p.goto(B + '/layouts?tag=sports&tag=UMD'); await p.waitForLoadState('networkidle'); ok(await p.locator('.card.tile', { hasText: 'TESTMV' }).count() === 1, 'several tags can be ticked at once (a layout must have all of them)');
    { const un = p.locator('.tagbar a', { hasText: 'Unselect all' }); ok(await un.count() === 1 && !((await un.getAttribute('href')) || '').includes('tag=') && await p.locator('.tagbar a.on').count() === 2, 'tag chips show the selection, with an Unselect all link that clears it'); }
    await p.goto(B + '/layouts?id=' + mvId); await p.locator('svg text', { hasText: /^3$/ }).first().waitFor({ timeout: 15000 }); }
  await p.locator('svg text', { hasText: /^3$/ }).first().click({ force: true });
  const num = p.locator('label.dz-row', { hasText: 'Number' }).locator('input');
  ok(await num.count() === 1 && await num.inputValue() === '3', 'selecting a window shows its Number');
  await num.fill('1'); await p.waitForTimeout(300);
  ok(await nums() === '3,2,1' || await nums() === '3,2,1'.split(',').join(','), 'typing a taken number swaps the two windows (got ' + await nums() + ')');
  await p.locator('button', { hasText: 'Swap numbers' }).click();
  await p.locator('svg text', { hasText: /^2$/ }).first().click({ force: true }); await p.locator('svg text', { hasText: /^3$/ }).first().click({ force: true });
  ok(await nums() === '2,3,1', 'Swap numbers trades two windows (got ' + await nums() + ')');
  await p.locator('button', { hasText: 'Done swapping' }).click();
  const undoBtn = p.locator('.dz-tools button[aria-label=Undo]'), redoBtn = p.locator('.dz-tools button[aria-label=Redo]');
  ok(await undoBtn.count() === 1 && await redoBtn.count() === 1, 'undo and redo buttons are in the alignment toolbar');
  const winCount = async () => (await nums()).split(',').filter(Boolean).length;
  await p.locator('svg text', { hasText: /^1$/ }).first().click({ force: true }); await p.keyboard.press('Delete'); await p.waitForTimeout(300);
  ok(await winCount() === 2, 'Delete removes the selected window (got ' + await winCount() + ')');
  await undoBtn.click(); await p.waitForTimeout(300); ok(await winCount() === 3, 'Undo brings the window back');
  await redoBtn.click(); await p.waitForTimeout(300); ok(await winCount() === 2, 'Redo removes it again');
  await undoBtn.click(); await p.waitForTimeout(300);
  await p.locator('button', { hasText: /^Save$/ }).first().click(); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForTimeout(1000);
  ok(await nums() === '1,2,3', 'saved layout reopens numbered 1,2,3 in the new order (got ' + await nums() + ')');

  // ---- Back links return to the same place ----
  await p.setViewportSize({ width: 1100, height: 500 });
  await p.goto(B + '/layouts'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
  const h = await p.evaluate(() => document.documentElement.scrollHeight); ok(h > 800, 'layout list is tall enough to scroll (' + h + ')');
  await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(300); const before = await p.evaluate(() => Math.round(window.scrollY));
  const links = p.locator('a[href*="/layouts?id="]'); await links.nth(Math.min(8, (await links.count()) - 1)).click({ force: true }); await p.waitForTimeout(1500);
  await p.locator('a', { hasText: /^← All/ }).first().click(); await p.waitForTimeout(2500);
  const after = await p.evaluate(() => Math.round(window.scrollY)); ok(Math.abs(after - before) < 40, `back link returns to the same scroll position (left at ${before}, back at ${after})`);
  await p.goto(B + '/productions?j=' + jobId); await p.waitForLoadState('networkidle'); await p.waitForTimeout(400);

  // ---- Saving or clicking must not move the page or fold the trees ----
  await p.setViewportSize({ width: 1100, height: 420 });
  await p.goto(B + '/productions?j=' + jobId); await openAll(p);
  const state = async () => ({ y: await p.evaluate(() => Math.round(window.scrollY)), open: await p.evaluate(() => document.querySelectorAll('details[open]:not(.dots)').length) });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
  const s0 = await state(); ok(s0.y > 100, 'Job page is tall enough to scroll (' + s0.y + ')');
  await p.locator('select[aria-label^="Default configuration"]').last().selectOption('d2'); await p.waitForTimeout(1500);
  const s1 = await state(); ok(Math.abs(s1.y - s0.y) < 10 && s1.open === s0.open, `changing a starting configuration keeps the page still and the trees open (y ${s0.y} to ${s1.y}, open ${s0.open} to ${s1.open})`);
  for (const v of ['list', 'detail', 'cal']) { const r = await p.goto(B + '/shared?v=' + v + '&q=x&acc=edit&when=upcoming'); ok(r.status() === 200 && await p.locator('h1', { hasText: 'Shared with me' }).count() > 0, 'Shared with me opens in ' + v + ' view'); }
  for (const v of ['list', 'detail', 'cal']) { const r = await p.goto(B + '/plans?v=' + v + '&q=x&when=upcoming'); ok(r.status() === 200 && await p.locator('h1', { hasText: 'Monitor Plans' }).count() > 0, 'Monitor Plans opens in ' + v + ' view'); }
  await p.goto(B + '/webappdev'); await p.waitForLoadState('networkidle'); await p.locator('a', { hasText: 'Import from manufacturer' }).click(); await p.waitForURL(/import-layouts/); await p.locator('button', { hasText: 'Import layouts' }).click(); await p.waitForURL(/imported=/, { timeout: 15000 }).catch(() => {});
  ok(/imported=\d+&of=47&mfr=kaleido/.test(p.url()), 'Import from manufacturer adds the Kaleido layouts (' + p.url() + ')');
  for (const pg of ['demo-site', 'import-layouts', 'tidy-layouts', 'sign-in-length', 'email', 'tenants']) { const r = await p.goto(B + '/webappdev/' + pg); ok(r.status() === 200 && await p.locator('a', { hasText: '← Site admin' }).count() > 0, 'Site admin page opens: ' + pg); }
  for (const k of ['email', 'campaigns', 'signins']) { const r = await p.request.get(B + '/webappdev/export?kind=' + k); ok(r.status() === 200 && (r.headers()['content-type'] || '').includes('csv'), 'CSV export works: ' + k); }
  await p.goto(B + '/webappdev/tenants?v=detail'); await p.waitForLoadState('networkidle'); ok(await p.locator('.dtab th').count() > 5 && await p.locator('select[aria-label="Plan"]').count() === 1, 'Tenants details table and filters show');
  // ---- Subscriptions (site admin) ----
  await p.goto(B + '/webappdev/subscriptions'); await p.waitForLoadState('networkidle');
  ok(await p.locator('text=Monthly revenue (MRR)').count() > 0, 'Subscriptions page shows the revenue report');
  ok(await p.locator('input[name="lim_wall_templates"]').count() > 0, 'plans show editable limits');
  await p.locator('.searchbar input[name="q"]').fill('zzznomatch'); await p.locator('.searchbar button', { hasText: 'Filter' }).click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
  ok(p.url().includes('q=zzznomatch') && await p.locator('text=No workspaces match').count() > 0, 'Subscriptions search filters workspaces (' + p.url() + ')');
  await p.goto(B + '/webappdev/subscriptions'); await p.waitForLoadState('networkidle'); await p.locator('select[aria-label="Show"]').selectOption('demo'); await p.waitForURL(/f=demo/, { timeout: 8000 }).catch(() => {});
  ok(await p.locator('select[aria-label="Show"]').inputValue() === 'demo' && await p.locator('details.card.acc summary b').count() > 3, 'Demo filter keeps its choice and lists workspaces and plans');
  const pl = p.locator('details.acc', { has: p.locator('input[name="lim_wall_templates"]') }).first(); ok(await pl.count() > 0, 'each plan is a collapsible section');
  const csv = await p.request.get(B + '/webappdev/subscriptions/export'); ok(csv.status() === 200 && (await csv.text()).startsWith('workspace'), 'workspaces CSV downloads');
  const cron = await fetch(B + '/api/cron/subscriptions'); ok(cron.status === 401, 'daily check refuses calls without the secret');
  ok(errs.length === 0, 'no server or page errors: ' + errs.join(' | '));
  await b.close(); await stop(); fs.rmSync(DIR, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.error(e); try { await globalThis.PAGE.screenshot({ path: path.join(require('os').tmpdir(), 'e2e-fail.png') }); console.log(await globalThis.PAGE.url()); } catch {} await stop(); process.exit(1); });
