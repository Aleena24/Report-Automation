import type { Config } from '../src/config.js';
import { CONFIG_DEFAULTS } from '../src/config.js';
import { MemoryStore } from '../src/store.js';
import { FakeSheetReader } from '../src/sheets.js';
import { LogMailer } from '../src/mailer.js';
import type { Deps } from '../src/engine.js';
import { SAMPLE_TRACKER } from '../src/lib/sample.js';
import type { CoursePlan, Faculty, QueryItem, StudentProfile } from '../src/types.js';

/** A complete, made-up configuration – everything a real deployment enters in Settings. */
export const LIVE_CONFIG: Partial<Config> = {
  dryRun: false,
  adminEmail: 'admin@example.edu',
  orgName: 'Example College',
  principalEmail: 'principal@example.edu',
  hodEmail: 'hod@example.edu',
  coordinatorEmail: 'coordinator@example.edu',
  ccAll: 'Dean <dean@example.edu>',
  ownerCoursePlans: 'Gopal <gopal@example.edu>',
  backupCoursePlans: 'Asha <asha@example.edu>',
  ownerStudentProfiles: 'Asha <asha@example.edu>',
  ownerAttendance: 'Arjun <arjun@example.edu>',
  ownerStatusReport: 'Lekha <lekha@example.edu>',
  devTeam: 'Priya <priya@example.edu>, Anand <anand@example.edu>, Nila <nila@example.edu>, Jomon <jomon@example.edu>',
  coursePlanStart: '2026-09-08',
  coursePlanEnd: '2026-09-18',
  attendanceNoticeDate: '2026-09-08',
  attendanceReminderDates: '2026-09-14, 2026-09-15',
  attendanceCloseDate: '2026-09-15',
  sheetId: 'test-sheet-id',
  mailTransport: 'smtp',
  mailFrom: 'reports@example.edu',
  smtpPassword: 'x',
  admins: 'admin@example.edu',
  appUrl: 'https://daily-reports.example.run.app',
};

export const COURSE_PLANS: Array<Omit<CoursePlan, 'id'>> = [
  { courseCode: 'CS301', courseName: 'Data Structures', faculty: 'Dr. Anitha R', department: 'CSE', semester: 'S3', submittedOn: '2026-08-28', status: 'Pending', approvedOn: '', remarks: '' },
  { courseCode: 'EC305', courseName: 'Signals & Systems', faculty: 'Mr. Rahul K', department: 'ECE', semester: 'S3', submittedOn: '2026-09-05', status: 'Submitted', approvedOn: '', remarks: '' },
  { courseCode: 'ME401', courseName: 'Thermodynamics', faculty: 'Ms. Divya P', department: 'ME', semester: 'S5', submittedOn: '2026-09-01', status: '', approvedOn: '', remarks: 'blank status = pending' },
  { courseCode: 'CS303', courseName: 'Operating Systems', faculty: 'Dr. Suresh M', department: 'CSE', semester: 'S3', submittedOn: '2026-08-25', status: 'Approved', approvedOn: '2026-09-02', remarks: '' },
  { courseCode: 'CE201', courseName: 'Surveying', faculty: 'Mr. Joseph T', department: 'CE', semester: 'S3', submittedOn: '2026-09-01', status: 'Rejected', approvedOn: '', remarks: 'resubmit' },
  { courseCode: 'MA201', courseName: 'Linear Algebra', faculty: 'Dr. Meera S', department: 'ASH', semester: 'S3', submittedOn: '2026-09-07', status: 'Awaiting approval', approvedOn: '', remarks: '' },
];

export const STUDENT_PROFILES: Array<Omit<StudentProfile, 'id'>> = [
  { department: 'CSE', batch: '2026-30', studentName: 'Arun V', admissionNo: 'EX26CS001', created: true, count: 0, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'CSE', batch: '2026-30', studentName: 'Bindu K', admissionNo: 'EX26CS002', created: false, count: 0, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'CSE', batch: '2026-30', studentName: 'Cyril J', admissionNo: 'EX26CS003', created: false, count: 0, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'ECE', batch: '2026-30', studentName: 'Deepa S', admissionNo: 'EX26EC001', created: false, count: 0, responsibleFaculty: 'Mr. Vinod', remarks: '' },
  { department: 'ECE', batch: '2025-29', studentName: 'Elsa M', admissionNo: 'EX25EC010', created: true, count: 0, responsibleFaculty: 'Mr. Vinod', remarks: '' },
  { department: 'ME', batch: '2026-30', studentName: 'Faisal A', admissionNo: 'EX26ME001', created: false, count: 0, responsibleFaculty: 'Dr. Thomas', remarks: '' },
  { department: 'M.Tech CSE', batch: '2026-28', studentName: 'Gita R', admissionNo: 'EX26MT001', created: false, count: 0, responsibleFaculty: 'Dr. Kumar', remarks: '' },
];

