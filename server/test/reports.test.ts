import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, IST, COURSE_PLANS, STUDENT_PROFILES, STUDENT_PROFILES_GROUPS } from './fixtures.js';
import { runReports, overview, previewReport, healthProblems, loadConfig, buildCtx } from '../src/engine.js';
import { ALL_KEYS, EVENING_KEYS, MORNING_KEYS } from '../src/reports/registry.js';
import type { OutgoingMail } from '../src/mailer.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });
const save = (name: string, m: OutgoingMail) =>
  fs.writeFileSync(path.join(OUT, name + '.html'), `<!-- ${m.subject}\nTo: ${m.to.join(', ')}\nCC: ${m.cc.join(', ')}\nReply-To: ${m.replyTo || ''} -->\n${m.html}`);
const find = (sent: OutgoingMail[], re: RegExp) => sent.find((m) => re.test(m.subject));
const morning = (deps: Parameters<typeof runReports>[0]) => runReports(deps, { keys: MORNING_KEYS, mode: 'morning', trigger: 'test' });
const evening = (deps: Parameters<typeof runReports>[0]) => runReports(deps, { keys: EVENING_KEYS, mode: 'evening', trigger: 'test' });

test('morning run on 08 Sep (live) sends all five mails with the right recipients and subjects', async () => {
  const env = await createEnv({ now: IST('2026-09-08') });
  const out = await morning(env.deps);
  assert.equal(out.locked, false);
  assert.equal(env.mailer.sent.length, 5, out.results.map((r) => `${r.key}:${r.status}:${r.message}`).join('\n'));

  const cp = find(env.mailer.sent, /Pending Course Plan Approvals/)!;
  assert.equal(cp.subject, 'Daily Report – Pending Course Plan Approvals – 08 Sep 2026');
  assert.deepEqual(cp.to, ['principal@example.edu', 'hod@example.edu']);
  assert.deepEqual(cp.cc, ['coordinator@example.edu', 'dean@example.edu', 'gopal@example.edu', 'asha@example.edu']);
  assert.equal(cp.replyTo, 'gopal@example.edu');
  assert.match(cp.html, /<strong>4<\/strong> course plans awaiting/);
  assert.ok(!/Operating Systems/.test(cp.html) && !/Surveying/.test(cp.html), 'approved and rejected excluded');
  assert.match(cp.html, /Data Structures.*?<td[^>]*>11<\/td>/s);
  assert.match(cp.html, /Thermodynamics.*?<td[^>]*>7<\/td>/s);
  assert.ok(cp.html.indexOf('Data Structures') < cp.html.indexOf('Linear Algebra'), 'sorted by days pending');
  assert.match(cp.html, /Reporting period 08 Sep 2026 – 18 Sep 2026/);
  assert.ok(!cp.text.includes('<') && /Data Structures/.test(cp.text), 'plain text alternative');
  save('01-course-plans', cp);

  const sp = find(env.mailer.sent, /Pending Student Profile Creation/)!;
  assert.equal(sp.subject, 'Daily Report – Pending Student Profile Creation – 08 Sep 2026');
  assert.deepEqual(sp.to, ['principal@example.edu', 'hod@example.edu']);
  assert.deepEqual(sp.cc, ['coordinator@example.edu', 'dean@example.edu', 'asha@example.edu']);
  assert.match(sp.html, /<strong>5<\/strong> student profiles not yet created/);
  assert.match(sp.html, /CSE.*?2026-30.*?<td[^>]*>2<\/td>/s);
  assert.ok(/M\.Tech CSE/.test(sp.html) && /Dr\. Kumar/.test(sp.html));
  save('02-student-profiles', sp);

  const st = find(env.mailer.sent, /Daily Status and Query Closure/)!;
  assert.equal(st.subject, 'Daily Report – Daily Status and Query Closure Report – 08 Sep 2026');
  assert.deepEqual(st.to, ['coordinator@example.edu', 'principal@example.edu']);
  assert.deepEqual(st.cc, ['dean@example.edu', 'lekha@example.edu']);
  assert.ok(/Queries received by e-mail/.test(st.html) && /Celerscet/.test(st.html));
  assert.ok(/File size limit raised/.test(st.html) && /Attendance page shows wrong batch/.test(st.html));
  assert.ok(!/Password reset/.test(st.html), 'old closed query excluded');
  assert.match(st.html, /Covers 07 Sep 2026 – 08 Sep 2026 and all open items/);
  assert.match(st.html, /Marks entry locked/);
  assert.ok(/testing timetable/.test(st.html) && /Exam Creation rework/.test(st.html) && /courses creation/.test(st.html), 'in-progress tasks shown');
  assert.ok(!/Admission flow creation/.test(st.html) && !/library books creation/.test(st.html), 'done / not started hidden');
  assert.match(st.html, /24 Jul 2026 \(overdue\)/);
  save('03-status-report', st);

  const at = find(env.mailer.sent, /Attendance Correction Window/)!;
  assert.equal(at.subject, 'Notice – Attendance Correction Window closes 15 Sep 2026 – 08 Sep 2026');
  assert.deepEqual(at.to, ['anitha@example.edu', 'rahul@example.edu', 'divya@example.edu'], 'faculty deduped, blanks dropped');
  assert.deepEqual(at.cc, ['coordinator@example.edu', 'principal@example.edu', 'hod@example.edu', 'dean@example.edu', 'arjun@example.edu']);
  assert.ok(/Tuesday, 15 Sep 2026/.test(at.html) && /no further extension/i.test(at.html));
  assert.match(at.html, /Reminders will be sent on 14 Sep 2026 and 15 Sep 2026/);
  save('04-attendance-notice', at);

  const dv = find(env.mailer.sent, /Module completion & testing status due today/)!;
  assert.deepEqual(dv.to, ['priya@example.edu', 'anand@example.edu', 'nila@example.edu', 'jomon@example.edu']);
  assert.deepEqual(dv.cc, ['lekha@example.edu']);
  assert.equal(dv.replyTo, 'lekha@example.edu');
  assert.match(dv.html, /docs\.google\.com\/spreadsheets\/d\/test-sheet-id.*#gid=0/);
  save('05-dev-team-reminder', dv);

  const log = await env.store.mailLogForDate('2026-09-08');
  assert.equal(log.length, 5);
  assert.ok(log.every((e) => e.status === 'SENT'));
  assert.ok(log.some((e) => e.report === 'ATTENDANCE:NOTICE'));
  assert.ok(log.every((e) => e.html && e.html.length > 500), 'html stored for the app');

  const retry = await morning(env.deps);
  assert.equal(env.mailer.sent.length, 5, 'retry sends nothing new');
  assert.ok(retry.results.every((r) => r.status === 'ALREADY_DONE'));
  assert.equal((await env.store.mailLogForDate('2026-09-08')).length, 5);
});

test('Sunday 13 Sep: only the course-plan report goes out; others are skipped once', async () => {
  const env = await createEnv({ now: IST('2026-09-13') });
  await env.store.mailLogAdd({ timestamp: IST('2026-09-08'), date: '2026-09-08', report: 'ATTENDANCE:NOTICE', status: 'SENT', to: ['x@example.edu'], cc: [], subject: 'Notice', details: '', by: 'test' });
  await morning(env.deps);
  assert.equal(env.mailer.sent.length, 1);
  assert.match(env.mailer.sent[0].subject, /Course Plan/);
  const skipped = (await env.store.mailLogForDate('2026-09-13')).filter((e) => e.status === 'SKIPPED');
  assert.equal(skipped.length, 3);
  assert.ok(skipped.every((e) => /Sunday/.test(e.details)));
  await morning(env.deps);
  assert.equal(env.mailer.sent.length, 1);
  assert.equal((await env.store.mailLogForDate('2026-09-13')).length, 4);
  await evening(env.deps);
  assert.equal(env.mailer.sent.length, 1, 'evening digest skipped on Sunday');
});

test('attendance reminder on 14 Sep, final reminder on 15 Sep, nothing on 16 Sep', async () => {
  const env = await createEnv({ now: IST('2026-09-14') });
  await morning(env.deps);
  let at = find(env.mailer.sent, /Attendance/)!;
  assert.equal(at.subject, 'Reminder – Attendance Correction Window closes tomorrow, 15 Sep 2026 – 14 Sep 2026');
  assert.match(at.html, /\(tomorrow\)/);
  save('06-attendance-reminder', at);

  env.mailer.sent.length = 0; env.setNow(IST('2026-09-15'));
  await morning(env.deps);
  at = find(env.mailer.sent, /Attendance/)!;
  assert.equal(at.subject, 'Final Reminder – Attendance Correction Window closes TODAY 15 Sep 2026 – 15 Sep 2026');
  assert.match(at.html, /final reminder/i);
  save('07-attendance-final', at);

  env.mailer.sent.length = 0; env.setNow(IST('2026-09-16'));
  await morning(env.deps);
  assert.ok(!find(env.mailer.sent, /Attendance/), 'no attendance mail after the window closes');
  assert.equal(env.mailer.sent.length, 4);
});

test('course-plan report stops after 18 Sep; the rest continue', async () => {
  const env = await createEnv({ now: IST('2026-09-18') });
  await morning(env.deps);
  assert.ok(find(env.mailer.sent, /Course Plan/), '18 Sep inclusive');
  env.mailer.sent.length = 0; env.setNow(IST('2026-09-19'));
  await morning(env.deps);
  assert.ok(!find(env.mailer.sent, /Course Plan/));
  assert.equal(env.mailer.sent.length, 3);
});

test('nil pending mails when nothing is pending', async () => {
  const env = await createEnv({
    now: IST('2026-09-10'),
    coursePlans: COURSE_PLANS.map((p) => ({ ...p, status: 'Approved' })),
    studentProfiles: STUDENT_PROFILES.map((s) => ({ ...s, created: true })),
  });
  await morning(env.deps);
  const cp = find(env.mailer.sent, /Course Plan/)!;
  const sp = find(env.mailer.sent, /Student Profile/)!;
  assert.ok(/Nil pending/.test(cp.html) && /no course plans awaiting approval/.test(cp.html));
  assert.match(sp.html, /Nil pending/);
  save('08-course-plans-nil', cp);
});

test('installed late (first run 09 Sep): the one-time attendance notice still goes out, once', async () => {
  const env = await createEnv({ now: IST('2026-09-09') });
  await morning(env.deps);
  assert.match(find(env.mailer.sent, /Attendance/)!.subject, /^Notice – /);
  env.mailer.sent.length = 0; env.setNow(IST('2026-09-10'));
  await morning(env.deps);
  assert.ok(!find(env.mailer.sent, /Attendance/));
});

test('dry run routes everything to the admin with the intended recipients shown; going live later sends the notice for real', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), config: { dryRun: true } });
  await morning(env.deps);
  assert.equal(env.mailer.sent.length, 5);
  assert.ok(env.mailer.sent.every((m) => m.to.join() === 'admin@example.edu' && m.cc.length === 0));
  assert.ok(env.mailer.sent.every((m) => /^\[DRY RUN\] /.test(m.subject)));
  const cp = find(env.mailer.sent, /Course Plan/)!;
  assert.match(cp.html, /To:<\/b> principal@example.edu, hod@example.edu/);
  assert.ok((await env.store.mailLogForDate('2026-09-08')).every((e) => e.status === 'DRY_RUN'));
  save('09-dry-run-banner', cp);

  env.mailer.sent.length = 0; env.setNow(IST('2026-09-09'));
  await env.store.saveConfig({ dryRun: false });
  await morning(env.deps);
  assert.ok(find(env.mailer.sent, /^Notice – Attendance/), 'notice sent for real after the dry-run period');
});

