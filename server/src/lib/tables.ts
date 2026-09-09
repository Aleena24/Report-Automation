/**
 * Turns a grid of spreadsheet cells (from the Google Sheets API, or pasted from Excel/Sheets)
 * into typed records. Column names are matched by meaning, so "Dept", "Department" and "Branch"
 * all work, and the header row may sit below a title row (like the dev team's tracker).
 */
import { cellStr, isEmail } from './text.js';
import { parseDateKey } from './dates.js';
import { isActiveStatus, isDoneStatus, isYes, isClosedStatus } from './status.js';
import type { CoursePlan, Faculty, QueryItem, StudentProfile, Task } from '../types.js';

export interface Table { headers: string[]; rows: Array<Record<string, unknown>>; headerRow: number }

const KNOWN = /^(task|status|services?|faculty|department|dept|batch|course|subject|name|e-?mail|date|source|query|module|remarks?|semester|sem\b|submitted|profile|admission|due|start|finish|assigned|type|raised|closed|handled|student|count|pending)/i;

/** Pick the header row: the first row (within 25) with 2+ recognisable column names, else the widest. */
export function findHeaderRow(vals: unknown[][]): number {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(vals.length, 25); i++) {
    const cells = (vals[i] || []).map((v) => (v instanceof Date ? '' : cellStr(v))).filter((c) => c && Number.isNaN(Number(c)));
    if (cells.length < 2) continue;
    if (cells.filter((c) => KNOWN.test(c)).length >= 2) return i;
    if (cells.length > bestScore) { bestScore = cells.length; best = i; }
  }
  return best;
}

export function parseTable(vals: unknown[][]): Table {
  const hi = findHeaderRow(vals);
  if (hi < 0) return { headers: [], rows: [], headerRow: -1 };
  const headers = (vals[hi] || []).map((h) => cellStr(h));
  const rows: Array<Record<string, unknown>> = [];
  for (let i = hi + 1; i < vals.length; i++) {
    const r = vals[i] || [];
    const o: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, j) => {
      if (!h) return;
      o[h] = r[j];
      if (cellStr(r[j]) !== '') any = true;
    });
    if (any) rows.push(o);
  }
  return { headers: headers.filter(Boolean), rows, headerRow: hi + 1 };
}

/** First header matching any pattern, in pattern priority order. */
export function col(headers: string[], patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const h = headers.find((x) => p.test(x));
    if (h) return h;
  }
  return null;
}
const val = (row: Record<string, unknown>, header: string | null) => (header ? row[header] : '');
const str = (row: Record<string, unknown>, header: string | null) => cellStr(val(row, header));

// ---------------------------------------------------------------------------------------------
// Dev-team tracker
// ---------------------------------------------------------------------------------------------
export function tasksFromTable(t: Table): Task[] {
  const H = t.headers;
  let cService = col(H, [/^services?$/i, /^module\s*group/i, /^area$/i, /^category/i]);
  const cTask = col(H.filter((h) => h !== cService), [/^task$/i, /^task\s*name/i, /work\s*item/i, /^item$/i, /feature/i, /^work$/i, /description/i, /^module$/i, /module/i]);
  if (!cService) cService = col(H.filter((h) => h !== cTask), [/^module$/i, /^services?$/i]);
  const cType = col(H, [/task\s*type/i, /^type$/i, /activity/i]);
  const cPerson = col(H, [/faculty\s*assigned/i, /assigned/i, /developer/i, /person/i, /owner/i, /working/i, /^name$/i, /^by$/i]);
  const cStatus = col(H, [/^status/i, /^stage/i, /^state/i]);
  const cStart = col(H, [/start/i]);
  const cDue = col(H, [/due/i, /target/i, /deadline/i, /eta/i]);
  const cFin = col(H, [/finish/i, /complet(ed|ion)\s*(date|on)/i, /^done\s*(date|on)/i, /closed\s*on/i, /^end\s*date/i]);
  const cRem = col(H, [/remark/i, /comment/i, /note/i]);
  if (!cTask || !cStatus) throw new Error(`Tracker needs "Task" and "Status" columns (found: ${H.join(', ') || 'nothing'})`);
  return t.rows.map((r) => {
    const status = str(r, cStatus);
    return {
      task: str(r, cTask), service: str(r, cService), type: str(r, cType), person: str(r, cPerson), status,
      start: parseDateKey(val(r, cStart)), due: parseDateKey(val(r, cDue)), finished: parseDateKey(val(r, cFin)),
      remarks: str(r, cRem), active: isActiveStatus(status), done: isDoneStatus(status),
    };
  }).filter((x) => x.task);
}

// ---------------------------------------------------------------------------------------------
// Importers (Google Sheet tab or pasted rows → app records)
// ---------------------------------------------------------------------------------------------
export function coursePlansFromTable(t: Table): Array<Omit<CoursePlan, 'id'>> {
  const H = t.headers;
  const cStatus = col(H, [/^status/i, /approv/i, /^state/i]);
  const cCode = col(H, [/course\s*code/i, /subject\s*code/i, /^code$/i]);
  const cName = col(H, [/course\s*(name|title)/i, /subject\s*(name|title)/i, /^course$/i, /^subject$/i, /^title$/i]);
  const cFac = col(H, [/faculty/i, /teacher/i, /instructor/i, /staff/i, /handled\s*by/i]);
  const cDept = col(H, [/^dep(artmen)?t/i, /dept/i, /department/i, /branch/i]);
  const cSem = col(H, [/^sem/i, /semester/i]);
  const cSub = col(H, [/submit/i, /uploaded/i, /created/i, /^date$/i, /sent\s*on/i]);
  const cAppr = col(H, [/approved\s*on/i, /approval\s*date/i]);
  const cRem = col(H, [/remark/i, /comment/i, /note/i]);
  if (!cName && !cCode) throw new Error(`Need a "Course" column (found: ${H.join(', ') || 'nothing'})`);
  return t.rows.map((r) => ({
    courseCode: str(r, cCode), courseName: str(r, cName), faculty: str(r, cFac), department: str(r, cDept), semester: str(r, cSem),
    submittedOn: parseDateKey(val(r, cSub)), status: str(r, cStatus), approvedOn: parseDateKey(val(r, cAppr)), remarks: str(r, cRem),
  })).filter((x) => x.courseCode || x.courseName);
}

