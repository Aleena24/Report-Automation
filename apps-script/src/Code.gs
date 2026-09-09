/**
 * ============================================================================
 *  Sahrdaya – Daily Reports Automation  (Google Apps Script, V8 runtime)
 * ============================================================================
 *  Automates the "Daily Action Points – effective 08 Sep 2026":
 *
 *   1. Pending Course Plan Approvals report      owner George    daily 08–18 Sep
 *   2. Pending Student Profile Creation report   owner Aleena    daily
 *   3. Attendance Correction Window notice       owner Ashwin    08 Sep, reminders 14 & 15 Sep
 *   4. Daily Status & Query Closure report       owner Livya     daily before 10:00
 *   5. Dev-team module / testing status          Anusree, Anugraha, Nicy, Joshua
 *        - morning reminder to update the "Assignments" task tracker
 *        - evening digest: finished today, in progress, overdue, who has nothing logged
 *
 *  Everything is driven from the spreadsheet this script is attached to:
 *   - "Config" tab       recipients, dates and switches (no code edits needed)
 *   - data tabs          the rows the reports are built from
 *   - "Mail Log" tab     every mail that was sent (audit trail + duplicate guard)
 *
 *  QUICK START (about 5 minutes, see README.md):
 *   1. bootstrapSheet()      creates Config + data tabs if they do not exist
 *   2. fill the Config tab   e-mail addresses, dates
 *   3. previewReportsToMe()  sends every mail to YOU only, so you can check them
 *   4. setupTriggers()       installs the 9:00-9:30 run, 9:30-10:00 retry, 17:30 digest
 *   5. set DRY_RUN to NO     go live
 *
 *  All times are Indian Standard Time regardless of the script's own time zone.
 * ============================================================================
 */

const TZ = 'Asia/Kolkata';
const CONFIG_TAB = 'Config';
const DASH = '–'; // en dash, as used in the mandated subject format
const APP_NAME = 'Daily Reports';

// ---------------------------------------------------------------------------
// Configuration defaults (written to the Config tab by bootstrapSheet)
// ---------------------------------------------------------------------------
const CONFIG_DEFAULTS = [
  ['DRY_RUN', 'YES', 'YES = every mail goes ONLY to ADMIN_EMAIL, with the real recipients shown at the top. Set to NO to go live.'],
  ['ADMIN_EMAIL', 'aleenavarghese@sahrdaya.ac.in', 'Receives dry-run copies, error alerts and configuration warnings.'],
  ['ORG_NAME', 'Sahrdaya College of Engineering & Technology', 'Shown in the mail header.'],
  ['PRINCIPAL_EMAIL', '', 'Principal'],
  ['ASH_HOD_EMAIL', '', 'ASH HoD'],
  ['MANISHANKAR_EMAIL', '', 'Dr. Manishankar S – CC on every mail'],
  ['GNANA_KING_EMAIL', '', 'Dr. G R Gnana King – CC on every mail'],
  ['FACULTY_EMAILS', '', 'All-faculty address (Google Group) or comma-separated list. Leave blank to use the Faculty tab.'],
  ['OWNER_COURSE_PLANS', 'George <>', 'Format: Name <email>. Owner is CC\'d and gets the replies.'],
  ['BACKUP_COURSE_PLANS', '', 'Backup for when the owner is on leave (also CC\'d).'],
  ['OWNER_STUDENT_PROFILES', 'Aleena <aleenavarghese@sahrdaya.ac.in>', ''],
  ['BACKUP_STUDENT_PROFILES', '', ''],
  ['OWNER_ATTENDANCE', 'Ashwin <>', ''],
  ['BACKUP_ATTENDANCE', '', ''],
  ['OWNER_STATUS_REPORT', 'Livya <>', ''],
  ['BACKUP_STATUS_REPORT', '', ''],
  ['DEV_TEAM', 'Anusree <>, Anugraha <>, Nicy <>, Joshua <>', 'People who must log module completion / testing status every day.'],
  ['MODULE_DIGEST_TO', '', 'Who receives the evening module-status digest. Blank = Dr. Manishankar + Principal.'],
  ['MODULE_STATUS_DEADLINE', '5:00 PM', 'Shown in the dev-team reminder mail.'],
  ['COURSE_PLAN_START', '2026-09-08', 'First day of the course-plan report.'],
  ['COURSE_PLAN_END', '2026-09-18', 'Last day of the course-plan report (inclusive).'],
  ['COURSE_PLAN_EVERY_DAY', 'YES', 'YES = goes out on SKIP_DAYS and HOLIDAYS too ("daily without a break").'],
  ['ATTENDANCE_NOTICE_DATE', '2026-09-08', 'Day the one-time attendance notice goes to all faculty.'],
  ['ATTENDANCE_REMINDER_DATES', '2026-09-14, 2026-09-15', 'Reminder days. The last one (or the close date) is the FINAL reminder.'],
  ['ATTENDANCE_CLOSE_DATE', '2026-09-15', 'Attendance correction window closes on this day.'],
  ['SKIP_DAYS', 'Sunday', 'Weekdays with no reports, e.g. "Saturday, Sunday". Blank = every day.'],
  ['HOLIDAYS', '', 'Comma-separated dates (yyyy-mm-dd) with no reports.'],
  ['QUERY_LOOKBACK_DAYS', '1', 'Status report covers queries received / closed in the last N days, plus everything still open.'],
  ['TAB_COURSE_PLANS', 'Course Plans', 'Tab name'],
  ['TAB_STUDENT_PROFILES', 'Student Profiles', 'Tab name'],
  ['TAB_QUERIES', 'Queries', 'Tab name'],
  ['TAB_MODULES', 'Assignments', 'The project task tracker tab (Services, Task, task type, Faculty Assigned, Status, Start date, Due on, Finished date, remarks)'],
  ['TAB_FACULTY', 'Faculty', 'Tab name'],
  ['TAB_MAIL_LOG', 'Mail Log', 'Tab name (created automatically)'],
];

// Headers created by bootstrapSheet for tabs that do not exist yet.
// Existing tabs are never modified; column names are matched flexibly.
const TAB_SCHEMAS = {
  TAB_COURSE_PLANS: ['Course Code', 'Course Name', 'Faculty', 'Department', 'Semester', 'Submitted On', 'Status', 'Approved On', 'Remarks'],
  TAB_STUDENT_PROFILES: ['Department', 'Batch', 'Student Name', 'Admission No', 'Profile Created', 'Responsible Faculty', 'Remarks'],
  TAB_QUERIES: ['Date Received', 'Source', 'Raised By', 'Query', 'Status', 'Closed On', 'Closure Remarks', 'Handled By'],
  TAB_MODULES: ['Services', 'Task', 'docs required', 'task type', 'Faculty Assigned', 'Status', 'Start date', 'Due on', 'Finished date', 'Days Taken', 'remarks'],
  TAB_FACULTY: ['Name', 'Email', 'Department'],
  TAB_MAIL_LOG: ['Timestamp', 'Date', 'Report', 'Status', 'To', 'CC', 'Subject', 'Details'],
};

const HEADER_NOTES = {
  'TAB_COURSE_PLANS|Status': 'Pending = anything other than Approved / Rejected / Withdrawn. Blank counts as pending.',
  'TAB_COURSE_PLANS|Submitted On': 'Used to compute "days pending".',
  'TAB_STUDENT_PROFILES|Profile Created': 'Yes / No. Every row that is not "Yes" is reported as pending.',
  'TAB_QUERIES|Source': 'Email  or  Celerscet',
  'TAB_QUERIES|Status': 'Open / Closed',
  'TAB_MODULES|Status': 'Not started / In progress / Done',
  'TAB_MODULES|Finished date': 'Fill this when a task is Done – the evening digest reports tasks finished today.',
};

// ---------------------------------------------------------------------------
// Entry points used by triggers and the menu
// ---------------------------------------------------------------------------
const MORNING_JOBS = [
  { key: 'COURSE_PLANS', build: buildCoursePlanReport_ },
  { key: 'STUDENT_PROFILES', build: buildStudentProfileReport_ },
  { key: 'STATUS_REPORT', build: buildStatusReport_ },
  { key: 'ATTENDANCE', build: buildAttendanceMail_ },
  { key: 'DEV_TEAM_REMINDER', build: buildDevTeamReminder_ },
];
const EVENING_JOBS = [
  { key: 'MODULE_DIGEST', build: buildModuleDigest_ },
];

