import type { BuildCtx } from './context.js';
import { managementRecipients, owners, isSkipDay } from './context.js';
import type { BuildResult, Task } from '../types.js';
import { niceDate } from '../lib/dates.js';
import { APP_NAME, DASH, esc, isEmail, people, sameFirstName } from '../lib/text.js';
import { h3, htmlTable, overdueFlag, stat, statRow, subjectLine, wrap } from '../lib/html.js';

export const MODULE_DIGEST_TITLE = 'Module Completion & Testing Status';

/** Report 5a – morning reminder to the dev team to log module / testing status in the tracker. */
export async function buildDevTeamReminder(ctx: BuildCtx): Promise<BuildResult> {
  const { cfg, todayKey } = ctx;
  if (!ctx.preview) { const s = isSkipDay(cfg, todayKey); if (s) return { skip: s, log: true }; }
  const team = people(cfg.devTeam);
  const to = team.map((p) => p.email).filter(isEmail);
  if (!to.length && !ctx.preview) return { skip: 'the development team has no e-mail addresses (Settings → Dev team)' };

  const { owner } = owners(cfg, 'StatusReport');
  const deadline = cfg.moduleStatusDeadline || '5:00 PM';
  const tr = await ctx.data.tracker();
  const link = tr.link || (ctx.appUrl ? `${ctx.appUrl}/tracker` : '');
  const title = `Module completion & testing status ${DASH} due today`;
  const body = `<p>Please update your tasks in the <strong>${esc(cfg.trackerTab)}</strong> tracker by <strong>${esc(deadline)}</strong> today:</p>` +
    (link ? `<p style="margin:12px 0"><a href="${esc(link)}" style="background:#1f4e79;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px;font-weight:bold">Open the "${esc(cfg.trackerTab)}" tab</a></p>` : '') +
    '<ul style="margin:6px 0 10px 18px;padding:0">' +
    '<li>Set <strong>Status</strong> to <em>In progress</em> for what you are developing / testing today.</li>' +
    '<li>When something is finished, set Status to <em>Done</em> and fill the <strong>Finished date</strong>.</li>' +
    '<li>Fill <strong>Due on</strong> for tasks in progress and note blockers in <strong>remarks</strong>.</li></ul>' +
    `<p>Expected from: <strong>${esc(team.map((p) => p.name).filter(Boolean).join(', ') || 'the development team')}</strong>.</p>` +
    `<p style="color:#555;font-size:13px">${ctx.schedule.evening ? `At ${esc(ctx.schedule.evening)} ` : 'In the evening '}a digest of tasks finished today, tasks in progress and anyone with nothing updated goes to the management.</p>`;
  return {
    to,
    cc: [owner.email],
    replyTo: owner.email,
    senderName: APP_NAME,
    subject: `Reminder ${DASH} Module completion & testing status due today by ${deadline} ${DASH} ${niceDate(todayKey)}`,
    html: wrap({ title, todayKey, body, owner, salutation: 'Dear Team,', orgName: cfg.orgName, appUrl: ctx.appUrl, now: ctx.now }),
    details: `${to.length} recipients`,
  };
}

