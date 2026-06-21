# AI Humanizer

Minimal Next.js app for humanizing Indian Chartered Accountant report text in
natural professional Indian English. The app uses Vercel-hosted Next.js route
handlers, Supabase Auth/Postgres, and Gemini server-side generation.

## Getting Started

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODELS=gemini-2.5-flash-lite
```

Apply the Supabase migration in `supabase/migrations/001_initial_schema.sql`,
then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- Gemini calls only run in `src/app/api/humanize/route.ts`.
- Supabase sessions are refreshed through `src/proxy.ts`.
- Google OAuth redirects through `src/app/auth/callback/route.ts`.
- RLS policies restrict every user-owned table to `auth.uid()`.
- Temporary Gemini 429/5xx overloads are retried and then fall back to
  `GEMINI_FALLBACK_MODELS`.
- The product is a professional humanizing assistant, not an AI-detection bypass tool.
- The Supabase table is still named `rewrites` internally for migration
  compatibility.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```

Configure the same environment variables in Vercel before deploying.
