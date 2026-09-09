import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAddresses, CONFIG_DEFAULTS, normalizeConfig, readEnv } from '../src/config.js';
import { createMailer, smtpSettings } from '../src/mailer.js';
import { runReports, healthProblems, loadConfig, buildCtx } from '../src/engine.js';
import { createEnv, IST, TEST_ENV } from './fixtures.js';

test('defaults contain no people, addresses, dates or IDs', () => {
  const d = CONFIG_DEFAULTS as unknown as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    const v = d[k];
    if (typeof v !== 'string') continue;
    assert.ok(!/@/.test(v), `${k} has an e-mail address by default`);
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(v), `${k} has a date by default`);
  }
  assert.equal(d.sheetId, '');
  assert.equal(d.mailFrom, '');
  assert.equal(d.adminEmail, '');
});

test('old person-specific settings keys are migrated to the role-based ones', () => {
  const cfg = normalizeConfig({ ashHodEmail: 'hod@example.edu', manishankarEmail: 'coord@example.edu', gnanaKingEmail: 'dean@example.edu', principalEmail: 'p@example.edu' });
  assert.equal(cfg.hodEmail, 'hod@example.edu');
  assert.equal(cfg.coordinatorEmail, 'coord@example.edu');
  assert.equal(cfg.ccAll, 'dean@example.edu');
  assert.ok(!('ashHodEmail' in cfg));
});

test('admin address falls back to the first admin', () => {
  assert.deepEqual(adminAddresses(normalizeConfig({ adminEmail: 'a@example.edu', admins: 'b@example.edu' })), ['a@example.edu']);
  assert.deepEqual(adminAddresses(normalizeConfig({ admins: 'b@example.edu, c@example.edu' })), ['b@example.edu']);
  assert.deepEqual(adminAddresses(normalizeConfig({})), []);
});

test('SMTP settings come from Settings first, environment second', () => {
  const env = { ...TEST_ENV, smtpHost: 'env.host', smtpPort: 587, smtpUser: 'envuser', smtpPass: 'envpass' };
  const fromSettings = smtpSettings(normalizeConfig({ mailFrom: 'me@example.edu', smtpHost: 'smtp.example.edu', smtpPort: 465, smtpPassword: 'app-pass' }), env);
  assert.deepEqual(fromSettings, { from: 'me@example.edu', host: 'smtp.example.edu', port: 465, user: 'envuser', pass: 'app-pass', passSource: 'settings' });
  const fromEnv = smtpSettings(normalizeConfig({ mailFrom: 'me@example.edu', smtpHost: '', smtpPort: 0 }), env);
  assert.equal(fromEnv.host, 'env.host'); assert.equal(fromEnv.pass, 'envpass'); assert.equal(fromEnv.passSource, 'environment');
  const none = smtpSettings(normalizeConfig({ mailFrom: 'me@example.edu' }), TEST_ENV);
  assert.equal(none.passSource, '');
  assert.equal(none.user, 'me@example.edu', 'user defaults to the from address');
  const m = createMailer(normalizeConfig({ mailTransport: 'smtp', mailFrom: 'me@example.edu' }), TEST_ENV);
  assert.match(m.describe(), /PASSWORD NOT SET/);
  await_rejects(m.send({ to: ['x@example.edu'], cc: [], senderName: '', subject: 's', html: '', text: '' }), /SMTP password not set \(Settings → Mail\)/);
});
async function await_rejects(p: Promise<unknown>, re: RegExp) { await assert.rejects(p, re); }

test('readEnv parses the schedule and has no organisation-specific defaults', () => {
  const env = readEnv({ SCHEDULE: '09:00;09:35;17:30', SCHEDULE_TZ: 'Europe/Paris' } as NodeJS.ProcessEnv);
  assert.deepEqual(env.schedule, { morning: '09:00', retry: '09:35', evening: '17:30', timeZone: 'Europe/Paris' });
  const bare = readEnv({} as NodeJS.ProcessEnv);
  assert.deepEqual(bare.schedule, { morning: '', retry: '', evening: '', timeZone: 'Asia/Kolkata' });
  assert.ok(!/@.*\./.test(bare.devUserEmail.replace('dev@localhost', '')));
  assert.equal(bare.smtpHost, '');
});

test('per-report "To" overrides replace the default recipient rule', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), config: { coursePlansTo: 'Registrar <registrar@example.edu>', statusReportTo: 'ops@example.edu' } });
  await runReports(env.deps, { keys: ['COURSE_PLANS', 'STATUS_REPORT', 'STUDENT_PROFILES'], mode: 'single', trigger: 'test' });
  const cp = env.mailer.sent.find((m) => /Course Plan/.test(m.subject))!;
  assert.deepEqual(cp.to, ['registrar@example.edu']);
  assert.deepEqual(cp.cc, ['coordinator@example.edu', 'dean@example.edu', 'gopal@example.edu', 'asha@example.edu']);
  const st = env.mailer.sent.find((m) => /Status and Query/.test(m.subject))!;
  assert.deepEqual(st.to, ['ops@example.edu']);
  assert.deepEqual(st.cc, ['coordinator@example.edu', 'principal@example.edu', 'dean@example.edu', 'lekha@example.edu']);
  const sp = env.mailer.sent.find((m) => /Student Profile/.test(m.subject))!;
  assert.deepEqual(sp.to, ['principal@example.edu', 'hod@example.edu'], 'rule still applies where no override is set');
});

test('health check reports what the mail set-up still needs', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), config: { mailTransport: 'smtp', mailFrom: '', smtpPassword: '', adminEmail: '', admins: '' } });
  const cfg = await loadConfig(env.deps);
  const p = await healthProblems(cfg, buildCtx(env.deps, cfg), env.deps.env);
  assert.ok(p.some((x) => /"Send from" address is missing/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /SMTP password is not set/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /Admin e-mail is missing/.test(x)), p.join('\n'));
});

test('nothing is due when the schedule dates are blank (fresh install)', async () => {
  const env = await createEnv({ now: IST('2026-09-08'), config: { attendanceNoticeDate: '', attendanceReminderDates: '', attendanceCloseDate: '', coursePlanStart: '', coursePlanEnd: '' } });
  const out = await runReports(env.deps, { keys: ['ATTENDANCE', 'COURSE_PLANS'], mode: 'single', trigger: 'test' });
  assert.equal(out.results.find((r) => r.key === 'ATTENDANCE')!.status, 'SKIPPED');
  assert.match(out.results.find((r) => r.key === 'ATTENDANCE')!.message, /no attendance dates configured/);
  assert.equal(out.results.find((r) => r.key === 'COURSE_PLANS')!.status, 'SENT', 'course-plan report runs every day without a period');
});