/** Trigger: 9:00-9:30 IST (and again 9:30-10:00 as a retry; already-sent mails are skipped). */
function morningRun() { return runJobs_(MORNING_JOBS, {}); }

/** Trigger: 17:30 IST – module completion / testing digest. */
function eveningRun() { return runJobs_(EVENING_JOBS, {}); }

/** Menu: send every mail (all 6 kinds) to yourself only, ignoring dates and the duplicate guard. */
function previewReportsToMe() {
  const me = safeActiveEmail_() || cfg_('ADMIN_EMAIL');
  const res = runJobs_(MORNING_JOBS.concat(EVENING_JOBS), { preview: true, redirectTo: me, force: true });
  return ui_('Preview mails sent to ' + me + '\n\n' + res.join('\n'));
}

/** Menu: run the morning batch now (safe – anything already sent today is skipped). */
function runMorningNow() { return ui_(runJobs_(MORNING_JOBS, {}).join('\n')); }

/** Menu: run the evening digest now. */
function runEveningNow() { return ui_(runJobs_(EVENING_JOBS, {}).join('\n')); }

/** Menu: report configuration problems without sending anything. */
function checkConfiguration() {
  resetCaches_();
  const p = healthProblems_(now_());
  const dry = cfgYes_('DRY_RUN');
  const trig = ScriptApp.getProjectTriggers().filter(t => ['morningRun', 'eveningRun'].indexOf(t.getHandlerFunction()) >= 0).length;
  const lines = [
    'Mode: ' + (dry ? 'DRY RUN (mails go only to ' + cfg_('ADMIN_EMAIL') + ')' : 'LIVE'),
    'Triggers installed: ' + trig + (trig ? '' : '  ← run "Install daily triggers"'),
    '',
    p.length ? 'Problems:\n - ' + p.join('\n - ') : 'Configuration looks complete.',
  ];
  return ui_(lines.join('\n'));
}

/** Menu / one-time: install the daily triggers (idempotent). */
function setupTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('morningRun').timeBased().everyDays(1).atHour(9).nearMinute(15).inTimezone(TZ).create();
  ScriptApp.newTrigger('morningRun').timeBased().everyDays(1).atHour(9).nearMinute(45).inTimezone(TZ).create();
  ScriptApp.newTrigger('eveningRun').timeBased().everyDays(1).atHour(17).nearMinute(30).inTimezone(TZ).create();
  return ui_('Triggers installed:\n - morningRun  09:00–09:30 IST\n - morningRun  09:30–10:00 IST (retry, skips anything already sent)\n - eveningRun  17:15–17:45 IST');
}

/** Remove this project's triggers. */
function removeTriggers() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['morningRun', 'eveningRun'].indexOf(t.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/** Menu / one-time: create the Config tab and any missing data tabs. Never touches existing tabs. */
function bootstrapSheet() {
  const ss = ss_();
  const created = [];

  // Config tab: create, or append missing keys to an existing one.
  let cfgSheet = ss.getSheetByName(CONFIG_TAB);
  if (!cfgSheet) {
    cfgSheet = ss.insertSheet(CONFIG_TAB, 0);
    cfgSheet.getRange(1, 1, 1, 3).setValues([['Key', 'Value', 'Notes']]);
    created.push(CONFIG_TAB);
  }
  const existing = cfgSheet.getDataRange().getValues().map(r => String(r[0] || '').trim());
  const missing = CONFIG_DEFAULTS.filter(r => existing.indexOf(r[0]) < 0);
  if (missing.length) {
    const startRow = Math.max(cfgSheet.getLastRow(), 1) + 1;
    cfgSheet.getRange(startRow, 1, missing.length, 3).setValues(missing);
  }
  const lastRow = Math.max(cfgSheet.getLastRow(), 2);
  cfgSheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
  cfgSheet.getRange(2, 2, lastRow - 1, 1).setNumberFormat('@'); // keep dates as text
  cfgSheet.getRange(1, 3, lastRow, 1).setWrap(true);
  cfgSheet.setFrozenRows(1);
  cfgSheet.setColumnWidth(1, 240); cfgSheet.setColumnWidth(2, 360); cfgSheet.setColumnWidth(3, 520);
  resetCaches_();

  // Data tabs
  Object.keys(TAB_SCHEMAS).forEach(cfgKey => {
    const name = cfg_(cfgKey);
    if (ss.getSheetByName(name)) return;
    const sh = ss.insertSheet(name);
    const headers = TAB_SCHEMAS[cfgKey];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    headers.forEach((h, i) => {
      const note = HEADER_NOTES[cfgKey + '|' + h];
      if (note) sh.getRange(1, i + 1).setNote(note);
      sh.setColumnWidth(i + 1, /remark|query|blocker|details|subject/i.test(h) ? 320 : 150);
    });
    created.push(name);
  });

  const msg = created.length
    ? 'Created: ' + created.join(', ') + '\n\nNext: fill the Config tab (e-mail addresses), then run "Preview all mails to me".'
    : 'All tabs already exist. Nothing changed.';
  return ui_(msg);
}

/** Adds the "Daily Reports" menu when the spreadsheet is opened. */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu(APP_NAME)
      .addItem('Preview all mails to me (dry run)', 'previewReportsToMe')
      .addItem('Check configuration', 'checkConfiguration')
      .addSeparator()
      .addItem('Run morning reports now', 'runMorningNow')
      .addItem('Run evening module digest now', 'runEveningNow')
      .addSeparator()
      .addItem('Install daily triggers', 'setupTriggers')
      .addItem('Remove triggers', 'removeTriggersMenu')
      .addSeparator()
      .addItem('Create missing tabs (bootstrap)', 'bootstrapSheet')
      .addToUi();
  } catch (e) { Logger.log('onOpen: ' + e); }
}
function removeTriggersMenu() { return ui_('Removed ' + removeTriggers() + ' trigger(s). Reports will NOT go out until you install them again.'); }

// ---------------------------------------------------------------------------
// Job runner
// ---------------------------------------------------------------------------
function runJobs_(jobs, opts) {
  opts = opts || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('Another run is in progress; exiting.'); return ['Another run is in progress']; }
  try {
    resetCaches_();
    const today = now_();
    const dateKey = dateKey_(today);
    const ctx = { preview: !!opts.preview, redirectTo: opts.redirectTo || '' };
    const problems = opts.preview ? [] : healthProblems_(today);
    const results = [];

    jobs.forEach(job => {
      try {
        if (!opts.force && alreadyDone_(dateKey, job.key)) { results.push(job.key + ': already done today'); return; }
        const mail = job.build(today, ctx);
        const logKey = job.key + (mail.variant ? ':' + mail.variant : '');
        if (mail.skip) {
          if (mail.log && !opts.preview) logMail_(dateKey, logKey, 'SKIPPED', [], [], '', mail.skip);
          results.push(job.key + ': skipped – ' + mail.skip);
          return;
        }
        const sent = sendMail_(logKey, dateKey, mail, ctx);
        results.push(job.key + ': ' + sent.status + ' → ' + sent.to.join(', '));
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        logMail_(dateKey, job.key, 'FAILED', [], [], '', msg);
        results.push(job.key + ': FAILED – ' + msg);
        problems.push(job.key + ' failed: ' + msg);
      }
    });

    if (problems.length) notifyAdmin_(dateKey, problems);
    Logger.log(results.join('\n'));
    return results;
  } finally {
    lock.releaseLock();
  }
}

/** One mail to ADMIN_EMAIL listing problems (config gaps, failures). Not repeated for identical content on the same day. */
function notifyAdmin_(dateKey, problems) {
  const admin = emails_(cfg_('ADMIN_EMAIL'));
  if (!admin.length) { Logger.log('ADMIN_EMAIL missing; problems: ' + problems.join(' | ')); return; }
  const details = problems.join(' | ');
  const dup = mailLogRows_().some(r => r.date === dateKey && r.report === 'ADMIN_ALERT' && r.details === details);
  if (dup) return;
  const subject = APP_NAME + ' ' + DASH + ' attention needed ' + DASH + ' ' + niceDate_(parseDate_(dateKey));
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px">' +
    '<p>The Daily Reports automation found the following problems on ' + esc_(niceDate_(parseDate_(dateKey))) + ':</p>' +
    '<ul>' + problems.map(p => '<li>' + esc_(p) + '</li>').join('') + '</ul>' +
    '<p>Fix them in the <a href="' + esc_(ss_().getUrl()) + '">Config tab</a>. The 9:30-10:00 retry will send anything that failed, and you can also use Daily Reports → Run morning reports now.</p></div>';
  MailApp.sendEmail({ to: admin.join(','), subject: subject, htmlBody: html, body: htmlToText_(html), name: APP_NAME });
  logMail_(dateKey, 'ADMIN_ALERT', 'SENT', admin, [], subject, details);
}

