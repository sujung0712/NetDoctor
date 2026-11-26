import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  FilterX,
  Pencil,
  Plus,
  RotateCcw,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  SearchInput,
} from '../../components';
import {
  containsSensitiveCredential,
  filterIncidents,
  formatReportTimestamp,
  isBlank,
  sanitizeText,
} from '../../storage';
import {
  FAULT_TYPES,
  FAULT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  INPUT_LIMITS,
  SEVERITY_LABELS,
  type ComponentTone,
  type FaultType,
  type HistoryPageProps,
  type IncidentRecord,
  type IncidentStatus,
  type Severity,
} from '../../types';

const SEVERITY_OPTIONS: Severity[] = ['low', 'medium', 'high', 'critical'];
const STATUS_OPTIONS: IncidentStatus[] = ['open', 'in_progress', 'resolved'];

interface IncidentFormState {
  title: string;
  faultType: FaultType;
  severity: Severity;
  status: IncidentStatus;
  occurredAtLocal: string;
  resolvedAtLocal: string;
  symptomSummary: string;
  actionNotes: string;
}

function toDatetimeLocalValue(iso?: string): string {
  const date = iso && Number.isFinite(Date.parse(iso)) ? new Date(iso) : new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fromDatetimeLocalToIso(localValue: string): string | undefined {
  if (!localValue || localValue.trim().length === 0) {
    return undefined;
  }
  const ms = Date.parse(localValue);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return new Date(ms).toISOString();
}

function createEmptyFormState(): IncidentFormState {
  return {
    title: '',
    faultType: 'NO_INTERNET',
    severity: 'medium',
    status: 'open',
    occurredAtLocal: toDatetimeLocalValue(),
    resolvedAtLocal: '',
    symptomSummary: '',
    actionNotes: '',
  };
}

function createFormStateFromRecord(record: IncidentRecord): IncidentFormState {
  return {
    title: record.title,
    faultType: record.faultType,
    severity: record.severity,
    status: record.status,
    occurredAtLocal: toDatetimeLocalValue(record.occurredAt),
    resolvedAtLocal: record.resolvedAt ? toDatetimeLocalValue(record.resolvedAt) : '',
    symptomSummary: record.symptomSummary,
    actionNotes: record.actionNotes,
  };
}

function getStatusTone(status: IncidentStatus): ComponentTone {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'in_progress':
      return 'cyan';
    case 'open':
      return 'warning';
  }
}

function getSeverityTone(severity: Severity): ComponentTone {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'cyan';
    case 'low':
      return 'neutral';
  }
}

