import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qk } from '../api';
import type { FieldMeta, SettingsResponse } from '../types';
import { Banner, Button, Card, ErrorBox, Field, Loader, PageHead } from '../components/ui';
import { useToast } from '../components/toast';

const GROUP_ORDER = ['Mode', 'Recipients', 'Owners', 'Dev team', 'Schedule', 'Google Sheet', 'Mail', 'Access'];
const MAIL_KEYS = ['mailTransport', 'mailFrom', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword'];

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.settings, queryFn: () => api<SettingsResponse>('/settings') });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [health, setHealth] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { if (q.data && !dirty) setDraft(q.data.config); }, [q.data, dirty]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: qk.settings }); qc.invalidateQueries({ queryKey: qk.me }); qc.invalidateQueries({ queryKey: qk.today }); };
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<{ config: Record<string, unknown> }>('/settings', { method: 'PUT', body: patch }),
    onSuccess: () => { toast('Settings saved', 'good'); setDirty(false); invalidate(); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });
  const testMail = useMutation({
    mutationFn: () => {
      const settings: Record<string, unknown> = {};
      for (const k of MAIL_KEYS) if (draft[k] !== q.data?.config[k] && !(k === 'smtpPassword' && !draft[k])) settings[k] = draft[k];
      return api<{ note: string; to: string; transport: string }>('/settings/test-mail', { method: 'POST', body: Object.keys(settings).length ? { settings } : {} });
    },
    onSuccess: (r) => toast(`${r.note} (${r.transport} → ${r.to})`, 'good'), onError: (e) => toast((e as Error).message, 'bad'),
  });
  const forgetPassword = useMutation({
    mutationFn: () => api<{ ok: boolean }>('/settings/smtp-password', { method: 'DELETE' }),
    onSuccess: () => { toast('Stored password removed'); invalidate(); }, onError: (e) => toast((e as Error).message, 'bad'),
  });
  const testSheet = useMutation({
    mutationFn: () => api<Record<string, unknown>>('/settings/test-sheet', { method: 'POST', body: { sheetId: draft.sheetId, tab: draft.trackerTab } }),
    onSuccess: (r) => setSheet(r), onError: (e) => toast((e as Error).message, 'bad'),
  });
  const checkHealth = useMutation({
    mutationFn: () => api<{ problems: string[] }>('/settings/health'),
    onSuccess: (r) => setHealth(r.problems), onError: (e) => toast((e as Error).message, 'bad'),
  });
  const previewAll = useMutation({
    mutationFn: () => api<{ results: Array<{ key: string; status: string }> }>('/reports/preview-to-me', { method: 'POST', body: {} }),
    onSuccess: (r) => toast(`${r.results.filter((x) => x.status === 'PREVIEW').length} preview mails sent to you`, 'good'), onError: (e) => toast((e as Error).message, 'bad'),
  });

  const groups = useMemo(() => {
    const by = new Map<string, FieldMeta[]>();
    for (const f of q.data?.fields || []) by.set(f.group, [...(by.get(f.group) || []), f]);
    return GROUP_ORDER.filter((g) => by.has(g)).map((g) => ({ name: g, fields: by.get(g)! }));
  }, [q.data]);

  if (q.isLoading) return <Loader />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const { meta, readOnly } = q.data;
  const set = (k: string, v: unknown) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };
  const submitPatch = () => {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) if (v !== q.data!.config[k]) patch[k] = v;
    if (!Object.keys(patch).length) { toast('Nothing changed'); return; }
    save.mutate(patch);
  };
  const transport = String(draft.mailTransport || 'log');
  const isMailField = (key: string) => key === 'mailTransport' || key === 'mailFrom' || (transport === 'smtp' && key.startsWith('smtp'));
  const adminTarget = String(draft.adminEmail || '').trim() || String(draft.admins || '').split(/[,;\s]+/).filter(Boolean)[0] || '(no admin address yet)';

  return (
    <>
      <PageHead title="Settings" sub={readOnly ? 'Read-only – only admins can change settings' : 'Recipients, owners, dates and how mails are sent'}>
        <Button onClick={() => checkHealth.mutate()} busy={checkHealth.isPending}>Check configuration</Button>
        <Button onClick={() => previewAll.mutate()} busy={previewAll.isPending}>Send all previews to me</Button>
        {!readOnly && <Button variant="primary" onClick={submitPatch} busy={save.isPending} disabled={!dirty}>Save changes</Button>}
      </PageHead>
      {health && (health.length ? <Banner tone="amber"><div><b>Problems</b><ul className="plain">{health.map((p) => <li key={p}>{p}</li>)}</ul></div></Banner> : <Banner tone="green">Configuration looks complete.</Banner>)}
      {draft.dryRun === true && <Banner tone="navy">Dry run is on: every mail goes only to <b>{adminTarget}</b>, with the real recipients shown in a banner. Switch it off below when the previews look right.</Banner>}

      {groups.map((g) => (
        <Card key={g.name} title={g.name}>
          {g.name === 'Google Sheet' && (
            <div className="banner navy" style={{ display: 'block' }}>
              <div className="small">Share the spreadsheet (Viewer) with the app's service account:</div>
              <div className="mono" style={{ margin: '4px 0' }}>{meta.serviceAccountEmail || '(not running on Google Cloud – local mode)'}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <Button size="sm" onClick={() => { navigator.clipboard?.writeText(meta.serviceAccountEmail); toast('Copied'); }} disabled={!meta.serviceAccountEmail}>Copy address</Button>
                <Button size="sm" onClick={() => testSheet.mutate()} busy={testSheet.isPending}>Test sheet access</Button>
              </div>
              {sheet && <div className="small" style={{ marginTop: 8 }}>{sheet.ok ? <span style={{ color: 'var(--green)' }}>OK – "{String(sheet.sheetTitle)}" / tab "{String(sheet.tab)}": {String(sheet.rows)} rows, {String(sheet.tasks)} tasks. Columns: {(sheet.headers as string[]).join(', ')}</span> : <span style={{ color: 'var(--red)' }}>{String(sheet.error)}</span>}</div>}
            </div>
          )}
          {g.name === 'Mail' && (
            <div className="banner navy" style={{ display: 'block' }}>
              <div className="small">Current transport: <b>{meta.transport}</b></div>
              {transport === 'smtp' && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  <b>Set up in 2 minutes (Google Workspace / Gmail):</b>
                  <ol style={{ margin: '4px 0 4px 18px', padding: 0 }}>
                    <li>Sign in to Google as the <b>Send from</b> mailbox{draft.mailFrom ? <> (<b>{String(draft.mailFrom)}</b>)</> : null}.</li>
                    <li>Turn on 2-Step Verification, then open <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a> and create an app password named "Daily Reports".</li>
                    <li>Paste the 16-character password below, press <b>Send a test mail to me</b>, then <b>Save changes</b>.</li>
                  </ol>
                  Password status: {meta.smtpConfigured ? <span style={{ color: 'var(--green)' }}>stored ({meta.smtpPasswordSource})</span> : <span style={{ color: 'var(--red)' }}>not set</span>}.
                  {' '}Any other SMTP server works too: fill in the server, port and user.
                </div>
              )}
              {transport === 'gmail' && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  No password needed. A Google Workspace <b>super-admin</b> authorises the service account <span className="mono">{meta.serviceAccountEmail || '(service account)'}</span> for the scope <code>https://www.googleapis.com/auth/gmail.send</code> under
                  Admin console → Security → Access and data control → API controls → <b>Manage Domain-wide delegation</b> (use the service account's <i>client ID</i>, shown in the Cloud console). Then press <b>Send a test mail to me</b>.
                </div>
              )}
              {transport === 'log' && <div className="small muted" style={{ marginTop: 6 }}>Nothing is sent while the transport is <b>log</b>. Choose <b>smtp</b> (password) or <b>gmail</b> (delegation) to send real mail.</div>}
              <div className="row" style={{ marginTop: 6 }}>
                <Button size="sm" onClick={() => testMail.mutate()} busy={testMail.isPending}>Send a test mail to me</Button>
                {!readOnly && meta.smtpPasswordSource === 'settings' && <Button size="sm" variant="ghost" onClick={() => { if (confirm('Remove the stored SMTP password?')) forgetPassword.mutate(); }} busy={forgetPassword.isPending}>Remove stored password</Button>}
              </div>
              {dirty && <div className="tiny muted" style={{ marginTop: 4 }}>The test uses the values on screen; remember to Save.</div>}
            </div>
          )}
          {g.name === 'Access' && meta.adminsOpen && (
            <Banner tone="amber">No admins are listed yet, so <b>everyone who can open the app is an admin</b>. Add at least your own address below.</Banner>
          )}
          <div className="form-grid">
            {g.fields.map((f) => {
              if (g.name === 'Mail' && !isMailField(f.key)) return null;
              const v = draft[f.key];
              if (f.type === 'boolean') return <label key={f.key} className="check full"><input type="checkbox" disabled={readOnly} checked={!!v} onChange={(e) => set(f.key, e.target.checked)} /> <span><b>{f.label}</b>{f.help && <div className="help muted small">{f.help}</div>}</span></label>;
              const full = f.type === 'textarea';
              return (
                <Field key={f.key} label={f.label} help={f.help} full={full}>
                  {f.type === 'select' ? <select disabled={readOnly} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                    : f.type === 'textarea' ? <textarea disabled={readOnly} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                    : f.type === 'number' ? <input type="number" min={1} disabled={readOnly} value={String(v ?? '')} onChange={(e) => set(f.key, Number(e.target.value))} />
                    : f.type === 'password' ? <input type="password" autoComplete="new-password" disabled={readOnly} value={String(v ?? '')} placeholder={meta.smtpConfigured ? '•••••••••••••••• (stored – type to replace)' : ''} onChange={(e) => set(f.key, e.target.value)} />
                    : <input type="text" disabled={readOnly} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />}
                </Field>
              );
            })}
          </div>
        </Card>
      ))}

      <Card title="Schedule (Cloud Scheduler → Cloud Run job)">
        <div className="table-wrap" style={{ border: 0 }}><table className="tbl"><thead><tr><th>Job</th><th>Time</th><th>What</th></tr></thead>
          <tbody>{meta.schedule.map((s) => <tr key={s.job}><td>{s.job}</td><td>{s.time}</td><td className="small">{s.note}</td></tr>)}</tbody></table></div>
        <p className="muted tiny" style={{ marginTop: 8 }}>Project {meta.projectId || '—'} · {meta.region || '—'} · sign-in: {meta.authMode} · app URL: {meta.appUrl || '—'}</p>
      </Card>
      {!readOnly && dirty && <div style={{ position: 'sticky', bottom: 'calc(var(--nav-h) + 12px)', display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" onClick={submitPatch} busy={save.isPending}>Save changes</Button></div>}
    </>
  );
}
