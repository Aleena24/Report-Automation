/**
 * The job runner: decides which reports are due, builds them, sends them (or redirects them in dry
 * run), records everything in the Mail Log and never sends the same report twice on one day.
 */
import type { Config, Env } from './config.js';
import { normalizeConfig } from './config.js';
import type { Store } from './store.js';
import type { SheetReader } from './sheets.js';
import type { Mailer } from './mailer.js';
import { makeDataSource, owners, type BuildCtx, type DataSource, facultyEmails } from './reports/context.js';
import { REPORTS, reportDef } from './reports/registry.js';
import { isSkipped, type BuiltMail, type MailLogEntry, type MailStatus, type ReportKey } from './types.js';
import { dateKey, niceDate, parseDateKey } from './lib/dates.js';
import { APP_NAME, DASH, emails, esc, htmlToText, isEmail, parsePerson } from './lib/text.js';
import { dryBanner } from './lib/html.js';
import { isPendingStatus, isClosedStatus } from './lib/status.js';

export interface Deps {
  store: Store;
  sheets: SheetReader;
  env: Env;
  mailerFor: (cfg: Config) => Mailer;
  now: () => Date;
  log: (msg: string) => void;
}

export interface RunOptions {
  keys: ReportKey[];
  mode: string;                 // morning | evening | preview | single
  trigger: string;              // scheduler | user:<email> | cli
  preview?: boolean;            // ignore dates / duplicate guard, redirect to `redirectTo`
  redirectTo?: string;
  force?: boolean;              // ignore the duplicate guard (re-send)
}

export type JobStatus = MailStatus | 'ALREADY_DONE';
export interface JobResult { key: ReportKey; status: JobStatus; message: string; to: string[]; subject?: string; logKey: string }
export interface RunOutcome { locked: boolean; results: JobResult[]; problems: string[]; runId?: string }

export async function loadConfig(deps: Deps): Promise<Config> {
  const cfg = normalizeConfig(await deps.store.getConfig());
  if (!cfg.appUrl && deps.env.appUrl) cfg.appUrl = deps.env.appUrl;
  return cfg;
}

export function buildCtx(deps: Deps, cfg: Config, opts: { preview?: boolean; todayKey?: string } = {}): BuildCtx {
  const now = deps.now();
  return { cfg, todayKey: opts.todayKey || dateKey(now), now, preview: !!opts.preview, data: makeDataSource(deps.store, deps.sheets, cfg), appUrl: cfg.appUrl };
}

const DONE_STATUSES: MailStatus[] = ['SENT', 'DRY_RUN', 'SKIPPED'];

export async function runReports(deps: Deps, opts: RunOptions): Promise<RunOutcome> {
  const outcome = await deps.store.withLock('run', 120_000, async () => {
    const startedAt = deps.now().toISOString();
    const cfg = await loadConfig(deps);
    const ctx = buildCtx(deps, cfg, { preview: opts.preview });
    const mailer = deps.mailerFor(cfg);
    const todayLog = await deps.store.mailLogForDate(ctx.todayKey);
    const problems = opts.preview ? [] : await healthProblems(cfg, ctx);
    const results: JobResult[] = [];

    const alreadyDone = (key: string) => todayLog.some((e) => (e.report === key || e.report.startsWith(key + ':')) && DONE_STATUSES.includes(e.status));
    const record = async (entry: Omit<MailLogEntry, 'id' | 'timestamp' | 'date' | 'by'>) => {
      const full = { ...entry, timestamp: deps.now().toISOString(), date: ctx.todayKey, by: opts.trigger };
      const id = await deps.store.mailLogAdd(full);
      todayLog.push({ ...full, id });
      return id;
    };

    for (const key of opts.keys) {
      const def = reportDef(key);
      if (!def) { results.push({ key, status: 'FAILED', message: 'unknown report', to: [], logKey: key }); continue; }
      try {
        if (!opts.force && !opts.preview && alreadyDone(key)) {
          results.push({ key, status: 'ALREADY_DONE', message: 'already done today', to: [], logKey: key });
          continue;
        }
        const built = await def.build(ctx);
        if (isSkipped(built)) {
          if (built.log && !opts.preview) await record({ report: key, status: 'SKIPPED', to: [], cc: [], subject: '', details: built.skip });
          results.push({ key, status: 'SKIPPED', message: built.skip, to: [], logKey: key });
          continue;
        }
        const logKey = key + (built.variant ? ':' + built.variant : '');
        const sent = await deliver(mailer, cfg, built, { preview: !!opts.preview, redirectTo: opts.redirectTo });
        await record({ report: logKey, status: sent.status, to: sent.to, cc: sent.cc, subject: sent.subject, details: built.details, html: sent.html });
        results.push({ key, status: sent.status, message: `${sent.status.toLowerCase().replace('_', ' ')} → ${sent.to.join(', ')}`, to: sent.to, subject: sent.subject, logKey });
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        await record({ report: key, status: 'FAILED', to: [], cc: [], subject: '', details: msg });
        results.push({ key, status: 'FAILED', message: msg, to: [], logKey: key });
        problems.push(`${def.title} failed: ${msg}`);
      }
    }

    if (problems.length && !opts.preview) await notifyAdmin(deps, cfg, mailer, ctx, todayLog, problems, opts.trigger);
    const lines = results.map((r) => `${r.key}: ${r.status}${r.message ? ' – ' + r.message : ''}`);
    deps.log(lines.join('\n'));
    const runId = await deps.store.runAdd({ startedAt, finishedAt: deps.now().toISOString(), mode: opts.mode, trigger: opts.trigger, results: lines, problems });
    return { locked: false, results, problems, runId };
  });
  return outcome ?? { locked: true, results: [], problems: ['Another run is in progress – try again in a minute'] };
}

