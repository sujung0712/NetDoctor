import type {
  DiagnosticAnswer,
  DiagnosticQuestion,
  FaultType,
  QuestionOption,
} from '../types';

function makeOptions(
  yesHint: string,
  noHint: string,
  unknownHint = '아직 확인하지 않았거나 판단이 어렵습니다.'
): QuestionOption[] {
  return [
    { value: 'yes', label: '예', hint: yesHint },
    { value: 'no', label: '아니오', hint: noHint },
    { value: 'unknown', label: '모름', hint: unknownHint },
  ];
}

export const DIAGNOSTIC_QUESTIONS: Record<string, DiagnosticQuestion> = {
  // =========================================================================
  // 1. NO_INTERNET (인터넷 연결 불가)
  // =========================================================================
  ni_link: {
    id: 'ni_link',
    faultType: 'NO_INTERNET',
    prompt: '작업 표시줄의 네트워크 아이콘(유선/Wi-Fi)이 정상 연결 상태로 표시되나요?',
    description:
      '랜선 연결 표시 또는 Wi-Fi 연결 표시가 활성화되어 있는지 확인해 주세요. 지구본(연결 없음)이나 X 표시가 보이면 "아니오"를 선택합니다.',
    recommendedCommandId: 'ipconfig',
    options: makeOptions(
      '네트워크 어댑터가 연결됨 상태로 표시됩니다.',
      '연결 끊김(지구본/X 표시) 또는 Wi-Fi 미연결 상태입니다.',
      '상태 아이콘을 확인하기 어렵거나 어댑터 상태를 모릅니다.'
    ),
  },
  ni_apipa: {
    id: 'ni_apipa',
    faultType: 'NO_INTERNET',
    prompt: 'ipconfig /all 실행 시 IPv4 주소가 169.254.x.x이거나 비어 있나요?',
    description:
      '정상적인 공유기·사내 네트워크는 보통 192.168.x.x, 10.x.x.x, 172.16~31.x.x 대역의 IPv4 주소를 할당합니다. 169.254.x.x(APIPA)는 DHCP IP 임대 실패 신호입니다.',
    recommendedCommandId: 'ipconfig',
    options: makeOptions(
      'IPv4 주소가 169.254.x.x로 시작하거나 비어 있습니다.',
      '정상 사설/공인 IPv4 주소가 할당되어 있습니다.',
      '아직 ipconfig /all 결과를 확인하지 못했습니다.'
    ),
  },
  ni_gateway_ping: {
    id: 'ni_gateway_ping',
    faultType: 'NO_INTERNET',
    prompt: '기본 게이트웨이 주소로 ping 테스트 시 정상 응답이 수신되나요?',
    description:
      'ipconfig에서 확인한 "기본 게이트웨이" IP로 ping을 보냈을 때 응답(Reply)이 오면 내부 공유기·게이트웨이까지 통신은 정상입니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '기본 게이트웨이에서 정상 응답을 받았습니다.',
      '요청 시간 만료 또는 대상 호스트에 연결할 수 없음 오류가 발생합니다.',
      '기본 게이트웨이 ping 테스트를 아직 실행하지 못했습니다.'
    ),
  },
  ni_external_ping: {
    id: 'ni_external_ping',
    faultType: 'NO_INTERNET',
    prompt: '외부 공용 IP 주소(예: ping 8.8.8.8)로 응답이 수신되나요?',
    description:
      '도메인 이름이 아닌 IP 주소 직접 ping이 성공하면 인터넷 회선 자체는 연결되어 있고 DNS 또는 브라우저/프록시 계층 문제일 가능성이 높습니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '8.8.8.8 등 외부 IP로 정상 응답이 옵니다.',
      '외부 IP로 ping을 보내도 모두 실패(시간 만료)합니다.',
      '외부 IP ping 테스트를 아직 실행하지 못했습니다.'
    ),
  },
  ni_other_devices: {
    id: 'ni_other_devices',
    faultType: 'NO_INTERNET',
    prompt: '같은 공유기·네트워크에 연결된 다른 기기(스마트폰, 동료 PC 등)도 인터넷 연결이 불가한가요?',
    description:
      '단일 PC 문제인지, 공유기·스위치·DHCP·외부 회선 등 공용 인프라 문제인지 범위를 좁히는 핵심 감별 질문입니다.',
    recommendedCommandId: 'ipconfig',
    options: makeOptions(
      '같은 네트워크의 다른 기기들도 동일하게 연결되지 않습니다.',
      '다른 기기는 정상 연결되고 현재 PC에서만 문제가 발생합니다.',
      '다른 기기 상태를 확인할 수 없는 환경입니다.'
    ),
  },

  // =========================================================================
  // 2. VPN_FAILURE (VPN 연결 실패)
  // =========================================================================
  vpn_base_internet: {
    id: 'vpn_base_internet',
    faultType: 'VPN_FAILURE',
    prompt: 'VPN을 켠 상태가 아닐 때 일반 인터넷 웹 접속은 정상인가요?',
    description:
      'VPN 터널은 기반 인터넷 회선 위에서 동작합니다. VPN을 끈 상태에서 포털·일반 웹사이트가 정상 열리는지 먼저 확인해 주세요.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      'VPN을 끄면 일반 인터넷 접속은 정상 동작합니다.',
      'VPN을 꺼도 일반 인터넷 자체가 연결되지 않습니다.',
      'VPN 해제 상태에서 일반 인터넷 연결 여부를 확인하지 못했습니다.'
    ),
  },
  vpn_other_network: {
    id: 'vpn_other_network',
    faultType: 'VPN_FAILURE',
    prompt: '다른 네트워크(예: 스마트폰 핫스팟/테더링)에서도 동일한 VPN 오류가 발생하나요?',
    description:
      '다른 회선에서도 동일하게 실패하면 계정·인증·VPN 서버 문제 가능성이 높고, 다른 회선에서는 성공하면 현재 네트워크의 포트/경로 제한 가능성이 높습니다.',
    recommendedCommandId: 'test-netconnection',
    options: makeOptions(
      '다른 네트워크(핫스팟 등)에서도 동일하게 VPN 연결이 실패합니다.',
      '다른 네트워크에서는 VPN이 정상 연결됩니다.',
      '다른 네트워크 환경에서 교차 테스트를 해보지 못했습니다.'
    ),
  },
  vpn_error_stage: {
    id: 'vpn_error_stage',
    faultType: 'VPN_FAILURE',
    prompt: 'VPN 로그인·인증(계정/OTP/인증서 검증) 단계에서 실패 메시지가 표시되나요?',
    description:
      '인증 실패, 비밀번호/OTP 오류, 인증서 만료 또는 시스템 시간 불일치 관련 안내가 표시되는지 확인해 주세요. (실제 비밀번호나 토큰은 입력하지 마세요.)',
    recommendedCommandId: 'test-netconnection',
    options: makeOptions(
      '로그인·OTP·인증서 검증 단계에서 오류가 발생합니다.',
      '인증 화면 진입 전 서버 연결/터널 수립 단계에서 시간 초과나 오류가 발생합니다.',
      '정확히 어느 단계에서 중단되는지 확인하기 어렵습니다.'
    ),
  },
  vpn_port_check: {
    id: 'vpn_port_check',
    faultType: 'VPN_FAILURE',
    prompt: 'Test-NetConnection으로 VPN 서버 주소와 포트 도달 점검 시 실패하나요?',
    description:
      'PowerShell에서 Test-NetConnection -ComputerName <VPN호스트> -Port <포트> 실행 시 TcpTestSucceeded 값이 False인지 확인해 주세요.',
    recommendedCommandId: 'test-netconnection',
    options: makeOptions(
      '포트 도달 점검에서 실패(TcpTestSucceeded: False)로 나타납니다.',
      'VPN 서버 포트 도달 점검은 성공(TcpTestSucceeded: True)합니다.',
      '아직 Test-NetConnection 포트 점검을 실행하지 못했습니다.'
    ),
  },

  // =========================================================================
  // 3. DNS_ERROR (DNS 오류)
  // =========================================================================
  dns_ip_ok: {
    id: 'dns_ip_ok',
    faultType: 'DNS_ERROR',
    prompt: '외부 IP 주소(예: ping 8.8.8.8)로의 통신은 정상 응답하나요?',
    description:
      'IP 통신이 정상인데 도메인 접속만 실패해야 순수 DNS 계층 문제로 볼 수 있습니다. IP ping까지 실패하면 상위 연결 장애를 먼저 점검해야 합니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '외부 IP 주소로 ping 응답이 정상 수신됩니다.',
      '외부 IP 주소로 ping을 보내도 응답이 없습니다.',
      '외부 IP ping 테스트를 아직 수행하지 않았습니다.'
    ),
  },
  dns_all_domains: {
    id: 'dns_all_domains',
    faultType: 'DNS_ERROR',
    prompt: '특정 도메인 하나가 아니라 대부분의 웹사이트·도메인 이름 해석이 모두 실패하나요?',
    description:
      '모든 도메인이 실패하면 DNS 서버 또는 질의 경로 장애 가능성이 높고, 특정 도메인 1~2개만 실패하면 로컬 캐시·hosts·대상 도메인 레코드 문제일 가능성이 높습니다.',
    recommendedCommandId: 'nslookup',
    options: makeOptions(
      '대부분의 도메인 접속 및 nslookup 조회가 실패합니다.',
      '특정 도메인(또는 특정 사내 사이트)만 이름 해석이 실패합니다.',
      '실패 범위를 여러 도메인으로 비교해 보지 못했습니다.'
    ),
  },
  dns_alt_server: {
    id: 'dns_alt_server',
    faultType: 'DNS_ERROR',
    prompt: 'nslookup example.com 8.8.8.8처럼 다른 공용 DNS를 지정해 조회하면 성공하나요?',
    description:
      '기본 DNS 조회는 실패하지만 외부 공용 DNS 서버를 직접 지정했을 때 IP가 반환된다면 현재 PC/공유기의 기본 DNS 리졸버 장애 가능성이 매우 높습니다.',
    recommendedCommandId: 'nslookup',
    options: makeOptions(
      '다른 공용 DNS 서버를 지정하면 정상적으로 IP 주소가 조회됩니다.',
      '다른 공용 DNS 서버를 지정해도 시간 초과나 조회 실패가 발생합니다.',
      '대체 DNS 지정 nslookup 테스트를 아직 실행하지 못했습니다.'
    ),
  },
  dns_cache_or_hosts: {
    id: 'dns_cache_or_hosts',
    faultType: 'DNS_ERROR',
    prompt: '같은 네트워크의 다른 기기에서는 해당 특정 도메인에 정상 접속되나요?',
    description:
      '다른 기기에서는 정상이라면 현재 단말의 로컬 DNS 캐시·hosts 설정·브라우저 보안 DNS 설정을 우선 점검해야 합니다.',
    recommendedCommandId: 'nslookup',
    options: makeOptions(
      '다른 기기에서는 해당 도메인에 정상 접속됩니다.',
      '다른 기기에서도 해당 특정 도메인 접속이 동일하게 실패합니다.',
      '다른 기기에서 해당 도메인 접속 여부를 확인하지 못했습니다.'
    ),
  },

  // =========================================================================
  // 4. SLOW_NETWORK (네트워크 속도 저하)
  // =========================================================================
  slow_wifi: {
    id: 'slow_wifi',
    faultType: 'SLOW_NETWORK',
    prompt: '현재 Wi-Fi(무선) 환경으로 네트워크에 연결되어 있나요?',
    description:
      '무선 환경은 거리·벽체·채널 간섭에 따른 속도 저하가 빈번하므로 무선 구간과 유선/외부 구간을 먼저 분리해 확인합니다.',
    recommendedCommandId: 'ipconfig',
    options: makeOptions(
      'Wi-Fi(무선)로 연결되어 있습니다.',
      '유선 LAN(이더넷) 케이블로 연결되어 있습니다.',
      '현재 연결 방식(유선/무선)을 정확히 확인하기 어렵습니다.'
    ),
  },
  slow_wired_compare: {
    id: 'slow_wired_compare',
    faultType: 'SLOW_NETWORK',
    prompt: '유선 LAN 연결 또는 공유기 바로 가까이에서 테스트해도 동일하게 느린가요?',
    description:
      '유선 연결이나 공유기 근접 위치에서 속도가 정상으로 돌아온다면 무선 신호 약화나 Wi-Fi 채널 간섭이 주원인일 가능성이 높습니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '유선 연결이나 공유기 가까이에서도 동일하게 느립니다.',
      '유선 연결 또는 공유기 가까이에서는 속도가 정상으로 회복됩니다.',
      '유선 전환이나 위치 이동 비교 테스트를 아직 해보지 못했습니다.'
    ),
  },
  slow_other_devices: {
    id: 'slow_other_devices',
    faultType: 'SLOW_NETWORK',
    prompt: '같은 네트워크에 연결된 다른 기기에서도 동일하게 속도 저하가 발생하나요?',
    description:
      '모든 기기가 동시에 느리면 공유 회선 대역폭 포화, 공유기 과부하 또는 ISP 혼잡 가능성이 높고, 현재 PC만 느리면 단말 리소스/어댑터 점검이 우선입니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '같은 네트워크의 다른 기기들도 함께 느립니다.',
      '다른 기기는 쾌적하고 현재 PC만 유독 느립니다.',
      '다른 기기의 체감 속도를 비교 확인하지 못했습니다.'
    ),
  },
  slow_gateway_latency: {
    id: 'slow_gateway_latency',
    faultType: 'SLOW_NETWORK',
    prompt: 'ping <기본 게이트웨이> 테스트에서 응답 지연(변동 폭 급증)이나 손실이 보이나요?',
    description:
      '내부 공유기/게이트웨이 구간에서부터 지연·손실이 발생한다면 외부 회선보다 로컬 Wi-Fi 간섭, 케이블 품질 또는 내부 LAN 혼잡을 우선 확인해야 합니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '기본 게이트웨이 ping에서 응답 지연이나 간헐적 손실이 관찰됩니다.',
      '기본 게이트웨이 ping 응답은 안정적이고 손실이 없습니다.',
      '기본 게이트웨이 ping 지연 여부를 아직 확인하지 못했습니다.'
    ),
  },
  slow_specific_service: {
    id: 'slow_specific_service',
    faultType: 'SLOW_NETWORK',
    prompt: '모든 웹사이트가 아니라 특정 사이트·특정 업무 서비스만 현저히 느린가요?',
    description:
      '특정 목적지만 느리다면 해당 서버 과부하나 특정 외부 라우팅 경로 병목 가능성이 높으며 tracert로 지연 구간을 확인할 수 있습니다.',
    recommendedCommandId: 'tracert',
    options: makeOptions(
      '특정 웹사이트나 특정 업무 서비스만 느리고 다른 사이트는 정상입니다.',
      '대부분의 웹사이트와 업무 서비스가 전반적으로 모두 느립니다.',
      '여러 서비스 간 속도 차이를 비교 확인하지 못했습니다.'
    ),
  },

  // =========================================================================
  // 5. INTERMITTENT_DROP (연결 끊김)
  // =========================================================================
  drop_wifi: {
    id: 'drop_wifi',
    faultType: 'INTERMITTENT_DROP',
    prompt: '현재 Wi-Fi(무선) 연결을 사용 중인가요?',
    description:
      '무선 환경의 AP 로밍·간섭 문제인지, 유선 LAN 케이블/포트의 물리적 접촉 불량인지 먼저 구분합니다.',
    recommendedCommandId: 'ipconfig',
    options: makeOptions(
      'Wi-Fi(무선) 연결을 사용 중입니다.',
      '유선 LAN(이더넷) 연결을 사용 중입니다.',
      '현재 연결 방식을 정확히 확인하지 못했습니다.'
    ),
  },
  drop_signal_or_roam: {
    id: 'drop_signal_or_roam',
    faultType: 'INTERMITTENT_DROP',
    prompt: 'Wi-Fi 신호 강도가 약하거나 여러 AP/공유기 사이를 이동할 때 자주 끊기나요?',
    description:
      '신호 막대가 1~2칸으로 낮거나 2.4GHz/5GHz 자동 전환·AP 전환 시점에 끊김이 집중되는지 확인해 주세요.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '신호가 약하거나 자리/AP 이동 시점에 끊김이 자주 발생합니다.',
      '공유기 가까이 고정된 위치에서도 신호는 충분한데 끊깁니다.',
      '신호 강도나 AP 전환 패턴을 아직 관찰하지 못했습니다.'
    ),
  },
  drop_cable_physical: {
    id: 'drop_cable_physical',
    faultType: 'INTERMITTENT_DROP',
    prompt: 'LAN 케이블 커넥터가 헐겁거나 본체·책상·허브 이동 시 연결이 끊기나요?',
    description:
      'RJ-45 래치 파손, 케이블 꺾임, USB-C 랜젠더 접촉 불량 등으로 링크가 순간 해제되는지 확인해 주세요.',
    recommendedCommandId: 'ipconfig',
    options: makeOptions(
      '케이블/포트 접촉이 불안정하거나 흔들림 시 연결이 끊깁니다.',
      '케이블과 포트는 단단히 고정되어 있고 물리적 이상이 보이지 않습니다.',
      '케이블 및 포트 체결 상태를 아직 점검하지 못했습니다.'
    ),
  },
  drop_all_devices: {
    id: 'drop_all_devices',
    faultType: 'INTERMITTENT_DROP',
    prompt: '끊김이 발생할 때 같은 네트워크의 다른 기기도 동시에 연결이 끊기나요?',
    description:
      '다수 기기가 동시에 끊기면 공유기·모뎀·ISP 회선 불안정 가능성이 높고, 현재 PC만 끊기면 단말 NIC 드라이버·절전 모드·IP 임대 갱신 이상 가능성이 높습니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '같은 네트워크의 다른 기기들도 같은 시점에 함께 끊깁니다.',
      '다른 기기는 유지되고 현재 PC만 단독으로 끊깁니다.',
      '끊김 순간에 다른 기기 상태를 동시에 확인하지 못했습니다.'
    ),
  },
  drop_ping_loss: {
    id: 'drop_ping_loss',
    faultType: 'INTERMITTENT_DROP',
    prompt: 'ping -n 20 <기본 게이트웨이> 테스트 중 간헐적 요청 시간 만료가 발생하나요?',
    description:
      '게이트웨이 대상 연속 ping 중 손실이 나타나면 내부 구간(무선/케이블/NIC/공유기) 불안정을 직접 확인할 수 있습니다.',
    recommendedCommandId: 'ping',
    options: makeOptions(
      '연속 ping 중 요청 시간 만료(패킷 손실)가 간헐적으로 발생합니다.',
      '연속 ping 동안 기본 게이트웨이 응답은 손실 없이 유지됩니다.',
      '아직 연속 ping(-n 20) 테스트를 실행하지 못했습니다.'
    ),
  },
};

