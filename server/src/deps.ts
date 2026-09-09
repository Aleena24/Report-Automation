import type { Env } from './config.js';
import type { Deps } from './engine.js';
import { FirestoreStore, MemoryStore } from './store.js';
import { FakeSheetReader, GoogleSheetReader } from './sheets.js';
import { createMailer } from './mailer.js';
import { SAMPLE_TRACKER } from './lib/sample.js';

/** Wire the real services (Firestore, Sheets, mail) – or in-memory stand-ins when STORE=memory. */
export function makeDeps(env: Env): Deps {
  const memory = process.env.STORE === 'memory';
  return {
    store: memory ? new MemoryStore() : new FirestoreStore({ projectId: env.projectId || undefined, databaseId: env.firestoreDatabase }),
    sheets: memory ? new FakeSheetReader({ Assignments: SAMPLE_TRACKER }) : new GoogleSheetReader(),
    env,
    mailerFor: (cfg) => createMailer(cfg, env),
    now: () => new Date(),
    log: (m) => console.log(m),
  };
}
