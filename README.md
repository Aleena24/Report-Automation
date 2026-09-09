# Daily Reports

A web app and installable PWA (React) with a Node API on **Google Cloud Run** that sends a college's
**Daily Action Points** mails automatically: the reports are built from data kept in the app and in the
dev team's tracking spreadsheet, and sent every morning and evening by Cloud Scheduler. Nobody's laptop needs to be on.

**Nothing organisation-specific is in the code.** Every person, address, date, spreadsheet ID and the mail
password are entered in the app's **Settings** page; the deployment scripts take the project and region from
your `gcloud` configuration.

| # | Mail | When | To | CC | Reply-To |
|---|------|------|----|----|----------|
| 1 | Daily Report – Pending Course Plan Approvals | every morning within the configured period (skip days too, if enabled); "nil pending" if empty | Principal, HoD | Coordinator, Always-CC, owner, backup | Owner – Course plans |
| 2 | Daily Report – Pending Student Profile Creation | every working morning | Principal, HoD | Coordinator, Always-CC, owner, backup | Owner – Student profiles |
| 3 | Notice / Reminder / Final Reminder – Attendance Correction Window | notice date, reminder dates, close date | all faculty | Coordinator, Principal, HoD, Always-CC, owner, backup | Owner – Attendance |
| 4 | Daily Report – Daily Status and Query Closure Report | every working morning | Coordinator, Principal | Always-CC, owner, backup | Owner – Status report |
| 5a | Reminder – Module completion & testing status due today | every working morning | development team | owner | Owner – Status report |
| 5b | Daily Report – Module Completion & Testing Status (from the tracker sheet) | every working evening | Coordinator, Principal | Always-CC, owner | Owner – Status report |

Each "To" list can be replaced per report in Settings → Recipients. Subjects follow the format
`Daily Report – <Report> – 08 Sep 2026`. Every mail is written to the **Mail log**, so a report is never sent
twice on one day; a retry run sends anything that failed, and the admin gets one "attention needed" mail when
something needs fixing.

## What the app does

- **Today** – which reports are due, sent, skipped or failed; send any of them now; preview every mail.
- **Course plans / Student profiles / Queries / Faculty** – the data behind reports 1–4, editable from a phone:
  add rows, paste rows from Excel/Sheets, or import a tab of the tracking spreadsheet. One tap to *Approve* a
  course plan, *Mark created* a profile, *Close* a query with remarks.
- **Dev tracker** – live read-only view of the team's tracker tab (they keep using the sheet).
- **Mail log** – exactly what went out, to whom, with the rendered mail.
- **Settings** – recipients (by role), owners and backups, dates, skip days/holidays, spreadsheet, mail set-up
  (including the password), access. Dry run on/off.
- **Install** – add to the home screen on Android / iOS / desktop; sign-in is Google (Identity-Aware Proxy).

## Architecture (all inside one GCP project)

```
Browser / PWA ──HTTPS──▶ Identity-Aware Proxy ──▶ Cloud Run service "daily-reports"
                                                   ├─ React app (web/dist, served statically)
                                                   └─ Express API (server/)  ──▶ Firestore (settings, data, mail log)
                                                                                ──▶ Google Sheets API (tracker, read-only)
                                                                                ──▶ SMTP (app password) | Gmail API (delegation)
Cloud Scheduler morning · retry · evening ──▶ Cloud Run job "daily-reports-job" (same image, `node server/dist/cli.js auto`)
```

- One container image (`Dockerfile`) serves the PWA and the API, and doubles as the batch job.
- The engine (`server/src/engine.ts` + `server/src/reports/`) is pure: given data, settings and a date it decides
  what is due and renders the mails. `server/test/` runs it against in-memory data (`npm test`).
- Access: IAP lets in the Google accounts granted by `infra/grant-access.sh`; inside the app,
  **Settings → Access → Admins** may change settings, re-send and delete log entries; an optional **Members** list
  narrows who may use the app at all. Until an admin is listed, everyone who can open the app is an admin.