const INITIAL_QUESTION_BY_FAULT: Record<FaultType, string> = {
  NO_INTERNET: 'ni_link',
  VPN_FAILURE: 'vpn_base_internet',
  DNS_ERROR: 'dns_ip_ok',
  SLOW_NETWORK: 'slow_wifi',
  INTERMITTENT_DROP: 'drop_wifi',
};

const MAX_STEPS_BY_FAULT: Record<FaultType, number> = {
  NO_INTERNET: 4,
  VPN_FAILURE: 4,
  DNS_ERROR: 3,
  SLOW_NETWORK: 4,
  INTERMITTENT_DROP: 4,
};

export function getQuestionById(questionId: string): DiagnosticQuestion | undefined {
  return DIAGNOSTIC_QUESTIONS[questionId];
}

export function getQuestionsForFaultType(faultType: FaultType): DiagnosticQuestion[] {
  return Object.values(DIAGNOSTIC_QUESTIONS).filter((q) => q.faultType === faultType);
}

export function getInitialQuestion(faultType: FaultType): DiagnosticQuestion {
  return DIAGNOSTIC_QUESTIONS[INITIAL_QUESTION_BY_FAULT[faultType]];
}

export function getEstimatedMaxSteps(faultType: FaultType): number {
  return MAX_STEPS_BY_FAULT[faultType];
}

