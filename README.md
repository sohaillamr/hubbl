# Huddl

Huddl runs a daily workplace question for each company. Employees vote from their phone or laptop; office displays show live results. The landing page and browser-only concept demo remain available at `/` and `/#/demo`.

## Live pilot

The multi-company app is at `/workspace?org=COMPANY-SLUG&view=vote`. Replace `vote` with `display` for an office screen or `admin` for HR. The Huddl owner uses `/workspace?view=platform` to create companies with a seat and live-screen allowance, adjust those limits, pause spaces, and see participation and screen links. New companies start with the selected number of named screen links.

HR can upload a CSV or paste employee emails, up to the assigned seat allowance, and remove or restore individual access. Companies accept only emails on that list; existing employee accounts are carried into it during migration. On first use, an employee enters an HR-listed email, name, and department; job title is optional. No employee email is sent. Their browser receives a renewable 90-day session. Removing an email revokes its access. On a new device, a returning employee enters only their email and keeps the saved profile. Email-only entry does not prove address ownership, so this pilot access method should not be used for sensitive employee data.

HR can also create questions with 2–8 choices, publish or close them, manage screen names and locations within the screen limit, see members and participation, and upload a logo. A logo upload suggests colors; the saved color themes the entire company portal. Buttons show progress and action toasts.

The HR dashboard has a bottom screen picker for opening any active display. HR can save a company description and upload a PDF, TXT, or Markdown policy; only extracted text is stored. The AI question lab sends that saved context to Groq and returns editable fun, company, or policy vote drafts in English or Egyptian Arabic. Suggestions never publish automatically. HR can schedule a draft with start and end times in the device's local timezone; open office screens check every five seconds and activate or close it when due. Questions also have PDF vote reports and an option to email the PDF to HR. Reports show names and individual times only for social votes where the employee chose to appear; private votes remain aggregate totals.

Social votes can include a fresh camera photo when the employee opts to appear on the office screen. Photos are stored on the vote only while its question is live; a database trigger deletes them when HR closes or replaces the question or pauses the company. Anonymous votes store no photo.

Each company has named display screens with a separate link. Deactivating a screen invalidates its link. Only the Huddl platform admin creates companies and generates their HR dashboard links. Creating a company generates a temporary HR password, emails it with the HR portal link, and shows it to the Huddl admin once. HR must replace it on first login; it expires after seven days. The Huddl admin can copy the HR link or generate a one-time password setup link if HR loses access. HR can later change its password or verify a new login email. Changing credentials revokes older sessions.

For an existing owner who needs a first invitation before signing in, set `OWNER_EMAIL` with the database and email environment variables, then run `node scripts/invite-owner.mjs`.

## Run locally

```bash
npm install
npm run db:migrate
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the values before migrating. `DATABASE_URL` should use the Supabase transaction pooler for the Vercel API. The schema in `db/schema.sql` is idempotent and includes tenant tables, screens, invitations, vote photo cleanup triggers, and row level security. The browser never connects directly to Postgres.

`SESSION_SECRET` must be at least 32 characters. `SETUP_SECRET` protects the first-owner setup endpoint. Set `PLATFORM_ADMIN_EMAIL` to that owner's email. `PUBLIC_SITE_URL` is the deployed site origin used in invitations.

Set `GROQ_API_KEY` as a server-side environment variable for AI suggestions. Never expose it with a `VITE_` prefix. Policy text and company context are sent to Groq only when HR requests suggestions.

For HR access emails and HR login-email changes, use a Resend sending key as `RESEND_API_KEY`. Without a domain, use `EMAIL_FROM=Huddl <onboarding@resend.dev>` and set `EMAIL_TEST_RECIPIENT` to the email address on the Resend account. Huddl then routes those HR messages to that one inbox for testing; each message names the intended user. Employee entry does not use Resend. Remove `EMAIL_TEST_RECIPIENT` and verify a sending domain before emailing real HR users.

The Vercel Marketplace Resend integration currently requires a Vercel-purchased domain, so a direct Resend key is the domainless test path. Keep credentials only in local env files or Vercel project settings, never in Git.

## Verification

`npm test` runs browser demo and live-workspace UI tests. The database integration test also runs when `DATABASE_URL` is set; it creates disposable companies and checks seat and screen limits, HR credential changes, access revocation, an HR invite, a live photo vote, and photo deletion on close. `npm run build` checks the Vercel bundle.

## Current pilot scope

Live screens poll every five seconds. There is no billing, automatic question scheduling, AI policy drafting, or organization SSO yet. Photos and logos are kept as small data URLs in Postgres for this pilot; object storage will be appropriate before a larger rollout.
