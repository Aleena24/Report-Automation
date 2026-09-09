import type { BuildCtx } from './context.js';
import { departmentRecipients, owners, isSkipDay, senderName } from './context.js';
import type { BuildResult } from '../types.js';
import { niceDate } from '../lib/dates.js';
import { DASH, esc } from '../lib/text.js';
import { htmlTable, subjectLine, wrap } from '../lib/html.js';

export const STUDENT_PROFILES_TITLE = 'Pending Student Profile Creation';

/** Report 2 – Pending Student Profile Creation every working day. */
export async function buildStudentProfileReport(ctx: BuildCtx): Promise<BuildResult> {
  const { cfg, todayKey } = ctx;
  if (!ctx.preview) { const s = isSkipDay(cfg, todayKey); if (s) return { skip: s, log: true }; }

  const rows = await ctx.data.studentProfiles();
  const groups = new Map<string, { dept: string; batch: string; fac: string; n: number; names: string[] }>();
  let perStudent = 0;
  for (const r of rows) {
    if (r.created) continue;
    const isGroup = !r.studentName && Number(r.count) > 0;
    const n = isGroup ? Number(r.count) : 1;
    if (!isGroup && !r.studentName && !r.admissionNo) continue;
    if (!isGroup) perStudent++;
    const dept = r.department || '', batch = r.batch || '', fac = r.responsibleFaculty || '';
    const k = [dept, batch, fac].join('|');
    const g = groups.get(k) || { dept, batch, fac, n: 0, names: [] };
    g.n += n;
    if (r.studentName) g.names.push(r.studentName);
    groups.set(k, g);
  }
  const data = Array.from(groups.values()).sort((a, b) => a.dept.localeCompare(b.dept) || a.batch.localeCompare(b.batch) || a.fac.localeCompare(b.fac));
  const total = data.reduce((s, g) => s + g.n, 0);

  const { owner, backup } = owners(cfg, 'StudentProfiles');
  let body: string;
  if (!data.length) {
    body = `<p style="font-size:16px"><strong>Nil pending.</strong></p><p>All student profiles have been created as of ${esc(niceDate(todayKey))}.</p>`;
  } else {
    const table = data.map((g, i) => [i + 1, g.dept || DASH, g.batch || DASH, g.n, g.fac || DASH] as unknown[]);
    table.push(['', 'Total', '', total, '']);
    body = `<p><strong>${total}</strong> student profile${total === 1 ? '' : 's'} not yet created as of ${esc(niceDate(todayKey))}, across ${data.length} department/batch group${data.length === 1 ? '' : 's'}.</p>` +
      htmlTable(['#', 'Department', 'Batch', 'Students Pending', 'Responsible Faculty'], table, { totalRow: true }) +
      (perStudent ? `<p style="color:#555;font-size:12px">Student-wise details are in the Daily Reports app${ctx.appUrl ? ` (<a href="${esc(ctx.appUrl)}/student-profiles">Student Profiles</a>)` : ''}.</p>` : '');
  }
  return {
    ...departmentRecipients(cfg, cfg.studentProfilesTo, owner, backup),
    replyTo: owner.email,
    senderName: senderName(owner.name || 'Student Profiles'),
    subject: subjectLine(STUDENT_PROFILES_TITLE, todayKey),
    html: wrap({ title: STUDENT_PROFILES_TITLE, todayKey, body, owner, backup, orgName: cfg.orgName, appUrl: ctx.appUrl, now: ctx.now }),
    details: `${total} pending in ${data.length} groups`,
  };
}
