# NetDoctor — Rule-Based Network Diagnostic & Operations Assistant

> **14주차 My Agentic App 프로젝트**  
> 규칙 기반 네트워크 장애 진단 엔진, OS별 네트워크 명령어 가이드, 장애 이력 관리·통계 대시보드 및 보고서 자동 생성을 통합 제공하는 웹 애플리케이션입니다.

---

## 1. 프로젝트 개요

**NetDoctor**는 네트워크 장애 발생 시 사용자가 증상을 단계적으로 입력하고 간단한 점검 결과를 반영하면, 결정론적(Deterministic) 진단 규칙 엔진을 통해 유력한 원인 후보와 판단 근거, 추가 점검 항목을 도출해 주는 웹 기반 네트워크 진단 도우미입니다.

진단 결과는 즉시 장애 이력(LocalStorage)으로 기록할 수 있으며, 대시보드에서 장애 유형별 통계·해결률·평균 처리 시간(MTTR)을 시각화하고, 표준 형식의 장애 보고서(Markdown / JSON)로 다운로드할 수 있습니다.

---

## 2. 핵심 기능

| 영역 | 주요 기능 | 담당 Agent |
| :--- | :--- | :--- |
| **네트워크 진단 엔진** | 장애 유형 분류, 동적 질문 분기, 사용자 점검 결과 처리, 규칙 기반 원인 후보 추론, 판단 근거 및 추가 점검 생성, 진단 규칙 단위 테스트 | **Agent A** |
| **UI 및 네트워크 가이드** | 공통 UI 컴포넌트 및 디자인 시스템 구현, OS별(Windows/macOS/Linux) 명령어 라이브러리, 명령어 검색·분류, 원클릭 복사, 실행 방법·결과 해석, 접근성(WCAG AA) 및 반응형 UI | **Agent B** |
| **장애 이력 및 데이터 분석** | 장애 이력 CRUD, LocalStorage 영속 저장 및 스키마 검증, 장애 유형별 통계, 해결률·평균 처리 시간(MTTR) 계산, 장애 보고서 생성 및 다운로드 | **Agent C** |
| **품질·보안·빌드 검증** | 진단 엔진 정확성 검증, 주요 시나리오 통합 테스트, 입력값 유효성 및 XSS 보안 검사, TypeScript/ESLint/Production Build 게이트 검증 | **QA Agent** |
| **아키텍처 및 통합** | 전체 시스템 아키텍처, 공통 TypeScript 타입·데이터 계약, 공통 레이아웃·디자인 토큰, 패키지 버전 관리, 최종 코드 통합 | **Orchestrator** |

---

## 3. 목표 기술 스택 및 개발 환경

- **Runtime & Package Manager**: Node.js `v24.x` (`v24.22.2` 확인), npm `11.x` (`11.19.1` 확인)
- **Frontend Framework**: React 19 + TypeScript (`strict: true`) + Vite 6
- **Styling**: Tailwind CSS + CSS Custom Properties (`src/styles/tokens.css`)
- **Routing**: React Router (`react-router-dom`)
- **Icons & Visualization**: `lucide-react` + 접근성 준수 순수 SVG 차트(외부 차트 라이브러리 의존성 최소화 및 Vitest 결정론적 테스트 보장)
- **Storage**: Browser `localStorage` (`netdoctor:incidents:v1`)
- **Testing & Quality**: Vitest, React Testing Library, `@testing-library/jest-dom`, `jsdom`, ESLint, `tsc --noEmit`

---

## 4. 목표 디렉터리 구조 및 파일 소유권

```text
NetDoctor/
├── docs/
│   ├── DIAGNOSTIC_RULES.md       # 진단 규칙, 질문 분기, 추론 점수 체계 명세
│   └── AGENT_PLAN.md             # Multi-Agent 개발 전략, 파일 소유권, 데이터 계약, 테스트 계획
├── src/
│   ├── main.tsx                  # [Orchestrator] 앱 진입점
│   ├── App.tsx                   # [Orchestrator] 라우팅 및 Feature 통합 연결
│   ├── types/                    # [Orchestrator] 공통 도메인 타입 및 Agent 간 데이터 계약
│   ├── styles/                   # [Orchestrator] 디자인 토큰 및 전역 스타일
│   ├── layouts/                  # [Orchestrator] 공통 App Shell 레이아웃(헤더/사이드바/내비게이션)
│   ├── engine/                   # [Agent A] 순수 TypeScript 규칙 기반 진단 엔진 및 단위 테스트
│   ├── features/
│   │   ├── diagnosis/            # [Agent A] 진단 마법사 UI 및 상태 흐름
│   │   ├── guide/                # [Agent B] 네트워크 명령어 라이브러리 및 가이드 UI
│   │   ├── dashboard/            # [Agent C] 통계 KPI 및 차트 대시보드 UI
│   │   ├── history/              # [Agent C] 장애 이력 CRUD 목록/상세/필터 UI
│   │   └── report/               # [Agent C] 장애 보고서 생성·미리보기·다운로드 UI
│   ├── components/               # [Agent B] 재사용 공통 UI 컴포넌트
│   ├── storage/                  # [Agent C] LocalStorage 어댑터, 스키마 검증, 통계·보고서 유틸
│   └── test/                     # [QA Agent] 정확성·통합·XSS 보안 테스트 스위트
├── DESIGN.md                     # 디자인 시스템, 토큰, 화면 명세 및 Stitch MCP 조회 기록
└── README.md                     # 프로젝트 개요 및 문서 인덱스
```

---

## 5. 문서 인덱스

- **[DESIGN.md](./DESIGN.md)**: Stitch MCP 조회 결과, 디자인 토큰, 5개 핵심 화면 와이어프레임 명세, 공통 컴포넌트 및 접근성/반응형 가이드
- **[docs/DIAGNOSTIC_RULES.md](./docs/DIAGNOSTIC_RULES.md)**: 6대 장애 유형, 4단계 진단 파이프라인, 15개 진단 규칙(`RULE-001`~`RULE-015`), 점수 계산 및 엣지 케이스 명세
- **[docs/AGENT_PLAN.md](./docs/AGENT_PLAN.md)**: Multi-Agent 역할 분담, 파일 소유권 매트릭스, TypeScript 데이터 계약, 충돌 방지 전략, 통합 순서 및 QA 테스트 계획

---

## 6. 현재 단계

현재 프로젝트는 **1단계: Multi-Agent 개발 전략 수립 및 핵심 문서 확정 단계**입니다.  
다음 구현 단계에서는 Orchestrator가 기반 스캐폴딩과 공통 계약을 확정한 뒤, Agent A / Agent B / Agent C가 병렬 구현을 수행하고 QA Agent가 최종 검증을 완료합니다.
