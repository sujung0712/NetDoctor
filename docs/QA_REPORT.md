# NetDoctor QA 검증 보고서 (QA Report)

- **작성 일시**: 2026-11-26
- **대상 프로젝트**: NetDoctor (`netdoctor@0.1.0`, Base Version)
- **검증 담당**: QA Agent
- **최종 판정**: **PASS (자동화 단위·통합·보안 테스트 47/47 통과, Lint·TypeScript·프로덕션 빌드 0 오류)**

---

## 1. 실행 및 검증 환경 정보

| 항목 | 버전 / 설정 |
| :--- | :--- |
| OS | Windows |
| Node.js | `v24.22.2` (`package.json` engines: `>=20.0.0 <25.0.0`) |
| npm | `11.19.1` (`package-lock.json` 생성 및 존재 확인 완료) |
| React / ReactDOM | `18.3.1` |
| Vite | `5.4.11` |
| TypeScript | `5.6.3` |
| Tailwind CSS | `3.4.17` |
| Recharts | `2.15.0` |
| Vitest | `2.1.8` (`jsdom` `25.0.1`) |
| Testing Library | `@testing-library/react` `16.1.0`, `@testing-library/user-event` `14.5.2`, `@testing-library/jest-dom` `6.6.3` |
| ESLint | `9.17.0` (`typescript-eslint` `8.18.1`) |

---

## 2. 명령어별 실제 실행 결과

### 2.1 의존성 설치 확인 (`npm install`)
- 사전 실행으로 `package-lock.json` 정상 생성 및 존재(`Test-Path package-lock.json` → `True`) 확인 완료.

### 2.2 테스트 실행 (`npm run test` → `vitest run`)
- **종료 코드**: `0` (PASS)
- **요약**: **테스트 파일 4/4 통과 (4 passed), 테스트 케이스 47/47 통과 (47 passed)**
- **총 소요 시간**: `12.25s` (transform `688ms`, setup `1.63s`, collect `4.35s`, tests `10.68s`, environment `4.41s`, prepare `707ms`)

| 테스트 파일 | 케이스 수 | 결과 | 소요 시간 | 주요 검증 범위 |
| :--- | :---: | :---: | :---: | :--- |
| `src/engine/engine.test.ts` | 17 | PASS | 33ms | 규칙 기반 엔진 코어 로직 및 경계 케이스 |
| `src/test/diagnosis-accuracy.test.ts` | 17 | PASS | 50ms | 5대 장애 유형 정확도, 동적 분기(`yes`/`no`), `unknown` 근거 부족 처리, 6대 결과 섹션, 안전성 불변 조건 |
| `src/test/security-xss.test.tsx` | 8 | PASS | 3,180ms | 공백 입력 차단, `INPUT_LIMITS` 길이 제한, XSS 이스케이프, LocalStorage 손상·프로토타입 오염 복구, 민감정보 차단, 정적 코드 스캔 |
| `src/test/integration.test.tsx` | 5 | PASS | 7,413ms | Flow A(진단→저장→리로드→KPI), Flow B(명령어 5종·검색·필터·복사·MS 공식 링크), Flow C(이력 CRUD·해결 시간), Flow D(샘플 `[샘플]` 로드/삭제), Flow E(보고서 6대 항목·Markdown/텍스트·복사·범위 가드) |
| **합계** | **47** | **ALL PASS** | **12.25s** | — |

> **참고 (jsdom Recharts 경고)**: jsdom은 실제 레이아웃 뷰포트 크기를 계산하지 않아 Recharts `ResponsiveContainer`가 `width(0) / height(0)` stderr 경고를 출력하나, `src/test/setup.ts`의 `ResizeObserver` 폴리필로 런타임 예외 없이 정상 렌더링됩니다.

### 2.3 정적 린트 검사 (`npm run lint` → `eslint .`)
- **종료 코드**: `0` (PASS)
- **오류 / 경고**: **0 errors, 0 warnings**

### 2.4 TypeScript 타입 검사 (`npx tsc --noEmit -p tsconfig.app.json`)
- **종료 코드**: `0` (PASS)
- **타입 오류**: **0 errors**

