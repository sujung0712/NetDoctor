import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CommandId } from './guide';
import type {
  IncidentCreateInput,
  IncidentRecord,
  IncidentUpdateInput,
} from './incident';

export type NavRoute = 'dashboard' | 'diagnosis' | 'guide' | 'history' | 'report';

export const INPUT_LIMITS = {
  TITLE_MAX: 120,
  SYMPTOM_MAX: 500,
  ACTION_NOTES_MAX: 2000,
  SEARCH_MAX: 100,
  ANSWER_NOTE_MAX: 200,
} as const;

export const STORAGE_KEYS = {
  INCIDENTS: 'netdoctor:incidents:v1',
} as const;

export type ComponentTone = 'neutral' | 'cyan' | 'success' | 'warning' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: ReactNode;
}

export interface BadgeProps {
  tone?: ComponentTone;
  children: ReactNode;
  className?: string;
}

export interface CardProps {
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  className?: string;
}

export interface CopyCodeBlockProps {
  code: string;
  label?: string;
  shell?: string;
}

export interface AlertBannerProps {
  tone?: Exclude<ComponentTone, 'neutral'>;
  title: string;
  description?: string;
  className?: string;
}

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export interface DashboardPageProps {
  incidents: IncidentRecord[];
  onStartDiagnosis: () => void;
  onOpenHistory: () => void;
  onOpenReport: (incidentId: string) => void;
  onLoadSampleData: () => void;
  onClearSampleData: () => void;
}

export interface DiagnosisPageProps {
  onSaveIncident: (input: IncidentCreateInput) => IncidentRecord;
  onOpenCommandGuide: (commandId: CommandId) => void;
  onOpenHistory: () => void;
  onOpenReport: (incidentId: string) => void;
}

export interface GuidePageProps {
  initialCommandId?: CommandId;
}

export interface HistoryPageProps {
  incidents: IncidentRecord[];
  onCreateIncident: (input: IncidentCreateInput) => IncidentRecord | null;
  onUpdateIncident: (id: string, patch: IncidentUpdateInput) => IncidentRecord | null;
  onDeleteIncident: (id: string) => boolean;
  onOpenReport: (incidentId: string) => void;
  onStartDiagnosis: () => void;
}

export interface ReportPageProps {
  incidents: IncidentRecord[];
  initialIncidentId?: string;
  onOpenHistory: () => void;
}
