import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, qk } from '../api';
import type { Overview } from '../types';
import { PageHead } from '../components/ui';

export default function DataHub() {
  const ov = useQuery({ queryKey: qk.today, queryFn: () => api<Overview>('/today') });
  const c = ov.data?.counts;
  const owner = (key: string) => ov.data?.reports.find((r) => r.key === key)?.owner || '';
  const report = (key: string, what: string) => { const o = owner(key); return o ? `${what} (${o})` : what; };
  const cards = [
    { to: '/course-plans', title: 'Course plans', sub: `Pending approvals → ${report('COURSE_PLANS', 'morning course-plan report')}`, n: c?.pendingCoursePlans, l: 'pending' },
    { to: '/student-profiles', title: 'Student profiles', sub: `Profiles not yet created → ${report('STUDENT_PROFILES', 'morning student-profile report')}`, n: c?.pendingProfiles, l: 'pending' },
    { to: '/queries', title: 'Queries', sub: `E-mail and ERP queries → ${report('STATUS_REPORT', 'daily status & query closure report')}`, n: c?.openQueries, l: 'open' },
    { to: '/tracker', title: 'Dev tracker', sub: 'Task tracker sheet → status report & evening digest', n: c?.tasksInProgress, l: 'in progress' },
    { to: '/faculty', title: 'Faculty', sub: `Recipients of the attendance notice${owner('ATTENDANCE') ? ` (${owner('ATTENDANCE')})` : ''}`, n: undefined, l: '' },
  ];
  return (
    <>
      <PageHead title="Data" sub="What each report is built from" />
      <div className="grid">
        {cards.map((k) => (
          <Link key={k.to} to={k.to} className="card" style={{ textDecoration: 'none', color: 'inherit', marginBottom: 0 }}>
            <div className="row between"><h2>{k.title}</h2>{k.n !== undefined && <span className="badge navy">{k.n} {k.l}</span>}</div>
            <p className="muted small" style={{ margin: '6px 0 0' }}>{k.sub}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
