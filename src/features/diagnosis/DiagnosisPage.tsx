import { useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  Gauge,
  Globe,
  HelpCircle,
  History,
  ListChecks,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  WifiOff,
} from 'lucide-react';
import { AlertBanner, Badge, Button, Card } from '../../components';
import {
  evaluateDiagnosis,
  getEstimatedMaxSteps,
  getInitialQuestion,
  getNextQuestion,
} from '../../engine';
import {
  ANSWER_VALUE_LABELS,
  FAULT_TYPES,
  FAULT_TYPE_DESCRIPTIONS,
  FAULT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  INPUT_LIMITS,
  SEVERITY_LABELS,
  type AnswerValue,
  type CommandId,
  type ComponentTone,
  type DiagnosisPageProps,
  type DiagnosisResult,
  type DiagnosticAnswer,
  type FaultType,
  type IncidentRecord,
  type IncidentStatus,
  type Severity,
} from '../../types';

type WizardStep = 1 | 2 | 3;

const COMMAND_DISPLAY_NAMES: Record<CommandId, string> = {
  ipconfig: 'ipconfig /all',
  ping: 'ping',
  nslookup: 'nslookup',
  tracert: 'tracert',
  'test-netconnection': 'Test-NetConnection',
};

const FAULT_ICONS: Record<FaultType, typeof WifiOff> = {
  NO_INTERNET: WifiOff,
  VPN_FAILURE: ShieldAlert,
  DNS_ERROR: Globe,
  SLOW_NETWORK: Gauge,
  INTERMITTENT_DROP: Activity,
};

const LIKELIHOOD_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: '가능성 높음',
  medium: '가능성 보통',
  low: '가능성 낮음',
};

const LIKELIHOOD_TONES: Record<'high' | 'medium' | 'low', ComponentTone> = {
  high: 'cyan',
  medium: 'warning',
  low: 'neutral',
};

const SEVERITY_TONES: Record<Severity, ComponentTone> = {
  low: 'neutral',
  medium: 'cyan',
  high: 'warning',
  critical: 'danger',
};

const ANSWER_TONES: Record<AnswerValue, ComponentTone> = {
  yes: 'cyan',
  no: 'warning',
  unknown: 'neutral',
};

const SEVERITY_OPTIONS: Severity[] = ['low', 'medium', 'high', 'critical'];
const STATUS_OPTIONS: IncidentStatus[] = ['open', 'in_progress', 'resolved'];

function buildDefaultIncidentTitle(result: DiagnosisResult): string {
  const prefix = `[${FAULT_TYPE_LABELS[result.faultType]}] `;
  const core = result.isConclusive
    ? result.candidates[0]?.title ?? '네트워크 진단 결과'
    : `추가 확인 필요 — ${result.candidates[0]?.title ?? FAULT_TYPE_LABELS[result.faultType]}`;
  return `${prefix}${core}`.slice(0, INPUT_LIMITS.TITLE_MAX);
}

function createSessionId(faultType: FaultType): string {
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
  return `diag-${faultType.toLowerCase()}-${suffix}`;
}

