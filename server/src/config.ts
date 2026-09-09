import { z } from 'zod';
import { emails } from './lib/text.js';

/**
 * Application settings, stored as one Firestore document (`settings/config`) and edited in the app.
 * Nothing organisation-specific lives in the code: every person, address, date and ID comes from here.
 * Text lists keep the "Name <email>, Name <email>" convention so a single input can hold each value.
 */
export const ConfigSchema = z.object({
  dryRun: z.boolean().default(true),
  adminEmail: z.string().default(''),
  orgName: z.string().default(''),

  // Recipients are roles, not people. Per-report "To" lists override the default rule when filled.
  principalEmail: z.string().default(''),
  hodEmail: z.string().default(''),
  coordinatorEmail: z.string().default(''),
  ccAll: z.string().default(''),
  facultyEmails: z.string().default(''),
  coursePlansTo: z.string().default(''),
  studentProfilesTo: z.string().default(''),
  statusReportTo: z.string().default(''),
  moduleDigestTo: z.string().default(''),

  ownerCoursePlans: z.string().default(''),
  backupCoursePlans: z.string().default(''),
  ownerStudentProfiles: z.string().default(''),
  backupStudentProfiles: z.string().default(''),
  ownerAttendance: z.string().default(''),
  backupAttendance: z.string().default(''),
  ownerStatusReport: z.string().default(''),
  backupStatusReport: z.string().default(''),

  devTeam: z.string().default(''),
  moduleStatusDeadline: z.string().default('5:00 PM'),

  coursePlanStart: z.string().default(''),
  coursePlanEnd: z.string().default(''),
  coursePlanEveryDay: z.boolean().default(true),
  attendanceNoticeDate: z.string().default(''),
  attendanceReminderDates: z.string().default(''),
  attendanceCloseDate: z.string().default(''),
  skipDays: z.string().default('Sunday'),
  holidays: z.string().default(''),
  queryLookbackDays: z.number().int().min(1).max(30).default(1),

  sheetId: z.string().default(''),
  trackerTab: z.string().default('Assignments'),
  tabCoursePlans: z.string().default('Course Plans'),
  tabStudentProfiles: z.string().default('Student Profiles'),
  tabQueries: z.string().default('Queries'),
  tabFaculty: z.string().default('Faculty'),

  mailTransport: z.enum(['log', 'smtp', 'gmail']).default('log'),
  mailFrom: z.string().default(''),
  smtpHost: z.string().default('smtp.gmail.com'),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpUser: z.string().default(''),
  smtpPassword: z.string().default(''),

  admins: z.string().default(''),
  members: z.string().default(''),
  appUrl: z.string().default(''),
});
export type Config = z.infer<typeof ConfigSchema>;

export const CONFIG_DEFAULTS: Config = ConfigSchema.parse({});

/** Settings that must never leave the server (the API returns them blank). */
export const CONFIG_SECRET_KEYS: Array<keyof Config> = ['smtpPassword'];

/** Older documents used person-specific keys; carry their values over to the role-based ones. */
const RENAMED_KEYS: Record<string, keyof Config> = { ashHodEmail: 'hodEmail', manishankarEmail: 'coordinatorEmail', gnanaKingEmail: 'ccAll' };

/** Merge a stored (possibly partial or stale) document with the defaults. Unknown keys are dropped. */
export function normalizeConfig(raw: unknown): Config {
  const obj = (raw && typeof raw === 'object') ? { ...(raw as Record<string, unknown>) } : {};
  for (const [oldKey, newKey] of Object.entries(RENAMED_KEYS)) {
    if (oldKey in obj && (obj[newKey] === undefined || obj[newKey] === '')) obj[newKey] = obj[oldKey];
    delete obj[oldKey];
  }
  const r = ConfigSchema.safeParse(obj);
  if (r.success) return r.data;
  // Fall back field by field so one bad value does not wipe the rest.
  const out: Record<string, unknown> = { ...CONFIG_DEFAULTS };
  for (const [k, v] of Object.entries(obj)) {
    const shape = (ConfigSchema.shape as Record<string, z.ZodTypeAny>)[k];
    if (!shape) continue;
    const one = shape.safeParse(v);
    if (one.success) out[k] = one.data;
  }
  return out as Config;
}

/** Who receives the dry-run copies and the admin alerts: the admin address, else the first admin. */
export function adminAddresses(cfg: Config): string[] {
  const direct = emails(cfg.adminEmail);
  return direct.length ? direct : emails(cfg.admins).slice(0, 1);
}

