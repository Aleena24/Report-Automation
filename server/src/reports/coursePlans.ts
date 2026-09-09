import type { BuildCtx } from './context.js';
import { departmentRecipients, owners, isSkipDay, senderName } from './context.js';
import type { BuildResult } from '../types.js';
import { isPendingStatus } from '../lib/status.js';
import { daysBetween, niceDate, parseDateKey } from '../lib/dates.js';
import { DASH, esc, numOr } from '../lib/text.js';
import { htmlTable, moreThan7, subjectLine, summaryByGroup, wrap } from '../lib/html.js';

export const COURSE_PLANS_TITLE = 'Pending Course Plan Approvals';

/** Report 1 – Pending Course Plan Approvals: daily within the configured period, optionally even on skip days. */
export async function buildCoursePlanReport(ctx: BuildCtx): Promise<BuildResult> {
  const { cfg, todayKey } = ctx;
  const startKey = parseDateKey(cfg.coursePlanStart);
  const endKey = parseDateKey(cfg.coursePlanEnd);
  if (!ctx.preview) {
    if (startKey && todayKey < startKey) return { skip: `starts on ${niceDate(startKey)}` };
    if (endKey && todayKey > endKey) return { skip: `report period ended on ${niceDate(endKey)}` };
    if (!cfg.coursePlanEveryDay) { const s = isSkipDay(cfg, todayKey); if (s) return { skip: s, log: true }; }
  }

  const plans = await ctx.data.coursePlans();
  const data = plans.filter((p) => isPendingStatus(p.status)).map((p) => {
    const sub = parseDateKey(p.submittedOn);
    const days: number | '' = sub ? daysBetween(sub, todayKey) : '';
    const course = [p.courseCode, p.courseName].filter(Boolean).join(` ${DASH} `) || '(unnamed)';
    return { course, faculty: p.faculty || '', dept: p.department || '', sem: p.semester || '', days, status: p.status || '' };
  }).sort((a, b) => (numOr(b.days, -1) - numOr(a.days, -1)) || a.dept.localeCompare(b.dept));

  const { owner, backup } = owners(cfg, 'CoursePlans');
  const period = startKey && endKey ? `Reporting period ${niceDate(startKey)} ${DASH} ${niceDate(endKey)}` : '';

  let body: string;
  if (!data.length) {
    body = `<p style="font-size:16px"><strong>Nil pending.</strong></p><p>There are no course plans awaiting approval as of ${esc(niceDate(todayKey))}.</p>`;
  } else {
    const over7 = data.filter((d) => numOr(d.days, 0) > 7).length;
    body = `<p><strong>${data.length}</strong> course plan${data.length === 1 ? '' : 's'} awaiting approval as of ${esc(niceDate(todayKey))}` +
      (over7 ? `, of which <strong style="color:#b00020">${over7}</strong> pending for more than 7 days` : '') + '.</p>' +
      htmlTable(['#', 'Course', 'Faculty', 'Department', 'Semester', 'Days Pending', 'Status'],
        data.map((d, i) => [i + 1, d.course, d.faculty, d.dept, d.sem, d.days === '' ? DASH : d.days, d.status || 'Pending']),
        { highlightCol: 5, highlightIf: moreThan7 }) +
      summaryByGroup(data, 'dept', 'Department');
  }
  return {
    ...departmentRecipients(cfg, cfg.coursePlansTo, owner, backup),
    replyTo: owner.email,
    senderName: senderName(owner.name || 'Course Plans'),
    subject: subjectLine(COURSE_PLANS_TITLE, todayKey),
    html: wrap({ title: COURSE_PLANS_TITLE, todayKey, subtitle: period, body, owner, backup, orgName: cfg.orgName, appUrl: ctx.appUrl, now: ctx.now }),
    details: `${data.length} pending`,
  };
}
