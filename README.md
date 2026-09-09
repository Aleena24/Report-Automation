# Sahrdaya Daily Reports

A web app and installable PWA (React) with a Node API on **Google Cloud Run** that automates the
**Daily Action Points (effective 08 Sep 2026)**: the reports are built from data kept in the app and
in the dev team's tracking spreadsheet, and sent every morning and evening by Cloud Scheduler.
Nobody's laptop needs to be on.

| # | Mail | When (IST) | To | CC | Owner (Reply-To) |
|---|------|------------|----|----|------------------|
| 1 | Daily Report – Pending Course Plan Approvals | 09:00 every day 08–18 Sep, Sundays too; "nil pending" if empty | Principal, ASH HoD | Dr. Manishankar, Dr. Gnana King, owner, backup | George |
| 2 | Daily Report – Pending Student Profile Creation | 09:00 every working day | Principal, ASH HoD | Dr. Manishankar, Dr. Gnana King, owner, backup | Aleena |
| 3 | Notice / Reminder / Final Reminder – Attendance Correction Window | 08 Sep notice, 14 Sep reminder, 15 Sep final | all faculty | Dr. Manishankar, Principal, ASH HoD, Dr. Gnana King, owner | Ashwin |
| 4 | Daily Report – Daily Status and Query Closure Report | 09:00 every working day (limit 10:00) | Dr. Manishankar, Principal | Dr. Gnana King, owner, backup | Livya |
| 5a | Reminder – Module completion & testing status due today | 09:00 every working day | Anusree, Anugraha, Nicy, Joshua | Livya | Livya |
| 5b | Daily Report – Module Completion & Testing Status (from the **Assignments** tracker) | 17:30 every working day | Dr. Manishankar, Principal | Dr. Gnana King, Livya | Livya |

Subjects follow the mandated format `Daily Report – <Report> – 08 Sep 2026`. Every mail is written to the
**Mail log**, so a report is never sent twice on one day; a retry at 09:35 sends anything that failed, and the
admin gets one "attention needed" mail when something needs fixing.

## What the app does

- **Today** – which reports are due, sent, skipped or failed; send any of them now; preview every mail.
- **Course plans / Student profiles / Queries / Faculty** – the data behind reports 1–4, editable from a phone:
  add rows, paste rows from Excel/Sheets, or import a tab of the tracking spreadsheet. One tap to *Approve* a
  course plan, *Mark created* a profile, *Close* a query with remarks.
- **Dev tracker** – live read-only view of the team's *Assignments* tab (they keep using the sheet).
- **Mail log** – exactly what went out, to whom, with the rendered mail.
- **Settings** – recipients, owners and backups, dates, skip days/holidays, mail transport, access. Dry run on/off.
- **Install** – add to the home screen on Android / iOS / desktop; sign-in is Google (Identity-Aware Proxy).

## Architecture (all inside the CelerSCET GCP project, region europe-west1)

```
Browser / PWA ──HTTPS──▶ Identity-Aware Proxy ──▶ Cloud Run service "daily-reports"
                                                   ├─ React app (web/dist, served statically)
                                                   └─ Express API (server/)  ──▶ Firestore db "daily-reports"
                                                                                ──▶ Google Sheets API (tracker, read-only)
                                                                                ──▶ Gmail (SMTP app password | API via delegation)
Cloud Scheduler 09:00 · 09:35 · 17:30 IST ──▶ Cloud Run job "daily-reports-job" (same image, `node server/dist/cli.js auto`)
```

- One container image (`Dockerfile`) serves the PWA and the API, and doubles as the batch job.
- The engine (`server/src/engine.ts` + `server/src/reports/`) is pure: given data, config and a date it decides
  what is due and renders the mails. `server/test/` runs it against in-memory data (`npm test`).
- Access: IAP lets in the Google Workspace accounts granted by `infra/grant-access.sh`; inside the app,
  **Settings → Access → Admins** may change settings, re-send and delete log entries; an optional **Members** list
  narrows who may use the app at all.

## Deploy / update

```bash
npm install
npm test                 # engine tests (no Google account needed)
./infra/deploy.sh        # builds with Cloud Build and deploys everything (idempotent – run again to update)
```
`infra/config.sh` holds the project, region and the initial list of people who may open the app.

### One-time set-up after the first deploy (about 10 minutes)

1. **Open the app** (URL printed by the deploy) and sign in. Go to **Settings**.
2. **Recipients & owners** – Principal, ASH HoD, Dr. Manishankar, Dr. Gnana King, each owner as `Name <email>`,
   backups, the dev team, and the all-faculty address (or fill **Faculty**). Save.
3. **Google Sheet** – copy the service-account address shown there and share the tracking spreadsheet with it
   (Viewer). Press **Test sheet access**.
4. **Mail** – choose how mails are sent:
   - `smtp` (quickest): as `automation@sahrdaya.ac.in` create an *App password* (Google Account → Security →
     2-Step Verification → App passwords), then run `./infra/set-smtp-password.sh` and paste it.
   - `gmail` (no password): a Workspace super-admin authorises the service account's client ID for the scope
     `https://www.googleapis.com/auth/gmail.send` in Admin console → Security → API controls → Domain-wide delegation.
   Press **Send a test mail to me**.
5. **Data** – enter (or import) the pending course plans, student profiles and open queries.
6. On **Today** press **Send all previews to me** and check the mails. **Check configuration** lists anything missing.
7. Switch **Dry run** off in Settings. From the next morning everything is automatic.

Give someone access: `./infra/grant-access.sh livya@sahrdaya.ac.in` (or `domain:sahrdaya.ac.in` for everyone).
Run a batch by hand: `./infra/run-now.sh morning` (or the buttons on Today).

## Local development

```bash
npm run dev:server       # API on :8080 – set STORE=memory AUTH_MODE=dev to work without Google credentials
npm run dev:web          # Vite on :5173, proxies /api to :8080
npm test                 # server/test – 25 scenarios covering recipients, subjects, dates, Sundays/holidays,
                         # nil-pending mails, late install, dry run, failure isolation, duplicate guard, import parsing
```
Rendered sample mails from the tests land in `server/test/out/`.

## Repository layout

```
server/src/engine.ts        job runner, dry-run redirection, duplicate guard, admin alerts, dashboard
server/src/reports/*.ts     one file per report (course plans, student profiles, attendance, status, dev team)
server/src/lib/tables.ts    flexible column matching for pasted rows / sheet tabs (Dept = Department = Branch …)
server/src/routes/api.ts    REST API used by the PWA
server/src/mailer.ts        transports: log (default) · smtp (app password) · gmail (keyless delegation)
server/src/auth.ts          IAP JWT verification, admin / member roles
web/src/pages/              Today · Data · Course plans · Student profiles · Queries · Tracker · Faculty · Mail log · Settings
infra/                      deploy.sh · grant-access.sh · set-smtp-password.sh · run-now.sh · config.sh
apps-script/                the earlier Google Apps Script version (still works if pasted into the sheet)
docs/                       the original brief and an export of the tracking sheet
```
