import { runSweep } from '@/lib/subscriptions';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Not allowed', { status: 401 });
  return Response.json(await runSweep());
}