### 2.5 프로덕션 빌드 (`npm run build` → `tsc -b && vite build`)
- **종료 코드**: `0` (PASS)
- **변환 모듈 수**: `2210 modules transformed`
- **빌드 소요 시간**: `6.95s`
- **산출물 크기**:
  - `dist/index.html`: `0.53 kB` (gzip: `0.42 kB`)
  - `dist/assets/index-BHcZkOO8.css`: `33.69 kB` (gzip: `6.56 kB`)
  - `dist/assets/index-Cv2QvWWm.js`: `707.11 kB` (gzip: `213.73 kB`)
- **비고**: Recharts 포함 단일 청크 크기가 500 kB를 초과한다는 Vite 일반 안내 메시지가 출력되었으나 빌드 오류는 없으며 정상 산출되었습니다.

---

## 3. QA 중 발견 및 수정 완료된 결함 이력

### [DEFECT-001] `Modal` 입력 중 포커스 탈취 및 스페이스바 입력 시 모달 강제 닫힘 (P0 / Critical)
- **발견 파일 및 위치**: `src/components/Modal.tsx` (L21–L72)
- **증상 및 재현 절차**:
  1. `장애 이력` 페이지에서 `수동 장애 등록` 또는 `수정` 모달을 연다.
  2. `장애 제목` 등 제어 입력 필드에 공백이 포함된 텍스트(예: `"회의실 유선 LAN 단절 점검"`)를 입력한다.
  3. 첫 글자 입력 직후 `HistoryPage`가 리렌더링되며 새 `closeFormModal` 참조가 `Modal`의 `onClose` prop으로 전달된다.
  4. `Modal`의 `useEffect([isOpen, onClose])`가 매 글자 입력마다 재실행되어 `closeButtonRef.current?.focus()`를 호출, 입력 포커스를 `X(닫기)` 버튼으로 강제 이동시킨다.
  5. 이어서 스페이스바(`' '`)를 입력하면 포커스된 `닫기` 버튼이 클릭되어 모달이 입력 도중 강제 종료된다.
- **조치 내역**: UI 담당(Agent B)이 `src/components/Modal.tsx`에서 `onCloseRef`를 사용하고 포커스·스크롤 잠금·키보드 이벤트 `useEffect` 의존성 배열을 `[isOpen]`으로 축소 수정함.
- **재검증 결과**: 수정 후 `npm run test` 재실행 시 기존 실패했던 3개 모달 테스트(Flow C CRUD, 공백 제목 차단, 민감 인증정보 차단) 모두 **PASS** 확인 (총 47/47 통과).

---

## 4. 진단 정확성·기능·보안 검증 체크리스트

### 4.1 진단 엔진 정확성 및 분기 검증 (`src/test/diagnosis-accuracy.test.ts`)
- [x] **5대 핵심 장애 유형 전체 검증**: `NO_INTERNET`, `VPN_FAILURE`, `DNS_ERROR`, `SLOW_NETWORK`, `INTERMITTENT_DROP` 전 유형 정상 수렴 및 규칙 정확도 확인
- [x] **동적 분기 증명**: 모든 5개 장애 유형에서 `yes` vs `no` 응답에 따라 서로 다른 후속 질문으로 분기됨을 검증
- [x] **응답 선택지 일관성**: 전체 진단 질문(20문항 이상) 모두 `yes` / `no` / `unknown` 3가지 응답 지원 확인
- [x] **동적 결과 반영 & 6대 필수 섹션**: 고정 템플릿이 아닌 실제 사용자 응답·증상 메모·확인 메모가 반영되며 `candidates`, `evidence`, `inputSummary`, `recommendedCheckOrder`, `safeResolutions`, `additionalChecksNeeded` 6개 섹션 모두 생성 확인
- [x] **근거 부족(Insufficient Evidence) 방어**: 전체 `unknown` 또는 50% 이상 `unknown` 응답, 0건 응답 시 `isConclusive === false` 반환 및 `"단일 원인을 확정하기 어렵습니다"` 명시 확인
- [x] **안전성 불변 조건**: 방화벽/Windows Defender/백신 비활성화 안내 0건, 네트워크 설정 자동 변경 주장 0건, 임의 측정 속도/지연 수치(`Mbps` 등) 생성 0건, 명령어 가이드 내 읽기 전용 플래그 준수 확인

