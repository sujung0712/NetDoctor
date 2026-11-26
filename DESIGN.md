# NetDoctor — Design System & UI Specification

본 문서는 **NetDoctor**의 디자인 토큰, 공통 레이아웃, 핵심 화면 구성, 재사용 컴포넌트 및 접근성/반응형 요구사항을 정의합니다.

---

## 1. Stitch MCP 조회 결과 (사실 기록)

- **조회 일시**: 2026-11-26
- **호출 도구**: Stitch MCP `list_projects` (`view=owned`, `view=shared`)
- **조회 결과**:
  - `view=owned` 조회 프로젝트 (2건):
    1. `Travel-Planner-MVP` (`projects/15535182799094676996`, MOBILE)
    2. `대학생 학습관리 웹앱` (`projects/6562865603819829757`, MOBILE)
  - `view=shared` 조회 프로젝트: 0건 (`{}`)
  - **`NetDoctor` 프로젝트 존재 여부**: **미존재 (0건)**
- **대응 방침**:
  1. Stitch 계정에 `NetDoctor` 디자인 프로젝트가 아직 생성되어 있지 않으므로, 본 `DESIGN.md`를 **단일 디자인 기준 문서(SSOT)**로 확정합니다.
  2. 구현 단계 진입 전 사용자가 원할 경우 Stitch MCP(`create_project`, `upload_design_md`, `generate_screen_from_text`)를 통해 NetDoctor 화면을 생성·연동할 수 있도록 본 문서를 Stitch 호환 구조로 작성했습니다.
  3. Stitch 프로젝트가 추후 생성되면 `list_screens` / `get_screen`으로 화면 ID와 HTML/스크린샷을 동기화하고 Agent B가 스타일을 미세 조정합니다.

---

## 2. 디자인 콘셉트 (Design Direction)

- **컨셉**: **Enterprise IT Support SaaS — Dark Navy & Cyan NOC Workspace**
- **핵심 팔레트**:
  - Canvas / Background: `#0B1220` (Deep Dark Navy), Sidebar `#070D1A`, Card Surface `#111B2E`, Elevated `#162238`
  - Brand Accent: Cyan `#06B6D4` / `#22D3EE` (고대비 포커스·활성 상태·CTA 강조)
  - Typography: `#F1F5F9` (Primary), `#CBD5E1` (Secondary), `#94A3B8` (Muted)
  - Semantic: Success `#10B981`, Warning `#F59E0B`, Danger `#F43F5E`
- **원칙**:
  - 장애 대응 상황에서도 인지 부하를 줄이는 **전문 IT 기술지원 SaaS 다크 네이비 + 시안** 테마
  - 데스크톱 고정 좌측 사이드바(`288px`) + 모바일 상단 바 및 슬라이드오버 드로어 내비게이션
  - 임시 와이어프레임 수준을 배제하고, 정돈된 카드 계층, 명확한 상태 배지, 가독성 높은 타이포그래피와 일관된 `lucide-react` 아이콘 적용
  - 실제 측정하지 않은 네트워크 수치(가짜 ping/대역폭/상태 텔레메트리 등)를 화면에 표시하지 않음

---

## 3. 디자인 토큰 (`src/styles/tokens.css` — Orchestrator 소유)

### 3.1 컬러 팔레트

