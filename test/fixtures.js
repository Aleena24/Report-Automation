'use strict';
// Sample spreadsheet content for the tests. Dates are given both as strings and Date objects,
// because Google Sheets hands the script Date objects for date-formatted cells.
const D = (y, m, d) => new Date(y, m - 1, d, 0, 0, 0);

const CONFIG = [
  ['Key', 'Value', 'Notes'],
  ['DRY_RUN', 'NO', ''],
  ['ADMIN_EMAIL', 'aleenavarghese@sahrdaya.ac.in', ''],
  ['ORG_NAME', 'Sahrdaya College of Engineering & Technology', ''],
  ['PRINCIPAL_EMAIL', 'principal@sahrdaya.ac.in', ''],
  ['ASH_HOD_EMAIL', 'hod.ash@sahrdaya.ac.in', ''],
  ['MANISHANKAR_EMAIL', 'manishankar@sahrdaya.ac.in', ''],
  ['GNANA_KING_EMAIL', 'gnanaking@sahrdaya.ac.in', ''],
  ['FACULTY_EMAILS', '', ''],
  ['OWNER_COURSE_PLANS', 'George <george@sahrdaya.ac.in>', ''],
  ['BACKUP_COURSE_PLANS', 'Aleena <aleenavarghese@sahrdaya.ac.in>', ''],
  ['OWNER_STUDENT_PROFILES', 'Aleena <aleenavarghese@sahrdaya.ac.in>', ''],
  ['BACKUP_STUDENT_PROFILES', '', ''],
  ['OWNER_ATTENDANCE', 'Ashwin <ashwin@sahrdaya.ac.in>', ''],
  ['BACKUP_ATTENDANCE', '', ''],
  ['OWNER_STATUS_REPORT', 'Livya <livya@sahrdaya.ac.in>', ''],
  ['BACKUP_STATUS_REPORT', '', ''],
  ['DEV_TEAM', 'Anusree <anusree@sahrdaya.ac.in>, Anugraha <anugraha@sahrdaya.ac.in>, Nicy <nicy@sahrdaya.ac.in>, Joshua <joshua@sahrdaya.ac.in>', ''],
  ['MODULE_DIGEST_TO', '', ''],
  ['MODULE_STATUS_DEADLINE', '5:00 PM', ''],
  ['COURSE_PLAN_START', '2026-09-08', ''],
  ['COURSE_PLAN_END', '2026-09-18', ''],
  ['COURSE_PLAN_EVERY_DAY', 'YES', ''],
  ['ATTENDANCE_NOTICE_DATE', '2026-09-08', ''],
  ['ATTENDANCE_REMINDER_DATES', '2026-09-14, 2026-09-15', ''],
  ['ATTENDANCE_CLOSE_DATE', '2026-09-15', ''],
  ['SKIP_DAYS', 'Sunday', ''],
  ['HOLIDAYS', '', ''],
  ['QUERY_LOOKBACK_DAYS', '1', ''],
];

const COURSE_PLANS = [
  ['Course Code', 'Course Name', 'Faculty', 'Department', 'Semester', 'Submitted On', 'Status', 'Approved On', 'Remarks'],
  ['CS301', 'Data Structures', 'Dr. Anitha R', 'CSE', 'S3', D(2026, 8, 28), 'Pending', '', ''],
  ['EC305', 'Signals & Systems', 'Mr. Rahul K', 'ECE', 'S3', '2026-09-05', 'Submitted', '', ''],
  ['ME401', 'Thermodynamics', 'Ms. Divya P', 'ME', 'S5', '01/09/2026', '', '', 'blank status = pending'],
  ['CS303', 'Operating Systems', 'Dr. Suresh M', 'CSE', 'S3', D(2026, 8, 25), 'Approved', D(2026, 9, 2), ''],
  ['CE201', 'Surveying', 'Mr. Joseph T', 'CE', 'S3', D(2026, 9, 1), 'Rejected', '', 'resubmit'],
  ['MA201', 'Linear Algebra', 'Dr. Meera S', 'ASH', 'S3', D(2026, 9, 7), 'Awaiting approval', '', ''],
  ['', '', '', '', '', '', '', '', ''],
];

const STUDENT_PROFILES = [
  ['Department', 'Batch', 'Student Name', 'Admission No', 'Profile Created', 'Responsible Faculty', 'Remarks'],
  ['CSE', '2026-30', 'Arun V', 'SCET26CS001', 'Yes', 'Ms. Reshma', ''],
  ['CSE', '2026-30', 'Bindu K', 'SCET26CS002', 'No', 'Ms. Reshma', ''],
  ['CSE', '2026-30', 'Cyril J', 'SCET26CS003', '', 'Ms. Reshma', ''],
  ['ECE', '2026-30', 'Deepa S', 'SCET26EC001', 'No', 'Mr. Vinod', ''],
  ['ECE', '2025-29', 'Elsa M', 'SCET25EC010', 'Yes', 'Mr. Vinod', ''],
  ['ME', '2026-30', 'Faisal A', 'SCET26ME001', 'Not created', 'Dr. Thomas', ''],
  ['M.Tech CSE', '2026-28', 'Gita R', 'SCET26MT001', 'no', 'Dr. Gnana King', ''],
];