/** Configuration problems that would stop mails from going out. */
function healthProblems_(today) {
  const p = [];
  const need = [['PRINCIPAL_EMAIL', 'Principal'], ['ASH_HOD_EMAIL', 'ASH HoD'], ['MANISHANKAR_EMAIL', 'Dr. Manishankar'], ['GNANA_KING_EMAIL', 'Dr. G R Gnana King']];
  need.forEach(x => { if (!emails_(cfg_(x[0])).length) p.push(x[1] + ' e-mail is missing (Config → ' + x[0] + ')'); });
  ['OWNER_COURSE_PLANS', 'OWNER_STUDENT_PROFILES', 'OWNER_ATTENDANCE', 'OWNER_STATUS_REPORT'].forEach(k => {
    const o = parsePerson_(cfg_(k));
    if (!o.email) p.push('Owner ' + (o.name || k) + ' has no e-mail (Config → ' + k + ', format "Name <email>")');
  });
  if (!emails_(cfg_('DEV_TEAM')).length) p.push('DEV_TEAM has no e-mail addresses – the dev-team reminder will not be sent');
  const key = dateKey_(today);
  const closeKey = normKey_(cfg_('ATTENDANCE_CLOSE_DATE'));
  if ((!closeKey || key <= closeKey) && !facultyEmails_().length) p.push('No faculty e-mails: set FACULTY_EMAILS or fill the Faculty tab (needed for the attendance notice)');
  ['TAB_STUDENT_PROFILES', 'TAB_QUERIES', 'TAB_MODULES'].forEach(k => {
    if (!sheet_(k)) p.push('Tab "' + cfg_(k) + '" not found (Config → ' + k + ', or run bootstrap)');
  });
  const endKey = normKey_(cfg_('COURSE_PLAN_END'));
  if ((!endKey || key <= endKey) && !sheet_('TAB_COURSE_PLANS')) p.push('Tab "' + cfg_('TAB_COURSE_PLANS') + '" not found');
  if (!emails_(cfg_('ADMIN_EMAIL')).length) p.push('ADMIN_EMAIL is missing');
  return p;
}

// ---------------------------------------------------------------------------
// Report 1 – Pending Course Plan Approvals (owner George), daily 08–18 Sep
// ---------------------------------------------------------------------------
function buildCoursePlanReport_(today, ctx) {
  const key = dateKey_(today);
  const startKey = normKey_(cfg_('COURSE_PLAN_START'));
  const endKey = normKey_(cfg_('COURSE_PLAN_END'));
  if (!ctx.preview) {
    if (startKey && key < startKey) return { skip: 'starts on ' + startKey };
    if (endKey && key > endKey) return { skip: 'report period ended on ' + endKey };
    if (!cfgYes_('COURSE_PLAN_EVERY_DAY')) { const s = isSkipDay_(today); if (s) return { skip: s, log: true }; }
  }

  const t = readTable_('TAB_COURSE_PLANS');
  if (t.missing) throw new Error('Tab "' + t.tab + '" not found');
  const H = t.headers;
  const cStatus = col_(H, [/^status/i, /approv/i, /^state/i]);
  const cCode = col_(H, [/course\s*code/i, /subject\s*code/i, /^code$/i]);
  const cName = col_(H, [/course\s*(name|title)/i, /subject\s*(name|title)/i, /^course$/i, /^subject$/i, /^title$/i]);
  const cFac = col_(H, [/faculty/i, /teacher/i, /instructor/i, /staff/i, /handled\s*by/i]);
  const cDept = col_(H, [/^dep(artmen)?t/i, /dept/i, /department/i, /branch/i]);
  const cSem = col_(H, [/^sem/i, /semester/i]);
  const cSub = col_(H, [/submit/i, /uploaded/i, /created/i, /^date$/i, /sent\s*on/i]);
  const cDays = col_(H, [/days?\s*pend/i, /pending\s*days?/i, /^days$/i]);

  const pending = t.rows.filter(r => isPendingStatus_(cellStr_(val_(r, cStatus))));
  const data = pending.map(r => {
    let days = '';
    if (cDays && cellStr_(r[cDays]) !== '') days = Number(cellStr_(r[cDays]));
    else { const d = parseDate_(val_(r, cSub)); if (d) days = daysBetween_(d, today); }
    if (isNaN(days)) days = '';
    const course = [cellStr_(val_(r, cCode)), cellStr_(val_(r, cName))].filter(Boolean).join(' ' + DASH + ' ') || '(unnamed)';
    return {
      course: course,
      faculty: cellStr_(val_(r, cFac)),
      dept: cellStr_(val_(r, cDept)),
      sem: cellStr_(val_(r, cSem)),
      days: days,
      status: cellStr_(val_(r, cStatus)),
    };
  }).sort((a, b) => (numOr_(b.days, -1) - numOr_(a.days, -1)) || a.dept.localeCompare(b.dept));

  const owner = parsePerson_(cfg_('OWNER_COURSE_PLANS'));
  const backup = parsePerson_(cfg_('BACKUP_COURSE_PLANS'));
  const title = 'Pending Course Plan Approvals';
  const period = (startKey && endKey) ? 'Reporting period ' + niceDate_(parseDate_(startKey)) + ' ' + DASH + ' ' + niceDate_(parseDate_(endKey)) : '';

  let body;
  if (!data.length) {
    body = '<p style="font-size:16px"><strong>Nil pending.</strong></p>' +
      '<p>There are no course plans awaiting approval as of ' + esc_(niceDate_(today)) + '.</p>';
  } else {
    const over7 = data.filter(d => numOr_(d.days, 0) > 7).length;
    body = '<p><strong>' + data.length + '</strong> course plan' + (data.length === 1 ? '' : 's') + ' awaiting approval as of ' + esc_(niceDate_(today)) +
      (over7 ? ', of which <strong style="color:#b00020">' + over7 + '</strong> pending for more than 7 days' : '') + '.</p>' +
      htmlTable_(['#', 'Course', 'Faculty', 'Department', 'Semester', 'Days Pending', 'Status'],
        data.map((d, i) => [i + 1, d.course, d.faculty, d.dept, d.sem, d.days === '' ? DASH : d.days, d.status || 'Pending']),
        { highlightCol: 5, highlightIf: v => numOr_(v, 0) > 7 }) +
      summaryByGroup_(data, 'dept', 'Department');
  }
  const cfgC = getConfig_();
  return {
    to: [cfgC.PRINCIPAL_EMAIL, cfgC.ASH_HOD_EMAIL],
    cc: [cfgC.MANISHANKAR_EMAIL, cfgC.GNANA_KING_EMAIL, owner.email, backup.email],
    replyTo: owner.email,
    senderName: APP_NAME + ' ' + DASH + ' ' + (owner.name || 'Course Plans'),
    subject: subject_(title, today),
    html: wrap_(title, today, period, body, owner, backup),
    details: data.length + ' pending',
  };
}

