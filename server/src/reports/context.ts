import type { Config } from '../config.js';
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

export function senderName(name: string): string { return name ? `${APP_NAME} ${DASH} ${name}` : APP_NAME; }
