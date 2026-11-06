# Huddl pilot operations

## Daily checks

Open the Huddl platform dashboard and refresh **Operational checks**. Database connected means the API can query Postgres. Mail and AI are configuration checks, not delivery or model tests. In each company’s HR dashboard, an active screen is reported online if it checked in within 150 seconds; preview windows do not count. A screen needs network access and a valid screen link. Check again after a minute if it was just opened.

The office display keeps the last successfully received result on screen during a connection interruption and retries every five seconds. It displays a reconnection message. If a screen remains offline, check its internet connection, confirm its link is active in HR, and reload it. A screen with a disabled link cannot reconnect until re-enabled.

## Email, AI, and database incidents

Confirm https://huddl-place.vercel.app/api/health responds with `ok: true` and check the Vercel production deployment and function logs. A failed health check can be caused by a database or configuration issue; check Supabase project status, the transaction pooler URL and the configured CA. Never share logs containing credentials or personal data.

If sign-in messages fail, inspect Brevo transactional logs and account limits. If AI fails, check Groq service status, quota, key and model availability. Users should retry only after the underlying issue is understood. Configuration checks do not prove these services work.

If a new release is faulty, use Vercel's production rollback controls to return to the last known good deployment. Remember older deployments retain their own environment values and may be incompatible with newer database changes. Verify `/api/health`, employee sign-in, and screen refresh after rollback.

## Backups and restore

Supabase Free does not supply automatic daily backups. Before a company trial, arrange encrypted off-site backups using Supabase's documented CLI `db dump` workflow or enable an appropriate managed backup plan. Back up roles, schema and data as described by Supabase, protect the files as sensitive employee data, and define a retention period. Never commit backups, `.env` files, or private keys to Git.

Test restoration into a **separate non-production Supabase project** before relying on a backup. Confirm company isolation, employee access, polls, votes and screen settings. Do not restore over the production database as a test. Document the backup time, restoration time and any failures. Supabase CLI and PostgreSQL tools are not bundled with this project; no automatic backup or restore test is configured by this file.

Reference: https://supabase.com/docs/guides/platform/backups and https://supabase.com/docs/reference/cli/supabase-db-dump

## Pilot support

For an incident, record the time, affected company, screen or workflow, and the request ID if available. Do not include verification codes, passwords, policy text, employee photos or vote contents in support tickets. Contact Huddl at sohail.amr.aaaa@gmail.com. Escalate suspected data exposure promptly to the company contact and obtain local legal advice on notification requirements.
