# personal-investing-app

A personal investing dashboard. See [`PROJECT.md`](./PROJECT.md) for the full
spec and roadmap.

## Layout

```
web/        Next.js 14 dashboard (Vercel-deployable)
supabase/   SQL migrations applied to the Supabase project
routine/    Claude Code cloud routine (Phase 3, scaffold only)
docs/       Architecture notes
```

## Phase 1 quick start

```bash
cd web
pnpm install
cp .env.local.example .env.local   # fill values; see web/.env.local.example
pnpm dev
```

Open http://localhost:3000.

## Disclaimer

This software displays information for personal use only. It is not financial
advice.