interface Delivered { status: MailStatus; to: string[]; cc: string[]; subject: string; html: string }

/** Resolve recipients, apply dry-run / preview redirection, send. */
export async function deliver(mailer: Mailer, cfg: Config, mail: BuiltMail, o: { preview: boolean; redirectTo?: string }): Promise<Delivered> {
  const dry = cfg.dryRun || !!o.redirectTo;
  let to = emails(mail.to);
  let cc = emails(mail.cc).filter((e) => !to.includes(e));
  const replyTo = isEmail(mail.replyTo || '') ? mail.replyTo : '';
  let subject = mail.subject;
  let html = mail.html;
  let status: MailStatus = 'SENT';

  if (dry) {
    const target = emails(o.redirectTo || cfg.adminEmail);
    if (!target.length) throw new Error('Dry run is on but no admin e-mail is set (Settings → Mode)');
    const label = o.preview ? 'PREVIEW' : 'DRY RUN';
    html = dryBanner(label, to, cc, replyTo) + html;
    subject = `[${label}] ${subject}`;
    to = target; cc = [];
    status = o.preview ? 'PREVIEW' : 'DRY_RUN';
  } else if (!to.length) {
    throw new Error('no valid "To" recipients configured');
  }

  await mailer.send({ to, cc, replyTo, senderName: mail.senderName || APP_NAME, subject, html, text: htmlToText(html) });
  return { status, to, cc, subject, html };
}

async function notifyAdmin(deps: Deps, cfg: Config, mailer: Mailer, ctx: BuildCtx, todayLog: MailLogEntry[], problems: string[], by: string) {
  const admin = emails(cfg.adminEmail);
  if (!admin.length) { deps.log('Admin e-mail missing; problems: ' + problems.join(' | ')); return; }
  const details = problems.join(' | ');
  if (todayLog.some((e) => e.report === 'ADMIN_ALERT' && e.details === details)) return;
  const subject = `${APP_NAME} ${DASH} attention needed ${DASH} ${niceDate(ctx.todayKey)}`;
  const link = cfg.appUrl ? `<a href="${esc(cfg.appUrl)}/settings">Settings</a>` : 'Settings';
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px">' +
    `<p>The Daily Reports automation found the following problems on ${esc(niceDate(ctx.todayKey))}:</p>` +
    `<ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` +
    `<p>Fix them in ${link}. The 9:35 retry will send anything that failed, and you can also use "Run morning reports now" in the app.</p></div>`;
  try {
    await mailer.send({ to: admin, cc: [], senderName: APP_NAME, subject, html, text: htmlToText(html) });
    const entry = { report: 'ADMIN_ALERT', status: 'SENT' as MailStatus, to: admin, cc: [], subject, details, html, timestamp: deps.now().toISOString(), date: ctx.todayKey, by };
    const id = await deps.store.mailLogAdd(entry);
    todayLog.push({ ...entry, id });
  } catch (e) {
    deps.log('Could not send the admin alert: ' + ((e as Error).message || e));
  }
}

/** Configuration problems that would stop mails from going out. */
export async function healthProblems(cfg: Config, ctx: BuildCtx): Promise<string[]> {
  const p: string[] = [];
  const need: Array<[keyof Config, string]> = [['principalEmail', 'Principal'], ['ashHodEmail', 'ASH HoD'], ['manishankarEmail', 'Dr. Manishankar'], ['gnanaKingEmail', 'Dr. G R Gnana King']];
  for (const [k, label] of need) if (!emails(cfg[k]).length) p.push(`${label} e-mail is missing (Settings → Recipients)`);
  for (const k of ['CoursePlans', 'StudentProfiles', 'Attendance', 'StatusReport'] as const) {
    const o = owners(cfg, k).owner;
    if (!o.email) p.push(`Owner ${o.name || k} has no e-mail (Settings → Owners, format "Name <email>")`);
  }
  if (!emails(cfg.devTeam).length) p.push('The development team has no e-mail addresses – the dev-team reminder will not be sent (Settings → Dev team)');
  const closeKey = parseDateKey(cfg.attendanceCloseDate);
  if ((!closeKey || ctx.todayKey <= closeKey) && !(await facultyEmails(ctx)).length) p.push('No faculty e-mails: set the all-faculty address or fill the Faculty list (needed for the attendance notice)');
  if (!emails(cfg.adminEmail).length) p.push('Admin e-mail is missing (Settings → Mode)');
  if (cfg.mailTransport === 'log' && !cfg.dryRun) p.push('Mail transport is "log" – nothing is actually sent. Choose SMTP or Gmail in Settings → Mail');
  const tr = await ctx.data.tracker();
  if (tr.error) p.push(`Tracker spreadsheet: ${tr.error}`);
  return p;
}

