import DatasetPage, { type DatasetDef } from '../components/DatasetPage';
import { Badge } from '../components/ui';

const S = (v: unknown) => String(v ?? '');
const pendingOf = (r: Record<string, unknown>) => (r.created ? 0 : r.studentName || r.admissionNo ? 1 : Number(r.count) || 0);

export default function StudentProfiles() {
  const def: DatasetDef = {
    ds: 'student-profiles', title: 'Student profiles', singular: 'student', importTabLabel: 'Student Profiles',
    intro: 'One row per student whose profile has to be created (tick "Profile created" when done), or one row per department/batch with just a pending count. The morning report groups them by department, batch and responsible faculty.',
    fields: [
      { key: 'department', label: 'Department', placeholder: 'CSE' },
      { key: 'batch', label: 'Batch', placeholder: '2026-30' },
      { key: 'studentName', label: 'Student name' },
      { key: 'admissionNo', label: 'Admission no' },
      { key: 'responsibleFaculty', label: 'Responsible faculty' },
      { key: 'count', label: 'Pending count (group row)', type: 'number', help: 'Only for a row without a student name: how many profiles of this batch are still pending.' },
      { key: 'created', label: 'Profile created', type: 'checkbox', full: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea', full: true },
    ],
    columns: [
      { key: 'studentName', label: 'Student', render: (r) => r.studentName || r.admissionNo ? <><b>{S(r.studentName)}</b> <span className="muted tiny">{S(r.admissionNo)}</span></> : <i>Group of {S(r.count)}</i> },
      { key: 'department', label: 'Dept' },
      { key: 'batch', label: 'Batch' },
      { key: 'responsibleFaculty', label: 'Responsible faculty' },
      { key: 'created', label: 'Profile', render: (r) => <Badge tone={r.created ? 'green' : 'amber'}>{r.created ? 'Created' : `Pending${!r.studentName && Number(r.count) > 1 ? ` × ${r.count}` : ''}`}</Badge> },
    ],
    filters: [
      { key: 'pending', label: 'Pending', test: (r) => pendingOf(r) > 0 },
      { key: 'created', label: 'Created', test: (r) => !!r.created },
      { key: 'all', label: 'All', test: () => true },
    ],
    searchText: (r) => [r.studentName, r.admissionNo, r.department, r.batch, r.responsibleFaculty].map(S).join(' '),
    sort: (a, b) => S(a.department).localeCompare(S(b.department)) || S(a.batch).localeCompare(S(b.batch)) || S(a.studentName).localeCompare(S(b.studentName)),
    quick: [
      { label: 'Mark created', variant: 'primary', show: (r) => !r.created && !!(r.studentName || r.admissionNo), patch: () => ({ created: true }) },
      { label: 'Undo', show: (r) => !!r.created, patch: () => ({ created: false }) },
    ],
    bulkHint: 'Department | Batch | Student Name | Admission No | Profile Created (Yes/No) | Responsible Faculty  —  or  Department | Batch | Students Pending | Responsible Faculty',
    rowClass: (r) => (r.created ? 'dim' : ''),
  };
  return <DatasetPage def={def} />;
}
