import { useState } from 'react';
import { AppLayout } from './layouts/AppLayout';
import type { NavRoute } from './types';

export default function App() {
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard');

  return (
    <AppLayout
      activeRoute={activeRoute}
      onNavigate={setActiveRoute}
      unresolvedCount={0}
    >
      <div className="rounded-2xl bg-[#111b2e] border border-slate-800 p-8 text-center">
        <h2 className="text-lg font-semibold text-white">NetDoctor 초기화 완료</h2>
        <p className="text-sm text-slate-400 mt-2">
          Multi-Agent 병렬 구현 모듈 통합 대기 중입니다.
        </p>
      </div>
    </AppLayout>
  );
}
