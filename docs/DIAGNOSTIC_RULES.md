# NetDoctor — Diagnostic Rules & Inference Specification

본 문서는 **Agent A(네트워크 진단 엔진)**가 구현하고 **QA Agent**가 정확성을 검증하는 NetDoctor 규칙 기반 진단 엔진의 결정론적(Deterministic) 명세서입니다.

---

## 1. 설계 원칙

1. **순수 함수(Pure Functions)**: `src/engine/` 모듈은 DOM, React 상태, LocalStorage, 외부 네트워크 요청에 의존하지 않는 순수 TypeScript 함수로 작성합니다.
2. **결정론적·동적 추론**: 모든 결과를 고정된 문자열로 반환하지 않고, 사용자의 실제 답변(`yes`, `no`, `unknown`) 조합에 따라 질문 분기, 원인 후보, 판단 근거, 추천 점검 순서, 안전한 해결 방법, 추가 확인 사항을 동적으로 계산합니다.
3. **근거 부족 시 원인 미확정**: `unknown`(모름) 응답 비율이 높거나 결정적 감별 신호가 없는 경우 `isConclusive: false`로 설정하고, 원인을 확정하지 않는 안내 문구(`conclusivenessNotice`)와 함께 추가 확인이 필요한 항목을 명확히 제시합니다.
4. **안전성 원칙**:
   - 실제 측정하지 않은 네트워크 수치(가짜 ping, 대역폭 등)를 생성하거나 표시하지 않습니다.
   - 네트워크 설정 자동 변경을 수행하거나 안내하지 않습니다.
   - 방화벽·백신·보안 기능 해제를 유도하지 않습니다.

---

## 2. 지원 장애 유형 5종 (`FaultType`)

| FaultType ID | 한글 명칭 | 범위 |
| :--- | :--- | :--- |
| `NO_INTERNET` | 인터넷 연결 불가 | 모든 웹·업무 앱 외부 연결 불가 (물리 링크, IP/DHCP, 게이트웨이, 상위 회선) |
| `VPN_FAILURE` | VPN 연결 실패 | 사내/원격 VPN 연결 실패, 인증·터널 수립 오류, 포트/경로 차단 |
| `DNS_ERROR` | DNS 오류 | IP 통신은 가능하거나 특정 환경은 정상이나 도메인 이름 해석 실패 |
| `SLOW_NETWORK` | 네트워크 속도 저하 | 연결은 유지되나 응답 지연, 로딩 저하, Wi-Fi 혼잡/대역폭 포화 |
| `INTERMITTENT_DROP` | 연결 끊김 | 간헐적·주기적 연결 해제 및 재연결 반복 (케이블, Wi-Fi, 전원 관리, 회선 불안정) |

---

## 3. 장애 유형별 동적 질문 분기 및 규칙 요약

각 질문은 **`예(yes)` / `아니오(no)` / `모름(unknown)`** 응답을 지원하며, 이전 응답에 따라 다음 질문이 동적으로 결정됩니다.

### 3.1 `NO_INTERNET` (인터넷 연결 불가)
- `ni_link`: 네트워크 아이콘(유선/Wi-Fi)이 정상 연결 상태로 표시되나요?
  - `no` -> `ni_other_devices` (다른 기기도 동일한가요?) -> `RULE-NI-01` (물리 연결/어댑터 비활성화/공유기 장애 분기)
  - `yes` / `unknown` -> `ni_apipa` (`ipconfig /all`에서 IPv4 주소가 `169.254.x.x`이거나 비어 있나요?)
    - `yes` -> `ni_other_devices` -> `RULE-NI-02` (DHCP 임대 실패 / APIPA 할당)
    - `no` / `unknown` -> `ni_gateway_ping` (`ping <기본 게이트웨이>` 응답이 정상인가요?)
      - `no` -> `ni_other_devices` -> `RULE-NI-03` (게이트웨이 미응답 — 단일 기기 vs 다수 기기 분기)
      - `yes` / `unknown` -> `ni_external_ping` (`ping 8.8.8.8` 같은 외부 IP 응답이 있나요?)
        - `no` -> `RULE-NI-04` (상위 ISP 회선 또는 라우터 WAN 구간 장애)
        - `yes` -> `RULE-NI-05` (외부 IP는 정상이나 도메인/프록시/DNS 구간 이상 의심)