// ---------------------------------------------------------------------------
// Report 2 – Pending Student Profile Creation (owner Aleena), daily
// ---------------------------------------------------------------------------
function buildStudentProfileReport_(today, ctx) {
  if (!ctx.preview) { const s = isSkipDay_(today); if (s) return { skip: s, log: true }; }
  const t = readTable_('TAB_STUDENT_PROFILES');
  if (t.missing) throw new Error('Tab "' + t.tab + '" not found');
  const H = t.headers;
  const cDept = col_(H, [/^dep(artmen)?t/i, /department/i, /dept/i, /branch/i, /programme?/i]);
  const cBatch = col_(H, [/batch/i, /year/i, /admission\s*year/i, /^sem/i]);
  const cFac = col_(H, [/responsible/i, /faculty/i, /advisor/i, /tutor/i, /in[-\s]?charge/i, /staff/i]);
  const cCreated = col_(H, [/profile\s*created/i, /created/i, /^status/i, /^completed?$/i, /^done$/i]);
  const cCount = col_(H, [/students?\s*pending/i, /pending\s*(count|students?)/i, /^count$/i, /no\.?\s*of/i, /^pending$/i, /remaining/i]);
  const cStudent = col_(H, [/student\s*name/i, /^name$/i, /^student$/i]);

  const groups = {};
  const add = (dept, batch, fac, n, name) => {
    const k = [dept, batch, fac].join('|');
    if (!groups[k]) groups[k] = { dept: dept, batch: batch, fac: fac, n: 0, names: [] };
    groups[k].n += n;
    if (name) groups[k].names.push(name);
  };

  let mode;
  if (cCreated) {
    mode = 'per-student';
    t.rows.forEach(r => {
      if (isYes_(cellStr_(r[cCreated]))) return;
      add(cellStr_(val_(r, cDept)), cellStr_(val_(r, cBatch)), cellStr_(val_(r, cFac)), 1, cellStr_(val_(r, cStudent)));
    });
  } else if (cCount) {
    mode = 'aggregated';
    t.rows.forEach(r => {
      const n = Number(cellStr_(r[cCount]));
      if (!n || n <= 0) return;
      add(cellStr_(val_(r, cDept)), cellStr_(val_(r, cBatch)), cellStr_(val_(r, cFac)), n, '');
    });
  } else {
    throw new Error('Tab "' + t.tab + '" needs either a "Profile Created" (Yes/No) column or a "Students Pending" count column');
  }

  const data = Object.keys(groups).map(k => groups[k])
    .sort((a, b) => a.dept.localeCompare(b.dept) || a.batch.localeCompare(b.batch) || a.fac.localeCompare(b.fac));
  const total = data.reduce((s, g) => s + g.n, 0);

  const owner = parsePerson_(cfg_('OWNER_STUDENT_PROFILES'));
  const backup = parsePerson_(cfg_('BACKUP_STUDENT_PROFILES'));
  const title = 'Pending Student Profile Creation';

  let body;
  if (!data.length) {
    body = '<p style="font-size:16px"><strong>Nil pending.</strong></p><p>All student profiles have been created as of ' + esc_(niceDate_(today)) + '.</p>';
  } else {
    const rows = data.map((g, i) => [i + 1, g.dept || DASH, g.batch || DASH, g.n, g.fac || DASH]);
    rows.push(['', 'Total', '', total, '']);
    body = '<p><strong>' + total + '</strong> student profile' + (total === 1 ? '' : 's') + ' not yet created as of ' + esc_(niceDate_(today)) +
      ', across ' + data.length + ' department/batch group' + (data.length === 1 ? '' : 's') + '.</p>' +
      htmlTable_(['#', 'Department', 'Batch', 'Students Pending', 'Responsible Faculty'], rows, { totalRow: true }) +
      (mode === 'per-student' ? '<p style="color:#555;font-size:12px">Student-wise details are in the "' + esc_(t.tab) + '" tab of the tracking sheet.</p>' : '');
  }
  const cfgC = getConfig_();
  return {
    to: [cfgC.PRINCIPAL_EMAIL, cfgC.ASH_HOD_EMAIL],
    cc: [cfgC.MANISHANKAR_EMAIL, cfgC.GNANA_KING_EMAIL, owner.email, backup.email],
    replyTo: owner.email,
    senderName: APP_NAME + ' ' + DASH + ' ' + (owner.name || 'Student Profiles'),
    subject: subject_(title, today),
    html: wrap_(title, today, '', body, owner, backup),
    details: total + ' pending in ' + data.length + ' groups (' + mode + ')',
  };
}

// ---------------------------------------------------------------------------
// Report 3 – Attendance Correction Window notice + reminders (owner Ashwin)
// ---------------------------------------------------------------------------
function buildAttendanceMail_(today, ctx) {
  const key = dateKey_(today);
  const closeKey = normKey_(cfg_('ATTENDANCE_CLOSE_DATE'));
  const noticeKey = normKey_(cfg_('ATTENDANCE_NOTICE_DATE'));
  const reminderKeys = listStr_(cfg_('ATTENDANCE_REMINDER_DATES')).map(normKey_).filter(Boolean).sort();
  const finalKey = closeKey || reminderKeys[reminderKeys.length - 1] || '';

  let variant = '';
  if (ctx.preview) {
    variant = 'NOTICE';
  } else {
    if (closeKey && key > closeKey) return { skip: 'attendance window closed on ' + closeKey };
    if (noticeKey && key === noticeKey) variant = 'NOTICE';
    else if (reminderKeys.indexOf(key) >= 0) variant = (key === finalKey) ? 'FINAL' : 'REMINDER';
    else if (noticeKey && key > noticeKey && !everSent_('ATTENDANCE:NOTICE')) variant = 'NOTICE'; // installed after the notice date
    if (!variant) return { skip: 'nothing due today' };
  }

  const closeDate = closeKey ? parseDate_(closeKey) : null;
  const closeNice = closeDate ? fmt_(closeDate, 'EEEE, dd MMM yyyy') : 'the announced date';
  const closeShort = closeDate ? niceDate_(closeDate) : '';
  const owner = parsePerson_(cfg_('OWNER_ATTENDANCE'));
  const backup = parsePerson_(cfg_('BACKUP_ATTENDANCE'));
  const faculty = facultyEmails_();
  const cfgC = getConfig_();

  let title, subject, lead;
  if (variant === 'NOTICE') {
    title = 'Attendance Correction Window';
    subject = 'Notice ' + DASH + ' Attendance Correction Window closes ' + closeShort + ' ' + DASH + ' ' + niceDate_(today);
    lead = '<p>This is to inform all faculty that the <strong>attendance correction window will be opened once</strong> and will ' +
      '<strong>close on ' + esc_(closeNice) + '</strong>.</p>' +
      '<p style="color:#b00020"><strong>There will be no further extension.</strong></p>' +
      '<p>Please complete all attendance corrections before the window closes.' +
      (reminderKeys.length ? ' Reminders will be sent on ' + esc_(reminderKeys.map(k => niceDate_(parseDate_(k))).join(' and ')) + '.' : '') + '</p>';
  } else if (variant === 'REMINDER') {
    title = 'Reminder: Attendance Correction Window';
    const daysLeft = closeDate ? daysBetween_(today, closeDate) : '';
    subject = 'Reminder ' + DASH + ' Attendance Correction Window closes ' + (daysLeft === 1 ? 'tomorrow, ' : '') + closeShort + ' ' + DASH + ' ' + niceDate_(today);
    lead = '<p>This is a reminder that the attendance correction window <strong>closes on ' + esc_(closeNice) + '</strong>' +
      (daysLeft === 1 ? ' (tomorrow)' : daysLeft ? ' (in ' + daysLeft + ' days)' : '') + '.</p>' +
      '<p style="color:#b00020"><strong>No further extension will be given.</strong> Please complete pending corrections today.</p>';
  } else {
    title = 'FINAL REMINDER: Attendance Correction Window closes today';
    subject = 'Final Reminder ' + DASH + ' Attendance Correction Window closes TODAY ' + closeShort + ' ' + DASH + ' ' + niceDate_(today);
    lead = '<p style="font-size:16px"><strong>The attendance correction window closes today, ' + esc_(closeNice) + '.</strong></p>' +
      '<p style="color:#b00020"><strong>This is the final reminder. There is no further extension.</strong> Any correction not completed today cannot be made later.</p>';
  }

  return {
    variant: variant,
    to: faculty,
    cc: [cfgC.MANISHANKAR_EMAIL, cfgC.PRINCIPAL_EMAIL, cfgC.ASH_HOD_EMAIL, cfgC.GNANA_KING_EMAIL, owner.email, backup.email],
    replyTo: owner.email,
    senderName: APP_NAME + ' ' + DASH + ' ' + (owner.name || 'Attendance'),
    subject: subject,
    html: wrap_(title, today, 'To all faculty', lead, owner, backup, 'Dear Faculty Members,'),
    details: variant + '; closes ' + closeKey,
  };
}

