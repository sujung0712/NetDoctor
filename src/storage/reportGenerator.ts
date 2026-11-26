import {
  FAULT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
  type IncidentRecord,
} from '../types';
import { computeResolutionMinutes, neutralizeUnsafeMarkup } from './sanitizer';

export type ReportFormat = 'markdown' | 'text';

export function formatReportTimestamp(iso?: string): string {
  if (!iso) {
    return '미기록';
  }
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return '유효하지 않은 시각';
  }
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function safeLine(value: string): string {
  return neutralizeUnsafeMarkup(value.trim());
}

/**
 * Generates a structured incident report in Markdown or plain text format.
 * Always includes all 6 required sections:
 * 1. 장애 유형
 * 2. 사용자 점검 결과
 * 3. 가능한 원인 후보
 * 4. 판단 근거
 * 5. 조치 내역
 * 6. 해결 상태
 */
export function generateIncidentReport(incident: IncidentRecord, format: ReportFormat): string {
  const title = safeLine(incident.title);
  const faultTypeLabel = FAULT_TYPE_LABELS[incident.faultType];
  const severityLabel = SEVERITY_LABELS[incident.severity];
  const statusLabel = INCIDENT_STATUS_LABELS[incident.status];
  const symptomSummary = safeLine(incident.symptomSummary) || '기록된 증상 요약이 없습니다.';
  const actionNotes = safeLine(incident.actionNotes) || '기록된 조치 내역이 없습니다.';

  const userChecks =
    incident.userCheckSummary.length > 0
      ? incident.userCheckSummary.map((item) => safeLine(item)).filter(Boolean)
      : ['기록된 사용자 점검 결과가 없습니다.'];

  const causes =
    incident.possibleCauses.length > 0
      ? incident.possibleCauses.map((item) => safeLine(item)).filter(Boolean)
      : ['기록된 원인 후보가 없습니다.'];

  const evidences =
    incident.evidence.length > 0
      ? incident.evidence.map((item) => safeLine(item)).filter(Boolean)
      : ['기록된 판단 근거가 없습니다.'];

  const occurredDisplay = formatReportTimestamp(incident.occurredAt);
  const resolvedDisplay =
    incident.status === 'resolved' && incident.resolvedAt
      ? formatReportTimestamp(incident.resolvedAt)
      : '미해결';

  const durationMinutes =
    incident.status === 'resolved'
      ? incident.resolutionMinutes ??
        computeResolutionMinutes(incident.occurredAt, incident.resolvedAt)
      : undefined;

  const durationDisplay =
    durationMinutes !== undefined ? `${durationMinutes}분` : '해당 없음 (미해결 또는 시각 미확정)';

  const sampleBanner = incident.isSample
    ? '[안내] 본 보고서는 시연용 샘플([샘플]) 장애 데이터를 기반으로 생성되었습니다.'
    : null;

  if (format === 'markdown') {
    const lines: string[] = [
      `# NetDoctor 네트워크 장애 보고서`,
      '',
      ...(sampleBanner ? [`> ${sampleBanner}`, ''] : []),
      `- **장애 제목**: ${title}`,
      `- **이력 ID**: \`${safeLine(incident.id)}\``,
      `- **심각도**: ${severityLabel}`,
      '',
      '## 1. 장애 유형',
      `- **분류**: ${faultTypeLabel} (\`${incident.faultType}\`)`,
      `- **증상 요약**: ${symptomSummary}`,
      '',
      '## 2. 사용자 점검 결과',
      ...userChecks.map((item) => `- ${item}`),
      '',
      '## 3. 가능한 원인 후보',
      ...causes.map((item, idx) => `${idx + 1}. ${item}`),
      '',
      '## 4. 판단 근거',
      ...evidences.map((item) => `- ${item}`),
      '',
      '## 5. 조치 내역',
      actionNotes,
      '',
      '## 6. 해결 상태',
      `- **현재 상태**: ${statusLabel}`,
      `- **장애 발생 시각**: ${occurredDisplay}`,
      `- **해결 완료 시각**: ${resolvedDisplay}`,
      `- **소요 처리 시간**: ${durationDisplay}`,
      '',
      '---',
      '_참고: 본 보고서의 원인 후보는 사용자 점검 입력을 바탕으로 정리된 1차 참고 자료이며, 자동 네트워크 측정 결과가 아닙니다._',
    ];

    return lines.join('\n');
  }

  const divider = '============================================================';
  const subDivider = '------------------------------------------------------------';

  const textLines: string[] = [
    divider,
    'NetDoctor 네트워크 장애 보고서',
    divider,
    ...(sampleBanner ? [sampleBanner, subDivider] : []),
    `장애 제목: ${title}`,
    `이력 ID: ${safeLine(incident.id)}`,
    `심각도: ${severityLabel}`,
    '',
    '[1. 장애 유형]',
    `- 분류: ${faultTypeLabel} (${incident.faultType})`,
    `- 증상 요약: ${symptomSummary}`,
    '',
    '[2. 사용자 점검 결과]',
    ...userChecks.map((item) => `- ${item}`),
    '',
    '[3. 가능한 원인 후보]',
    ...causes.map((item, idx) => `${idx + 1}. ${item}`),
    '',
    '[4. 판단 근거]',
    ...evidences.map((item) => `- ${item}`),
    '',
    '[5. 조치 내역]',
    actionNotes,
    '',
    '[6. 해결 상태]',
    `- 현재 상태: ${statusLabel}`,
    `- 장애 발생 시각: ${occurredDisplay}`,
    `- 해결 완료 시각: ${resolvedDisplay}`,
    `- 소요 처리 시간: ${durationDisplay}`,
    '',
    subDivider,
    '참고: 본 보고서의 원인 후보는 사용자 점검 입력을 바탕으로 정리된 1차 참고 자료이며, 자동 네트워크 측정 결과가 아닙니다.',
  ];

  return textLines.join('\n');
}