| Token | Hex | 용도 |
| :--- | :--- | :--- |
| `--nd-color-primary` | `#0F4C81` | 핵심 브랜드, 주요 CTA 버튼, 활성 내비게이션 |
| `--nd-color-primary-hover` | `#0B3B64` | Primary 호버 상태 |
| `--nd-color-primary-soft` | `#E8F1FA` | 선택된 옵션 배경, 활성 탭 배지 |
| `--nd-color-accent` | `#0284C7` | 링크, 진행률 바, 정보성 강조 |
| `--nd-color-bg` | `#F8FAFC` | 전체 페이지 캔버스 배경 |
| `--nd-color-surface` | `#FFFFFF` | 카드, 모달, 테이블 표면 |
| `--nd-color-surface-subtle` | `#F1F5F9` | 보조 패널, 입력 필드 비활성 배경 |
| `--nd-color-border` | `#CBD5E1` | 기본 구분선 및 입력 테두리 |
| `--nd-color-border-subtle` | `#E2E8F0` | 카드 내부 약한 구분선 |
| `--nd-color-text-primary` | `#0F172A` | 본문 제목 및 주요 텍스트 (대비비 > 15:1) |
| `--nd-color-text-secondary` | `#475569` | 보조 설명, 메타 정보 (대비비 > 7:1) |
| `--nd-color-text-muted` | `#64748B` | 캡션, 플레이스홀더 (대비비 > 4.5:1) |
| `--nd-color-success` | `#059669` | 해결됨(Resolved), 정상 점검 결과 |
| `--nd-color-success-soft` | `#ECFDF5` | 정상 상태 배지 배경 |
| `--nd-color-warning` | `#D97706` | 진행 중(In Progress), 주의/지연 경고 |
| `--nd-color-warning-soft` | `#FFFBEB` | 주의 상태 배지 배경 |
| `--nd-color-danger` | `#DC2626` | 심각(Critical), 점검 실패, 삭제 경고 |
| `--nd-color-danger-soft` | `#FEF2F2` | 오류 상태 배지 배경 |
| `--nd-color-terminal-bg` | `#0F172A` | 네트워크 명령어 및 출력 예시 블록 배경 |
| `--nd-color-terminal-text` | `#E2E8F0` | 터미널 기본 출력 텍스트 |
| `--nd-color-terminal-accent` | `#38BDF8` | 터미널 명령어 하이라이트 |

### 3.2 타이포그래피