### 4.2 E2E 통합 사용자 시나리오 검증 (`src/test/integration.test.tsx`)
- [x] **Flow A (진단 → 저장 → 영속성 → KPI)**: 대시보드(`0건`) → `DNS_ERROR` 동적 Q&A → 결과 6대 섹션 확인 → LocalStorage 저장 → 언마운트/리마운트 후 데이터 유지 및 대시보드 KPI(`1건`, 미해결 `1건`, 해결률 `0%`, 평균 처리 시간 `데이터 없음`) 엄격 집계 확인
- [x] **Flow B (Windows 명령어 가이드)**: `ipconfig /all`, `ping`, `nslookup`, `tracert`, `Test-NetConnection` 5종 표시, 검색(`169.254`)·카테고리(`DNS 이름 해석`) 필터링·초기화, 클립보드 복사 및 `"복사됨"` 피드백, 5종 모두 Microsoft Learn 공식 문서 링크(`target="_blank"`, `rel="noopener noreferrer"`) 확인
- [x] **Flow C (장애 이력 CRUD)**: 수동 등록 → 조치 내역 수정 및 30분 후 `resolved` 전환 → `"해결됨"` 상태 및 `"소요 시간: 30분"` 검증 → 영구 삭제 및 리마운트 후 삭제 유지 확인
- [x] **Flow D (샘플 데이터 관리)**: 샘플 데이터 불러오기 → `[샘플]` 배지 및 안내 배너 명시 확인 → KPI 4건(해결 2건, 미해결 2건, 해결률 50%) 반영 확인 → 샘플 데이터 일괄 삭제 확인
- [x] **Flow E (장애 보고서 생성)**: 6대 필수 항목(1. 장애 유형, 2. 사용자 점검 결과, 3. 가능한 원인 후보, 4. 판단 근거, 5. 조치 내역, 6. 해결 상태) Markdown 및 일반 텍스트 포맷 생성, 클립보드 복사 피드백 확인

### 4.3 보안·입력 검증·XSS 방어 검증 (`src/test/security-xss.test.tsx`)
- [x] **빈 값 및 공백 전용 입력 차단**: 스토리지 계층(`createIncidentRecord`, `updateIncidentRecord`)과 UI 폼(`HistoryPage` 모달, `DiagnosisPage` 증상 메모) 모두 공백 입력 차단
- [x] **최대 길이 제한(`INPUT_LIMITS`)**: `TITLE_MAX(120)`, `SYMPTOM_MAX(500)`, `ACTION_NOTES_MAX(2000)`, `SEARCH_MAX(100)`, `ANSWER_NOTE_MAX(200)` 절삭 및 UI `maxLength` 속성 검증
- [x] **XSS 페이로드 무력화**: `<script>alert('xss')</script>`, `<img src=x onerror=alert(1)>`, `javascript:alert(1)` 입력 시 대시보드·이력·보고서 DOM 내 `<script>` 태그 0개, `[onerror]` 속성 0개, `javascript:` 링크 0개 확인 및 보고서 출력 이스케이프(`&lt;script&gt;`, `javascript_blocked:`) 확인
- [x] **손상된 LocalStorage 복구 및 프로토타입 오염 차단**: `"{broken"`, `"null"`, 잘못된 배열/객체, `__proto__` / `constructor` 키 포함 JSON 로드 시 크래시 없이 복구되며 `Object.prototype` 오염 없음 확인
- [x] **민감 인증정보 저장 차단**: `password=12345`, `비밀번호: test`, `Bearer abc.def.ghi`, `api_key=...`, 개인키 헤더 패턴을 스토리지 및 UI 폼 양쪽에서 차단 확인
- [x] **프로덕션 정적 코드 스캔**: `src/` 전체(`src/test/` 제외) 스캔 결과 `dangerouslySetInnerHTML`, `eval(`, `new Function`, `.innerHTML` 실행 코드 출현 **0건** 확인

---

## 5. Git 베이스 버전 범위 준수 점검 (Scope Check)

베이스 버전은 핵심 기능에 집중하고 확장 기능은 별도 feature 브랜치로 분리한다는 정책을 코드 및 통합 테스트(Flow E)로 검증하였습니다.

- **장애 보고서 파일 다운로드 (`feature/report-download`)**: 베이스 버전에 파일 다운로드 버튼(`다운로드`/`내보내기`/`<a download>`)이 조기 구현되지 않았으며, 보고서 미리보기 및 클립보드 복사 기능만 제공됨을 확인.
- **고급 진단 결과 비교 (`feature/diagnosis-comparison`)**: 베이스 버전에 진단 결과 비교 UI/컨트롤이 조기 구현되지 않았으며, 보고서 페이지 상단 로드맵 배너를 통해 향후 확장 브랜치 예정 사항으로만 안내됨을 확인.

