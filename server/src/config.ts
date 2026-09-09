import { z } from 'zod';

/**
 * Application settings, stored as one Firestore document (`settings/config`) and edited in the app.
 * Text lists keep the "Name <email>, Name <email>" convention so a single input can hold each value.
 */
export const ConfigSchema = z.object({
  dryRun: z.boolean().default(true),
  adminEmail: z.string().default('aleenavarghese@sahrdaya.ac.in'),
  orgName: z.string().default('Sahrdaya College of Engineering & Technology'),

  principalEmail: z.string().default(''),
  ashHodEmail: z.string().default(''),
  manishankarEmail: z.string().default(''),
  gnanaKingEmail: z.string().default(''),
  facultyEmails: z.string().default(''),

  ownerCoursePlans: z.string().default('George <>'),
  backupCoursePlans: z.string().default(''),
  ownerStudentProfiles: z.string().default('Aleena <aleenavarghese@sahrdaya.ac.in>'),
  backupStudentProfiles: z.string().default(''),
  ownerAttendance: z.string().default('Ashwin <>'),
  backupAttendance: z.string().default(''),
  ownerStatusReport: z.string().default('Livya <>'),
  backupStatusReport: z.string().default(''),

  devTeam: z.string().default('Anusree <>, Anugraha <>, Nicy <>, Joshua <>'),
  moduleDigestTo: z.string().default(''),
  moduleStatusDeadline: z.string().default('5:00 PM'),

  coursePlanStart: z.string().default('2026-09-08'),
  coursePlanEnd: z.string().default('2026-09-18'),
  coursePlanEveryDay: z.boolean().default(true),
  attendanceNoticeDate: z.string().default('2026-09-08'),
  attendanceReminderDates: z.string().default('2026-09-14, 2026-09-15'),
  attendanceCloseDate: z.string().default('2026-09-15'),
  skipDays: z.string().default('Sunday'),
  holidays: z.string().default(''),
  queryLookbackDays: z.number().int().min(1).max(30).default(1),

  sheetId: z.string().default('12u73XSWp1M2uYDYAtKmzJQLeD4gdIVIl9pgrSToKwQc'),
  trackerTab: z.string().default('Assignments'),
  tabCoursePlans: z.string().default('Course Plans'),
  tabStudentProfiles: z.string().default('Student Profiles'),
  tabQueries: z.string().default('Queries'),
  tabFaculty: z.string().default('Faculty'),

  mailTransport: z.enum(['log', 'smtp', 'gmail']).default('log'),
  mailFrom: z.string().default('automation@sahrdaya.ac.in'),

  admins: z.string().default('aleenavarghese@sahrdaya.ac.in'),
  members: z.string().default(''),
  appUrl: z.string().default(''),
});
export type Config = z.infer<typeof ConfigSchema>;

export const CONFIG_DEFAULTS: Config = ConfigSchema.parse({});

