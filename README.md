# Huddl interactive demo

A browser-based concept demo for Huddl, a daily workplace question and live office display.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. `npm test` checks the main demo interactions. `npm run build` creates the Vercel-ready `dist/` folder.

## Demo pages

- `/#/` — landing page
- `/#/demo` — office display
- `/#/vote` — employee vote flow
- `/#/admin` — HR question and brand controls

Votes and settings are stored in this browser's `localStorage` and synchronized between tabs on the same device. The QR code points to the vote page, but votes made on a different device will not reach this display yet. This is a concept demo, not a production multi-company service.

The HR studio supports 2–8 answer choices, Egyptian-themed question presets, a live preview, and company logo upload. Logo colors are sampled locally in the browser; the logo and chosen accent are saved with the demo settings when changes are published. Publishing a different question or choice set resets the old demo votes.

## Production next steps

The production pilot is at `/workspace?org=YOUR-SLUG&view=vote`. Use `view=display` for the shared screen, `view=admin` for the company HR dashboard, and `view=platform` for the Huddl owner dashboard. The original concept demo remains available at `/#/demo`.

### Configure the pilot

1. Set the variables shown in `.env.example` in a local `.env.local` and in Vercel. Never commit actual values. Use a fresh, long `SESSION_SECRET` and `SETUP_SECRET`.
2. For Vercel's serverless API, set `DATABASE_URL` to the **Supabase shared transaction pooler** connection string from the project dashboard. The direct `db.*.supabase.co:5432` URL is suitable for migrations but is not the recommended serverless connection. Run `npm run db:migrate` with that direct URL in a local environment that can reach it.
3. Configure a verified sending domain with Resend and set `RESEND_API_KEY` plus `EMAIL_FROM`. Employees receive a six-digit code. Admins sign in with the password created during setup.
4. After the migration, create the first company with `POST /api/setup`, using `X-Setup-Secret` and JSON fields `slug`, `name`, `domain`, `email`, `admin_name`, and `password` (12+ characters). Set `PLATFORM_ADMIN_EMAIL` to that owner email for `/workspace?view=platform`.
5. Enable Speed Insights for the Vercel project. This Vite app uses `injectSpeedInsights()` from `@vercel/speed-insights`; the `/next` component applies only to Next.js.

The database schema is in `db/schema.sql`. All data records carry an organization ID and server endpoints enforce the company boundary. One vote per member per poll is also enforced by a unique database constraint. Public screens show names only when an employee opts in; anonymous questions show totals only. HR can create drafts, publish or close questions, change branding, and inspect members and participation. The platform owner can monitor companies and pause a company space.

### Current limits

This implementation needs the database and email environment values before the live workspace can run. Live screens refresh every five seconds. Photos are supported in the browser-only demo but are intentionally omitted from the multi-company flow until private object storage and moderation are ready. Question scheduling, policy upload and AI drafting, and billing are not implemented yet.