---

## 6. 미검증 항목 (Unverified Items)

정직하고 투명한 품질 보고를 위해 본 자동화 QA 범위에서 직접 실행·검증하지 못한 항목을 아래와 같이 명시합니다.

1. **실제 브라우저 시각적·레이아웃 E2E 검증**: Chromium/Edge/Firefox 등 실제 브라우저 엔진에서의 픽셀 단위 반응형 레이아웃(모바일·태블릿·데스크톱), Recharts 차트 실제 SVG 크기 렌더링, 툴팁 호버 상호작용 및 키보드 포커스 시각적 대비는 jsdom 기반 자동화 테스트로 대체되었으며 실제 브라우저 E2E(Browser QA Agent)는 수행하지 않았습니다.
2. **실제 Windows OS 네트워크 환경 CLI 실행 검증**: 명령어 가이드의 `ipconfig /all`, `ping`, `nslookup`, `tracert`, `Test-NetConnection` 예시는 Microsoft Learn 공식 문서 기준 읽기 전용 구문과 샘플 출력으로 검증되었으며, 다양한 실제 사내망/VPN/방화벽 환경의 Windows 터미널에서 직접 실행해 출력 파싱을 교차 검증하지는 않았습니다.
3. **업데이트된 CI 워크플로(`@v7`) 재실행 확인**: PR #1(`98e91ea`)의 원격 GitHub Actions에서 **Node.js 20 및 Node.js 24 매트릭스 테스트 모두 성공(PASS)**을 실제 확인했으나, `actions/checkout@v7`·`actions/setup-node@v7` 업그레이드 이후 Node.js 20 deprecation 경고 소멸 여부는 다음 GitHub Push 이후 원격 CI 재실행에서 최종 확인할 예정입니다.
4. **향후 확장 기능 브랜치 (`feature/report-download`, `feature/diagnosis-comparison`)**: 베이스 버전 범위 밖의 예정 기능이므로 해당 기능의 구현 및 동작 검증은 각 feature 브랜치 개발 단계에서 별도로 수행해야 합니다.

---

## 7. Stitch 보완(`7c5b245`) 이후 최종 회귀 테스트 및 CI 사전 검증 (GitHub 업로드 전)

- **실행 일시**: 2026-11-26
- **기준 브랜치 / 커밋**: `develop` (`7c5b245` 이후 `.gitignore`, `.github/workflows/ci.yml`, `README.md` 반영 상태)
- **실행 환경**: Windows, Node.js `v24.22.2`, npm `11.19.1`

### 7.1 클린 설치 및 회귀 테스트 실제 실행 결과

| 검증 명령어 | 결과 | 실제 출력 요약 |
| :--- | :---: | :--- |
| `npm ci` | **PASS** | `added 376 packages, and audited 377 packages in 10s` (종료 코드 `0`; 로컬 `vite.js` 잠금 해제 후 재실행 통과) |
| `npm run test` | **PASS** | **4개 테스트 파일 / 47/47 테스트 통과** (`11.48s`: `engine.test.ts` 17, `diagnosis-accuracy.test.ts` 17, `security-xss.test.tsx` 8, `integration.test.tsx` 5) |
| `npm run lint` | **PASS** | 오류 `0건`, 경고 `0건` (종료 코드 `0`) |
| `npx tsc --noEmit -p tsconfig.app.json` | **PASS** | 타입 오류 `0건` (종료 코드 `0`) |
| `npm run build` | **PASS** | `tsc -b && vite build` 성공 (`2210 modules transformed`, `6.25s`, `dist/index.html` 0.53 kB, CSS 34.05 kB, JS 707.20 kB / gzip 213.76 kB) |

### 7.2 보안 검사 결과 (현재 파일 + 전체 Git 커밋 7건 이력 스캔)

