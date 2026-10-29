import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
// In a production build the dev tool is not compiled in at all: this page is just a 404.
export default async function Page(props: { searchParams: Promise<any> }) {
  if (process.env.DEV_TOOLS_BUILD !== '1') notFound();
  else { const M = (await import('./MarkupPage')).default; return M(props); }
}
