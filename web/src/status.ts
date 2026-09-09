/** Same interpretation of free-text statuses as the server (lib/status.ts). */
export function isPendingStatus(v: unknown): boolean {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return true;
  if (/(^|\s)(not|pending|awaiting|awaits|waiting|under|for|yet to be|to be)\s+(approv|accept|review|verif)/.test(s)) return true;
  if (/(approv|accept|review)\w*\s+(pending|awaited|due)/.test(s)) return true;
  if (/^(approved|accepted|rejected|withdrawn|cancelled|canceled|closed|completed|done|verified|yes|y|ok)\b/.test(s)) return false;
  return true;
}
export function isClosedStatus(v: unknown): boolean {
  return /^(closed|resolved|done|complete|completed|fixed|solved|answered)\b/i.test(String(v || '').trim());
}
export function daysSince(key: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  return Math.round((Date.parse(today) - Date.parse(key)) / 86400000);
}