export type FieldType = 'boolean' | 'number' | 'select' | 'textarea' | 'password';
export interface ConfigField { key: keyof Config; label: string; help?: string; group: string; type?: FieldType; options?: string[] }

/** Human labels + help used by the settings screen and by health messages. */
export const CONFIG_FIELDS: ConfigField[] = [
  { key: 'dryRun', label: 'Dry run', help: 'On = every mail goes ONLY to the admin address, with the real recipients shown at the top. Switch off to go live.', group: 'Mode', type: 'boolean' },
  { key: 'adminEmail', label: 'Admin e-mail', help: 'Receives dry-run copies, error alerts and configuration warnings. Blank = the first address under Access → Admins.', group: 'Mode' },
  { key: 'orgName', label: 'Organisation name', help: 'Shown in the mail header.', group: 'Mode' },

  { key: 'principalEmail', label: 'Principal', help: 'To on the course-plan, student-profile, status and digest mails; CC on the attendance notice.', group: 'Recipients' },
  { key: 'hodEmail', label: 'Head of Department', help: 'To on the course-plan and student-profile reports; CC on the attendance notice.', group: 'Recipients' },
  { key: 'coordinatorEmail', label: 'Coordinator', help: 'To on the status report and the evening digest; CC on every other mail.', group: 'Recipients' },
  { key: 'ccAll', label: 'Always CC', help: 'People copied on every report. Name <email>, …', group: 'Recipients', type: 'textarea' },
  { key: 'facultyEmails', label: 'All-faculty address', help: 'Google Group address or comma-separated list for the attendance notice. Leave blank to use the Faculty list in this app.', group: 'Recipients', type: 'textarea' },
  { key: 'coursePlansTo', label: 'Course-plan report – To', help: 'Blank = Principal + Head of Department.', group: 'Recipients' },
  { key: 'studentProfilesTo', label: 'Student-profile report – To', help: 'Blank = Principal + Head of Department.', group: 'Recipients' },
  { key: 'statusReportTo', label: 'Status & query report – To', help: 'Blank = Coordinator + Principal.', group: 'Recipients' },
  { key: 'moduleDigestTo', label: 'Evening digest – To', help: 'Blank = Coordinator + Principal.', group: 'Recipients' },

  { key: 'ownerCoursePlans', label: 'Owner – Course plans', help: 'Format: Name <email>. The owner is CC\'d and receives replies.', group: 'Owners' },
  { key: 'backupCoursePlans', label: 'Backup – Course plans', help: 'Also CC\'d, so the report never depends on one person.', group: 'Owners' },
  { key: 'ownerStudentProfiles', label: 'Owner – Student profiles', group: 'Owners' },
  { key: 'backupStudentProfiles', label: 'Backup – Student profiles', group: 'Owners' },
  { key: 'ownerAttendance', label: 'Owner – Attendance window', group: 'Owners' },
  { key: 'backupAttendance', label: 'Backup – Attendance window', group: 'Owners' },
  { key: 'ownerStatusReport', label: 'Owner – Status & query report', help: 'Also owns the dev-team reminder and the evening digest.', group: 'Owners' },
  { key: 'backupStatusReport', label: 'Backup – Status & query report', group: 'Owners' },

  { key: 'devTeam', label: 'Development team', help: 'People who must log module completion / testing status every day. Name <email>, …', group: 'Dev team', type: 'textarea' },
  { key: 'moduleStatusDeadline', label: 'Status deadline shown in the reminder', group: 'Dev team' },

  { key: 'coursePlanStart', label: 'Course-plan report – first day', help: 'Blank = no start limit.', group: 'Schedule' },
  { key: 'coursePlanEnd', label: 'Course-plan report – last day (inclusive)', help: 'Blank = no end.', group: 'Schedule' },
  { key: 'coursePlanEveryDay', label: 'Course-plan report also on skip days / holidays', help: '"Daily without a break".', group: 'Schedule', type: 'boolean' },
  { key: 'attendanceNoticeDate', label: 'Attendance notice date', help: 'Blank = no attendance mails.', group: 'Schedule' },
  { key: 'attendanceReminderDates', label: 'Attendance reminder dates', help: 'Comma-separated. The last one (or the close date) is the FINAL reminder.', group: 'Schedule' },
  { key: 'attendanceCloseDate', label: 'Attendance window closes on', group: 'Schedule' },
  { key: 'skipDays', label: 'Skip weekdays', help: 'e.g. "Saturday, Sunday". Blank = every day.', group: 'Schedule' },
  { key: 'holidays', label: 'Holidays', help: 'Comma-separated dates (yyyy-mm-dd) with no reports.', group: 'Schedule', type: 'textarea' },
  { key: 'queryLookbackDays', label: 'Query look-back (days)', help: 'The status report covers queries received / closed in the last N days plus everything still open.', group: 'Schedule', type: 'number' },

  { key: 'sheetId', label: 'Tracking spreadsheet ID', help: 'The long ID in the sheet URL (…/spreadsheets/d/<ID>/edit). Share the sheet (Viewer) with the service account shown above.', group: 'Google Sheet' },
  { key: 'trackerTab', label: 'Tracker tab', help: 'Tab holding the task list (Services, Task, Faculty Assigned, Status, Start date, Due on, Finished date …).', group: 'Google Sheet' },
  { key: 'tabCoursePlans', label: 'Import tab – Course plans', group: 'Google Sheet' },
  { key: 'tabStudentProfiles', label: 'Import tab – Student profiles', group: 'Google Sheet' },
  { key: 'tabQueries', label: 'Import tab – Queries', group: 'Google Sheet' },
  { key: 'tabFaculty', label: 'Import tab – Faculty', group: 'Google Sheet' },

  { key: 'mailTransport', label: 'Mail transport', help: 'log = do not send (mails only recorded in the log); smtp = Gmail / any SMTP server with a password; gmail = Gmail API via domain-wide delegation.', group: 'Mail', type: 'select', options: ['log', 'smtp', 'gmail'] },
  { key: 'mailFrom', label: 'Send from', help: 'The mailbox the mails are sent from (a Google Workspace account for Gmail).', group: 'Mail' },
  { key: 'smtpHost', label: 'SMTP server', help: 'smtp.gmail.com for Google Workspace / Gmail.', group: 'Mail' },
  { key: 'smtpPort', label: 'SMTP port', help: '465 (SSL) or 587 (STARTTLS).', group: 'Mail', type: 'number' },
  { key: 'smtpUser', label: 'SMTP user', help: 'Blank = the "Send from" address.', group: 'Mail' },
  { key: 'smtpPassword', label: 'SMTP password / app password', help: 'Stored encrypted at rest in the app\'s database and never shown again. Leave blank to keep the stored one.', group: 'Mail', type: 'password' },

  { key: 'admins', label: 'Admins', help: 'Comma-separated e-mails allowed to change settings, run reports and delete log entries. Blank = everyone who can open the app is an admin.', group: 'Access', type: 'textarea' },
  { key: 'members', label: 'Members', help: 'If filled, only these e-mails (plus admins) can use the app. Blank = everyone who can reach it.', group: 'Access', type: 'textarea' },
  { key: 'appUrl', label: 'App URL', help: 'Linked from the mails. Filled automatically on deploy.', group: 'Access' },
];

