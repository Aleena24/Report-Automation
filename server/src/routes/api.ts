import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Deps } from '../engine.js';
import { loadConfig, overview, previewReport, runReports, healthProblems, buildCtx } from '../engine.js';
import { ConfigSchema, CONFIG_FIELDS } from '../config.js';
import { HttpError, requireAdmin } from '../auth.js';
import { ALL_KEYS, EVENING_KEYS, MORNING_KEYS, REPORTS } from '../reports/registry.js';
import { readTracker } from '../sheets.js';
import { parseTable, coursePlansFromTable, studentProfilesFromTable, queriesFromTable, facultyFromTable, type Table } from '../lib/tables.js';
import { parsePastedRows, isEmail, emails, htmlToText, APP_NAME, DASH } from '../lib/text.js';
import { dateKey, isDateKey, niceDate, parseDateKey } from '../lib/dates.js';
import type { Collection } from '../store.js';
import type { ReportKey } from '../types.js';
import { GoogleAuth } from 'google-auth-library';

const dateField = z.string().default('').transform((s, ctx) => {
  if (!s) return '';
  const k = parseDateKey(s);
  if (!k) ctx.addIssue({ code: 'custom', message: `"${s}" is not a date (use yyyy-mm-dd or dd/mm/yyyy)` });
  return k;
});
const str = z.string().trim().max(2000).default('');

const CoursePlanInput = z.object({
  courseCode: str, courseName: str, faculty: str, department: str, semester: str,
  submittedOn: dateField, status: str, approvedOn: dateField, remarks: str,
}).refine((v) => v.courseCode || v.courseName, { message: 'Give a course code or name' });

const StudentProfileInput = z.object({
  department: str, batch: str, studentName: str, admissionNo: str, created: z.boolean().default(false),
  count: z.coerce.number().int().min(0).default(0), responsibleFaculty: str, remarks: str,
}).refine((v) => v.studentName || v.admissionNo || v.count > 0, { message: 'Give a student name / admission no, or a pending count for a group' });

const QueryInput = z.object({
  receivedOn: dateField, source: str, raisedBy: str, query: z.string().trim().min(1, 'Describe the query').max(4000),
  status: z.enum(['Open', 'Closed']).default('Open'), closedOn: dateField, closureRemarks: str, handledBy: str,
});

const FacultyInput = z.object({ name: str, email: str.transform((s) => s.toLowerCase()), department: str })
  .refine((v) => !v.email || isEmail(v.email), { message: 'Invalid e-mail' })
  .refine((v) => v.name || v.email, { message: 'Give a name or e-mail' });

interface DatasetDef {
  col: Collection; tabKey: 'tabCoursePlans' | 'tabStudentProfiles' | 'tabQueries' | 'tabFaculty';
  schema: z.ZodTypeAny; fromTable: (t: Table) => Array<Record<string, unknown>>; label: string;
}
const DATASETS: Record<string, DatasetDef> = {
  'course-plans': { col: 'coursePlans', tabKey: 'tabCoursePlans', schema: CoursePlanInput, fromTable: coursePlansFromTable, label: 'course plans' },
  'student-profiles': { col: 'studentProfiles', tabKey: 'tabStudentProfiles', schema: StudentProfileInput, fromTable: studentProfilesFromTable, label: 'student profiles' },
  'queries': { col: 'queries', tabKey: 'tabQueries', schema: QueryInput, fromTable: queriesFromTable, label: 'queries' },
  'faculty': { col: 'faculty', tabKey: 'tabFaculty', schema: FacultyInput, fromTable: facultyFromTable, label: 'faculty' },
};

