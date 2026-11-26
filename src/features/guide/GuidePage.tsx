import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CopyCodeBlock,
  EmptyState,
  SearchInput,
} from '../../components';
import {
  COMMAND_CATEGORY_LABELS,
  FAULT_TYPE_LABELS,
  INPUT_LIMITS,
  type CommandCategory,
  type CommandId,
  type CommandInterpretation,
  type ComponentTone,
  type GuidePageProps,
} from '../../types';
import { filterCommandGuides, WINDOWS_COMMAND_GUIDES } from './commands';

type CategoryFilter = 'ALL' | CommandCategory;

const CATEGORY_ORDER: CommandCategory[] = [
  'CONFIGURATION',
  'CONNECTIVITY',
  'DNS',
  'ROUTING',
  'PORT_DIAGNOSTICS',
];

const INTERPRETATION_META: Record<
  CommandInterpretation['status'],
  {
    label: string;
    tone: ComponentTone;
    borderClass: string;
    bgClass: string;
    Icon: typeof CheckCircle2;
    iconColor: string;
  }
> = {
  normal: {
    label: '정상',
    tone: 'success',
    borderClass: 'border-emerald-500/30',
    bgClass: 'bg-emerald-500/5',
    Icon: CheckCircle2,
    iconColor: 'text-emerald-300',
  },
  warning: {
    label: '주의',
    tone: 'warning',
    borderClass: 'border-amber-500/30',
    bgClass: 'bg-amber-500/5',
    Icon: AlertTriangle,
    iconColor: 'text-amber-300',
  },
  error: {
    label: '오류',
    tone: 'danger',
    borderClass: 'border-rose-500/35',
    bgClass: 'bg-rose-500/5',
    Icon: AlertOctagon,
    iconColor: 'text-rose-300',
  },
};