// ---------------------------------------------------------------------------
// Report 4 – Daily Status & Query Closure (owner Livya), daily before 10:00
// ---------------------------------------------------------------------------
function buildStatusReport_(today, ctx) {
  if (!ctx.preview) { const s = isSkipDay_(today); if (s) return { skip: s, log: true }; }
  const q = readTable_('TAB_QUERIES');
  const m = readTable_('TAB_MODULES');
  if (q.missing && m.missing) throw new Error('Tabs "' + q.tab + '" and "' + m.tab + '" not found');

  const lookback = Math.max(1, Number(cfg_('QUERY_LOOKBACK_DAYS')) || 1);
  const since = addDays_(today, -lookback);
  const sinceKey = dateKey_(since);
  const todayKey = dateKey_(today);
  const sinceNice = niceDate_(since);

  // --- queries -------------------------------------------------------------
  const sections = [];
  let received = 0, closed = 0, open = 0;
  if (!q.missing) {
    const H = q.headers;
    const cDate = col_(H, [/date\s*rec/i, /received/i, /reported/i, /^date$/i, /raised\s*on/i]);
    const cSrc = col_(H, [/source/i, /channel/i, /via/i, /mode/i, /reported\s*(to|via)/i]);
    const cBy = col_(H, [/raised\s*by/i, /reported\s*by/i, /^from$/i, /requester/i, /^by$/i, /^name$/i]);
    const cQuery = col_(H, [/^query/i, /issue/i, /description/i, /subject/i, /^title$/i]);
    const cStatus = col_(H, [/^status/i, /^state/i]);
    const cClosedOn = col_(H, [/closed\s*on/i, /resolved\s*on/i, /closure\s*date/i, /^closed$/i]);
    const cRemarks = col_(H, [/closure\s*remark/i, /remark/i, /resolution/i, /comment/i]);
    const cHandled = col_(H, [/handled/i, /assigned/i, /owner/i, /resolved\s*by/i]);

    const rows = q.rows.map(r => {
      const rec = parseDate_(val_(r, cDate));
      const cls = parseDate_(val_(r, cClosedOn));
      const status = cellStr_(val_(r, cStatus));
      const isClosed = isClosedStatus_(status) || (!!cls && !status);
      return {
        rec: rec, recKey: rec ? dateKey_(rec) : '', cls: cls, clsKey: cls ? dateKey_(cls) : '',
        src: cellStr_(val_(r, cSrc)), by: cellStr_(val_(r, cBy)), query: cellStr_(val_(r, cQuery)),
        status: status || (cls ? 'Closed' : 'Open'), isClosed: isClosed,
        remarks: cellStr_(val_(r, cRemarks)), handled: cellStr_(val_(r, cHandled)),
      };
    });
    received = rows.filter(r => r.recKey && r.recKey >= sinceKey && r.recKey <= todayKey).length;
    closed = rows.filter(r => r.isClosed && ((r.clsKey && r.clsKey >= sinceKey) || (!r.clsKey && r.recKey >= sinceKey))).length;
    open = rows.filter(r => !r.isClosed).length;
    const inScope = rows.filter(r => !r.isClosed || (r.clsKey && r.clsKey >= sinceKey) || (r.recKey && r.recKey >= sinceKey));

    const bucket = (re, label, other) => {
      const list = inScope.filter(r => other ? !/celer/i.test(r.src) && !/mail/i.test(r.src) : re.test(r.src))
        .sort((a, b) => (a.isClosed - b.isClosed) || (b.recKey || '').localeCompare(a.recKey || ''));
      if (other && !list.length) return;
      const table = list.length
        ? htmlTable_(['#', 'Received', 'Raised By', 'Query', 'Status', 'Closed On', 'Closure Remarks', 'Handled By'],
            list.map((r, i) => [i + 1, r.rec ? niceDate_(r.rec) : DASH, r.by || DASH, r.query || DASH, r.status,
              r.cls ? niceDate_(r.cls) : DASH, r.remarks || (r.isClosed ? DASH : 'In progress'), r.handled || DASH]),
            { highlightCol: 4, highlightIf: v => !isClosedStatus_(String(v)) })
        : '<p style="color:#555">None.</p>';
      sections.push('<h3 style="margin:18px 0 6px;font-size:15px;color:#1f4e79">' + esc_(label) + '</h3>' + table);
    };
    bucket(/mail/i, 'Queries received by e-mail ' + DASH + ' closure status and remarks');
    bucket(/celer/i, 'Queries reported directly to Celerscet ' + DASH + ' closure status');
    bucket(null, 'Other queries', true);
  } else {
    sections.push('<p style="color:#b00020">Queries tab "' + esc_(q.tab) + '" not found.</p>');
  }

  // --- modules under development today (from the Assignments tracker) ----
  let modRows = [];
  if (!m.missing) {
    const tasks = readTasks_(m).filter(x => x.active).sort((a, b) => a.person.localeCompare(b.person) || a.service.localeCompare(b.service));
    modRows = tasks.map(x => [x.service || DASH, x.task, x.type || DASH, x.person || '(unassigned)', x.start ? niceDate_(x.start) : DASH,
      x.due ? niceDate_(x.due) + (dateKey_(x.due) < todayKey ? ' (overdue)' : '') : DASH, x.remarks || DASH]);
  }
  const modHtml = '<h3 style="margin:18px 0 6px;font-size:15px;color:#1f4e79">Modules under development today</h3>' +
    (m.missing ? '<p style="color:#b00020">Tracker tab "' + esc_(m.tab) + '" not found.</p>'
      : modRows.length ? htmlTable_(['Module', 'Task', 'Type', 'Working On It', 'Started', 'Due', 'Remarks'], modRows, { highlightCol: 5, highlightIf: v => /overdue/.test(String(v)) })
      : '<p style="color:#555">No tasks are marked "In progress" in the tracker today.</p>');

  const summary = '<table cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin:4px -8px 8px">' +
    '<tr>' + stat_('Received since ' + sinceNice, received) + stat_('Closed since ' + sinceNice, closed) +
    stat_('Still open', open, open ? '#b00020' : '#1f7a1f') + stat_('Modules in progress', modRows.length) + '</tr></table>';

  const owner = parsePerson_(cfg_('OWNER_STATUS_REPORT'));
  const backup = parsePerson_(cfg_('BACKUP_STATUS_REPORT'));
  const title = 'Daily Status and Query Closure Report';
  const cfgC = getConfig_();
  return {
    to: [cfgC.MANISHANKAR_EMAIL, cfgC.PRINCIPAL_EMAIL],
    cc: [cfgC.GNANA_KING_EMAIL, owner.email, backup.email],
    replyTo: owner.email,
    senderName: APP_NAME + ' ' + DASH + ' ' + (owner.name || 'Status'),
    subject: subject_(title, today),
    html: wrap_(title, today, 'Covers ' + sinceNice + ' ' + DASH + ' ' + niceDate_(today) + ' and all open items',
      summary + sections.join('') + modHtml, owner, backup),
    details: received + ' received, ' + closed + ' closed, ' + open + ' open, ' + modRows.length + ' tasks in progress',
  };
}

// ---------------------------------------------------------------------------
// Report 5a – morning reminder to the dev team to log module / testing status
// ---------------------------------------------------------------------------
function buildDevTeamReminder_(today, ctx) {
  if (!ctx.preview) { const s = isSkipDay_(today); if (s) return { skip: s, log: true }; }
  const team = people_(cfg_('DEV_TEAM'));
  const emails = team.map(p => p.email).filter(isEmail_);
  if (!emails.length && !ctx.preview) return { skip: 'DEV_TEAM has no e-mail addresses' };

  const owner = parsePerson_(cfg_('OWNER_STATUS_REPORT'));
  const deadline = cfg_('MODULE_STATUS_DEADLINE') || '5:00 PM';
  const link = tabLink_('TAB_MODULES');
  const title = 'Module completion & testing status ' + DASH + ' due today';
  const body = '<p>Please update your tasks in the <strong>' + esc_(cfg_('TAB_MODULES')) + '</strong> tracker by <strong>' + esc_(deadline) + '</strong> today:</p>' +
    '<p style="margin:12px 0"><a href="' + esc_(link) + '" style="background:#1f4e79;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px;font-weight:bold">Open the "' + esc_(cfg_('TAB_MODULES')) + '" tab</a></p>' +
    '<ul style="margin:6px 0 10px 18px;padding:0">' +
    '<li>Set <strong>Status</strong> to <em>In progress</em> for what you are developing / testing today.</li>' +
    '<li>When something is finished, set Status to <em>Done</em> and fill the <strong>Finished date</strong>.</li>' +
    '<li>Fill <strong>Due on</strong> for tasks in progress and note blockers in <strong>remarks</strong>.</li></ul>' +
    '<p>Expected from: <strong>' + esc_(team.map(p => p.name).filter(Boolean).join(', ') || 'the development team') + '</strong>.</p>' +
    '<p style="color:#555;font-size:13px">At 5:30 PM a digest of tasks finished today, tasks in progress and anyone with nothing updated goes to Dr. Manishankar and the Principal.</p>';
  return {
    to: emails,
    cc: [owner.email],
    replyTo: owner.email,
    senderName: APP_NAME,
    subject: 'Reminder ' + DASH + ' Module completion & testing status due today by ' + deadline + ' ' + DASH + ' ' + niceDate_(today),
    html: wrap_(title, today, '', body, owner, null, 'Dear Team,'),
    details: emails.length + ' recipients',
  };
}

