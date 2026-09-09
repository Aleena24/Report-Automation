import { useMemo, useState, type ReactNode, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qk, todayKey } from '../api';
import type { Me, Row } from '../types';
import { Button, Dialog, Empty, ErrorBox, Field, Loader, PageHead } from './ui';
import { useToast } from './toast';

export interface FieldDef {
  key: string; label: string; type?: 'text' | 'date' | 'select' | 'number' | 'checkbox' | 'textarea';
  options?: string[]; required?: boolean; placeholder?: string; full?: boolean; help?: string;
}
export interface ColumnDef { key: string; label: string; render?: (row: Row) => ReactNode; num?: boolean }
export interface QuickAction {
  label: string; variant?: '' | 'primary' | 'danger'; show: (row: Row) => boolean; fields?: FieldDef[];
  patch: (row: Row, extra: Record<string, unknown>) => Record<string, unknown>;
}
export interface FilterDef { key: string; label: string; test: (row: Row) => boolean }
export interface DatasetDef {
  ds: string; title: string; singular: string; intro?: ReactNode; fields: FieldDef[]; columns: ColumnDef[];
  filters?: FilterDef[]; defaultFilter?: string; searchText: (row: Row) => string; sort?: (a: Row, b: Row) => number;
  quick?: QuickAction[]; bulkHint: string; rowClass?: (row: Row) => string; defaults?: () => Record<string, unknown>;
  importTabLabel: string;
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));

function FieldInput({ f, value, onChange, autoFocus }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; autoFocus?: boolean }) {
  if (f.type === 'checkbox') {
    return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}</label>;
  }
  const common = { required: f.required, placeholder: f.placeholder, autoFocus };
  let input: ReactNode;
  if (f.type === 'select') input = <select value={s(value)} onChange={(e) => onChange(e.target.value)} {...common}>{(f.options || []).map((o) => <option key={o} value={o}>{o || '—'}</option>)}</select>;
  else if (f.type === 'textarea') input = <textarea value={s(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
  else if (f.type === 'number') input = <input type="number" min={0} value={s(value)} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} {...common} />;
  else input = <input type={f.type === 'date' ? 'date' : 'text'} value={s(value)} onChange={(e) => onChange(e.target.value)} {...common} />;
  return <Field label={f.label} help={f.help} full={f.full}>{input}</Field>;
}

