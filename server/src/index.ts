import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readEnv } from './config.js';
import { authMiddleware, HttpError } from './auth.js';
import { apiRouter } from './routes/api.js';
import { makeDeps } from './deps.js';
import { loadConfig } from './engine.js';

const env = readEnv();
const deps = makeDeps(env);
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '4mb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'daily-reports', time: new Date().toISOString() }));

app.use('/api', authMiddleware(env, () => loadConfig(deps)), apiRouter(deps));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ---- static React PWA -------------------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = env.webDist || [path.resolve(here, '../../web/dist'), path.resolve(here, '../web/dist')].find((p) => fs.existsSync(p)) || '';
if (webDist) {
  app.use(express.static(webDist, {
    index: false, maxAge: '1y', immutable: true,
    setHeaders: (res, file) => {
      if (/\.(html|webmanifest|json)$/.test(file) || /sw\.js$|workbox-.*\.js$|registerSW\.js$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.type('text').send('Daily Reports API is running; the web build was not found (run `npm run build --workspace web`).'));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = (err as Error)?.message || String(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: message });
});

app.listen(env.port, () => {
  console.log(`daily-reports listening on :${env.port} (auth=${env.authMode}, store=${process.env.STORE || 'firestore'}, web=${webDist || 'none'})`);
});