// ---------------------------------------------------------------------------
// Report 5b – evening digest of module completion & testing status (from the tracker)
// ---------------------------------------------------------------------------
/** Normalised rows of the Assignments tracker (rows without a task name are dropped). */
function readTasks_(t) {
  const H = t.headers;
  let cService = col_(H, [/^services?$/i, /^module\s*group/i, /^area$/i, /^category/i]);
  const cTask = col_(H.filter(h => h !== cService), [/^task$/i, /^task\s*name/i, /work\s*item/i, /^item$/i, /feature/i, /^work$/i, /description/i, /^module$/i, /module/i]);
  if (!cService) cService = col_(H.filter(h => h !== cTask), [/^module$/i, /^services?$/i]);
  const cType = col_(H, [/task\s*type/i, /^type$/i, /activity/i]);
  const cPerson = col_(H, [/faculty\s*assigned/i, /assigned/i, /developer/i, /person/i, /owner/i, /working/i, /^name$/i, /^by$/i]);
  const cStatus = col_(H, [/^status/i, /^stage/i, /^state/i]);
  const cStart = col_(H, [/start/i]);
  const cDue = col_(H, [/due/i, /target/i, /deadline/i, /eta/i]);
  const cFin = col_(H, [/finish/i, /complet(ed|ion)\s*(date|on)/i, /^done\s*(date|on)/i, /closed\s*on/i, /^end\s*date/i]);
  const cRem = col_(H, [/remark/i, /comment/i, /note/i]);
  if (!cTask || !cStatus) throw new Error('Tab "' + t.tab + '" needs "Task" and "Status" columns (found: ' + H.join(', ') + ')');
  return t.rows.map(r => {
    const status = cellStr_(val_(r, cStatus));
    const start = parseDate_(val_(r, cStart)), due = parseDate_(val_(r, cDue)), fin = parseDate_(val_(r, cFin));
    return {
      task: cellStr_(r[cTask]), service: cellStr_(val_(r, cService)), type: cellStr_(val_(r, cType)), person: cellStr_(val_(r, cPerson)),
      status: status, start: start, due: due, fin: fin, finKey: fin ? dateKey_(fin) : '', remarks: cellStr_(val_(r, cRem)),
      active: isActiveStatus_(status), done: isDoneStatus_(status),
    };
  }).filter(x => x.task);
}

function buildModuleDigest_(today, ctx) {
  if (!ctx.preview) { const s = isSkipDay_(today); if (s) return { skip: s, log: true }; }
  const t = readTable_('TAB_MODULES');
  if (t.missing) throw new Error('Tab "' + t.tab + '" not found');
  const todayKey = dateKey_(today);
  const tasks = readTasks_(t);

  const finishedToday = tasks.filter(x => x.finKey === todayKey);
  const inProgress = tasks.filter(x => x.active);
  const overdue = inProgress.filter(x => x.due && dateKey_(x.due) < todayKey);
  const queued = tasks.filter(x => !x.active && !x.done && x.person);  // Not started but assigned to someone

  // group by person
  const byPerson = {};
  const bucket = (x, kind) => { if (!x.person) return; (byPerson[x.person] = byPerson[x.person] || { finished: [], active: [], queued: [] })[kind].push(x); };
  finishedToday.forEach(x => bucket(x, 'finished'));
  inProgress.forEach(x => bucket(x, 'active'));
  queued.forEach(x => bucket(x, 'queued'));

  const team = people_(cfg_('DEV_TEAM')).map(p => p.name).filter(Boolean);
  const hasActivity = p => byPerson[p] && (byPerson[p].finished.length || byPerson[p].active.length);
  const missing = team.filter(n => !Object.keys(byPerson).some(p => sameFirstName_(p, n) && hasActivity(p)));
  const people = Object.keys(byPerson).sort((a, b) => {
    const ta = team.some(n => sameFirstName_(a, n)) ? 0 : 1, tb = team.some(n => sameFirstName_(b, n)) ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });

  let body = '<table cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin:4px -8px 8px"><tr>' +
    stat_('Finished today', finishedToday.length, finishedToday.length ? '#1f7a1f' : '#1f4e79') + stat_('In progress', inProgress.length) +
    stat_('Overdue', overdue.length, overdue.length ? '#b00020' : '#1f7a1f') + stat_('No update', missing.length, missing.length ? '#b00020' : '#1f7a1f') + '</tr></table>';
  if (missing.length) body += '<p style="color:#b00020"><strong>Nothing finished today and nothing in progress for:</strong> ' + esc_(missing.join(', ')) + '</p>';
  if (!finishedToday.length && !inProgress.length) body += '<p><strong>No task in the tracker is marked "In progress" or finished today.</strong></p>';

  const rowOf = (x, label) => [x.service || DASH, x.task, x.type || DASH, label || x.status || DASH, x.start ? niceDate_(x.start) : DASH,
    x.due ? niceDate_(x.due) + (x.active && dateKey_(x.due) < todayKey ? ' (overdue)' : '') : DASH, x.fin ? niceDate_(x.fin) : DASH, x.remarks || DASH];
  const cols = ['Module', 'Task', 'Type', 'Status', 'Started', 'Due', 'Finished', 'Remarks'];
  people.forEach(p => {
    const g = byPerson[p];
    const rows = g.finished.map(x => rowOf(x, 'Done today')).concat(g.active.map(x => rowOf(x))).concat(g.queued.map(x => rowOf(x, 'Not started')));
    const tag = team.length && !team.some(n => sameFirstName_(p, n)) ? ' <span style="color:#777;font-weight:normal">(not in DEV_TEAM list)</span>' : '';
    body += '<h3 style="margin:18px 0 6px;font-size:15px;color:#1f4e79">' + esc_(p) + tag +
      ' <span style="color:#555;font-weight:normal;font-size:13px">' + DASH + ' ' + g.finished.length + ' finished today, ' + g.active.length + ' in progress' + (g.queued.length ? ', ' + g.queued.length + ' not started' : '') + '</span></h3>' +
      htmlTable_(cols, rows, { highlightCol: 5, highlightIf: v => /overdue/.test(String(v)) });
  });

  // overall tracker snapshot
  const counts = {};
  tasks.forEach(x => { const k = x.status || 'No status'; counts[k] = (counts[k] || 0) + 1; });
  const unassigned = tasks.filter(x => !x.person && !x.done).length;
  body += '<h3 style="margin:18px 0 6px;font-size:15px;color:#1f4e79">Overall tracker</h3>' +
    htmlTable_(['Status', 'Tasks'], Object.keys(counts).sort().map(k => [k, counts[k]]).concat([['Total', tasks.length]]), { totalRow: true }) +
    (unassigned ? '<p style="color:#555;font-size:13px">' + unassigned + ' open task' + (unassigned === 1 ? '' : 's') + ' not yet assigned to anyone.</p>' : '');

  const owner = parsePerson_(cfg_('OWNER_STATUS_REPORT'));
  const cfgC = getConfig_();
  const digestTo = emails_(cfg_('MODULE_DIGEST_TO'));
  const title = 'Module Completion & Testing Status';
  return {
    to: digestTo.length ? digestTo : [cfgC.MANISHANKAR_EMAIL, cfgC.PRINCIPAL_EMAIL],
    cc: [cfgC.MANISHANKAR_EMAIL, cfgC.PRINCIPAL_EMAIL, cfgC.GNANA_KING_EMAIL, owner.email],
    replyTo: owner.email,
    senderName: APP_NAME,
    subject: subject_(title, today),
    html: wrap_(title, today, 'From the "' + t.tab + '" tracker', body, owner, null),
    details: finishedToday.length + ' finished, ' + inProgress.length + ' in progress, ' + overdue.length + ' overdue; no update: ' + (missing.join(', ') || 'none'),
  };
}

