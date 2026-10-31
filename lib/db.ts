import { devSite, DEV_SCHEMA } from './devmode';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hashPassword } from './password';

// Embedded Postgres for local dev. For production swap this module for a
// hosted Postgres driver (Neon/Supabase) - the SQL below is plain Postgres.
const g = globalThis as any;

const SCHEMA = `
create table if not exists tenants(id serial primary key, name text not null);
create table if not exists users(id serial primary key, tenant_id int references tenants(id), email text unique not null, name text not null, role text not null, password_hash text, invite_hash text, invite_expires timestamptz, failed_attempts int not null default 0, locked_until timestamptz);
create table if not exists sessions(id text primary key, user_id int not null references users(id) on delete cascade, expires_at timestamptz not null);
create table if not exists sites(id serial primary key, tenant_id int not null, name text not null);
create table if not exists locations(id serial primary key, site_id int not null references sites(id) on delete cascade, name text not null);
create table if not exists rooms(id serial primary key, location_id int not null references locations(id) on delete cascade, name text not null);
create table if not exists wall_templates(id serial primary key, tenant_id int, name text not null, data jsonb not null default '{"assets":[]}');
create table if not exists mv_layouts(id serial primary key, tenant_id int, name text not null, tiles jsonb not null);
create table if not exists room_walls(id serial primary key, room_id int not null references rooms(id) on delete cascade, wall_template_id int not null references wall_templates(id), name text not null);
create table if not exists source_sets(id serial primary key, tenant_id int not null, name text not null, sources jsonb not null default '[]');
alter table source_sets add column if not exists categories jsonb not null default '{}';
create table if not exists integrations(id serial primary key, tenant_id int not null unique, name text not null default '', url text not null default '', auth_header text not null default '', auth_value text not null default '', records_path text not null default '', mapping jsonb not null default '{}', updated_at timestamptz default now());
alter table source_sets add column if not exists cat_names jsonb not null default '[]';
create table if not exists broadcasters(id serial primary key, tenant_id int not null, name text not null);
create table if not exists productions(id serial primary key, broadcaster_id int not null references broadcasters(id) on delete cascade, name text not null);
create table if not exists jobs(id serial primary key, production_id int not null references productions(id) on delete cascade, name text not null, job_date date, final_date date, expires_at date, source_set_id int references source_sets(id));
create table if not exists job_rooms(job_id int not null references jobs(id) on delete cascade, room_id int not null references rooms(id), primary key(job_id, room_id));
create table if not exists job_users(job_id int not null references jobs(id) on delete cascade, user_id int not null references users(id), primary key(job_id, user_id));
create table if not exists monitor_plans(id serial primary key, job_id int not null references jobs(id) on delete cascade, user_id int not null, name text not null, data jsonb not null default '{}', updated_at timestamptz default now());
create table if not exists job_walls(job_id int not null references jobs(id) on delete cascade, room_wall_id int not null references room_walls(id) on delete cascade, primary key(job_id, room_wall_id));
create table if not exists wall_links(id serial primary key, job_id int not null references jobs(id) on delete cascade, room_wall_id int not null references room_walls(id) on delete cascade, email text not null, access text not null default 'edit', token_hash text unique not null, revoked boolean not null default false, created_by int, created_at timestamptz not null default now());
create table if not exists job_wall_plans(job_id int not null references jobs(id) on delete cascade, room_wall_id int not null references room_walls(id) on delete cascade, data jsonb not null default '{}', updated_at timestamptz not null default now(), updated_by int, primary key(job_id, room_wall_id));
-- One shared plan per wall in a Job. Plans saved per person before this are folded in once (the most recent save of each wall wins).
insert into job_wall_plans(job_id, room_wall_id, data, updated_at, updated_by)
  select distinct on (mp.job_id, w.id) mp.job_id, w.id, k.value, mp.updated_at, mp.user_id
  from monitor_plans mp cross join lateral jsonb_each(mp.data) k
  join room_walls w on w.id = (case when k.key ~ '^[0-9]+$' then k.key::int end)
  where not exists (select 1 from job_wall_plans) and exists (select 1 from job_walls jw where jw.job_id=mp.job_id and jw.room_wall_id=w.id)
  order by mp.job_id, w.id, mp.updated_at desc nulls last;
alter table monitor_plans add column if not exists link_id int references wall_links(id) on delete cascade;
create table if not exists user_emails(email text primary key, user_id int not null references users(id) on delete cascade, verified boolean not null default false, token_hash text, expires_at timestamptz);
create table if not exists attempts(key text not null, at timestamptz not null default now());
create index if not exists attempts_key_at on attempts(key, at);
alter table attempts add column if not exists id bigserial;
create table if not exists destination_sets(id serial primary key, tenant_id int not null references tenants(id) on delete cascade, site_id int not null references sites(id) on delete cascade, name text not null);
create table if not exists destinations(id serial primary key, set_id int not null references destination_sets(id) on delete cascade, name text not null, pos int not null default 0);
create index if not exists ix_dest_set on destinations(set_id, pos);
create table if not exists settings(key text primary key, value text not null);
alter table sessions add column if not exists last_active timestamptz not null default now();
alter table tenants add column if not exists plan text not null default 'demo';
alter table tenants add column if not exists max_wall_templates int not null default 1;
alter table tenants add column if not exists max_wall_defaults int not null default 5;
alter table wall_templates add column if not exists defaults jsonb not null default '[]';
alter table tenants add column if not exists max_walls_per_broadcaster int not null default 1;
alter table wall_templates add column if not exists broadcaster_id int references broadcasters(id) on delete set null;
alter table wall_templates add column if not exists site_id int references sites(id) on delete set null;
create table if not exists wall_images(id serial primary key, tenant_id int not null, name text not null, mime text not null, w int not null, h int not null, data bytea not null, created_at timestamptz not null default now());
create table if not exists audit_log(id bigserial primary key, tenant_id int, user_id int, who text not null, action text not null, detail text not null default '', at timestamptz not null default now());
create index if not exists ix_audit_tenant_at on audit_log(tenant_id, at desc);
alter table mv_layouts add column if not exists extras jsonb not null default '{}';
alter table wall_images add column if not exists alpha boolean not null default false;
create index if not exists ix_wall_images_tenant on wall_images(tenant_id);
create index if not exists ix_wall_templates_site on wall_templates(site_id);
alter table tenants add column if not exists max_broadcasters int not null default 2;
alter table tenants add column if not exists max_productions int not null default 3;
alter table tenants add column if not exists max_jobs_per_production int not null default 4;
alter table tenants add column if not exists created_at timestamptz not null default now();
alter table tenants add column if not exists status text not null default 'active';
create table if not exists mv_tiles(id serial primary key, tenant_id int, name text not null, assets jsonb not null default '[]', created_at timestamptz not null default now());
alter table users add column if not exists suspended boolean not null default false;
create table if not exists email_log(id serial primary key, at timestamptz not null default now(), to_email text not null, subject text not null, ok boolean not null, error text, resend_id text);
create index if not exists email_log_at on email_log(at);
alter table users add column if not exists created_at timestamptz not null default now();
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists login_count int not null default 0;
create table if not exists login_events(session_id text primary key, user_id int not null, tenant_id int, started_at timestamptz not null default now(), last_seen_at timestamptz not null default now());
create index if not exists login_events_tenant on login_events(tenant_id, started_at);
alter table users add column if not exists email_verified boolean not null default true;
alter table users add column if not exists max_jobs int not null default 5;
alter table users add column if not exists verify_hash text;
alter table users add column if not exists verify_expires timestamptz;
create table if not exists comments(id serial primary key, job_id int not null references jobs(id) on delete cascade, room_id int not null, user_id int not null, body text not null, created_at timestamptz default now());
alter table comments add column if not exists guest_email text;
alter table comments add column if not exists room_wall_id int;
create table if not exists comment_seen(user_id int not null, job_id int not null, room_wall_id int not null, seen_at timestamptz not null default now(), primary key(user_id, job_id, room_wall_id));
create table if not exists contacts(id serial primary key, tenant_id int not null references tenants(id) on delete cascade, name text not null, email text not null, company text not null default '', created_at timestamptz not null default now(), unique(tenant_id,email));
create table if not exists production_contacts(production_id int not null references productions(id) on delete cascade, contact_id int not null references contacts(id) on delete cascade, primary key(production_id, contact_id));
alter table wall_links add column if not exists contact_id int references contacts(id) on delete set null;
alter table users add column if not exists totp_secret text;
alter table users add column if not exists totp_enabled boolean not null default false;
alter table users add column if not exists totp_pending text;
alter table users add column if not exists totp_recovery jsonb not null default '[]';
alter table users add column if not exists totp_last bigint not null default 0;
create table if not exists login_2fa(id text primary key, user_id int not null references users(id) on delete cascade, expires_at timestamptz not null, tries int not null default 0);
create index if not exists ix_users_tenant on users(tenant_id);
create index if not exists ix_sites_tenant on sites(tenant_id);
create index if not exists ix_wall_templates_tenant on wall_templates(tenant_id);
create index if not exists ix_mv_layouts_tenant on mv_layouts(tenant_id);
create index if not exists ix_mv_tiles_tenant on mv_tiles(tenant_id);
create index if not exists ix_source_sets_tenant on source_sets(tenant_id);
create index if not exists ix_broadcasters_tenant on broadcasters(tenant_id);
create index if not exists ix_productions_broadcaster on productions(broadcaster_id);
create index if not exists ix_jobs_production on jobs(production_id);
create index if not exists ix_job_users_user on job_users(user_id);
create index if not exists ix_sessions_user on sessions(user_id);
create index if not exists ix_wall_links_token on wall_links(token_hash);
create index if not exists ix_wall_links_email on wall_links(lower(email));
create index if not exists ix_monitor_plans_job on monitor_plans(job_id, user_id);
create index if not exists ix_comments_job on comments(job_id);
create index if not exists ix_locations_site on locations(site_id);
create index if not exists ix_rooms_location on rooms(location_id);
create index if not exists ix_room_walls_room on room_walls(room_id);
create index if not exists ix_job_walls_rw on job_walls(room_wall_id);
`;

