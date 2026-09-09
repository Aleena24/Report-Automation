/**
 * Date helpers. Every "date" that the reports reason about is a calendar day in the configured time zone
 * (SCHEDULE_TZ, default Asia/Kolkata), represented as a key string `yyyy-mm-dd`; instants (`Date`) are
 * converted with `dateKey`.
 */
export const TZ = process.env.SCHEDULE_TZ || 'Asia/Kolkata';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');

const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Calendar fields of an instant in the configured time zone. */
export function localParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const p: Record<string, number> = {};
  for (const x of FMT.formatToParts(d)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute };
}

/** Local calendar date of an instant, as `yyyy-mm-dd`. */
export function dateKey(d: Date): string {
  const t = localParts(d);
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
}

/** Hour and minute in the configured time zone. */
export function localTime(d: Date): { hour: number; minute: number } {
  const t = localParts(d);
  return { hour: t.hour, minute: t.minute };
}

/** `dd MMM yyyy, HH:mm` in the configured time zone – used in mail footers. */
export function fmtDateTime(d: Date): string {
  const t = localParts(d);
  return `${pad(t.day)} ${MONTHS[t.month - 1]} ${t.year}, ${pad(t.hour)}:${pad(t.minute)}`;
}

export function isDateKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(keyToUtc(s));
}

export function keyToUtc(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): string {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** `dd MMM yyyy` */
export function niceDate(key: string): string {
  if (!isDateKey(key)) return '';
  const t = new Date(keyToUtc(key));
  return `${pad(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

/** `EEEE, dd MMM yyyy` */
export function longDate(key: string): string {
  return isDateKey(key) ? `${weekdayOf(key)}, ${niceDate(key)}` : '';
}

export function weekdayOf(key: string): string {
  return isDateKey(key) ? WEEKDAYS[new Date(keyToUtc(key)).getUTCDay()] : '';
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToUtc(b) - keyToUtc(a)) / 86400000);
}

export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtc(key) + n * 86400000);
}

/**
 * Parse anything a spreadsheet, a form or an API might hand us into a date key.
 * Understands Date objects, Google Sheets serial numbers, `yyyy-mm-dd`, `dd/mm/yyyy`,
 * `dd-mm-yy` (Indian convention: day first) and free text like `28 Aug 2026`. Returns '' if unparseable.
 */
export function parseDateKey(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : dateKey(v);
  if (typeof v === 'number') {
    // Google Sheets serial day number (days since 1899-12-30). Plain small numbers are not dates.
    if (v > 20000 && v < 80000) return utcToKey(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return '';
  }
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utcToKey(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return utcToKey(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if (m) return utcToKey(Date.UTC(2000 + +m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  // A bare date string is parsed as local midnight by V8; take the local calendar parts.
  if (/T\d{2}:\d{2}/.test(s) || /Z$|[+-]\d{2}:\d{2}$/.test(s)) return dateKey(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Comma / semicolon / newline separated date list → sorted unique date keys. */
export function parseDateList(s: string): string[] {
  const keys = String(s || '').split(/[,;\n]+/).map((x) => parseDateKey(x.trim())).filter(Boolean);
  return Array.from(new Set(keys)).sort();
}
