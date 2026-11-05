# Huddl

Huddl runs a daily workplace question for each company. Employees vote from their phone or laptop; office displays show live results. The landing page and browser-only concept demo remain available at `/` and `/#/demo`.

## Live pilot

The multi-company app is at `/workspace?org=COMPANY-SLUG&view=vote`. Replace `vote` with `display` for an office screen or `admin` for HR. The Huddl owner uses `/workspace?view=platform` to create and pause company spaces, see participation and screen links, and send HR invitations.

HR can create questions with 2–8 choices, publish or close them, manage screen links, see members and participation, and upload a logo. A logo upload suggests colors; the saved color themes the entire company portal. Buttons show progress and action toasts.

Employees verify their email on first use. Their name and department are kept in their member record, and their secure session lasts 90 days with renewal during use. Social votes can include a fresh camera photo when the employee opts to appear on the office screen. Photos are stored on the vote only while its question is live; a database trigger deletes them when HR closes or replaces the question or pauses the company. Anonymous votes store no photo.

Each company has named display screens with a separate link. Deactivating a screen invalidates its link. HR owners receive a one-time link to set their password. The link expires after seven days and can be resent from the platform dashboard. Admin passwords are never included in email.

For an existing owner who needs a first invitation before signing in, set `OWNER_EMAIL` with the database and email environment variables, then run `node scripts/invite-owner.mjs`.

## Run locally

```bash
npm install
npm run db:migrate
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the values before migrating. `DATABASE_URL` should use the Supabase transaction pooler for the Vercel API. The schema in `db/schema.sql` is idempotent and includes tenant tables, screens, invitations, vote photo cleanup triggers, and row level security. The browser never connects directly to Postgres.

`SESSION_SECRET` must be at least 32 characters. `SETUP_SECRET` protects the first-owner setup endpoint. Set `PLATFORM_ADMIN_EMAIL` to that owner's email. `PUBLIC_SITE_URL` is the deployed site origin used in invitations.

For email, use a Resend sending key as `RESEND_API_KEY`. Without a domain, use `EMAIL_FROM=Huddl <onboarding@resend.dev>` and set `EMAIL_TEST_RECIPIENT` to the email address on the Resend account. Huddl then routes all sign-in codes and HR invitations to that one inbox for testing; each message names the intended user. Remove `EMAIL_TEST_RECIPIENT` and verify a sending domain before piloting with multiple employees.

The Vercel Marketplace Resend integration currently requires a Vercel-purchased domain, so a direct Resend key is the domainless test path. Keep credentials only in local env files or Vercel project settings, never in Git.

## Verification

`npm test` runs browser demo and live-workspace UI tests. The database integration test also runs when `DATABASE_URL` is set; it creates a disposable company, tests an HR invite, screen activation, a live photo vote, and photo deletion on close. `npm run build` checks the Vercel bundle.

## Current pilot scope

Live screens poll every five seconds. There is no billing, automatic question scheduling, AI policy drafting, or organization SSO yet. Photos and logos are kept as small data URLs in Postgres for this pilot; object storage will be appropriate before a larger rollout.
