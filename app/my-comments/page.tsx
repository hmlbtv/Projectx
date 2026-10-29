import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (process.env.DEV_TOOLS_BUILD !== '1') notFound();
  else { const M = (await import('./MyCommentsPage')).default; return M(); }
}
