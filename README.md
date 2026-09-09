# Sahrdaya Daily Reports Automation

Google Apps Script that sends the **Daily Action Points (effective 08 Sep 2026)** reports automatically
from the tracking spreadsheet, every morning between 9:00 and 9:30 IST, with a retry before 10:00.
Nobody's laptop needs to be on: the script runs inside Google's servers under the
`automation@sahrdaya.ac.in` account.

| # | Mail | When | To | CC | Owner (Reply-To) |
|---|------|------|----|----|------------------|
| 1 | Daily Report – Pending Course Plan Approvals | every day 08–18 Sep, incl. Sundays, "nil pending" if empty | Principal, ASH HoD | Dr. Manishankar, Dr. Gnana King, owner, backup | George |
| 2 | Daily Report – Pending Student Profile Creation | every working day | Principal, ASH HoD | Dr. Manishankar, Dr. Gnana King, owner, backup | Aleena |
| 3 | Notice / Reminder / Final Reminder – Attendance Correction Window | 08 Sep notice, 14 Sep reminder, 15 Sep final | all faculty | Dr. Manishankar, Principal, ASH HoD, Dr. Gnana King, owner | Ashwin |
| 4 | Daily Report – Daily Status and Query Closure Report | every working day | Dr. Manishankar, Principal | Dr. Gnana King, owner, backup | Livya |
| 5a | Reminder – Module completion & testing status due today | every working day, morning | Anusree, Anugraha, Nicy, Joshua | Livya | Livya |
| 5b | Daily Report – Module Completion & Testing Status (from the **Assignments** tracker: finished today, in progress, overdue, who has nothing updated) | every working day, 17:30 | Dr. Manishankar, Principal | Dr. Gnana King, Livya | Livya |

Subjects follow the mandated format `Daily Report – <Report> – 08 Sep 2026`.
Every mail is written to a **Mail Log** tab, so a report is never sent twice on one day,
and anything that failed is retried automatically in the 9:30–10:00 window.

---

## Set-up (about 5 minutes, one time)

Do this signed in to Google as **automation@sahrdaya.ac.in** (or any account that may send
these mails – the mails go out from whichever account installs the triggers).

1. **Open the tracking sheet** →
   https://docs.google.com/spreadsheets/d/12u73XSWp1M2uYDYAtKmzJQLeD4gdIVIl9pgrSToKwQc/edit
2. **Extensions → Apps Script.** Delete the sample code in `Code.gs`, paste the whole of
   [`src/Code.gs`](src/Code.gs), and press **Save** (Ctrl+S).
3. **Project Settings (gear icon) → Time zone → (GMT+05:30) India Standard Time.**
   Also in the sheet itself: **File → Settings → Time zone → India Standard Time.**
4. Back in the editor, choose the function **`bootstrapSheet`** in the toolbar dropdown and press **Run**.
   Google asks you to authorise the script once (Review permissions → choose the account → Allow).
   This creates the **Config** tab and any missing data tabs. Existing tabs are never changed.
5. **Fill the Config tab** – e-mail addresses of the Principal, ASH HoD, Dr. Manishankar,
   Dr. Gnana King, each owner (`Name <email>`), the dev team, and the all-faculty address
   (or fill the **Faculty** tab). Leave `DRY_RUN = YES` for now.
6. Reload the spreadsheet. A **Daily Reports** menu appears. Choose
   **Preview all mails to me (dry run)** – every mail arrives in *your* inbox with a yellow
   banner showing who it would really go to. Check them.
7. **Daily Reports → Check configuration** – fix anything it lists.
8. **Daily Reports → Install daily triggers.**
9. Set **`DRY_RUN` to `NO`** in Config. From the next morning everything is automatic.
   To send today's mails immediately (for example the attendance notice), use
   **Daily Reports → Run morning reports now**.

If a report cannot be sent (missing address, missing tab, quota), `ADMIN_EMAIL` receives one
"attention needed" mail explaining exactly what to fix.

### Alternative: deploy from this folder with clasp

```bash
npm install
npx clasp login          # one browser sign-in as automation@sahrdaya.ac.in
./deploy.sh              # creates the bound script (first run) and pushes src/
```
The Apps Script API must be enabled once for the account at
https://script.google.com/home/usersettings. Then follow steps 4–9 above.

---

## The tabs the reports read

`bootstrapSheet` creates these with the headers below. **Column names are matched flexibly**
(e.g. *Dept*, *Department*, *Branch* all work; *Staff*, *Faculty*, *Teacher* all work), so an
existing tab with slightly different headings is fine. Rename a tab in Config (`TAB_*`) if
you already track something under another name.

