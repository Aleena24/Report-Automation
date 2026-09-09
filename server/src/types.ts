/** Shared data types for the Daily Reports server. Dates are IST calendar keys `yyyy-mm-dd`. */

export interface CoursePlan {
  id: string;
  courseCode: string;
  courseName: string;
  faculty: string;
  department: string;
  semester: string;
  submittedOn: string;
  status: string;      // blank / Pending / Submitted / Awaiting approval … = pending; Approved / Rejected / Withdrawn = not pending
  approvedOn: string;
  remarks: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface StudentProfile {
  id: string;
  department: string;
  batch: string;
  studentName: string;   // blank for a "group count" row
  admissionNo: string;
  created: boolean;      // profile created (Yes/No)
  count: number;         // >0 only for group-count rows (no student name)
  responsibleFaculty: string;
  remarks: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface QueryItem {
  id: string;
  receivedOn: string;
  source: string;        // Email | Celerscet | other
  raisedBy: string;
  query: string;
  status: string;        // Open | Closed
  closedOn: string;
  closureRemarks: string;
  handledBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface Faculty {
  id: string;
  name: string;
  email: string;
  department: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** A normalised row of the dev team's "Assignments" tracker (read from Google Sheets). */
export interface Task {
  task: string;
  service: string;
  type: string;
  person: string;
  status: string;
  start: string;
  due: string;
  finished: string;
  remarks: string;
  active: boolean;
  done: boolean;
}

export type MailStatus = 'SENT' | 'DRY_RUN' | 'PREVIEW' | 'SKIPPED' | 'FAILED';

export interface MailLogEntry {
  id: string;
  timestamp: string;   // ISO instant
  date: string;        // IST date key the mail belongs to
  report: string;      // e.g. COURSE_PLANS, ATTENDANCE:NOTICE, ADMIN_ALERT
  status: MailStatus;
  to: string[];
  cc: string[];
  subject: string;
  details: string;
  by: string;          // who triggered it (scheduler / user e-mail)
  html?: string;       // stored so the app can show exactly what went out
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  mode: string;        // morning | evening | preview | single
  trigger: string;     // scheduler | user:<email> | cli
  results: string[];
  problems: string[];
}

export type ReportKey = 'COURSE_PLANS' | 'STUDENT_PROFILES' | 'STATUS_REPORT' | 'ATTENDANCE' | 'DEV_TEAM_REMINDER' | 'MODULE_DIGEST';

export interface BuiltMail {
  variant?: string;
  to: string[];
  cc: string[];
  replyTo: string;
  senderName: string;
  subject: string;
  html: string;
  details: string;
}
export interface Skipped { skip: string; log?: boolean }
export type BuildResult = BuiltMail | Skipped;
export function isSkipped(r: BuildResult): r is Skipped { return (r as Skipped).skip !== undefined; }
