const headers = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
export default {
  serverExternalPackages: ['@electric-sql/pglite', 'sharp'],
  poweredByHeader: false,
  // Dev comments are compiled OUT of a production build (Vercel sets VERCEL_ENV=production for the live site), not just switched off at run time.
  env: { DEV_TOOLS_BUILD: process.env.VERCEL_ENV === 'production' ? '0' : '1' },
  async headers() { return [{ source: '/:path*', headers }]; },
};
