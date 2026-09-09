'use strict';
// Runs src/Code.gs against in-memory spreadsheets and checks the mails it produces.
//   TZ=Asia/Kolkata node test/run.js        (npm test does this)
const fs = require('fs');
const path = require('path');
const { createEnv } = require('./gas-mock');
const F = require('./fixtures');
const D = (y, m, d) => new Date(y, m - 1, d);

const OUT = process.env.OUT_DIR || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
function check(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function scenario(name, fn) { console.log('\n▶ ' + name); try { fn(); } catch (e) { fail++; console.log('  ✗ threw: ' + (e.stack || e)); } }
function save(name, mail) { fs.writeFileSync(path.join(OUT, name + '.html'), '<!-- ' + mail.subject + '\nTo: ' + mail.to + '\nCC: ' + (mail.cc || '') + '\nReply-To: ' + (mail.replyTo || '') + ' -->\n' + mail.htmlBody); }
function logRows(env) { return env.ss.getSheetByName('Mail Log').values.slice(1); }
const IST = (date, time) => date + 'T' + (time || '09:20:00') + '+05:30';

scenario('bootstrap on an empty spreadsheet creates Config + all tabs, and is idempotent', () => {
  const env = createEnv({ 'Sheet1': [['']] }, IST('2026-09-08'));
  env.ctx.bootstrapSheet();
  const names = env.ss.getSheets().map(s => s.getName());
  ['Config', 'Course Plans', 'Student Profiles', 'Queries', 'Assignments', 'Faculty', 'Mail Log'].forEach(n => check(names.includes(n), 'tab created: ' + n));
  check(!names.includes('Module Status') && !names.includes('Modules'), 'no extra module tabs');
  const cfg = env.ss.getSheetByName('Config').values;
  const N = cfg.length;
  check(N > 30 && cfg.slice(1).every(r => /^[A-Z_]+$/.test(r[0])), 'Config filled with ' + (N - 1) + ' keys');
  check(new Set(cfg.slice(1).map(r => r[0])).size === N - 1, 'no duplicate keys');
  check(cfg[0][0] === 'Key' && cfg[1][0] === 'DRY_RUN' && cfg[1][1] === 'YES', 'DRY_RUN defaults to YES');
  check(env.ss.getSheetByName('Course Plans').notes['1,7'], 'header note on Course Plans!Status');
  // edit a value, delete a key, bootstrap again → value kept, key re-added, nothing else created
  env.ss.getSheetByName('Config').values[4][1] = 'p@x.in';
  env.ss.getSheetByName('Config').values.splice(10, 1);
  env.ctx.bootstrapSheet();
  const cfg2 = env.ss.getSheetByName('Config').values;
  check(cfg2.length === N, 'missing key re-added, count back to ' + (N - 1));
  check(cfg2[4][1] === 'p@x.in', 'edited value preserved');
  check(env.ss.getSheets().length === names.length, 'no duplicate tabs on second bootstrap');
  check(env.ui.alerts.length === 2 && /Nothing changed|All tabs/.test(env.ui.alerts[1]), 'second run reports nothing changed');
});

scenario('morning run on 08 Sep (live) sends all five mails with the right recipients and subjects', () => {
  const env = createEnv(F.fullSheet(), IST('2026-09-08'));
  const res = env.ctx.morningRun();
  check(env.sent.length === 5, 'five mails sent, got ' + env.sent.length + '\n' + res.join('\n'));
  const by = {}; env.sent.forEach(m => { by[m.subject] = m; });
  const subjects = Object.keys(by);

  const cp = env.sent.find(m => /Pending Course Plan Approvals/.test(m.subject));
  check(cp && cp.subject === 'Daily Report – Pending Course Plan Approvals – 08 Sep 2026', 'course plan subject exact: ' + (cp && cp.subject));
  check(cp && cp.to === 'principal@sahrdaya.ac.in,hod.ash@sahrdaya.ac.in', 'course plan To = Principal + ASH HoD: ' + (cp && cp.to));
  check(cp && cp.cc === 'manishankar@sahrdaya.ac.in,gnanaking@sahrdaya.ac.in,george@sahrdaya.ac.in,aleenavarghese@sahrdaya.ac.in', 'course plan CC = Manishankar, Gnana King, owner, backup: ' + (cp && cp.cc));
  check(cp && cp.replyTo === 'george@sahrdaya.ac.in', 'course plan reply-to owner');
  check(cp && /<strong>4<\/strong> course plans awaiting/.test(cp.htmlBody), '4 pending course plans (Pending, Submitted, blank, Awaiting) – not Approved/Rejected');
  check(cp && !/Operating Systems/.test(cp.htmlBody) && !/Surveying/.test(cp.htmlBody), 'approved and rejected plans excluded');
  check(cp && /Data Structures.*?<td[^>]*>11<\/td>/s.test(cp.htmlBody), 'days pending computed from Date cell (28 Aug → 11)');
  check(cp && /Thermodynamics.*?<td[^>]*>7<\/td>/s.test(cp.htmlBody), 'days pending from dd/mm/yyyy text (01/09 → 7)');
  check(cp && cp.htmlBody.indexOf('Data Structures') < cp.htmlBody.indexOf('Linear Algebra'), 'sorted by days pending, longest first');
  check(cp && /Reporting period 08 Sep 2026 – 18 Sep 2026/.test(cp.htmlBody), 'period shown in header');
  check(cp && cp.body && cp.body.indexOf('<') < 0 && /Data Structures/.test(cp.body), 'plain-text alternative present');
  if (cp) save('01-course-plans', cp);

  const sp = env.sent.find(m => /Pending Student Profile Creation/.test(m.subject));
  check(sp && sp.subject === 'Daily Report – Pending Student Profile Creation – 08 Sep 2026', 'student profile subject');
  check(sp && sp.to === 'principal@sahrdaya.ac.in,hod.ash@sahrdaya.ac.in', 'student profile To');
  check(sp && sp.cc === 'manishankar@sahrdaya.ac.in,gnanaking@sahrdaya.ac.in,aleenavarghese@sahrdaya.ac.in', 'student profile CC (owner Aleena once, no blank backup)');
  check(sp && /<strong>5<\/strong> student profiles not yet created/.test(sp.htmlBody), '5 pending profiles (No, blank, Not created, no)');
  check(sp && /CSE.*?2026-30.*?<td[^>]*>2<\/td>/s.test(sp.htmlBody), 'CSE 2026-30 grouped to 2');
  check(sp && /M\.Tech CSE/.test(sp.htmlBody) && /Dr\. Gnana King/.test(sp.htmlBody), 'M.Tech group present with responsible faculty');
  if (sp) save('02-student-profiles', sp);

  const st = env.sent.find(m => /Daily Status and Query Closure/.test(m.subject));
  check(st && st.subject === 'Daily Report – Daily Status and Query Closure Report – 08 Sep 2026', 'status report subject');
  check(st && st.to === 'manishankar@sahrdaya.ac.in,principal@sahrdaya.ac.in', 'status To = Manishankar + Principal');
  check(st && st.cc === 'gnanaking@sahrdaya.ac.in,livya@sahrdaya.ac.in', 'status CC = Gnana King + owner Livya');
  check(st && /Queries received by e-mail/.test(st.htmlBody) && /Celerscet/.test(st.htmlBody), 'both query sections present');
  check(st && /File size limit raised/.test(st.htmlBody) && /Attendance page shows wrong batch/.test(st.htmlBody), 'yesterday\'s closed + open e-mail queries included');
  check(st && !/Password reset/.test(st.htmlBody), 'old closed query (02 Sep) excluded');
  check(st && /Covers 07 Sep 2026 – 08 Sep 2026 and all open items/.test(st.htmlBody), 'window subtitle = yesterday to today');
  check(st && /Received since 07 Sep 2026/.test(st.htmlBody), 'stat label names the since-date');
  check(st && /Marks entry locked/.test(st.htmlBody), 'older but still-open Celerscet query included');
  check(st && /testing timetable/.test(st.htmlBody) && /Exam Creation rework/.test(st.htmlBody) && /courses creation/.test(st.htmlBody), 'modules: In progress tasks from the tracker shown');
  check(st && !/Admission flow creation/.test(st.htmlBody) && !/library books creation/.test(st.htmlBody) && !/course plan creation, approval/.test(st.htmlBody), 'Done and Not started tasks hidden');
  check(st && /24 Jul 2026 \(overdue\)/.test(st.htmlBody), 'overdue due date flagged');
  check(st && /Nicy Johnson/.test(st.htmlBody) && /George Sebastian/.test(st.htmlBody), 'people from Faculty Assigned shown');
  if (st) save('03-status-report', st);

  const at = env.sent.find(m => /Attendance Correction Window/.test(m.subject));
  check(at && at.subject === 'Notice – Attendance Correction Window closes 15 Sep 2026 – 08 Sep 2026', 'attendance notice subject: ' + (at && at.subject));
  check(at && at.to === 'anitha@sahrdaya.ac.in,rahul@sahrdaya.ac.in,divya@sahrdaya.ac.in', 'faculty from Faculty tab, deduped case-insensitively, blanks dropped: ' + (at && at.to));
  check(at && at.cc === 'manishankar@sahrdaya.ac.in,principal@sahrdaya.ac.in,hod.ash@sahrdaya.ac.in,gnanaking@sahrdaya.ac.in,ashwin@sahrdaya.ac.in', 'attendance CC: ' + (at && at.cc));
  check(at && /Tuesday, 15 Sep 2026/.test(at.htmlBody) && /no further extension/i.test(at.htmlBody), 'notice wording');
  check(at && /Reminders will be sent on 14 Sep 2026 and 15 Sep 2026/.test(at.htmlBody), 'reminder dates announced');
  if (at) save('04-attendance-notice', at);

  const dv = env.sent.find(m => /Module completion & testing status due today/.test(m.subject));
  check(dv && dv.to === 'anusree@sahrdaya.ac.in,anugraha@sahrdaya.ac.in,nicy@sahrdaya.ac.in,joshua@sahrdaya.ac.in', 'dev team reminder To');
  check(dv && dv.cc === 'livya@sahrdaya.ac.in' && dv.replyTo === 'livya@sahrdaya.ac.in', 'dev reminder CC/reply-to Livya');
  check(dv && /#gid=/.test(dv.htmlBody) && /Open the "Assignments" tab/.test(dv.htmlBody), 'deep link to the Assignments tracker');
  if (dv) save('05-dev-team-reminder', dv);

  const rows = logRows(env);
  check(rows.length === 5 && rows.every(r => r[3] === 'SENT'), 'Mail Log has 5 SENT rows');
  check(rows.some(r => r[2] === 'ATTENDANCE:NOTICE'), 'attendance logged with variant');

  // idempotent retry
  env.ctx.morningRun();
  check(env.sent.length === 5, 'retry run sends nothing new');
  check(logRows(env).length === 5, 'retry run logs nothing new');
  check(env.logs.some(l => /already done today/.test(l)), 'retry reports already done');
});

scenario('Sunday 13 Sep: only the course-plan report goes out; others are skipped once', () => {
  const env = createEnv(F.fullSheet({ 'Mail Log': F.MAIL_LOG_NOTICE_SENT }), IST('2026-09-13'));
  env.ctx.morningRun();
  check(env.sent.length === 1 && /Course Plan/.test(env.sent[0].subject), 'only course plan sent on Sunday: ' + env.sent.map(m => m.subject).join(' | '));
  const skipped = logRows(env).filter(r => r[3] === 'SKIPPED');
  check(skipped.length === 3 && skipped.every(r => /Sunday/.test(r[7])), 'student profiles, status, dev reminder logged SKIPPED (attendance not due → no log)');
  env.ctx.morningRun();
  check(env.sent.length === 1 && logRows(env).length === 5, 'Sunday retry adds nothing');
  env.ctx.eveningRun();
  check(env.sent.length === 1, 'evening digest skipped on Sunday');
});

scenario('attendance reminder on 14 Sep, final reminder on 15 Sep, nothing on 16 Sep', () => {
  const env = createEnv(F.fullSheet(), IST('2026-09-14'));
  env.ss.getSheetByName('Mail Log') || env.ctx.bootstrapSheet();
  env.ctx.morningRun();
  let at = env.sent.find(m => /Attendance/.test(m.subject));
  check(at && at.subject === 'Reminder – Attendance Correction Window closes tomorrow, 15 Sep 2026 – 14 Sep 2026', '14 Sep reminder subject: ' + (at && at.subject));
  check(at && /\(tomorrow\)/.test(at.htmlBody), 'reminder says tomorrow');
  if (at) save('06-attendance-reminder', at);

  env.sent.length = 0; env.setNow(IST('2026-09-15'));
  env.ctx.morningRun();
  at = env.sent.find(m => /Attendance/.test(m.subject));
  check(at && at.subject === 'Final Reminder – Attendance Correction Window closes TODAY 15 Sep 2026 – 15 Sep 2026', '15 Sep final subject: ' + (at && at.subject));
  check(at && /final reminder/i.test(at.htmlBody), 'final wording');
  if (at) save('07-attendance-final', at);

  env.sent.length = 0; env.setNow(IST('2026-09-16'));
  env.ctx.morningRun();
  check(!env.sent.some(m => /Attendance/.test(m.subject)), 'no attendance mail after the window closes');
  check(env.sent.length === 4, 'course plans, profiles, status, dev reminder still go on 16 Sep: ' + env.sent.map(m => m.subject).join(' | '));
});

scenario('course-plan report stops after 18 Sep; the rest continue', () => {
  const env = createEnv(F.fullSheet(), IST('2026-09-18'));
  env.ctx.morningRun();
  check(env.sent.some(m => /Course Plan/.test(m.subject)), '18 Sep still sends course plans (inclusive)');
  env.sent.length = 0; env.setNow(IST('2026-09-19'));
  env.ctx.morningRun();
  check(!env.sent.some(m => /Course Plan/.test(m.subject)), '19 Sep: no course plan report');
  check(env.sent.length === 3, '19 Sep: profiles + status + dev reminder = 3, got ' + env.sent.length);
});

scenario('nil pending mails when nothing is pending', () => {
  const cps = [F.COURSE_PLANS[0]].concat(F.COURSE_PLANS.slice(1).map(r => r.slice(0, 6).concat(['Approved', '', ''])));
  const sps = [F.STUDENT_PROFILES[0]].concat(F.STUDENT_PROFILES.slice(1).map(r => r.slice(0, 4).concat(['Yes', r[5], ''])));
  const env = createEnv(F.fullSheet({ 'Course Plans': cps, 'Student Profiles': sps }), IST('2026-09-10'));
  env.ctx.morningRun();
  const cp = env.sent.find(m => /Course Plan/.test(m.subject));
  const sp = env.sent.find(m => /Student Profile/.test(m.subject));
  check(cp && /Nil pending/.test(cp.htmlBody) && /no course plans awaiting approval/.test(cp.htmlBody), 'course plan nil-pending mail still sent');
  check(sp && /Nil pending/.test(sp.htmlBody), 'student profile nil-pending mail still sent');
  if (cp) save('08-course-plans-nil', cp);
});

scenario('installed late (first run 09 Sep): the one-time attendance notice still goes out, once', () => {
  const env = createEnv(F.fullSheet(), IST('2026-09-09'));
  env.ctx.morningRun();
  const at = env.sent.find(m => /Attendance/.test(m.subject));
  check(at && /^Notice – /.test(at.subject), 'late notice sent on 09 Sep');
  env.sent.length = 0; env.setNow(IST('2026-09-10'));
  env.ctx.morningRun();
  check(!env.sent.some(m => /Attendance/.test(m.subject)), 'not repeated on 10 Sep');
});

scenario('DRY_RUN = YES routes everything to ADMIN_EMAIL with the intended recipients shown', () => {
  const env = createEnv(F.fullSheet({ 'Config': F.configWith({ DRY_RUN: 'YES' }) }), IST('2026-09-08'));
  env.ctx.morningRun();
  check(env.sent.length === 5, 'five dry-run mails');
  check(env.sent.every(m => m.to === 'aleenavarghese@sahrdaya.ac.in' && !m.cc), 'all to admin, no CC');
  check(env.sent.every(m => /^\[DRY RUN\] /.test(m.subject)), 'subjects prefixed');
  const cp = env.sent.find(m => /Course Plan/.test(m.subject));
  check(cp && /To:<\/b> principal@sahrdaya.ac.in, hod.ash@sahrdaya.ac.in/.test(cp.htmlBody), 'banner lists intended To');
  check(logRows(env).every(r => r[3] === 'DRY_RUN'), 'logged as DRY_RUN');
  if (cp) save('09-dry-run-banner', cp);
  // going live later: the notice was never really SENT, so it goes out for real
  env.sent.length = 0; env.setNow(IST('2026-09-09'));
  env.ss.getSheetByName('Config').values.find(r => r[0] === 'DRY_RUN')[1] = 'NO';
  env.ctx.morningRun();
  check(env.sent.some(m => /^Notice – Attendance/.test(m.subject)), 'attendance notice sent for real after dry-run period');
});

scenario('missing Principal e-mail (live): that report fails, others still go, admin is alerted once', () => {
  const env = createEnv(F.fullSheet({ 'Config': F.configWith({ PRINCIPAL_EMAIL: '' }) }), IST('2026-09-08'));
  env.ctx.morningRun();
  const subjects = env.sent.map(m => m.subject);
  check(subjects.some(s => /Course Plan/.test(s)), 'course plan still sent (ASH HoD in To)');
  check(subjects.some(s => /attention needed/.test(s)), 'admin alert sent');
  const alert = env.sent.find(m => /attention needed/.test(m.subject));
  check(alert && alert.to === 'aleenavarghese@sahrdaya.ac.in' && /Principal e-mail is missing/.test(alert.htmlBody), 'alert names the missing key');
  const n = env.sent.length;
  env.ctx.morningRun();
  check(env.sent.length === n, 'retry does not repeat the identical alert');
  if (alert) save('10-admin-alert', alert);
});

scenario('a report that throws is logged FAILED and does not stop the others', () => {
  const env = createEnv(F.fullSheet({ 'Student Profiles': [['Department', 'Batch', 'Something']] }), IST('2026-09-08'));
  env.ctx.morningRun();
  check(!env.sent.some(m => /Student Profile/.test(m.subject)), 'student profile report not sent');
  check(env.sent.filter(m => !/attention/.test(m.subject)).length === 4, 'other four still sent');
  const failed = logRows(env).find(r => r[3] === 'FAILED');
  check(failed && /needs either a "Profile Created"/.test(failed[7]), 'FAILED row explains the problem');
  const alert = env.sent.find(m => /attention needed/.test(m.subject));
  check(alert && /STUDENT_PROFILES failed/.test(alert.htmlBody), 'admin alert includes the failure');
  // fix the tab → retry sends it
  env.ss.getSheetByName('Student Profiles').values = F.STUDENT_PROFILES.map(r => r.slice());
  env.ctx.morningRun();
  check(env.sent.some(m => /Student Profile/.test(m.subject)), 'retry sends the fixed report');
});

scenario('student profiles in aggregated (count column) layout', () => {
  const env = createEnv(F.fullSheet({ 'Student Profiles': F.STUDENT_PROFILES_AGG }), IST('2026-09-08'));
  env.ctx.morningRun();
  const sp = env.sent.find(m => /Student Profile/.test(m.subject));
  check(sp && /<strong>15<\/strong> student profiles/.test(sp.htmlBody), 'total 15 from counts (12 + 3, zero row dropped)');
  check(sp && !/Mr\. Vinod/.test(sp.htmlBody), 'zero-count row excluded');
  if (sp) save('11-student-profiles-aggregated', sp);
});

scenario('different header names on the Course Plans tab are still understood', () => {
  const cps = [
    ['Subject', 'Staff', 'Dept', 'Sem', 'Date', 'Approval Status'],
    ['Physics', 'Dr. X', 'ASH', 'S1', '05-09-2026', 'Pending Approval'],
    ['Chemistry', 'Dr. Y', 'ASH', 'S1', '2026-09-06', 'approved by HoD'],
    ['Maths', 'Dr. Z', 'ASH', 'S1', '', 'Not Approved'],
  ];
  const env = createEnv(F.fullSheet({ 'Course Plans': cps }), IST('2026-09-08'));
  env.ctx.morningRun();
  const cp = env.sent.find(m => /Course Plan/.test(m.subject));
  check(cp && /<strong>2<\/strong> course plans/.test(cp.htmlBody), '2 pending (Pending Approval, Not Approved)');
  check(cp && /Physics.*?<td[^>]*>3<\/td>/s.test(cp.htmlBody), 'days pending from dd-mm-yyyy');
  check(cp && /Maths.*?<td[^>]*>–<\/td>/s.test(cp.htmlBody), 'dash when no date');
});

scenario('evening digest is built from the Assignments tracker (header on row 3, placeholders ignored)', () => {
  const env = createEnv(F.fullSheet(), IST('2026-09-08', '17:32:00'));
  env.ctx.eveningRun();
  check(env.sent.length === 1, 'one digest mail, got: ' + env.sent.map(m => m.subject).join(' | '));
  const d = env.sent[0];
  check(d.subject === 'Daily Report – Module Completion & Testing Status – 08 Sep 2026', 'digest subject: ' + d.subject);
  check(d.to === 'manishankar@sahrdaya.ac.in,principal@sahrdaya.ac.in', 'digest To defaults to Manishankar + Principal');
  check(d.cc === 'gnanaking@sahrdaya.ac.in,livya@sahrdaya.ac.in', 'digest CC Gnana King + Livya (To addresses not repeated)');
  check(/curriculum creation and approval/.test(d.htmlBody) && /attendance correction window/.test(d.htmlBody), 'tasks finished today listed (Date cell and text date)');
  check(/Done today/.test(d.htmlBody), 'finished-today rows labelled');
  check(/Nothing finished today and nothing in progress for:<\/strong> Anusree<\/p>/.test(d.htmlBody), 'only Anusree (no tasks at all) flagged');
  check(/<h3[^>]*>Anugraha K R/.test(d.htmlBody) && /<h3[^>]*>Nicy Johnson/.test(d.htmlBody) && /<h3[^>]*>Joshua Sony/.test(d.htmlBody), 'sections per person with full tracker names');
  check(d.htmlBody.indexOf('<h3') < d.htmlBody.indexOf('<h3 style="margin:18px 0 6px;font-size:15px;color:#1f4e79">Ashwin') && /Ashwin <span[^>]*>\(not in DEV_TEAM list\)/.test(d.htmlBody), 'non-team people listed after the team and tagged');
  check(/24 Jul 2026 \(overdue\)/.test(d.htmlBody), 'overdue in-progress task flagged');
  check(/Not started<\/td>/.test(d.htmlBody) && /Livya George/.test(d.htmlBody), 'assigned Not-started task shown as queued');
  check(!/library books creation/.test(d.htmlBody), 'unassigned backlog not listed');
  check(/1 open task not yet assigned to anyone/.test(d.htmlBody), 'unassigned count (row without task name ignored)');
  check(/Done<\/td><td[^>]*>3<\/td>/.test(d.htmlBody) && /In progress<\/td><td[^>]*>4<\/td>/.test(d.htmlBody) && /Not started<\/td><td[^>]*>2<\/td>/.test(d.htmlBody), 'tracker snapshot counts 3 / 4 / 2');
  save('12-module-digest', d);
  env.ctx.eveningRun();
  check(env.sent.length === 1, 'digest not repeated');
});

scenario('a tracker with header on row 1 and different column names still works', () => {
  const tracker = [
    ['Module', 'Work item', 'Developer', 'Status', 'Start', 'Deadline', 'Completed on', 'Notes'],
    ['exam', 'hall allocation', 'Anusree', 'In progress', D(2026, 9, 1), D(2026, 9, 20), '', ''],
    ['exam', 'seating', 'Joshua Sony', 'Done', D(2026, 9, 1), D(2026, 9, 5), D(2026, 9, 8), ''],
  ];
  const env = createEnv(F.fullSheet({ 'Assignments': tracker }), IST('2026-09-08', '17:32:00'));
  env.ctx.eveningRun();
  const d = env.sent[0];
  check(d && /hall allocation/.test(d.htmlBody) && /seating/.test(d.htmlBody), 'module + status columns matched by meaning');
  check(d && /for:<\/strong> Anugraha, Nicy<\/p>/.test(d.htmlBody), 'only Anugraha and Nicy flagged');
});

scenario('triggers install idempotently and can be removed', () => {
  const env = createEnv(F.fullSheet(), IST('2026-09-08'));
  env.ctx.setupTriggers(); env.ctx.setupTriggers();
  check(env.triggers.length === 3, 'exactly 3 triggers after two installs');
  const m = env.triggers.filter(t => t.fn === 'morningRun').map(t => t.hour + ':' + t.minute).sort();
  check(m.join(',') === '9:15,9:45', 'morning triggers at 9:15 and 9:45 (±15 min): ' + m.join(','));
  check(env.triggers.some(t => t.fn === 'eveningRun' && t.hour === 17), 'evening trigger at 17h');
  check(env.triggers.every(t => t.tz === 'Asia/Kolkata'), 'all triggers in IST');
  check(env.ctx.removeTriggers() === 3 && env.triggers.length === 0, 'removeTriggers clears them');
});

scenario('previewReportsToMe sends all six mails to the active user without touching the duplicate guard', () => {
  const env = createEnv(F.fullSheet({ 'Mail Log': F.MAIL_LOG_NOTICE_SENT }), IST('2026-09-13'));  // a Sunday – preview ignores skip days
  env.ctx.previewReportsToMe();
  check(env.sent.length === 6, 'six preview mails, got ' + env.sent.length);
  check(env.sent.every(m => m.to === 'tester@sahrdaya.ac.in' && /^\[PREVIEW\] /.test(m.subject)), 'all to tester, prefixed');
  check(logRows(env).slice(1).every(r => r[3] === 'PREVIEW'), 'logged as PREVIEW');
  env.sent.length = 0;
  env.ctx.morningRun();
  check(env.sent.length === 1, 'real Sunday run afterwards still sends the course-plan mail (preview did not mark it done)');
  check(env.ui.alerts.length === 1 && /Preview mails sent to tester@sahrdaya.ac.in/.test(env.ui.alerts[0]), 'UI alert shown');
});

scenario('checkConfiguration reports gaps and menu is installed', () => {
  const env = createEnv(F.fullSheet({ 'Config': F.configWith({ GNANA_KING_EMAIL: '', OWNER_ATTENDANCE: 'Ashwin' }) }), IST('2026-09-08'));
  env.ctx.checkConfiguration();
  const a = env.ui.alerts[0];
  check(/Mode: LIVE/.test(a) && /Triggers installed: 0/.test(a), 'mode and trigger count shown');
  check(/Gnana King e-mail is missing/.test(a) && /Owner Ashwin has no e-mail/.test(a), 'problems listed');
  env.ctx.onOpen();
  check(env.ui.menus.length === 1 && env.ui.menus[0].items.length === 7, 'menu with 7 items');
  fs.writeFileSync(path.join(OUT, '13-check-configuration.txt'), a);
});

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passed, ' + fail + ' failed. Sample mails written to ' + OUT);
process.exit(fail ? 1 : 0);