function grid(cols: number, rows: number) {
  const tiles: any[] = []; let n = 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    tiles.push({ n: n++, x: Math.round((c * 1920) / cols), y: Math.round((r * 1080) / rows), w: Math.round(1920 / cols), h: Math.round(1080 / rows) });
  return tiles;
}
function oneAndFive() {
  const t: any[] = [{ n: 1, x: 0, y: 0, w: 1280, h: 720 }];
  [[1280,0],[1280,360],[0,720],[640,720],[1280,720]].forEach(([x,y],i)=>t.push({n:i+2,x,y,w:640,h:360}));
  return t;
}

// Bump this when the start-up code below (not SCHEMA) changes and must run again.
const MIGRATION_REV = 'r1';
type Client = { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>; exec: (sql: string) => Promise<any> };

async function init(): Promise<Client> {
  let client: Client;
  if (process.env.DATABASE_URL) {
    // Hosted Postgres (Neon) - used on Vercel and anywhere DATABASE_URL is set.
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    client = { query: (sql, params) => pool.query(sql, params), exec: async sql => { await pool.query(sql); } };
  } else {
    // Local dev: embedded Postgres persisted under .data
    const dir = process.env.PGLITE_DIR || './.data/pg';
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir) as unknown as Client;
  }
  // Start-up work (creating tables, one-time upgrades, first-run data) only runs when the schema or sign-in settings changed, so most cold starts skip it.
  const ver = createHash('sha1').update(SCHEMA + MIGRATION_REV + (devSite() ? DEV_SCHEMA : '') + (process.env.ADMIN_EMAIL ?? '') + (process.env.TENANT_NAME ?? '')).digest('hex');
  try { if ((await client.query("select value from settings where key='schema_ver'")).rows[0]?.value === ver) return client; } catch { /* first run: no settings table yet */ }
  const hadTiles = (await client.query("select to_regclass('public.mv_tiles') t")).rows[0].t;
  const hadTenants = (await client.query("select to_regclass('public.tenants') t")).rows[0].t;
  const hadJobWalls = (await client.query("select to_regclass('public.job_walls') t")).rows[0].t;
  const hadAlpha = (await client.query("select 1 from information_schema.columns where table_name='wall_images' and column_name='alpha'")).rows.length;
  await client.exec(SCHEMA);
  if (devSite()) await client.exec(DEV_SCHEMA);
  if (!hadAlpha) await client.exec("update wall_images set alpha=true where mime in ('image/png','image/svg+xml')");
  // Wall Templates now belong to a Site: carry over from any Room they were already placed in.
  await client.exec('update wall_templates w set site_id=(select l.site_id from room_walls rw join rooms r on r.id=rw.room_id join locations l on l.id=r.location_id where rw.wall_template_id=w.id order by rw.id limit 1) where w.site_id is null');
  // One-time: Jobs used to be given whole Rooms; carry that over as the Room's current walls.
  if (!hadJobWalls) await client.query('insert into job_walls(job_id,room_wall_id) select jr.job_id, rw.id from job_rooms jr join room_walls rw on rw.room_id=jr.room_id on conflict do nothing');
  // One-time: the MV canvas changed from 1600x900 to 1920x1080, so scale saved layouts and tiles by 1.2.
  if (hadTenants && !(await client.query("select 1 from settings where key='canvas'")).rows.length) {
    const sc = (a: any[]) => a.map(o => ({ ...o, x: Math.round(o.x * 1.2), y: Math.round(o.y * 1.2), w: Math.round(o.w * 1.2), h: Math.round(o.h * 1.2) }));
    for (const r of (await client.query('select id,tiles from mv_layouts')).rows) await client.query('update mv_layouts set tiles=$1 where id=$2', [JSON.stringify(sc(r.tiles || [])), r.id]);
    if (hadTiles) for (const r of (await client.query('select id,assets from mv_tiles')).rows) await client.query('update mv_tiles set assets=$1 where id=$2', [JSON.stringify(sc(r.assets || [])), r.id]);
  }
  await client.query("insert into settings(key,value) values('canvas','1080') on conflict (key) do nothing");
  await bootstrap(client);
  if (!hadTiles) await seedTiles(client);
  await client.query("insert into settings(key,value) values('schema_ver',$1) on conflict (key) do update set value=excluded.value", [ver]);
  return client;
}