test('missing Principal e-mail (live): that report still goes to the HoD, admin is alerted once', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), config: { principalEmail: '' } });
  await morning(env.deps);
  assert.ok(find(env.mailer.sent, /Course Plan/));
  const alert = find(env.mailer.sent, /attention needed/)!;
  assert.deepEqual(alert.to, ['admin@example.edu']);
  assert.match(alert.html, /Principal e-mail is missing/);
  const n = env.mailer.sent.length;
  await morning(env.deps);
  assert.equal(env.mailer.sent.length, n, 'identical alert not repeated');
  save('10-admin-alert', alert);
});

test('a report that fails is logged FAILED, does not stop the others, and the retry sends it once fixed', async () => {
  const env = await createEnv({ now: IST('2026-09-08', '17:32:00'), trackerError: 'The caller does not have permission' });
  const st = await runReports(env.deps, { keys: ['STATUS_REPORT', 'MODULE_DIGEST'], mode: 'single', trigger: 'test' });
  const status = find(env.mailer.sent, /Status and Query/)!;
  assert.ok(status, 'status report still sent');
  assert.match(status.html, /Tracker could not be read/);
  assert.equal(st.results.find((r) => r.key === 'MODULE_DIGEST')!.status, 'FAILED');
  const failed = (await env.store.mailLogForDate('2026-09-08')).find((e) => e.status === 'FAILED')!;
  assert.match(failed.details, /share it \(Viewer\)/);
  assert.match(find(env.mailer.sent, /attention needed/)!.html, /Module Completion &amp; Testing Status failed/);
  env.sheets.failWith = undefined;
  await evening(env.deps);
  assert.ok(find(env.mailer.sent, /Module Completion & Testing Status – 08 Sep/), 'retry sends the digest');
});

