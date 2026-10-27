# TelePlanner app

Next.js 15 + Postgres. Local dev uses embedded Postgres (`.data/`); setting `DATABASE_URL` uses Neon/hosted Postgres.

    npm install
    npm run dev   # http://localhost:3000

Local demo logins (password `demo-password-1`): master@demo.test, admin@demo.test, manager@demo.test, user@demo.test.

## Production environment variables (Vercel)
- `DATABASE_URL` - set by the Neon integration.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` - creates the site admin (WebAppDev) on first run. That account sees the Site admin page where tenant plans and Wall Template limits are set. Change the password in Account after signing in.
- `RESEND_API_KEY`, `MAIL_FROM` - sends verification, invite and password-reset emails (Resend, free tier, available in the Vercel Marketplace). `MAIL_FROM` must use a domain verified in Resend, e.g. `TelePlanner <hello@yourdomain.com>`; the default test sender only delivers to your own address. In production, sign-up (including guest sign-up) is refused until `RESEND_API_KEY` is set, so an unverified address is never trusted. Outside production, sign-ups are auto-verified for local testing.
- Guests (One-Time Users) create an account from their first invitation link and verify their email, so `RESEND_API_KEY` is required in production (without it guest sign-up is refused). Extra email addresses (Account page) always need working email to confirm. `DEV_SHOW_CODES=1` shows confirmation links on screen for local testing only - never set it in production.
- `APP_URL` - optional; base URL used in invite links.

## Security
HTTPS (Vercel), HSTS, strict Content-Security-Policy with per-request nonce, `__Host-` session cookie, rate limits on sign-in, sign-up, reset and invites, tenant checks on every id, parameterised SQL, `npm audit` clean. Set `APP_URL` to your site address so emailed links never depend on request headers.

Details:
Scrypt-hashed passwords, random session tokens (only the hash is stored), httpOnly/secure/SameSite cookies, 7-day sessions, lockout after 5 failed attempts for 15 minutes, 7-day single-use invite links, security headers.

## Accounts and plans
New people create a demo account at /signup (name, company, email, password): they get their own tenant, become its Master Admin, and are limited to 1 Wall Template. They invite colleagues from Team. The site admin raises a tenant's limit and sets its plan name at /webappdev (ready to link to a subscription later).
