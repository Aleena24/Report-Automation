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
  describe() { return 'Not sending – mails are only recorded in the Mail Log. Choose SMTP or Gmail in Settings to send for real.'; }
}

function fromHeader(name: string, from: string): string {
  return `"${(name || APP_NAME).replace(/"/g, "'")}" <${from}>`;
}

/** Gmail SMTP with an App Password (2-step verification must be on for the sending account). */
export class SmtpMailer implements Mailer {
  readonly kind = 'smtp';
  private transport: Transporter;
  constructor(private from: string, private env: Env) {
    this.transport = nodemailer.createTransport({
      host: env.smtpHost, port: env.smtpPort, secure: env.smtpPort === 465,
      auth: { user: env.smtpUser || from, pass: env.smtpPass },
    });
  }
  async send(m: OutgoingMail) {
    if (!this.env.smtpPass) throw new Error('SMTP password not configured (run infra/set-smtp-password.sh)');
    await this.transport.sendMail({
      from: fromHeader(m.senderName, this.from), to: m.to.join(', '), cc: m.cc.length ? m.cc.join(', ') : undefined,
      replyTo: m.replyTo || undefined, subject: m.subject, html: m.html, text: m.text,
    });
  }
  describe() {
    return `Gmail SMTP as ${this.env.smtpUser || this.from} via ${this.env.smtpHost}:${this.env.smtpPort}` + (this.env.smtpPass ? '' : ' – PASSWORD NOT SET');
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
  describe() { return `Gmail API as ${this.from} via domain-wide delegation of the service account`; }
}

export function createMailer(cfg: Config, env: Env): Mailer {
  switch (cfg.mailTransport) {
    case 'smtp': return new SmtpMailer(cfg.mailFrom, env);
    case 'gmail': return new GmailDelegatedMailer(cfg.mailFrom);
    default: return new LogMailer();
  }
}