test('student profiles kept as group counts', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), studentProfiles: STUDENT_PROFILES_GROUPS });
  await morning(env.deps);
  const sp = find(env.mailer.sent, /Student Profile/)!;
  assert.match(sp.html, /<strong>15<\/strong> student profiles/);
  assert.ok(!/Mr\. Vinod/.test(sp.html), 'zero-count group excluded');
  save('11-student-profiles-groups', sp);
});

test('evening digest is built from the tracker (header on row 3, placeholders ignored, serial and dd/mm dates)', async () => {
  const env = await createEnv({ now: IST('2026-09-08', '17:32:00') });
  await evening(env.deps);
  assert.equal(env.mailer.sent.length, 1);
  const d = env.mailer.sent[0];
  assert.equal(d.subject, 'Daily Report – Module Completion & Testing Status – 08 Sep 2026');
  assert.deepEqual(d.to, ['coordinator@example.edu', 'principal@example.edu']);
  assert.deepEqual(d.cc, ['dean@example.edu', 'lekha@example.edu']);
  assert.ok(/curriculum creation and approval/.test(d.html) && /attendance correction window/.test(d.html), 'finished today (serial 46273 and 08/09/2026)');
  assert.match(d.html, /Done today/);
  assert.match(d.html, /Nothing finished today and nothing in progress for:<\/strong> Priya<\/p>/);
  assert.ok(/<h3[^>]*>Anand K R/.test(d.html) && /<h3[^>]*>Nila Thomas/.test(d.html) && /<h3[^>]*>Jomon Paul/.test(d.html));
  assert.match(d.html, /Arjun <span[^>]*>\(not in the dev-team list\)/);
  assert.match(d.html, /24 Jul 2026 \(overdue\)/);
  assert.ok(/Not started<\/td>/.test(d.html) && /Lekha Pillai/.test(d.html));
  assert.ok(!/library books creation/.test(d.html), 'unassigned backlog not listed');
  assert.match(d.html, /1 open task not yet assigned to anyone/);
  assert.ok(/Done<\/td><td[^>]*>3<\/td>/.test(d.html) && /In progress<\/td><td[^>]*>4<\/td>/.test(d.html) && /Not started<\/td><td[^>]*>2<\/td>/.test(d.html));
  save('12-module-digest', d);
  await evening(env.deps);
  assert.equal(env.mailer.sent.length, 1, 'digest not repeated');
});

