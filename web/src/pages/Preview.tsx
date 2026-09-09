import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qk } from '../api';
import type { Me, PreviewResponse, RunOutcome } from '../types';
import { Banner, Button, ErrorBox, Loader, PageHead, statusLabel } from '../components/ui';
import { useToast } from '../components/toast';

export default function Preview() {
  const { key = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const date = sp.get('date') || '';
  const qc = useQueryClient();
  const toast = useToast();
  const me = qc.getQueryData<Me>(qk.me);
  const [pick, setPick] = useState(date);
  const q = useQuery({ queryKey: qk.preview(key, date), queryFn: () => api<PreviewResponse>(`/reports/${key}/preview${date ? `?date=${date}` : ''}`) });
  const send = useMutation({
    mutationFn: (body: { force?: boolean; me?: boolean }) => body.me
      ? api<RunOutcome>('/reports/preview-to-me', { method: 'POST', body: { keys: [key] } })
      : api<RunOutcome>(`/reports/${key}/send`, { method: 'POST', body: { force: !!body.force } }),
    onSuccess: (o) => { const r = o.results[0]; toast(o.locked ? 'Another run is in progress' : `${statusLabel(r.status)}${r.message ? ' – ' + r.message : ''}`, r?.status === 'FAILED' ? 'bad' : 'good'); qc.invalidateQueries({ queryKey: qk.today }); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });

  if (q.isLoading) return <Loader />;
  if (q.error || !q.data) return <><PageHead title="Preview" /><ErrorBox error={q.error} /><Link to="/">Back</Link></>;
  const p = q.data;
  return (
    <>
      <PageHead title={p.title} sub={<>Preview for {p.date}{p.dryRun ? ' · dry run: a real send goes only to the admin address' : ''}</>}>
        <input type="date" className="input" value={pick} onChange={(e) => setPick(e.target.value)} style={{ width: 'auto' }} />
        <Button size="sm" onClick={() => setSp(pick ? { date: pick } : {})}>Show</Button>
        <Button busy={send.isPending} onClick={() => send.mutate({ me: true })}>Send to me only</Button>
        {!date && <Button variant="primary" busy={send.isPending} onClick={() => { if (!p.skip || confirm(`Today this report would normally be skipped (${p.skip}). Send anyway?`)) send.mutate({ force: me?.role === 'admin' }); }}>Send now</Button>}
      </PageHead>
      {p.skip && <Banner tone="amber">On {p.date} this report is not due: {p.skip}. The preview below shows what it would contain.</Banner>}
      <div className="card tight">
        <dl className="kv">
          <dt>Subject</dt><dd><b>{p.subject}</b></dd>
          <dt>To</dt><dd>{p.to.join(', ') || <span style={{ color: 'var(--red)' }}>none configured</span>}</dd>
          <dt>CC</dt><dd>{p.cc.join(', ') || '—'}</dd>
          <dt>Reply-To</dt><dd>{p.replyTo || '—'}</dd>
          <dt>Summary</dt><dd>{p.details}</dd>
        </dl>
      </div>
      <iframe className="mail-frame" title="Mail preview" sandbox="" srcDoc={p.html} />
    </>
  );
}