// Standard MV Tiles from the site admin, shared with every tenant (created once, when the table is first made).
async function seedTiles(db: Client) {
  const a = (id: string, type: string, name: string, x: number, y: number, w: number, h: number, props: any) => ({ id, type, name, x, y, w, h, props });
  const umd = a('u1', 'umd', 'UMD', 0, 936, 1920, 144, { text: 'SOURCE NAME' }), tally = a('t1', 'tally', 'Tally', 1788, 12, 120, 120, { state: 'red', style: 'lamp' });
  const meters = a('m1', 'audio', 'Audio meters', 1764, 156, 132, 744, { channels: 2, orientation: 'vertical' }), clock = a('c1', 'clock', 'Clock / timecode', 24, 24, 504, 132, { format: 'HH:MM:SS' });
  const sets: [string, any[]][] = [['Standard - UMD + Tally', [umd, tally]], ['Standard - UMD + Tally + Audio meters', [umd, tally, meters]], ['Standard - Full (UMD, Tally, Meters, Clock)', [umd, tally, meters, clock]]];
  for (const [name, assets] of sets) await db.query('insert into mv_tiles(tenant_id,name,assets) values(null,$1,$2)', [name, JSON.stringify(assets)]);
}

// First run only: presets, and the first Master Admin from ADMIN_EMAIL / ADMIN_PASSWORD.
async function bootstrap(db: Client) {
  const q = async (s: string, p: any[] = []) => (await db.query(s, p)).rows as any[];
  if ((await q('select count(*)::int c from tenants'))[0].c === 0) {
    // Tenant 1 belongs to the site owner: unlimited wall templates.
    await q("insert into tenants(name,plan,max_wall_templates,max_walls_per_broadcaster) values($1,'owner',100000,100000)", [process.env.TENANT_NAME || 'Site Owner']);
    await seedPresets(db);
  }
  if (process.env.ADMIN_EMAIL) await q("update users set role='webappdev', email_verified=true where email=$1", [process.env.ADMIN_EMAIL.toLowerCase()]);
  await q("update tenants set plan='owner', max_wall_templates=100000, max_walls_per_broadcaster=100000, max_broadcasters=100000, max_productions=100000, max_jobs_per_production=100000 where id=1 and plan='demo'");
  if ((await q('select count(*)::int c from users'))[0].c === 0) {
    const email = process.env.ADMIN_EMAIL?.toLowerCase(), pw = process.env.ADMIN_PASSWORD;
    if (email && pw) await q("insert into users(tenant_id,email,name,role,password_hash) values(1,$1,'Master Admin','webappdev',$2)", [email, await hashPassword(pw)]);
    else if (!process.env.DATABASE_URL) await seedDemo(db); // local only: demo users, password "demo-password-1"
    else console.warn('No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first Master Admin.');
  }
}

