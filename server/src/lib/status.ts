/** How free-text status values are interpreted. Blank course-plan status counts as pending. */
export function isPendingStatus(v: unknown): boolean {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return true;
  if (/(^|\s)(not|pending|awaiting|awaits|waiting|under|for|yet to be|to be)\s+(approv|accept|review|verif)/.test(s)) return true;
  if (/(approv|accept|review)\w*\s+(pending|awaited|due)/.test(s)) return true;
  if (/^(approved|accepted|rejected|withdrawn|cancelled|canceled|closed|completed|done|verified|yes|y|ok)\b/.test(s)) return false;
  return true;
}
export function isYes(v: unknown): boolean {
  if (v === true) return true;
  return /^(y|yes|true|1|created|done|complete|completed|ok)\b/i.test(String(v ?? '').trim());
}
export function isClosedStatus(v: unknown): boolean {
  return /^(closed|resolved|done|complete|completed|fixed|solved|answered)\b/i.test(String(v || '').trim());
}
export function isDoneStatus(v: unknown): boolean {
  return /^(done|completed?|closed|finished|deployed|released|live|delivered)\b/i.test(String(v || '').trim());
}
export function isActiveStatus(v: unknown): boolean {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return false;
  if (/^(completed?|done|deployed|live|released|closed|delivered|planned|not\s*started|on\s*hold|dropped|cancel)/.test(s)) return false;
  return true;
}
