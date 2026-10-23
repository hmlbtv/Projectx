# Wall Maker app

Next.js 15 + Postgres. Local dev uses embedded Postgres (`.data/`); setting `DATABASE_URL` uses Neon/hosted Postgres.

    npm install
    npm run dev   # http://localhost:3000

Local demo logins (password `demo-password-1`): master@demo.test, admin@demo.test, manager@demo.test, user@demo.test.

## Production environment variables (Vercel)
- `DATABASE_URL` - set by the Neon integration.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` - creates the first Master Admin on first run (only when there are no users). Change the password in Account after signing in.
- `RESEND_API_KEY`, `MAIL_FROM` - optional; sends invite emails. Without them the invite link is shown to the Manager to pass on.
- `APP_URL` - optional; base URL used in invite links.

## Security
Scrypt-hashed passwords, random session tokens (only the hash is stored), httpOnly/secure/SameSite cookies, 7-day sessions, lockout after 5 failed attempts for 15 minutes, 7-day single-use invite links, security headers.
