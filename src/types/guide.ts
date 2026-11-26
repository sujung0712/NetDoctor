import type { FaultType } from './diagnosis';

export type CommandId =
  | 'ipconfig'
  | 'ping'
  | 'nslookup'
  | 'tracert'
  | 'test-netconnection';

export type CommandCategory =
  | 'CONFIGURATION'
  | 'CONNECTIVITY'
  | 'DNS'
  | 'ROUTING'
  | 'PORT_DIAGNOSTICS';

export const COMMAND_CATEGORY_LABELS: Record<CommandCategory, string> = {
  CONFIGURATION: 'IP 및 어댑터 구성',
  CONNECTIVITY: '연결성 점검',
  DNS: 'DNS 이름 해석',
  ROUTING: '경로 추적',
  PORT_DIAGNOSTICS: '포트·TCP 점검',
};

export interface CommandSafeExample {
  label: string;
  command: string;
  purpose: string;
}

export interface CommandInterpretation {
  pattern: string;
  status: 'normal' | 'warning' | 'error';
  meaning: string;
  safeNextStep: string;
}

export interface WindowsCommandGuide {
  id: CommandId;
  command: string;
  title: string;
  category: CommandCategory;
  shell: 'CMD' | 'PowerShell' | 'CMD / PowerShell';
  relatedFaultTypes: FaultType[];
  summary: string;
  safeExamples: CommandSafeExample[];
  executionSteps: string[];
  sampleOutput: string;
  interpretations: CommandInterpretation[];
  officialDocTitle: string;
  officialDocUrl: string;
  safetyNote: string;
  tags: string[];
}
