import type { BuildCtx } from './context.js';
import { attendanceCc, facultyEmails, owners, senderName } from './context.js';
import type { BuildResult } from '../types.js';
import { daysBetween, longDate, niceDate, parseDateKey, parseDateList } from '../lib/dates.js';
import { DASH, esc } from '../lib/text.js';
import { wrap } from '../lib/html.js';

/** Report 3 – Attendance Correction Window: one-time notice, reminder(s), final reminder, on the configured dates. */
export async function buildAttendanceMail(ctx: BuildCtx): Promise<BuildResult> {
  const { cfg, todayKey } = ctx;
  const closeKey = parseDateKey(cfg.attendanceCloseDate);
  const noticeKey = parseDateKey(cfg.attendanceNoticeDate);
  const reminderKeys = parseDateList(cfg.attendanceReminderDates);
  const finalKey = closeKey || reminderKeys[reminderKeys.length - 1] || '';

  let variant = '';
  if (ctx.preview) {
    variant = 'NOTICE';
  } else {
    if (!noticeKey && !closeKey && !reminderKeys.length) return { skip: 'no attendance dates configured (Settings → Schedule)' };
    if (closeKey && todayKey > closeKey) return { skip: `attendance window closed on ${niceDate(closeKey)}` };
    if (noticeKey && todayKey === noticeKey) variant = 'NOTICE';
    else if (reminderKeys.includes(todayKey)) variant = todayKey === finalKey ? 'FINAL' : 'REMINDER';
    else if (noticeKey && todayKey > noticeKey && !(await ctx.data.everSent('ATTENDANCE:NOTICE'))) variant = 'NOTICE'; // installed after the notice date
    if (!variant) return { skip: 'nothing due today' };
  }

  const closeNice = closeKey ? longDate(closeKey) : 'the announced date';
  const closeShort = closeKey ? niceDate(closeKey) : '';
  const { owner, backup } = owners(cfg, 'Attendance');
  const faculty = await facultyEmails(ctx);

  let title: string, subject: string, lead: string;
  if (variant === 'NOTICE') {
    title = 'Attendance Correction Window';
    subject = `Notice ${DASH} Attendance Correction Window closes ${closeShort} ${DASH} ${niceDate(todayKey)}`;
    lead = `<p>This is to inform all faculty that the <strong>attendance correction window will be opened once</strong> and will <strong>close on ${esc(closeNice)}</strong>.</p>` +
      '<p style="color:#b00020"><strong>There will be no further extension.</strong></p>' +
      '<p>Please complete all attendance corrections before the window closes.' +
      (reminderKeys.length ? ` Reminders will be sent on ${esc(reminderKeys.map(niceDate).join(' and '))}.` : '') + '</p>';
  } else if (variant === 'REMINDER') {
    title = 'Reminder: Attendance Correction Window';
    const daysLeft = closeKey ? daysBetween(todayKey, closeKey) : 0;
    subject = `Reminder ${DASH} Attendance Correction Window closes ${daysLeft === 1 ? 'tomorrow, ' : ''}${closeShort} ${DASH} ${niceDate(todayKey)}`;
    lead = `<p>This is a reminder that the attendance correction window <strong>closes on ${esc(closeNice)}</strong>` +
      (daysLeft === 1 ? ' (tomorrow)' : daysLeft ? ` (in ${daysLeft} days)` : '') + '.</p>' +
      '<p style="color:#b00020"><strong>No further extension will be given.</strong> Please complete pending corrections today.</p>';
  } else {
    title = 'FINAL REMINDER: Attendance Correction Window closes today';
    subject = `Final Reminder ${DASH} Attendance Correction Window closes TODAY ${closeShort} ${DASH} ${niceDate(todayKey)}`;
    lead = `<p style="font-size:16px"><strong>The attendance correction window closes today, ${esc(closeNice)}.</strong></p>` +
      '<p style="color:#b00020"><strong>This is the final reminder. There is no further extension.</strong> Any correction not completed today cannot be made later.</p>';
  }

  return {
    variant,
    to: faculty,
    cc: attendanceCc(cfg, owner, backup),
    replyTo: owner.email,
    senderName: senderName(owner.name || 'Attendance'),
    subject,
    html: wrap({ title, todayKey, subtitle: 'To all faculty', body: lead, owner, backup, salutation: 'Dear Faculty Members,', orgName: cfg.orgName, appUrl: ctx.appUrl, now: ctx.now }),
    details: `${variant}; closes ${closeKey}`,
  };
}
