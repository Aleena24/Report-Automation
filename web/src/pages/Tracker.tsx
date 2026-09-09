import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, niceDate, qk } from '../api';
import type { Task, TrackerResponse } from '../types';
import { Badge, Banner, Button, Card, Empty, ErrorBox, Loader, PageHead, Stat } from '../components/ui';

const sameFirst = (a: string, b: string) => a.trim().toLowerCase().split(/\s+/)[0] === b.trim().toLowerCase().split(/\s+/)[0];

export default function Tracker() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.tracker, queryFn: () => api<TrackerResponse>('/tracker') });
  if (q.isLoading) return <Loader />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const d = q.data;
  const today = d.today;
  const active = d.tasks.filter((t) => t.active);
  const overdue = active.filter((t) => t.due && t.due < today);
  const finishedToday = d.tasks.filter((t) => t.finished === today);
  const teamNames = d.devTeamNames.split(/[,;\n]+/).map((s) => s.replace(/<.*$/, '').trim()).filter(Boolean);
  const people = Array.from(new Set(d.tasks.map((t) => t.person).filter(Boolean))).sort((a, b) => {
    const ta = teamNames.some((n) => sameFirst(a, n)) ? 0 : 1, tb = teamNames.some((n) => sameFirst(b, n)) ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });
  const missing = teamNames.filter((n) => !d.tasks.some((t) => sameFirst(t.person, n) && (t.active || t.finished === today)));
  const tone = (t: Task) => (t.done ? 'green' : t.active ? (t.due && t.due < today ? 'red' : 'navy') : 'grey');

  return (
    <>
      <PageHead title="Dev tracker" sub={<>Read from the "{d.tab}" tab of {d.sheetTitle || 'the tracking spreadsheet'}. The dev team keeps updating the sheet; this page and the reports read it live.</>}>
        {d.link && <a className="btn" href={d.link} target="_blank" rel="noreferrer">Open in Google Sheets ↗</a>}
        <Button onClick={() => qc.invalidateQueries({ queryKey: qk.tracker })} busy={q.isFetching}>Refresh</Button>
      </PageHead>
      {d.error && <Banner tone="red"><div><b>Could not read the tracker.</b> {d.error}<br /><span className="small">Check Settings → Google Sheet for the spreadsheet ID and the service-account e-mail the sheet must be shared with.</span></div></Banner>}
      <div className="stats">
        <Stat value={finishedToday.length} label="Finished today" good={finishedToday.length > 0} />
        <Stat value={active.length} label="In progress" />
        <Stat value={overdue.length} label="Overdue" bad={overdue.length > 0} />
        <Stat value={missing.length} label="No update today" bad={missing.length > 0} />
      </div>
      {missing.length > 0 && <Banner tone="amber">Nothing finished today and nothing in progress for: <b>{missing.join(', ')}</b></Banner>}
      {!d.tasks.length && !d.error && <Card><Empty>The tracker has no tasks.</Empty></Card>}
      {people.map((p) => {
        const mine = d.tasks.filter((t) => t.person === p && (!t.done || t.finished === today)).sort((a, b) => Number(b.active) - Number(a.active));
        if (!mine.length) return null;
        return (
          <Card key={p} title={<span className="row">{p}{teamNames.length > 0 && !teamNames.some((n) => sameFirst(p, n)) && <Badge>not in dev team list</Badge>}</span>}>
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="tbl">
                <thead><tr><th>Module</th><th>Task</th><th>Type</th><th>Status</th><th>Started</th><th>Due</th><th>Finished</th><th>Remarks</th></tr></thead>
                <tbody>{mine.map((t, i) => (
                  <tr key={i}>
                    <td>{t.service}</td><td>{t.task}</td><td>{t.type}</td>
                    <td><Badge tone={tone(t)}>{t.finished === today ? 'Done today' : t.status || '—'}</Badge></td>
                    <td>{niceDate(t.start)}</td>
                    <td className={t.active && t.due && t.due < today ? 'overdue' : ''}>{niceDate(t.due)}{t.active && t.due && t.due < today ? ' (overdue)' : ''}</td>
                    <td>{niceDate(t.finished)}</td><td className="small">{t.remarks}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        );
      })}
      {d.tasks.some((t) => !t.person && !t.done) && <p className="muted small">{d.tasks.filter((t) => !t.person && !t.done).length} open task(s) not assigned to anyone.</p>}
    </>
  );
}