- **UI Sans**: `'Pretendard', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Monospace (명령어/IP/포트/로그)**: `'JetBrains Mono', 'Fira Code', 'Consolas', monospace`

| Role | Size | Weight | Line Height |
| :--- | :--- | :--- | :--- |
| `display` | `28px` (`1.75rem`) | `700` | `1.25` |
| `h1` | `22px` (`1.375rem`) | `700` | `1.3` |
| `h2` | `18px` (`1.125rem`) | `600` | `1.35` |
| `h3` | `15px` (`0.9375rem`) | `600` | `1.4` |
| `body` | `14px` (`0.875rem`) | `400` | `1.6` |
| `caption` | `12px` (`0.75rem`) | `500` | `1.4` |
| `code` | `13px` (`0.8125rem`) | `500` | `1.55` |

### 3.3 간격, 라운드, 브레이크포인트

- **Spacing Scale**: `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`
- **Border Radius**: `sm: 6px`, `md: 10px`, `lg: 14px`, `full: 9999px`
- **Breakpoints**:
  - Mobile: `< 640px` (단일 컬럼, 상단 헤더 + 하단/드로어 내비게이션)
  - Tablet: `640px ~ 1023px` (2컬럼 그리드, 축약형 사이드바 또는 상단 탭)
  - Desktop: `>= 1024px` (좌측 고정 사이드바 `240px` + 메인 콘텐츠 최대 폭 `1200px`)

---

## 4. 화면 설계 명세 (Screen Inventory)

| Screen ID | 경로 | 화면명 | 소유 Agent | 핵심 구성 요소 |
| :--- | :--- | :--- | :--- | :--- |
| `SCR-00` | 공통 셸 | **App Layout Shell** | Orchestrator | 좌측 사이드바(Desktop) / 모바일 내비게이션, 브랜드 헤더, 현재 경로 표시, 빠른 진단 시작 버튼 |
| `SCR-01` | `/dashboard` (기본) | **운영 대시보드** | Agent C | 4개 KPI 카드(전체 장애, 미해결 건수, 해결률, 평균 처리 시간 MTTR), 장애 유형별 분포 막대/도넛 SVG 차트, 최근 장애 목록, 빠른 진단 시작 CTA |
| `SCR-02` | `/diagnosis` | **대화형 네트워크 진단** | Agent A | 진행률 스테퍼(증상 선택 -> 동적 질문 -> 명령어 점검 -> 결과 분석), 질문 옵션 카드, 점검 결과 입력 폼(성공/실패/지연/모름), 원인 후보 신뢰도 바, 판단 근거 체인, 추가 점검 체크리스트, **"장애 이력으로 저장"** 버튼 |
| `SCR-03` | `/guide` | **네트워크 명령어 가이드** | Agent B | 실시간 키워드 검색창, 카테고리 필터 탭(연결성/DNS/라우팅/포트·방화벽/IP·DHCP/Wi-Fi), OS 전환기(`Windows`/`macOS`/`Linux`), 명령어 카드(터미널 코드 블록 + 원클릭 복사 + 실행 방법 + 정상/비정상 출력 해석) |
| `SCR-04` | `/history` | **장애 이력 관리** | Agent C | 상태·유형·심각도·검색어 복합 필터, 장애 이력 테이블/모바일 카드 뷰, 신규 등록/수정 모달, 상태 변경(`open` -> `in_progress` -> `resolved`), 처리 시간 자동 계산, 삭제 확인 모달 |
| `SCR-05` | `/report` | **장애 보고서 생성기** | Agent C | 대상 장애 선택 드롭다운, 구조화된 보고서 미리보기(장애 개요, 증상 및 점검 내역, 원인 후보, 조치 내용, MTTR), Markdown(`.md`) 다운로드, JSON(`.json`) 내보내기, 인쇄용 보기 |

---

## 5. 공통 UI 컴포넌트 규격 (`src/components/` — Agent B 소유)

Orchestrator가 `src/types/contracts.ts`에 Props 인터페이스를 먼저 고정하고, Agent B가 구현합니다.

1. **`Button`**: `variant` (`primary` | `secondary` | `ghost` | `danger`), `size` (`sm` | `md` | `lg`), `loading`, `disabled`
2. **`Badge`**: `tone` (`neutral` | `info` | `success` | `warning` | `danger`), 상태 아이콘 슬롯 지원
3. **`Card`**: `title`, `subtitle`, `headerAction`, `padding`, `elevated`
4. **`Modal`**: 포커스 트랩, `Escape` 닫기, 백드롭 클릭 닫기, `role="dialog"`, `aria-modal="true"`
5. **`SearchInput`**: 디바운스 또는 즉시 입력 지원, 초기화(Clear) 버튼, 검색 아이콘, `aria-label`
6. **`CopyCodeBlock`**: 터미널 스타일 코드 표시 + 클립보드 복사 버튼 + `aria-live="polite"` 복사 완료 알림
7. **`Tabs`**: 키보드 화살표 탐색 지원(`role="tablist"`, `role="tab"`, `aria-selected`)
8. **`ProgressBar`**: `value` (`0~100`), `label`, `tone`, `role="progressbar"`
9. **`AlertBanner`**: `tone`, `title`, `description`, 닫기 옵션
10. **`EmptyState`**: 빈 목록/검색 결과 없음 안내 + 액션 버튼

---

## 6. 접근성(A11y) 및 보안 UI 원칙

- **WCAG 2.1 AA 준수**: 일반 텍스트 대비비 4.5:1 이상, 대형 텍스트/UI 컨트롤 3:1 이상.
- **키보드 완결성**: 모든 인터랙티브 요소(질문 카드, 탭, 복사 버튼, 모달, 필터)는 마우스 없이 키보드만으로 조작 가능.
- **스크린 리더 대응**: 단계 전환, 복사 성공, 저장 완료 알림에 `aria-live="polite"` 적용.
- **XSS 방지 UI 원칙**: 사용자 입력(증상 메모, 장애 제목, 해결 조치, 검색어)을 렌더링할 때 `dangerouslySetInnerHTML` 사용을 전면 금지하고 React 텍스트 노드로만 안전하게 이스케이프 렌더링합니다.
