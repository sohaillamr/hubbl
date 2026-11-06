# Huddl pilot operations

## Daily checks

Open the Huddl platform dashboard and refresh **Operational checks**. Database connected means the API can query Postgres. Mail and AI are configuration checks, not delivery or model tests. In each company’s HR dashboard, an active screen is reported online if it checked in within 150 seconds; preview windows do not count. A screen needs network access and a valid screen link. Check again after a minute if it was just opened.

The office display keeps the last successfully received result on screen during a connection interruption and retries every five seconds. It displays a reconnection message. If a screen remains offline, check its internet connection, confirm its link is active in HR, and reload it. A screen with a disabled link cannot reconnect until re-enabled.

## Email, AI, and database incidents

Confirm https://huddl-place.vercel.app/api/health responds with `ok: true` and check the Vercel production deployment and function logs. A failed health check can be caused by a database or configuration issue; check Supabase project status, the transaction pooler URL and the configured CA. Never share logs containing credentials or personal data.

If sign-in messages fail, inspect Brevo transactional logs and account limits. If AI fails, check Groq service status, quota, key and model availability. Users should retry only after the underlying issue is understood. Configuration checks do not prove these services work.

If a new release is faulty, use Vercel's production rollback controls to return to the last known good deployment. Remember older deployments retain their own environment values and may be incompatible with newer database changes. Verify `/api/health`, employee sign-in, and screen refresh after rollback.

## Backups and restore

The GitHub Actions **Encrypted backup and restore check** workflow runs daily at 01:10 UTC and can also be started manually. It reads the application tables in one repeatable-read transaction, omits temporary vote photos and short-lived sign-in codes and invitations, compresses and encrypts the snapshot with AES-256-GCM, and uploads it to a private Vercel Blob store. After upload it downloads that same encrypted file and restores its contents into an isolated, empty PostgreSQL service in the workflow. It checks table counts, restored values and absence of temporary vote photos. The pg_cron scheduling infrastructure is not installed in the isolated restore test.

After a successful restore check, retention keeps the most recent seven backups and deletes older files only after seven days. Each table is limited to 50,000 rows and the uncompressed snapshot to 40 MiB; exceeding a limit fails the job and sends an alert rather than producing an incomplete backup. This is an application-data backup, not a full Supabase project backup: it does not include platform configuration, database roles, extensions, files stored outside Postgres, secrets, or ephemeral authentication data.

The encryption key is stored in the GitHub repository secret HUDDL_BACKUP_KEY and a local ignored file certs/backup-key.txt. Store a copy in a secure password manager outside GitHub and Vercel. Losing the key makes the backups unreadable. If you rotate the database password, Brevo key or Blob token, update the corresponding GitHub Actions secrets too. Never commit backup files or keys.

To restore after an incident, create a separate Supabase project, apply the matching db/schema.sql, and ensure all eight application tables are empty. From a trusted machine, set RESTORE_DATABASE_URL and RESTORE_CA_CERT for that new project, BACKUP_DATABASE_URL for the source, BLOB_READ_WRITE_TOKEN, BACKUP_ENCRYPTION_KEY, BACKUP_PATH, and CONFIRM_RESTORE_HOST to the target hostname. Run node scripts/restore-backup.mjs. The command rejects the source database and any nonempty destination. Review the resulting data and scheduling before switching traffic. The automated test uses a disposable PostgreSQL container and does not overwrite production.

## Failure alerts

The independent GitHub Actions **Huddl availability monitor** checks the live API health endpoint on a 15-minute schedule with three retries. When it fails, or when a backup or restore check fails, it sends an email through Brevo to the configured alert address. GitHub schedules can be delayed, disabled or interrupted and the monitor cannot alert if both GitHub Actions and the mail provider fail. Repeated failing runs can send repeated emails; this is not a replacement for a commercial incident-management service. Workflow logs and run status are visible under the repository Actions tab.
## Pilot support

For an incident, record the time, affected company, screen or workflow, and the request ID if available. Do not include verification codes, passwords, policy text, employee photos or vote contents in support tickets. Contact Huddl at sohail.amr.aaaa@gmail.com. Escalate suspected data exposure promptly to the company contact and obtain local legal advice on notification requirements.