export function DiagnosisPage({
  onSaveIncident,
  onOpenCommandGuide,
  onOpenHistory,
  onOpenReport,
}: DiagnosisPageProps) {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 state
  const [selectedFaultType, setSelectedFaultType] = useState<FaultType | null>(null);
  const [symptomInput, setSymptomInput] = useState('');
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Step 2 state
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<AnswerValue | null>(null);
  const [answerNote, setAnswerNote] = useState('');
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // Step 3 state
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<Severity>('medium');
  const [incidentStatus, setIncidentStatus] = useState<IncidentStatus>('open');
  const [actionNotes, setActionNotes] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedIncident, setSavedIncident] = useState<IncidentRecord | null>(null);

  const currentQuestion = useMemo(() => {
    if (step !== 2 || !selectedFaultType) return null;
    return answers.length === 0
      ? getInitialQuestion(selectedFaultType)
      : getNextQuestion(selectedFaultType, answers);
  }, [step, selectedFaultType, answers]);

  const willFinishAfterCurrent = useMemo(() => {
    if (!selectedFaultType || !currentQuestion || !selectedOption) return false;
    const hypotheticalAnswer: DiagnosticAnswer = {
      questionId: currentQuestion.id,
      questionPrompt: currentQuestion.prompt,
      value: selectedOption,
      valueLabel: ANSWER_VALUE_LABELS[selectedOption],
      answeredAt: '',
    };
    return getNextQuestion(selectedFaultType, [...answers, hypotheticalAnswer]) === null;
  }, [selectedFaultType, currentQuestion, selectedOption, answers]);

  const isSymptomWhitespaceOnly =
    symptomInput.length > 0 && symptomInput.trim().length === 0;

  const handleStartDiagnosis = () => {
    if (!selectedFaultType) {
      setStep1Error('먼저 진단할 장애 유형 1가지를 선택해 주세요.');
      return;
    }
    if (isSymptomWhitespaceOnly) {
      setStep1Error('증상 요약에 공백만 입력할 수 없습니다. 내용을 입력하거나 비워 두세요.');
      return;
    }
    if (symptomInput.length > INPUT_LIMITS.SYMPTOM_MAX) {
      setStep1Error(`증상 요약은 최대 ${INPUT_LIMITS.SYMPTOM_MAX}자까지 입력할 수 있습니다.`);
      return;
    }

    setStep1Error(null);
    setAnswers([]);
    setSelectedOption(null);
    setAnswerNote('');
    setStep2Error(null);
    setResult(null);
    setSavedIncident(null);
    setStep(2);
  };

  const handleSubmitAnswer = () => {
    if (!selectedFaultType || !currentQuestion) return;
    if (!selectedOption) {
      setStep2Error('예 / 아니오 / 모름 중 하나의 응답을 선택해 주세요.');
      return;
    }
    if (answerNote.length > 0 && answerNote.trim().length === 0) {
      setStep2Error('점검 메모에 공백만 입력할 수 없습니다. 내용을 입력하거나 비워 두세요.');
      return;
    }
    if (answerNote.length > INPUT_LIMITS.ANSWER_NOTE_MAX) {
      setStep2Error(`점검 메모는 최대 ${INPUT_LIMITS.ANSWER_NOTE_MAX}자까지 입력할 수 있습니다.`);
      return;
    }

    const newAnswer: DiagnosticAnswer = {
      questionId: currentQuestion.id,
      questionPrompt: currentQuestion.prompt,
      value: selectedOption,
      valueLabel: ANSWER_VALUE_LABELS[selectedOption],
      ...(answerNote.trim() ? { note: answerNote.trim() } : {}),
      answeredAt: new Date().toISOString(),
    };

    const nextAnswers = [...answers, newAnswer];
    const nextQuestion = getNextQuestion(selectedFaultType, nextAnswers);

    setStep2Error(null);
    setAnswers(nextAnswers);
    setSelectedOption(null);
    setAnswerNote('');

    if (!nextQuestion) {
      const evaluated = evaluateDiagnosis({
        sessionId: createSessionId(selectedFaultType),
        faultType: selectedFaultType,
        symptomSummary: symptomInput.trim(),
        answers: nextAnswers,
      });
      setResult(evaluated);
      setIncidentTitle(buildDefaultIncidentTitle(evaluated));
      setIncidentSeverity(evaluated.suggestedSeverity);
      setIncidentStatus('open');
      setActionNotes('');
      setSaveError(null);
      setSavedIncident(null);
      setStep(3);
    }
  };

  const handlePreviousQuestion = () => {
    setStep2Error(null);
    if (answers.length === 0) {
      setStep(1);
      return;
    }
    const previous = answers[answers.length - 1];
    setAnswers(answers.slice(0, -1));
    setSelectedOption(previous.value);
    setAnswerNote(previous.note ?? '');
  };

  const handleEditLastFromResult = () => {
    if (answers.length === 0) {
      setStep(1);
      return;
    }
    const last = answers[answers.length - 1];
    setAnswers(answers.slice(0, -1));
    setSelectedOption(last.value);
    setAnswerNote(last.note ?? '');
    setResult(null);
    setSavedIncident(null);
    setStep(2);
  };

  const handleRestartAll = () => {
    setStep(1);
    setSelectedFaultType(null);
    setSymptomInput('');
    setStep1Error(null);
    setAnswers([]);
    setSelectedOption(null);
    setAnswerNote('');
    setStep2Error(null);
    setResult(null);
    setIncidentTitle('');
    setActionNotes('');
    setSaveError(null);
    setSavedIncident(null);
  };

  const handleSaveIncidentSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!result) return;

    const trimmedTitle = incidentTitle.trim();
    if (!trimmedTitle) {
      setSaveError('장애 이력 제목은 공백이 아닌 문자로 입력해야 합니다.');
      return;
    }
    if (trimmedTitle.length > INPUT_LIMITS.TITLE_MAX) {
      setSaveError(`제목은 최대 ${INPUT_LIMITS.TITLE_MAX}자까지 입력할 수 있습니다.`);
      return;
    }
    if (actionNotes.length > 0 && actionNotes.trim().length === 0) {
      setSaveError('조치 메모에 공백만 입력할 수 없습니다. 내용을 입력하거나 비워 두세요.');
      return;
    }
    if (actionNotes.length > INPUT_LIMITS.ACTION_NOTES_MAX) {
      setSaveError(`조치 메모는 최대 ${INPUT_LIMITS.ACTION_NOTES_MAX}자까지 입력할 수 있습니다.`);
      return;
    }

    setSaveError(null);
    const saved = onSaveIncident({
      title: trimmedTitle,
      faultType: result.faultType,
      severity: incidentSeverity,
      status: incidentStatus,
      symptomSummary: result.userSymptomSummary,
      userCheckSummary: result.inputSummary.map(
        (ans) =>
          `${ans.questionPrompt} → ${ans.valueLabel}${ans.note ? ` (${ans.note})` : ''}`
      ),
      possibleCauses: result.candidates.map(
        (c) => `[${c.ruleId}] ${c.title} (규칙 적합도 ${c.score}점)`
      ),
      evidence: result.evidence,
      actionNotes: actionNotes.trim(),
      occurredAt: result.completedAt,
      ...(incidentStatus === 'resolved' ? { resolvedAt: new Date().toISOString() } : {}),
      diagnosisResult: result,
    });
    if (!saved) {
      setSavedIncident(null);
      setSaveError(
        '장애 이력을 저장하지 못했습니다. 비밀번호·토큰 등 민감한 인증정보가 포함되지 않았는지 입력값을 확인하거나, 브라우저 LocalStorage 용량 초과·저장소 접근 제한 상태를 확인해 주세요. 기존 저장 데이터는 손상되지 않았습니다.'
      );
      return;
    }
    setSavedIncident(saved);
  };

  const estimatedMaxSteps = selectedFaultType ? getEstimatedMaxSteps(selectedFaultType) : 4;
  const currentStepIndex = answers.length + 1;
  const progressPercent = Math.min(
    95,
    Math.round(((answers.length + (selectedOption ? 0.5 : 0.15)) / estimatedMaxSteps) * 100)
  );

  return (
    <div className="space-y-6 text-slate-100">
      {/* Page Header & 3-Step Progress Indicator */}
      <div className="rounded-2xl bg-[#111b2e] border border-slate-800 p-5 sm:p-6 shadow-card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="cyan">규칙 기반 원인 감별</Badge>
              <Badge tone="neutral">읽기 전용 안전 진단</Badge>
            </div>
            <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-white">
              네트워크 장애 진단 마법사
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              실제 점검 응답에 따라 질문이 동적으로 분기되며, 원인 후보·판단 근거·안전한 점검 순서를 체계적으로 도출합니다.
            </p>
          </div>

          <ol
            aria-label="진단 진행 단계"
            className="flex flex-wrap items-center gap-2 sm:gap-3"
          >
            {[
              { num: 1 as WizardStep, label: '장애 유형 선택' },
              { num: 2 as WizardStep, label: '원인 감별 질문' },
              { num: 3 as WizardStep, label: '진단 결과 및 저장' },
            ].map((item) => {
              const isActive = step === item.num;
              const isDone = step > item.num;
              return (
                <li
                  key={item.num}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                      : isDone
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-800 bg-[#0b1220] text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      isActive
                        ? 'bg-cyan-400 text-slate-950'
                        : isDone
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isDone ? '✓' : item.num}
                  </span>
                  <span>{item.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* =================================================================== */}
      {/* STEP 1: FAULT TYPE SELECTION + SYMPTOM DESCRIPTION                  */}
      {/* =================================================================== */}
      {step === 1 && (
        <div className="space-y-6">
          <Card
            title="1단계. 발생 중인 네트워크 장애 유형 선택"
            subtitle="현재 체감되는 대표 증상 1가지를 선택하면 해당 유형에 최적화된 분기 질문이 시작됩니다."
          >
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {FAULT_TYPES.map((ft) => {
                const Icon = FAULT_ICONS[ft];
                const isSelected = selectedFaultType === ft;
                return (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => {
                      setSelectedFaultType(ft);
                      setStep1Error(null);
                    }}
                    aria-pressed={isSelected}
                    className={`group flex flex-col items-start rounded-2xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-500/10 shadow-glow'
                        : 'border-slate-800 bg-[#0b1220] hover:border-slate-700 hover:bg-[#132038]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                          isSelected
                            ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                            : 'border-slate-700/80 bg-slate-900 text-slate-300 group-hover:text-cyan-300'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      {isSelected && <Badge tone="cyan">선택됨</Badge>}
                    </div>
                    <h3 className="mt-3.5 text-base font-semibold text-white">
                      {FAULT_TYPE_LABELS[ft]}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {FAULT_TYPE_DESCRIPTIONS[ft]}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card
            title="증상 요약 메모 (선택 사항)"
            subtitle="발생 시점, 영향 범위, 화면에 표시된 일반 오류 문구 등을 간략히 적어 두면 진단 결과와 장애 이력에 함께 반영됩니다."
          >
            <div className="space-y-4">
              <AlertBanner
                tone="warning"
                title="민감 정보 입력 금지 안내"
                description="비밀번호, 사내 계정 자격 증명(ID/PW), OTP 코드, VPN 인증 키, 내부 비공개 서버 비밀 정보는 절대 입력하지 마세요."
              />

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <label htmlFor="diagnosis-symptom-input" className="font-medium text-slate-300">
                    상세 증상 메모 (선택)
                  </label>
                  <span
                    className={`font-mono ${
                      symptomInput.length >= INPUT_LIMITS.SYMPTOM_MAX
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {symptomInput.length} / {INPUT_LIMITS.SYMPTOM_MAX}
                  </span>
                </div>
                <textarea
                  id="diagnosis-symptom-input"
                  rows={3}
                  value={symptomInput}
                  maxLength={INPUT_LIMITS.SYMPTOM_MAX}
                  onChange={(e) => {
                    setSymptomInput(e.target.value);
                    setStep1Error(null);
                  }}
                  placeholder="예: 오늘 오전 10시부터 사무실 Wi-Fi는 연결됨으로 표시되지만 웹 페이지가 열리지 않습니다."
                  className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                />
                {isSymptomWhitespaceOnly && (
                  <p className="mt-1.5 text-xs text-rose-400" role="alert">
                    공백만 입력할 수 없습니다. 증상을 입력하거나 입력란을 비워 주세요.
                  </p>
                )}
              </div>

              {step1Error && (
                <AlertBanner tone="danger" title="입력 확인 필요" description={step1Error} />
              )}

              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  NetDoctor는 PC 네트워크 설정을 자동으로 변경하지 않으며, 안전한 점검 절차만 안내합니다.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={!selectedFaultType || isSymptomWhitespaceOnly}
                  onClick={handleStartDiagnosis}
                  leftIcon={<Sparkles className="h-4 w-4" />}
                >
                  <span className="inline-flex items-center gap-1.5">
                    진단 시작
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 2: DYNAMIC BRANCHING Q&A WIZARD                                */}
      {/* =================================================================== */}
      {step === 2 && selectedFaultType && currentQuestion && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Question Column */}
          <div className="lg:col-span-8">
            <Card
              title={`${FAULT_TYPE_LABELS[selectedFaultType]} — 단계별 원인 감별`}
              subtitle={`질문 ${currentStepIndex} / 예상 최대 ${estimatedMaxSteps}단계 · 이전 응답에 따라 다음 질문이 동적으로 결정됩니다.`}
              headerAction={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRestartAll}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  처음부터 다시
                </Button>
              }
            >
              {/* Progress Bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#0b1220] border border-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Question Prompt */}
              <div className="mt-6">
                <span className="font-mono text-xs uppercase tracking-wider text-cyan-400">
                  QUESTION #{currentStepIndex} · {currentQuestion.id}
                </span>
                <h3 className="mt-1.5 text-xl font-bold leading-snug text-white">
                  {currentQuestion.prompt}
                </h3>
                {currentQuestion.description && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {currentQuestion.description}
                  </p>
                )}
              </div>

              {/* Recommended Command Jump Box */}
              {currentQuestion.recommendedCommandId && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-cyan-500/30 bg-[#0b1220] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5 text-xs text-slate-300">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
                      <Terminal className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-semibold text-cyan-200">
                        확인에 도움이 되는 Windows 명령어:{' '}
                        <code className="font-mono text-cyan-300">
                          {COMMAND_DISPLAY_NAMES[currentQuestion.recommendedCommandId]}
                        </code>
                      </p>
                      <p className="text-slate-400">
                        안전한 실행 방법과 출력 해석 기준은 명령어 가이드에서 바로 확인할 수 있습니다.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Terminal className="h-3.5 w-3.5 text-cyan-300" />}
                    onClick={() =>
                      onOpenCommandGuide(currentQuestion.recommendedCommandId as CommandId)
                    }
                  >
                    명령어 가이드 보기
                  </Button>
                </div>
              )}

              {/* Answer Options (yes / no / unknown) */}
              <div
                role="radiogroup"
                aria-label={currentQuestion.prompt}
                className="mt-6 space-y-3"
              >
                {currentQuestion.options.map((opt) => {
                  const isPicked = selectedOption === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isPicked}
                      onClick={() => {
                        setSelectedOption(opt.value);
                        setStep2Error(null);
                      }}
                      className={`flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        isPicked
                          ? 'border-cyan-400 bg-cyan-500/10 shadow-glow'
                          : 'border-slate-800 bg-[#0b1220] hover:border-slate-700 hover:bg-[#14223b]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          isPicked
                            ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                            : 'border-slate-600 bg-transparent'
                        }`}
                      >
                        {isPicked && <span className="h-2 w-2 rounded-full bg-slate-950" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{opt.label}</span>
                          {opt.value === 'unknown' && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300">
                              <HelpCircle className="h-3 w-3" />
                              미확인 항목으로 자동 기록
                            </span>
                          )}
                        </div>
                        {opt.hint && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">{opt.hint}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Optional Short Note */}
              <div className="mt-5 rounded-xl border border-slate-800 bg-[#0b1220] p-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <label htmlFor="diagnosis-answer-note" className="font-medium text-slate-300">
                    확인 메모 (선택 · 명령어 출력 요약이나 관찰 사항)
                  </label>
                  <span className="font-mono text-slate-400">
                    {answerNote.length} / {INPUT_LIMITS.ANSWER_NOTE_MAX}
                  </span>
                </div>
                <input
                  id="diagnosis-answer-note"
                  type="text"
                  value={answerNote}
                  maxLength={INPUT_LIMITS.ANSWER_NOTE_MAX}
                  onChange={(e) => {
                    setAnswerNote(e.target.value);
                    setStep2Error(null);
                  }}
                  placeholder="예: ipconfig에서 169.254 대역 확인됨 (비밀번호·민감 정보 입력 금지)"
                  className="w-full rounded-lg border border-slate-700 bg-[#111b2e] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                />
              </div>

              {step2Error && (
                <div className="mt-4">
                  <AlertBanner tone="danger" title="응답 확인 필요" description={step2Error} />
                </div>
              )}

              {/* Navigation Controls */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePreviousQuestion}
                  leftIcon={<ArrowLeft className="h-4 w-4" />}
                >
                  {answers.length === 0 ? '장애 유형 다시 선택' : '이전 질문'}
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  disabled={!selectedOption}
                  onClick={handleSubmitAnswer}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {willFinishAfterCurrent ? '진단 결과 분석' : '다음 질문'}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </div>
            </Card>
          </div>

          {/* Right Column: Trail of Previous Answers */}
          <aside className="lg:col-span-4">
            <Card
              title="진행 중인 응답 요약"
              subtitle="응답 이력에 따라 분기 경로가 동적으로 계산됩니다."
            >
              <div className="space-y-3">
                {symptomInput.trim() && (
                  <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      입력된 증상 메모
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-200">
                      {symptomInput.trim()}
                    </p>
                  </div>
                )}

                {answers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-800 bg-[#0b1220]/70 p-4 text-xs text-slate-400">
                    아직 완료된 질문이 없습니다. 첫 질문에 응답하면 분기 이력이 여기에 표시됩니다.
                  </p>
                ) : (
                  <ol className="space-y-2.5">
                    {answers.map((ans, idx) => (
                      <li
                        key={ans.questionId}
                        className="rounded-xl border border-slate-800 bg-[#0b1220] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300">
                            Q{idx + 1}. {ans.questionPrompt}
                          </span>
                          <Badge tone={ANSWER_TONES[ans.value]} className="shrink-0">
                            {ans.valueLabel}
                          </Badge>
                        </div>
                        {ans.note && (
                          <p className="mt-1.5 text-[11px] text-cyan-300/90">메모: {ans.note}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          </aside>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 3: DIAGNOSTIC RESULT DASHBOARD + SAVE TO INCIDENT HISTORY      */}
      {/* =================================================================== */}
      {step === 3 && result && (
        <div className="space-y-6">
          {/* Top Action & Meta Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#111b2e] border border-slate-800 p-4 sm:px-6 shadow-card">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="cyan">{FAULT_TYPE_LABELS[result.faultType]}</Badge>
              <Badge tone={SEVERITY_TONES[result.suggestedSeverity]}>
                권장 심각도: {SEVERITY_LABELS[result.suggestedSeverity]}
              </Badge>
              <Badge tone={result.isConclusive ? 'success' : 'warning'}>
                {result.isConclusive ? '1차 원인 범위 도출' : '근거 부족 (원인 미확정)'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleEditLastFromResult}
                leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
              >
                마지막 응답 수정
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRestartAll}
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              >
                새 진단 시작
              </Button>
            </div>
          </div>

          {/* Conclusiveness Banner */}
          {result.isConclusive ? (
            <AlertBanner
              tone="cyan"
              title="규칙 기반 1차 진단 완료"
              description={result.conclusivenessNotice}
            />
          ) : (
            <AlertBanner
              tone="warning"
              title="근거 부족 — 단일 원인을 확정할 수 없습니다"
              description={result.conclusivenessNotice}
              className="border-amber-400/60 bg-amber-500/15"
            />
          )}

          {/* 1. 가능한 원인 후보 */}
          <Card
            title="가능한 원인 후보"
            subtitle="사용자 응답을 규칙 가중치로 평가한 순위입니다. (실시간 측정 수치가 아닌 규칙 적합도 점수)"
          >
            <div className="space-y-4">
              {result.candidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  className={`rounded-xl border p-4 sm:p-5 ${
                    index === 0 && result.isConclusive
                      ? 'border-cyan-500/50 bg-cyan-500/[0.06]'
                      : 'border-slate-800 bg-[#0b1220]'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-800 font-mono text-xs font-bold text-cyan-300">
                        #{index + 1}
                      </span>
                      <h3 className="text-base font-bold text-white">{candidate.title}</h3>
                      <span className="rounded bg-slate-800/90 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                        {candidate.ruleId}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={LIKELIHOOD_TONES[candidate.likelihood]}>
                        {LIKELIHOOD_LABELS[candidate.likelihood]}
                      </Badge>
                      <span className="font-mono text-sm font-bold text-cyan-300">
                        {candidate.score}점
                      </span>
                    </div>
                  </div>

                  {/* Rule Score Bar */}
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>규칙 적합도</span>
                      <span className="font-mono">{candidate.score} / 100</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all ${
                          candidate.likelihood === 'high'
                            ? 'bg-gradient-to-r from-cyan-500 to-cyan-300'
                            : candidate.likelihood === 'medium'
                              ? 'bg-amber-400'
                              : 'bg-slate-500'
                        }`}
                        style={{ width: `${candidate.score}%` }}
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {candidate.explanation}
                  </p>

                  {candidate.supportingEvidence.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-slate-800/80 pt-3">
                      {candidate.supportingEvidence.map((item, evIdx) => (
                        <li
                          key={evIdx}
                          className="flex items-start gap-2 text-xs leading-relaxed text-slate-300"
                        >
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* 2. 판단 근거 & 3. 사용자 입력 요약 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              title="판단 근거"
              subtitle="입력된 각 응답이 진단 추론에 반영된 내역입니다."
            >
              <ul className="space-y-2.5">
                {result.evidence.map((line, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-[#0b1220] p-3 text-xs leading-relaxed text-slate-200"
                  >
                    <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              title="사용자 입력 요약"
              subtitle="현재 세션에서 기록된 증상 메모 및 질문 응답 목록입니다."
            >
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-800 bg-[#0b1220] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    증상 요약
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{result.userSymptomSummary}</p>
                </div>

                <ol className="space-y-2">
                  {result.inputSummary.map((ans, idx) => (
                    <li
                      key={ans.questionId}
                      className="rounded-xl border border-slate-800 bg-[#0b1220] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-slate-200">
                          {idx + 1}. {ans.questionPrompt}
                        </span>
                        <Badge tone={ANSWER_TONES[ans.value]} className="shrink-0">
                          {ans.valueLabel}
                        </Badge>
                      </div>
                      {ans.note && (
                        <p className="mt-1.5 text-xs text-cyan-300/90">메모: {ans.note}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          </div>

          {/* 4. 추천 점검 순서 */}
          <Card
            title="추천 점검 순서"
            subtitle="안전한 읽기 전용 Windows 명령어부터 순서대로 실행하여 원인을 검증하세요."
          >
            <ol className="space-y-3">
              {result.recommendedCheckOrder.map((check) => (
                <li
                  key={check.order}
                  className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0b1220] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 font-mono text-xs font-bold text-cyan-300 border border-cyan-500/30">
                      {check.order}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{check.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-300">
                        {check.instruction}
                      </p>
                    </div>
                  </div>
                  {check.commandId && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenCommandGuide(check.commandId as CommandId)}
                      leftIcon={<Terminal className="h-3.5 w-3.5 text-cyan-300" />}
                    >
                      {COMMAND_DISPLAY_NAMES[check.commandId]} 가이드
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          </Card>

          {/* 5. 안전한 해결 방법 & 6. 추가 확인이 필요한 사항 */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card
              title="안전한 해결 방법"
              subtitle="보안 정책을 유지하면서 시스템을 안전하게 복구할 수 있는 권장 절차입니다."
            >
              <ul className="space-y-2.5">
                {result.safeResolutions.map((resolution, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-[#0b1220] p-3.5 text-xs leading-relaxed text-slate-200"
                  >
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{resolution}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card
              title="추가 확인이 필요한 사항"
              subtitle={
                result.isConclusive
                  ? '복구 검증 및 재발 방지를 위해 함께 점검하면 좋은 항목입니다.'
                  : '미확인("모름") 항목 또는 경합 후보를 확정하기 위해 우선 확인해야 할 항목입니다.'
              }
              className={result.isConclusive ? '' : 'border-amber-500/50'}
            >
              <ul className="space-y-2.5">
                {result.additionalChecksNeeded.map((checkItem, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-[#0b1220] p-3.5 text-xs leading-relaxed text-slate-200"
                  >
                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span>{checkItem}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* 7. 장애 이력으로 저장 */}
          <Card
            title="장애 이력으로 저장"
            subtitle="현재 진단 결과와 점검 내용을 로컬 장애 이력에 저장하여 추적·보고서 작성에 활용할 수 있습니다."
            className="border-cyan-500/35"
          >
            {savedIncident ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <BookmarkCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <div>
                      <h4 className="text-sm font-semibold text-emerald-200">
                        장애 이력이 저장되었습니다.
                      </h4>
                      <p className="mt-1 text-xs text-slate-200">
                        제목: <strong className="text-white">{savedIncident.title}</strong>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                        기록 ID: {savedIncident.id}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => onOpenReport(savedIncident.id)}
                    leftIcon={<FileText className="h-4 w-4" />}
                  >
                    이 이력으로 보고서 작성
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onOpenHistory}
                    leftIcon={<History className="h-4 w-4" />}
                  >
                    장애 이력 목록 보기
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveIncidentSubmit} className="space-y-4" noValidate>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <label htmlFor="incident-save-title" className="font-medium text-slate-200">
                      장애 제목 <span className="text-rose-400">*</span>
                    </label>
                    <span className="font-mono text-slate-400">
                      {incidentTitle.length} / {INPUT_LIMITS.TITLE_MAX}
                    </span>
                  </div>
                  <input
                    id="incident-save-title"
                    type="text"
                    required
                    value={incidentTitle}
                    maxLength={INPUT_LIMITS.TITLE_MAX}
                    onChange={(e) => {
                      setIncidentTitle(e.target.value);
                      setSaveError(null);
                    }}
                    placeholder="장애 이력 제목을 입력해 주세요."
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="incident-save-severity"
                      className="mb-1.5 block text-xs font-medium text-slate-200"
                    >
                      심각도
                    </label>
                    <select
                      id="incident-save-severity"
                      value={incidentSeverity}
                      onChange={(e) => setIncidentSeverity(e.target.value as Severity)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                    >
                      {SEVERITY_OPTIONS.map((sev) => (
                        <option key={sev} value={sev}>
                          {SEVERITY_LABELS[sev]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="incident-save-status"
                      className="mb-1.5 block text-xs font-medium text-slate-200"
                    >
                      현재 처리 상태
                    </label>
                    <select
                      id="incident-save-status"
                      value={incidentStatus}
                      onChange={(e) => setIncidentStatus(e.target.value as IncidentStatus)}
                      className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {INCIDENT_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <label htmlFor="incident-save-notes" className="font-medium text-slate-200">
                      조치 및 확인 메모 (선택)
                    </label>
                    <span className="font-mono text-slate-400">
                      {actionNotes.length} / {INPUT_LIMITS.ACTION_NOTES_MAX}
                    </span>
                  </div>
                  <textarea
                    id="incident-save-notes"
                    rows={3}
                    value={actionNotes}
                    maxLength={INPUT_LIMITS.ACTION_NOTES_MAX}
                    onChange={(e) => {
                      setActionNotes(e.target.value);
                      setSaveError(null);
                    }}
                    placeholder="실행한 명령어 결과 요약이나 후속 조치 계획을 기록하세요. (비밀번호·계정 정보·내부 비밀 키 입력 금지)"
                    className="w-full rounded-xl border border-slate-700 bg-[#0b1220] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                  />
                </div>

                {saveError && (
                  <AlertBanner tone="danger" title="장애 이력 저장 실패" description={saveError} />
                )}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-400">
                    데이터는 현재 브라우저의 로컬 저장소(LocalStorage)에만 보관됩니다.
                  </p>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    leftIcon={<Save className="h-4 w-4" />}
                  >
                    장애 이력으로 저장
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