The tracker only holds the dev team's tasks, so the **Course Plans**, **Student Profiles**, **Queries** and
**Faculty** tabs are new and must be kept up to date by George, Aleena, Livya and Ashwin respectively.

**Course Plans** – one row per course plan
`Course Code | Course Name | Faculty | Department | Semester | Submitted On | Status | Approved On | Remarks`
Pending = any status other than *Approved / Rejected / Withdrawn / Cancelled* (blank counts as pending).
"Days pending" = today − *Submitted On* (or a *Days Pending* column if you keep one).

**Student Profiles** – either layout works:
- one row per student: `Department | Batch | Student Name | Admission No | Profile Created (Yes/No) | Responsible Faculty` – rows not marked *Yes* are counted, or
- one row per group: `Department | Batch | Students Pending | Responsible Faculty`.

**Queries** – `Date Received | Source (Email / Celerscet) | Raised By | Query | Status (Open/Closed) | Closed On | Closure Remarks | Handled By`
The status report shows everything received or closed since yesterday plus everything still open,
split into *e-mail* and *Celerscet* sections.

**Assignments** – the existing *Project Task tracker* tab, used as is:
`Services | Task | docs required | task type | Faculty Assigned | Status | Start date | Due on | Finished date | Days Taken | remarks`
The header may sit below a title row and empty rows with the "select" dropdown placeholder are ignored.
*In progress* tasks appear in the morning status report as "modules under development today".
The 17:30 digest shows, per person, tasks with **Finished date = today**, tasks *In progress* (overdue if *Due on* has passed)
and assigned *Not started* tasks, and names anyone in `DEV_TEAM` with nothing finished today and nothing in progress.
So the dev team only has to keep **Status**, **Finished date** and **Due on** up to date in the tracker they already use.

**Faculty** – `Name | Email | Department` – used for the attendance mails when `FACULTY_EMAILS` is blank.

**Mail Log** – written by the script. Delete a row only if you deliberately want that mail re-sent.

---

## Config keys worth knowing

| Key | Meaning |
|-----|---------|
| `DRY_RUN` | `YES` = all mails go only to `ADMIN_EMAIL` (with intended recipients shown). `NO` = live. |
| `SKIP_DAYS`, `HOLIDAYS` | Days with no reports (default: Sunday). Course plans ignore this while `COURSE_PLAN_EVERY_DAY = YES`. |
| `COURSE_PLAN_START/END` | 2026-09-08 to 2026-09-18. The report stops by itself after the end date. |
| `ATTENDANCE_NOTICE_DATE`, `ATTENDANCE_REMINDER_DATES`, `ATTENDANCE_CLOSE_DATE` | 08 Sep, 14 & 15 Sep, 15 Sep. If the script is installed after the notice date, the notice goes out once on the first run. |
| `BACKUP_*` | Backup person for each owner – always CC'd so the report never depends on one person being present. |
| `QUERY_LOOKBACK_DAYS` | How many days back the status report looks (default 1 = since yesterday). |

## Schedule

| Trigger | Time (IST) | Purpose |
|---------|-----------|---------|
| `morningRun` | 09:00–09:30 | sends reports 1–4 and the dev-team reminder |
| `morningRun` | 09:30–10:00 | retry – sends only what is not yet in the Mail Log |
| `eveningRun` | 17:15–17:45 | module completion & testing digest |

Google fires time-based triggers within a ±15-minute window, which is why the two morning
slots are used to stay inside the 9:30 target / 10:00 hard limit.

## Testing locally

```bash
npm test          # runs src/Code.gs against in-memory spreadsheets (no Google account needed)
```
127 checks cover recipients, subjects, date windows, Sunday/holiday handling, nil-pending mails,
the late-install notice, dry-run redirection, failure isolation, duplicate protection and triggers.
The rendered mails are written to `test/out/` – open them in a browser. Pre-generated copies are in
[`samples/`](samples/).

## Files

```
src/Code.gs            the whole automation (pushed with clasp, or paste into Apps Script)
Project Task tracker.xlsx   export of the tracking sheet used to shape the tests
src/appsscript.json    manifest: IST time zone, V8, minimal OAuth scopes
deploy.sh              optional clasp-based deploy
test/                  mock Google services + fixtures + scenarios
samples/               example mails as HTML
docs/DailyActionPoints.md   the original brief
```