test('a tracker with header on row 1 and different column names still works', async () => {
  const tracker = [
    ['Module', 'Work item', 'Developer', 'Status', 'Start', 'Deadline', 'Completed on', 'Notes'],
    ['exam', 'hall allocation', 'Priya', 'In progress', '2026-09-01', '2026-09-20', '', ''],
    ['exam', 'seating', 'Jomon Paul', 'Done', '2026-09-01', '2026-09-05', '2026-09-08', ''],
  ];
  const env = await createEnv({ now: IST('2026-09-08', '17:32:00'), tracker });
  await evening(env.deps);
  const d = env.mailer.sent[0];
  assert.ok(/hall allocation/.test(d.html) && /seating/.test(d.html));
  assert.match(d.html, /for:<\/strong> Anand, Nila<\/p>/);
});

test('preview-to-me sends all six mails to the user without touching the duplicate guard', async () => {
  const env = await createEnv({ now: IST('2026-09-13') }); // a Sunday
  await env.store.mailLogAdd({ timestamp: IST('2026-09-08'), date: '2026-09-08', report: 'ATTENDANCE:NOTICE', status: 'SENT', to: [], cc: [], subject: '', details: '', by: 'test' });
  const out = await runReports(env.deps, { keys: ALL_KEYS, mode: 'preview', trigger: 'user:tester@example.edu', preview: true, redirectTo: 'tester@example.edu' });
  assert.equal(env.mailer.sent.length, 6, out.results.map((r) => r.key + ':' + r.message).join('\n'));
  assert.ok(env.mailer.sent.every((m) => m.to.join() === 'tester@example.edu' && /^\[PREVIEW\] /.test(m.subject)));
  assert.ok((await env.store.mailLogForDate('2026-09-13')).every((e) => e.status === 'PREVIEW'));
  env.mailer.sent.length = 0;
  await morning(env.deps);
  assert.equal(env.mailer.sent.length, 1, 'real Sunday run afterwards still sends the course-plan mail');
});