function dataset(req: Request): DatasetDef {
  const d = DATASETS[String(req.params.ds)];
  if (!d) throw new HttpError(404, 'Unknown dataset');
  return d;
}
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => (i.path.length ? i.path.join('.') + ': ' : '') + i.message).join('; '));
  return r.data;
}
function user(req: Request) { return req.user!; }
function stamp(req: Request, now: Date) { return { updatedAt: now.toISOString(), updatedBy: user(req).email }; }
function normaliseQuery(v: Record<string, unknown>, today: string) {
  if (v.status === 'Closed' && !v.closedOn) v.closedOn = today;
  if (v.status === 'Open') { v.closedOn = ''; }
  if (!v.receivedOn) v.receivedOn = today;
  if (!v.source) v.source = 'Email';
  return v;
}

let saEmailCache: string | null = null;
async function serviceAccountEmail(): Promise<string> {
  if (saEmailCache !== null) return saEmailCache;
  try {
    const creds = await new GoogleAuth().getCredentials();
    saEmailCache = creds.client_email || '';
  } catch { saEmailCache = ''; }
  return saEmailCache;
}

export function apiRouter(deps: Deps): Router {
  const r = Router();
  const today = () => dateKey(deps.now());

  // ---- identity & dashboard -----------------------------------------------------------------
  r.get('/me', async (req, res) => {
    const cfg = await loadConfig(deps);
    res.json({ email: user(req).email, role: user(req).role, dryRun: cfg.dryRun, appName: APP_NAME, orgName: cfg.orgName, today: today() });
  });
  r.get('/today', async (_req, res) => res.json(await overview(deps)));

  // ---- reports ------------------------------------------------------------------------------
  r.get('/reports', (_req, res) => res.json(REPORTS.map(({ build: _b, ...d }) => d)));
  r.get('/reports/:key/preview', async (req, res) => {
    const key = String(req.params.key) as ReportKey;
    if (!ALL_KEYS.includes(key)) throw new HttpError(404, 'Unknown report');
    const date = typeof req.query.date === 'string' && isDateKey(req.query.date) ? req.query.date : undefined;
    res.json(await previewReport(deps, key, date));
  });
  r.post('/reports/:key/send', async (req, res) => {
    const key = String(req.params.key) as ReportKey;
    if (!ALL_KEYS.includes(key)) throw new HttpError(404, 'Unknown report');
    const force = !!(req.body && req.body.force);
    if (force && user(req).role !== 'admin') throw new HttpError(403, 'Only admins can re-send a report that already went out');
    res.json(await runReports(deps, { keys: [key], mode: 'single', trigger: 'user:' + user(req).email, force }));
  });
  r.post('/reports/preview-to-me', async (req, res) => {
    const keys = Array.isArray(req.body?.keys) ? (req.body.keys as string[]).filter((k) => ALL_KEYS.includes(k as ReportKey)) as ReportKey[] : ALL_KEYS;
    res.json(await runReports(deps, { keys, mode: 'preview', trigger: 'user:' + user(req).email, preview: true, redirectTo: user(req).email }));
  });
  r.post('/runs/:mode', async (req, res) => {
    const mode = String(req.params.mode);
    if (mode !== 'morning' && mode !== 'evening') throw new HttpError(404, 'mode must be morning or evening');
    res.json(await runReports(deps, { keys: mode === 'morning' ? MORNING_KEYS : EVENING_KEYS, mode, trigger: 'user:' + user(req).email }));
  });
  r.get('/runs', async (_req, res) => res.json(await deps.store.runsRecent(20)));

  // ---- mail log -----------------------------------------------------------------------------
  r.get('/mail-log', async (req, res) => {
    const date = typeof req.query.date === 'string' && isDateKey(req.query.date) ? req.query.date : '';
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const list = date ? (await deps.store.mailLogForDate(date)).reverse() : await deps.store.mailLogRecent(limit);
    res.json(list.map(({ html: _h, ...e }) => e));
  });
  r.get('/mail-log/:id', async (req, res) => {
    const e = await deps.store.mailLogGet(String(req.params.id));
    if (!e) throw new HttpError(404, 'Not found');
    res.json(e);
  });
  r.delete('/mail-log/:id', requireAdmin, async (req, res) => {
    await deps.store.mailLogRemove(String(req.params.id));
    res.json({ ok: true });
  });

  // ---- tracker (Google Sheet, read-only) ----------------------------------------------------
  r.get('/tracker', async (_req, res) => {
    const cfg = await loadConfig(deps);
    const tr = await readTracker(deps.sheets, cfg.sheetId, cfg.trackerTab);
    res.json({ tasks: tr.tasks, tab: tr.tab, link: tr.link, sheetTitle: tr.sheetTitle, error: tr.error, headers: tr.table.headers, today: today(), devTeam: emails(cfg.devTeam), devTeamNames: cfg.devTeam });
  });

  // ---- datasets -----------------------------------------------------------------------------
  r.get('/data/:ds', async (req, res) => {
    const d = dataset(req);
    res.json(await deps.store.list(d.col));
  });
  r.post('/data/:ds', async (req, res) => {
    const d = dataset(req);
    let v = parse(d.schema, req.body) as Record<string, unknown>;
    if (d.col === 'queries') v = normaliseQuery(v, today());
    const created = await deps.store.create(d.col, { ...v, ...stamp(req, deps.now()) });
    res.status(201).json(created);
  });
  r.put('/data/:ds/:id', async (req, res) => {
    const d = dataset(req);
    const id = String(req.params.id);
    const cur = await deps.store.get(d.col, id);
    if (!cur) throw new HttpError(404, 'Not found');
    const { id: _i, updatedAt: _a, updatedBy: _b, ...rest } = cur as Record<string, unknown>;
    let v = parse(d.schema, { ...rest, ...(req.body || {}) }) as Record<string, unknown>;
    if (d.col === 'queries') v = normaliseQuery(v, today());
    await deps.store.update(d.col, id, { ...v, ...stamp(req, deps.now()) });
    res.json({ ...v, id, ...stamp(req, deps.now()) });
  });
  r.delete('/data/:ds/:id', async (req, res) => {
    const d = dataset(req);
    await deps.store.remove(d.col, String(req.params.id));
    res.json({ ok: true });
  });
  r.delete('/data/:ds', requireAdmin, async (req, res) => {
    const d = dataset(req);
    res.json({ removed: await deps.store.clear(d.col) });
  });
  /** Paste rows from Excel / Sheets (first row = headers, matched by meaning). */
  r.post('/data/:ds/bulk', async (req, res) => {
    const d = dataset(req);
    const rows: unknown[][] = Array.isArray(req.body?.rows) ? req.body.rows : parsePastedRows(String(req.body?.text || ''));
    if (rows.length < 2) throw new HttpError(400, 'Paste at least a header row and one data row');
    let items: Array<Record<string, unknown>>;
    try { items = d.fromTable(parseTable(rows)); } catch (e) { throw new HttpError(400, (e as Error).message); }
    if (d.col === 'queries') items = items.map((v) => normaliseQuery(v, today()));
    const added = await deps.store.createMany(d.col, items.map((v) => ({ ...v, ...stamp(req, deps.now()) })));
    res.json({ added, headers: parseTable(rows).headers });
  });
  /** Import a whole tab from the tracking spreadsheet. */
  r.post('/data/:ds/import', async (req, res) => {
    const d = dataset(req);
    const cfg = await loadConfig(deps);
    const tab = String(req.body?.tab || cfg[d.tabKey]);
    let values: unknown[][];
    try { values = await deps.sheets.readTab(cfg.sheetId, tab); }
    catch (e) { throw new HttpError(400, `Could not read tab "${tab}": ${(e as Error).message}`); }
    let items: Array<Record<string, unknown>>;
    try { items = d.fromTable(parseTable(values)); } catch (e) { throw new HttpError(400, (e as Error).message); }
    if (d.col === 'queries') items = items.map((v) => normaliseQuery(v, today()));
    let removed = 0;
    if (req.body?.replace) { if (user(req).role !== 'admin') throw new HttpError(403, 'Only admins can replace all rows'); removed = await deps.store.clear(d.col); }
    const added = await deps.store.createMany(d.col, items.map((v) => ({ ...v, ...stamp(req, deps.now()) })));
    res.json({ added, removed, tab });
  });

  // ---- settings -----------------------------------------------------------------------------
  r.get('/settings', async (req, res) => {
    const cfg = await loadConfig(deps);
    const mailer = deps.mailerFor(cfg);
    res.json({
      config: cfg, fields: CONFIG_FIELDS, readOnly: user(req).role !== 'admin',
      meta: {
        serviceAccountEmail: await serviceAccountEmail(), projectId: deps.env.projectId, region: deps.env.region, authMode: deps.env.authMode,
        transport: mailer.describe(), smtpConfigured: !!deps.env.smtpPass, appUrl: cfg.appUrl || deps.env.appUrl,
        schedule: [
          { job: 'Morning reports', time: '09:00 IST', note: 'course plans, student profiles, status & queries, attendance, dev-team reminder' },
          { job: 'Morning retry', time: '09:35 IST', note: 'sends only what is not yet in the Mail Log' },
          { job: 'Evening digest', time: '17:30 IST', note: 'module completion & testing status' },
        ],
      },
    });
  });
  r.put('/settings', requireAdmin, async (req, res) => {
    const patch = parse(ConfigSchema.partial(), req.body);
    for (const k of ['coursePlanStart', 'coursePlanEnd', 'attendanceNoticeDate', 'attendanceCloseDate'] as const) {
      if (patch[k] !== undefined && patch[k] !== '' && !parseDateKey(patch[k])) throw new HttpError(400, `${k}: not a date`);
      if (patch[k]) patch[k] = parseDateKey(patch[k]);
    }
    await deps.store.saveConfig(patch);
    res.json({ config: await loadConfig(deps) });
  });
  r.get('/settings/health', async (_req, res) => {
    const cfg = await loadConfig(deps);
    res.json({ problems: await healthProblems(cfg, buildCtx(deps, cfg)), dryRun: cfg.dryRun });
  });
  r.post('/settings/test-mail', async (req, res) => {
    const cfg = await loadConfig(deps);
    const mailer = deps.mailerFor(cfg);
    const to = user(req).email;
    const subject = `${APP_NAME} ${DASH} test mail ${DASH} ${niceDate(today())}`;
    const html = `<p>This is a test from the Daily Reports app (${mailer.describe()}).</p><p>If you can read this, mail sending works.</p>`;
    try {
      await mailer.send({ to: [to], cc: [], senderName: APP_NAME, subject, html, text: htmlToText(html) });
    } catch (e) {
      throw new HttpError(502, `Sending failed: ${(e as Error).message}`);
    }
    await deps.store.mailLogAdd({ timestamp: deps.now().toISOString(), date: today(), report: 'TEST', status: mailer.kind === 'log' ? 'DRY_RUN' : 'SENT', to: [to], cc: [], subject, details: mailer.describe(), by: 'user:' + to, html });
    res.json({ ok: true, transport: mailer.describe(), to, note: mailer.kind === 'log' ? 'Transport is "log": nothing was really sent. Choose SMTP or Gmail to send.' : 'Sent.' });
  });
  r.post('/settings/test-sheet', async (req, res) => {
    const cfg = await loadConfig(deps);
    const sheetId = String(req.body?.sheetId || cfg.sheetId);
    const tab = String(req.body?.tab || cfg.trackerTab);
    const tr = await readTracker(deps.sheets, sheetId, tab);
    res.json({ ok: !tr.error, error: tr.error, sheetTitle: tr.sheetTitle, tab, headers: tr.table.headers, rows: tr.table.rows.length, tasks: tr.tasks.length, link: tr.link, serviceAccountEmail: await serviceAccountEmail() });
  });

  return r;
}
