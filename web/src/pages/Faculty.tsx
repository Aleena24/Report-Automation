import DatasetPage, { type DatasetDef } from '../components/DatasetPage';

const S = (v: unknown) => String(v ?? '');

export default function Faculty() {
  const def: DatasetDef = {
    ds: 'faculty', title: 'Faculty', singular: 'faculty member', importTabLabel: 'Faculty',
    intro: 'Recipients of the attendance-correction notice and reminders. Used only when the "All-faculty address" in Settings is blank; a Google Group address there is simpler if one exists.',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'E-mail', placeholder: 'name@example.edu' },
      { key: 'department', label: 'Department' },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'E-mail' },
      { key: 'department', label: 'Department' },
    ],
    searchText: (r) => [r.name, r.email, r.department].map(S).join(' '),
    sort: (a, b) => S(a.department).localeCompare(S(b.department)) || S(a.name).localeCompare(S(b.name)),
    bulkHint: 'Name | Email | Department',
  };
  return <DatasetPage def={def} />;
}
