import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Download,
  FileCode2,
  FileText,
  History,
  ListChecks,
  ShieldCheck,
} from 'lucide-react';
import { AlertBanner, Badge, Button, Card, EmptyState } from '../../components';
import {
  computeResolutionMinutes,
  downloadIncidentReport,
  formatReportTimestamp,
  generateIncidentReport,
  type ReportFormat,
} from '../../storage';
import {
  FAULT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
  type ComponentTone,
  type IncidentStatus,
  type ReportPageProps,
  type Severity,
} from '../../types';

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

type DownloadFeedback =
  | { status: 'idle' }
  | { status: 'success'; filename: string; format: ReportFormat }
  | { status: 'error'; message: string };

export function ReportPage({ incidents, initialIncidentId, onOpenHistory }: ReportPageProps) {
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (initialIncidentId && incidents.some((item) => item.id === initialIncidentId)) {
      return initialIncidentId;
    }
    return incidents[0]?.id ?? '';
  });
  const [format, setFormat] = useState<ReportFormat>('markdown');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [downloadFeedback, setDownloadFeedback] = useState<DownloadFeedback>({ status: 'idle' });

  const copyTimerRef = useRef<number | null>(null);
  const downloadTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const clearCopyTimer = useCallback(() => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  const clearDownloadTimer = useCallback(() => {
    if (downloadTimerRef.current !== null) {
      window.clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      if (downloadTimerRef.current !== null) {
        window.clearTimeout(downloadTimerRef.current);
        downloadTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialIncidentId && incidents.some((item) => item.id === initialIncidentId)) {
      setSelectedId(initialIncidentId);
      clearCopyTimer();
      clearDownloadTimer();
      setCopyStatus('idle');
      setDownloadFeedback({ status: 'idle' });
    }
  }, [initialIncidentId, incidents, clearCopyTimer, clearDownloadTimer]);

  useEffect(() => {
    if (incidents.length === 0) {
      setSelectedId('');
      return;
    }
    if (!incidents.some((item) => item.id === selectedId)) {
      setSelectedId(incidents[0].id);
    }
  }, [incidents, selectedId]);

  const selectedIncident = useMemo(
    () => incidents.find((item) => item.id === selectedId) ?? incidents[0] ?? null,
    [incidents, selectedId]
  );

  const selectedIncidentId = selectedIncident?.id ?? '';

  useEffect(() => {
    clearCopyTimer();
    clearDownloadTimer();
    setCopyStatus('idle');
    setDownloadFeedback({ status: 'idle' });
  }, [selectedIncidentId, clearCopyTimer, clearDownloadTimer]);

  const reportContent = useMemo(() => {
    if (!selectedIncident) {
      return '';
    }
    return generateIncidentReport(selectedIncident, format);
  }, [selectedIncident, format]);

  const isReportEmpty = !reportContent.trim();

  async function handleCopyReport() {
    if (isReportEmpty) return;

    clearCopyTimer();

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportContent);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = reportContent;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      if (!isMountedRef.current) return;
      setCopyStatus('copied');
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle');
        copyTimerRef.current = null;
      }, 3000);
    } catch {
      if (!isMountedRef.current) return;
      setCopyStatus('error');
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle');
        copyTimerRef.current = null;
      }, 3000);
    }
  }

  function handleDownloadReport(targetFormat: ReportFormat) {
    clearDownloadTimer();

    if (isReportEmpty) {
      setDownloadFeedback({
        status: 'error',
        message: '다운로드할 보고서 내용이 비어 있습니다.',
      });
      return;
    }

    try {
      const result = downloadIncidentReport(selectedIncident, targetFormat);
      if (result.ok) {
        const filename =
          result.filename ??
          (targetFormat === 'markdown' ? 'incident-report.md' : 'incident-report.txt');
        setDownloadFeedback({
          status: 'success',
          filename,
          format: targetFormat,
        });
        downloadTimerRef.current = window.setTimeout(() => {
          setDownloadFeedback({ status: 'idle' });
          downloadTimerRef.current = null;
        }, 3500);
      } else {
        setDownloadFeedback({
          status: 'error',
          message:
            result.error ||
            '보고서 파일 다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        });
      }
    } catch {
      setDownloadFeedback({
        status: 'error',
        message: '브라우저 환경에서 파일 다운로드를 시작하지 못했습니다.',
      });
    }
  }

  if (incidents.length === 0 || !selectedIncident) {
    return (
      <div className="space-y-6">
        <Card>
          <EmptyState
            title="보고서를 생성할 장애 이력이 없습니다"
            description="먼저 장애 진단을 실행하거나 장애 이력 페이지에서 장애를 등록하면 Markdown·텍스트 형식의 보고서를 자동으로 생성할 수 있습니다."
            icon={<FileText className="h-8 w-8 text-cyanbrand-400" />}
            action={
              <Button
                variant="primary"
                size="md"
                onClick={onOpenHistory}
                leftIcon={<History className="h-4 w-4" />}
              >
                장애 이력 관리로 이동
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const durationMinutes =
    selectedIncident.status === 'resolved'
      ? selectedIncident.resolutionMinutes ??
        computeResolutionMinutes(selectedIncident.occurredAt, selectedIncident.resolvedAt)
      : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-navy-700/80 bg-navy-850/90 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
              장애 보고서 생성
            </h1>
            <Badge tone="cyan">6대 필수 항목 자동 정리</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            선택한 장애 이력을 사내 공유 및 헬프데스크 티켓 첨부에 적합한 Markdown(.md) 또는 일반
            텍스트(.txt) 보고서로 생성하고 클립보드 복사 및 파일 다운로드로 저장합니다.
          </p>
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={onOpenHistory}
          leftIcon={<History className="h-4 w-4" />}
        >
          이력 목록으로
        </Button>
      </div>

      {/* Scope / Git Branch Roadmap Note (Section 10) */}
      <AlertBanner
        tone="cyan"
        title="보고서 내보내기 및 확장 로드맵 안내"
        description="현재 버전에서는 보고서 미리보기, 클립보드 복사, Markdown(.md) 및 일반 텍스트(.txt) 파일 다운로드 기능을 제공합니다. 고급 진단 결과 비교(feature/diagnosis-comparison) 기능은 추후 별도 feature 브랜치에서 추가 예정입니다."
      />

      {/* Selector & Format Controls */}
      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="report-incident-select" className="block text-xs font-semibold text-slate-300">
              보고서 대상 장애 이력 선택
            </label>
            <select
              id="report-incident-select"
              value={selectedIncident.id}
              onChange={(e) => {
                setSelectedId(e.target.value);
                clearCopyTimer();
                clearDownloadTimer();
                setCopyStatus('idle');
                setDownloadFeedback({ status: 'idle' });
              }}
              className="w-full rounded-lg border border-navy-700 bg-navy-900 px-3 py-2.5 text-sm text-slate-100 focus:border-cyanbrand-400 focus:outline-none"
            >
              {incidents.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.isSample ? '[샘플] ' : ''}
                  {incident.title} ({FAULT_TYPE_LABELS[incident.faultType]} ·{' '}
                  {INCIDENT_STATUS_LABELS[incident.status]})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center xl:shrink-0">
            <div
              role="group"
              aria-label="보고서 출력 형식 선택"
              className="inline-flex w-full rounded-lg border border-navy-700 bg-navy-900 p-1 sm:w-auto"
            >
              <button
                type="button"
                onClick={() => {
                  setFormat('markdown');
                  clearCopyTimer();
                  setCopyStatus('idle');
                }}
                aria-pressed={format === 'markdown'}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-initial ${
                  format === 'markdown'
                    ? 'bg-cyanbrand-500/20 text-cyanbrand-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                Markdown
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormat('text');
                  clearCopyTimer();
                  setCopyStatus('idle');
                }}
                aria-pressed={format === 'text'}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-initial ${
                  format === 'text'
                    ? 'bg-cyanbrand-500/20 text-cyanbrand-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                일반 텍스트
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                variant="primary"
                size="md"
                onClick={handleCopyReport}
                className="w-full sm:w-auto"
                leftIcon={
                  copyStatus === 'copied' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <ClipboardCopy className="h-4 w-4" />
                  )
                }
              >
                {copyStatus === 'copied' ? '복사 완료' : '보고서 복사'}
              </Button>

              <div
                role="group"
                aria-label="보고서 파일 다운로드"
                className="grid grid-cols-2 gap-2 sm:flex sm:items-center"
              >
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleDownloadReport('markdown')}
                  disabled={isReportEmpty}
                  title="Markdown(.md) 파일로 다운로드"
                  className="w-full border-cyan-500/35 text-cyan-200 hover:border-cyan-400/60 hover:text-cyan-100 sm:w-auto"
                  leftIcon={
                    downloadFeedback.status === 'success' &&
                    downloadFeedback.format === 'markdown' ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Download className="h-4 w-4 text-cyan-400" />
                    )
                  }
                >
                  .md 다운로드
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => handleDownloadReport('text')}
                  disabled={isReportEmpty}
                  title="일반 텍스트(.txt) 파일로 다운로드"
                  className="w-full border-cyan-500/35 text-cyan-200 hover:border-cyan-400/60 hover:text-cyan-100 sm:w-auto"
                  leftIcon={
                    downloadFeedback.status === 'success' && downloadFeedback.format === 'text' ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Download className="h-4 w-4 text-cyan-400" />
                    )
                  }
                >
                  .txt 다운로드
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Accessible Clipboard & Download Status Notifications */}
        <div aria-live="polite" className="mt-3 min-h-[1.25rem] space-y-1">
          {copyStatus === 'copied' && (
            <p className="text-xs font-medium text-emerald-400">
              {format === 'markdown' ? 'Markdown' : '일반 텍스트'} 형식의 장애 보고서가 클립보드에
              복사되었습니다.
            </p>
          )}
          {copyStatus === 'error' && (
            <p className="text-xs font-medium text-rose-400">
              클립보드 복사에 실패했습니다. 아래 미리보기 영역에서 텍스트를 직접 선택해 복사해
              주세요.
            </p>
          )}
          {downloadFeedback.status === 'success' && (
            <p className="text-xs font-medium text-emerald-400">
              &quot;{downloadFeedback.filename}&quot; 파일 다운로드가 시작되었습니다.
            </p>
          )}
        </div>

        {downloadFeedback.status === 'error' && (
          <AlertBanner
            tone="danger"
            title="보고서 파일 다운로드에 실패했습니다"
            description={downloadFeedback.message}
            className="mt-3"
          />
        )}
      </Card>

      {/* Visual Structured Summary + Raw Report Preview */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Structured 6-Section Visual Summary */}
        <Card
          title="구조화 요약 (6대 필수 항목)"
          subtitle="보고서에 포함되는 핵심 내용을 한눈에 검토하세요."
          className="xl:col-span-5"
          headerAction={
            <ListChecks className="h-4 w-4 text-cyanbrand-400" aria-hidden="true" />
          }
        >
          <div className="space-y-4 text-sm">
            {selectedIncident.isSample && (
              <AlertBanner
                tone="warning"
                title="시연용 샘플 데이터 보고서"
                description="현재 선택한 이력은 [샘플] 예시 데이터입니다."
              />
            )}

            {/* 1. 장애 유형 */}
            <section className="rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyanbrand-400">
                1. 장애 유형
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {selectedIncident.isSample && <Badge tone="warning">[샘플]</Badge>}
                <Badge tone="cyan">{FAULT_TYPE_LABELS[selectedIncident.faultType]}</Badge>
                <Badge tone={getSeverityTone(selectedIncident.severity)}>
                  심각도: {SEVERITY_LABELS[selectedIncident.severity]}
                </Badge>
              </div>
              <p className="mt-2 font-semibold text-slate-100">{selectedIncident.title}</p>
              <p className="mt-1 whitespace-pre-line text-xs text-slate-300">
                {selectedIncident.symptomSummary || '기록된 증상 요약이 없습니다.'}
              </p>
            </section>

            {/* 2. 사용자 점검 결과 */}
            <section className="rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyanbrand-400">
                2. 사용자 점검 결과
              </h3>
              {selectedIncident.userCheckSummary.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300">
                  {selectedIncident.userCheckSummary.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">기록된 사용자 점검 결과가 없습니다.</p>
              )}
            </section>

            {/* 3. 가능한 원인 후보 */}
            <section className="rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyanbrand-400">
                3. 가능한 원인 후보
              </h3>
              {selectedIncident.possibleCauses.length > 0 ? (
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-300">
                  {selectedIncident.possibleCauses.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-slate-400">기록된 원인 후보가 없습니다.</p>
              )}
            </section>

            {/* 4. 판단 근거 */}
            <section className="rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyanbrand-400">
                4. 판단 근거
              </h3>
              {selectedIncident.evidence.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-300">
                  {selectedIncident.evidence.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">기록된 판단 근거가 없습니다.</p>
              )}
            </section>

            {/* 5. 조치 내역 */}
            <section className="rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyanbrand-400">
                5. 조치 내역
              </h3>
              <p className="mt-2 whitespace-pre-line break-words text-xs text-slate-300">
                {selectedIncident.actionNotes || '기록된 조치 내역이 없습니다.'}
              </p>
            </section>

            {/* 6. 해결 상태 */}
            <section className="rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cyanbrand-400">
                6. 해결 상태
              </h3>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={getStatusTone(selectedIncident.status)}>
                  {INCIDENT_STATUS_LABELS[selectedIncident.status]}
                </Badge>
                {durationMinutes !== undefined && (
                  <span className="text-xs font-medium text-emerald-400">
                    처리 시간: {durationMinutes}분
                  </span>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-300">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">발생 시각</dt>
                  <dd>{formatReportTimestamp(selectedIncident.occurredAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">해결 시각</dt>
                  <dd>
                    {selectedIncident.status === 'resolved' && selectedIncident.resolvedAt
                      ? formatReportTimestamp(selectedIncident.resolvedAt)
                      : '미해결'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </Card>

        {/* Safe Plain Text / Markdown Preview (ZERO dangerouslySetInnerHTML) */}
        <Card
          title={format === 'markdown' ? 'Markdown 보고서 미리보기' : '일반 텍스트 보고서 미리보기'}
          subtitle="안전한 텍스트 렌더링으로 XSS 없이 원본 포맷 그대로 확인·복사·다운로드할 수 있습니다."
          className="xl:col-span-7"
          headerAction={
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              안전 텍스트 출력
            </span>
          }
        >
          <pre className="max-h-[42rem] overflow-auto rounded-xl border border-navy-700 bg-[#060b14] p-4 font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
            <code>{reportContent}</code>
          </pre>
        </Card>
      </div>
    </div>
  );
}
