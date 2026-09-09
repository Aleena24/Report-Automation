import { Firestore, FieldValue } from '@google-cloud/firestore';
import type { MailLogEntry, RunRecord } from './types.js';

/**
 * Persistence boundary. `FirestoreStore` is used in production; `MemoryStore` in tests and
 * for local development without Google credentials.
 */
export type Collection = 'coursePlans' | 'studentProfiles' | 'queries' | 'faculty';

export interface Store {
  getConfig(): Promise<Record<string, unknown> | null>;
  saveConfig(patch: Record<string, unknown>): Promise<void>;

  list<T extends { id: string }>(col: Collection): Promise<T[]>;
  get<T extends { id: string }>(col: Collection, id: string): Promise<T | null>;
  create<T extends { id: string }>(col: Collection, data: Omit<T, 'id'>): Promise<T>;
  createMany<T extends { id: string }>(col: Collection, items: Array<Omit<T, 'id'>>): Promise<number>;
  update(col: Collection, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(col: Collection, id: string): Promise<void>;
  clear(col: Collection): Promise<number>;

  mailLogForDate(dateKey: string): Promise<MailLogEntry[]>;
  mailLogRecent(limit: number): Promise<MailLogEntry[]>;
  mailLogGet(id: string): Promise<MailLogEntry | null>;
  mailLogAdd(entry: Omit<MailLogEntry, 'id'>): Promise<string>;
  mailLogRemove(id: string): Promise<void>;
  everSent(report: string): Promise<boolean>;

  runAdd(run: Omit<RunRecord, 'id'>): Promise<string>;
  runsRecent(limit: number): Promise<RunRecord[]>;

  /** Run `fn` while holding the named lock; resolves to `null` (without running) if someone else holds it. */
  withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null>;
}

// ---------------------------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------------------------
export class MemoryStore implements Store {
  private config: Record<string, unknown> | null = null;
  private cols: Record<Collection, Map<string, Record<string, unknown>>> = {
    coursePlans: new Map(), studentProfiles: new Map(), queries: new Map(), faculty: new Map(),
  };
  private mailLog = new Map<string, MailLogEntry>();
  private runs = new Map<string, RunRecord>();
  private locks = new Map<string, number>();
  private seq = 0;
  private nextId() { return `m${++this.seq}`; }

  async getConfig() { return this.config ? { ...this.config } : null; }
  async saveConfig(patch: Record<string, unknown>) { this.config = { ...(this.config || {}), ...patch }; }

  async list<T extends { id: string }>(col: Collection) {
    return Array.from(this.cols[col].values()).map((v) => ({ ...v })) as unknown as T[];
  }
  async get<T extends { id: string }>(col: Collection, id: string) {
    const v = this.cols[col].get(id);
    return v ? ({ ...v } as unknown as T) : null;
  }
  async create<T extends { id: string }>(col: Collection, data: Omit<T, 'id'>) {
    const id = this.nextId();
    const rec = { ...(data as Record<string, unknown>), id };
    this.cols[col].set(id, rec);
    return { ...rec } as unknown as T;
  }
  async createMany<T extends { id: string }>(col: Collection, items: Array<Omit<T, 'id'>>) {
    for (const it of items) await this.create(col, it);
    return items.length;
  }
  async update(col: Collection, id: string, patch: Record<string, unknown>) {
    const cur = this.cols[col].get(id);
    if (!cur) throw new Error(`${col}/${id} not found`);
    this.cols[col].set(id, { ...cur, ...patch, id });
  }
  async remove(col: Collection, id: string) { this.cols[col].delete(id); }
  async clear(col: Collection) { const n = this.cols[col].size; this.cols[col].clear(); return n; }

  async mailLogForDate(dateKey: string) {
    return Array.from(this.mailLog.values()).filter((e) => e.date === dateKey).map((e) => ({ ...e }));
  }
  async mailLogRecent(limit: number) {
    return Array.from(this.mailLog.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit).map((e) => ({ ...e }));
  }
  async mailLogGet(id: string) { const e = this.mailLog.get(id); return e ? { ...e } : null; }
  async mailLogAdd(entry: Omit<MailLogEntry, 'id'>) {
    const id = this.nextId();
    this.mailLog.set(id, { ...entry, id });
    return id;
  }
  async mailLogRemove(id: string) { this.mailLog.delete(id); }
  async everSent(report: string) {
    return Array.from(this.mailLog.values()).some((e) => e.report === report && e.status === 'SENT');
  }
  async runAdd(run: Omit<RunRecord, 'id'>) { const id = this.nextId(); this.runs.set(id, { ...run, id }); return id; }
  async runsRecent(limit: number) {
    return Array.from(this.runs.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
  }
  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>) {
    const now = Date.now();
    const until = this.locks.get(name) || 0;
    if (until > now) return null;
    this.locks.set(name, now + ttlMs);
    try { return await fn(); } finally { this.locks.delete(name); }
  }
}

// ---------------------------------------------------------------------------------------------
// Firestore implementation
// ---------------------------------------------------------------------------------------------
export class FirestoreStore implements Store {
  private db: Firestore;
  constructor(opts: { projectId?: string; databaseId?: string } = {}) {
    this.db = new Firestore({
      projectId: opts.projectId || undefined,
      databaseId: opts.databaseId || 'daily-reports',
      ignoreUndefinedProperties: true,
    });
  }