const STUDENT_PROFILES_AGG = [
  ['Department', 'Batch', 'Students Pending', 'Responsible Faculty'],
  ['CSE', '2026-30', 12, 'Ms. Reshma'],
  ['ECE', '2026-30', 0, 'Mr. Vinod'],
  ['ME', '2026-30', 3, 'Dr. Thomas'],
];

const QUERIES = [
  ['Date Received', 'Source', 'Raised By', 'Query', 'Status', 'Closed On', 'Closure Remarks', 'Handled By'],
  [D(2026, 9, 7), 'Email', 'Dr. Anitha R', 'Cannot upload course plan PDF', 'Closed', D(2026, 9, 7), 'File size limit raised to 10 MB', 'Anusree'],
  [D(2026, 9, 7), 'Email', 'Mr. Rahul K', 'Attendance page shows wrong batch', 'Open', '', '', 'Nicy'],
  [D(2026, 9, 8), 'Celerscet', 'HoD ECE', 'Timetable clash in S3', 'Closed', D(2026, 9, 8), 'Slot corrected', 'Celerscet support'],
  [D(2026, 9, 6), 'Celerscet', 'Exam cell', 'Marks entry locked', 'Open', '', '', 'Celerscet support'],
  [D(2026, 9, 1), 'Email', 'Librarian', 'Login issue', 'Closed', D(2026, 9, 2), 'Password reset', 'Joshua'],
];

// Shaped like the real "Project Task tracker" export: title row, header on row 3, blank column A,
// "select" dropdown placeholders on empty rows, statuses Done / In progress / Not started.
const MODULES = [
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Project Task TRACKER', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Services', 'Task', 'docs required', 'task type', 'Faculty Assigned', 'Status', 'Start date', 'Due on', 'Finished date', 'Days Taken', 'remarks'],
  ['', 'admission', 'Admission flow creation management', '', 'developing', 'Aleena Varghese', 'Done', D(2026, 5, 20), '', D(2026, 5, 25), 5, 'original scope'],
  ['', 'timetable', 'testing timetable', '', 'testing ', 'Nicy Johnson', 'In progress', D(2026, 7, 21), D(2026, 7, 24), '', '', ''],
  ['', 'timetable', 'timetable fix - special timetable', '', 'developing', 'Ashwin', 'In progress', D(2026, 7, 21), D(2026, 7, 24), '', '', ''],
  ['', 'course', 'courses creation - header, syllabus', '', 'testing ', 'Anugraha K R', 'In progress', D(2026, 7, 21), '', '', '', ''],
  ['', 'curriculum', 'curriculum creation and approval', '', 'testing ', 'Anugraha K R', 'Done', D(2026, 8, 1), '', D(2026, 9, 8), '', 'signed off by HoD'],
  ['', 'course plan', 'course plan creation, approval and versioning', '', 'testing ', 'Livya George', 'Not started', D(2026, 7, 22), D(2026, 7, 24), '', '', ''],
  ['', 'exam', 'Exam Creation rework: halls picked from rooms', '', 'developing', 'George Sebastian', 'In progress', D(2026, 9, 3), D(2026, 9, 12), '', '', ''],
  ['', 'attendance', 'attendance correction window', '', 'developing', 'Joshua Sony ', 'Done', D(2026, 8, 10), '', '2026-09-08', '', 'released'],
  ['', 'library', 'library books creation', '', 'developing', 'select', 'Not started', '', '', '', '', ''],
  ['', 'Reports', '', '', 'developing', 'select', 'Not started', '', '', '', '', 'row without a task name is ignored'],
  ['', '', '', '', '', 'select', '', '', '', '', '', ''],
  ['', '', '', '', '', 'select', '', '', '', '', '', ''],
];

const FACULTY = [
  ['Name', 'Email', 'Department'],
  ['Dr. Anitha R', 'anitha@sahrdaya.ac.in', 'CSE'],
  ['Mr. Rahul K', 'rahul@sahrdaya.ac.in', 'ECE'],
  ['Ms. Divya P', 'divya@sahrdaya.ac.in', 'ME'],
  ['Duplicate', 'ANITHA@sahrdaya.ac.in', 'CSE'],
  ['No mail', '', 'CE'],
];

const MAIL_LOG_NOTICE_SENT = [
  ['Timestamp', 'Date', 'Report', 'Status', 'To', 'CC', 'Subject', 'Details'],
  [D(2026, 9, 8), '2026-09-08', 'ATTENDANCE:NOTICE', 'SENT', 'anitha@sahrdaya.ac.in', '', 'Notice – Attendance Correction Window closes 15 Sep 2026 – 08 Sep 2026', 'NOTICE; closes 2026-09-15'],
];

function fullSheet(overrides) {
  const tabs = {
    'Config': CONFIG, 'Course Plans': COURSE_PLANS, 'Student Profiles': STUDENT_PROFILES, 'Queries': QUERIES,
    'Assignments': MODULES, 'Faculty': FACULTY,
  };
  return Object.assign(tabs, overrides || {});
}
function configWith(changes) {
  return CONFIG.map(r => (changes && Object.prototype.hasOwnProperty.call(changes, r[0])) ? [r[0], changes[r[0]], r[2]] : r.slice());
}

module.exports = { MAIL_LOG_NOTICE_SENT, CONFIG, COURSE_PLANS, STUDENT_PROFILES, STUDENT_PROFILES_AGG, QUERIES, MODULES, FACULTY, fullSheet, configWith };
