import type { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { Config, Env } from './config.js';
import { emails } from './lib/text.js';

export interface User { email: string; role: 'admin' | 'member' }

declare module 'express-serve-static-core' {
  interface Request { user?: User }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const IAP_ISSUER = 'https://cloud.google.com/iap';
const oauth = new OAuth2Client();
let iapKeys: { pubkeys: Record<string, string> } | null = null;
let iapKeysAt = 0;

/** Verify the JWT that Identity-Aware Proxy adds to every request it lets through. */
export async function verifyIapJwt(token: string, audience: string): Promise<string> {
  if (!iapKeys || Date.now() - iapKeysAt > 6 * 3600 * 1000) { iapKeys = (await oauth.getIapPublicKeys()) as { pubkeys: Record<string, string> }; iapKeysAt = Date.now(); }
  const keys = iapKeys;
  const ticket = await oauth.verifySignedJwtWithCertsAsync(token, keys.pubkeys, audience || undefined, [IAP_ISSUER]);
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error('IAP token has no e-mail');
  return payload.email.toLowerCase();
}

export function roleFor(email: string, cfg: Config): User['role'] | null {
  const admins = emails(cfg.admins);
  const members = emails(cfg.members);
  if (admins.includes(email) || admins.length === 0) return 'admin';
  if (members.length && !members.includes(email)) return null;
  return 'member';
}

/** Express middleware: identifies the caller (IAP, trusted header, or dev) and applies the member list. */
export function authMiddleware(env: Env, getConfig: () => Promise<Config>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      let email = '';
      if (env.authMode === 'iap') {
        const token = req.header('x-goog-iap-jwt-assertion');
        if (!token) throw new HttpError(401, 'Not signed in (no IAP token). Open the app through its Cloud Run URL.');
        try { email = await verifyIapJwt(token, env.iapAudience); }
        catch (e) { throw new HttpError(401, 'Invalid IAP token: ' + ((e as Error).message || e)); }
      } else if (env.authMode === 'header') {
        const h = req.header('x-goog-authenticated-user-email') || '';
        email = h.replace(/^accounts\.google\.com:/, '').toLowerCase();
        if (!email) throw new HttpError(401, 'Not signed in');
      } else {
        email = (req.header('x-dev-user') || env.devUserEmail).toLowerCase();
      }
      const cfg = await getConfig();
      const role = roleFor(email, cfg);
      if (!role) throw new HttpError(403, `${email} is not in the members list. Ask an admin to add you in Settings → Access.`);
      req.user = { email, role };
      next();
    } catch (e) { next(e); }
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Only admins can do this (Settings → Access → Admins).'));
  next();
}