## Deploy / update

```bash
gcloud auth login && gcloud config set project <your-project-id>
npm install
npm test                 # engine tests (no Google account needed)
./infra/deploy.sh        # builds with Cloud Build and deploys everything (idempotent – run again to update)
```
`infra/config.sh` reads the project, region and your account from `gcloud config`; override anything in the
environment, e.g. `REGION=asia-south1 MORNING_TIME=08:30 TIME_ZONE=Asia/Kolkata ./infra/deploy.sh`.

### One-time set-up after the first deploy (about 10 minutes, all inside the app)

1. **Open the app** (URL printed by the deploy) and sign in. Go to **Settings**.
2. **Access** – put your own address under *Admins* (until then everyone with access is an admin).
3. **Recipients & owners** – Principal, Head of Department, Coordinator, Always-CC, each owner as `Name <email>`,
   backups, the development team, and the all-faculty address (or fill **Faculty**). Save.
4. **Google Sheet** – paste the spreadsheet ID, copy the service-account address shown there and share the
   spreadsheet with it (Viewer). Press **Test sheet access**.
5. **Mail** – choose how mails are sent, entirely from Settings → Mail:
   - `smtp` (quickest, 2 minutes): sign in to Google as the *Send from* mailbox, turn on 2-Step Verification,
     create an **App password** at myaccount.google.com/apppasswords, paste it into the password field,
     press **Send a test mail to me**, then Save. (Any other SMTP server works too – set server, port, user.)
   - `gmail` (no password): a Workspace super-admin authorises the service account's client ID for the scope
     `https://www.googleapis.com/auth/gmail.send` in Admin console → Security → API controls → Domain-wide delegation.
6. **Schedule** – the course-plan period, the attendance notice / reminder / close dates, skip days, holidays.
7. **Data** – enter (or import) the pending course plans, student profiles and open queries.
8. On **Today** press **Send all previews to me** and check the mails. **Check configuration** lists anything missing.
9. Switch **Dry run** off in Settings. From the next morning everything is automatic.

Give someone access: `./infra/grant-access.sh someone@example.edu` (or `domain:example.edu` for everyone).
Run a batch by hand: `./infra/run-now.sh morning` (or the buttons on Today).
Prefer Secret Manager for the mail password? `./infra/set-smtp-password.sh` injects it as `SMTP_PASS`, which
is used whenever no password is stored in Settings.

## Local development

```bash
npm run dev:server       # API on :8080 – set STORE=memory AUTH_MODE=dev to work without Google credentials
npm run dev:web          # Vite on :5173, proxies /api to :8080
npm test                 # server/test – engine scenarios covering recipients, subjects, dates, skip days/holidays,
                         # nil-pending mails, late install, dry run, failure isolation, duplicate guard, import parsing,
                         # settings migration and the SMTP settings precedence
```
Rendered sample mails from the tests land in `server/test/out/`.

## Repository layout

```
server/src/config.ts        the settings schema (all defaults blank), field labels, environment
server/src/engine.ts        job runner, dry-run redirection, duplicate guard, admin alerts, dashboard
server/src/reports/*.ts     one file per report; context.ts holds the recipient rules
server/src/lib/tables.ts    flexible column matching for pasted rows / sheet tabs (Dept = Department = Branch …)
server/src/routes/api.ts    REST API used by the PWA (secrets never leave the server)
server/src/mailer.ts        transports: log (default) · smtp (password from Settings or SMTP_PASS) · gmail (keyless delegation)
server/src/auth.ts          IAP JWT verification, admin / member roles
web/src/pages/              Today · Data · Course plans · Student profiles · Queries · Tracker · Faculty · Mail log · Settings
infra/                      config.sh · deploy.sh · grant-access.sh · run-now.sh · set-smtp-password.sh (optional)
apps-script/                the earlier Google Apps Script version (kept for reference)
docs/                       the original brief and an export of the tracking sheet
```