### 3.2 `VPN_FAILURE` (VPN 연결 실패)
- `vpn_base_internet`: VPN을 켠 상태가 아닐 때 일반 인터넷 웹 접속은 정상인가요?
  - `no` -> `RULE-VPN-01` (기반 인터넷 연결 선행 복구 필요)
  - `yes` / `unknown` -> `vpn_other_network`: 다른 네트워크(예: 모바일 핫스팟)에서도 동일한 VPN 오류가 발생하나요?
    - `yes` -> `vpn_error_stage` (로그인/인증 단계에서 실패하나요?) -> `RULE-VPN-02` (인증/계정 정책·시간 동기화 또는 VPN 서버 측 장애)
    - `no` -> `vpn_port_check` (`Test-NetConnection`으로 VPN 대상 포트 도달이 실패하나요?) -> `RULE-VPN-03` (현재 네트워크/공유기 VPN 포트 또는 경로 제한)
    - `unknown` -> `vpn_error_stage` -> `vpn_port_check`

### 3.3 `DNS_ERROR` (DNS 오류)
- `dns_ip_ok`: 외부 IP 주소(`ping 8.8.8.8`)로 통신은 정상인가요?
  - `no` -> `RULE-DNS-01` (단순 DNS 오류가 아닌 상위 인터넷/게이트웨이 연결 장애 가능성)
  - `yes` / `unknown` -> `dns_all_domains`: 특정 도메인 하나만 실패하나요, 아니면 대부분의 도메인이 실패하나요? (`yes`: 대부분 실패 / `no`: 특정 도메인만 실패 / `unknown`: 모름)
    - `yes` -> `dns_alt_server` (`nslookup example.com 8.8.8.8`처럼 다른 공용 DNS 지정 조회는 성공하나요?) -> `RULE-DNS-02` (기본 DNS 리졸버 응답 장애) / `RULE-DNS-03` (DNS 질의 경로 차단 또는 로컬 DNS 클라이언트 이상)
    - `no` -> `dns_cache_or_hosts` (다른 기기에서는 해당 도메인에 정상 접속되나요?) -> `RULE-DNS-04` (로컬 DNS 캐시/hosts/특정 도메인 레코드 문제)
    - `unknown` -> `dns_alt_server`

### 3.4 `SLOW_NETWORK` (네트워크 속도 저하)
- `slow_wifi`: 현재 Wi-Fi(무선)로 연결되어 있나요?
  - `yes` -> `slow_wired_compare` (유선 LAN 연결 또는 공유기 가까이에서도 동일하게 느린가요?)
  - `no` / `unknown` -> `slow_other_devices` (같은 네트워크의 다른 기기도 동일하게 느린가요?)
- 후속 분기:
  - `slow_gateway_latency`: `ping <기본 게이트웨이>`에서 지연이나 손실이 보이나요? -> `RULE-SLOW-01` (로컬 Wi-Fi 간섭·신호 약화 / 내부 구간 혼잡)
  - `slow_specific_service`: 특정 사이트·업무 서비스만 느린가요? -> `RULE-SLOW-02` (특정 목적지 서버·경로 병목, `tracert` 확인 필요) vs `RULE-SLOW-03` (공유 회선 대역폭 포화 또는 ISP 구간 혼잡)

### 3.5 `INTERMITTENT_DROP` (연결 끊김)
- `drop_wifi`: Wi-Fi 무선 연결 사용 중인가요?
  - `yes` -> `drop_signal_or_roam` (신호 강도가 낮거나 여러 AP/공유기 사이를 이동할 때 자주 끊기나요?) -> `RULE-DROP-01` (무선 간섭·신호 약화·로밍 불안정)
  - `no` / `unknown` -> `drop_cable_physical` (LAN 케이블이 헐겁거나 본체 이동 시 끊기나요?) -> `RULE-DROP-02` (물리 케이블/포트 접촉 불량)
- 후속 분기:
  - `drop_all_devices`: 끊김 발생 시 같은 네트워크의 다른 기기도 동시에 끊기나요? -> `RULE-DROP-03` (공유기/모뎀/ISP 회선 불안정) vs `RULE-DROP-04` (단말 NIC 드라이버·절전 모드·IP 임대 갱신 이상)
  - `drop_ping_loss`: `ping -n 20 <기본 게이트웨이>` 테스트 중 간헐적 요청 시간 만료가 발생하나요?

---

## 4. 근거 부족 판정 기준 (`isConclusive`)

- 전체 응답 중 `unknown` 비율이 **50% 이상**이거나,
- 최상위 원인 후보의 규칙 점수가 **60점 미만**이거나,
- 1위와 2위 후보 간 점수 차이가 **10점 이하**로 경합 상태인 경우:
  - `isConclusive = false`
  - `conclusivenessNotice`: "현재 입력된 정보만으로는 단일 원인을 확정하기 어렵습니다. 아래 추가 확인 항목과 추천 명령어 점검 결과를 확보한 뒤 재진단해 주세요."
  - `additionalChecksNeeded`에 미확인(`unknown`) 질문에 대응하는 구체적 확인 항목을 자동 삽입합니다.
