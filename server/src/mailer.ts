import nodemailer, { type Transporter } from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { GoogleAuth } from 'google-auth-library';
import type { Config, Env } from './config.js';
import { APP_NAME } from './lib/text.js';

export interface OutgoingMail {
  to: string[]; cc: string[]; replyTo?: string; senderName: string; subject: string; html: string; text: string;
}
export interface Mailer {
  readonly kind: string;
  send(m: OutgoingMail): Promise<void>;
  /** Human description of the transport for the settings page. */
  describe(): string;
}

/** Records mails instead of sending them (tests, and the default before mail is configured). */
export class LogMailer implements Mailer {
  readonly kind = 'log';
  sent: OutgoingMail[] = [];
  constructor(private failWith?: string) {}
  async send(m: OutgoingMail) {
    if (this.failWith) throw new Error(this.failWith);
    this.sent.push(m);
  }
  describe() { return 'Not sending – mails are only recorded in the Mail Log. Choose SMTP or Gmail in Settings → Mail to send for real.'; }
}

function fromHeader(name: string, from: string): string {
  return `"${(name || APP_NAME).replace(/"/g, "'")}" <${from}>`;
}

/** The effective SMTP connection: values from Settings first, environment variables as a fallback. */
export function smtpSettings(cfg: Config, env: Env) {
  const from = cfg.mailFrom.trim();
  return {
    from,
    host: cfg.smtpHost.trim() || env.smtpHost,
    port: cfg.smtpPort || env.smtpPort || 465,
    user: cfg.smtpUser.trim() || env.smtpUser || from,
    pass: cfg.smtpPassword || env.smtpPass,
    passSource: cfg.smtpPassword ? 'settings' : env.smtpPass ? 'environment' : '',
  };
}

/** Any SMTP server with a password – for Google Workspace / Gmail that is an App Password (2-step verification on). */
export class SmtpMailer implements Mailer {
  readonly kind = 'smtp';
  private transport: Transporter;
  private s: ReturnType<typeof smtpSettings>;
  constructor(cfg: Config, env: Env) {
    this.s = smtpSettings(cfg, env);
    this.transport = nodemailer.createTransport({
      host: this.s.host, port: this.s.port, secure: this.s.port === 465,
      auth: { user: this.s.user, pass: this.s.pass },
    });
  }
  private check() {
    if (!this.s.from) throw new Error('"Send from" address not set (Settings → Mail)');
    if (!this.s.host) throw new Error('SMTP server not set (Settings → Mail)');
    if (!this.s.pass) throw new Error('SMTP password not set (Settings → Mail)');
  }
  async send(m: OutgoingMail) {
    this.check();
    await this.transport.sendMail({
      from: fromHeader(m.senderName, this.s.from), to: m.to.join(', '), cc: m.cc.length ? m.cc.join(', ') : undefined,
      replyTo: m.replyTo || undefined, subject: m.subject, html: m.html, text: m.text,
    });
  }
  describe() {
    const missing = [!this.s.from && '"Send from" not set', !this.s.host && 'server not set', !this.s.pass && 'PASSWORD NOT SET'].filter(Boolean);
    return `SMTP as ${this.s.user || '?'} via ${this.s.host || '?'}:${this.s.port}` + (missing.length ? ` – ${missing.join(', ')}` : '');
  }
}

/**
 * Gmail API with domain-wide delegation, without any key file: the Cloud Run service account
 * signs a JWT through the IAM Credentials API and exchanges it for an access token that acts as `from`.
 * Needs: (1) the Workspace admin to authorise the service account's client ID for scope
 * https://www.googleapis.com/auth/gmail.send and (2) roles/iam.serviceAccountTokenCreator on itself.
 */
export class GmailDelegatedMailer implements Mailer {
  readonly kind = 'gmail';
  private auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  private cached: { token: string; exp: number } | null = null;
  constructor(private from: string) {}

  private async serviceAccountEmail(): Promise<string> {
    const creds = await this.auth.getCredentials();
    if (!creds.client_email) throw new Error('No service-account identity available (not running on Google Cloud?)');
    return creds.client_email;
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.exp - 60 > now) return this.cached.token;
    const sa = await this.serviceAccountEmail();
    const claims = { iss: sa, sub: this.from, scope: 'https://www.googleapis.com/auth/gmail.send', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
    const client = await this.auth.getClient();
    const signRes = await client.request<{ signedJwt: string }>({
      url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(sa)}:signJwt`,
      method: 'POST', data: { payload: JSON.stringify(claims) },
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signRes.data.signedJwt }),
    });
    const body = (await tokenRes.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!tokenRes.ok || !body.access_token) {
      throw new Error(`Domain-wide delegation failed for ${sa} → ${this.from}: ${body.error_description || body.error || tokenRes.status}. ` +
        'Authorise the service account client ID for scope gmail.send in admin.google.com → Security → API controls → Domain-wide delegation.');
    }
    this.cached = { token: body.access_token, exp: now + (body.expires_in || 3600) };
    return body.access_token;
  }

  async send(m: OutgoingMail) {
    if (!this.from) throw new Error('"Send from" address not set (Settings → Mail)');
    const composer = new MailComposer({
      from: fromHeader(m.senderName, this.from), to: m.to.join(', '), cc: m.cc.length ? m.cc.join(', ') : undefined,
      replyTo: m.replyTo || undefined, subject: m.subject, html: m.html, text: m.text,
    });
    const raw = await composer.compile().build();
    const token = await this.accessToken();
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: raw.toString('base64url') }),
    });
    if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  describe() { return `Gmail API as ${this.from || '? ("Send from" not set)'} via domain-wide delegation of the service account`; }
}

export function createMailer(cfg: Config, env: Env): Mailer {
  switch (cfg.mailTransport) {
    case 'smtp': return new SmtpMailer(cfg, env);
    case 'gmail': return new GmailDelegatedMailer(cfg.mailFrom.trim());
    default: return new LogMailer();
  }
}
