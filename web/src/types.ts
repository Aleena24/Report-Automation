export interface Me { email: string; role: 'admin' | 'member'; dryRun: boolean; appName: string; orgName: string; today: string }

export type ReportStatus = 'SENT' | 'DRY_RUN' | 'PREVIEW' | 'SKIPPED' | 'FAILED' | 'DUE' | 'NOT_DUE';
export interface ReportToday {
  key: string; title: string; batch: string; when: string; page: string; owner: string;
  status: ReportStatus; detail: string; to: string[]; subject: string; logId?: string; at?: string;
}
export interface Overview {
  date: string; dateNice: string; dryRun: boolean; transport: string; problems: string[]; reports: ReportToday[];
  schedule: { morning: string; retry: string; evening: string; timeZone: string };
  counts: { pendingCoursePlans: number; pendingProfiles: number; openQueries: number; tasksInProgress: number; tasksOverdue: number; trackerError?: string };
}
export interface JobResult { key: string; status: string; message: string; to: string[]; subject?: string }
export interface RunOutcome { locked: boolean; results: JobResult[]; problems: string[] }
export interface RunRecord { id: string; startedAt: string; finishedAt: string; mode: string; trigger: string; results: string[]; problems: string[] }

export interface MailLogEntry {
  id: string; timestamp: string; date: string; report: string; status: string; to: string[]; cc: string[]; subject: string; details: string; by: string; html?: string;
}
export interface Task { task: string; service: string; type: string; person: string; status: string; start: string; due: string; finished: string; remarks: string; active: boolean; done: boolean }
export interface TrackerResponse { tasks: Task[]; tab: string; link: string; sheetTitle: string; error?: string; headers: string[]; today: string; devTeam: string[]; devTeamNames: string }

export interface FieldMeta { key: string; label: string; help?: string; group: string; type?: 'boolean' | 'number' | 'select' | 'textarea' | 'password'; options?: string[] }
export interface SettingsResponse {
  config: Record<string, unknown>; fields: FieldMeta[]; readOnly: boolean;
  meta: {
    serviceAccountEmail: string; projectId: string; region: string; authMode: string; transport: string; smtpConfigured: boolean;
    smtpPasswordSource: string; appUrl: string; adminsOpen: boolean; schedule: Array<{ job: string; time: string; note: string }>;
  };
}
export interface PreviewResponse { key: string; title: string; date: string; skip: string; subject: string; to: string[]; cc: string[]; replyTo: string; html: string; details: string; dryRun: boolean }
export interface Row { id: string; [k: string]: unknown }
