import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fmtDateTime, fmtTime, qk } from '../api';
import type { Me, Overview, ReportToday, RunOutcome, RunRecord } from '../types';
import { Badge, Banner, Button, Card, ErrorBox, LinkButton, Loader, PageHead, Stat, statusLabel, statusTone } from '../components/ui';
import { useToast } from '../components/toast';

function outcomeText(o: RunOutcome): string {
  if (o.locked) return 'Another run is in progress – try again in a minute.';
  return o.results.map((r) => `${r.key.replace(/_/g, ' ').toLowerCase()}: ${statusLabel(r.status).toLowerCase()}${r.message && r.status !== 'ALREADY_DONE' ? ' – ' + r.message : ''}`).join(' · ');
}

export default function Today() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = qc.getQueryData<Me>(qk.me);
  const ov = useQuery({ queryKey: qk.today, queryFn: () => api<Overview>('/today'), refetchInterval: 60_000 });
  const runs = useQuery({ queryKey: qk.runs, queryFn: () => api<RunRecord[]>('/runs') });
  const [showRuns, setShowRuns] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: qk.today }); qc.invalidateQueries({ queryKey: qk.runs }); qc.invalidateQueries({ queryKey: ['mail-log'] }); };

  const run = useMutation({
    mutationFn: (p: { path: string; body?: unknown }) => api<RunOutcome>(p.path, { method: 'POST', body: p.body ?? {} }),
    onSuccess: (o) => { toast(outcomeText(o), o.results.some((r) => r.status === 'FAILED') ? 'bad' : 'good'); refresh(); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });
  const busy = (k: string) => run.isPending && run.variables?.path.includes(k);

  if (ov.isLoading) return <Loader />;
  if (ov.error || !ov.data) return <ErrorBox error={ov.error} />;
  const d = ov.data;
  const morning = d.reports.filter((r) => r.batch === 'morning');
  const evening = d.reports.filter((r) => r.batch === 'evening');
  const sendLabel = (r: ReportToday) => (r.status === 'FAILED' ? 'Retry' : r.status === 'DUE' ? 'Send now' : 'Send again');

  const ReportCard = ({ r }: { r: ReportToday }) => (
    <div className="card tight report">
      <div>
        <div className="row"><span className="t">{r.title}</span><Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge></div>
        <div className="meta">{r.owner ? `${r.owner} · ` : ''}{r.when}</div>
        <div className="meta">{r.status === 'NOT_DUE' ? `Not due: ${r.detail}` : r.status === 'FAILED' ? <span style={{ color: 'var(--red)' }}>{r.detail}</span> : r.detail}{r.at ? ` · ${fmtTime(r.at)}` : ''}</div>
        {r.to.length > 0 && <div className="to">To: {r.to.join(', ')}</div>}
      </div>
      <div className="btns">
        <LinkButton size="sm" to={`/reports/${r.key}`}>Preview</LinkButton>
        {r.logId && <LinkButton size="sm" variant="ghost" to={`/mail-log?open=${r.logId}`}>View sent</LinkButton>}
        {(r.status === 'DUE' || r.status === 'FAILED' || (me?.role === 'admin' && r.status !== 'NOT_DUE')) && (
          <Button size="sm" variant={r.status === 'DUE' || r.status === 'FAILED' ? 'primary' : ''} busy={busy(`/reports/${r.key}/`)}
            onClick={() => { const force = r.status !== 'DUE' && r.status !== 'FAILED'; if (!force || confirm('This report already went out today. Send it again?')) run.mutate({ path: `/reports/${r.key}/send`, body: { force } }); }}>
            {sendLabel(r)}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHead title={d.dateNice} sub={d.dryRun ? 'Dry run – every mail goes only to the admin address' : 'Live – mails go to the real recipients'}>
        <Button busy={busy('/runs/morning')} onClick={() => run.mutate({ path: '/runs/morning' })}>Run morning reports</Button>
        <Button busy={busy('/runs/evening')} onClick={() => run.mutate({ path: '/runs/evening' })}>Run evening digest</Button>
        <Button variant="ghost" busy={busy('preview-to-me')} onClick={() => run.mutate({ path: '/reports/preview-to-me' })}>Send all previews to me</Button>
      </PageHead>

      {d.problems.length > 0 && (
        <Banner tone="amber"><div><b>Attention needed</b><ul className="plain">{d.problems.map((p) => <li key={p}>{p}</li>)}</ul><Link to="/settings">Open Settings</Link></div></Banner>
      )}
      <div className="stats">
        <Stat to="/course-plans" value={d.counts.pendingCoursePlans} label="Course plans pending" bad={d.counts.pendingCoursePlans > 0} />
        <Stat to="/student-profiles" value={d.counts.pendingProfiles} label="Profiles pending" bad={d.counts.pendingProfiles > 0} />
        <Stat to="/queries" value={d.counts.openQueries} label="Queries open" bad={d.counts.openQueries > 0} />
        <Stat to="/tracker" value={d.counts.trackerError ? '!' : `${d.counts.tasksInProgress}${d.counts.tasksOverdue ? ` / ${d.counts.tasksOverdue}` : ''}`} label={d.counts.trackerError ? 'Tracker unreadable' : d.counts.tasksOverdue ? 'Tasks in progress / overdue' : 'Tasks in progress'} bad={!!d.counts.trackerError || d.counts.tasksOverdue > 0} />
      </div>

      <h2 style={{ margin: '6px 0 8px' }}>Morning · 09:00 IST</h2>
      {morning.map((r) => <ReportCard key={r.key} r={r} />)}
      <h2 style={{ margin: '14px 0 8px' }}>Evening · 17:30 IST</h2>
      {evening.map((r) => <ReportCard key={r.key} r={r} />)}

      <Card>
        <div className="row between"><h2>Recent runs</h2><Button size="sm" variant="ghost" onClick={() => setShowRuns((s) => !s)}>{showRuns ? 'Hide' : 'Show'}</Button></div>
        {showRuns && (runs.data?.length ? (
          <div className="stack">{runs.data.map((r) => (
            <div key={r.id} className="small"><b>{fmtDateTime(r.startedAt)}</b> · {r.mode} · {r.trigger}<div className="muted">{r.results.join(' · ')}</div>{r.problems.length > 0 && <div style={{ color: 'var(--red)' }}>{r.problems.join(' · ')}</div>}</div>
          ))}</div>
        ) : <p className="muted small">No runs yet.</p>)}
        <p className="muted tiny" style={{ marginTop: 8 }}>Mail: {d.transport}</p>
      </Card>
    </>
  );
}
