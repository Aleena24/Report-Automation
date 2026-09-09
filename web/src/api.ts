export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let lastReload = 0;

/** JSON fetch wrapper. The X-Requested-With header makes Identity-Aware Proxy answer 401 instead of redirecting. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: init.method || 'GET',
      headers: { 'X-Requested-With': 'XMLHttpRequest', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, navigator.onLine ? 'Could not reach the server' : 'You are offline');
  }
  if (res.status === 401) {
    // IAP session expired: a full navigation lets Google sign the user in again.
    if (Date.now() - lastReload > 30_000) { lastReload = Date.now(); window.location.reload(); }
    throw new ApiError(401, 'Signing you in again…');
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error || `${res.status} ${res.statusText}`);
  return data as T;
}

export const qk = {
  me: ['me'] as const,
  today: ['today'] as const,
  runs: ['runs'] as const,
  data: (ds: string) => ['data', ds] as const,
  tracker: ['tracker'] as const,
  mailLog: (date: string) => ['mail-log', date] as const,
  mail: (id: string) => ['mail', id] as const,
  settings: ['settings'] as const,
  preview: (key: string, date: string) => ['preview', key, date] as const,
};

export function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
export function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
export function niceDate(key?: string): string {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return key || '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function todayKey(): string {
  const t = new Date(Date.now() + 330 * 60000);
  return t.toISOString().slice(0, 10);
}
