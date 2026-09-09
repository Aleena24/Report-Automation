/**
 * A made-up tracker in the shape the Sheets API returns it: title row, header on row 3, blank column A,
 * "select" dropdown placeholders. Used by the tests and by local development (STORE=memory).
 */
export const SAMPLE_TRACKER: unknown[][] = [
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Project Task TRACKER', '', '', '', '', '', '', '', '', '', ''],
  ['', 'Services', 'Task', 'docs required', 'task type', 'Faculty Assigned', 'Status', 'Start date', 'Due on', 'Finished date', 'Days Taken', 'remarks'],
  ['', 'admission', 'Admission flow creation management', '', 'developing', 'Asha Menon', 'Done', '2026-05-20', '', '2026-05-25', 5, 'original scope'],
  ['', 'timetable', 'testing timetable', '', 'testing ', 'Nila Thomas', 'In progress', '2026-07-21', '2026-07-24', '', '', ''],
  ['', 'timetable', 'timetable fix - special timetable', '', 'developing', 'Arjun', 'In progress', '2026-07-21', '2026-07-24', '', '', ''],
  ['', 'course', 'courses creation - header, syllabus', '', 'testing ', 'Anand K R', 'In progress', '2026-07-21', '', '', '', ''],
  ['', 'curriculum', 'curriculum creation and approval', '', 'testing ', 'Anand K R', 'Done', '2026-08-01', '', 46273, '', 'signed off by HoD'],
  ['', 'course plan', 'course plan creation, approval and versioning', '', 'testing ', 'Lekha Pillai', 'Not started', '2026-07-22', '2026-07-24', '', '', ''],
  ['', 'exam', 'Exam Creation rework: halls picked from rooms', '', 'developing', 'Gopal Nair', 'In progress', '2026-09-03', '2026-09-12', '', '', ''],
  ['', 'attendance', 'attendance correction window', '', 'developing', 'Jomon Paul ', 'Done', '2026-08-10', '', '08/09/2026', '', 'released'],
  ['', 'library', 'library books creation', '', 'developing', 'select', 'Not started', '', '', '', '', ''],
  ['', 'Reports', '', '', 'developing', 'select', 'Not started', '', '', '', '', 'row without a task name is ignored'],
  ['', '', '', '', '', 'select', '', '', '', '', '', ''],
  ['', '', '', '', '', 'select', '', '', '', '', '', ''],
];
