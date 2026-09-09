import type { BuildCtx } from './context.js';
import type { BuildResult, ReportKey } from '../types.js';
import { buildCoursePlanReport, COURSE_PLANS_TITLE } from './coursePlans.js';
import { buildStudentProfileReport, STUDENT_PROFILES_TITLE } from './studentProfiles.js';
import { buildStatusReport, STATUS_REPORT_TITLE } from './statusReport.js';
import { buildAttendanceMail } from './attendance.js';
import { buildDevTeamReminder, buildModuleDigest, MODULE_DIGEST_TITLE } from './devTeam.js';
import type { OwnerKey } from './context.js';

export interface ReportDef {
  key: ReportKey;
  title: string;
  batch: 'morning' | 'evening';
  ownerKey: OwnerKey;
  /** App page holding the data this report is built from. */
  page: string;
  when: string;
  build: (ctx: BuildCtx) => Promise<BuildResult>;
}

export const REPORTS: ReportDef[] = [
  { key: 'COURSE_PLANS', title: COURSE_PLANS_TITLE, batch: 'morning', ownerKey: 'CoursePlans', page: '/course-plans', when: 'Every day 08–18 Sep (Sundays too); "nil pending" when empty', build: buildCoursePlanReport },
  { key: 'STUDENT_PROFILES', title: STUDENT_PROFILES_TITLE, batch: 'morning', ownerKey: 'StudentProfiles', page: '/student-profiles', when: 'Every working day, morning', build: buildStudentProfileReport },
  { key: 'STATUS_REPORT', title: STATUS_REPORT_TITLE, batch: 'morning', ownerKey: 'StatusReport', page: '/queries', when: 'Every working day before 10:00', build: buildStatusReport },
  { key: 'ATTENDANCE', title: 'Attendance Correction Window notice / reminders', batch: 'morning', ownerKey: 'Attendance', page: '/faculty', when: 'Notice on 08 Sep, reminders 14 & 15 Sep', build: buildAttendanceMail },
  { key: 'DEV_TEAM_REMINDER', title: 'Dev-team reminder: log module & testing status', batch: 'morning', ownerKey: 'StatusReport', page: '/tracker', when: 'Every working day, morning', build: buildDevTeamReminder },
  { key: 'MODULE_DIGEST', title: MODULE_DIGEST_TITLE, batch: 'evening', ownerKey: 'StatusReport', page: '/tracker', when: 'Every working day at 17:30', build: buildModuleDigest },
];

export const MORNING_KEYS = REPORTS.filter((r) => r.batch === 'morning').map((r) => r.key);
export const EVENING_KEYS = REPORTS.filter((r) => r.batch === 'evening').map((r) => r.key);
export const ALL_KEYS = REPORTS.map((r) => r.key);
export function reportDef(key: string): ReportDef | undefined { return REPORTS.find((r) => r.key === key); }
