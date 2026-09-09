import { sheets as sheetsApi, auth as gauth } from '@googleapis/sheets';
import { parseTable, tasksFromTable, type Table } from './lib/tables.js';
import type { Task } from './types.js';

/** Read-only access to the dev team's tracking spreadsheet through the Sheets API. */
export interface SheetMeta { title: string; tabs: Array<{ title: string; gid: number }> }

export interface SheetReader {
  readTab(sheetId: string, tab: string): Promise<unknown[][]>;
  meta(sheetId: string): Promise<SheetMeta>;
}

export class GoogleSheetReader implements SheetReader {
  private api = sheetsApi({
    version: 'v4',
    auth: new gauth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }),
  });

  async readTab(sheetId: string, tab: string): Promise<unknown[][]> {
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tab.replace(/'/g, "''")}'`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    return (res.data.values || []) as unknown[][];
  }

  async meta(sheetId: string): Promise<SheetMeta> {
    const res = await this.api.spreadsheets.get({ spreadsheetId: sheetId, fields: 'properties.title,sheets.properties(title,sheetId)' });
    return {
      title: res.data.properties?.title || '',
      tabs: (res.data.sheets || []).map((s) => ({ title: s.properties?.title || '', gid: s.properties?.sheetId || 0 })),
    };
  }
}

/** Test double: tabs are given as cell grids. */
export class FakeSheetReader implements SheetReader {
  constructor(public tabs: Record<string, unknown[][]>, public title = 'Project Task tracker', public failWith?: string) {}
  async readTab(_sheetId: string, tab: string): Promise<unknown[][]> {
    if (this.failWith) throw new Error(this.failWith);
    if (!(tab in this.tabs)) throw new Error(`Unable to parse range: '${tab}'`);
    return this.tabs[tab];
  }
  async meta(): Promise<SheetMeta> {
    if (this.failWith) throw new Error(this.failWith);
    return { title: this.title, tabs: Object.keys(this.tabs).map((t, i) => ({ title: t, gid: i })) };
  }
}

export function sheetUrl(sheetId: string, gid?: number): string {
  if (!sheetId) return '';
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit${gid !== undefined ? '#gid=' + gid : ''}`;
}

export interface TrackerSnapshot { tasks: Task[]; table: Table; tab: string; link: string; sheetTitle: string; error?: string }

/** Read and normalise the task tracker tab. Never throws – errors are reported in `error`. */
export async function readTracker(reader: SheetReader, sheetId: string, tab: string): Promise<TrackerSnapshot> {
  const base = { tasks: [] as Task[], table: { headers: [], rows: [], headerRow: -1 } as Table, tab, link: sheetUrl(sheetId), sheetTitle: '' };
  if (!sheetId) return { ...base, error: 'No spreadsheet ID configured (Settings → Google Sheet)' };
  try {
    const [values, meta] = await Promise.all([reader.readTab(sheetId, tab), reader.meta(sheetId).catch(() => null)]);
    const gid = meta?.tabs.find((t) => t.title === tab)?.gid;
    const table = parseTable(values);
    const tasks = tasksFromTable(table);
    return { tasks, table, tab, link: sheetUrl(sheetId, gid), sheetTitle: meta?.title || '' };
  } catch (e) {
    return { ...base, error: friendlySheetError(e, tab) };
  }
}

export function friendlySheetError(e: unknown, tab: string): string {
  const msg = (e as Error)?.message || String(e);
  if (/Unable to parse range/i.test(msg)) return `Tab "${tab}" not found in the spreadsheet`;
  if (/PERMISSION_DENIED|does not have permission|403/i.test(msg)) return 'The service account has no access to the spreadsheet – share it (Viewer) with the service-account e-mail shown in Settings';
  if (/Requested entity was not found|404/i.test(msg)) return 'Spreadsheet not found – check the spreadsheet ID in Settings';
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(msg)) return 'Google credentials lack the Sheets scope (local dev: use the in-memory tracker or a service-account key)';
  return msg;
}