// ---------------------------------------------------------------------------
// Mail sending, dry-run redirection, logging
// ---------------------------------------------------------------------------
function sendMail_(logKey, dateKey, mail, ctx) {
  const dry = cfgYes_('DRY_RUN') || !!ctx.redirectTo;
  let to = emails_(mail.to.join(','));
  let cc = emails_(mail.cc.join(',')).filter(e => to.indexOf(e) < 0);
  const replyTo = isEmail_(mail.replyTo || '') ? mail.replyTo : '';
  let subject = mail.subject;
  let html = mail.html;
  let status = 'SENT';

  if (dry) {
    const target = emails_(ctx.redirectTo || cfg_('ADMIN_EMAIL'));
    if (!target.length) throw new Error('DRY_RUN is on but ADMIN_EMAIL is not set');
    html = dryBanner_(ctx.preview ? 'PREVIEW' : 'DRY RUN', to, cc, replyTo) + html;
    subject = '[' + (ctx.preview ? 'PREVIEW' : 'DRY RUN') + '] ' + subject;
    to = target; cc = [];
    status = ctx.preview ? 'PREVIEW' : 'DRY_RUN';
  } else if (!to.length) {
    throw new Error('no valid "To" recipients configured');
  }

  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('daily e-mail quota exhausted');
  const opts = { to: to.join(','), subject: subject, htmlBody: html, body: mail.text || htmlToText_(html), name: mail.senderName || APP_NAME };
  if (cc.length) opts.cc = cc.join(',');
  if (replyTo) opts.replyTo = replyTo;
  MailApp.sendEmail(opts);
  logMail_(dateKey, logKey, status, to, cc, subject, mail.details || '');
  return { status: status, to: to, cc: cc, subject: subject };
}

function dryBanner_(label, to, cc, replyTo) {
  return '<div style="background:#fff4ce;border:2px dashed #c77700;padding:10px 14px;margin-bottom:14px;font-family:Arial,sans-serif;font-size:13px">' +
    '<strong>' + label + ' ' + DASH + ' this mail was sent only to you.</strong> When live it would go:<br>' +
    '<b>To:</b> ' + esc_(to.join(', ') || '(none configured!)') + '<br>' +
    '<b>CC:</b> ' + esc_(cc.join(', ') || '(none)') + '<br>' +
    '<b>Reply-To:</b> ' + esc_(replyTo || '(none)') + '<br>' +
    'Set <code>DRY_RUN</code> to <code>NO</code> in the Config tab to go live.</div>';
}

let MAILLOG_CACHE_ = null;
function mailLogSheet_() {
  let sh = sheet_('TAB_MAIL_LOG');
  if (!sh) {
    sh = ss_().insertSheet(cfg_('TAB_MAIL_LOG'));
    sh.getRange(1, 1, 1, TAB_SCHEMAS.TAB_MAIL_LOG.length).setValues([TAB_SCHEMAS.TAB_MAIL_LOG])
      .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function mailLogRows_() {
  if (MAILLOG_CACHE_) return MAILLOG_CACHE_;
  const vals = mailLogSheet_().getDataRange().getValues();
  MAILLOG_CACHE_ = vals.slice(1).map(r => ({
    date: cellStr_(r[1]), report: cellStr_(r[2]), status: cellStr_(r[3]), details: cellStr_(r[7]),
  }));
  return MAILLOG_CACHE_;
}
function logMail_(dateKey, report, status, to, cc, subject, details) {
  mailLogSheet_().appendRow([new Date(), dateKey, report, status, to.join(', '), cc.join(', '), subject, details]);
  if (MAILLOG_CACHE_) MAILLOG_CACHE_.push({ date: dateKey, report: report, status: status, details: details });
}
/** True if this report already went out (or was deliberately skipped) today. */
function alreadyDone_(dateKey, reportKey) {
  return mailLogRows_().some(r => r.date === dateKey && (r.report === reportKey || r.report.indexOf(reportKey + ':') === 0) &&
    ['SENT', 'DRY_RUN', 'SKIPPED'].indexOf(r.status) >= 0);
}
/** True if a real (live) mail with this log key was ever sent. */
function everSent_(reportKey) {
  return mailLogRows_().some(r => r.report === reportKey && r.status === 'SENT');
}

// ---------------------------------------------------------------------------
// Configuration access
// ---------------------------------------------------------------------------
let CONFIG_CACHE_ = null;
function resetCaches_() { CONFIG_CACHE_ = null; MAILLOG_CACHE_ = null; }
function getConfig_() {
  if (CONFIG_CACHE_) return CONFIG_CACHE_;
  const cfg = {};
  CONFIG_DEFAULTS.forEach(r => { cfg[r[0]] = String(r[1]); });
  const sh = ss_().getSheetByName(CONFIG_TAB);
  if (sh) {
    const vals = sh.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      const k = String(vals[i][0] || '').trim();
      if (k) cfg[k] = cellStr_(vals[i][1]);
    }
  }
  CONFIG_CACHE_ = cfg;
  return cfg;
}
function cfg_(key) { return (getConfig_()[key] || '').trim(); }
function cfgYes_(key) { return /^(y|yes|true|1|on)$/i.test(cfg_(key)); }

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(cfgKey) { const n = cfg_(cfgKey); return n ? ss_().getSheetByName(n) : null; }
function tabLink_(cfgKey) {
  const sh = sheet_(cfgKey);
  return ss_().getUrl() + (sh ? '#gid=' + sh.getSheetId() : '');
}
function facultyEmails_() {
  const direct = emails_(cfg_('FACULTY_EMAILS'));
  if (direct.length) return direct;
  const t = readTable_('TAB_FACULTY');
  if (t.missing) return [];
  const cMail = col_(t.headers, [/e-?mail/i, /mail/i]);
  if (!cMail) return [];
  return emails_(t.rows.map(r => cellStr_(r[cMail])).join(','));
}

// ---------------------------------------------------------------------------
// Table reading and column matching
// ---------------------------------------------------------------------------
function readTable_(cfgKey) {
  const tab = cfg_(cfgKey);
  const sh = sheet_(cfgKey);
  if (!sh) return { missing: true, tab: tab, headers: [], rows: [] };
  const vals = sh.getDataRange().getValues();
  const hi = findHeaderRow_(vals);
  if (hi < 0) return { tab: tab, headers: [], rows: [] };
  const headers = vals[hi].map(h => String(h === null || h === undefined ? '' : h).trim());
  const rows = [];
  for (let i = hi + 1; i < vals.length; i++) {
    const r = vals[i];
    const o = { __row: i + 1 };
    let any = false;
    headers.forEach((h, j) => { if (!h) return; o[h] = r[j]; if (cellStr_(r[j]) !== '') any = true; });
    if (any) rows.push(o);  // rows holding only blanks / dropdown placeholders are ignored
  }
  return { tab: tab, headers: headers.filter(Boolean), rows: rows, headerRow: hi + 1 };
}
/** The header may not be on row 1 (the tracker has a title row above it): pick the first row with 2+ recognisable column names. */
function findHeaderRow_(vals) {
  const KNOWN = /^(task|status|services?|faculty|department|dept|batch|course|subject|name|e-?mail|date|source|query|module|remarks?|semester|sem\b|submitted|profile|admission|due|start|finish|assigned|type|raised|closed|handled)/i;
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(vals.length, 25); i++) {
    const cells = vals[i].map(v => (v instanceof Date) ? '' : String(v === null || v === undefined ? '' : v).trim()).filter(c => c && isNaN(Number(c)));
    if (cells.length < 2) continue;
    if (cells.filter(c => KNOWN.test(c)).length >= 2) return i;
    if (cells.length > bestScore) { bestScore = cells.length; best = i; }
  }
  return best;
}
/** First header matching any of the patterns, in pattern priority order. */
function col_(headers, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    const h = headers.find(x => patterns[i].test(x));
    if (h) return h;
  }
  return null;
}
function val_(row, header) { return header ? row[header] : ''; }