/** Merge a stored (possibly partial or stale) document with the defaults. Unknown keys are dropped. */
export function normalizeConfig(raw: unknown): Config {
  const obj = (raw && typeof raw === 'object') ? { ...(raw as Record<string, unknown>) } : {};
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

/** Human labels + help used by the settings screen and by health messages. */
export const CONFIG_FIELDS: Array<{ key: keyof Config; label: string; help?: string; group: string; type?: 'boolean' | 'number' | 'select' | 'textarea'; options?: string[] }> = [
  { key: 'dryRun', label: 'Dry run', help: 'On = every mail goes ONLY to the admin address, with the real recipients shown at the top. Switch off to go live.', group: 'Mode', type: 'boolean' },
  { key: 'adminEmail', label: 'Admin e-mail', help: 'Receives dry-run copies, error alerts and configuration warnings.', group: 'Mode' },
  { key: 'orgName', label: 'Organisation name', help: 'Shown in the mail header.', group: 'Mode' },

  { key: 'principalEmail', label: 'Principal', group: 'Recipients' },
  { key: 'ashHodEmail', label: 'ASH HoD', group: 'Recipients' },
  { key: 'manishankarEmail', label: 'Dr. Manishankar S', help: 'CC on every mail.', group: 'Recipients' },
  { key: 'gnanaKingEmail', label: 'Dr. G R Gnana King', help: 'CC on every mail.', group: 'Recipients' },
  { key: 'facultyEmails', label: 'All-faculty address', help: 'Google Group address or comma-separated list for the attendance notice. Leave blank to use the Faculty list in this app.', group: 'Recipients', type: 'textarea' },

  { key: 'ownerCoursePlans', label: 'Owner – Course plans', help: 'Format: Name <email>. The owner is CC\'d and receives replies.', group: 'Owners' },
  { key: 'backupCoursePlans', label: 'Backup – Course plans', help: 'Also CC\'d, so the report never depends on one person.', group: 'Owners' },
  { key: 'ownerStudentProfiles', label: 'Owner – Student profiles', group: 'Owners' },
  { key: 'backupStudentProfiles', label: 'Backup – Student profiles', group: 'Owners' },
  { key: 'ownerAttendance', label: 'Owner – Attendance window', group: 'Owners' },
  { key: 'backupAttendance', label: 'Backup – Attendance window', group: 'Owners' },
  { key: 'ownerStatusReport', label: 'Owner – Status & query report', group: 'Owners' },
  { key: 'backupStatusReport', label: 'Backup – Status & query report', group: 'Owners' },

  { key: 'devTeam', label: 'Development team', help: 'People who must log module completion / testing status every day. Name <email>, …', group: 'Dev team', type: 'textarea' },
  { key: 'moduleDigestTo', label: 'Evening digest goes to', help: 'Blank = Dr. Manishankar + Principal.', group: 'Dev team' },
  { key: 'moduleStatusDeadline', label: 'Status deadline shown in the reminder', group: 'Dev team' },

  { key: 'coursePlanStart', label: 'Course-plan report – first day', group: 'Schedule' },
  { key: 'coursePlanEnd', label: 'Course-plan report – last day (inclusive)', group: 'Schedule' },
  { key: 'coursePlanEveryDay', label: 'Course-plan report also on Sundays / holidays', help: '"Daily without a break".', group: 'Schedule', type: 'boolean' },
  { key: 'attendanceNoticeDate', label: 'Attendance notice date', group: 'Schedule' },
  { key: 'attendanceReminderDates', label: 'Attendance reminder dates', help: 'Comma-separated. The last one (or the close date) is the FINAL reminder.', group: 'Schedule' },
  { key: 'attendanceCloseDate', label: 'Attendance window closes on', group: 'Schedule' },
  { key: 'skipDays', label: 'Skip weekdays', help: 'e.g. "Saturday, Sunday". Blank = every day.', group: 'Schedule' },
  { key: 'holidays', label: 'Holidays', help: 'Comma-separated dates (yyyy-mm-dd) with no reports.', group: 'Schedule', type: 'textarea' },
  { key: 'queryLookbackDays', label: 'Query look-back (days)', help: 'The status report covers queries received / closed in the last N days plus everything still open.', group: 'Schedule', type: 'number' },

  { key: 'sheetId', label: 'Tracking spreadsheet ID', help: 'The dev team\'s Project Task tracker. Share it (Viewer) with the service account shown below.', group: 'Google Sheet' },
  { key: 'trackerTab', label: 'Tracker tab', help: 'Tab holding the Assignments (Services, Task, Faculty Assigned, Status, Start date, Due on, Finished date …).', group: 'Google Sheet' },
  { key: 'tabCoursePlans', label: 'Import tab – Course plans', group: 'Google Sheet' },
  { key: 'tabStudentProfiles', label: 'Import tab – Student profiles', group: 'Google Sheet' },
  { key: 'tabQueries', label: 'Import tab – Queries', group: 'Google Sheet' },
  { key: 'tabFaculty', label: 'Import tab – Faculty', group: 'Google Sheet' },

  { key: 'mailTransport', label: 'Mail transport', help: 'log = do not send (mails only recorded in the log); smtp = Gmail SMTP with an app password; gmail = Gmail API via domain-wide delegation.', group: 'Mail', type: 'select', options: ['log', 'smtp', 'gmail'] },
  { key: 'mailFrom', label: 'Send from', help: 'The Google Workspace account the mails are sent from.', group: 'Mail' },

  { key: 'admins', label: 'Admins', help: 'Comma-separated e-mails allowed to change settings, run reports and delete log entries.', group: 'Access', type: 'textarea' },
  { key: 'members', label: 'Members', help: 'If filled, only these e-mails (plus admins) can use the app. Blank = everyone who can reach it.', group: 'Access', type: 'textarea' },
  { key: 'appUrl', label: 'App URL', help: 'Linked from the mails. Filled automatically on deploy.', group: 'Access' },
];

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
}

export function readEnv(e: NodeJS.ProcessEnv = process.env): Env {
  return {
    port: Number(e.PORT || 8080),
    projectId: e.GOOGLE_CLOUD_PROJECT || e.PROJECT_ID || '',
    region: e.REGION || 'europe-west1',
    firestoreDatabase: e.FIRESTORE_DATABASE || 'daily-reports',
    authMode: (e.AUTH_MODE as Env['authMode']) || (e.K_SERVICE ? 'iap' : 'dev'),
    devUserEmail: e.DEV_USER_EMAIL || 'aleenavarghese@sahrdaya.ac.in',
    iapAudience: e.IAP_AUDIENCE || '',
    appUrl: e.APP_URL || '',
    smtpHost: e.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(e.SMTP_PORT || 465),
    smtpUser: e.SMTP_USER || '',
    smtpPass: e.SMTP_PASS || '',
    webDist: e.WEB_DIST || '',
    nodeEnv: e.NODE_ENV || 'development',
  };
}
