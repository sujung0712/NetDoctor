import {
  FAULT_TYPES,
  FAULT_TYPE_LABELS,
  INPUT_LIMITS,
  STORAGE_KEYS,
  type FaultType,
  type IncidentCreateInput,
  type IncidentFilter,
  type IncidentRecord,
  type IncidentStatus,
  type IncidentUpdateInput,
  type Severity,
} from '../types';
import {
  computeResolutionMinutes,
  containsSensitiveCredential,
  isBlank,
  isValidIsoTimestamp,
  sanitizeText,
  validateIncidentRecord,
} from './sanitizer';

const VALID_FAULT_TYPES = new Set<string>(FAULT_TYPES);
const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);
const VALID_STATUSES = new Set<string>(['open', 'in_progress', 'resolved']);

function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function generateIncidentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `inc-${crypto.randomUUID()}`;
  }
  return `inc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeStringList(items: string[], maxItems = 30, itemMaxLength = 300): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const cleaned = sanitizeText(item, itemMaxLength);
    if (cleaned.length > 0) {
      result.push(cleaned);
    }
    if (result.length >= maxItems) break;
  }
  return result;
}

function hasCredentialInFields(fields: Array<string | string[] | undefined>): boolean {
  for (const field of fields) {
    if (typeof field === 'string') {
      if (containsSensitiveCredential(field)) {
        return true;
      }
    } else if (Array.isArray(field)) {
      if (field.some((item) => typeof item === 'string' && containsSensitiveCredential(item))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Safely loads and validates all incident records from LocalStorage.
 * Returns an empty array on corrupted JSON, missing storage, or invalid payloads.
 */
export function loadIncidents(): IncidentRecord[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(STORAGE_KEYS.INCIDENTS);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const validRecords: IncidentRecord[] = [];
    for (const item of parsed) {
      const validated = validateIncidentRecord(item);
      if (validated) {
        validRecords.push(validated);
      }
    }
    return validRecords;
  } catch {
    return [];
  }
}

/**
 * Persists validated incident records to LocalStorage.
 */
export function saveIncidents(records: IncidentRecord[]): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    const validRecords: IncidentRecord[] = [];
    for (const item of records) {
      const validated = validateIncidentRecord(item);
      if (validated) {
        validRecords.push(validated);
      }
    }
    storage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(validRecords));
  } catch {
    // Gracefully ignore storage quota or security errors
  }
}

/**
 * Creates a validated incident record and persists it to LocalStorage.
 * Returns null if title is blank, enum/timestamp values are invalid,
 * or sensitive credential patterns are detected.
 */
export function createIncidentRecord(input: IncidentCreateInput): IncidentRecord | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  if (!VALID_FAULT_TYPES.has(input.faultType)) {
    return null;
  }
  if (!VALID_SEVERITIES.has(input.severity)) {
    return null;
  }
  if (!VALID_STATUSES.has(input.status)) {
    return null;
  }

  const title = sanitizeText(input.title, INPUT_LIMITS.TITLE_MAX);
  if (isBlank(title)) {
    return null;
  }

  const symptomSummary = sanitizeText(input.symptomSummary ?? '', INPUT_LIMITS.SYMPTOM_MAX);
  const actionNotes = sanitizeText(input.actionNotes ?? '', INPUT_LIMITS.ACTION_NOTES_MAX);
  const userCheckSummary = sanitizeStringList(input.userCheckSummary ?? []);
  const possibleCauses = sanitizeStringList(input.possibleCauses ?? []);
  const evidence = sanitizeStringList(input.evidence ?? []);

  if (
    hasCredentialInFields([
      title,
      symptomSummary,
      actionNotes,
      userCheckSummary,
      possibleCauses,
      evidence,
    ])
  ) {
    return null;
  }

  const now = new Date().toISOString();
  let occurredAt = now;
  if (input.occurredAt !== undefined && input.occurredAt !== '') {
    if (!isValidIsoTimestamp(input.occurredAt)) {
      return null;
    }
    occurredAt = new Date(input.occurredAt).toISOString();
  }

  let resolvedAt: string | undefined;
  let resolutionMinutes: number | undefined;

  if (input.status === 'resolved') {
    if (input.resolvedAt !== undefined && input.resolvedAt !== '') {
      if (!isValidIsoTimestamp(input.resolvedAt)) {
        return null;
      }
      const candidateResolvedAt = new Date(input.resolvedAt).toISOString();
      if (Date.parse(candidateResolvedAt) < Date.parse(occurredAt)) {
        return null;
      }
      resolvedAt = candidateResolvedAt;
    } else {
      resolvedAt = Date.parse(now) >= Date.parse(occurredAt) ? now : occurredAt;
    }
    resolutionMinutes = computeResolutionMinutes(occurredAt, resolvedAt);
  }

  const record: IncidentRecord = {
    id: generateIncidentId(),
    title,
    faultType: input.faultType as FaultType,
    severity: input.severity as Severity,
    status: input.status as IncidentStatus,
    symptomSummary,
    userCheckSummary,
    possibleCauses,
    evidence,
    actionNotes,
    occurredAt,
    updatedAt: now,
    ...(input.isSample !== undefined ? { isSample: input.isSample } : {}),
    ...(resolvedAt !== undefined ? { resolvedAt } : {}),
    ...(resolutionMinutes !== undefined ? { resolutionMinutes } : {}),
    ...(input.diagnosisResult !== undefined ? { diagnosisResult: input.diagnosisResult } : {}),
  };

  const existing = loadIncidents();
  saveIncidents([record, ...existing]);
  return record;
}

/**
 * Updates an existing incident record in LocalStorage.
 * Auto-sets resolvedAt when transitioning to 'resolved' if omitted,
 * and clears resolvedAt/resolutionMinutes when reopened.
 */
export function updateIncidentRecord(
  id: string,
  patch: IncidentUpdateInput
): IncidentRecord | null {
  if (isBlank(id) || !patch || typeof patch !== 'object') {
    return null;
  }

  const existingList = loadIncidents();
  const targetIndex = existingList.findIndex((item) => item.id === id);
  if (targetIndex === -1) {
    return null;
  }

  const existing = existingList[targetIndex];

  let nextTitle = existing.title;
  if (patch.title !== undefined) {
    const sanitized = sanitizeText(patch.title, INPUT_LIMITS.TITLE_MAX);
    if (isBlank(sanitized)) {
      return null;
    }
    nextTitle = sanitized;
  }

  let nextFaultType = existing.faultType;
  if (patch.faultType !== undefined) {
    if (!VALID_FAULT_TYPES.has(patch.faultType)) {
      return null;
    }
    nextFaultType = patch.faultType;
  }

  let nextSeverity = existing.severity;
  if (patch.severity !== undefined) {
    if (!VALID_SEVERITIES.has(patch.severity)) {
      return null;
    }
    nextSeverity = patch.severity;
  }

  let nextStatus = existing.status;
  if (patch.status !== undefined) {
    if (!VALID_STATUSES.has(patch.status)) {
      return null;
    }
    nextStatus = patch.status;
  }

  const nextSymptomSummary =
    patch.symptomSummary !== undefined
      ? sanitizeText(patch.symptomSummary, INPUT_LIMITS.SYMPTOM_MAX)
      : existing.symptomSummary;

  const nextActionNotes =
    patch.actionNotes !== undefined
      ? sanitizeText(patch.actionNotes, INPUT_LIMITS.ACTION_NOTES_MAX)
      : existing.actionNotes;

  if (hasCredentialInFields([nextTitle, nextSymptomSummary, nextActionNotes])) {
    return null;
  }

  let nextOccurredAt = existing.occurredAt;
  if (patch.occurredAt !== undefined && patch.occurredAt !== '') {
    if (!isValidIsoTimestamp(patch.occurredAt)) {
      return null;
    }
    nextOccurredAt = new Date(patch.occurredAt).toISOString();
  }

  const now = new Date().toISOString();
  let nextResolvedAt: string | undefined;
  let nextResolutionMinutes: number | undefined;

  if (nextStatus === 'resolved') {
    if (patch.resolvedAt !== undefined && patch.resolvedAt !== '') {
      if (!isValidIsoTimestamp(patch.resolvedAt)) {
        return null;
      }
      const candidateResolvedAt = new Date(patch.resolvedAt).toISOString();
      if (Date.parse(candidateResolvedAt) < Date.parse(nextOccurredAt)) {
        return null;
      }
      nextResolvedAt = candidateResolvedAt;
    } else if (existing.status !== 'resolved' || !existing.resolvedAt) {
      nextResolvedAt = Date.parse(now) >= Date.parse(nextOccurredAt) ? now : nextOccurredAt;
    } else {
      if (Date.parse(existing.resolvedAt) < Date.parse(nextOccurredAt)) {
        return null;
      }
      nextResolvedAt = existing.resolvedAt;
    }
    nextResolutionMinutes = computeResolutionMinutes(nextOccurredAt, nextResolvedAt);
  } else {
    nextResolvedAt = undefined;
    nextResolutionMinutes = undefined;
  }

  const updated: IncidentRecord = {
    ...existing,
    title: nextTitle,
    faultType: nextFaultType,
    severity: nextSeverity,
    status: nextStatus,
    symptomSummary: nextSymptomSummary,
    actionNotes: nextActionNotes,
    occurredAt: nextOccurredAt,
    updatedAt: now,
  };

  if (nextResolvedAt !== undefined) {
    updated.resolvedAt = nextResolvedAt;
  } else {
    delete updated.resolvedAt;
  }

  if (nextResolutionMinutes !== undefined) {
    updated.resolutionMinutes = nextResolutionMinutes;
  } else {
    delete updated.resolutionMinutes;
  }

  const nextList = [...existingList];
  nextList[targetIndex] = updated;
  saveIncidents(nextList);
  return updated;
}

/**
 * Deletes an incident record by ID from LocalStorage.
 */
export function deleteIncidentRecord(id: string): boolean {
  if (isBlank(id)) {
    return false;
  }
  const existing = loadIncidents();
  const next = existing.filter((item) => item.id !== id);
  if (next.length === existing.length) {
    return false;
  }
  saveIncidents(next);
  return true;
}

/**
 * Filters incident records by search query, faultType, and status.
 */
export function filterIncidents(
  records: IncidentRecord[],
  filter: IncidentFilter
): IncidentRecord[] {
  const query = sanitizeText(filter.query ?? '', INPUT_LIMITS.SEARCH_MAX).toLowerCase();

  return records.filter((record) => {
    if (filter.faultType && filter.faultType !== 'ALL' && record.faultType !== filter.faultType) {
      return false;
    }
    if (filter.status && filter.status !== 'ALL' && record.status !== filter.status) {
      return false;
    }
    if (query.length > 0) {
      const searchable = [
        record.title,
        record.symptomSummary,
        record.actionNotes,
        FAULT_TYPE_LABELS[record.faultType],
        ...record.possibleCauses,
        ...record.evidence,
      ]
        .join(' ')
        .toLowerCase();

      if (!searchable.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Generates 4 realistic sample incidents across different fault types.
 * Every sample record is unmistakably marked with isSample: true and [샘플] prefix.
 */
export function createSampleIncidents(): IncidentRecord[] {
  const nowMs = Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;

  const dnsOccurred = new Date(nowMs - 46 * hour).toISOString();
  const dnsResolved = new Date(nowMs - 46 * hour + 25 * minute).toISOString();

  const vpnOccurred = new Date(nowMs - 26 * hour).toISOString();
  const vpnResolved = new Date(nowMs - 26 * hour + 40 * minute).toISOString();

  const slowOccurred = new Date(nowMs - 7 * hour).toISOString();
  const dropOccurred = new Date(nowMs - 2 * hour).toISOString();

  return [
    {
      id: 'sample-incident-dns-1',
      title: '[샘플] 사내 포털 및 외부 웹사이트 도메인 접속 실패',
      faultType: 'DNS_ERROR',
      severity: 'high',
      status: 'resolved',
      symptomSummary:
        '브라우저에서 주요 업무 사이트 및 포털 도메인 접속 시 DNS_PROBE_FINISHED_NXDOMAIN 오류 발생. IP 주소 기반 통신은 정상 확인됨.',
      userCheckSummary: [
        '도메인 주소 접속 불가 여부: 예 (주요 외부/사내 도메인 모두 실패)',
        '공인 IP(예: 8.8.8.8) ping 응답 여부: 예 (정상 응답)',
        'nslookup 실행 시 DNS 서버 타임아웃 발생 여부: 예',
      ],
      possibleCauses: [
        '로컬 DNS 캐시 손상 또는 만료된 레코드 잔존',
        '네트워크 어댑터에 잘못된 수동 DNS 서버 주소 설정',
      ],
      evidence: [
        'IP 기반 통신은 정상이나 도메인 이름 해석 단계에서만 실패함',
        'nslookup 조회 시 기본 DNS 서버 응답 지연 및 타임아웃 확인',
      ],
      actionNotes:
        '명령 프롬프트에서 ipconfig /flushdns 실행 후 DNS 서버 설정을 자동(DHCP)으로 복원하여 정상 접속 확인.',
      isSample: true,
      occurredAt: dnsOccurred,
      resolvedAt: dnsResolved,
      resolutionMinutes: computeResolutionMinutes(dnsOccurred, dnsResolved),
      updatedAt: dnsResolved,
    },
    {
      id: 'sample-incident-vpn-2',
      title: '[샘플] 재택근무 환경 사내 VPN 터널 연결 실패',
      faultType: 'VPN_FAILURE',
      severity: 'high',
      status: 'resolved',
      symptomSummary:
        '일반 인터넷 브라우징은 정상이나 사내 VPN 클라이언트 연결 시도 시 터널 협상 단계에서 시간 초과 오류 발생.',
      userCheckSummary: [
        '일반 웹사이트 접속 가능 여부: 예',
        'VPN 클라이언트 인증 후 터널 수립 실패 여부: 예',
        '공용 Wi-Fi 또는 방화벽 제한 망 사용 여부: 예',
      ],
      possibleCauses: [
        '로컬 방화벽 또는 외부 망에서 VPN 포트(UDP 500/4500, TCP 443) 차단',
        'VPN 가상 네트워크 어댑터 드라이버 일시적 충돌',
      ],
      evidence: [
        '일반 인터넷 연결은 정상이나 VPN 게이트웨이 터널 수립만 실패함',
        '네트워크 전환(모바일 핫스팟 테스트) 시 정상 연결 확인됨',
      ],
      actionNotes:
        'VPN 클라이언트 재시작 및 SSL-VPN(TCP 443) 프로파일로 전환하여 사내망 정상 접속 완료.',
      isSample: true,
      occurredAt: vpnOccurred,
      resolvedAt: vpnResolved,
      resolutionMinutes: computeResolutionMinutes(vpnOccurred, vpnResolved),
      updatedAt: vpnResolved,
    },
    {
      id: 'sample-incident-slow-3',
      title: '[샘플] 회의실 Wi-Fi 화상회의 및 파일 전송 속도 저하',
      faultType: 'SLOW_NETWORK',
      severity: 'medium',
      status: 'in_progress',
      symptomSummary:
        '오전 팀 화상회의 중 음성 끊김 및 화면 지연이 반복되며 사내 문서 다운로드 속도가 평소 대비 현저히 저하됨.',
      userCheckSummary: [
        '동일 공간의 다른 사용자도 유사한 지연 체감 여부: 예',
        '유선 LAN 연결 시 속도 정상 여부: 모름 (추후 확인 예정)',
        '특정 시간대/대용량 트래픽 동시 사용 여부: 예',
      ],
      possibleCauses: [
        '무선 AP 채널 혼잡 및 다수 단말 동시 접속으로 인한 대역폭 포화',
        '2.4GHz 대역 자동 연결로 인한 간섭 증가',
      ],
      evidence: [
        '동일 회의실 다수 단말에서 동시 지연 현상 발생',
        '백그라운드 동기화 및 화상회의 트래픽 집중 시간대에 증상 심화',
      ],
      actionNotes:
        '5GHz 대역 SSID로 우선 전환 안내 완료. IT 인프라팀에 회의실 AP 부하 및 유선 업링크 상태 점검 요청 중.',
      isSample: true,
      occurredAt: slowOccurred,
      updatedAt: slowOccurred,
    },
    {
      id: 'sample-incident-drop-4',
      title: '[샘플] 무선 LAN 간헐적 연결 끊김 및 재연결 반복',
      faultType: 'INTERMITTENT_DROP',
      severity: 'medium',
      status: 'open',
      symptomSummary:
        '업무 중 15~20분 간격으로 네트워크 아이콘이 끊김 상태로 변경되었다가 약 10초 후 자동 재연결되는 현상 반복.',
      userCheckSummary: [
        '유선 대신 무선 Wi-Fi 환경 사용 여부: 예',
        '절전 모드 해제 또는 이동 시 끊김 심화 여부: 예',
        '게이트웨이 ping 테스트 중 간헐적 요청 시간 만료 발생 여부: 예',
      ],
      possibleCauses: [
        '무선 네트워크 어댑터 전원 관리(절전) 설정으로 인한 링크 해제',
        'AP 로밍 임계치 충돌 또는 DHCP 임대 갱신 실패',
      ],
      evidence: [
        '일정 간격으로 게이트웨이 응답 손실(Request timed out) 관측',
        '재연결 직후에는 수 분간 정상 통신 유지됨',
      ],
      actionNotes:
        '장치 관리자에서 무선 어댑터 절전 옵션 해제 및 드라이버 버전 확인 예정.',
      isSample: true,
      occurredAt: dropOccurred,
      updatedAt: dropOccurred,
    },
  ];
}

/**
 * Loads sample incidents into LocalStorage without duplicating existing sample IDs.
 */
export function loadSampleIncidentsIntoStorage(): IncidentRecord[] {
  const existing = loadIncidents();
  const existingIds = new Set(existing.map((item) => item.id));
  const samplesToAdd = createSampleIncidents().filter((sample) => !existingIds.has(sample.id));
  const merged = [...existing, ...samplesToAdd];
  saveIncidents(merged);
  return merged;
}

/**
 * Removes all sample incidents (isSample === true) from LocalStorage,
 * preserving all real user records.
 */
export function clearSampleIncidentsFromStorage(): IncidentRecord[] {
  const existing = loadIncidents();
  const remaining = existing.filter((item) => item.isSample !== true);
  saveIncidents(remaining);
  return remaining;
}