// ---------------------------------------------------------------------------
// Status interpretation
// ---------------------------------------------------------------------------
function isPendingStatus_(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return true;
  if (/(^|\s)(not|pending|awaiting|awaits|waiting|under|for|yet to be|to be)\s+(approv|accept|review|verif)/.test(s)) return true;
  if (/(approv|accept|review)\w*\s+(pending|awaited|due)/.test(s)) return true;
  if (/^(approved|accepted|rejected|withdrawn|cancelled|canceled|closed|completed|done|verified|yes|y|ok)\b/.test(s)) return false;
  return true;
}
function isYes_(s) { return /^(y|yes|true|1|created|done|complete|completed|ok)\b/i.test(String(s || '').trim()); }
function isClosedStatus_(s) { return /^(closed|resolved|done|complete|completed|fixed|solved|answered)\b/i.test(String(s || '').trim()); }
function isDoneStatus_(s) { return /^(done|completed?|closed|finished|deployed|released|live|delivered)\b/i.test(String(s || '').trim()); }
function isActiveStatus_(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return false;
  if (/^(completed?|done|deployed|live|released|closed|delivered|planned|not\s*started|on\s*hold|dropped|cancel)/.test(s)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// People and e-mail lists
// ---------------------------------------------------------------------------
function isEmail_(e) { return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(e || '').trim()); }
function listStr_(s) { return String(s || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean); }
function parsePerson_(s) {
  s = String(s || '').trim();
  const m = s.match(/^([^<]*?)\s*<\s*([^>]*)\s*>$/);
  if (m) return { name: m[1].trim(), email: isEmail_(m[2]) ? m[2].trim().toLowerCase() : '' };
  if (isEmail_(s)) { const local = s.split('@')[0]; return { name: local.charAt(0).toUpperCase() + local.slice(1), email: s.toLowerCase() }; }
  return { name: s, email: '' };
}
function people_(s) { return listStr_(s).map(parsePerson_); }
function emails_(s) {
  const out = [];
  people_(s).forEach(p => { if (p.email && out.indexOf(p.email) < 0) out.push(p.email); });
  return out;
}
function sameFirstName_(a, b) {
  const fa = String(a).trim().toLowerCase().split(/\s+/)[0], fb = String(b).trim().toLowerCase().split(/\s+/)[0];
  return !!fa && fa === fb;
}
function safeActiveEmail_() { try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; } }

// ---------------------------------------------------------------------------
// Dates (all in IST)
// ---------------------------------------------------------------------------
function now_() { return (typeof __TEST_NOW__ !== 'undefined' && __TEST_NOW__) ? new Date(__TEST_NOW__) : new Date(); }
function fmt_(d, pattern) { return Utilities.formatDate(d, TZ, pattern); }
function dateKey_(d) { return fmt_(d, 'yyyy-MM-dd'); }
function niceDate_(d) { return fmt_(d, 'dd MMM yyyy'); }
function normKey_(s) { const d = parseDate_(s); return d ? dateKey_(d) : ''; }
function parseDate_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); // dd/mm/yyyy (Indian convention)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/); // dd/mm/yy
  if (m) return new Date(2000 + +m[3], +m[2] - 1, +m[1], 12);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function keyToUtc_(key) { const p = key.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function daysBetween_(a, b) { return Math.round((keyToUtc_(dateKey_(b)) - keyToUtc_(dateKey_(a))) / 86400000); }
function addDays_(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function isSkipDay_(d) {
  const weekday = fmt_(d, 'EEEE').toLowerCase();
  const skip = listStr_(cfg_('SKIP_DAYS')).map(s => s.toLowerCase().slice(0, 3));
  if (skip.some(s => s && weekday.indexOf(s) === 0)) return fmt_(d, 'EEEE') + ' is in SKIP_DAYS';
  const hol = listStr_(cfg_('HOLIDAYS')).map(normKey_);
  if (hol.indexOf(dateKey_(d)) >= 0) return 'holiday (' + dateKey_(d) + ')';
  return '';
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function cellStr_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : dateKey_(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  const s = String(v).trim();
  return /^(select|choose|-+|n\/a|na)$/i.test(s) ? '' : s;
}
function numOr_(v, dflt) { const n = Number(v); return (v === '' || v === null || isNaN(n)) ? dflt : n; }
function esc_(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function subject_(title, d) { return 'Daily Report ' + DASH + ' ' + title + ' ' + DASH + ' ' + niceDate_(d); }

function stat_(label, value, color) {
  return '<td style="border:1px solid #d0d7de;border-radius:6px;padding:8px 14px;text-align:center;background:#f6f8fa">' +
    '<div style="font-size:22px;font-weight:bold;color:' + (color || '#1f4e79') + '">' + esc_(value) + '</div>' +
    '<div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.3px">' + esc_(label) + '</div></td>';
}

function htmlTable_(headers, rows, opts) {
  opts = opts || {};
  const cell = 'border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;font-size:13px';
  const th = headers.map(h => '<th style="' + cell + ';background:#1f4e79;color:#fff;text-align:left;white-space:nowrap">' + esc_(h) + '</th>').join('');
  const trs = rows.map((r, i) => {
    const isTotal = opts.totalRow && i === rows.length - 1;
    const bg = isTotal ? '#e8eef5' : (i % 2 ? '#f6f8fa' : '#ffffff');
    const tds = r.map((c, j) => {
      let style = cell + (isTotal ? ';font-weight:bold' : '');
      if (opts.highlightCol === j && opts.highlightIf && opts.highlightIf(c)) style += ';color:#b00020;font-weight:bold';
      if (typeof c === 'number') style += ';text-align:right';
      return '<td style="' + style + '">' + esc_(c) + '</td>';
    }).join('');
    return '<tr style="background:' + bg + '">' + tds + '</tr>';
  }).join('');
  return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 12px">' +
    '<thead><tr>' + th + '</tr></thead><tbody>' + trs + '</tbody></table>';
}

function summaryByGroup_(data, field, label) {
  const counts = {};
  data.forEach(d => { const k = d[field] || DASH; counts[k] = (counts[k] || 0) + 1; });
  const keys = Object.keys(counts).sort();
  if (keys.length < 2) return '';
  return '<p style="margin:6px 0 2px;font-size:13px;color:#555">By ' + esc_(label.toLowerCase()) + ':</p>' +
    '<p style="margin:0 0 8px;font-size:13px">' + keys.map(k => '<span style="display:inline-block;background:#e8eef5;border-radius:12px;padding:3px 10px;margin:2px 4px 2px 0">' + esc_(k) + ' <b>' + counts[k] + '</b></span>').join('') + '</p>';
}

/** Standard mail chrome around a report body. */
function wrap_(title, today, subtitle, body, owner, backup, salutation) {
  const ss = ss_();
  const ownerLine = owner && owner.name ? esc_(owner.name) : 'Report owner';
  const backupLine = backup && backup.name ? ' <span style="color:#555">(backup: ' + esc_(backup.name) + ')</span>' : '';
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:960px;line-height:1.45">' +
    '<div style="background:#1f4e79;color:#fff;padding:14px 18px;border-radius:6px 6px 0 0">' +
    '<div style="font-size:18px;font-weight:bold">' + esc_(title) + '</div>' +
    '<div style="font-size:13px;opacity:.9;margin-top:2px">' + esc_(cfg_('ORG_NAME') || 'Sahrdaya') + ' &middot; ' + esc_(fmt_(today, 'EEEE, dd MMM yyyy')) +
    (subtitle ? ' &middot; ' + esc_(subtitle) : '') + '</div></div>' +
    '<div style="border:1px solid #d0d7de;border-top:0;padding:16px 18px;border-radius:0 0 6px 6px">' +
    '<p style="margin-top:0">' + esc_(salutation || 'Dear Sir/Madam,') + '</p>' +
    body +
    '<p style="margin-bottom:0">Regards,<br><strong>' + ownerLine + '</strong>' + backupLine + '</p>' +
    '</div>' +
    '<p style="color:#666;font-size:12px;margin-top:10px">Generated automatically from <a href="' + esc_(ss.getUrl()) + '" style="color:#1f4e79">' + esc_(ss.getName()) + '</a> at ' +
    esc_(fmt_(now_(), 'dd MMM yyyy, HH:mm')) + ' IST. Replies go to the report owner.</p></div>';
}

function htmlToText_(html) {
  return String(html || '')
    .replace(/<\/(tr|p|div|h[1-6]|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<\/span>/gi, '   ')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Show a message in the sheet UI when available, otherwise log it. Returns the message. */
function ui_(msg) {
  try { SpreadsheetApp.getUi().alert(APP_NAME, msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
  return msg;
}
