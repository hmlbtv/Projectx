# Wall Maker app

Next.js 15 + Postgres (embedded PGlite for local dev, data in `.data/`).

    npm install
    npm run dev      # http://localhost:3000, sign in as any seeded demo user

Spec decisions are in `../wall-maker-chat-export/chat-summary.md`. Production TODO: real auth + email invites, hosted Postgres (swap `lib/db.ts`), export/print, notifications.