  async getConfig() {
    const snap = await this.db.doc('settings/config').get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  }
  async saveConfig(patch: Record<string, unknown>) {
    await this.db.doc('settings/config').set({ ...patch, _updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  async list<T extends { id: string }>(col: Collection) {
    const snap = await this.db.collection(col).get();
    return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id })) as T[];
  }
  async get<T extends { id: string }>(col: Collection, id: string) {
    const snap = await this.db.collection(col).doc(id).get();
    return snap.exists ? ({ ...(snap.data() as object), id: snap.id } as T) : null;
  }
  async create<T extends { id: string }>(col: Collection, data: Omit<T, 'id'>) {
    const ref = this.db.collection(col).doc();
    await ref.set(data as object);
    return { ...(data as object), id: ref.id } as T;
  }
  async createMany<T extends { id: string }>(col: Collection, items: Array<Omit<T, 'id'>>) {
    let n = 0;
    for (let i = 0; i < items.length; i += 400) {
      const batch = this.db.batch();
      for (const it of items.slice(i, i + 400)) { batch.set(this.db.collection(col).doc(), it as object); n++; }
      await batch.commit();
    }
    return n;
  }
  async update(col: Collection, id: string, patch: Record<string, unknown>) {
    await this.db.collection(col).doc(id).update(patch);
  }
  async remove(col: Collection, id: string) { await this.db.collection(col).doc(id).delete(); }
  async clear(col: Collection) {
    const snap = await this.db.collection(col).select().get();
    let n = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = this.db.batch();
      for (const d of snap.docs.slice(i, i + 400)) { batch.delete(d.ref); n++; }
      await batch.commit();
    }
    return n;
  }

  private mailEntry(d: FirebaseFirestore.DocumentSnapshot, withHtml: boolean): MailLogEntry {
    const data = d.data() as Record<string, unknown>;
    const e = { ...data, id: d.id } as MailLogEntry;
    if (!withHtml) delete e.html;
    return e;
  }
  async mailLogForDate(dateKey: string) {
    const snap = await this.db.collection('mailLog').where('date', '==', dateKey).get();
    return snap.docs.map((d) => this.mailEntry(d, false)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  async mailLogRecent(limit: number) {
    const snap = await this.db.collection('mailLog').orderBy('timestamp', 'desc').limit(limit).get();
    return snap.docs.map((d) => this.mailEntry(d, false));
  }
  async mailLogGet(id: string) {
    const snap = await this.db.collection('mailLog').doc(id).get();
    return snap.exists ? this.mailEntry(snap, true) : null;
  }
  async mailLogAdd(entry: Omit<MailLogEntry, 'id'>) {
    const ref = this.db.collection('mailLog').doc();
    await ref.set(entry);
    return ref.id;
  }
  async mailLogRemove(id: string) { await this.db.collection('mailLog').doc(id).delete(); }
  async everSent(report: string) {
    const snap = await this.db.collection('mailLog').where('report', '==', report).where('status', '==', 'SENT').limit(1).get();
    return !snap.empty;
  }

  async runAdd(run: Omit<RunRecord, 'id'>) {
    const ref = this.db.collection('runs').doc();
    await ref.set(run);
    return ref.id;
  }
  async runsRecent(limit: number) {
    const snap = await this.db.collection('runs').orderBy('startedAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as RunRecord);
  }

  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>) {
    const ref = this.db.doc(`locks/${name}`);
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const acquired = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const until = snap.exists ? Number((snap.data() as { until?: number }).until || 0) : 0;
      if (until > now) return false;
      tx.set(ref, { until: now + ttlMs, token, at: new Date().toISOString() });
      return true;
    });
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      try {
        await this.db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (snap.exists && (snap.data() as { token?: string }).token === token) tx.delete(ref);
        });
      } catch { /* lock will expire on its own */ }
    }
  }
}