export const STUDENT_PROFILES_GROUPS: Array<Omit<StudentProfile, 'id'>> = [
  { department: 'CSE', batch: '2026-30', studentName: '', admissionNo: '', created: false, count: 12, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'ECE', batch: '2026-30', studentName: '', admissionNo: '', created: false, count: 0, responsibleFaculty: 'Mr. Vinod', remarks: '' },
  { department: 'ME', batch: '2026-30', studentName: '', admissionNo: '', created: false, count: 3, responsibleFaculty: 'Dr. Thomas', remarks: '' },
];

export const QUERIES: Array<Omit<QueryItem, 'id'>> = [
  { receivedOn: '2026-09-07', source: 'Email', raisedBy: 'Dr. Anitha R', query: 'Cannot upload course plan PDF', status: 'Closed', closedOn: '2026-09-07', closureRemarks: 'File size limit raised to 10 MB', handledBy: 'Priya' },
  { receivedOn: '2026-09-07', source: 'Email', raisedBy: 'Mr. Rahul K', query: 'Attendance page shows wrong batch', status: 'Open', closedOn: '', closureRemarks: '', handledBy: 'Nila' },
  { receivedOn: '2026-09-08', source: 'Celerscet', raisedBy: 'HoD ECE', query: 'Timetable clash in S3', status: 'Closed', closedOn: '2026-09-08', closureRemarks: 'Slot corrected', handledBy: 'ERP support' },
  { receivedOn: '2026-09-06', source: 'Celerscet', raisedBy: 'Exam cell', query: 'Marks entry locked', status: 'Open', closedOn: '', closureRemarks: '', handledBy: 'ERP support' },
  { receivedOn: '2026-09-01', source: 'Email', raisedBy: 'Librarian', query: 'Login issue', status: 'Closed', closedOn: '2026-09-02', closureRemarks: 'Password reset', handledBy: 'Jomon' },
];

export const FACULTY: Array<Omit<Faculty, 'id'>> = [
  { name: 'Dr. Anitha R', email: 'anitha@example.edu', department: 'CSE' },
  { name: 'Mr. Rahul K', email: 'rahul@example.edu', department: 'ECE' },
  { name: 'Ms. Divya P', email: 'divya@example.edu', department: 'ME' },
  { name: 'Duplicate', email: 'ANITHA@example.edu', department: 'CSE' },
  { name: 'No mail', email: '', department: 'CE' },
];

export interface TestEnv { deps: Deps; store: MemoryStore; mailer: LogMailer; sheets: FakeSheetReader; setNow: (iso: string) => void; logs: string[] }

/** `IST('2026-09-08')` → an instant at 09:20 IST that day. */
export const IST = (date: string, time = '09:20:00') => `${date}T${time}+05:30`;

export const TEST_ENV: Deps['env'] = {
  port: 0, projectId: 'test', region: 'test-region', firestoreDatabase: 'x', authMode: 'dev', devUserEmail: 'tester@example.edu', iapAudience: '', appUrl: '',
  smtpHost: '', smtpPort: 0, smtpUser: '', smtpPass: '', webDist: '', nodeEnv: 'test',
  schedule: { morning: '09:00', retry: '09:35', evening: '17:30', timeZone: 'Asia/Kolkata' },
};

export async function createEnv(opts: {
  now: string; config?: Partial<Config>; coursePlans?: typeof COURSE_PLANS; studentProfiles?: typeof STUDENT_PROFILES;
  queries?: typeof QUERIES; faculty?: typeof FACULTY; tracker?: unknown[][]; trackerError?: string; mailFail?: string;
} ): Promise<TestEnv> {
  const store = new MemoryStore();
  await store.saveConfig({ ...CONFIG_DEFAULTS, ...LIVE_CONFIG, ...(opts.config || {}) });
  await store.createMany('coursePlans', opts.coursePlans ?? COURSE_PLANS);
  await store.createMany('studentProfiles', opts.studentProfiles ?? STUDENT_PROFILES);
  await store.createMany('queries', opts.queries ?? QUERIES);
  await store.createMany('faculty', opts.faculty ?? FACULTY);
  const sheets = new FakeSheetReader({ Assignments: opts.tracker ?? SAMPLE_TRACKER }, 'Project Task tracker', opts.trackerError);
  const mailer = new LogMailer(opts.mailFail);
  let now = new Date(opts.now);
  const logs: string[] = [];
  const deps: Deps = { store, sheets, mailerFor: () => mailer, now: () => now, log: (m) => logs.push(m), env: TEST_ENV };
  return { deps, store, mailer, sheets, logs, setNow: (iso) => { now = new Date(iso); } };
}
