# Huddl

Huddl runs a daily workplace question for each company. Employees vote from their phone or laptop; office displays show live results. The landing page and browser-only concept demo remain available at `/` and `/#/demo`.

## Live pilot

The multi-company app is at `/workspace?org=COMPANY-SLUG&view=vote`. Replace `vote` with `display` for an office screen or `admin` for HR. The Huddl owner uses `/workspace?view=platform` to create companies with a seat and live-screen allowance, adjust those limits, pause spaces, and see participation and screen links. New companies start with the selected number of named screen links.

HR can upload a CSV or paste employee emails within the seat allowance and remove or restore access. An employee verifies their allowlisted email with a short-lived email code on a new device and creates a profile on first use. A renewable 90-day session avoids daily sign-in. Removing an email revokes access.

Employees can hide their directory profile and disable vote matching. A hidden profile remains accessible to its owner. Profile visibility does not change past votes employees chose to share on an office screen.

HR can also create questions with 2–8 choices, publish or close them, manage screen names and locations within the screen limit, see members and participation, and upload a logo. A logo upload suggests colors; the saved color themes the entire company portal. Buttons show progress and action toasts.

The HR dashboard has a screen picker inside Office Displays for opening any active display. HR can save a company description and upload a PDF, TXT, or Markdown policy; only extracted text is stored. The AI question lab sends that saved context to Groq and returns editable fun, company, or policy vote drafts in English or Egyptian Arabic. Suggestions never publish automatically. HR can schedule a draft with start and end times in the device's local timezone, or start a draft immediately with a required automatic close time. HR can adjust the close time while it is live. Active screens check every five seconds, the database synchronizes due questions every minute even without an open screen, and the API rejects votes after the close time. Questions have PDF vote reports and an option to email the PDF to HR. Reports show names and individual times only for social votes where the employee chose to appear; private votes remain aggregate totals.

Social votes can include a fresh camera photo when the employee opts to appear on the office screen. Photos are stored on the vote only while its question is live; a database trigger deletes them when HR closes or replaces the question or pauses the company. Anonymous votes store no photo.

The office display runs full screen without portal navigation. Each choice has its own result panel and progress bar; visible voters appear as small taped photo cards grouped within that panel. Card size adjusts as participation grows, so a single voter never fills an entire option panel. Employees and HR can open `view=people` to search coworkers and open their profiles. Each person can upload, replace, or remove only their own persistent profile photo and edit their own name, department, and job title. Coworkers see only votes shared by name; private and anonymous choices remain visible to their owner only. A 1–10 match score compares questions where both coworkers shared their votes, and stays unset until they have a shared question.

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

Set BREVO_API_KEY and BREVO_SENDER_EMAIL for employee verification, HR access emails and HR account changes. Resend variables are a fallback; employee verification is disabled when test delivery redirects mail. Configure the Supabase CA in SUPABASE_CA_CERT to verify the pooler's certificate and hostname. Store secrets only in Vercel or ignored local environment files.

The HR dashboard includes a setup checklist, a device-timezone calendar, Egyptian question library, screen check-ins, and aggregate participation. Groups below five participants are omitted from department totals. HR must confirm the context that will be sent to Groq before generating questions.

Encrypted application backups, isolated restore checks, and availability alerts are configured through GitHub Actions. Setup details, security limits, and recovery steps are in [OPERATIONS.md](OPERATIONS.md).

## Verification

`npm test` runs browser demo and live-workspace UI tests. The database integration test also runs when `DATABASE_URL` is set; it creates disposable companies and checks seat and screen limits, HR credential changes, access revocation, an HR invite, a live photo vote, and photo deletion on close. `npm run build` checks the Vercel bundle.

## Current pilot scope

Live screens poll every five seconds. Billing and organization SSO are not implemented yet. Photos and logos are kept as size-limited data URLs in Postgres for this pilot; object storage will be appropriate before a larger rollout.
