import { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Stethoscope,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertBanner, Badge, Button, Card, EmptyState } from '../../components';
import { calculateDashboardStats, formatReportTimestamp } from '../../storage';
import {
  FAULT_TYPE_LABELS,
  INCIDENT_STATUS_LABELS,
  SEVERITY_LABELS,
  type ComponentTone,
  type DashboardPageProps,
  type IncidentStatus,
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

export function DashboardPage({
  incidents,
  onStartDiagnosis,
  onOpenHistory,
  onOpenReport,
  onLoadSampleData,
  onClearSampleData,
}: DashboardPageProps) {
  const stats = useMemo(() => calculateDashboardStats(incidents), [incidents]);

  const kpiCards = [
    {
      label: '전체 장애 건수',
      value: `${stats.totalCount}건`,
      helper:
        stats.sampleCount > 0
          ? `시연용 샘플 ${stats.sampleCount}건 포함`
          : '저장된 전체 장애 이력 기준',
      icon: Activity,
      accentClass: 'text-cyanbrand-400 bg-cyanbrand-500/15 border-cyanbrand-500/30',
    },
    {
      label: '해결 건수',
      value: `${stats.resolvedCount}건`,
      helper: '해결 완료 상태로 기록된 이력',
      icon: CheckCircle2,
      accentClass: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    },
    {
      label: '미해결 건수',
      value: `${stats.unresolvedCount}건`,
      helper: '미해결 및 진행 중 합계',
      icon: AlertTriangle,
      accentClass: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
    },
    {
      label: '해결률',
      value: `${stats.resolutionRate}%`,
      helper:
        stats.totalCount > 0
          ? `${stats.resolvedCount} / ${stats.totalCount}건 해결`
          : '기록된 이력 없음',
      icon: TrendingUp,
      accentClass: 'text-cyanbrand-300 bg-cyanbrand-400/15 border-cyanbrand-400/30',
    },
    {
      label: '평균 처리 시간',
      value:
        stats.averageResolutionMinutes !== null
          ? `${stats.averageResolutionMinutes}분`
          : '데이터 없음',
      helper:
        stats.averageResolutionMinutes !== null
          ? '해결 완료 이력 기준 평균'
          : '유효한 해결 이력 필요',
      icon: Clock,
      accentClass: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-navy-700/80 bg-navy-850/90 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">
              운영 대시보드
            </h1>
            <Badge tone="cyan">LocalStorage 집계</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            브라우저에 저장된 장애 이력을 기반으로 집계된 현황입니다. 외부 네트워크를 임의로
            측정하거나 추정 수치를 생성하지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            onClick={onOpenHistory}
            leftIcon={<FileText className="h-4 w-4" />}
          >
            장애 이력 관리
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onStartDiagnosis}
            leftIcon={<Stethoscope className="h-4 w-4" />}
          >
            신규 진단 시작
          </Button>
        </div>
      </div>

      {/* Sample Data Banner */}
      {stats.sampleCount > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <AlertBanner
            tone="warning"
            title={`시연용 샘플 데이터 ${stats.sampleCount}건이 포함되어 있습니다.`}
            description="제목에 [샘플] 표시가 있는 항목은 기능 시연용 예시 데이터이며 실제 장애 이력과 구분됩니다. 원할 때 일괄 삭제할 수 있습니다."
            className="border-0 bg-transparent p-0"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={onClearSampleData}
            leftIcon={<Trash2 className="h-4 w-4" />}
            className="shrink-0"
          >
            샘플 데이터 삭제
          </Button>
        </div>
      )}

      {stats.totalCount === 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-cyanbrand-500/30 bg-cyanbrand-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <AlertBanner
            tone="cyan"
            title="아직 저장된 장애 이력이 없습니다."
            description="신규 장애 진단을 진행해 첫 이력을 기록하거나, 대시보드·보고서 시연을 위해 [샘플] 예시 데이터를 불러올 수 있습니다."
            className="border-0 bg-transparent p-0"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={onLoadSampleData}
            leftIcon={<Database className="h-4 w-4" />}
            className="shrink-0"
          >
            샘플 데이터 불러오기
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <section aria-label="핵심 장애 지표">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className="rounded-xl border border-navy-700/80 bg-navy-850 p-4 shadow-card transition-colors hover:border-cyanbrand-500/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    {kpi.label}
                  </span>
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${kpi.accentClass}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight text-slate-100">
                  {kpi.value}
                </p>
                <p className="mt-1 text-xs text-slate-400">{kpi.helper}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Main Content Grid: Chart + Recent Incidents */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Fault Type Distribution Chart */}
        <Card
          title="장애 유형별 분포"
          subtitle="5개 핵심 장애 유형별 전체 발생 건수 및 해결 건수"
          className="lg:col-span-7"
          headerAction={
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <BarChart3 className="h-4 w-4 text-cyanbrand-400" aria-hidden="true" />
              실제 기록 기준
            </span>
          }
        >
          {stats.totalCount === 0 ? (
            <EmptyState
              title="표시할 통계 데이터가 없습니다"
              description="장애 진단을 완료해 이력을 저장하거나 시연용 샘플 데이터를 불러오면 유형별 분포 차트가 표시됩니다."
              icon={<BarChart3 className="h-8 w-8 text-cyanbrand-400" />}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="primary" size="sm" onClick={onStartDiagnosis}>
                    신규 진단 시작
                  </Button>
                  <Button variant="secondary" size="sm" onClick={onLoadSampleData}>
                    샘플 데이터 불러오기
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="h-80 w-full pt-2" aria-label="장애 유형별 분포 막대 차트">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.byFaultType}
                  margin={{ top: 12, right: 16, left: -12, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.14)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#cbd5e1', fontSize: 12 }}
                    axisLine={{ stroke: '#1e2d4a' }}
                    tickLine={{ stroke: '#1e2d4a' }}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={52}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    axisLine={{ stroke: '#1e2d4a' }}
                    tickLine={{ stroke: '#1e2d4a' }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(34, 211, 238, 0.08)' }}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e2d4a',
                      borderRadius: '0.75rem',
                      color: '#f1f5f9',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#22d3ee', fontWeight: 600, marginBottom: '4px' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', color: '#cbd5e1', paddingTop: '6px' }}
                  />
                  <Bar
                    dataKey="count"
                    name="전체 건수"
                    fill="#06b6d4"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="resolvedCount"
                    name="해결 건수"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Recent Incidents */}
        <Card
          title="최근 장애 이력"
          subtitle="발생 시각 기준 최신 5건 (클릭 시 보고서 열기)"
          className="lg:col-span-5"
          headerAction={
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenHistory}
              className="text-cyanbrand-400 hover:text-cyanbrand-300"
            >
              전체 보기
              <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          }
        >
          {stats.recentIncidents.length === 0 ? (
            <EmptyState
              title="최근 장애 이력이 없습니다"
              description="장애 진단을 실행하거나 장애 이력 페이지에서 수동으로 이력을 등록해 보세요."
              icon={<FileText className="h-8 w-8 text-slate-400" />}
              action={
                <Button variant="primary" size="sm" onClick={onStartDiagnosis}>
                  신규 진단 시작
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {stats.recentIncidents.map((incident) => (
                <li key={incident.id}>
                  <button
                    type="button"
                    onClick={() => onOpenReport(incident.id)}
                    className="group w-full rounded-lg border border-navy-700/80 bg-navy-900/70 p-3.5 text-left transition-all hover:border-cyanbrand-500/50 hover:bg-navy-800/80"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {incident.isSample && <Badge tone="warning">[샘플]</Badge>}
                      <Badge tone="cyan">{FAULT_TYPE_LABELS[incident.faultType]}</Badge>
                      <Badge tone={getStatusTone(incident.status)}>
                        {INCIDENT_STATUS_LABELS[incident.status]}
                      </Badge>
                      <Badge tone={getSeverityTone(incident.severity)}>
                        {SEVERITY_LABELS[incident.severity]}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm font-semibold text-slate-100 group-hover:text-cyanbrand-300">
                      {incident.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>발생: {formatReportTimestamp(incident.occurredAt)}</span>
                      <span className="inline-flex items-center gap-1 text-cyanbrand-400">
                        보고서
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
