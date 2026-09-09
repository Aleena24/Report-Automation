import { useQueryClient } from '@tanstack/react-query';
import DatasetPage, { today, type DatasetDef } from '../components/DatasetPage';
import { Badge } from '../components/ui';
import { niceDate, qk } from '../api';
import { isPendingStatus, daysSince } from '../status';
import type { Me, Row } from '../types';

const S = (v: unknown) => String(v ?? '');

export default function CoursePlans() {
  const me = useQueryClient().getQueryData<Me>(qk.me);
  const t = me?.today || today();
  const def: DatasetDef = {
    ds: 'course-plans', title: 'Course plans', singular: 'course plan', importTabLabel: 'Course Plans',
    intro: 'Every plan whose status is not Approved / Rejected / Withdrawn appears in the morning "Pending Course Plan Approvals" report (08–18 Sep). Mark plans Approved as the HoD clears them.',
    fields: [
      { key: 'courseCode', label: 'Course code', placeholder: 'CS301' },
      { key: 'courseName', label: 'Course name', placeholder: 'Data Structures' },
      { key: 'faculty', label: 'Faculty' },
      { key: 'department', label: 'Department', placeholder: 'CSE' },
      { key: 'semester', label: 'Semester', placeholder: 'S3' },
      { key: 'submittedOn', label: 'Submitted on', type: 'date', help: 'Used for "days pending".' },
      { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Submitted', 'Awaiting approval', 'Approved', 'Rejected', 'Withdrawn'] },
      { key: 'approvedOn', label: 'Approved on', type: 'date' },
      { key: 'remarks', label: 'Remarks', type: 'textarea', full: true },
    ],
    defaults: () => ({ status: 'Pending', submittedOn: t }),
    columns: [
      { key: 'course', label: 'Course', render: (r) => <><b>{S(r.courseCode)}</b> {S(r.courseName)}</> },
      { key: 'faculty', label: 'Faculty' },
      { key: 'department', label: 'Dept' },
      { key: 'semester', label: 'Sem' },
      { key: 'submittedOn', label: 'Submitted', render: (r) => { const d = daysSince(S(r.submittedOn), t); return <>{niceDate(S(r.submittedOn))}{d !== null && isPendingStatus(r.status) && <span className={`tiny ${d > 7 ? 'overdue' : 'muted'}`}> · {d} d</span>}</>; } },
      { key: 'status', label: 'Status', render: (r) => <Badge tone={isPendingStatus(r.status) ? 'amber' : /^rej|^with/i.test(S(r.status)) ? 'red' : 'green'}>{S(r.status) || 'Pending'}</Badge> },
    ],
    filters: [
      { key: 'pending', label: 'Pending', test: (r) => isPendingStatus(r.status) },
      { key: 'all', label: 'All', test: () => true },
    ],
    searchText: (r) => [r.courseCode, r.courseName, r.faculty, r.department, r.semester, r.status].map(S).join(' '),
    sort: (a, b) => Number(isPendingStatus(b.status)) - Number(isPendingStatus(a.status)) || S(a.submittedOn).localeCompare(S(b.submittedOn)),
    quick: [{ label: 'Approve', variant: 'primary', show: (r) => isPendingStatus(r.status), patch: () => ({ status: 'Approved', approvedOn: t }) }],
    bulkHint: 'Course Code | Course Name | Faculty | Department | Semester | Submitted On | Status',
    rowClass: (r: Row) => (isPendingStatus(r.status) ? '' : 'dim'),
  };
  return <DatasetPage def={def} />;
}