export function studentProfilesFromTable(t: Table): Array<Omit<StudentProfile, 'id'>> {
  const H = t.headers;
  const cDept = col(H, [/^dep(artmen)?t/i, /department/i, /dept/i, /branch/i, /programme?/i]);
  const cBatch = col(H, [/batch/i, /year/i, /admission\s*year/i, /^sem/i]);
  const cFac = col(H, [/responsible/i, /faculty/i, /advisor/i, /tutor/i, /in[-\s]?charge/i, /staff/i]);
  const cCreated = col(H, [/profile\s*created/i, /created/i, /^status/i, /^completed?$/i, /^done$/i]);
  const cCount = col(H, [/students?\s*pending/i, /pending\s*(count|students?)/i, /^count$/i, /no\.?\s*of/i, /^pending$/i, /remaining/i]);
  const cStudent = col(H, [/student\s*name/i, /^name$/i, /^student$/i]);
  const cAdm = col(H, [/admission/i, /reg(ister|istration)?\s*no/i, /roll/i, /^id$/i]);
  const cRem = col(H, [/remark/i, /comment/i, /note/i]);
  if (!cCreated && !cCount && !cStudent) throw new Error('Need either a "Profile Created" (Yes/No) column, a "Students Pending" count column or a "Student Name" column');
  const out: Array<Omit<StudentProfile, 'id'>> = [];
  for (const r of t.rows) {
    const base = { department: str(r, cDept), batch: str(r, cBatch), responsibleFaculty: str(r, cFac), remarks: str(r, cRem) };
    const name = str(r, cStudent);
    if (cCount && !name) {
      const n = Number(str(r, cCount));
      if (!n || n <= 0) continue;
      out.push({ ...base, studentName: '', admissionNo: '', created: false, count: n });
    } else {
      if (!name && !str(r, cAdm) && !base.department) continue;
      out.push({ ...base, studentName: name, admissionNo: str(r, cAdm), created: cCreated ? isYes(str(r, cCreated)) : false, count: 0 });
    }
  }
  return out;
}

export function queriesFromTable(t: Table): Array<Omit<QueryItem, 'id'>> {
  const H = t.headers;
  const cDate = col(H, [/date\s*rec/i, /received/i, /reported/i, /^date$/i, /raised\s*on/i]);
  const cSrc = col(H, [/source/i, /channel/i, /via/i, /mode/i, /reported\s*(to|via)/i]);
  const cBy = col(H, [/raised\s*by/i, /reported\s*by/i, /^from$/i, /requester/i, /^by$/i, /^name$/i]);
  const cQuery = col(H, [/^query/i, /issue/i, /description/i, /subject/i, /^title$/i]);
  const cStatus = col(H, [/^status/i, /^state/i]);
  const cClosedOn = col(H, [/closed\s*on/i, /resolved\s*on/i, /closure\s*date/i, /^closed$/i]);
  const cRemarks = col(H, [/closure\s*remark/i, /remark/i, /resolution/i, /comment/i]);
  const cHandled = col(H, [/handled/i, /assigned/i, /owner/i, /resolved\s*by/i]);
  if (!cQuery) throw new Error(`Need a "Query" column (found: ${H.join(', ') || 'nothing'})`);
  return t.rows.map((r) => {
    const closedOn = parseDateKey(val(r, cClosedOn));
    const status = str(r, cStatus);
    return {
      receivedOn: parseDateKey(val(r, cDate)), source: normaliseSource(str(r, cSrc)), raisedBy: str(r, cBy), query: str(r, cQuery),
      status: status ? (isClosedStatus(status) ? 'Closed' : 'Open') : closedOn ? 'Closed' : 'Open',
      closedOn, closureRemarks: str(r, cRemarks), handledBy: str(r, cHandled),
    };
  }).filter((x) => x.query);
}

export function normaliseSource(s: string): string {
  if (/celer/i.test(s)) return 'Celerscet';
  if (/mail/i.test(s)) return 'Email';
  return s;
}

export function facultyFromTable(t: Table): Array<Omit<Faculty, 'id'>> {
  const H = t.headers;
  const cName = col(H, [/^name/i, /faculty/i, /staff/i]);
  const cMail = col(H, [/e-?mail/i, /mail/i]);
  const cDept = col(H, [/^dep(artmen)?t/i, /department/i, /dept/i, /branch/i]);
  if (!cMail) throw new Error(`Need an "Email" column (found: ${H.join(', ') || 'nothing'})`);
  return t.rows.map((r) => ({ name: str(r, cName), email: str(r, cMail).toLowerCase(), department: str(r, cDept) }))
    .filter((x) => isEmail(x.email) || x.name);
}
