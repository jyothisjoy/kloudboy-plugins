---
name: nextjs-prisma
description: Kloudboy rules for Next.js + Prisma projects. Use when building or reviewing code in a project whose .factory/config.yml has stack nextjs-prisma.
---
# Next.js + Prisma stack rules

Standard stack: Next.js (App Router), Prisma, PostgreSQL, NextAuth/JWT, Tailwind, shadcn/ui, Recharts.
The project's own CLAUDE.md wins where it differs.

## Next.js
- Next.js 15/16 projects use `proxy.ts` for request interception. Never convert it to `middleware.ts`.
- Server Components by default; add `"use client"` only where interactivity needs it.
- Use shadcn/ui components before writing new primitives. Don't add another component library.

## Prisma
- Prisma only (no Drizzle, no raw SQL unless the task says so).
- Schema changes always go through migrations: edit `schema.prisma`, then run
  `prisma migrate dev --name <change>` immediately. Never `prisma db push`.
- Stop the dev server before `prisma generate` (Windows file locks).
- Migration files under `prisma/migrations/` are protected: only create new ones via migrate, never hand-edit.

## Settings
- Operational settings (SMTP, cron schedules, thresholds, branding) live in the database
  `AppSetting` table, not in env vars. Env vars are for secrets and connection strings only.

## Review checklist
- Server actions and route handlers check auth and validate input.
- No secrets or env values in client components.
- New queries select only needed fields; watch for N+1 in loops.
