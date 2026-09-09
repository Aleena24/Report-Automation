import { DASH, esc, numOr } from './text.js';
import { fmtDateTime, longDate, niceDate, TZ } from './dates.js';
import type { Person } from './text.js';

const NAVY = '#1f4e79';
const CELL = 'border:1px solid #d0d7de;padding:6px 8px;vertical-align:top;font-size:13px';

export function subjectLine(title: string, todayKey: string): string {
  return `Daily Report ${DASH} ${title} ${DASH} ${niceDate(todayKey)}`;
}

export function h3(text: string): string {
  return `<h3 style="margin:18px 0 6px;font-size:15px;color:${NAVY}">${text}</h3>`;
}

export function stat(label: string, value: unknown, color?: string): string {
  return `<td style="border:1px solid #d0d7de;border-radius:6px;padding:8px 14px;text-align:center;background:#f6f8fa">` +
    `<div style="font-size:22px;font-weight:bold;color:${color || NAVY}">${esc(value)}</div>` +
    `<div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.3px">${esc(label)}</div></td>`;
}

export function statRow(cells: string[]): string {
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin:4px -8px 8px"><tr>${cells.join('')}</tr></table>`;
}

export interface TableOpts { highlightCol?: number; highlightIf?: (v: unknown) => boolean; totalRow?: boolean }

export function htmlTable(headers: string[], rows: unknown[][], opts: TableOpts = {}): string {
  const th = headers.map((h) => `<th style="${CELL};background:${NAVY};color:#fff;text-align:left;white-space:nowrap">${esc(h)}</th>`).join('');
  const trs = rows.map((r, i) => {
    const isTotal = !!opts.totalRow && i === rows.length - 1;
    const bg = isTotal ? '#e8eef5' : i % 2 ? '#f6f8fa' : '#ffffff';
    const tds = r.map((c, j) => {
      let style = CELL + (isTotal ? ';font-weight:bold' : '');
      if (opts.highlightCol === j && opts.highlightIf && opts.highlightIf(c)) style += ';color:#b00020;font-weight:bold';
      if (typeof c === 'number') style += ';text-align:right';
      return `<td style="${style}">${esc(c)}</td>`;
    }).join('');
    return `<tr style="background:${bg}">${tds}</tr>`;
  }).join('');
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0 12px"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

export function summaryByGroup<T extends Record<string, unknown>>(data: T[], field: keyof T, label: string): string {
  const counts: Record<string, number> = {};
  for (const d of data) { const k = String(d[field] || DASH); counts[k] = (counts[k] || 0) + 1; }
  const keys = Object.keys(counts).sort();
  if (keys.length < 2) return '';
  return `<p style="margin:6px 0 2px;font-size:13px;color:#555">By ${esc(label.toLowerCase())}:</p>` +
    `<p style="margin:0 0 8px;font-size:13px">${keys.map((k) => `<span style="display:inline-block;background:#e8eef5;border-radius:12px;padding:3px 10px;margin:2px 4px 2px 0">${esc(k)} <b>${counts[k]}</b></span>`).join('')}</p>`;
}

export function overdueFlag(v: unknown): boolean { return /overdue/.test(String(v)); }
export function moreThan7(v: unknown): boolean { return numOr(v, 0) > 7; }

export interface WrapOpts {
  title: string; todayKey: string; subtitle?: string; body: string; owner?: Person | null; backup?: Person | null;
  salutation?: string; orgName: string; appUrl: string; appLabel?: string; now: Date;
}

/** Standard mail chrome around a report body. */
export function wrap(o: WrapOpts): string {
  const ownerLine = o.owner && o.owner.name ? esc(o.owner.name) : 'Report owner';
  const backupLine = o.backup && o.backup.name ? ` <span style="color:#555">(backup: ${esc(o.backup.name)})</span>` : '';
  const source = o.appUrl
    ? `<a href="${esc(o.appUrl)}" style="color:${NAVY}">${esc(o.appLabel || 'Daily Reports')}</a>`
    : esc(o.appLabel || 'Daily Reports');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:960px;line-height:1.45">` +
    `<div style="background:${NAVY};color:#fff;padding:14px 18px;border-radius:6px 6px 0 0">` +
    `<div style="font-size:18px;font-weight:bold">${esc(o.title)}</div>` +
    `<div style="font-size:13px;opacity:.9;margin-top:2px">${[o.orgName, longDate(o.todayKey), o.subtitle].filter(Boolean).map(esc).join(' &middot; ')}</div></div>` +
    `<div style="border:1px solid #d0d7de;border-top:0;padding:16px 18px;border-radius:0 0 6px 6px">` +
    `<p style="margin-top:0">${esc(o.salutation || 'Dear Sir/Madam,')}</p>` +
    o.body +
    `<p style="margin-bottom:0">Regards,<br><strong>${ownerLine}</strong>${backupLine}</p></div>` +
    `<p style="color:#666;font-size:12px;margin-top:10px">Generated automatically by ${source} at ${esc(fmtDateTime(o.now))} (${esc(TZ)}). Replies go to the report owner.</p></div>`;
}

export function dryBanner(label: string, to: string[], cc: string[], replyTo: string): string {
  return `<div style="background:#fff4ce;border:2px dashed #c77700;padding:10px 14px;margin-bottom:14px;font-family:Arial,sans-serif;font-size:13px">` +
    `<strong>${esc(label)} ${DASH} this mail was sent only to you.</strong> When live it would go:<br>` +
    `<b>To:</b> ${esc(to.join(', ') || '(none configured!)')}<br>` +
    `<b>CC:</b> ${esc(cc.join(', ') || '(none)')}<br>` +
    `<b>Reply-To:</b> ${esc(replyTo || '(none)')}<br>` +
    `Switch off <code>Dry run</code> in Settings to go live.</div>`;
}
