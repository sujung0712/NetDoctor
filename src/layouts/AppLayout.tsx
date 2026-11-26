import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  BookOpen,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Menu,
  PlusCircle,
  ShieldCheck,
  Stethoscope,
  X,
} from 'lucide-react';
import type { NavRoute } from '../types';

export interface AppLayoutProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  unresolvedCount: number;
  children: ReactNode;
}

interface NavItem {
  id: NavRoute;
  label: string;
  subtitle: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    subtitle: '장애 통계 및 현황 요약',
    icon: LayoutDashboard,
  },
  {
    id: 'diagnosis',
    label: '장애 진단',
    subtitle: '규칙 기반 단계별 원인 분석',
    icon: Stethoscope,
  },
  {
    id: 'guide',
    label: '명령어 가이드',
    subtitle: 'Windows 진단 명령어 5종',
    icon: BookOpen,
  },
  {
    id: 'history',
    label: '장애 이력',
    subtitle: '이력 조회·조치·상태 관리',
    icon: ClipboardList,
  },
  {
    id: 'report',
    label: '장애 보고서',
    subtitle: 'Markdown·텍스트 보고서 생성',
    icon: FileText,
  },
];

const PAGE_META: Record<NavRoute, { title: string; subtitle: string }> = {
  dashboard: {
    title: '네트워크 지원 대시보드',
    subtitle: '저장된 장애 이력 기반 실시간 집계 현황',
  },
  diagnosis: {
    title: '대화형 네트워크 장애 진단',
    subtitle: '답변에 따라 분기되는 규칙 기반 원인 추론 엔진',
  },
  guide: {
    title: 'Windows 네트워크 명령어 가이드',
    subtitle: 'Microsoft 공식 문서 기반 안전 점검 및 결과 해석',
  },
  history: {
    title: '장애 이력 관리',
    subtitle: '진단 결과 저장, 조치 기록 및 해결 상태 추적',
  },
  report: {
    title: '장애 보고서 생성',
    subtitle: '표준 기술지원 보고서 미리보기 및 클립보드 복사',
  },
};

export function AppLayout({
  activeRoute,
  onNavigate,
  unresolvedCount,
  children,
}: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentMeta = PAGE_META[activeRoute];

  const handleSelectRoute = (route: NavRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Fixed Sidebar */}
      <aside
        aria-label="주요 내비게이션"
        className="hidden lg:flex lg:flex-col lg:w-72 lg:fixed lg:inset-y-0 bg-[#070d1a] border-r border-slate-800/80 z-30"
      >
        <div className="px-6 py-5 border-b border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelectRoute('dashboard')}
            className="flex items-center gap-3 text-left group w-full"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-300/30">
              <Activity className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
                  NetDoctor
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  IT Ops
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Network Support Assistant
              </p>
            </div>
          </button>
        </div>

        <div className="px-4 pt-5 pb-3">
          <button
            type="button"
            onClick={() => handleSelectRoute('diagnosis')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            신규 진단 시작
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectRoute(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white border border-transparent'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-cyan-400' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">
                      {item.label}
                    </span>
                    {item.id === 'history' && unresolvedCount > 0 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {unresolvedCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80">
          <div className="rounded-xl bg-[#111b2e] border border-slate-800 p-3.5">
            <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              안전 진단 모드
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              네트워크 설정을 자동 변경하지 않으며, 모든 이력은 브라우저 로컬 저장소에만 보관됩니다.
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#070d1a]/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleSelectRoute('dashboard')}
          className="flex items-center gap-2.5"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
            <Activity className="w-4 h-4 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="text-base font-bold text-white">NetDoctor</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSelectRoute('diagnosis')}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            신규 진단
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={mobileMenuOpen}
            className="p-2 rounded-lg bg-slate-800/80 text-slate-200 hover:text-white border border-slate-700"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </header>

      {/* Mobile Slide-Over Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            aria-label="모바일 내비게이션"
            className="relative w-72 max-w-[85vw] bg-[#070d1a] border-r border-slate-800 p-4 flex flex-col h-full z-50"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="text-base font-bold text-white">NetDoctor 메뉴</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="메뉴 닫기"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-1.5 flex-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectRoute(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left ${
                      isActive
                        ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        <div className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-slate-800/80 bg-[#0b1220]/90 backdrop-blur sticky top-0 z-20">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {currentMeta.title}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {currentMeta.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/90 text-slate-300 border border-slate-700/80">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              규칙 기반 읽기 전용 지원
            </span>
          </div>
        </div>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
