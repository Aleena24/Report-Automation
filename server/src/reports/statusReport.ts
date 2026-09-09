import type { BuildCtx } from './context.js';
import { managementRecipients, owners, isSkipDay, senderName } from './context.js';
import type { BuildResult } from '../types.js';
import { isClosedStatus } from '../lib/status.js';
import { addDays, niceDate, parseDateKey } from '../lib/dates.js';
import { DASH, esc } from '../lib/text.js';
import { h3, htmlTable, overdueFlag, stat, statRow, subjectLine, wrap } from '../lib/html.js';

export const STATUS_REPORT_TITLE = 'Daily Status and Query Closure Report';

/** Report 4 – Daily Status & Query Closure every working day, before the configured deadline. */
export async function buildStatusReport(ctx: BuildCtx): Promise<BuildResult> {
  const { cfg, todayKey } = ctx;
  if (!ctx.preview) { const s = isSkipDay(cfg, todayKey); if (s) return { skip: s, log: true }; }

  const lookback = Math.max(1, Number(cfg.queryLookbackDays) || 1);
  const sinceKey = addDays(todayKey, -lookback);
  const sinceNice = niceDate(sinceKey);

  // --- queries -------------------------------------------------------------
  const all = await ctx.data.queries();
  const rows = all.map((q) => {
    const recKey = parseDateKey(q.receivedOn);
    const clsKey = parseDateKey(q.closedOn);
    const isClosed = isClosedStatus(q.status) || (!!clsKey && !q.status);
    return {
      recKey, clsKey, src: q.source || '', by: q.raisedBy || '', query: q.query || '',
      status: q.status || (clsKey ? 'Closed' : 'Open'), isClosed, remarks: q.closureRemarks || '', handled: q.handledBy || '',
    };
  });
  const received = rows.filter((r) => r.recKey && r.recKey >= sinceKey && r.recKey <= todayKey).length;
  const closed = rows.filter((r) => r.isClosed && ((r.clsKey && r.clsKey >= sinceKey) || (!r.clsKey && r.recKey >= sinceKey))).length;
  const open = rows.filter((r) => !r.isClosed).length;
  const inScope = rows.filter((r) => !r.isClosed || (r.clsKey && r.clsKey >= sinceKey) || (r.recKey && r.recKey >= sinceKey));

  const sections: string[] = [];
  const bucket = (test: (src: string) => boolean, label: string, optional = false) => {
    const list = inScope.filter((r) => test(r.src)).sort((a, b) => (Number(a.isClosed) - Number(b.isClosed)) || b.recKey.localeCompare(a.recKey));
    if (optional && !list.length) return;
    const table = list.length
      ? htmlTable(['#', 'Received', 'Raised By', 'Query', 'Status', 'Closed On', 'Closure Remarks', 'Handled By'],
        list.map((r, i) => [i + 1, r.recKey ? niceDate(r.recKey) : DASH, r.by || DASH, r.query || DASH, r.status,
          r.clsKey ? niceDate(r.clsKey) : DASH, r.remarks || (r.isClosed ? DASH : 'In progress'), r.handled || DASH]),
        { highlightCol: 4, highlightIf: (v) => !isClosedStatus(String(v)) })
      : '<p style="color:#555">None.</p>';
    sections.push(h3(esc(label)) + table);
  };
  bucket((s) => /mail/i.test(s), `Queries received by e-mail ${DASH} closure status and remarks`);
  bucket((s) => /celer/i.test(s), `Queries reported directly to Celerscet ${DASH} closure status`);
  bucket((s) => !/celer/i.test(s) && !/mail/i.test(s), 'Other queries', true);

  // --- modules under development today (from the tracker) ------------------
  const tr = await ctx.data.tracker();
  const active = tr.tasks.filter((x) => x.active).sort((a, b) => a.person.localeCompare(b.person) || a.service.localeCompare(b.service));
  const modRows = active.map((x) => [x.service || DASH, x.task, x.type || DASH, x.person || '(unassigned)', x.start ? niceDate(x.start) : DASH,
    x.due ? niceDate(x.due) + (x.due < todayKey ? ' (overdue)' : '') : DASH, x.remarks || DASH]);
  const modHtml = h3('Modules under development today') +
    (tr.error ? `<p style="color:#b00020">Tracker could not be read: ${esc(tr.error)}</p>`
      : modRows.length ? htmlTable(['Module', 'Task', 'Type', 'Working On It', 'Started', 'Due', 'Remarks'], modRows, { highlightCol: 5, highlightIf: overdueFlag })
        : '<p style="color:#555">No tasks are marked "In progress" in the tracker today.</p>');

  const summary = statRow([
    stat(`Received since ${sinceNice}`, received), stat(`Closed since ${sinceNice}`, closed),
    stat('Still open', open, open ? '#b00020' : '#1f7a1f'), stat('Modules in progress', modRows.length),
  ]);

  const { owner, backup } = owners(cfg, 'StatusReport');
  return {
    ...managementRecipients(cfg, cfg.statusReportTo, owner, backup),
    replyTo: owner.email,
    senderName: senderName(owner.name || 'Status'),
    subject: subjectLine(STATUS_REPORT_TITLE, todayKey),
    html: wrap({ title: STATUS_REPORT_TITLE, todayKey, subtitle: `Covers ${sinceNice} ${DASH} ${niceDate(todayKey)} and all open items`,
      body: summary + sections.join('') + modHtml, owner, backup, orgName: cfg.orgName, appUrl: ctx.appUrl, now: ctx.now }),
    details: `${received} received, ${closed} closed, ${open} open, ${modRows.length} tasks in progress` + (tr.error ? `; tracker error: ${tr.error}` : ''),
  };
}
