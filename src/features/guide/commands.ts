import {
  COMMAND_CATEGORY_LABELS,
  FAULT_TYPE_LABELS,
  type CommandCategory,
  type WindowsCommandGuide,
} from '../../types';

export const WINDOWS_COMMAND_GUIDES: WindowsCommandGuide[] = [
  {
    id: 'ipconfig',
    command: 'ipconfig /all',
    title: 'IP 구성 및 네트워크 어댑터 상세 조회',
    category: 'CONFIGURATION',
    shell: 'CMD / PowerShell',
    relatedFaultTypes: [
      'NO_INTERNET',
      'DNS_ERROR',
      'VPN_FAILURE',
      'INTERMITTENT_DROP',
    ],
    summary:
      'Windows PC의 각 네트워크 어댑터에 할당된 IPv4 주소(정상 또는 APIPA 169.254.x.x), 서브넷 마스크, 기본 게이트웨이, DNS 서버 및 DHCP 임대 상태를 읽기 전용으로 확인합니다.',
    safeExamples: [
      {
        label: '전체 어댑터 상세 조회 (권장)',
        command: 'ipconfig /all',
        purpose:
          '유선(Ethernet), Wi-Fi, VPN 가상 어댑터의 IPv4 주소, 기본 게이트웨이, DHCP 임대 시간, DNS 서버 목록을 한 번에 확인합니다.',
      },
      {
        label: '핵심 IP 정보 요약 조회',
        command: 'ipconfig',
        purpose:
          '현재 연결된 어댑터의 IPv4 주소, 서브넷 마스크, 기본 게이트웨이만 간략하게 확인합니다.',
      },
      {
        label: '로컬 DNS 캐시 읽기 전용 확인',
        command: 'ipconfig /displaydns',
        purpose:
          '현재 Windows DNS 클라이언트 캐시에 보관된 도메인 조회 이력을 설정 변경 없이 확인합니다.',
      },
    ],
    executionSteps: [
      'Windows 시작 메뉴에서 "명령 프롬프트(cmd)" 또는 "Windows PowerShell"을 일반 사용자 권한으로 실행합니다.',
      '위 예시에서 `ipconfig /all` 명령어를 복사해 터미널에 붙여넣고 Enter를 누릅니다.',
      '현재 사용 중인 어댑터(이더넷 또는 무선 LAN 어댑터 Wi-Fi) 항목에서 IPv4 주소, 기본 게이트웨이, DNS 서버 값을 확인합니다.',
      '확인한 기본 게이트웨이 IP는 이어서 `ping` 연결성 점검의 대상으로 활용할 수 있습니다.',
    ],
    sampleOutput: `Windows IP 구성

   호스트 이름 . . . . . . . . : WORKSTATION-DEMO
   주 DNS 접미사 . . . . . . . : example.com

무선 LAN 어댑터 Wi-Fi:

   연결별 DNS 접미사. . . . : example.com
   설명. . . . . . . . . . . . : Wireless Network Adapter
   물리적 주소 . . . . . . . . : 00-00-5E-00-53-01
   DHCP 사용 . . . . . . . . . : 예
   자동 구성 사용. . . . . . . : 예
   IPv4 주소 . . . . . . . . . : 192.0.2.15(기본 설정)
   서브넷 마스크 . . . . . . . : 255.255.255.0
   임대 시작 날짜. . . . . . . : 2026년 11월 26일 오전 09:00:00
   임대 만료 날짜. . . . . . . : 2026년 11월 27일 오전 09:00:00
   기본 게이트웨이 . . . . . . : 192.0.2.1
   DHCP 서버 . . . . . . . . . : 192.0.2.1
   DNS 서버. . . . . . . . . . : 192.0.2.1
                                 8.8.8.8`,
    interpretations: [
      {
        pattern: 'IPv4 주소 정상 할당 + 기본 게이트웨이 및 DNS 서버 값 존재',
        status: 'normal',
        meaning:
          '로컬 네트워크(공유기 또는 사내 DHCP 서버)로부터 정상적인 IP 구성을 전달받은 상태입니다.',
        safeNextStep:
          '확인된 기본 게이트웨이 IP를 대상으로 `ping <기본 게이트웨이 IP>`를 실행해 내부망 연결성을 점검하세요.',
      },
      {
        pattern: '자동 구성 IPv4 주소: 169.254.x.x (APIPA)',
        status: 'warning',
        meaning:
          'DHCP 서버 응답을 받지 못해 Windows가 임시 자동 주소를 할당한 상태입니다. 이 상태에서는 외부 인터넷 통신이 불가능합니다.',
        safeNextStep:
          'Wi-Fi SSID 선택 상태 또는 LAN 케이블 체결 여부를 확인하고, 동일 네트워크의 다른 기기도 같은 증상이라면 공유기·DHCP 담당자에게 점검을 요청하세요.',
      },
      {
        pattern: '미디어 연결 끊김 (Media disconnected) 또는 기본 게이트웨이 공란',
        status: 'error',
        meaning:
          '해당 어댑터가 물리적으로 연결되지 않았거나 네트워크 링크가 수립되지 않았습니다.',
        safeNextStep:
          '케이블/포트 연결 상태, 비행기 모드, Wi-Fi 스위치 상태를 확인한 뒤 사내 네트워크 설정은 임의 변경하지 말고 IT 지원팀에 증상을 공유하세요.',
      },
    ],
    officialDocTitle: 'Microsoft Learn — ipconfig',
    officialDocUrl:
      'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig',
    safetyNote:
      '이 가이드에 수록된 `ipconfig`, `ipconfig /all`, `ipconfig /displaydns`는 모두 읽기 전용 조회 명령어이며 네트워크 설정을 변경하거나 기존 연결을 끊지 않습니다. 출력 결과 공유 시 사내 호스트명이나 실제 내부 IP는 마스킹한 뒤 전달하세요.',
    tags: [
      'ipconfig',
      'IPv4',
      'APIPA',
      '169.254',
      'DHCP',
      'DNS',
      '기본 게이트웨이',
      '어댑터',
    ],
  },
  {
    id: 'ping',
    command: 'ping',
    title: 'ICMP 왕복 지연 및 구간별 연결성 점검',
    category: 'CONNECTIVITY',
    shell: 'CMD / PowerShell',
    relatedFaultTypes: [
      'NO_INTERNET',
      'SLOW_NETWORK',
      'INTERMITTENT_DROP',
      'DNS_ERROR',
    ],
    summary:
      '로컬 루프백(127.0.0.1) → 기본 게이트웨이 → 외부 공용 IP(8.8.8.8) 순서로 ICMP 에코 요청을 전송하여 어느 구간에서 통신이 끊기거나 지연·손실이 발생하는지 분리 진단합니다.',
    safeExamples: [
      {
        label: '1단계: 로컬 TCP/IP 스택 점검 (루프백)',
        command: 'ping 127.0.0.1',
        purpose:
          'PC 내부의 TCP/IP 프로토콜 스택 자체가 정상 동작하는지 확인합니다.',
      },
      {
        label: '2단계: 기본 게이트웨이 연결성 점검',
        command: 'ping <기본 게이트웨이 IP>',
        purpose:
          '`ipconfig /all`에서 확인한 기본 게이트웨이 주소(예: 192.0.2.1)를 대입해 공유기·내부망 구간 연결성을 확인합니다.',
      },
      {
        label: '3단계: 외부 공용 IP 연결성 점검 (DNS 우회)',
        command: 'ping 8.8.8.8',
        purpose:
          '도메인 이름 해석(DNS)을 거치지 않고 외부 인터넷 IP 도달 여부와 왕복 지연(ms)을 확인합니다.',
      },
      {
        label: '4단계: 간헐적 손실·지연 편차 점검 (10회)',
        command: 'ping -n 10 8.8.8.8',
        purpose:
          '패킷을 10회 연속 전송해 간헐적 패킷 손실률과 응답 시간 변동 폭을 확인합니다.',
      },
    ],
    executionSteps: [
      '명령 프롬프트(CMD) 또는 PowerShell을 엽니다.',
      '먼저 `ping 127.0.0.1`을 실행해 로컬 네트워크 스택 응답을 확인합니다.',
      '다음으로 `ipconfig /all`에서 확인한 기본 게이트웨이 IP로 `ping`을 실행합니다 (예시 주소 대신 본인 환경의 기본 게이트웨이 입력).',
      '마지막으로 `ping 8.8.8.8`을 실행해 외부 연결 가능 여부와 패킷 손실률, 평균 응답 시간(ms)을 기록합니다.',
    ],
    sampleOutput: `Ping 8.8.8.8 32바이트 데이터 사용:
8.8.8.8의 응답: 바이트=32 시간=12ms TTL=117
8.8.8.8의 응답: 바이트=32 시간=11ms TTL=117
8.8.8.8의 응답: 바이트=32 시간=13ms TTL=117
8.8.8.8의 응답: 바이트=32 시간=12ms TTL=117

8.8.8.8에 대한 Ping 통계:
    패킷: 보냄 = 4, 받음 = 4, 손실 = 0 (0% 손실),
왕복 시간(밀리초):
    최소 = 11ms, 최대 = 13ms, 평균 = 12ms`,
    interpretations: [
      {
        pattern: '손실 = 0 (0% 손실), 일정한 응답 시간 (예: 평균 1~30ms)',
        status: 'normal',
        meaning:
          '대상 IP까지의 네트워크 경로가 안정적이며 패킷 손실 없이 정상 통신 중입니다.',
        safeNextStep:
          'IP Ping은 정상인데 웹사이트만 열리지 않는다면 `nslookup example.com`으로 DNS 이름 해석 여부를 점검하세요.',
      },
      {
        pattern: '응답 시간 급등(100ms 이상) 또는 일부 패킷 손실 (10%~50% 손실)',
        status: 'warning',
        meaning:
          '무선 신호 약화, 대역폭 혼잡, 또는 중간 라우터 구간의 일시적 병목이 발생하고 있을 가능성이 높습니다.',
        safeNextStep:
          '기본 게이트웨이 Ping과 외부 IP Ping의 손실률을 비교해 내부 Wi-Fi 문제인지 외부 회선 문제인지 구분한 뒤, 필요 시 `tracert -d example.com`으로 병목 구간을 확인하세요.',
      },
      {
        pattern:
          '요청 시간이 만료되었습니다 (100% 손실) / 대상 호스트에 연결할 수 없습니다',
        status: 'error',
        meaning:
          '해당 구간까지 라우팅이 단절되었거나, 대상 서버·보안 장비가 정책적으로 ICMP 응답을 차단하고 있습니다.',
        safeNextStep:
          '게이트웨이 Ping부터 실패한다면 로컬 연결을 확인하고, 외부 Ping만 실패한다면 ICMP 차단 가능성을 고려해 `Test-NetConnection -ComputerName example.com -Port 443`으로 TCP 연결을 추가 확인하세요.',
      },
    ],
    officialDocTitle: 'Microsoft Learn — ping',
    officialDocUrl:
      'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ping',
    safetyNote:
      '기본 `ping` 명령어는 소량의 ICMP 진단 패킷만 전송하는 안전한 읽기 전용 점검입니다. 일부 사내망·클라우드 서버는 보안 정책상 ICMP를 차단할 수 있으므로, Ping 실패만으로 방화벽이나 보안 기능을 비활성화해서는 안 됩니다.',
    tags: [
      'ping',
      'ICMP',
      '패킷 손실',
      '지연',
      'latency',
      '127.0.0.1',
      '8.8.8.8',
      '게이트웨이',
    ],
  },
  {
    id: 'nslookup',
    command: 'nslookup',
    title: 'DNS 도메인 이름 해석 진단 및 서버 비교',
    category: 'DNS',
    shell: 'CMD / PowerShell',
    relatedFaultTypes: ['DNS_ERROR', 'NO_INTERNET', 'VPN_FAILURE'],
    summary:
      '현재 PC의 기본 DNS 서버와 지정된 공용 DNS 서버(8.8.8.8)에 `example.com`을 각각 질의하여 도메인 이름 해석 장애 여부와 DNS 서버 구간 이상을 비교합니다.',
    safeExamples: [
      {
        label: '기본 DNS 서버로 도메인 해석 점검',
        command: 'nslookup example.com',
        purpose:
          '현재 PC에 자동/수동 설정된 기본 DNS 서버가 정상 응답하고 도메인 IP를 반환하는지 확인합니다.',
      },
      {
        label: '지정 공용 DNS 서버(8.8.8.8)와 비교 점검',
        command: 'nslookup example.com 8.8.8.8',
        purpose:
          '기본 DNS 대신 `8.8.8.8`에 직접 질의하여, 기본 DNS 서버 문제인지 전체 네트워크 문제인지 비교합니다.',
      },
      {
        label: 'IPv4(A 레코드) 명시적 조회',
        command: 'nslookup -type=A example.com',
        purpose:
          '도메인의 IPv4 주소 레코드(A 레코드)만 명확히 조회해 응답 내용을 확인합니다.',
      },
    ],
    executionSteps: [
      '명령 프롬프트(CMD) 또는 PowerShell을 엽니다.',
      '먼저 `nslookup example.com`을 실행해 응답한 기본 DNS 서버 주소와 반환된 IP를 확인합니다.',
      '응답이 지연되거나 실패하면 `nslookup example.com 8.8.8.8`을 실행해 공용 DNS 응답과 비교합니다.',
      '두 결과를 비교해 기본 DNS 서버 장애인지, DNS 포트(53) 도달 불가인지 기록합니다.',
    ],
    sampleOutput: `서버:  dns.example.com
Address:  192.0.2.1

권한 없는 응답:
이름:    example.com
Addresses:  2001:db8::10
          192.0.2.10`,
    interpretations: [
      {
        pattern: '서버 주소 표시 + 도메인에 대응하는 IP 주소 정상 반환',
        status: 'normal',
        meaning:
          '현재 기본 DNS 서버가 도메인 이름을 정상적으로 IP 주소로 변환하고 있습니다. "권한 없는 응답(Non-authoritative answer)"은 캐시된 정상 응답을 의미하므로 오류가 아닙니다.',
        safeNextStep:
          'DNS 해석은 정상인데 서비스 접속이 실패한다면 `Test-NetConnection -ComputerName example.com -Port 443`으로 포트 연결을 점검하세요.',
      },
      {
        pattern:
          '기본 DNS 조회는 실패·지연되나 `nslookup example.com 8.8.8.8`은 성공',
        status: 'warning',
        meaning:
          '네트워크 외부 통신은 가능하지만 현재 PC가 사용하는 기본 DNS 서버(공유기, ISP 또는 사내 DNS)에 장애나 지연이 있을 가능성이 높습니다.',
        safeNextStep:
          'DNS 설정을 임의로 덮어쓰지 말고, 비교 결과(기본 DNS 실패 vs 8.8.8.8 성공)를 장애 보고서에 기록해 IT 지원팀에 전달하세요.',
      },
      {
        pattern:
          'DNS request timed out / Non-existent domain (NXDOMAIN) / Server failed',
        status: 'error',
        meaning:
          'DNS 서버로부터 응답을 받지 못했거나 도메인 레코드가 존재하지 않습니다. VPN 연결 시 사내 DNS 정책과 충돌할 때도 발생할 수 있습니다.',
        safeNextStep:
          '도메인 철자를 재확인하고, `ipconfig /all`의 DNS 서버 IP와 `ping 8.8.8.8` 결과를 함께 수집해 네트워크 담당자에게 에스컬레이션하세요.',
      },
    ],
    officialDocTitle: 'Microsoft Learn — nslookup',
    officialDocUrl:
      'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nslookup',
    safetyNote:
      '`nslookup`은 지정된 DNS 서버에 단순 질의만 수행하는 읽기 전용 진단 도구입니다. 실습 및 1차 검증에는 `example.com` 같은 공개 테스트 도메인만 사용하고, 민감한 내부 시스템 도메인이나 계정 정보는 입력하지 마세요.',
    tags: [
      'nslookup',
      'DNS',
      '도메인',
      '이름 해석',
      '8.8.8.8',
      'example.com',
      'NXDOMAIN',
    ],
  },
  {
    id: 'tracert',
    command: 'tracert',
    title: '홉(Hop)별 네트워크 경로 추적 및 병목 구간 식별',
    category: 'ROUTING',
    shell: 'CMD / PowerShell',
    relatedFaultTypes: [
      'SLOW_NETWORK',
      'INTERMITTENT_DROP',
      'NO_INTERNET',
      'VPN_FAILURE',
    ],
    summary:
      '출발지 PC에서 목적지까지 패킷이 거쳐 가는 각 라우터(홉)의 경로와 응답 시간을 순차적으로 추적하여 지연 급증 구간이나 경로 차단 지점을 식별합니다.',
    safeExamples: [
      {
        label: '역방향 DNS 생략 고속 경로 추적 (권장)',
        command: 'tracert -d example.com',
        purpose:
          '`-d` 옵션으로 각 홉의 호스트명 조회를 생략해 빠르게 홉별 IP와 왕복 지연(ms)을 확인합니다.',
      },
      {
        label: '최대 15홉 제한 공용 IP 경로 추적',
        command: 'tracert -d -h 15 8.8.8.8',
        purpose:
          '최대 홉 수를 15개로 제한해 외부 공용 IP까지의 라우팅 흐름과 지연이 급증하는 구간을 신속히 파악합니다.',
      },
      {
        label: '예시 경계 IP 경로 점검',
        command: 'tracert -d 192.0.2.1',
        purpose:
          '내부·경계 게이트웨이 예시 IP까지의 홉 경로가 기대한 라우터로 향하는지 점검합니다.',
      },
    ],
    executionSteps: [
      '명령 프롬프트(CMD) 또는 PowerShell을 엽니다.',
      '`tracert -d example.com` 명령어를 입력하고 추적이 완료될 때까지 기다립니다(경로에 따라 수십 초 소요될 수 있습니다).',
      '1홉(기본 게이트웨이)부터 마지막 홉까지 응답 시간(ms)이 갑자기 크게 치솟는 구간이나, 이후 모든 홉에서 `* * *`가 연속되는 지점을 확인합니다.',
      '추적 중 즉시 종료가 필요하면 `Ctrl + C`를 눌러 안전하게 중단할 수 있습니다.',
    ],
    sampleOutput: `최대 30홉 이상의 example.com [192.0.2.10](으)로 가는 경로 추적:

  1     2 ms     1 ms     1 ms  192.0.2.1
  2     6 ms     5 ms     6 ms  198.51.100.1
  3    14 ms    13 ms    15 ms  203.0.113.1
  4    16 ms    15 ms    16 ms  192.0.2.10

추적을 완료했습니다.`,
    interpretations: [
      {
        pattern: '1홉부터 최종 목적지까지 낮은 지연으로 연속 도달 후 추적 완료',
        status: 'normal',
        meaning:
          '로컬 게이트웨이, ISP/백본, 목적지 네트워크까지 라우팅 경로에 뚜렷한 단절이나 병목이 없는 상태입니다.',
        safeNextStep:
          '경로가 정상이라면 애플리케이션 계층(TCP 포트 또는 웹 서비스 상태) 점검을 위해 `Test-NetConnection`을 실행하세요.',
      },
      {
        pattern: '중간 일부 홉에만 `* * *` 표시되지만 이후 홉 및 최종 목적지 도달',
        status: 'warning',
        meaning:
          '중간 라우터가 보안·부하 정책상 ICMP TTL 초과 응답만 생략하고 실제 트래픽은 정상 전달하는 흔한 현상입니다.',
        safeNextStep:
          '최종 목적지까지 정상 도달하고 지연이 안정적이라면 장애 원인이 아니므로 안심하고 다른 점검 항목을 확인하세요.',
      },
      {
        pattern:
          '특정 홉 이후 모든 후속 홉에서 `* * * 요청 시간이 만료되었습니다` 반복 또는 지연 급증 유지',
        status: 'error',
        meaning:
          '해당 홉 이후 구간에서 라우팅 차단, ISP/VPN 회선 장애 또는 심각한 링크 혼잡이 발생하고 있을 가능성이 높습니다.',
        safeNextStep:
          '마지막으로 응답한 홉 번호와 지연 변화 패턴을 장애 이력에 기록하여 네트워크·ISP 담당자에게 전달하세요.',
      },
    ],
    officialDocTitle: 'Microsoft Learn — tracert',
    officialDocUrl:
      'https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tracert',
    safetyNote:
      '`tracert`는 TTL 값을 1씩 증가시키며 경로를 조회하는 읽기 전용 진단 도구입니다. 시스템 라우팅 테이블을 수정하지 않으며, 추적 결과에 표시된 홉 IP 중 사내 구간 정보는 외부 공유 전 비식별화하세요.',
    tags: [
      'tracert',
      '라우팅',
      '경로 추적',
      '홉',
      'hop',
      '병목',
      '지연',
      'example.com',
    ],
  },
  {
    id: 'test-netconnection',
    command: 'Test-NetConnection',
    title: 'PowerShell TCP 포트 연결성 및 라우팅 상세 점검',
    category: 'PORT_DIAGNOSTICS',
    shell: 'PowerShell',
    relatedFaultTypes: [
      'VPN_FAILURE',
      'NO_INTERNET',
      'SLOW_NETWORK',
      'DNS_ERROR',
    ],
    summary:
      'Windows PowerShell의 `Test-NetConnection` cmdlet으로 특정 호스트와 TCP 포트(예: HTTPS 443)에 대한 실제 연결 가능 여부, 출발 인터페이스, 다음 홉 정보를 안전하게 점검합니다.',
    safeExamples: [
      {
        label: 'HTTPS 표준 포트(TCP 443) 연결 점검 (권장)',
        command: 'Test-NetConnection -ComputerName example.com -Port 443',
        purpose:
          'ICMP Ping이 차단된 환경에서도 대상 호스트의 TCP 443 포트가 실제 열려 있고 연결되는지 확인합니다.',
      },
      {
        label: '상세 진단 모드 (출발 인터페이스·라우팅 포함)',
        command:
          'Test-NetConnection -ComputerName 192.0.2.1 -Port 443 -InformationLevel Detailed',
        purpose:
          'DNS 해석 결과, 사용된 네트워크 인터페이스, 다음 홉 주소 및 TCP 연결 성공 여부를 한꺼번에 확인합니다.',
      },
      {
        label: 'PowerShell 경로 추적 병행 점검',
        command: 'Test-NetConnection -ComputerName example.com -TraceRoute',
        purpose:
          'PowerShell에서 기본 연결성 점검과 홉별 경로 추적을 함께 수행합니다.',
      },
    ],
    executionSteps: [
      'Windows 시작 메뉴에서 "Windows PowerShell" 또는 "PowerShell"을 일반 사용자 권한으로 실행합니다 (CMD에서는 동작하지 않습니다).',
      '`Test-NetConnection -ComputerName example.com -Port 443` 명령어를 복사해 실행합니다.',
      '출력 하단의 `TcpTestSucceeded` 값이 `True`인지 `False`인지 확인합니다.',
      '출발 인터페이스(`InterfaceAlias`)가 의도한 어댑터(Wi-Fi/이더넷/VPN)로 선택되었는지도 함께 점검합니다.',
    ],
    sampleOutput: `ComputerName     : example.com
RemoteAddress    : 192.0.2.10
RemotePort       : 443
InterfaceAlias   : Wi-Fi
SourceAddress    : 192.0.2.15
TcpTestSucceeded : True`,
    interpretations: [
      {
        pattern: 'TcpTestSucceeded : True',
        status: 'normal',
        meaning:
          '대상 호스트의 지정 TCP 포트(예: 443)까지 3-Way Handshake가 정상 성립되었습니다. 네트워크·포트 계층은 정상입니다.',
        safeNextStep:
          '포트 연결이 정상인데 브라우저나 앱에서 오류가 난다면 인증서, 브라우저 프록시 설정 또는 계정/앱 자체 상태를 확인하세요.',
      },
      {
        pattern: 'PingSucceeded : False 이지만 TcpTestSucceeded : True',
        status: 'warning',
        meaning:
          'ICMP(Ping) 응답만 보안 정책상 차단되어 있을 뿐, 실제 업무용 TCP 포트 통신은 정상적으로 허용되고 있습니다.',
        safeNextStep:
          'Ping 실패는 오탐이므로 네트워크 차단으로 오인하지 말고 정상 통신 상태로 판단하세요.',
      },
      {
        pattern:
          'TcpTestSucceeded : False (WARNING: TCP connect to ... failed)',
        status: 'error',
        meaning:
          '지정 TCP 포트에 연결할 수 없습니다. 중간 네트워크 보안 정책 차단, 대상 서비스 중단, 또는 VPN/프록시 경로 불일치 가능성이 있습니다.',
        safeNextStep:
          'Windows 방화벽이나 보안 솔루션을 임의로 비활성화하지 말고, `InterfaceAlias`와 `TcpTestSucceeded : False` 결과를 IT 보안·네트워크 팀에 공유해 포트 허용 정책을 확인받으세요.',
      },
    ],
    officialDocTitle: 'Microsoft Learn — Test-NetConnection',
    officialDocUrl:
      'https://learn.microsoft.com/en-us/powershell/module/nettcpip/test-netconnection',
    safetyNote:
      '`Test-NetConnection`은 Windows 내장 NetTCPIP 모듈의 읽기 전용 진단 cmdlet이며 방화벽 규칙이나 어댑터 설정을 변경하지 않습니다. 포트 점검 실패 시 보안 기능을 임의로 끄지 말고 승인된 기술지원 절차에 따라 정책을 확인하세요.',
    tags: [
      'Test-NetConnection',
      'PowerShell',
      'TCP',
      '포트',
      '443',
      'HTTPS',
      'VPN',
      '방화벽 정책',
    ],
  },
];

export function filterCommandGuides(
  guides: WindowsCommandGuide[],
  query: string,
  category: CommandCategory | 'ALL' = 'ALL',
): WindowsCommandGuide[] {
  const normalizedQuery = query.trim().toLowerCase();

  return guides.filter((guide) => {
    if (category !== 'ALL' && guide.category !== category) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const searchableParts: string[] = [
      guide.id,
      guide.command,
      guide.title,
      guide.summary,
      guide.shell,
      COMMAND_CATEGORY_LABELS[guide.category],
      guide.officialDocTitle,
      guide.safetyNote,
      ...guide.tags,
      ...guide.relatedFaultTypes.map((fault) => FAULT_TYPE_LABELS[fault]),
      ...guide.safeExamples.flatMap((ex) => [ex.label, ex.command, ex.purpose]),
      ...guide.interpretations.flatMap((item) => [
        item.pattern,
        item.meaning,
        item.safeNextStep,
      ]),
    ];

    return searchableParts.some((part) =>
      part.toLowerCase().includes(normalizedQuery),
    );
  });
}