| 점검 항목 | 검사 대상 | 결과 | 상세 확인 내용 |
| :--- | :--- | :---: | :--- |
| **Google API Key (`AIza...`)** | 워크스페이스 전체 + Git 7커밋 | **이상 없음 (0건)** | 탐지 없음 |
| **GitHub PAT (`ghp_`, `github_pat_` 등)** | 워크스페이스 전체 + Git 7커밋 | **이상 없음 (0건)** | 탐지 없음 |
| **MCP 인증정보 / API Key / Bearer 토큰** | 워크스페이스 전체 + Git 7커밋 | **이상 없음 (0건)** | 실제 토큰 0건 (`.gitignore` 제외 규칙명과 `security-xss.test.tsx` 차단 단위 테스트 더미 문자열만 존재) |
| **VPN 계정 / 비밀번호 / 개인키** | 워크스페이스 전체 + Git 7커밋 | **이상 없음 (0건)** | 실제 자격증명 0건 (`security-xss.test.tsx` 차단 검증용 가상 문자열 및 `QA_REPORT.md`/`README.md` 차단 규칙 설명만 존재) |
| **실제 회사 내부 네트워크 정보** | 워크스페이스 전체 + Git 7커밋 | **이상 없음 (0건)** | 프로덕션 코드는 RFC 예시 주소(`example.com`, `192.0.2.1`, `8.8.8.8`, `127.0.0.1`)만 사용 (`DESIGN.md` 내 Stitch 목업 배제 사유 기록만 존재) |
| **`.env` 파일 존재 여부** | 워크스페이스 + Git 추적 파일 | **이상 없음 (0건)** | 추적/비추적 `.env*` 파일 없음 |
| **`.gitignore` 필수 제외 항목** | `.gitignore` | **PASS** | `node_modules/`, `dist/`, `*.tsbuildinfo`, `.env`, `.env.*`, MCP 설정 파일(`.mcp.json`, `mcp.json`, `mcp_config.json`, `*.mcp.json`, `.cursor/mcp.json`, `.antigravity/mcp*.json`) 제외 확인 |
| **Git 추적 불필요 파일 점검** | `git ls-files` (59개 파일) | **PASS** | `node_modules/`, `dist/`, `*.tsbuildinfo`, `.env`, 로그/임시 파일 추적 0건 |

### 7.3 GitHub Actions CI 원격 실행 결과 및 Node.js 20 Deprecation 경고 해결

- **PR #1 (`98e91ea`) 원격 CI 실제 실행 결과 (GitHub MCP `pull_request_read` `get_check_runs` 조회)**:
  - **Push CI (`run 45764388000`)**:
    - `Verify (Node 20)` (`job 139721664953`): **PASS (`success`)** (`05:52:21Z` → `05:53:35Z`)
    - `Verify (Node 24)` (`job 139721664516`): **PASS (`success`)** (`05:52:20Z` → `05:53:40Z`)
  - **Pull Request #1 CI (`run 45764471975`, 전체 실행 시간 1분 26초)**:
    - `Verify (Node 20)` (`job 139721945617`): **PASS (`success`)** (`05:53:10Z` → `05:54:34Z`)
    - `Verify (Node 24)` (`job 139721945333`): **PASS (`success`)** (`05:53:10Z` → `05:54:04Z`)
- **발견된 CI 경고(Annotations 2건) 및 원인 분석**:
  - 경고 내용: GitHub Actions JavaScript 액션 런타임의 **Node.js 20 지원 중단(deprecated) 경고 2건** 발생 (참고: GitHub MCP `get_check_runs`는 개별 Annotation 본문 필드를 반환하지 않으나, 공식 저장소 `action.yml` 직접 조회로 원인 확정).
  - 원인 확인 (`github.get_file_contents`): `.github/workflows/ci.yml`에 사용된 `actions/checkout@v4`(`runs.using: node20`) 및 `actions/setup-node@v4`(`runs.using: 'node20'`)가 구형 Actions Node 20 런타임을 지정하고 있었음.
- **조치 내역 (`.github/workflows/ci.yml`)**:
  - GitHub 공식 최신 안정 릴리스(`github.get_latest_release` 및 `action.yml` 확인) 기준으로 업그레이드:
    - `actions/checkout@v4` → **`actions/checkout@v7`** (`v7.0.1`, `runs.using: node24`)
    - `actions/setup-node@v4` → **`actions/setup-node@v7`** (`v7.1.0`, `runs.using: 'node24'`)
  - 애플리케이션 테스트 매트릭스(`node-version: [20, 24]`), `cache: 'npm'`, 최소 권한(`permissions: contents: read`), 외부 Secret 미사용 원칙은 그대로 유지.
- **업그레이드 후 원격 재검증 상태**: **Push 대기 중** (다음 `develop` Push 후 PR #1 CI에서 2건의 deprecation 경고 해소 여부 최종 확인 예정).
