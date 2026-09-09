import type { Config, Schedule } from '../config.js';
import type { Store } from '../store.js';
import { readTracker, type SheetReader, type TrackerSnapshot } from '../sheets.js';
import type { CoursePlan, Faculty, QueryItem, StudentProfile } from '../types.js';
import { APP_NAME, DASH, emails, isEmail, listStr, parsePerson, type Person } from '../lib/text.js';
import { parseDateList, weekdayOf } from '../lib/dates.js';

/** Everything a report builder may read. Results are memoised for the duration of one run/request. */
export interface DataSource {
  coursePlans(): Promise<CoursePlan[]>;
  studentProfiles(): Promise<StudentProfile[]>;
  queries(): Promise<QueryItem[]>;
  faculty(): Promise<Faculty[]>;
  tracker(): Promise<TrackerSnapshot>;
  everSent(report: string): Promise<boolean>;
}

export interface BuildCtx {
  cfg: Config;
  todayKey: string;
  now: Date;
  /** Preview mode ignores dates, skip days and the duplicate guard so every mail can be looked at. */
  preview: boolean;
  data: DataSource;
  appUrl: string;
  /** Scheduled batch times, for wording inside the mails. */
  schedule: Schedule;
}

export function makeDataSource(store: Store, reader: SheetReader, cfg: Config): DataSource {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(k: string, fn: () => Promise<T>): Promise<T> => {
    if (!memo.has(k)) memo.set(k, fn());
    return memo.get(k) as Promise<T>;
  };
  return {
    coursePlans: () => once('coursePlans', () => store.list<CoursePlan>('coursePlans')),
    studentProfiles: () => once('studentProfiles', () => store.list<StudentProfile>('studentProfiles')),
    queries: () => once('queries', () => store.list<QueryItem>('queries')),
    faculty: () => once('faculty', () => store.list<Faculty>('faculty')),
    tracker: () => once('tracker', () => readTracker(reader, cfg.sheetId, cfg.trackerTab)),
    everSent: (report) => store.everSent(report),
  };
}

export async function facultyEmails(ctx: BuildCtx): Promise<string[]> {
  const direct = emails(ctx.cfg.facultyEmails);
  if (direct.length) return direct;
  const list = await ctx.data.faculty();
  return emails(list.map((f) => f.email).filter(isEmail).join(','));
}

/** Reason the day is skipped ('' when reports go out). */
export function isSkipDay(cfg: Config, key: string): string {
  const weekday = weekdayOf(key);
  const skip = listStr(cfg.skipDays).map((s) => s.toLowerCase().slice(0, 3));
  if (skip.some((s) => s && weekday.toLowerCase().startsWith(s))) return `${weekday} is a skip day`;
  if (parseDateList(cfg.holidays).includes(key)) return `holiday (${key})`;
  return '';
}

export type OwnerKey = 'CoursePlans' | 'StudentProfiles' | 'Attendance' | 'StatusReport';
export function owners(cfg: Config, k: OwnerKey): { owner: Person; backup: Person } {
  return { owner: parsePerson(cfg[`owner${k}`]), backup: parsePerson(cfg[`backup${k}`]) };
}

/**
 * Recipient rules. Every role comes from Settings; a filled per-report "To" list replaces the default rule.
 *  - department reports (course plans, student profiles): To Principal + HoD; CC coordinator, always-CC, owner, backup
 *  - management reports (status & queries, evening digest): To coordinator + Principal; CC always-CC, owner, backup
 *  - attendance notice: To all faculty; CC coordinator, Principal, HoD, always-CC, owner, backup
 */
export function departmentRecipients(cfg: Config, override: string, owner: Person, backup?: Person) {
  const to = emails(override).length ? emails(override) : emails([cfg.principalEmail, cfg.hodEmail].join(','));
  return { to, cc: [cfg.coordinatorEmail, ...emails(cfg.ccAll), owner.email, backup?.email || ''] };
}
export function managementRecipients(cfg: Config, override: string, owner: Person, backup?: Person) {
  const to = emails(override).length ? emails(override) : emails([cfg.coordinatorEmail, cfg.principalEmail].join(','));
  return { to, cc: [cfg.coordinatorEmail, cfg.principalEmail, ...emails(cfg.ccAll), owner.email, backup?.email || ''] };
}
export function attendanceCc(cfg: Config, owner: Person, backup: Person): string[] {
  return [cfg.coordinatorEmail, cfg.principalEmail, cfg.hodEmail, ...emails(cfg.ccAll), owner.email, backup.email];
}

export function senderName(name: string): string { return name ? `${APP_NAME} ${DASH} ${name}` : APP_NAME; }