/** Report 5b – evening digest of module completion & testing status from the tracker. */
export async function buildModuleDigest(ctx: BuildCtx): Promise<BuildResult> {
  const { cfg, todayKey } = ctx;
  if (!ctx.preview) { const s = isSkipDay(cfg, todayKey); if (s) return { skip: s, log: true }; }
  const tr = await ctx.data.tracker();
  if (tr.error) throw new Error(`Tracker: ${tr.error}`);
  const tasks = tr.tasks;

  const finishedToday = tasks.filter((x) => x.finished === todayKey);
  const inProgress = tasks.filter((x) => x.active);
  const overdue = inProgress.filter((x) => x.due && x.due < todayKey);
  const queued = tasks.filter((x) => !x.active && !x.done && x.person);

  const byPerson = new Map<string, { finished: Task[]; active: Task[]; queued: Task[] }>();
  const bucket = (x: Task, kind: 'finished' | 'active' | 'queued') => {
    if (!x.person) return;
    const g = byPerson.get(x.person) || { finished: [], active: [], queued: [] };
    g[kind].push(x);
    byPerson.set(x.person, g);
  };
  finishedToday.forEach((x) => bucket(x, 'finished'));
  inProgress.forEach((x) => bucket(x, 'active'));
  queued.forEach((x) => bucket(x, 'queued'));

  const team = people(cfg.devTeam).map((p) => p.name).filter(Boolean);
  const hasActivity = (p: string) => { const g = byPerson.get(p); return !!g && (g.finished.length > 0 || g.active.length > 0); };
  const missing = team.filter((n) => !Array.from(byPerson.keys()).some((p) => sameFirstName(p, n) && hasActivity(p)));
  const persons = Array.from(byPerson.keys()).sort((a, b) => {
    const ta = team.some((n) => sameFirstName(a, n)) ? 0 : 1, tb = team.some((n) => sameFirstName(b, n)) ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });

  let body = statRow([
    stat('Finished today', finishedToday.length, finishedToday.length ? '#1f7a1f' : '#1f4e79'), stat('In progress', inProgress.length),
    stat('Overdue', overdue.length, overdue.length ? '#b00020' : '#1f7a1f'), stat('No update', missing.length, missing.length ? '#b00020' : '#1f7a1f'),
  ]);
  if (missing.length) body += `<p style="color:#b00020"><strong>Nothing finished today and nothing in progress for:</strong> ${esc(missing.join(', '))}</p>`;
  if (!finishedToday.length && !inProgress.length) body += '<p><strong>No task in the tracker is marked "In progress" or finished today.</strong></p>';

  const rowOf = (x: Task, label?: string) => [x.service || DASH, x.task, x.type || DASH, label || x.status || DASH, x.start ? niceDate(x.start) : DASH,
    x.due ? niceDate(x.due) + (x.active && x.due < todayKey ? ' (overdue)' : '') : DASH, x.finished ? niceDate(x.finished) : DASH, x.remarks || DASH];
  const cols = ['Module', 'Task', 'Type', 'Status', 'Started', 'Due', 'Finished', 'Remarks'];
  for (const p of persons) {
    const g = byPerson.get(p)!;
    const rows = [...g.finished.map((x) => rowOf(x, 'Done today')), ...g.active.map((x) => rowOf(x)), ...g.queued.map((x) => rowOf(x, 'Not started'))];
    const tag = team.length && !team.some((n) => sameFirstName(p, n)) ? ' <span style="color:#777;font-weight:normal">(not in the dev-team list)</span>' : '';
    body += h3(`${esc(p)}${tag} <span style="color:#555;font-weight:normal;font-size:13px">${DASH} ${g.finished.length} finished today, ${g.active.length} in progress${g.queued.length ? `, ${g.queued.length} not started` : ''}</span>`) +
      htmlTable(cols, rows, { highlightCol: 5, highlightIf: overdueFlag });
  }

  const counts: Record<string, number> = {};
  for (const x of tasks) { const k = x.status || 'No status'; counts[k] = (counts[k] || 0) + 1; }
  const unassigned = tasks.filter((x) => !x.person && !x.done).length;
  body += h3('Overall tracker') +
    htmlTable(['Status', 'Tasks'], [...Object.keys(counts).sort().map((k) => [k, counts[k]]), ['Total', tasks.length]], { totalRow: true }) +
    (unassigned ? `<p style="color:#555;font-size:13px">${unassigned} open task${unassigned === 1 ? '' : 's'} not yet assigned to anyone.</p>` : '');

  const { owner } = owners(cfg, 'StatusReport');
  return {
    ...managementRecipients(cfg, cfg.moduleDigestTo, owner),
    replyTo: owner.email,
    senderName: APP_NAME,
    subject: subjectLine(MODULE_DIGEST_TITLE, todayKey),
    html: wrap({ title: MODULE_DIGEST_TITLE, todayKey, subtitle: `From the "${tr.tab}" tracker`, body, owner, orgName: cfg.orgName, appUrl: ctx.appUrl, now: ctx.now }),
    details: `${finishedToday.length} finished, ${inProgress.length} in progress, ${overdue.length} overdue; no update: ${missing.join(', ') || 'none'}`,
  };
}