/** When the scheduled batches run (display only; the real triggers are Cloud Scheduler jobs set by infra/deploy.sh). */
export interface Schedule { morning: string; retry: string; evening: string; timeZone: string }

/** Runtime environment (Cloud Run env vars). */
export interface Env {
  port: number;
  projectId: string;
  region: string;
  firestoreDatabase: string;
  authMode: 'iap' | 'header' | 'dev';
  devUserEmail: string;
  iapAudience: string;
  appUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  webDist: string;
  nodeEnv: string;
  schedule: Schedule;
}

export function readEnv(e: NodeJS.ProcessEnv = process.env): Env {
  const [morning = '', retry = '', evening = ''] = (e.SCHEDULE || '').split(/[;,\s]+/).map((s) => s.trim());
  return {
    port: Number(e.PORT || 8080),
    projectId: e.GOOGLE_CLOUD_PROJECT || e.PROJECT_ID || '',
    region: e.REGION || '',
    firestoreDatabase: e.FIRESTORE_DATABASE || '(default)',
    authMode: (e.AUTH_MODE as Env['authMode']) || (e.K_SERVICE ? 'iap' : 'dev'),
    devUserEmail: e.DEV_USER_EMAIL || 'dev@localhost',
    iapAudience: e.IAP_AUDIENCE || '',
    appUrl: e.APP_URL || '',
    smtpHost: e.SMTP_HOST || '',
    smtpPort: Number(e.SMTP_PORT || 0),
    smtpUser: e.SMTP_USER || '',
    smtpPass: e.SMTP_PASS || '',
    webDist: e.WEB_DIST || '',
    nodeEnv: e.NODE_ENV || 'development',
    schedule: { morning, retry, evening, timeZone: e.SCHEDULE_TZ || 'Asia/Kolkata' },
  };
}