export default function DatasetPage({ def }: { def: DatasetDef }) {
  const qc = useQueryClient();
  const toast = useToast();
  const me = qc.getQueryData<Me>(qk.me);
  const isAdmin = me?.role === 'admin';
  const list = useQuery({ queryKey: qk.data(def.ds), queryFn: () => api<Row[]>(`/data/${def.ds}`) });
  const [filter, setFilter] = useState(def.defaultFilter || def.filters?.[0]?.key || '');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [bulk, setBulk] = useState<string | null>(null);
  const [imp, setImp] = useState<{ tab: string; replace: boolean } | null>(null);
  const [quick, setQuick] = useState<{ row: Row; action: QuickAction; extra: Record<string, unknown> } | null>(null);

  const refresh = () => { qc.invalidateQueries({ queryKey: qk.data(def.ds) }); qc.invalidateQueries({ queryKey: qk.today }); };
  const fail = (e: unknown) => toast((e as Error).message || String(e), 'bad');

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => editing && editing !== 'new'
      ? api<Row>(`/data/${def.ds}/${editing.id}`, { method: 'PUT', body: v })
      : api<Row>(`/data/${def.ds}`, { method: 'POST', body: v }),
    onSuccess: () => { toast('Saved', 'good'); setEditing(null); refresh(); }, onError: fail,
  });
  const patch = useMutation({
    mutationFn: ({ id, v }: { id: string; v: Record<string, unknown> }) => api<Row>(`/data/${def.ds}/${id}`, { method: 'PUT', body: v }),
    onSuccess: () => { setQuick(null); refresh(); }, onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/data/${def.ds}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast('Deleted'); refresh(); }, onError: fail,
  });
  const bulkAdd = useMutation({
    mutationFn: (text: string) => api<{ added: number; headers: string[] }>(`/data/${def.ds}/bulk`, { method: 'POST', body: { text } }),
    onSuccess: (r) => { toast(`Added ${r.added} row${r.added === 1 ? '' : 's'} (columns: ${r.headers.join(', ')})`, 'good'); setBulk(null); refresh(); }, onError: fail,
  });
  const importTab = useMutation({
    mutationFn: (o: { tab: string; replace: boolean }) => api<{ added: number; removed: number; tab: string }>(`/data/${def.ds}/import`, { method: 'POST', body: o }),
    onSuccess: (r) => { toast(`Imported ${r.added} rows from "${r.tab}"${r.removed ? `, replaced ${r.removed}` : ''}`, 'good'); setImp(null); refresh(); }, onError: fail,
  });
  const clearAll = useMutation({
    mutationFn: () => api<{ removed: number }>(`/data/${def.ds}`, { method: 'DELETE' }),
    onSuccess: (r) => { toast(`Removed ${r.removed} rows`); refresh(); }, onError: fail,
  });

  const rows = useMemo(() => {
    let r = list.data || [];
    const f = def.filters?.find((x) => x.key === filter);
    if (f) r = r.filter(f.test);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((row) => def.searchText(row).toLowerCase().includes(q));
    if (def.sort) r = [...r].sort(def.sort);
    return r;
  }, [list.data, filter, search, def]);

  const openNew = () => { setDraft(def.defaults ? def.defaults() : {}); setEditing('new'); };
  const openEdit = (row: Row) => { const { id: _id, updatedAt: _a, updatedBy: _b, ...rest } = row; setDraft(rest); setEditing(row); };
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(draft); };
  const runQuick = (row: Row, action: QuickAction) => {
    if (action.fields?.length) setQuick({ row, action, extra: {} });
    else patch.mutate({ id: row.id, v: action.patch(row, {}) });
  };

  return (
    <>
      <PageHead title={def.title} sub={list.data ? `${rows.length} of ${list.data.length}` : undefined}>
        <Button variant="primary" onClick={openNew}>+ Add {def.singular}</Button>
        <Button onClick={() => setBulk('')}>Paste rows</Button>
        <Button onClick={() => setImp({ tab: '', replace: false })}>Import from sheet</Button>
        {isAdmin && list.data && list.data.length > 0 && <Button variant="danger" onClick={() => { if (confirm(`Delete ALL ${list.data!.length} ${def.title.toLowerCase()}?`)) clearAll.mutate(); }}>Clear all</Button>}
      </PageHead>
      {def.intro && <p className="muted small" style={{ marginBottom: 12 }}>{def.intro}</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        {def.filters && <div className="chips">{def.filters.map((f) => <button key={f.key} className={`chip ${filter === f.key ? 'on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}</div>}
        <input className="input search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {list.isLoading ? <Loader /> : list.error ? <ErrorBox error={list.error} /> : !rows.length ? (
        <div className="card"><Empty>{list.data?.length ? 'Nothing matches this filter.' : <>No {def.title.toLowerCase()} yet. Add one, paste rows from Excel / Sheets, or import the "{def.importTabLabel}" tab.</>}</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>{def.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={def.rowClass?.(row) || ''}>
                  {def.columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render ? c.render(row) : s(row[c.key])}</td>)}
                  <td className="act">
                    {def.quick?.filter((a) => a.show(row)).map((a) => <Button key={a.label} size="sm" variant={a.variant || ''} onClick={() => runQuick(row, a)} style={{ marginRight: 6 }}>{a.label}</Button>)}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete this row?')) remove.mutate(row.id); }}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? `Add ${def.singular}` : `Edit ${def.singular}`}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" form="dataset-form" type="submit" busy={save.isPending}>Save</Button></>}>
        <form id="dataset-form" onSubmit={submit} className="form-grid">
          {def.fields.map((f, i) => <FieldInput key={f.key} f={f} value={draft[f.key]} autoFocus={i === 0} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />)}
        </form>
      </Dialog>

      <Dialog open={bulk !== null} onClose={() => setBulk(null)} title={`Paste ${def.title.toLowerCase()}`}
        footer={<><Button onClick={() => setBulk(null)}>Cancel</Button><Button variant="primary" busy={bulkAdd.isPending} onClick={() => bulkAdd.mutate(bulk || '')}>Add rows</Button></>}>
        <p className="small muted">Copy the rows from Excel or Google Sheets (including the header row) and paste them here. Column names are matched by meaning, e.g. {def.bulkHint}.</p>
        <textarea className="input" style={{ minHeight: 220, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={bulk || ''} onChange={(e) => setBulk(e.target.value)} placeholder={def.bulkHint} />
      </Dialog>

      <Dialog open={imp !== null} onClose={() => setImp(null)} title="Import from the tracking spreadsheet"
        footer={<><Button onClick={() => setImp(null)}>Cancel</Button><Button variant="primary" busy={importTab.isPending} onClick={() => imp && importTab.mutate(imp)}>Import</Button></>}>
        <p className="small muted">Reads a tab of the spreadsheet configured in Settings (it must be shared with the service account). Leave the tab name blank to use "{def.importTabLabel}".</p>
        <Field label="Tab name"><input type="text" value={imp?.tab || ''} placeholder={def.importTabLabel} onChange={(e) => setImp((o) => ({ tab: e.target.value, replace: !!o?.replace }))} /></Field>
        {isAdmin && <label className="check"><input type="checkbox" checked={!!imp?.replace} onChange={(e) => setImp((o) => ({ tab: o?.tab || '', replace: e.target.checked }))} /> Replace all existing rows</label>}
      </Dialog>

      <Dialog open={quick !== null} onClose={() => setQuick(null)} title={quick?.action.label || ''}
        footer={<><Button onClick={() => setQuick(null)}>Cancel</Button><Button variant="primary" busy={patch.isPending} onClick={() => quick && patch.mutate({ id: quick.row.id, v: quick.action.patch(quick.row, quick.extra) })}>{quick?.action.label}</Button></>}>
        {quick?.action.fields?.map((f, i) => <FieldInput key={f.key} f={f} value={quick.extra[f.key] ?? quick.row[f.key]} autoFocus={i === 0} onChange={(v) => setQuick((q) => q && ({ ...q, extra: { ...q.extra, [f.key]: v } }))} />)}
      </Dialog>
    </>
  );
}

export const today = todayKey;
