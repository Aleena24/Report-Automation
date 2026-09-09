import type { BuildCtx } from './context.js';
import type { BuildResult, ReportKey } from '../types.js';
import type { Config } from '../config.js';
import { buildCoursePlanReport, COURSE_PLANS_TITLE } from './coursePlans.js';
import { buildStudentProfileReport, STUDENT_PROFILES_TITLE } from './studentProfiles.js';
import { buildStatusReport, STATUS_REPORT_TITLE } from './statusReport.js';
import { buildAttendanceMail } from './attendance.js';
import { buildDevTeamReminder, buildModuleDigest, MODULE_DIGEST_TITLE } from './devTeam.js';
import type { OwnerKey } from './context.js';
import { niceDate, parseDateKey, parseDateList } from '../lib/dates.js';
import { DASH } from '../lib/text.js';

export interface ReportDef {
  key: ReportKey;
  title: string;
  batch: 'morning' | 'evening';
  ownerKey: OwnerKey;
  /** App page holding the data this report is built from. */
  page: string;
  /** Human description of when the report goes out, derived from the settings. */
  when: (cfg: Config) => string;
  build: (ctx: BuildCtx) => Promise<BuildResult>;
}

const workingDays = (cfg: Config) => (cfg.skipDays.trim() || cfg.holidays.trim() ? 'Every working day' : 'Every day');

function coursePlanWhen(cfg: Config): string {
  const start = parseDateKey(cfg.coursePlanStart), end = parseDateKey(cfg.coursePlanEnd);
  const period = start && end ? `${niceDate(start)} ${DASH} ${niceDate(end)}` : start ? `from ${niceDate(start)}` : end ? `until ${niceDate(end)}` : '';
  const days = cfg.coursePlanEveryDay ? 'Every day' + (period ? ' ' + period : '') + ' (skip days too)' : `${workingDays(cfg)}${period ? ' ' + period : ''}`;
  return `${days}; "nil pending" when empty`;
}
function attendanceWhen(cfg: Config): string {
  const notice = parseDateKey(cfg.attendanceNoticeDate);
  const reminders = parseDateList(cfg.attendanceReminderDates);
  const close = parseDateKey(cfg.attendanceCloseDate);
  if (!notice && !reminders.length && !close) return 'No dates configured (Settings → Schedule)';
  const parts = [notice && `notice ${niceDate(notice)}`, reminders.length && `reminders ${reminders.map(niceDate).join(', ')}`, close && `closes ${niceDate(close)}`].filter(Boolean);
  return parts.join('; ').replace(/^./, (c) => c.toUpperCase());
}

export const REPORTS: ReportDef[] = [
  { key: 'COURSE_PLANS', title: COURSE_PLANS_TITLE, batch: 'morning', ownerKey: 'CoursePlans', page: '/course-plans', when: coursePlanWhen, build: buildCoursePlanReport },
  { key: 'STUDENT_PROFILES', title: STUDENT_PROFILES_TITLE, batch: 'morning', ownerKey: 'StudentProfiles', page: '/student-profiles', when: (cfg) => `${workingDays(cfg)}, morning`, build: buildStudentProfileReport },
  { key: 'STATUS_REPORT', title: STATUS_REPORT_TITLE, batch: 'morning', ownerKey: 'StatusReport', page: '/queries', when: (cfg) => `${workingDays(cfg)}, morning`, build: buildStatusReport },
  { key: 'ATTENDANCE', title: 'Attendance Correction Window notice / reminders', batch: 'morning', ownerKey: 'Attendance', page: '/faculty', when: attendanceWhen, build: buildAttendanceMail },
  { key: 'DEV_TEAM_REMINDER', title: 'Dev-team reminder: log module & testing status', batch: 'morning', ownerKey: 'StatusReport', page: '/tracker', when: (cfg) => `${workingDays(cfg)}, morning`, build: buildDevTeamReminder },
  { key: 'MODULE_DIGEST', title: MODULE_DIGEST_TITLE, batch: 'evening', ownerKey: 'StatusReport', page: '/tracker', when: (cfg) => `${workingDays(cfg)}, evening`, build: buildModuleDigest },
];

export const MORNING_KEYS = REPORTS.filter((r) => r.batch === 'morning').map((r) => r.key);
export const EVENING_KEYS = REPORTS.filter((r) => r.batch === 'evening').map((r) => r.key);
export const ALL_KEYS = REPORTS.map((r) => r.key);
export function reportDef(key: string): ReportDef | undefined { return REPORTS.find((r) => r.key === key); }
