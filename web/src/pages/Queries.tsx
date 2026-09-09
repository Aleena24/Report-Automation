import { useQueryClient } from '@tanstack/react-query';
import DatasetPage, { today, type DatasetDef } from '../components/DatasetPage';
import { Badge } from '../components/ui';
import { niceDate, qk } from '../api';
import { isClosedStatus } from '../status';
import type { Me } from '../types';

const S = (v: unknown) => String(v ?? '');

export default function Queries() {
  const me = useQueryClient().getQueryData<Me>(qk.me);
  const t = me?.today || today();
  const def: DatasetDef = {
    ds: 'queries', title: 'Queries', singular: 'query', importTabLabel: 'Queries',
    intro: 'Queries received by e-mail and queries reported directly to Celerscet. The 09:00 "Daily Status and Query Closure Report" lists everything received or closed since yesterday plus everything still open, with closure remarks.',
    fields: [
      { key: 'receivedOn', label: 'Received on', type: 'date' },
      { key: 'source', label: 'Source', type: 'select', options: ['Email', 'Celerscet', 'Phone', 'In person', 'Other'] },
      { key: 'raisedBy', label: 'Raised by', placeholder: 'Dr. Anitha R / HoD ECE' },
      { key: 'handledBy', label: 'Handled by' },
      { key: 'query', label: 'Query', type: 'textarea', required: true, full: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'Closed'] },
      { key: 'closedOn', label: 'Closed on', type: 'date' },
      { key: 'closureRemarks', label: 'Closure remarks', type: 'textarea', full: true },
    ],
    defaults: () => ({ receivedOn: t, source: 'Email', status: 'Open' }),
    columns: [
      { key: 'receivedOn', label: 'Received', render: (r) => niceDate(S(r.receivedOn)) },
      { key: 'source', label: 'Source', render: (r) => <Badge tone={/celer/i.test(S(r.source)) ? 'navy' : 'grey'}>{S(r.source)}</Badge> },
      { key: 'raisedBy', label: 'Raised by' },
      { key: 'query', label: 'Query', render: (r) => <span style={{ display: 'inline-block', maxWidth: 360 }}>{S(r.query)}</span> },
      { key: 'status', label: 'Status', render: (r) => <Badge tone={isClosedStatus(r.status) ? 'green' : 'red'}>{S(r.status)}</Badge> },
      { key: 'closedOn', label: 'Closed', render: (r) => niceDate(S(r.closedOn)) },
      { key: 'closureRemarks', label: 'Closure remarks' },
      { key: 'handledBy', label: 'Handled by' },
    ],
    filters: [
      { key: 'open', label: 'Open', test: (r) => !isClosedStatus(r.status) },
      { key: 'closed', label: 'Closed', test: (r) => isClosedStatus(r.status) },
      { key: 'all', label: 'All', test: () => true },
    ],
    searchText: (r) => [r.query, r.raisedBy, r.source, r.handledBy, r.closureRemarks].map(S).join(' '),
    sort: (a, b) => Number(isClosedStatus(a.status)) - Number(isClosedStatus(b.status)) || S(b.receivedOn).localeCompare(S(a.receivedOn)),
    quick: [
      { label: 'Close', variant: 'primary', show: (r) => !isClosedStatus(r.status),
        fields: [{ key: 'closureRemarks', label: 'Closure remarks', type: 'textarea', full: true }, { key: 'handledBy', label: 'Handled by' }],
        patch: (_r, extra) => ({ status: 'Closed', closedOn: t, ...extra }) },
      { label: 'Reopen', show: (r) => isClosedStatus(r.status), patch: () => ({ status: 'Open', closedOn: '' }) },
    ],
    bulkHint: 'Date Received | Source (Email / Celerscet) | Raised By | Query | Status | Closed On | Closure Remarks | Handled By',
    rowClass: (r) => (isClosedStatus(r.status) ? 'dim' : ''),
  };
  return <DatasetPage def={def} />;
}
