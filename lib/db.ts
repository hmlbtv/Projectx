import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';
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
create table if not exists broadcasters(id serial primary key, tenant_id int not null, name text not null);
create table if not exists productions(id serial primary key, broadcaster_id int not null references broadcasters(id) on delete cascade, name text not null);
create table if not exists jobs(id serial primary key, production_id int not null references productions(id) on delete cascade, name text not null, job_date date, final_date date, expires_at date, source_set_id int references source_sets(id));
create table if not exists job_rooms(job_id int not null references jobs(id) on delete cascade, room_id int not null references rooms(id), primary key(job_id, room_id));
create table if not exists job_users(job_id int not null references jobs(id) on delete cascade, user_id int not null references users(id), primary key(job_id, user_id));
create table if not exists monitor_plans(id serial primary key, job_id int not null references jobs(id) on delete cascade, user_id int not null, name text not null, data jsonb not null default '{}', updated_at timestamptz default now());
alter table tenants add column if not exists plan text not null default 'demo';
alter table tenants add column if not exists max_wall_templates int not null default 1;
alter table users add column if not exists email_verified boolean not null default true;
alter table users add column if not exists max_jobs int not null default 5;
alter table users add column if not exists verify_hash text;
alter table users add column if not exists verify_expires timestamptz;
create table if not exists comments(id serial primary key, job_id int not null references jobs(id) on delete cascade, room_id int not null, user_id int not null, body text not null, created_at timestamptz default now());
`;

function grid(cols: number, rows: number) {
  const tiles: any[] = []; let n = 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    tiles.push({ n: n++, x: (c * 1600) / cols, y: (r * 900) / rows, w: 1600 / cols, h: 900 / rows });
  return tiles;
}
function oneAndFive() {
  const t: any[] = [{ n: 1, x: 0, y: 0, w: 1066, h: 600 }];
  [[1066,0],[1066,300],[0,600],[533,600],[1066,600]].forEach(([x,y],i)=>t.push({n:i+2,x,y,w:533,h:300}));
  return t;
}

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
  await client.exec(SCHEMA);
  await bootstrap(client);
  return client;
}

// First run only: presets, and the first Master Admin from ADMIN_EMAIL / ADMIN_PASSWORD.
async function bootstrap(db: Client) {
  const q = async (s: string, p: any[] = []) => (await db.query(s, p)).rows as any[];
  if ((await q('select count(*)::int c from tenants'))[0].c === 0) {
    // Tenant 1 belongs to the site owner: unlimited wall templates.
    await q("insert into tenants(name,plan,max_wall_templates) values($1,'owner',100000)", [process.env.TENANT_NAME || 'Site Owner']);
    await seedPresets(db);
  }
  if (process.env.ADMIN_EMAIL) await q("update users set role='webappdev', email_verified=true where email=$1", [process.env.ADMIN_EMAIL.toLowerCase()]);
  await q("update tenants set plan='owner', max_wall_templates=100000 where id=1 and plan='demo'");
  if ((await q('select count(*)::int c from users'))[0].c === 0) {
    const email = process.env.ADMIN_EMAIL?.toLowerCase(), pw = process.env.ADMIN_PASSWORD;
    if (email && pw) await q("insert into users(tenant_id,email,name,role,password_hash) values(1,$1,'Master Admin','webappdev',$2)", [email, await hashPassword(pw)]);
    else if (!process.env.DATABASE_URL) await seedDemo(db); // local only: demo users, password "demo-password-1"
    else console.warn('No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first Master Admin.');
  }
}

async function seedPresets(db: Client) {
  const q = async (s: string, p: any[] = []) => (await db.query(s, p)).rows as any[];
  // Preset MV layouts (WebAppDev, tenant_id null), 16:9 frame = 1600x900
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
  const wt = (await q("insert into wall_templates(tenant_id,name,data) values($1,'Gallery 2x2 Wall',$2) returning id",[t,JSON.stringify(wall)]))[0].id;
  await q("insert into room_walls(room_id,wall_template_id,name) values($1,$2,'Left Wall')",[room,wt]);
  const ss = (await q("insert into source_sets(tenant_id,name,sources) values($1,'Studio Sources',$2) returning id",[t,JSON.stringify(['Camera 1','Camera 2','Camera 3','Camera 4','Graphics','Playout','Replay','Program','Preview','Remote Guest 1'])]))[0].id;
  const b = (await q("insert into broadcasters(tenant_id,name) values($1,'Demo Broadcaster') returning id",[t]))[0].id;
  const p = (await q("insert into productions(broadcaster_id,name) values($1,'Evening Show') returning id",[b]))[0].id;
  const j = (await q("insert into jobs(production_id,name,job_date,final_date,expires_at,source_set_id) values($1,'Show Day 1',current_date+1,current_date+1,current_date+6,$2) returning id",[p,ss]))[0].id;
  await q('insert into job_rooms(job_id,room_id) values($1,$2)',[j,room]);
  const u = (await q("select id from users where email='user@demo.test'"))[0].id;
  await q('insert into job_users(job_id,user_id) values($1,$2)',[j,u]);
}

export async function db(): Promise<Client> {
  if (!g.__wm) g.__wm = init();
  return g.__wm;
}
export async function rows<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return (await (await db()).query(sql, params)).rows as T[];
}
export async function one<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return (await rows<T>(sql, params))[0];
}
