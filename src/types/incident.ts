import type { DiagnosisResult, FaultType, Severity } from './diagnosis';

export type IncidentStatus = 'open' | 'in_progress' | 'resolved';

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: '미해결',
  in_progress: '진행 중',
  resolved: '해결됨',
};

export interface IncidentRecord {
  id: string;
  title: string;
  faultType: FaultType;
  severity: Severity;
  status: IncidentStatus;
  symptomSummary: string;
  userCheckSummary: string[];
  possibleCauses: string[];
  evidence: string[];
  actionNotes: string;
  isSample?: boolean;
  occurredAt: string;
  resolvedAt?: string;
  resolutionMinutes?: number;
  updatedAt: string;
  diagnosisResult?: DiagnosisResult;
}

export interface IncidentCreateInput {
  title: string;
  faultType: FaultType;
  severity: Severity;
  status: IncidentStatus;
  symptomSummary: string;
  userCheckSummary: string[];
  possibleCauses: string[];
  evidence: string[];
  actionNotes: string;
  occurredAt?: string;
  resolvedAt?: string;
  isSample?: boolean;
  diagnosisResult?: DiagnosisResult;
}

export interface IncidentUpdateInput {
  title?: string;
  faultType?: FaultType;
  severity?: Severity;
  status?: IncidentStatus;
  symptomSummary?: string;
  actionNotes?: string;
  occurredAt?: string;
  resolvedAt?: string;
}

export interface IncidentFilter {
  query?: string;
  faultType?: FaultType | 'ALL';
  status?: IncidentStatus | 'ALL';
}

export interface FaultTypeStat {
  faultType: FaultType;
  label: string;
  count: number;
  resolvedCount: number;
}

export interface DashboardStats {
  totalCount: number;
  resolvedCount: number;
  unresolvedCount: number;
  resolutionRate: number;
  averageResolutionMinutes: number | null;
  byFaultType: FaultTypeStat[];
  recentIncidents: IncidentRecord[];
  sampleCount: number;
}

export type ReportFormat = 'markdown' | 'text';

export interface ReportDownloadResult {
  ok: boolean;
  filename?: string;
  byteLength?: number;
  error?: string;
}