export function HistoryPage({
  incidents,
  onCreateIncident,
  onUpdateIncident,
  onDeleteIncident,
  onOpenReport,
  onStartDiagnosis,
}: HistoryPageProps) {
  const [query, setQuery] = useState('');
  const [faultTypeFilter, setFaultTypeFilter] = useState<FaultType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'ALL'>('ALL');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<IncidentFormState>(createEmptyFormState);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<IncidentRecord | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredIncidents = useMemo(() => {
    const matched = filterIncidents(incidents, {
      query,
      faultType: faultTypeFilter,
      status: statusFilter,
    });
    return [...matched].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  }, [incidents, query, faultTypeFilter, statusFilter]);

  const hasActiveFilter =
    query.trim().length > 0 || faultTypeFilter !== 'ALL' || statusFilter !== 'ALL';

  function resetFilters() {
    setQuery('');
    setFaultTypeFilter('ALL');
    setStatusFilter('ALL');
  }

  function openCreateModal() {
    setFormState(createEmptyFormState());
    setFormError(null);
    setActionError(null);
    setEditingId(null);
    setModalMode('create');
  }

  function openEditModal(record: IncidentRecord) {
    setFormState(createFormStateFromRecord(record));
    setFormError(null);
    setActionError(null);
    setEditingId(record.id);
    setModalMode('edit');
  }

  function closeFormModal() {
    setModalMode(null);
    setEditingId(null);
    setFormError(null);
  }

  function validateForm(state: IncidentFormState): string | null {
    const cleanTitle = sanitizeText(state.title, INPUT_LIMITS.TITLE_MAX);
    if (isBlank(cleanTitle)) {
      return '장애 제목을 입력해 주세요. 공백만 입력할 수 없습니다.';
    }

    if (
      containsSensitiveCredential(state.title) ||
      containsSensitiveCredential(state.symptomSummary) ||
      containsSensitiveCredential(state.actionNotes)
    ) {
      return '비밀번호, API 키, Bearer 토큰 등 민감한 인증 정보는 저장할 수 없습니다. 해당 내용을 제거한 후 다시 시도해 주세요.';
    }

    const occurredIso = fromDatetimeLocalToIso(state.occurredAtLocal);
    if (!occurredIso) {
      return '유효한 장애 발생 시각을 입력해 주세요.';
    }

    if (state.status === 'resolved' && state.resolvedAtLocal.trim().length > 0) {
      const resolvedIso = fromDatetimeLocalToIso(state.resolvedAtLocal);
      if (!resolvedIso) {
        return '유효한 해결 시각을 입력해 주세요.';
      }
      if (Date.parse(resolvedIso) < Date.parse(occurredIso)) {
        return '해결 시각은 장애 발생 시각보다 이전일 수 없습니다.';
      }
    }

    return null;
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    const validationError = validateForm(formState);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const title = sanitizeText(formState.title, INPUT_LIMITS.TITLE_MAX);
    const symptomSummary = sanitizeText(formState.symptomSummary, INPUT_LIMITS.SYMPTOM_MAX);
    const actionNotes = sanitizeText(formState.actionNotes, INPUT_LIMITS.ACTION_NOTES_MAX);
    const occurredAt = fromDatetimeLocalToIso(formState.occurredAtLocal);
    const resolvedAt =
      formState.status === 'resolved' && formState.resolvedAtLocal.trim().length > 0
        ? fromDatetimeLocalToIso(formState.resolvedAtLocal)
        : undefined;

    if (modalMode === 'create') {
      const created = onCreateIncident({
        title,
        faultType: formState.faultType,
        severity: formState.severity,
        status: formState.status,
        symptomSummary,
        userCheckSummary: [],
        possibleCauses: [],
        evidence: [],
        actionNotes,
        occurredAt,
        resolvedAt,
      });

      if (!created) {
        setFeedbackMessage(null);
        setFormError(
          '장애 이력 저장에 실패했습니다. 입력값·민감 정보 차단 여부 또는 브라우저 LocalStorage 저장소 용량 초과·접근 제한 상태를 확인해 주세요. 기존 데이터는 그대로 유지되었습니다.'
        );
        return;
      }

      setActionError(null);
      setFeedbackMessage(`신규 장애 이력 "${created.title}"이(가) 저장되었습니다.`);
      closeFormModal();
      return;
    }

    if (modalMode === 'edit' && editingId) {
      const updated = onUpdateIncident(editingId, {
        title,
        faultType: formState.faultType,
        severity: formState.severity,
        status: formState.status,
        symptomSummary,
        actionNotes,
        occurredAt,
        resolvedAt,
      });

      if (!updated) {
        setFeedbackMessage(null);
        setFormError(
          '장애 이력 수정 내용을 저장하지 못했습니다. 입력값·민감 정보 차단 여부 또는 브라우저 LocalStorage 용량 초과·접근 제한 상태를 확인해 주세요. 기존 데이터는 그대로 유지되었습니다.'
        );
        return;
      }

      setActionError(null);
      setFeedbackMessage(`장애 이력 "${updated.title}"이(가) 업데이트되었습니다.`);
      closeFormModal();
    }
  }

  function handleQuickStatusToggle(record: IncidentRecord) {
    const nextStatus: IncidentStatus = record.status === 'resolved' ? 'open' : 'resolved';
    const updated = onUpdateIncident(record.id, { status: nextStatus });
    if (!updated) {
      setFeedbackMessage(null);
      setActionError(
        '상태 변경을 LocalStorage에 저장하지 못했습니다. 브라우저 저장소 용량 초과 또는 접근 제한 상태일 수 있으며, 기존 장애 이력 데이터는 그대로 유지되었습니다.'
      );
      return;
    }
    setActionError(null);
    setFeedbackMessage(
      nextStatus === 'resolved'
        ? `"${updated.title}" 이력을 해결 완료 처리했습니다.`
        : `"${updated.title}" 이력을 미해결 상태로 재오픈했습니다.`
    );
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    const deletedTitle = deleteTarget.title;
    const removed = onDeleteIncident(deleteTarget.id);
    if (!removed) {
      setFeedbackMessage(null);
      setActionError(
        '장애 이력 삭제를 LocalStorage에 저장하지 못했습니다. 브라우저 저장소 용량 초과 또는 접근 제한 상태일 수 있으며, 기존 데이터는 그대로 유지되었습니다.'
      );
      setDeleteTarget(null);
      return;
    }
    setActionError(null);
    setFeedbackMessage(`"${deletedTitle}" 장애 이력이 삭제되었습니다.`);
    setDeleteTarget(null);
  }

  const inputClass =
    'w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyanbrand-400 focus:outline-none';
  const labelClass = 'block text-xs font-semibold text-slate-300';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-navy-700/80 bg-navy-850/90 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
              장애 이력 관리
            </h1>
            <Badge tone="neutral">총 {incidents.length}건</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            네트워크 장애 기록을 검색·필터링하고 상태 및 조치 내역을 관리합니다. 모든 변경 사항은
            브라우저 LocalStorage에 즉시 저장됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            onClick={onStartDiagnosis}
            leftIcon={<Stethoscope className="h-4 w-4" />}
          >
            진단 시작
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={openCreateModal}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            수동 장애 등록
          </Button>
        </div>
      </div>

      {/* Live Feedback Region */}
      <div aria-live="polite" className="sr-only">
        {feedbackMessage ?? ''}
      </div>
      {feedbackMessage && (
        <AlertBanner tone="success" title={feedbackMessage} />
      )}
      {actionError && (
        <AlertBanner
          tone="danger"
          title="저장 실패 — 기존 데이터가 유지되었습니다"
          description={actionError}
        />
      )}

      {/* Search & Filter Bar */}
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-6">
            <SearchInput
              value={query}
              onChange={(val) => setQuery(val.slice(0, INPUT_LIMITS.SEARCH_MAX))}
              placeholder="제목, 증상, 원인, 조치 내역으로 검색..."
              ariaLabel="장애 이력 검색"
              maxLength={INPUT_LIMITS.SEARCH_MAX}
              className="w-full"
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="history-fault-filter" className="sr-only">
              장애 유형 필터
            </label>
            <select
              id="history-fault-filter"
              value={faultTypeFilter}
              onChange={(e) => setFaultTypeFilter(e.target.value as FaultType | 'ALL')}
              className={inputClass}
              aria-label="장애 유형 필터"
            >
              <option value="ALL">전체 장애 유형</option>
              {FAULT_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {FAULT_TYPE_LABELS[ft]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="history-status-filter" className="sr-only">
              해결 상태 필터
            </label>
            <select
              id="history-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | 'ALL')}
              className={inputClass}
              aria-label="해결 상태 필터"
            >
              <option value="ALL">전체 상태</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {INCIDENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-700/60 pt-3 text-xs text-slate-400">
          <span>
            전체 <strong className="text-slate-200">{incidents.length}</strong>건 중{' '}
            <strong className="text-cyanbrand-400">{filteredIncidents.length}</strong>건 표시
          </span>
          {hasActiveFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              leftIcon={<FilterX className="h-3.5 w-3.5" />}
            >
              필터 초기화
            </Button>
          )}
        </div>
      </Card>

      {/* Incident List */}
      {incidents.length === 0 ? (
        <Card>
          <EmptyState
            title="등록된 장애 이력이 없습니다"
            description="신규 장애 진단을 실행해 자동으로 이력을 저장하거나, 수동으로 장애를 등록할 수 있습니다."
            icon={<ClipboardList className="h-8 w-8 text-cyanbrand-400" />}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" size="md" onClick={onStartDiagnosis}>
                  진단 시작
                </Button>
                <Button variant="secondary" size="md" onClick={openCreateModal}>
                  수동 장애 등록
                </Button>
              </div>
            }
          />
        </Card>
      ) : filteredIncidents.length === 0 ? (
        <Card>
          <EmptyState
            title="조건에 일치하는 장애 이력이 없습니다"
            description="검색어 또는 장애 유형·상태 필터를 조정하거나 초기화해 주세요."
            icon={<FilterX className="h-8 w-8 text-slate-400" />}
            action={
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                필터 초기화
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredIncidents.map((incident) => (
            <article
              key={incident.id}
              className="rounded-xl border border-navy-700/80 bg-navy-850 p-5 shadow-card transition-colors hover:border-cyanbrand-500/40"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {incident.isSample && <Badge tone="warning">[샘플]</Badge>}
                    <Badge tone="cyan">{FAULT_TYPE_LABELS[incident.faultType]}</Badge>
                    <Badge tone={getStatusTone(incident.status)}>
                      {INCIDENT_STATUS_LABELS[incident.status]}
                    </Badge>
                    <Badge tone={getSeverityTone(incident.severity)}>
                      심각도: {SEVERITY_LABELS[incident.severity]}
                    </Badge>
                  </div>

                  <h2 className="break-words text-base font-bold text-slate-100 sm:text-lg">
                    {incident.title}
                  </h2>

                  {incident.symptomSummary && (
                    <p className="whitespace-pre-line break-words text-sm text-slate-300">
                      {incident.symptomSummary}
                    </p>
                  )}

                  {incident.actionNotes && (
                    <div className="rounded-lg border border-navy-700/70 bg-navy-900/70 px-3.5 py-2.5 text-xs text-slate-300">
                      <span className="font-semibold text-cyanbrand-300">조치 내역: </span>
                      <span className="whitespace-pre-line break-words">
                        {incident.actionNotes}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                      발생: {formatReportTimestamp(incident.occurredAt)}
                    </span>
                    {incident.status === 'resolved' && incident.resolvedAt && (
                      <span>해결: {formatReportTimestamp(incident.resolvedAt)}</span>
                    )}
                    {incident.status === 'resolved' &&
                      incident.resolutionMinutes !== undefined && (
                        <span className="font-medium text-emerald-400">
                          소요 시간: {incident.resolutionMinutes}분
                        </span>
                      )}
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-col lg:items-stretch">
                  <Button
                    variant={incident.status === 'resolved' ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => handleQuickStatusToggle(incident)}
                    leftIcon={
                      incident.status === 'resolved' ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    {incident.status === 'resolved' ? '재오픈' : '해결 완료'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenReport(incident.id)}
                    leftIcon={<FileText className="h-3.5 w-3.5" />}
                  >
                    보고서 보기
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(incident)}
                      leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      className="flex-1"
                    >
                      수정
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTarget(incident)}
                      leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                      className="flex-1"
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create / Edit Incident Modal */}
      <Modal
        isOpen={modalMode !== null}
        onClose={closeFormModal}
        title={modalMode === 'edit' ? '장애 이력 수정' : '수동 장애 이력 등록'}
        subtitle="비밀번호, API 키, 토큰 등 민감한 인증 정보는 입력하지 마세요."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="md" type="button" onClick={closeFormModal}>
              취소
            </Button>
            <Button variant="primary" size="md" type="submit" form="incident-editor-form">
              {modalMode === 'edit' ? '변경 사항 저장' : '이력 등록'}
            </Button>
          </div>
        }
      >
        <form id="incident-editor-form" onSubmit={handleFormSubmit} className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
            >
              {formError}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="incident-title" className={labelClass}>
                장애 제목 <span className="text-rose-400">*</span>
              </label>
              <span className="text-xs text-slate-400">
                {formState.title.length} / {INPUT_LIMITS.TITLE_MAX}
              </span>
            </div>
            <input
              id="incident-title"
              type="text"
              required
              maxLength={INPUT_LIMITS.TITLE_MAX}
              value={formState.title}
              onChange={(e) => {
                setFormState((prev) => ({
                  ...prev,
                  title: e.target.value.slice(0, INPUT_LIMITS.TITLE_MAX),
                }));
                if (formError) setFormError(null);
              }}
              placeholder="예: 3층 사무실 유선 LAN 인터넷 연결 불가"
              className={inputClass}
            />
          </div>

          {/* Fault Type / Severity / Status */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="incident-fault-type" className={labelClass}>
                장애 유형
              </label>
              <select
                id="incident-fault-type"
                value={formState.faultType}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, faultType: e.target.value as FaultType }))
                }
                className={inputClass}
              >
                {FAULT_TYPES.map((ft) => (
                  <option key={ft} value={ft}>
                    {FAULT_TYPE_LABELS[ft]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="incident-severity" className={labelClass}>
                심각도
              </label>
              <select
                id="incident-severity"
                value={formState.severity}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, severity: e.target.value as Severity }))
                }
                className={inputClass}
              >
                {SEVERITY_OPTIONS.map((sev) => (
                  <option key={sev} value={sev}>
                    {SEVERITY_LABELS[sev]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="incident-status" className={labelClass}>
                상태
              </label>
              <select
                id="incident-status"
                value={formState.status}
                onChange={(e) => {
                  const nextStatus = e.target.value as IncidentStatus;
                  setFormState((prev) => ({
                    ...prev,
                    status: nextStatus,
                    resolvedAtLocal:
                      nextStatus === 'resolved'
                        ? prev.resolvedAtLocal || toDatetimeLocalValue()
                        : '',
                  }));
                }}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {INCIDENT_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Timestamps */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="incident-occurred-at" className={labelClass}>
                장애 발생 시각
              </label>
              <input
                id="incident-occurred-at"
                type="datetime-local"
                required
                value={formState.occurredAtLocal}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, occurredAtLocal: e.target.value }))
                }
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="incident-resolved-at" className={labelClass}>
                해결 시각 {formState.status === 'resolved' ? '(비우면 현재 시각)' : '(해결 시 입력)'}
              </label>
              <input
                id="incident-resolved-at"
                type="datetime-local"
                disabled={formState.status !== 'resolved'}
                value={formState.resolvedAtLocal}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, resolvedAtLocal: e.target.value }))
                }
                className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </div>
          </div>

          {/* Symptom Summary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="incident-symptom" className={labelClass}>
                증상 요약
              </label>
              <span className="text-xs text-slate-400">
                {formState.symptomSummary.length} / {INPUT_LIMITS.SYMPTOM_MAX}
              </span>
            </div>
            <textarea
              id="incident-symptom"
              rows={3}
              maxLength={INPUT_LIMITS.SYMPTOM_MAX}
              value={formState.symptomSummary}
              onChange={(e) => {
                setFormState((prev) => ({
                  ...prev,
                  symptomSummary: e.target.value.slice(0, INPUT_LIMITS.SYMPTOM_MAX),
                }));
                if (formError) setFormError(null);
              }}
              placeholder="발생한 네트워크 증상, 영향 범위, 오류 메시지 등을 간단히 기록하세요."
              className={inputClass}
            />
          </div>

          {/* Action Notes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="incident-action-notes" className={labelClass}>
                조치 내역
              </label>
              <span className="text-xs text-slate-400">
                {formState.actionNotes.length} / {INPUT_LIMITS.ACTION_NOTES_MAX}
              </span>
            </div>
            <textarea
              id="incident-action-notes"
              rows={4}
              maxLength={INPUT_LIMITS.ACTION_NOTES_MAX}
              value={formState.actionNotes}
              onChange={(e) => {
                setFormState((prev) => ({
                  ...prev,
                  actionNotes: e.target.value.slice(0, INPUT_LIMITS.ACTION_NOTES_MAX),
                }));
                if (formError) setFormError(null);
              }}
              placeholder="실행한 점검 명령어, 조치 절차, 향후 확인 사항 등을 기록하세요."
              className={inputClass}
            />
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="장애 이력 삭제 확인"
        subtitle="삭제된 장애 이력은 복구할 수 없습니다."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="md" onClick={() => setDeleteTarget(null)}>
              취소
            </Button>
            <Button variant="danger" size="md" onClick={handleConfirmDelete}>
              영구 삭제
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-300">
          다음 장애 이력을 LocalStorage에서 영구 삭제하시겠습니까?
        </p>
        {deleteTarget && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm font-medium text-rose-100">
            {deleteTarget.title}
          </div>
        )}
      </Modal>
    </div>
  );
}