test('health problems and the dashboard overview', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), config: { coordinatorEmail: '', ownerAttendance: 'Arjun' } });
  const cfg = await loadConfig(env.deps);
  const p = await healthProblems(cfg, buildCtx(env.deps, cfg));
  assert.ok(p.some((x) => /Coordinator e-mail is missing/.test(x)) && p.some((x) => /Owner Arjun has no e-mail/.test(x)), p.join('\n'));

  const ov = await overview(env.deps);
  assert.equal(ov.date, '2026-09-08');
  assert.equal(ov.reports.length, 6);
  assert.ok(ov.reports.filter((r) => r.status === 'DUE').length === 6, ov.reports.map((r) => r.key + ':' + r.status + ':' + r.detail).join('\n'));
  assert.deepEqual(ov.counts, { pendingCoursePlans: 4, pendingProfiles: 5, openQueries: 2, tasksInProgress: 4, tasksOverdue: 2, trackerError: undefined });

  await morning(env.deps);
  const ov2 = await overview(env.deps);
  assert.equal(ov2.reports.find((r) => r.key === 'COURSE_PLANS')!.status, 'SENT');
  assert.equal(ov2.reports.find((r) => r.key === 'MODULE_DIGEST')!.status, 'DUE');
});

test('previewReport renders any report, reports why it would be skipped, and never sends', async () => {
  const env = await createEnv({ now: IST('2026-09-13') });
  const p = await previewReport(env.deps, 'STATUS_REPORT');
  assert.match(p.subject, /Daily Status and Query Closure Report – 13 Sep 2026/);
  assert.match(p.skip, /Sunday/);
  assert.deepEqual(p.to, ['coordinator@example.edu', 'principal@example.edu']);
  assert.equal(env.mailer.sent.length, 0);
  const a = await previewReport(env.deps, 'ATTENDANCE', '2026-09-08');
  assert.match(a.subject, /^Notice – /);
});

test('force re-send and the run lock', async () => {
  const env = await createEnv({ now: IST('2026-09-08') });
  await runReports(env.deps, { keys: ['COURSE_PLANS'], mode: 'single', trigger: 'test' });
  await runReports(env.deps, { keys: ['COURSE_PLANS'], mode: 'single', trigger: 'test' });
  assert.equal(env.mailer.sent.length, 1);
  await runReports(env.deps, { keys: ['COURSE_PLANS'], mode: 'single', trigger: 'test', force: true });
  assert.equal(env.mailer.sent.length, 2);
  const [a, b] = await Promise.all([morning(env.deps), morning(env.deps)]);
  assert.ok(a.locked !== b.locked, 'exactly one of two concurrent runs is refused');
});

test('mail sending failure is logged FAILED and retried next run', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), mailFail: 'SMTP 535 bad credentials' });
  const out = await morning(env.deps);
  assert.ok(out.results.every((r) => r.status === 'FAILED'));
  assert.ok(env.logs.join('\n').includes('SMTP 535'));
  env.mailer.failWith = undefined;
  await morning(env.deps);
  assert.equal(env.mailer.sent.length, 5);
});
