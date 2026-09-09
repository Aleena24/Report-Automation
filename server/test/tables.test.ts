import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, coursePlansFromTable, studentProfilesFromTable, queriesFromTable, facultyFromTable, tasksFromTable } from '../src/lib/tables.js';
import { parseDateKey, dateKey, daysBetween, niceDate, longDate } from '../src/lib/dates.js';
import { parsePastedRows, parsePerson, emails } from '../src/lib/text.js';
import { SAMPLE_TRACKER } from '../src/lib/sample.js';

test('dates: parsing, IST keys, formatting', () => {
  assert.equal(parseDateKey('2026-09-08'), '2026-09-08');
  assert.equal(parseDateKey('08/09/2026'), '2026-09-08');
  assert.equal(parseDateKey('8-9-26'), '2026-09-08');
  assert.equal(parseDateKey(46273), '2026-09-08', 'sheets serial');
  assert.equal(parseDateKey('28 Aug 2026'), '2026-08-28');
  assert.equal(parseDateKey(''), '');
  assert.equal(parseDateKey('select'), '');
  assert.equal(parseDateKey(5), '', 'small numbers are not dates');
  assert.equal(dateKey(new Date('2026-09-08T20:30:00Z')), '2026-09-09', '02:00 IST next day');
  assert.equal(dateKey(new Date('2026-09-08T03:30:00+05:30')), '2026-09-08');
  assert.equal(daysBetween('2026-08-28', '2026-09-08'), 11);
  assert.equal(niceDate('2026-09-08'), '08 Sep 2026');
  assert.equal(longDate('2026-09-15'), 'Tuesday, 15 Sep 2026');
});

test('people and e-mail lists', () => {
  assert.deepEqual(parsePerson('George <George@Sahrdaya.ac.in>'), { name: 'George', email: 'george@sahrdaya.ac.in' });
  assert.deepEqual(parsePerson('ashwin@sahrdaya.ac.in'), { name: 'Ashwin', email: 'ashwin@sahrdaya.ac.in' });
  assert.deepEqual(parsePerson('Ashwin <>'), { name: 'Ashwin', email: '' });
  assert.deepEqual(emails('a@x.in, A@x.in; b@x.in\nnot-an-email'), ['a@x.in', 'b@x.in']);
});

test('tracker table: header on row 3, blank column, placeholders', () => {
  const t = parseTable(SAMPLE_TRACKER);
  assert.equal(t.headerRow, 3);
  assert.deepEqual(t.headers.slice(0, 3), ['Services', 'Task', 'docs required']);
  const tasks = tasksFromTable(t);
  assert.equal(tasks.length, 9, 'rows without a task name dropped');
  const cur = tasks.find((x) => /curriculum/.test(x.task))!;
  assert.equal(cur.finished, '2026-09-08');
  assert.equal(cur.person, 'Anugraha K R');
  assert.equal(tasks.find((x) => /attendance correction/.test(x.task))!.person, 'Joshua Sony', 'trailing space trimmed');
  assert.equal(tasks.filter((x) => x.active).length, 4);
  assert.equal(tasks.find((x) => /library/.test(x.task))!.person, '', '"select" placeholder is blank');
});

test('pasted course plans with different headers', () => {
  const text = 'Subject\tStaff\tDept\tSem\tDate\tApproval Status\nPhysics\tDr. X\tASH\tS1\t05-09-2026\tPending Approval\nChemistry\tDr. Y\tASH\tS1\t2026-09-06\tapproved by HoD\nMaths\tDr. Z\tASH\tS1\t\tNot Approved\n';
  const rows = coursePlansFromTable(parseTable(parsePastedRows(text)));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { courseCode: '', courseName: 'Physics', faculty: 'Dr. X', department: 'ASH', semester: 'S1', submittedOn: '2026-09-05', status: 'Pending Approval', approvedOn: '', remarks: '' });
  assert.equal(rows[2].submittedOn, '');
});

test('pasted student profiles: per-student and group-count layouts, CSV too', () => {
  const per = studentProfilesFromTable(parseTable(parsePastedRows('Department,Batch,Student Name,Admission No,Profile Created,Responsible Faculty\nCSE,2026-30,"Arun, V",SCET26CS001,Yes,Ms. Reshma\nCSE,2026-30,Bindu K,SCET26CS002,No,Ms. Reshma')));
  assert.equal(per.length, 2);
  assert.equal(per[0].studentName, 'Arun, V');
  assert.equal(per[0].created, true);
  assert.equal(per[1].created, false);
  const grp = studentProfilesFromTable(parseTable([['Department', 'Batch', 'Students Pending', 'Responsible Faculty'], ['CSE', '2026-30', 12, 'Ms. Reshma'], ['ECE', '2026-30', 0, 'Mr. Vinod']]));
  assert.equal(grp.length, 1);
  assert.equal(grp[0].count, 12);
});

test('pasted queries and faculty', () => {
  const q = queriesFromTable(parseTable([['Date Received', 'Source', 'Raised By', 'Query', 'Status', 'Closed On', 'Closure Remarks', 'Handled By'],
    ['07/09/2026', 'email', 'Dr. A', 'Cannot upload', 'closed', '07/09/2026', 'Fixed', 'Anusree'], ['08/09/2026', 'Celerscet portal', 'HoD', 'Clash', '', '', '', '']]));
  assert.equal(q[0].status, 'Closed'); assert.equal(q[0].source, 'Email'); assert.equal(q[0].closedOn, '2026-09-07');
  assert.equal(q[1].status, 'Open'); assert.equal(q[1].source, 'Celerscet');
  const f = facultyFromTable(parseTable([['Name', 'Email', 'Department'], ['Dr. A', 'A@sahrdaya.ac.in', 'CSE'], ['', '', '']]));
  assert.deepEqual(f, [{ name: 'Dr. A', email: 'a@sahrdaya.ac.in', department: 'CSE' }]);
});
