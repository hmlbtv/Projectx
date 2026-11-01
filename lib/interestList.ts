import { rows } from './db';
// Interest registrations from the LIVE holding page. The dev site reads the live database (read only) when LIVE_DATABASE_URL is set; otherwise it shows its own.
export async function loadInterest(): Promise<{ list: any[]; source: 'live' | 'this site' }> {
  const url = process.env.LIVE_DATABASE_URL;
  if (!url) return { list: await rows('select id,name,company,email,comment,created_at from interest order by id desc limit 1000'), source: 'this site' };
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: url });
  try { return { list: (await pool.query('select id,name,company,email,comment,created_at from interest order by id desc limit 1000')).rows, source: 'live' }; }
  finally { await pool.end().catch(() => {}); }
}
