// The Dev comment tools exist only on the dev (preview) site: DEV_FEEDBACK=1 AND never when Vercel says this is production.
export const devSite = () => process.env.DEV_FEEDBACK === '1' && process.env.VERCEL_ENV !== 'production';

export const DEV_SCHEMA = `
alter table users add column if not exists dev_comment boolean not null default false;
create table if not exists dev_blocks(id serial primary key, name text not null, created_at timestamptz not null default now());
create table if not exists dev_notes(id serial primary key, user_id int not null references users(id) on delete cascade, page text not null, kind text not null default 'note',
  body text not null default '', severity int not null default 2, x int, y int, vw int, drawing jsonb,
  status text not null default 'open', archived boolean not null default false, block_id int references dev_blocks(id) on delete set null,
  parent_id int references dev_notes(id) on delete cascade, created_at timestamptz not null default now(), done_at timestamptz);
alter table dev_notes add column if not exists device text not null default 'desktop';
create index if not exists dev_notes_page on dev_notes(page);
`;