async function seedPresets(db: Client) {
  const q = async (s: string, p: any[] = []) => (await db.query(s, p)).rows as any[];
  // Preset MV layouts (WebAppDev, tenant_id null), 16:9 frame = 1920x1080
  const presets: [string, any][] = [['1 up',grid(1,1)],['2 up',grid(2,1)],['4 up (2x2)',grid(2,2)],['6 up (3x2)',grid(3,2)],['9 up (3x3)',grid(3,3)],['16 up (4x4)',grid(4,4)],['1 + 5',oneAndFive()]];
  for (const [n,tiles] of presets) await q('insert into mv_layouts(tenant_id,name,tiles) values(null,$1,$2)',[n,JSON.stringify(tiles)]);
}

async function seedDemo(db: Client) {
  const q = async (s: string, p: any[] = []) => (await db.query(s, p)).rows as any[];
  const t = 1, h = await hashPassword('demo-password-1');
  const users: [string,string,string][] = [
    ['master@demo.test','Maya Master','master_admin'],['admin@demo.test','Alex Admin','admin'],
    ['manager@demo.test','Morgan Manager','manager'],['user@demo.test','Uma User','user'],
  ];
  for (const [e,n,r] of users) await q('insert into users(email,name,role,tenant_id,password_hash) values($1,$2,$3,$4,$5)',[e,n,r,t,h]);
  const site = (await q("insert into sites(tenant_id,name) values($1,'London Studios') returning id",[t]))[0].id;
  const loc = (await q("insert into locations(site_id,name) values($1,'Gallery Floor') returning id",[site]))[0].id;
  const room = (await q("insert into rooms(location_id,name) values($1,'Gallery A') returning id",[loc]))[0].id;
  const mon = (id:string,x:number,y:number)=>({id,type:'monitor',name:'Monitor '+id,x,y,w:320,h:180});
  const wall = {assets:[mon('1',0,0),mon('2',320,0),mon('3',0,180),mon('4',320,180)]};
  const wt = (await q("insert into wall_templates(tenant_id,site_id,name,data) values($1,$2,'Gallery 2x2 Wall',$3) returning id",[t,site,JSON.stringify(wall)]))[0].id;
  await q("insert into room_walls(room_id,wall_template_id,name) values($1,$2,'Left Wall')",[room,wt]);
  const ss = (await q("insert into source_sets(tenant_id,name,sources) values($1,'Studio Sources',$2) returning id",[t,JSON.stringify(['Camera 1','Camera 2','Camera 3','Camera 4','Graphics','Playout','Replay','Program','Preview','Remote Guest 1'])]))[0].id;
  const b = (await q("insert into broadcasters(tenant_id,name) values($1,'Demo Broadcaster') returning id",[t]))[0].id;
  const p = (await q("insert into productions(broadcaster_id,name) values($1,'Evening Show') returning id",[b]))[0].id;
  const j = (await q("insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id) values($1,'Show Day 1',current_date+1,current_date+1,current_date+6,$2) returning id",[p,ss]))[0].id;
  await q('insert into job_rooms(job_id,room_id) values($1,$2)',[j,room]);
  await q('insert into job_walls(job_id,room_wall_id) select $1,id from room_walls where room_id=$2',[j,room]);
  const u = (await q("select id from users where email='user@demo.test'"))[0].id;
  await q('insert into job_users(job_id,user_id) values($1,$2)',[j,u]);
}

export async function db(): Promise<Client> {
  if (!g.__wm) g.__wm = init();
  return g.__wm;
}
export async function rows<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (process.env.QLOG) console.log('Q', sql.replace(/\s+/g, ' ').slice(0, 70));
  return (await (await db()).query(sql, params)).rows as T[];
}
export async function one<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return (await rows<T>(sql, params))[0];
}