// ---------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------
export interface ReportToday {
  key: ReportKey; title: string; batch: string; when: string; page: string; owner: string;
  status: 'SENT' | 'DRY_RUN' | 'PREVIEW' | 'SKIPPED' | 'FAILED' | 'DUE' | 'NOT_DUE';
  detail: string; to: string[]; subject: string; logId?: string; at?: string;
}
export interface Overview {
  date: string; dateNice: string; dryRun: boolean; transport: string; problems: string[];
  reports: ReportToday[];
  counts: { pendingCoursePlans: number; pendingProfiles: number; openQueries: number; tasksInProgress: number; tasksOverdue: number; trackerError?: string };
}

export async function overview(deps: Deps): Promise<Overview> {
  const cfg = await loadConfig(deps);
  const ctx = buildCtx(deps, cfg);
  const mailer = deps.mailerFor(cfg);
  const todayLog = await deps.store.mailLogForDate(ctx.todayKey);
  const problems = await healthProblems(cfg, ctx);

  const reports: ReportToday[] = [];
  for (const def of REPORTS) {
    const owner = parsePerson(cfg[`owner${def.ownerKey}`]).name;
    const entries = todayLog.filter((e) => (e.report === def.key || e.report.startsWith(def.key + ':')) && e.status !== 'PREVIEW').sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const done = [...entries].reverse().find((e) => DONE_STATUSES.includes(e.status));
    const last = entries[entries.length - 1];
    const base = { key: def.key, title: def.title, batch: def.batch, when: def.when, page: def.page, owner };
    if (done) {
      reports.push({ ...base, status: done.status as ReportToday['status'], detail: done.details, to: done.to, subject: done.subject, logId: done.id, at: done.timestamp });
      continue;
    }
    let due: ReportToday;
    try {
      const built = await def.build(ctx);
      if (isSkipped(built)) due = { ...base, status: 'NOT_DUE', detail: built.skip, to: [], subject: '' };
      else due = { ...base, status: 'DUE', detail: built.details, to: emails(built.to), subject: built.subject };
    } catch (e) {
      due = { ...base, status: 'FAILED', detail: (e as Error).message || String(e), to: [], subject: '' };
    }
    if (last && last.status === 'FAILED') { due.status = 'FAILED'; due.detail = last.details; due.logId = last.id; due.at = last.timestamp; }
    reports.push(due);
  }

  const [plans, profiles, queries, tr] = await Promise.all([ctx.data.coursePlans(), ctx.data.studentProfiles(), ctx.data.queries(), ctx.data.tracker()]);
  const active = tr.tasks.filter((t) => t.active);
  return {
    date: ctx.todayKey, dateNice: niceDate(ctx.todayKey), dryRun: cfg.dryRun, transport: mailer.describe(), problems, reports,
    counts: {
      pendingCoursePlans: plans.filter((p) => isPendingStatus(p.status)).length,
      pendingProfiles: profiles.filter((s) => !s.created).reduce((n, s) => n + (s.studentName ? 1 : Number(s.count) || 0), 0),
      openQueries: queries.filter((q) => !isClosedStatus(q.status)).length,
      tasksInProgress: active.length,
      tasksOverdue: active.filter((t) => t.due && t.due < ctx.todayKey).length,
      trackerError: tr.error,
    },
  };
}

/** Build one report for display (never sends). */
export async function previewReport(deps: Deps, key: ReportKey, todayKey?: string) {
  const def = reportDef(key);
  if (!def) throw new Error('unknown report');
  const cfg = await loadConfig(deps);
  const liveCtx = buildCtx(deps, cfg, { todayKey });
  const previewCtx: BuildCtx = { ...liveCtx, preview: true };
  let skip = '';
  try { const live = await def.build(liveCtx); if (isSkipped(live)) skip = live.skip; } catch (e) { skip = 'would fail: ' + ((e as Error).message || e); }
  const built = await def.build(previewCtx);
  if (isSkipped(built)) throw new Error(built.skip);
  const to = emails(built.to);
  return { key, title: def.title, date: liveCtx.todayKey, skip, subject: built.subject, to, cc: emails(built.cc).filter((e) => !to.includes(e)), replyTo: built.replyTo, html: built.html, details: built.details, dryRun: cfg.dryRun };
}

export { type DataSource };
