import type { CommandId } from './guide';

export type FaultType =
  | 'NO_INTERNET'
  | 'VPN_FAILURE'
  | 'DNS_ERROR'
  | 'SLOW_NETWORK'
  | 'INTERMITTENT_DROP';

export const FAULT_TYPES: FaultType[] = [
  'NO_INTERNET',
  'VPN_FAILURE',
  'DNS_ERROR',
  'SLOW_NETWORK',
  'INTERMITTENT_DROP',
];

export const FAULT_TYPE_LABELS: Record<FaultType, string> = {
  NO_INTERNET: '인터넷 연결 불가',
  VPN_FAILURE: 'VPN 연결 실패',
  DNS_ERROR: 'DNS 오류',
  SLOW_NETWORK: '네트워크 속도 저하',
  INTERMITTENT_DROP: '연결 끊김',
};

export const FAULT_TYPE_DESCRIPTIONS: Record<FaultType, string> = {
  NO_INTERNET: '웹·업무 앱 등 모든 외부 네트워크 연결이 전혀 되지 않는 상태',
  VPN_FAILURE: '원격 접속 VPN 연결이 실패하거나 로그인·터널 수립 단계에서 중단됨',
  DNS_ERROR: 'IP 통신은 가능하거나 일부 환경은 정상이나 도메인 이름 해석이 실패함',
  SLOW_NETWORK: '연결은 유지되지만 페이지 로딩, 화상회의, 파일 전송이 현저히 느림',
  INTERMITTENT_DROP: '일정 간격 또는 불규칙하게 네트워크 연결이 끊어졌다가 다시 연결됨',
};

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '심각',
};

export type AnswerValue = 'yes' | 'no' | 'unknown';

export const ANSWER_VALUE_LABELS: Record<AnswerValue, string> = {
  yes: '예',
  no: '아니오',
  unknown: '모름',
};

export interface QuestionOption {
  value: AnswerValue;
  label: string;
  hint?: string;
}

export interface DiagnosticQuestion {
  id: string;
  faultType: FaultType;
  prompt: string;
  description?: string;
  recommendedCommandId?: CommandId;
  options: QuestionOption[];
}

export interface DiagnosticAnswer {
  questionId: string;
  questionPrompt: string;
  value: AnswerValue;
  valueLabel: string;
  note?: string;
  answeredAt: string;
}

export interface CauseCandidate {
  id: string;
  ruleId: string;
  title: string;
  likelihood: 'high' | 'medium' | 'low';
  score: number;
  explanation: string;
  supportingEvidence: string[];
}

export interface CheckStep {
  order: number;
  title: string;
  instruction: string;
  commandId?: CommandId;
}

export interface DiagnosisResult {
  sessionId: string;
  faultType: FaultType;
  completedAt: string;
  isConclusive: boolean;
  conclusivenessNotice: string;
  userSymptomSummary: string;
  inputSummary: DiagnosticAnswer[];
  candidates: CauseCandidate[];
  evidence: string[];
  recommendedCheckOrder: CheckStep[];
  safeResolutions: string[];
  additionalChecksNeeded: string[];
  suggestedSeverity: Severity;
}