export function GuidePage({ initialCommandId }: GuidePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilter>('ALL');
  const [selectedCommandId, setSelectedCommandId] = useState<CommandId>(
    initialCommandId ?? WINDOWS_COMMAND_GUIDES[0].id,
  );

  // When navigated from another view with a specific command target, focus it immediately.
  useEffect(() => {
    if (!initialCommandId) return;
    setSelectedCommandId(initialCommandId);
    setSearchQuery('');
    setSelectedCategory('ALL');
  }, [initialCommandId]);

  const filteredGuides = useMemo(
    () =>
      filterCommandGuides(WINDOWS_COMMAND_GUIDES, searchQuery, selectedCategory),
    [searchQuery, selectedCategory],
  );

  const categoryCounts = useMemo(() => {
    const queryMatched = filterCommandGuides(
      WINDOWS_COMMAND_GUIDES,
      searchQuery,
      'ALL',
    );
    const counts: Record<CategoryFilter, number> = {
      ALL: queryMatched.length,
      CONFIGURATION: 0,
      CONNECTIVITY: 0,
      DNS: 0,
      ROUTING: 0,
      PORT_DIAGNOSTICS: 0,
    };
    for (const guide of queryMatched) {
      counts[guide.category] += 1;
    }
    return counts;
  }, [searchQuery]);

  const activeGuide = useMemo(() => {
    if (filteredGuides.length === 0) return null;
    return (
      filteredGuides.find((guide) => guide.id === selectedCommandId) ??
      filteredGuides[0]
    );
  }, [filteredGuides, selectedCommandId]);

  const isFiltered = searchQuery.trim().length > 0 || selectedCategory !== 'ALL';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Safety Policy Banner */}
      <AlertBanner
        tone="cyan"
        title="읽기 전용 안전 진단 명령어 가이드"
        description="수록된 Windows 명령어 5종은 Microsoft 공식 문서 기반의 읽기 전용 점검 도구이며, 예시 대상(example.com, 192.0.2.1, 8.8.8.8, 127.0.0.1)만 사용합니다. Windows 방화벽·보안 기능 비활성화나 네트워크 설정 자동 변경은 권장하지 않습니다."
      />

      {/* Search & Category Filter Controls */}
      <section
        aria-label="명령어 검색 및 카테고리 필터"
        className="rounded-2xl bg-[#111b2e] border border-slate-800 p-4 sm:p-5 shadow-card space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              maxLength={INPUT_LIMITS.SEARCH_MAX}
              placeholder="명령어, 증상, 오류 메시지, 태그 검색 (예: ipconfig, 169.254, DNS, 443...)"
              ariaLabel="Windows 네트워크 명령어 검색"
            />
          </div>
          <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
            <span
              className="text-xs text-slate-400 font-medium"
              aria-live="polite"
            >
              총 {WINDOWS_COMMAND_GUIDES.length}개 중{' '}
              <strong className="text-cyan-300">{filteredGuides.length}개</strong>{' '}
              표시
            </span>
            {isFiltered && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={handleResetFilters}
              >
                필터 초기화
              </Button>
            )}
          </div>
        </div>

        <div
          role="group"
          aria-label="명령어 카테고리 필터"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            aria-pressed={selectedCategory === 'ALL'}
            onClick={() => setSelectedCategory('ALL')}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              selectedCategory === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-sm'
                : 'bg-[#0b1220] text-slate-300 border-slate-700/90 hover:border-slate-600 hover:text-white'
            }`}
          >
            <span>전체</span>
            <span className="rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-mono text-slate-300">
              {categoryCounts.ALL}
            </span>
          </button>

          {CATEGORY_ORDER.map((category) => {
            const isActive = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelectedCategory(category)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50 shadow-sm'
                    : 'bg-[#0b1220] text-slate-300 border-slate-700/90 hover:border-slate-600 hover:text-white'
                }`}
              >
                <span>{COMMAND_CATEGORY_LABELS[category]}</span>
                <span className="rounded-full bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-mono text-slate-300">
                  {categoryCounts[category]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Responsive Content */}
      {filteredGuides.length === 0 || !activeGuide ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title="일치하는 Windows 네트워크 명령어가 없습니다"
          description="검색어를 줄이거나 카테고리 필터를 전체로 변경해 5가지 공식 진단 명령어를 확인하세요."
          action={
            <Button
              variant="primary"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={handleResetFilters}
            >
              전체 명령어 보기
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Command Selector Cards */}
          <aside
            aria-label="진단 명령어 목록"
            className="xl:col-span-4 space-y-3"
          >
            {filteredGuides.map((guide) => {
              const isSelected = activeGuide.id === guide.id;
              return (
                <button
                  key={guide.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedCommandId(guide.id)}
                  className={`w-full text-left rounded-2xl p-4 border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isSelected
                      ? 'bg-[#162238] border-cyan-400/60 shadow-glow'
                      : 'bg-[#111b2e] border-slate-800 hover:border-slate-700 hover:bg-[#142036]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#060b14] border border-slate-800 px-2.5 py-1 text-xs font-mono font-semibold text-cyan-300">
                      <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      {guide.command}
                    </span>
                    <Badge tone={isSelected ? 'cyan' : 'neutral'}>
                      {guide.shell}
                    </Badge>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-100 mt-3 leading-snug">
                    {guide.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed line-clamp-2">
                    {guide.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/80">
                    <Badge tone="neutral" className="text-[11px]">
                      {COMMAND_CATEGORY_LABELS[guide.category]}
                    </Badge>
                    {guide.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-slate-400 bg-slate-900/70 border border-slate-800 rounded-md px-1.5 py-0.5"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Right Column: Rich Command Detail View */}
          <article
            aria-label={`${activeGuide.command} 상세 가이드`}
            className="xl:col-span-8 space-y-5"
          >
            {/* Overview & Official Reference Header */}
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#060b14] border border-cyan-500/35 px-3 py-1 text-sm font-mono font-semibold text-cyan-300">
                      <Terminal className="w-4 h-4 text-cyan-400" />
                      {activeGuide.command}
                    </span>
                    <Badge tone="cyan">
                      {COMMAND_CATEGORY_LABELS[activeGuide.category]}
                    </Badge>
                    <Badge tone="neutral">{activeGuide.shell}</Badge>
                  </div>

                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    {activeGuide.title}
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {activeGuide.summary}
                  </p>
                </div>

                <a
                  href={activeGuide.officialDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 shrink-0 rounded-xl bg-[#162238] hover:bg-[#1e2f4d] border border-cyan-500/35 hover:border-cyan-400/60 px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:text-cyan-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <span>Microsoft 공식 문서</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-400 mr-1">
                  연관 장애 유형:
                </span>
                {activeGuide.relatedFaultTypes.map((faultType) => (
                  <Badge key={faultType} tone="neutral">
                    {FAULT_TYPE_LABELS[faultType]}
                  </Badge>
                ))}
              </div>
            </Card>

            {/* Safe Copyable Examples */}
            <Card
              title="안전 실행 명령어 예시"
              subtitle="모든 예시는 읽기 전용 점검 옵션과 안전한 표준 예시 대상(RFC 2606 / RFC 5737)을 사용합니다."
            >
              <div className="space-y-4">
                {activeGuide.safeExamples.map((example) => (
                  <div key={example.command} className="space-y-2">
                    <CopyCodeBlock
                      code={example.command}
                      label={example.label}
                      shell={activeGuide.shell}
                    />
                    <p className="text-xs sm:text-sm text-slate-300 pl-1 leading-relaxed">
                      {example.purpose}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Step-by-Step Execution Guide */}
            <Card
              title="단계별 실행 방법"
              subtitle="관리자 권한 상승 없이 일반 사용자 권한 터미널에서 순서대로 점검할 수 있습니다."
              headerAction={
                <span className="inline-flex items-center gap-1.5 text-xs text-cyan-300 font-medium">
                  <ListChecks className="w-4 h-4" aria-hidden="true" />
                  {activeGuide.executionSteps.length}단계
                </span>
              }
            >
              <ol className="space-y-3">
                {activeGuide.executionSteps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="mt-0.5 w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/35 text-cyan-300 text-xs font-mono font-semibold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>

            {/* Realistic Sanitized Sample Output */}
            <Card
              title="정상 출력 예시 (가상 예시 데이터)"
              subtitle="실제 사내 정보가 포함되지 않은 RFC 5737 / RFC 2606 기준 정상 출력 형태입니다."
            >
              <div className="rounded-xl bg-[#060b14] border border-slate-800 overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-[#0c1424] border-b border-slate-800/90">
                  <span className="inline-flex items-center gap-2 text-xs font-mono text-slate-300">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    Sample Output — {activeGuide.command}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    읽기 전용 예시
                  </span>
                </div>
                <pre className="p-4 overflow-x-auto text-xs sm:text-[13px] leading-relaxed font-mono text-slate-200">
                  <code>{activeGuide.sampleOutput}</code>
                </pre>
              </div>
            </Card>

            {/* Structured Result Interpretations */}
            <Card
              title="출력 결과 해석 가이드"
              subtitle="터미널에 표시된 핵심 패턴에 따라 정상·주의·오류 상태를 구분하고 안전한 다음 조치를 확인하세요."
            >
              <div className="space-y-3.5">
                {activeGuide.interpretations.map((item) => {
                  const meta = INTERPRETATION_META[item.status];
                  const StatusIcon = meta.Icon;

                  return (
                    <div
                      key={item.pattern}
                      className={`rounded-xl border p-4 space-y-2.5 ${meta.borderClass} ${meta.bgClass}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone}>
                          <StatusIcon
                            className={`w-3.5 h-3.5 ${meta.iconColor}`}
                            aria-hidden="true"
                          />
                          <span>{meta.label}</span>
                        </Badge>
                        <code className="text-xs sm:text-[13px] font-mono font-semibold text-slate-100 bg-[#060b14]/80 border border-slate-800 rounded-md px-2 py-0.5">
                          {item.pattern}
                        </code>
                      </div>

                      <p className="text-sm text-slate-200 leading-relaxed">
                        {item.meaning}
                      </p>

                      <div className="rounded-lg bg-[#0b1220]/90 border border-slate-800/90 px-3 py-2.5">
                        <p className="text-xs font-semibold text-cyan-300 mb-0.5">
                          안전한 다음 조치
                        </p>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {item.safeNextStep}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Safety Note & Citation Footer */}
            <div className="space-y-3">
              <AlertBanner
                tone="warning"
                title="안전 점검 주의사항"
                description={activeGuide.safetyNote}
              />

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#111b2e] border border-slate-800 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <ShieldCheck
                    className="w-4 h-4 text-cyan-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>공식 레퍼런스: {activeGuide.officialDocTitle}</span>
                </div>
                <a
                  href={activeGuide.officialDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded"
                >
                  <span>{activeGuide.officialDocUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
