import type { Config } from '../src/config.js';
import { CONFIG_DEFAULTS } from '../src/config.js';
import { MemoryStore } from '../src/store.js';
import { FakeSheetReader } from '../src/sheets.js';
import { LogMailer } from '../src/mailer.js';
import type { Deps } from '../src/engine.js';
import { SAMPLE_TRACKER } from '../src/lib/sample.js';
import type { CoursePlan, Faculty, QueryItem, StudentProfile } from '../src/types.js';

export const LIVE_CONFIG: Partial<Config> = {
  dryRun: false,
  adminEmail: 'aleenavarghese@sahrdaya.ac.in',
  principalEmail: 'principal@sahrdaya.ac.in',
  ashHodEmail: 'hod.ash@sahrdaya.ac.in',
  manishankarEmail: 'manishankar@sahrdaya.ac.in',
  gnanaKingEmail: 'gnanaking@sahrdaya.ac.in',
  ownerCoursePlans: 'George <george@sahrdaya.ac.in>',
  backupCoursePlans: 'Aleena <aleenavarghese@sahrdaya.ac.in>',
  ownerStudentProfiles: 'Aleena <aleenavarghese@sahrdaya.ac.in>',
  ownerAttendance: 'Ashwin <ashwin@sahrdaya.ac.in>',
  ownerStatusReport: 'Livya <livya@sahrdaya.ac.in>',
  devTeam: 'Anusree <anusree@sahrdaya.ac.in>, Anugraha <anugraha@sahrdaya.ac.in>, Nicy <nicy@sahrdaya.ac.in>, Joshua <joshua@sahrdaya.ac.in>',
  mailTransport: 'smtp',
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
  { department: 'CSE', batch: '2026-30', studentName: 'Arun V', admissionNo: 'SCET26CS001', created: true, count: 0, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'CSE', batch: '2026-30', studentName: 'Bindu K', admissionNo: 'SCET26CS002', created: false, count: 0, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'CSE', batch: '2026-30', studentName: 'Cyril J', admissionNo: 'SCET26CS003', created: false, count: 0, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'ECE', batch: '2026-30', studentName: 'Deepa S', admissionNo: 'SCET26EC001', created: false, count: 0, responsibleFaculty: 'Mr. Vinod', remarks: '' },
  { department: 'ECE', batch: '2025-29', studentName: 'Elsa M', admissionNo: 'SCET25EC010', created: true, count: 0, responsibleFaculty: 'Mr. Vinod', remarks: '' },
  { department: 'ME', batch: '2026-30', studentName: 'Faisal A', admissionNo: 'SCET26ME001', created: false, count: 0, responsibleFaculty: 'Dr. Thomas', remarks: '' },
  { department: 'M.Tech CSE', batch: '2026-28', studentName: 'Gita R', admissionNo: 'SCET26MT001', created: false, count: 0, responsibleFaculty: 'Dr. Gnana King', remarks: '' },
];

export const STUDENT_PROFILES_GROUPS: Array<Omit<StudentProfile, 'id'>> = [
  { department: 'CSE', batch: '2026-30', studentName: '', admissionNo: '', created: false, count: 12, responsibleFaculty: 'Ms. Reshma', remarks: '' },
  { department: 'ECE', batch: '2026-30', studentName: '', admissionNo: '', created: false, count: 0, responsibleFaculty: 'Mr. Vinod', remarks: '' },
  { department: 'ME', batch: '2026-30', studentName: '', admissionNo: '', created: false, count: 3, responsibleFaculty: 'Dr. Thomas', remarks: '' },
];

export const QUERIES: Array<Omit<QueryItem, 'id'>> = [
  { receivedOn: '2026-09-07', source: 'Email', raisedBy: 'Dr. Anitha R', query: 'Cannot upload course plan PDF', status: 'Closed', closedOn: '2026-09-07', closureRemarks: 'File size limit raised to 10 MB', handledBy: 'Anusree' },
  { receivedOn: '2026-09-07', source: 'Email', raisedBy: 'Mr. Rahul K', query: 'Attendance page shows wrong batch', status: 'Open', closedOn: '', closureRemarks: '', handledBy: 'Nicy' },
  { receivedOn: '2026-09-08', source: 'Celerscet', raisedBy: 'HoD ECE', query: 'Timetable clash in S3', status: 'Closed', closedOn: '2026-09-08', closureRemarks: 'Slot corrected', handledBy: 'Celerscet support' },
  { receivedOn: '2026-09-06', source: 'Celerscet', raisedBy: 'Exam cell', query: 'Marks entry locked', status: 'Open', closedOn: '', closureRemarks: '', handledBy: 'Celerscet support' },
  { receivedOn: '2026-09-01', source: 'Email', raisedBy: 'Librarian', query: 'Login issue', status: 'Closed', closedOn: '2026-09-02', closureRemarks: 'Password reset', handledBy: 'Joshua' },
];

export const FACULTY: Array<Omit<Faculty, 'id'>> = [
  { name: 'Dr. Anitha R', email: 'anitha@sahrdaya.ac.in', department: 'CSE' },
  { name: 'Mr. Rahul K', email: 'rahul@sahrdaya.ac.in', department: 'ECE' },
  { name: 'Ms. Divya P', email: 'divya@sahrdaya.ac.in', department: 'ME' },
  { name: 'Duplicate', email: 'ANITHA@sahrdaya.ac.in', department: 'CSE' },
  { name: 'No mail', email: '', department: 'CE' },
];

export interface TestEnv { deps: Deps; store: MemoryStore; mailer: LogMailer; sheets: FakeSheetReader; setNow: (iso: string) => void; logs: string[] }

/** `IST('2026-09-08')` → an instant at 09:20 IST that day. */
export const IST = (date: string, time = '09:20:00') => `${date}T${time}+05:30`;

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
  const deps: Deps = {
    store, sheets, mailerFor: () => mailer, now: () => now, log: (m) => logs.push(m),
    env: { port: 0, projectId: 'test', region: 'europe-west1', firestoreDatabase: 'x', authMode: 'dev', devUserEmail: 'tester@sahrdaya.ac.in', iapAudience: '', appUrl: '', smtpHost: '', smtpPort: 465, smtpUser: '', smtpPass: 'x', webDist: '', nodeEnv: 'test' },
  };
  return { deps, store, mailer, sheets, logs, setNow: (iso) => { now = new Date(iso); } };
}
