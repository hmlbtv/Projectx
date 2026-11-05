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
  env: {
    DEV_TOOLS_BUILD: process.env.VERCEL_ENV === 'production' ? '0' : '1',
    // Shown in the dev site's version strip, so a new build is easy to spot.
    DEV_BUILD_INFO: `${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)}|${new Date().toISOString()}`,
  },
  async headers() { return [{ source: '/:path*', headers }]; },
};
