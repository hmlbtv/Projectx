import { NextResponse, type NextRequest } from 'next/server';

// Per-request nonce so only our own scripts can run (Content-Security-Policy).
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    dev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ');
  const h = new Headers(req.headers);
  h.set('x-nonce', nonce); h.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: h } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}
export const config = { matcher: [{ source: '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }] };
