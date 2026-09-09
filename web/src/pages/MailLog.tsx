import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fmtDateTime, qk, todayKey } from '../api';
import type { MailLogEntry, Me } from '../types';
import { Badge, Button, Dialog, Empty, ErrorBox, Loader, PageHead, statusLabel, statusTone } from '../components/ui';
import { useToast } from '../components/toast';

export default function MailLog() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = qc.getQueryData<Me>(qk.me);
  const [sp, setSp] = useSearchParams();
  const [date, setDate] = useState(sp.get('date') ?? todayKey());
  const [open, setOpen] = useState<string | null>(sp.get('open'));
  const list = useQuery({ queryKey: qk.mailLog(date), queryFn: () => api<MailLogEntry[]>(`/mail-log?${date ? `date=${date}` : 'limit=200'}`) });
  const mail = useQuery({ queryKey: qk.mail(open || ''), queryFn: () => api<MailLogEntry>(`/mail-log/${open}`), enabled: !!open });
  const del = useMutation({
    mutationFn: (id: string) => api(`/mail-log/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast('Log entry removed – the report can be sent again today'); setOpen(null); qc.invalidateQueries({ queryKey: ['mail-log'] }); qc.invalidateQueries({ queryKey: qk.today }); },
    onError: (e) => toast((e as Error).message, 'bad'),
  });
  useEffect(() => { if (sp.get('open')) { setSp({}, { replace: true }); } }, [sp, setSp]);

  return (
    <>
      <PageHead title="Mail log" sub="Every mail the automation sent, skipped or failed. A report is never sent twice on one day.">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
        <Button size="sm" variant={date ? '' : 'primary'} onClick={() => setDate('')}>Latest 200</Button>
      </PageHead>
      {list.isLoading ? <Loader /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.length ? <div className="card"><Empty>Nothing logged{date ? ` on ${date}` : ''}.</Empty></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Report</th><th>Status</th><th>Subject</th><th>To</th><th>Details</th><th /></tr></thead>
            <tbody>{list.data.map((e) => (
              <tr key={e.id} className={e.status === 'SKIPPED' ? 'dim' : ''}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.timestamp)}</td>
                <td>{e.report}</td>
                <td><Badge tone={statusTone(e.status)}>{statusLabel(e.status)}</Badge></td>
                <td>{e.subject}</td>
                <td className="tiny">{e.to.join(', ')}{e.cc.length ? <span className="muted"> · cc {e.cc.join(', ')}</span> : ''}</td>
                <td className="small">{e.details}</td>
                <td className="act">{e.subject && <Button size="sm" variant="ghost" onClick={() => setOpen(e.id)}>View</Button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Dialog open={!!open} onClose={() => setOpen(null)} title={mail.data?.subject || 'Mail'} wide
        footer={<>{me?.role === 'admin' && open && <Button variant="danger" busy={del.isPending} onClick={() => { if (confirm('Remove this log entry? The report may then be sent again today.')) del.mutate(open); }}>Remove entry</Button>}<Button onClick={() => setOpen(null)}>Close</Button></>}>
        {mail.isLoading ? <Loader /> : mail.data ? (
          <>
            <dl className="kv" style={{ marginBottom: 10 }}>
              <dt>Status</dt><dd><Badge tone={statusTone(mail.data.status)}>{statusLabel(mail.data.status)}</Badge> {fmtDateTime(mail.data.timestamp)} · by {mail.data.by}</dd>
              <dt>To</dt><dd>{mail.data.to.join(', ')}</dd>
              <dt>CC</dt><dd>{mail.data.cc.join(', ') || '—'}</dd>
              <dt>Details</dt><dd>{mail.data.details}</dd>
            </dl>
            {mail.data.html ? <iframe className="mail-frame" title="Mail" sandbox="" srcDoc={mail.data.html} /> : <p className="muted">No content stored for this entry.</p>}
          </>
        ) : <ErrorBox error={mail.error} />}
      </Dialog>
    </>
  );
}