/**
 * Pure deterministic branching function.
 * Computes the next diagnostic question dynamically based on the faultType
 * and the user's prior yes/no/unknown answers. Returns null when the branch ends.
 */
export function getNextQuestion(
  faultType: FaultType,
  answers: DiagnosticAnswer[]
): DiagnosticQuestion | null {
  if (answers.length === 0) {
    return getInitialQuestion(faultType);
  }

  const answerMap = new Map(answers.map((a) => [a.questionId, a.value]));
  const has = (id: string) => answerMap.has(id);
  const val = (id: string) => answerMap.get(id);

  switch (faultType) {
    case 'NO_INTERNET': {
      if (!has('ni_link')) return DIAGNOSTIC_QUESTIONS.ni_link;

      if (val('ni_link') === 'no') {
        return has('ni_other_devices') ? null : DIAGNOSTIC_QUESTIONS.ni_other_devices;
      }

      // ni_link is 'yes' or 'unknown'
      if (!has('ni_apipa')) return DIAGNOSTIC_QUESTIONS.ni_apipa;

      if (val('ni_apipa') === 'yes') {
        return has('ni_other_devices') ? null : DIAGNOSTIC_QUESTIONS.ni_other_devices;
      }

      // ni_apipa is 'no' or 'unknown'
      if (!has('ni_gateway_ping')) return DIAGNOSTIC_QUESTIONS.ni_gateway_ping;

      if (val('ni_gateway_ping') === 'no') {
        return has('ni_other_devices') ? null : DIAGNOSTIC_QUESTIONS.ni_other_devices;
      }

      // ni_gateway_ping is 'yes' or 'unknown'
      if (!has('ni_external_ping')) return DIAGNOSTIC_QUESTIONS.ni_external_ping;

      return null;
    }

    case 'VPN_FAILURE': {
      if (!has('vpn_base_internet')) return DIAGNOSTIC_QUESTIONS.vpn_base_internet;

      if (val('vpn_base_internet') === 'no') {
        // Base internet is down -> RULE-VPN-01 directly
        return null;
      }

      if (!has('vpn_other_network')) return DIAGNOSTIC_QUESTIONS.vpn_other_network;

      if (val('vpn_other_network') === 'yes') {
        return has('vpn_error_stage') ? null : DIAGNOSTIC_QUESTIONS.vpn_error_stage;
      }

      if (val('vpn_other_network') === 'no') {
        return has('vpn_port_check') ? null : DIAGNOSTIC_QUESTIONS.vpn_port_check;
      }

      // vpn_other_network === 'unknown': gather both stage and port signals
      if (!has('vpn_error_stage')) return DIAGNOSTIC_QUESTIONS.vpn_error_stage;
      if (!has('vpn_port_check')) return DIAGNOSTIC_QUESTIONS.vpn_port_check;
      return null;
    }

    case 'DNS_ERROR': {
      if (!has('dns_ip_ok')) return DIAGNOSTIC_QUESTIONS.dns_ip_ok;

      if (val('dns_ip_ok') === 'no') {
        // External IP fails -> RULE-DNS-01 (upstream internet failure)
        return null;
      }

      if (!has('dns_all_domains')) return DIAGNOSTIC_QUESTIONS.dns_all_domains;

      if (val('dns_all_domains') === 'no') {
        return has('dns_cache_or_hosts') ? null : DIAGNOSTIC_QUESTIONS.dns_cache_or_hosts;
      }

      // dns_all_domains is 'yes' or 'unknown'
      return has('dns_alt_server') ? null : DIAGNOSTIC_QUESTIONS.dns_alt_server;
    }

    case 'SLOW_NETWORK': {
      if (!has('slow_wifi')) return DIAGNOSTIC_QUESTIONS.slow_wifi;

      if (val('slow_wifi') === 'yes') {
        if (!has('slow_wired_compare')) return DIAGNOSTIC_QUESTIONS.slow_wired_compare;
        if (!has('slow_gateway_latency')) return DIAGNOSTIC_QUESTIONS.slow_gateway_latency;

        // If wired/close comparison resolved speed, local Wi-Fi issue is already isolated
        if (val('slow_wired_compare') === 'no') {
          return null;
        }
        return has('slow_specific_service') ? null : DIAGNOSTIC_QUESTIONS.slow_specific_service;
      }

      // slow_wifi is 'no' or 'unknown'
      if (!has('slow_other_devices')) return DIAGNOSTIC_QUESTIONS.slow_other_devices;
      if (!has('slow_gateway_latency')) return DIAGNOSTIC_QUESTIONS.slow_gateway_latency;
      if (!has('slow_specific_service')) return DIAGNOSTIC_QUESTIONS.slow_specific_service;
      return null;
    }

    case 'INTERMITTENT_DROP': {
      if (!has('drop_wifi')) return DIAGNOSTIC_QUESTIONS.drop_wifi;

      if (val('drop_wifi') === 'yes') {
        if (!has('drop_signal_or_roam')) return DIAGNOSTIC_QUESTIONS.drop_signal_or_roam;
      } else {
        if (!has('drop_cable_physical')) return DIAGNOSTIC_QUESTIONS.drop_cable_physical;
      }

      if (!has('drop_all_devices')) return DIAGNOSTIC_QUESTIONS.drop_all_devices;
      if (!has('drop_ping_loss')) return DIAGNOSTIC_QUESTIONS.drop_ping_loss;
      return null;
    }
  }
}
