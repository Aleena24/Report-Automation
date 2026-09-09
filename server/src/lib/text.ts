/** Text, e-mail and people helpers shared by the reports and the API. */
export const DASH = '–'; // en dash, as used in the mandated subject format
export const APP_NAME = 'Daily Reports';

export interface Person { name: string; email: string }

export function esc(s: unknown): string {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Spreadsheet cell → trimmed string; dropdown placeholders such as "select" count as blank. */
export function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = String(v).trim();
  return /^(select|choose|-+|n\/a|na|null|undefined)$/i.test(s) ? '' : s;
}

export function numOr(v: unknown, dflt: number): number {
  if (v === '' || v === null || v === undefined) return dflt;
  const n = Number(v);
  return Number.isNaN(n) ? dflt : n;
}

export function isEmail(e: unknown): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(e || '').trim());
}

export function listStr(s: unknown): string[] {
  return String(s || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
}

/** `Name <email>` | `email` | `Name` → { name, email } (email lower-cased, '' if invalid). */
export function parsePerson(s: unknown): Person {
  const str = String(s || '').trim();
  const m = str.match(/^([^<]*?)\s*<\s*([^>]*)\s*>$/);
  if (m) return { name: m[1].trim(), email: isEmail(m[2]) ? m[2].trim().toLowerCase() : '' };
  if (isEmail(str)) {
    const local = str.split('@')[0];
    return { name: local.charAt(0).toUpperCase() + local.slice(1), email: str.toLowerCase() };
  }
  return { name: str, email: '' };
}

export function people(s: unknown): Person[] { return listStr(s).map(parsePerson); }

/** Unique valid e-mails from a people list string (or array of strings). */
export function emails(s: unknown): string[] {
  const src = Array.isArray(s) ? s.join(',') : s;
  const out: string[] = [];
  for (const p of people(src)) if (p.email && !out.includes(p.email)) out.push(p.email);
  return out;
}

export function sameFirstName(a: string, b: string): boolean {
  const fa = String(a).trim().toLowerCase().split(/\s+/)[0];
  const fb = String(b).trim().toLowerCase().split(/\s+/)[0];
  return !!fa && fa === fb;
}

export function formatPerson(p: Person): string {
  if (p.name && p.email) return `${p.name} <${p.email}>`;
  return p.email || p.name || '';
}

/** Plain-text alternative for an HTML mail body. */
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<\/(tr|p|div|h[1-6]|li)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<\/span>/gi, '   ')
    .replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Split pasted spreadsheet text (tab- or comma-separated, one row per line) into cells. */
export function parsePastedRows(text: string): string[][] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const tabbed = lines.filter((l) => l.includes('\t')).length >= Math.ceil(lines.length / 2);
  return lines.map((line) => (tabbed ? line.split('\t') : splitCsvLine(line)).map((c) => c.trim()));
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
