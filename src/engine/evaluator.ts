import type {
  AnswerValue,
  CauseCandidate,
  CheckStep,
  CommandId,
  DiagnosisResult,
  DiagnosticAnswer,
  FaultType,
  Severity,
} from '../types';
import { ANSWER_VALUE_LABELS, FAULT_TYPE_LABELS } from '../types';
import { getQuestionById } from './questions';

export interface EvaluateDiagnosisInput {
  sessionId?: string;
  faultType: FaultType;
  symptomSummary?: string;
  answers: DiagnosticAnswer[];
  evaluatedAt?: string;
}

interface InternalRuleCandidate {
  id: string;
  ruleId: string;
  title: string;
  score: number;
  explanation: string;
  supportingEvidence: string[];
  checkSteps: Omit<CheckStep, 'order'>[];
  safeResolutions: string[];
}

const INCONCLUSIVE_STANDARD_NOTICE =
  '현재 입력된 정보만으로는 단일 원인을 확정하기 어렵습니다. 아래 추가 확인 항목과 추천 명령어 점검 결과를 확보한 뒤 재진단해 주세요.';

const UNKNOWN_CHECK_GUIDANCE: Record<
  string,
  { instruction: string; checkStep: Omit<CheckStep, 'order'> }
> = {
  ni_link: {
    instruction:
      '작업 표시줄의 네트워크 아이콘 상태 및 제어판/설정에서 유선·Wi-Fi 어댑터가 활성화되어 있는지 확인해 주세요.',
    checkStep: {
      title: '네트워크 어댑터 연결 상태 확인',
      instruction:
        'CMD 또는 PowerShell에서 ipconfig /all을 실행해 미디어 연결 끊김 여부와 활성 어댑터를 확인합니다.',
      commandId: 'ipconfig',
    },
  },
  ni_apipa: {
    instruction:
      'ipconfig /all 결과에서 IPv4 주소가 169.254.x.x(APIPA)로 자동 할당되었는지 또는 정상 사설 IP가 부여되었는지 확인해 주세요.',
    checkStep: {
      title: 'IPv4 주소 및 DHCP 임대 여부 확인',
      instruction:
        'ipconfig /all 출력에서 IPv4 주소, 서브넷 마스크, 기본 게이트웨이, DHCP 사용 여부를 점검합니다.',
      commandId: 'ipconfig',
    },
  },
  ni_gateway_ping: {
    instruction:
      'ipconfig에서 확인한 기본 게이트웨이 IP로 ping 테스트를 실행하여 내부 공유기 응답 여부를 확인해 주세요.',
    checkStep: {
      title: '기본 게이트웨이 응답 점검',
      instruction: 'ping -n 4 <기본 게이트웨이 IP>를 실행하여 내부 네트워크 도달 여부를 확인합니다.',
      commandId: 'ping',
    },
  },
  ni_external_ping: {
    instruction:
      'ping 8.8.8.8 실행 시 외부 공용 IP로부터 응답이 오는지 확인하여 회선 장애와 DNS 문제를 구분해 주세요.',
    checkStep: {
      title: '외부 공용 IP 직접 통신 점검',
      instruction: 'ping -n 4 8.8.8.8을 실행해 도메인 해석 없이 외부 IP 통신이 가능한지 확인합니다.',
      commandId: 'ping',
    },
  },
  ni_other_devices: {
    instruction:
      '같은 공유기나 사내 네트워크에 연결된 다른 기기(스마트폰, 동료 PC)에서도 동일한 연결 불가 현상이 있는지 비교해 주세요.',
    checkStep: {
      title: '동일 네트워크 타 기기 비교 점검',
      instruction:
        '동일 공유기/회선에 연결된 다른 기기의 접속 여부를 확인해 단일 단말 문제와 공용 인프라 문제를 분리합니다.',
      commandId: 'ipconfig',
    },
  },
  vpn_base_internet: {
    instruction:
      'VPN 클라이언트를 종료한 상태에서 일반 웹사이트 접속 및 외부 IP ping이 정상 동작하는지 먼저 확인해 주세요.',
    checkStep: {
      title: 'VPN 해제 상태 기반 인터넷 점검',
      instruction: 'VPN을 끈 뒤 ping -n 4 8.8.8.8 및 일반 웹 접속이 정상인지 확인합니다.',
      commandId: 'ping',
    },
  },
  vpn_other_network: {
    instruction:
      '가능한 경우 스마트폰 핫스팟 등 다른 네트워크에서 VPN 접속을 시도해 현재 네트워크 환경 종속 문제인지 구분해 주세요.',
    checkStep: {
      title: '타 네트워크 교차 접속 확인',
      instruction:
        '다른 네트워크(모바일 핫스팟 등)에서 VPN 서버 도달 및 접속 가능 여부를 안전하게 비교합니다.',
      commandId: 'test-netconnection',
    },
  },
  vpn_error_stage: {
    instruction:
      'VPN 클라이언트에 표시되는 오류 코드와 중단 단계(인증 단계 vs 터널 수립 단계)를 기록해 주세요. (계정 비밀번호·OTP 등 민감 정보는 제외)',
    checkStep: {
      title: 'VPN 오류 단계 및 시스템 시각 확인',
      instruction:
        'VPN 클라이언트의 오류 메시지가 인증 단계인지 연결 단계인지 확인하고, Windows 날짜/시간 자동 동기화 상태를 점검합니다.',
      commandId: 'test-netconnection',
    },
  },
  vpn_port_check: {
    instruction:
      'PowerShell에서 Test-NetConnection -ComputerName <VPN서버주소> -Port <포트>를 실행해 TcpTestSucceeded 결과를 확인해 주세요.',
    checkStep: {
      title: 'VPN 서버 포트 도달성 점검',
      instruction:
        'Test-NetConnection으로 사내/서비스 VPN 게이트웨이의 대상 포트(예: 443 등) TCP 연결 성공 여부를 확인합니다.',
      commandId: 'test-netconnection',
    },
  },
  dns_ip_ok: {
    instruction:
      'ping 8.8.8.8로 외부 IP 통신이 정상인지 먼저 확인하여 순수 DNS 문제인지 전체 인터넷 장애인지 구분해 주세요.',
    checkStep: {
      title: '외부 IP 연결성 선행 확인',
      instruction: 'ping -n 4 8.8.8.8을 실행해 IP 계층 통신이 정상 유지되는지 확인합니다.',
      commandId: 'ping',
    },
  },
  dns_all_domains: {
    instruction:
      '서로 다른 2~3개 일반 도메인(예: example.com 등)에 대해 nslookup 조회를 실행해 전체 실패인지 특정 도메인 문제인지 확인해 주세요.',
    checkStep: {
      title: '복수 도메인 이름 해석 범위 비교',
      instruction: 'nslookup으로 여러 도메인을 조회해 전체 실패인지 특정 도메인만 실패하는지 구분합니다.',
      commandId: 'nslookup',
    },
  },
  dns_alt_server: {
    instruction:
      'nslookup example.com 8.8.8.8처럼 외부 공용 DNS를 지정해 조회했을 때 IP가 정상 반환되는지 확인해 주세요.',
    checkStep: {
      title: '대체 DNS 서버 지정 조회 점검',
      instruction:
        'nslookup example.com 8.8.8.8 실행 결과를 기본 nslookup example.com 결과와 비교합니다.',
      commandId: 'nslookup',
    },
  },
  dns_cache_or_hosts: {
    instruction:
      '같은 네트워크의 다른 기기에서 문제 도메인에 접속되는지 확인해 로컬 PC 설정 문제와 대상 도메인 자체 문제를 구분해 주세요.',
    checkStep: {
      title: '특정 도메인 타 기기 비교 및 nslookup 확인',
      instruction:
        '다른 기기에서의 접속 여부와 현재 PC의 nslookup <문제 도메인> 응답 결과를 비교합니다.',
      commandId: 'nslookup',
    },
  },
  slow_wifi: {
    instruction:
      '현재 PC가 Wi-Fi(무선)인지 유선 LAN(이더넷)으로 연결되어 있는지 어댑터 상태를 확인해 주세요.',
    checkStep: {
      title: '활성 네트워크 어댑터 유형 확인',
      instruction: 'ipconfig /all에서 현재 IPv4가 할당된 활성 어댑터가 Wi-Fi인지 이더넷인지 확인합니다.',
      commandId: 'ipconfig',
    },
  },
  slow_wired_compare: {
    instruction:
      '유선 LAN 연결 또는 공유기 인접 위치에서 체감 속도가 개선되는지 비교해 무선 구간 병목 여부를 확인해 주세요.',
    checkStep: {
      title: '유선 또는 공유기 근접 환경 비교 점검',
      instruction:
        '가능하면 유선 LAN 연결 또는 공유기 근접 위치에서 기본 게이트웨이 ping 응답 안정성을 비교합니다.',
      commandId: 'ping',
    },
  },
  slow_other_devices: {
    instruction:
      '같은 네트워크의 다른 기기에서도 동일하게 느린지 확인해 공유 회선 혼잡과 단일 PC 문제를 분리해 주세요.',
    checkStep: {
      title: '동일 네트워크 타 기기 속도 체감 비교',
      instruction: '다른 기기에서도 동일하게 지연이 발생하는지 확인해 영향 범위를 파악합니다.',
      commandId: 'ping',
    },
  },
  slow_gateway_latency: {
    instruction:
      'ping -n 10 <기본 게이트웨이>를 실행해 내부 공유기 구간에서 응답 지연이나 패킷 손실이 발생하는지 확인해 주세요.',
    checkStep: {
      title: '기본 게이트웨이 응답 지연 점검',
      instruction:
        'ping -n 10 <기본 게이트웨이 IP>를 실행해 내부 구간의 응답 안정성과 손실 여부를 관찰합니다.',
      commandId: 'ping',
    },
  },
  slow_specific_service: {
    instruction:
      '여러 웹사이트를 비교해 특정 서비스만 느린지 확인하고, 특정 서비스가 느리다면 tracert로 지연 구간을 추적해 주세요.',
    checkStep: {
      title: '목적지 경로 지연 구간 추적',
      instruction: 'tracert <대상 도메인>을 실행해 특정 홉 이후 응답 지연이나 시간 초과가 집중되는지 확인합니다.',
      commandId: 'tracert',
    },
  },
  drop_wifi: {
    instruction:
      '현재 끊김이 발생하는 환경이 Wi-Fi 무선 연결인지 유선 LAN 케이블 연결인지 확인해 주세요.',
    checkStep: {
      title: '활성 어댑터 및 연결 방식 확인',
      instruction: 'ipconfig /all을 통해 현재 사용 중인 어댑터(Wi-Fi/이더넷)와 임대 시간 정보를 확인합니다.',
      commandId: 'ipconfig',
    },
  },
  drop_signal_or_roam: {
    instruction:
      '끊김 시점의 Wi-Fi 신호 세기와 AP 이동/주파수 대역(2.4GHz·5GHz) 전환 여부를 관찰해 주세요.',
    checkStep: {
      title: '무선 신호 세기 및 연속 응답 관찰',
      instruction: '공유기 근접 위치에서 ping -n 20 <기본 게이트웨이>를 실행해 끊김 빈도 변화를 비교합니다.',
      commandId: 'ping',
    },
  },
  drop_cable_physical: {
    instruction:
      'LAN 케이블 양단 커넥터 체결 상태, 포트 링크 LED 깜빡임, USB 랜젠더 접촉 상태를 육안으로 점검해 주세요.',
    checkStep: {
      title: '유선 케이블 및 어댑터 상태 점검',
      instruction: '케이블 재체결 후 ipconfig /all에서 미디어 연결 끊김이 재발하는지 확인합니다.',
      commandId: 'ipconfig',
    },
  },
  drop_all_devices: {
    instruction:
      '연결 끊김이 발생하는 시점에 같은 공유기를 쓰는 다른 기기도 동시에 끊기는지 확인해 주세요.',
    checkStep: {
      title: '끊김 발생 시 다수 기기 동시 영향 확인',
      instruction: '다른 기기에서도 동일 시점에 끊김이 발생하는지 관찰해 공유기/ISP 문제와 단말 문제를 구분합니다.',
      commandId: 'ping',
    },
  },
  drop_ping_loss: {
    instruction:
      'ping -n 20 <기본 게이트웨이>를 실행해 간헐적인 요청 시간 만료(패킷 손실)가 발생하는지 확인해 주세요.',
    checkStep: {
      title: '기본 게이트웨이 연속 ping 손실 점검',
      instruction: 'ping -n 20 <기본 게이트웨이 IP>를 실행해 내부 구간 패킷 손실 발생 여부를 확인합니다.',
      commandId: 'ping',
    },
  },
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreToLikelihood(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function getAnswerValue(
  answerMap: Map<string, DiagnosticAnswer>,
  id: string
): AnswerValue | undefined {
  return answerMap.get(id)?.value;
}

function formatAnswerBrief(answer: DiagnosticAnswer): string {
  const noteSuffix = answer.note?.trim() ? ` (메모: ${answer.note.trim()})` : '';
  return `"${answer.questionPrompt}" → ${answer.valueLabel}${noteSuffix}`;
}

function evaluateNoInternet(answerMap: Map<string, DiagnosticAnswer>): InternalRuleCandidate[] {
  const link = getAnswerValue(answerMap, 'ni_link');
  const apipa = getAnswerValue(answerMap, 'ni_apipa');
  const gw = getAnswerValue(answerMap, 'ni_gateway_ping');
  const ext = getAnswerValue(answerMap, 'ni_external_ping');
  const other = getAnswerValue(answerMap, 'ni_other_devices');

  const rules: InternalRuleCandidate[] = [];

  // RULE-NI-01: 물리 연결 / 어댑터 비활성화 / 공유기 링크 장애
  {
    let score = 0;
    const ev: string[] = [];
    if (link === 'no') {
      score += 78;
      ev.push('네트워크 아이콘이 미연결 상태로 확인되어 물리 링크 또는 어댑터 단절 가능성이 매우 높습니다.');
      if (other === 'yes') {
        score += 14;
        ev.push('같은 네트워크의 다른 기기도 연결 불가하여 공유기/스위치 전원 또는 공용 장비 링크 장애가 유력합니다.');
      } else if (other === 'no') {
        score += 12;
        ev.push('다른 기기는 정상 연결되어 현재 PC의 LAN 케이블, 포트, Wi-Fi 스위치 또는 어댑터 비활성화 가능성이 높습니다.');
      }
    } else if (link === 'unknown') {
      score += 24;
      ev.push('어댑터 연결 상태가 미확인("모름")이므로 물리 링크 이상 가능성을 배제할 수 없습니다.');
    }

    const isMultiDevice = other === 'yes';
    rules.push({
      id: 'ni-physical-link',
      ruleId: 'RULE-NI-01',
      title: isMultiDevice
        ? '공유기·스위치 전원 또는 공용 네트워크 링크 장애'
        : '물리적 케이블 단절·Wi-Fi 미연결 또는 네트워크 어댑터 비활성화',
      score: clampScore(score),
      explanation: isMultiDevice
        ? '다수 기기에서 동시에 네트워크 링크가 끊긴 상태로, 공유기·스위치 장비의 전원/포트 상태 또는 업링크 케이블 점검이 우선 필요합니다.'
        : '현재 PC의 네트워크 인터페이스 링크가 수립되지 않은 상태입니다. LAN 케이블 체결 불량, Wi-Fi 비활성화(비행기 모드), 또는 어댑터 사용 안 함 상태가 주요 원인입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '네트워크 어댑터 미디어 상태 확인',
          instruction:
            'CMD/PowerShell에서 ipconfig /all을 실행해 어댑터가 "미디어 연결 끊김" 상태인지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '물리 링크 및 공유기 LED 점검',
          instruction: isMultiDevice
            ? '공유기/스위치 전원 LED와 WAN/LAN 포트 LED 점등 상태를 확인하고, 사내 환경이라면 IT 관리자와 공유합니다.'
            : 'LAN 케이블 양단 커넥터를 다시 체결하고, 노트북의 Wi-Fi 활성화 및 비행기 모드 해제 여부를 확인합니다.',
        },
        {
          title: '링크 복구 후 게이트웨이 응답 검증',
          instruction: '연결 아이콘이 정상화된 뒤 ping -n 4 <기본 게이트웨이>로 내부 통신 복구를 확인합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: isMultiDevice
        ? [
            '공유기 및 모뎀의 전원 상태와 포트 LED가 정상 점등되어 있는지 육안으로 확인합니다.',
            '가정·소규모 환경이라면 모뎀과 공유기를 안전하게 재시작(전원 차단 후 약 30초 대기 후 재투입)합니다. 사내 공용 장비는 임의 재부팅하지 말고 IT 관리자에게 요청합니다.',
            '여분의 정상 케이블이나 다른 LAN 포트로 교차 테스트하여 특정 포트/케이블 불량 여부를 분리합니다.',
          ]
        : [
            'LAN 케이블을 본체와 벽면/공유기 포트에서 분리했다가 딸깍 소리가 날 때까지 단단히 재체결합니다.',
            'Wi-Fi 사용 환경이라면 비행기 모드가 꺼져 있는지, 올바른 SSID에 연결되어 있는지 확인합니다.',
            'Windows 설정 > 네트워크 및 인터넷 > 고급 네트워크 설정에서 해당 어댑터가 비활성화 상태라면 안전하게 다시 활성화합니다.',
            'USB-C 이더넷 젠더나 도킹 스테이션을 사용 중이라면 다른 USB 포트에 연결해 접촉 불량 여부를 확인합니다.',
          ],
    });
  }

  // RULE-NI-02: DHCP 임대 실패 / APIPA 할당
  {
    let score = 0;
    const ev: string[] = [];
    if (apipa === 'yes') {
      score += 78;
      ev.push('IPv4 주소가 169.254.x.x(APIPA)이거나 미할당 상태로, DHCP 서버로부터 정상 IP를 임대받지 못했습니다.');
      if (other === 'yes') {
        score += 14;
        ev.push('다른 기기에서도 동일 증상이 발생해 공유기/사내 DHCP 서버 응답 중단 또는 IP 주소 풀 고갈이 의심됩니다.');
      } else if (other === 'no') {
        score += 10;
        ev.push('현재 PC에서만 발생해 단말 DHCP 클라이언트 상태 또는 특정 포트 VLAN/케이블 통신 이상 가능성이 높습니다.');
      }
    } else if (apipa === 'unknown' && link !== 'no') {
      score += 26;
      ev.push('ipconfig /all의 IPv4 주소(APIPA 여부)가 미확인 상태입니다.');
    }

    const isMultiDevice = other === 'yes';
    rules.push({
      id: 'ni-dhcp-apipa',
      ruleId: 'RULE-NI-02',
      title: isMultiDevice
        ? '공유기·사내 DHCP 서버 응답 장애 또는 IP 풀 고갈'
        : '단말 DHCP IP 임대 실패 (APIPA 169.254.x.x 자동 할당)',
      score: clampScore(score),
      explanation: isMultiDevice
        ? '여러 기기가 정상 IP를 부여받지 못하는 상태로, 공유기 또는 사내 DHCP 서버가 응답하지 않거나 할당 가능한 IP 대역이 소진되었을 가능성이 높습니다.'
        : '네트워크 링크는 연결되어 있으나 DHCP 서버와 정상 협상하지 못해 Windows가 자체 링크-로컬 주소(169.254.x.x)를 임시 할당한 상태입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'IPv4 주소 및 DHCP 서버 항목 확인',
          instruction:
            'ipconfig /all 출력에서 "DHCP 사용: 예", "자동 구성 IPv4 주소(169.254.x.x)", "기본 게이트웨이" 비어 있음 여부를 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '정상 IP 재할당 후 게이트웨이 ping 검증',
          instruction:
            '네트워크 재연결 후 정상 사설 IP가 할당되면 ping -n 4 <기본 게이트웨이>로 내부 통신을 확인합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: isMultiDevice
        ? [
            '공유기/사내 DHCP 서버의 IP 임대 현황과 장비 상태를 확인합니다. 사내 네트워크인 경우 네트워크 관리자에게 DHCP 풀 고갈 여부를 문의합니다.',
            '가정·소규모 환경에서는 공유기 재시작 후 단말들이 정상 IPv4 주소를 재할당받는지 ipconfig /all로 확인합니다.',
          ]
        : [
            'Wi-Fi 연결을 해제했다가 재연결하거나, 유선 LAN 케이블을 다른 정상 포트에 꽂아 IP 재임대를 유도합니다.',
            'Windows 네트워크 어댑터 속성에서 의도치 않게 잘못된 고정 IP가 입력되어 있지 않고 자동 IP(DHCP)로 설정되어 있는지 확인합니다.',
            'PC 재시작 후 ipconfig /all로 정상 IPv4 및 기본 게이트웨이가 할당되었는지 재확인합니다.',
          ],
    });
  }

  // RULE-NI-03: 기본 게이트웨이 미응답
  {
    let score = 0;
    const ev: string[] = [];
    if (gw === 'no') {
      score += 76;
      ev.push('기본 게이트웨이 주소로 ping 응답이 없어 단말과 내부 라우터/공유기 구간 통신이 차단된 상태입니다.');
      if (apipa === 'no') {
        score += 8;
        ev.push('IPv4 주소 자체는 할당되어 있으나 게이트웨이 도달에 실패했습니다.');
      }
      if (other === 'yes') {
        score += 10;
        ev.push('다수 기기가 동일하게 연결 불가하므로 공유기·게이트웨이 장비 멈춤(Hang) 또는 내부 스위치 장애가 유력합니다.');
      } else if (other === 'no') {
        score += 6;
        ev.push('단일 PC 증상이므로 IP 충돌, 잘못된 정적 IP/서브넷 설정 또는 케이블/포트 구간 이상이 의심됩니다.');
      }
    } else if (gw === 'unknown' && apipa !== 'yes' && link !== 'no') {
      score += 24;
      ev.push('기본 게이트웨이 ping 응답 여부가 아직 확인되지 않았습니다.');
    }

    const isMultiDevice = other === 'yes';
    rules.push({
      id: 'ni-gateway-unreachable',
      ruleId: 'RULE-NI-03',
      title: isMultiDevice
        ? '공유기·기본 게이트웨이 장비 응답 중단'
        : '단말–게이트웨이 내부 구간 통신 장애 (IP 충돌·잘못된 네트워크 설정 의심)',
      score: clampScore(score),
      explanation: isMultiDevice
        ? '내부 네트워크의 출구 역할을 하는 공유기 또는 게이트웨이 장비가 응답하지 않아 전체 단말의 외부 통신이 중단된 상태입니다.'
        : 'IP는 부여되어 있으나 기본 게이트웨이까지 패킷이 도달하지 못합니다. 정적 IP 충돌, 잘못된 게이트웨이/서브넷 설정 또는 포트 연결 이상을 점검해야 합니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '기본 게이트웨이 및 서브넷 마스크 재확인',
          instruction:
            'ipconfig /all에서 IPv4 주소, 서브넷 마스크, 기본 게이트웨이 주소가 같은 대역인지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '기본 게이트웨이 연속 응답 점검',
          instruction: 'ping -n 4 <기본 게이트웨이 IP>를 실행해 응답 여부를 재검증합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: isMultiDevice
        ? [
            '공유기·게이트웨이 장비의 발열, 전원 어댑터 체결, 상태 LED를 점검합니다.',
            '가정·소규모 환경에서는 공유기를 재부팅하고, 사내 네트워크에서는 담당 관리자에게 게이트웨이 장비 상태 확인을 요청합니다.',
          ]
        : [
            '수동(정적) IP 설정을 사용 중이라면 동일 IP를 쓰는 다른 기기와 충돌하지 않는지 확인하고, 정책상 허용된다면 자동 IP(DHCP) 설정을 사용합니다.',
            '다른 LAN 포트나 예비 케이블(또는 Wi-Fi ↔ 유선 전환)로 교차 연결해 게이트웨이 ping 응답 변화를 확인합니다.',
            '사내 보안 정책(MAC 인증/포트 보안 등)이 적용된 자리라면 IT 지원팀에 포트 상태를 문의합니다.',
          ],
    });
  }

  // RULE-NI-04: 상위 ISP 회선 또는 라우터 WAN 구간 장애
  {
    let score = 0;
    const ev: string[] = [];
    if (ext === 'no') {
      score += 76;
      ev.push('외부 공용 IP(8.8.8.8)로의 ping이 모두 실패해 외부 인터넷 회선 도달이 차단되어 있습니다.');
      if (gw === 'yes') {
        score += 14;
        ev.push('내부 기본 게이트웨이 응답은 정상이므로 공유기 WAN 포트 이후 또는 ISP 상위 회선 장애가 매우 유력합니다.');
      }
    } else if (ext === 'unknown' && gw === 'yes') {
      score += 34;
      ev.push('게이트웨이는 정상이나 외부 IP 응답 여부를 확인하지 않아 상위 회선 장애 가능성이 남아 있습니다.');
    } else if (link === 'no' && other === 'yes') {
      score += 34;
      ev.push('다수 기기가 동시 단절되어 상위 회선 또는 공용 장비 동시 장애 가능성을 보조적으로 고려해야 합니다.');
    }

    rules.push({
      id: 'ni-isp-wan-outage',
      ruleId: 'RULE-NI-04',
      title: '상위 ISP 회선 또는 라우터 WAN 구간 장애',
      score: clampScore(score),
      explanation:
        'PC에서 내부 공유기(게이트웨이)까지는 정상 통신되지만 외부 인터넷 IP로 나가지 못하는 상태입니다. 모뎀–공유기 간 WAN 케이블, ISP 회선 장애, 또는 상위 라우팅 문제가 주요 원인입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '외부 IP 경로 추적(tracert)',
          instruction: 'tracert -d 8.8.8.8을 실행해 어느 홉(내부 게이트웨이 직후 vs ISP 구간)에서 중단되는지 확인합니다.',
          commandId: 'tracert',
        },
        {
          title: '외부 공용 IP 재점검',
          instruction: 'ping -n 4 8.8.8.8 및 ping -n 4 1.1.1.1로 특정 외부 IP 문제가 아닌 전체 외부 차단인지 확인합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: [
        '모뎀(광단말기/ONT)과 공유기의 WAN/인터넷 상태 LED(적색 점등 또는 소등 여부)를 확인합니다.',
        '가정·소규모 환경에서는 모뎀과 공유기 간 WAN 케이블 체결을 확인하고 모뎀 → 공유기 순서로 안전하게 재시작합니다.',
        '사내 환경이거나 재시작 후에도 동일하다면 tracert 결과와 장애 발생 시각을 정리해 IT 관리자 또는 통신사(ISP) 장애 센터에 회선 점검을 요청합니다.',
      ],
    });
  }

  // RULE-NI-05: 외부 IP 정상 — DNS·프록시·브라우저 계층 이상
  {
    let score = 0;
    const ev: string[] = [];
    if (ext === 'yes') {
      score += 82;
      ev.push('외부 공용 IP(8.8.8.8)로 정상 응답이 수신되어 물리 회선과 인터넷 라우팅 자체는 정상입니다.');
      if (gw === 'yes') {
        score += 8;
        ev.push('게이트웨이 및 외부 IP 통신이 모두 정상이므로 웹 접속 불가 원인이 DNS 이름 해석, 프록시 설정 또는 브라우저 계층에 국한됩니다.');
      }
    } else if (ext === 'unknown' && gw === 'yes') {
      score += 30;
      ev.push('게이트웨이는 정상이나 외부 IP 테스트 결과가 없어 DNS/프록시 문제 가능성도 함께 점검해야 합니다.');
    }

    rules.push({
      id: 'ni-dns-proxy-layer',
      ruleId: 'RULE-NI-05',
      title: 'DNS 이름 해석 오류 또는 브라우저·프록시 설정 이상 (회선 정상)',
      score: clampScore(score),
      explanation:
        '외부 IP 통신은 정상이므로 인터넷 회선 단절이 아닙니다. 도메인을 IP로 변환하는 DNS 설정 오류나 잘못된 Windows/브라우저 프록시 구성으로 웹 페이지가 열리지 않을 가능성이 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'DNS 이름 해석 점검(nslookup)',
          instruction: 'nslookup example.com과 nslookup example.com 8.8.8.8을 실행해 DNS 응답 여부를 비교합니다.',
          commandId: 'nslookup',
        },
        {
          title: '할당된 DNS 서버 주소 확인',
          instruction: 'ipconfig /all에서 현재 설정된 DNS 서버 주소가 정상적인지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: 'HTTPS 포트 도달성 점검',
          instruction: 'Test-NetConnection -ComputerName example.com -Port 443으로 웹 포트 연결 여부를 확인합니다.',
          commandId: 'test-netconnection',
        },
      ],
      safeResolutions: [
        'NetDoctor의 "DNS 오류" 진단 유형으로 추가 점검을 진행해 기본 DNS 서버 장애 여부를 세밀히 확인합니다.',
        'Windows 설정 > 네트워크 및 인터넷 > 프록시에서 사용하지 않는 수동 프록시 서버가 켜져 있지 않은지 확인합니다.',
        '다른 브라우저나 시크릿 모드에서 접속을 비교해 브라우저 확장 프로그램·캐시 영향 여부를 분리합니다.',
      ],
    });
  }

  return rules;
}

function evaluateVpnFailure(answerMap: Map<string, DiagnosticAnswer>): InternalRuleCandidate[] {
  const base = getAnswerValue(answerMap, 'vpn_base_internet');
  const otherNet = getAnswerValue(answerMap, 'vpn_other_network');
  const stage = getAnswerValue(answerMap, 'vpn_error_stage');
  const port = getAnswerValue(answerMap, 'vpn_port_check');

  const rules: InternalRuleCandidate[] = [];

  // RULE-VPN-01: 기반 인터넷 연결 장애
  {
    let score = 0;
    const ev: string[] = [];
    if (base === 'no') {
      score += 92;
      ev.push('VPN을 끈 상태에서도 일반 인터넷 접속이 불가하여 VPN 이전 단계인 기반 회선 복구가 최우선입니다.');
    } else if (base === 'unknown') {
      score += 32;
      ev.push('VPN 해제 상태에서의 일반 인터넷 정상 여부가 미확인 상태입니다.');
    }

    rules.push({
      id: 'vpn-base-internet-down',
      ruleId: 'RULE-VPN-01',
      title: '기반 인터넷 연결 장애로 인한 VPN 터널 수립 불가',
      score: clampScore(score),
      explanation:
        'VPN은 정상적인 외부 인터넷 연결을 기반으로 암호화 터널을 구성합니다. 현재 일반 인터넷 연결이 확보되지 않아 VPN 접속 자체가 시작될 수 없는 상태입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'IP 할당 및 기본 게이트웨이 확인',
          instruction: 'ipconfig /all로 현재 PC의 IPv4 주소와 기본 게이트웨이가 정상 할당되었는지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '외부 IP 통신 여부 점검',
          instruction: 'ping -n 4 8.8.8.8을 실행해 일반 인터넷 연결 복구 여부를 확인합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: [
        'VPN 클라이언트를 완전히 종료한 뒤 NetDoctor의 "인터넷 연결 불가" 진단을 먼저 수행해 기반 회선을 복구합니다.',
        '일반 웹 접속이 정상화된 이후에 VPN 연결을 다시 시도합니다.',
      ],
    });
  }

  // RULE-VPN-02: 인증·계정 정책·시간 동기화 또는 VPN 서버 측 장애
  {
    let score = 0;
    const ev: string[] = [];
    if (otherNet === 'yes') {
      score += 46;
      ev.push('다른 네트워크(핫스팟 등)에서도 동일하게 실패해 로컬 공유기·회선보다 계정/인증 또는 VPN 서버 측 문제 가능성이 높습니다.');
      if (stage === 'yes') {
        score += 42;
        ev.push('로그인·OTP·인증서 검증 단계에서 오류가 발생해 계정 상태, 인증서 만료, 또는 시스템 시간 동기화 이상이 유력합니다.');
      } else if (stage === 'no') {
        score += 32;
        ev.push('인증 이전 서버 연결/터널 단계에서 타 네트워크 포함 공통 실패하므로 VPN 게이트웨이 서버 상태 또는 클라이언트 버전 불일치 가능성이 높습니다.');
      } else if (stage === 'unknown') {
        score += 10;
        ev.push('실패 단계가 미확인 상태여서 인증 오류인지 서버 응답 오류인지 추가 확인이 필요합니다.');
      }
    } else if (otherNet === 'unknown' && stage === 'yes') {
      score += 66;
      ev.push('로그인·인증 단계 실패가 확인되어 계정·OTP·인증서 또는 시간 동기화 점검이 우선 필요합니다.');
      if (port === 'no') {
        score += 14;
        ev.push('VPN 서버 포트 도달은 정상이므로 네트워크 차단보다 인증·정책 문제 가능성이 크게 높아졌습니다.');
      }
    }

    const isAuthStage = stage === 'yes';
    rules.push({
      id: 'vpn-auth-or-server',
      ruleId: 'RULE-VPN-02',
      title: isAuthStage
        ? 'VPN 계정 인증·OTP·인증서 만료 또는 시스템 시간 동기화 오류'
        : 'VPN 서버·게이트웨이 장애 또는 클라이언트 프로파일 불일치',
      score: clampScore(score),
      explanation: isAuthStage
        ? '네트워크 환경과 무관하게 인증 단계에서 실패하고 있습니다. 계정 잠금/권한 만료, OTP 시간 오차, 클라이언트 인증서 갱신 필요, 또는 PC 시스템 시각 불일치가 흔한 원인입니다.'
        : '서로 다른 네트워크에서도 동일하게 VPN 수립이 실패하고 있어 사내 VPN 게이트웨이 점검 중이거나 클라이언트 버전·접속 프로파일이 최신 정책과 맞지 않을 수 있습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'VPN 서버 주소 이름 해석 확인',
          instruction: 'nslookup <VPN 서버 도메인>을 실행해 접속 대상 주소가 정상 IP로 해석되는지 확인합니다.',
          commandId: 'nslookup',
        },
        {
          title: 'VPN 대상 포트 도달성 확인',
          instruction: 'Test-NetConnection -ComputerName <VPN 서버 주소> -Port <포트>로 서버 응답 여부를 확인합니다.',
          commandId: 'test-netconnection',
        },
      ],
      safeResolutions: isAuthStage
        ? [
            'Windows 설정 > 시간 및 언어 > 날짜 및 시간에서 "자동으로 시간 설정" 및 "지금 동기화"를 실행해 OTP/인증서 시간 오차를 방지합니다.',
            '사내 계정 잠금 여부, 비밀번호 만료 여부, VPN 클라이언트 인증서 유효 기간을 사내 공식 포털 또는 IT 헬프데스크를 통해 확인합니다. (비밀번호·OTP 값은 외부 도구에 기록하지 마세요.)',
            'VPN 클라이언트를 공식 배포 최신 버전으로 유지하고, 저장된 접속 주소/프로파일에 오타가 없는지 점검합니다.',
          ]
        : [
            '사내 공지 또는 IT 헬프데스크를 통해 VPN 게이트웨이 점검·장애 공지가 있는지 확인합니다.',
            'VPN 클라이언트를 완전히 종료 후 재실행하고, 공식 배포된 최신 클라이언트 버전과 설정 프로파일을 사용 중인지 확인합니다.',
            '오류 코드와 발생 시각, Test-NetConnection 결과를 정리해 사내 IT 지원팀에 전달합니다.',
          ],
    });
  }

  // RULE-VPN-03: 현재 네트워크·공유기 VPN 포트 또는 경로 제한
  {
    let score = 0;
    const ev: string[] = [];
    if (otherNet === 'no') {
      score += 48;
      ev.push('다른 네트워크에서는 VPN이 정상 연결되어 현재 사용 중인 로컬 네트워크·공유기 환경에 원인이 국한됩니다.');
      if (port === 'yes') {
        score += 42;
        ev.push('Test-NetConnection 포트 도달 점검에서도 실패하여 현재 네트워크 구간의 VPN 포트 또는 프로토콜 제한이 매우 유력합니다.');
      } else if (port === 'no') {
        score += 26;
        ev.push('대상 TCP 포트는 도달하지만 현재 네트워크에서만 실패하므로 공유기 VPN Passthrough, NAT 경합 또는 MTU/UDP 구간 간섭 가능성이 높습니다.');
      } else if (port === 'unknown') {
        score += 10;
        ev.push('포트 도달 점검 결과가 미확인이므로 Test-NetConnection 실행이 필요합니다.');
      }
    } else if (otherNet === 'unknown' && port === 'yes') {
      score += 66;
      ev.push('Test-NetConnection에서 VPN 서버 포트 도달 실패가 확인되어 경로 또는 포트 제한 가능성이 높습니다.');
      if (stage === 'no') {
        score += 14;
        ev.push('인증 화면 이전 연결 단계 실패와 포트 도달 실패가 일치합니다.');
      }
    }

    rules.push({
      id: 'vpn-network-port-restriction',
      ruleId: 'RULE-VPN-03',
      title: '현재 네트워크·공유기의 VPN 포트 또는 프로토콜 경로 제한',
      score: clampScore(score),
      explanation:
        '현재 접속한 공유기·공공 Wi-Fi·방문지 네트워크에서 VPN이 사용하는 특정 포트(예: TCP 443, UDP 500/4500/1194 등)나 터널링 프로토콜 통과가 제한되거나 NAT 경합이 발생하고 있을 가능성이 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'VPN 서버 포트 TCP 도달성 재확인',
          instruction:
            'PowerShell에서 Test-NetConnection -ComputerName <VPN 서버 주소> -Port <포트>를 실행해 TcpTestSucceeded 값을 기록합니다.',
          commandId: 'test-netconnection',
        },
        {
          title: 'VPN 서버까지 경로 추적(tracert)',
          instruction: 'tracert <VPN 서버 주소>로 어느 구간 이후 응답이 중단되는지 확인합니다.',
          commandId: 'tracert',
        },
        {
          title: 'VPN 서버 도메인 DNS 해석 점검',
          instruction: 'nslookup <VPN 서버 주소>로 현재 네트워크 DNS가 정상 주소를 반환하는지 확인합니다.',
          commandId: 'nslookup',
        },
      ],
      safeResolutions: [
        '공공 Wi-Fi, 카페, 호텔 등 제한이 많은 네트워크라면 보안이 확보된 유선 회선이나 승인된 모바일 핫스팟으로 전환해 사용합니다.',
        '가정용 공유기 환경이라면 공유기 설정에서 VPN Passthrough(IPsec/L2TP/PPTP) 지원 여부를 확인하거나 공식 펌웨어를 최신 상태로 유지합니다. (기존 보안 정책과 보호 설정은 그대로 유지합니다.)',
        'VPN 클라이언트가 TCP 443 기반 SSL VPN 등 대체 공식 접속 프로파일을 제공한다면 IT 관리자가 안내한 공식 프로파일로 전환해 시도합니다.',
      ],
    });
  }

  // RULE-VPN-04: 보조 후보 — 클라이언트 설정·로컬 DNS/어댑터 충돌
  {
    let score = 0;
    const ev: string[] = [];
    if (base === 'yes' && otherNet === 'yes' && stage === 'no') {
      score += 38;
      ev.push('기반 인터넷은 정상이며 인증 이전 단계 실패이므로 로컬 VPN 가상 어댑터 또는 클라이언트 프로파일 손상 가능성을 보조적으로 검토할 수 있습니다.');
    } else if (base === 'yes' && otherNet === 'no' && port === 'no') {
      score += 42;
      ev.push('포트 도달은 성공하나 현재 네트워크에서만 실패해 로컬 IP 대역과 사내 VPN 대역 충돌 가능성을 함께 확인해야 합니다.');
    } else if (base === 'unknown' && otherNet === 'unknown') {
      score += 24;
      ev.push('입력된 확인 정보가 부족해 VPN 클라이언트 설정 오류 가능성을 배제할 수 없습니다.');
    }

    rules.push({
      id: 'vpn-client-config-conflict',
      ruleId: 'RULE-VPN-04',
      title: 'VPN 가상 어댑터 오류 또는 사설 IP 대역 충돌',
      score: clampScore(score),
      explanation:
        '로컬 공유기의 사설 IP 대역(예: 192.168.0.x)이 사내 VPN 내부 대역과 겹치거나, VPN 클라이언트의 가상 네트워크 어댑터가 일시적 오류 상태일 때 연결이 중단될 수 있습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '로컬 IP 대역 및 가상 어댑터 확인',
          instruction: 'ipconfig /all에서 현재 로컬 IP 대역과 VPN 가상 어댑터 항목을 확인합니다.',
          commandId: 'ipconfig',
        },
      ],
      safeResolutions: [
        'PC를 재시작해 VPN 가상 네트워크 어댑터 상태를 초기화한 뒤 다시 연결을 시도합니다.',
        '사내 VPN 내부 대역과 가정 공유기 IP 대역이 중복되는지 IT 관리자에게 확인해 안내를 받습니다.',
      ],
    });
  }

  return rules;
}

function evaluateDnsError(answerMap: Map<string, DiagnosticAnswer>): InternalRuleCandidate[] {
  const ipOk = getAnswerValue(answerMap, 'dns_ip_ok');
  const allDomains = getAnswerValue(answerMap, 'dns_all_domains');
  const altServer = getAnswerValue(answerMap, 'dns_alt_server');
  const cacheHosts = getAnswerValue(answerMap, 'dns_cache_or_hosts');

  const rules: InternalRuleCandidate[] = [];

  // RULE-DNS-01: 상위 인터넷/게이트웨이 연결 장애
  {
    let score = 0;
    const ev: string[] = [];
    if (ipOk === 'no') {
      score += 90;
      ev.push('외부 IP(8.8.8.8) ping이 실패해 단순 DNS 문제가 아닌 상위 인터넷/게이트웨이 연결 장애가 우선 의심됩니다.');
    } else if (ipOk === 'unknown') {
      score += 30;
      ev.push('외부 IP 통신 성공 여부가 미확인되어 상위 회선 장애 가능성을 먼저 배제해야 합니다.');
    }

    rules.push({
      id: 'dns-upstream-down',
      ruleId: 'RULE-DNS-01',
      title: '단순 DNS 오류가 아닌 상위 인터넷·게이트웨이 연결 장애',
      score: clampScore(score),
      explanation:
        '도메인 이름 해석 이전에 외부 IP 자체와 통신되지 않는 상태입니다. 브라우저가 "DNS 주소를 찾을 수 없음"으로 표시하더라도 실제 원인은 인터넷 회선·공유기 단절일 가능성이 매우 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'IP 구성 및 게이트웨이 확인',
          instruction: 'ipconfig /all로 정상 IPv4 및 기본 게이트웨이가 할당되었는지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '기본 게이트웨이 및 외부 IP 순차 ping',
          instruction: 'ping -n 4 <기본 게이트웨이> 후 ping -n 4 8.8.8.8 순서로 단절 지점을 파악합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: [
        'NetDoctor의 "인터넷 연결 불가" 진단 유형으로 전환해 물리 링크, IP 할당, 게이트웨이, 외부 회선을 단계별로 점검합니다.',
        '상위 인터넷 회선이 정상화된 뒤에도 도메인 해석이 실패할 때 DNS 점검을 이어갑니다.',
      ],
    });
  }

  // RULE-DNS-02: 기본 DNS 리졸버 응답 장애
  {
    let score = 0;
    const ev: string[] = [];
    if (altServer === 'yes') {
      score += 50;
      ev.push('대체 공용 DNS 서버를 지정한 nslookup 조회는 정상 응답하여, 현재 기본 설정된 DNS 리졸버 자체의 장애가 매우 유력합니다.');
      if (allDomains === 'yes') {
        score += 26;
        ev.push('대부분의 도메인 조회가 공통으로 실패하는 패턴이 기본 DNS 서버 장애와 일치합니다.');
      } else if (allDomains === 'unknown') {
        score += 14;
      }
      if (ipOk === 'yes') {
        score += 14;
        ev.push('외부 IP 통신이 정상 유지되어 DNS 서버 응답 구간으로 원인이 명확히 좁혀졌습니다.');
      }
    } else if (altServer === 'no') {
      score += 22;
      ev.push('대체 공용 DNS 지정 조회도 실패하여 단순 기본 DNS 서버만의 문제일 가능성은 상대적으로 낮습니다.');
    } else if (allDomains === 'yes' && altServer === 'unknown') {
      score += 42;
      ev.push('대부분의 도메인이 실패하므로 기본 DNS 서버 장애 가능성이 높으나 대체 DNS 지정 테스트가 필요합니다.');
    }

    rules.push({
      id: 'dns-default-resolver-failure',
      ruleId: 'RULE-DNS-02',
      title: '기본 설정된 DNS 리졸버(ISP·공유기·사내 DNS) 응답 장애',
      score: clampScore(score),
      explanation:
        '외부 공용 DNS로 직접 질의하면 정상 응답하지만 기본 DNS 서버가 도메인 해석에 실패하고 있습니다. 공유기 DNS 프록시 오류, ISP DNS 일시 장애, 또는 잘못 수동 입력된 DNS IP가 주요 원인입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '현재 설정된 DNS 서버 주소 확인',
          instruction: 'ipconfig /all 출력의 "DNS 서버" 항목에 유효하지 않거나 오래된 주소가 설정되어 있는지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '기본 DNS vs 공용 DNS 비교 기록',
          instruction: 'nslookup example.com과 nslookup example.com 8.8.8.8 결과를 비교해 기록합니다.',
          commandId: 'nslookup',
        },
      ],
      safeResolutions: [
        'Windows 네트워크 어댑터의 IPv4 DNS 설정이 잘못된 수동 주소로 고정되어 있지 않은지 확인하고, 사내 정책에 위배되지 않는 범위에서 자동 DNS(DHCP) 또는 승인된 공용/사내 DNS를 사용합니다.',
        '가정·소규모 공유기 환경이라면 공유기를 안전하게 재시작해 공유기 내장 DNS 중계 기능을 정상화합니다.',
        '사내 전용 도메인(인트라넷)이 포함된 환경이라면 사내 IT 팀에 내부 DNS 서버 상태를 확인 요청합니다.',
      ],
    });
  }

  // RULE-DNS-03: DNS 질의 경로 차단 또는 로컬 DNS 클라이언트 이상
  {
    let score = 0;
    const ev: string[] = [];
    if (altServer === 'no') {
      score += 50;
      ev.push('다른 공용 DNS 서버를 직접 지정해 조회해도 실패하여 DNS 질의 경로(포트 53) 제한 또는 로컬 DNS 클라이언트 이상이 유력합니다.');
      if (allDomains === 'yes') {
        score += 26;
        ev.push('대부분의 도메인 조회가 실패해 광범위한 DNS 통신 차단/장애 패턴을 보입니다.');
      } else if (allDomains === 'unknown') {
        score += 12;
      }
      if (ipOk === 'yes') {
        score += 12;
        ev.push('외부 IP ping은 정상이므로 IP 회선이 아닌 DNS 질의 계층·포트 정책 구간에 원인이 집중됩니다.');
      }
    } else if (altServer === 'yes') {
      score += 20;
    } else if (allDomains === 'yes' && altServer === 'unknown') {
      score += 38;
      ev.push('전체 도메인 실패이나 대체 DNS 조회 결과가 미확인되어 DNS 경로 제한 가능성도 함께 점검해야 합니다.');
    }

    rules.push({
      id: 'dns-path-or-client',
      ruleId: 'RULE-DNS-03',
      title: 'DNS 질의 경로(포트 53) 정책 제한 또는 로컬 DNS 클라이언트 이상',
      score: clampScore(score),
      explanation:
        '외부 IP 통신은 가능하지만 어떤 DNS 서버로 질의해도 실패하는 상태입니다. 사내망의 외부 DNS 직접 질의 제한 정책(내부 DNS만 허용), VPN 잔류 DNS 설정, 또는 로컬 DNS 클라이언트 서비스 이상을 점검해야 합니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'DNS 서버 목록 및 VPN 잔류 어댑터 확인',
          instruction: 'ipconfig /all에서 비정상 DNS 주소나 연결 해제 후 남은 VPN 가상 어댑터 DNS 설정을 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: 'DNS 서버 포트 도달성 점검',
          instruction: 'Test-NetConnection -ComputerName 8.8.8.8 -Port 53으로 TCP 53 도달 여부를 안전하게 확인합니다.',
          commandId: 'test-netconnection',
        },
      ],
      safeResolutions: [
        '사내망에서는 보안 정책상 외부 공용 DNS(8.8.8.8 등) 직접 질의를 차단하고 사내 DNS 서버만 허용하는 경우가 많으므로, IT 관리자가 안내한 사내 DNS 설정을 사용합니다.',
        'VPN 클라이언트를 사용했다면 정상 종료 또는 재연결 후 PC를 재시작해 로컬 DNS 클라이언트 상태를 초기화합니다.',
        '기존 보안 정책을 유지한 상태에서 nslookup 및 Test-NetConnection 결과를 IT 지원팀에 전달해 허용된 DNS 서버와 포트 정책을 확인합니다.',
      ],
    });
  }

  // RULE-DNS-04: 특정 도메인 대상 로컬 캐시·hosts 또는 대상 도메인 레코드 문제
  {
    let score = 0;
    const ev: string[] = [];
    if (allDomains === 'no') {
      score += 42;
      ev.push('대부분의 사이트는 정상이고 특정 도메인만 실패해 전체 DNS 서버 장애보다 개별 도메인 영역의 문제입니다.');
      if (ipOk === 'yes') {
        score += 10;
      }
      if (cacheHosts === 'yes') {
        score += 38;
        ev.push('다른 기기에서는 해당 도메인에 정상 접속되므로 현재 PC의 로컬 DNS 캐시, hosts 파일 또는 브라우저 보안 DNS(DoH) 설정 이상이 유력합니다.');
      } else if (cacheHosts === 'no') {
        score += 34;
        ev.push('다른 기기에서도 동일하게 실패해 해당 도메인의 네임서버 레코드 오류, DNS 전파 지연 또는 사내 분할 DNS 설정 문제가 유력합니다.');
      } else if (cacheHosts === 'unknown') {
        score += 6;
        ev.push('타 기기 비교 결과가 미확인되어 로컬 PC 캐시 문제인지 대상 도메인 자체 문제인지 추가 확인이 필요합니다.');
      }
    }

    const isLocalOnly = cacheHosts === 'yes';
    rules.push({
      id: 'dns-specific-domain-cache-hosts',
      ruleId: 'RULE-DNS-04',
      title: isLocalOnly
        ? '특정 도메인 대상 로컬 DNS 캐시·hosts 또는 브라우저 DNS 설정 이상'
        : '특정 도메인 DNS 레코드 오류·전파 지연 또는 사내 전용 도메인 설정 문제',
      score: clampScore(score),
      explanation: isLocalOnly
        ? '동일 네트워크의 다른 기기에서는 정상 해석되므로 현재 PC 내부의 오래된 DNS 캐시, 수동 수정된 hosts 항목 또는 브라우저별 별도 DNS(DoH) 설정이 원인일 가능성이 높습니다.'
        : '특정 도메인만 다수 기기에서 해석 실패하는 경우, 해당 도메인 자체의 DNS 레코드 만료/오류이거나 사내 전용 도메인(VPN 필요)일 가능성이 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '문제 도메인 nslookup 상세 조회',
          instruction: 'nslookup <문제 도메인>을 실행해 NXDOMAIN, SERVFAIL, 시간 초과 중 어떤 응답이 나오는지 확인합니다.',
          commandId: 'nslookup',
        },
        {
          title: '현재 DNS 서버 및 검색 접미사 확인',
          instruction: 'ipconfig /all에서 연결별 DNS 접미사 및 DNS 서버 목록을 점검합니다.',
          commandId: 'ipconfig',
        },
      ],
      safeResolutions: isLocalOnly
        ? [
            '다른 브라우저 또는 시크릿 창에서 접속을 비교하고, 브라우저 설정의 보안 DNS(DoH) 옵션이 사내 도메인 해석과 충돌하지 않는지 확인합니다.',
            'PC 재시작 또는 관리 안내에 따른 안전한 DNS 캐시 갱신으로 오래된 캐시 레코드를 정리합니다.',
            '개발·테스트 목적으로 과거에 hosts 파일에 수동 등록한 도메인 항목이 남아 있는지 읽기 전용으로 확인하고, 필요 시 백업 후 정리합니다.',
          ]
        : [
            '해당 도메인 주소에 오타가 없는지, 그리고 사내 VPN 연결이 필수인 내부 전용 도메인인지 확인합니다.',
            '최근 도메인 이전이나 서버 IP 변경이 있었다면 DNS 전파 지연을 고려해 담당 서비스/인프라 운영팀에 A/CNAME 레코드 상태를 문의합니다.',
          ],
    });
  }

  return rules;
}

function evaluateSlowNetwork(answerMap: Map<string, DiagnosticAnswer>): InternalRuleCandidate[] {
  const wifi = getAnswerValue(answerMap, 'slow_wifi');
  const wiredCompare = getAnswerValue(answerMap, 'slow_wired_compare');
  const otherDevices = getAnswerValue(answerMap, 'slow_other_devices');
  const gwLatency = getAnswerValue(answerMap, 'slow_gateway_latency');
  const specific = getAnswerValue(answerMap, 'slow_specific_service');

  const rules: InternalRuleCandidate[] = [];

  // RULE-SLOW-01: 로컬 Wi-Fi 간섭·신호 약화 또는 내부 LAN 구간 혼잡
  {
    let score = 0;
    const ev: string[] = [];
    if (wifi === 'yes' && wiredCompare === 'no') {
      score += 76;
      ev.push('유선 LAN 연결 또는 공유기 근접 위치에서 속도가 회복되어 Wi-Fi 무선 구간(신호 약화·채널 간섭)이 주원인입니다.');
      if (gwLatency === 'yes') {
        score += 16;
        ev.push('기본 게이트웨이 ping에서도 지연·손실이 확인되어 로컬 무선 구간 품질 저하가 뚜렷합니다.');
      } else if (gwLatency === 'no') {
        score += 6;
      }
    } else if (gwLatency === 'yes') {
      score += 58;
      ev.push('기본 게이트웨이 ping 단계부터 지연 또는 손실이 관찰되어 외부 회선 이전의 로컬 LAN/Wi-Fi/공유기 구간 병목이 의심됩니다.');
      if (wifi === 'yes' || otherDevices === 'no') {
        score += 20;
        ev.push('현재 단말의 무선 간섭 또는 로컬 링크 품질 저하 가능성이 높습니다.');
      } else if (otherDevices === 'yes') {
        score += 14;
        ev.push('다른 기기도 동일하게 느려 내부 공유기·스위치 과부하 가능성을 함께 고려해야 합니다.');
      }
    } else if (wifi === 'yes' && wiredCompare === 'unknown') {
      score += 34;
      ev.push('Wi-Fi 사용 중이나 유선/근접 비교 테스트가 미확인되어 무선 간섭 가능성을 배제할 수 없습니다.');
    }

    const isWifiFocus = wifi === 'yes';
    rules.push({
      id: 'slow-local-wifi-lan',
      ruleId: 'RULE-SLOW-01',
      title: isWifiFocus
        ? '로컬 Wi-Fi 신호 약화·채널 간섭 또는 무선 구간 혼잡'
        : '내부 LAN 구간 혼잡·공유기 과부하 또는 케이블 링크 품질 저하',
      score: clampScore(score),
      explanation: isWifiFocus
        ? '공유기와의 거리, 벽체·금속 장애물, 인접 Wi-Fi 채널 간섭 또는 혼잡한 2.4GHz 대역 사용으로 무선 전송 효율이 크게 저하된 상태입니다.'
        : '외부 인터넷으로 나가기 전 내부 게이트웨이 구간부터 지연이 발생하고 있어 공유기 리소스 포화, 내부 대용량 트래픽, 또는 케이블/스위치 품질 저하를 점검해야 합니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '기본 게이트웨이 연속 ping 지연 확인',
          instruction: 'ping -n 10 <기본 게이트웨이 IP>를 실행해 응답 시간 변동 및 손실 여부를 관찰합니다.',
          commandId: 'ping',
        },
        {
          title: '활성 어댑터 및 연결 정보 확인',
          instruction: 'ipconfig /all로 사용 중인 무선/유선 어댑터 구성 상태를 확인합니다.',
          commandId: 'ipconfig',
        },
      ],
      safeResolutions: isWifiFocus
        ? [
            '가능한 경우 5GHz(또는 6GHz) Wi-Fi 대역으로 전환하고, 공유기와의 거리 및 물리적 장애물을 줄입니다.',
            '화상회의·대용량 업무 시에는 유선 LAN(이더넷) 연결을 우선 사용해 무선 간섭 영향을 배제합니다.',
            '가정·소규모 환경에서는 공유기 주변 전파 간섭원(전자레인지, 블루투스 다중 장비 등)을 이격하고 혼잡이 적은 채널로 관리합니다.',
          ]
        : [
            '노후하거나 꺾인 LAN 케이블(예: Cat5 이하)을 정상 Cat5e/Cat6 케이블로 교체해 링크 속도 저하 여부를 확인합니다.',
            '동일 공유기에서 대용량 백업·클라우드 동기화·업데이트가 동시에 실행 중인지 확인하고 일시 조정합니다.',
            '가정·소규모 공유기라면 안전 재시작으로 세션 테이블 과부하를 해소하고, 사내망이면 IT 팀에 내부 스위치 상태를 문의합니다.',
          ],
    });
  }

  // RULE-SLOW-02: 특정 목적지 서버·경로 병목
  {
    let score = 0;
    const ev: string[] = [];
    if (specific === 'yes') {
      score += 72;
      ev.push('다른 사이트는 정상이고 특정 웹사이트·업무 서비스만 느려 대상 서버 과부하 또는 특정 외부 경로 병목이 유력합니다.');
      if (gwLatency === 'no') {
        score += 16;
        ev.push('내부 기본 게이트웨이 응답은 안정적이므로 로컬 네트워크보다 외부 구간·목적지 서버 원인이 명확합니다.');
      }
      if (wiredCompare === 'yes' || otherDevices === 'yes') {
        score += 6;
        ev.push('연결 방식이나 기기와 무관하게 해당 서비스에서 지연이 재현됩니다.');
      }
    } else if (specific === 'unknown' && gwLatency === 'no') {
      score += 34;
      ev.push('내부 게이트웨이는 안정적이나 특정 서비스 한정 지연 여부가 미확인 상태입니다.');
    }

    rules.push({
      id: 'slow-specific-route-server',
      ruleId: 'RULE-SLOW-02',
      title: '특정 목적지 서버 과부하 또는 외부 라우팅 경로 병목',
      score: clampScore(score),
      explanation:
        '로컬 네트워크와 일반 인터넷 서비스는 원활하지만 특정 업무 시스템이나 해외·외부 서버로 가는 라우팅 구간 또는 해당 서버 자체의 응답이 지연되고 있습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '대상 서비스 경로 추적(tracert)',
          instruction: 'tracert <느린 대상 도메인>을 실행해 지연이 급증하는 특정 홉 구간을 확인합니다.',
          commandId: 'tracert',
        },
        {
          title: '대상 서비스 포트 응답 점검',
          instruction: 'Test-NetConnection -ComputerName <대상 도메인> -Port 443으로 서비스 도달 상태를 확인합니다.',
          commandId: 'test-netconnection',
        },
      ],
      safeResolutions: [
        '해당 서비스의 공식 장애 공지나 상태 페이지를 확인해 서버 측 부하/점검 여부를 파악합니다.',
        'tracert 출력 결과와 지연 발생 시간대를 정리해 사내 서비스 담당자 또는 ISP 고객센터에 경로 품질 확인을 요청합니다.',
        '업무용 VPN을 경유 중이라면 해당 서비스가 VPN 우회/경유 정책상 우회 지연이 발생하는지 IT 지원팀에 확인합니다.',
      ],
    });
  }

  // RULE-SLOW-03: 공유 회선 대역폭 포화 또는 ISP 구간 혼잡
  {
    let score = 0;
    const ev: string[] = [];
    if (specific === 'no') {
      score += 54;
      ev.push('특정 사이트가 아니라 대부분의 외부 웹·업무 서비스가 전반적으로 느려 회선 전체 대역폭 포화 또는 ISP 혼잡 가능성이 높습니다.');
      if (otherDevices === 'yes' || wiredCompare === 'yes') {
        score += 26;
        ev.push('유선 연결 또는 같은 네트워크의 다른 기기에서도 동일하게 느려 단일 단말이 아닌 공유 회선/상위 구간 병목이 뒷받침됩니다.');
      }
      if (gwLatency === 'no') {
        score += 12;
        ev.push('내부 기본 게이트웨이는 안정적이므로 공유기 바깥(WAN/ISP) 구간 혼잡 가능성이 매우 높습니다.');
      }
    } else if (otherDevices === 'yes' && specific === 'unknown') {
      score += 38;
      ev.push('여러 기기에서 동시에 느린 증상이 나타나 공유 회선 포화 가능성이 높습니다.');
    }

    rules.push({
      id: 'slow-bandwidth-isp-congestion',
      ruleId: 'RULE-SLOW-03',
      title: '공유 회선 대역폭 포화 또는 상위 ISP 구간 혼잡',
      score: clampScore(score),
      explanation:
        '내부 공유기까지는 안정적이나 외부로 나가는 전체 회선 대역폭이 대용량 업로드/다운로드로 포화되었거나, 특정 시간대 ISP 백본 혼잡이 발생하고 있을 가능성이 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '외부 공용 주소 경로 추적',
          instruction: 'tracert -d 8.8.8.8을 실행해 ISP 첫 홉 이후 지연이 발생하는지 확인합니다.',
          commandId: 'tracert',
        },
        {
          title: '게이트웨이 vs 외부 IP 응답 비교',
          instruction: '기본 게이트웨이 ping과 외부 IP(8.8.8.8) ping 응답 안정성을 나란히 비교합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: [
        '같은 네트워크 내에서 진행 중인 대용량 파일 업로드, 클라우드 동기화(OneDrive/Google Drive 등), OS 대규모 업데이트가 있는지 확인하고 업무 시간 외로 일정을 분산합니다.',
        '가정·소규모 환경에서는 모뎀과 공유기 상태를 점검하고, 특정 시간대에 반복적으로 심한 저하가 이어진다면 ISP 고객센터에 회선 품질 점검을 요청합니다.',
        '사내망이라면 IT 관리자에게 회선 사용량 급증 여부 및 트래픽 병목 점검을 요청합니다.',
      ],
    });
  }

  // RULE-SLOW-04: 단말 PC 리소스·백그라운드 전송 또는 NIC 설정 병목
  {
    let score = 0;
    const ev: string[] = [];
    if (otherDevices === 'no' && specific === 'no' && gwLatency === 'no') {
      score += 84;
      ev.push('다른 기기는 정상이고 게이트웨이 응답도 안정적이나 현재 PC에서만 전체적으로 느려 단말 내부 리소스·백그라운드 전송 또는 NIC 설정 점검이 우선입니다.');
    } else if (otherDevices === 'no' && gwLatency !== 'yes') {
      score += 28;
      ev.push('현재 PC에서만 느린 패턴이 있어 단말 백그라운드 네트워크 점유 가능성을 함께 확인할 필요가 있습니다.');
    }

    rules.push({
      id: 'slow-endpoint-resource',
      ruleId: 'RULE-SLOW-04',
      title: '단말 PC 백그라운드 트래픽·리소스 점유 또는 NIC 링크 협상 저하',
      score: clampScore(score),
      explanation:
        '동일 네트워크의 다른 기기들은 정상 속도이므로 회선이나 공유기보다는 현재 PC 내부의 백그라운드 업데이트, 높은 CPU/메모리 점유, 또는 이더넷 어댑터 링크 속도 저속 협상 가능성이 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '네트워크 어댑터 구성 확인',
          instruction: 'ipconfig /all로 활성 어댑터 구성 및 불필요한 가상 어댑터 간섭 여부를 확인합니다.',
          commandId: 'ipconfig',
        },
      ],
      safeResolutions: [
        'Windows 작업 관리자(성능/프로세스 탭)에서 백그라운드 업데이트, 클라우드 동기화, 브라우저 탭이 네트워크·CPU를 과도하게 점유하고 있는지 확인합니다.',
        '유선 환경이라면 Windows 네트워크 상태 화면에서 링크 속도가 비정상적으로 낮게 협상되지 않았는지 확인하고 필요 시 케이블을 교체합니다.',
        '기존 PC 보안 설정은 그대로 유지한 상태에서 제조사 공식 네트워크 드라이버가 최신 안정 버전인지 확인합니다.',
      ],
    });
  }

  return rules;
}

function evaluateIntermittentDrop(
  answerMap: Map<string, DiagnosticAnswer>
): InternalRuleCandidate[] {
  const wifi = getAnswerValue(answerMap, 'drop_wifi');
  const signalRoam = getAnswerValue(answerMap, 'drop_signal_or_roam');
  const cablePhys = getAnswerValue(answerMap, 'drop_cable_physical');
  const allDevices = getAnswerValue(answerMap, 'drop_all_devices');
  const pingLoss = getAnswerValue(answerMap, 'drop_ping_loss');

  const rules: InternalRuleCandidate[] = [];

  // RULE-DROP-01: Wi-Fi 무선 간섭·신호 약화·로밍 불안정
  {
    let score = 0;
    const ev: string[] = [];
    if (wifi === 'yes' && signalRoam === 'yes') {
      score += 68;
      ev.push('Wi-Fi 사용 환경에서 신호가 약하거나 AP 이동 시점에 끊김이 집중되어 무선 신호·로밍 불안정이 유력합니다.');
      if (allDevices === 'no') {
        score += 14;
        ev.push('현재 PC에서만 단독으로 끊김이 발생해 단말 위치의 무선 품질 저하가 강하게 뒷받침됩니다.');
      }
      if (pingLoss === 'yes') {
        score += 10;
        ev.push('기본 게이트웨이 연속 ping 중 패킷 손실이 관찰되어 로컬 무선 구간 단절이 확인되었습니다.');
      }
    } else if (wifi === 'yes' && signalRoam === 'unknown') {
      score += 34;
      ev.push('Wi-Fi 사용 중이나 신호 세기 및 AP 전환 패턴이 미확인 상태입니다.');
    }

    rules.push({
      id: 'drop-wifi-roaming',
      ruleId: 'RULE-DROP-01',
      title: 'Wi-Fi 무선 신호 약화·전파 간섭 또는 AP 로밍 불안정',
      score: clampScore(score),
      explanation:
        '무선 신호 강도가 경계 수준이거나 인접 AP/주파수 대역(2.4GHz↔5GHz) 간 잦은 전환이 일어날 때 수 초간의 연결 끊김과 재연결이 반복됩니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '기본 게이트웨이 연속 ping 손실 점검',
          instruction: 'ping -n 20 <기본 게이트웨이 IP>를 현재 자리와 공유기 근접 위치에서 각각 실행해 손실 차이를 비교합니다.',
          commandId: 'ping',
        },
        {
          title: '무선 어댑터 IP 임대 정보 확인',
          instruction: 'ipconfig /all로 Wi-Fi 어댑터의 IP 임대 시간과 기본 게이트웨이 구성을 확인합니다.',
          commandId: 'ipconfig',
        },
      ],
      safeResolutions: [
        '공유기·AP와 가까운 위치로 이동하거나, 2.4GHz와 5GHz SSID가 분리되어 있다면 환경에 안정적인 대역에 고정 연결합니다.',
        '중요한 화상회의나 원격 접속 시에는 유선 LAN 연결을 우선 사용합니다.',
        '노트북 제조사 공식 도구를 통해 Wi-Fi 드라이버를 최신 안정 버전으로 유지하고, 사내 다중 AP 환경이라면 음영 구역 여부를 IT 관리자에게 공유합니다.',
      ],
    });
  }

  // RULE-DROP-02: 물리 케이블/포트 접촉 불량
  {
    let score = 0;
    const ev: string[] = [];
    if (cablePhys === 'yes') {
      score += 72;
      ev.push('LAN 케이블 체결이 헐겁거나 진동·이동 시 끊김이 발생해 물리적 케이블/포트 접촉 불량이 매우 유력합니다.');
      if (allDevices === 'no') {
        score += 14;
        ev.push('다른 기기는 정상 유지되므로 현재 단말의 케이블·랜포트·젠더 구간에 원인이 국한됩니다.');
      }
      if (pingLoss === 'yes') {
        score += 8;
        ev.push('게이트웨이 연속 ping 손실이 동반되어 물리 링크 순간 단절 신호와 일치합니다.');
      }
    } else if (wifi === 'no' && cablePhys === 'unknown') {
      score += 32;
      ev.push('유선 연결 사용 중이나 케이블·포트 물리 체결 상태가 아직 확인되지 않았습니다.');
    }

    rules.push({
      id: 'drop-cable-physical',
      ruleId: 'RULE-DROP-02',
      title: '유선 LAN 케이블·포트 또는 USB 랜젠더 물리 접촉 불량',
      score: clampScore(score),
      explanation:
        '커넥터 고정 래치 파손, 내부 단선, 벽면 랜포트 노후화 또는 USB-C 이더넷 젠더 접촉 불량으로 인해 미세한 움직임에도 링크가 순간 해제되었다 재연결되는 현상입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '케이블 교체 후 연속 ping 검증',
          instruction: '정상 예비 LAN 케이블로 교체하거나 다른 포트에 연결한 뒤 ping -n 20 <기본 게이트웨이>를 실행합니다.',
          commandId: 'ping',
        },
        {
          title: '어댑터 연결 상태 확인',
          instruction: '끊김 직후 ipconfig /all에서 "미디어 연결 끊김"이 표시되는지 확인합니다.',
          commandId: 'ipconfig',
        },
      ],
      safeResolutions: [
        '래치가 손상되었거나 심하게 꺾인 LAN 케이블을 정상 Cat5e/Cat6 케이블로 교체합니다.',
        '공유기·스위치의 다른 LAN 포트 또는 벽면 예비 포트로 변경해 포트 자체 불량 여부를 교차 검증합니다.',
        'USB 랜젠더·도킹 스테이션 사용 시 케이블 장력을 줄이고 본체의 다른 포트에 직접 연결해 안정성을 확인합니다.',
      ],
    });
  }

  // RULE-DROP-03: 공유기/모뎀/ISP 회선 불안정
  {
    let score = 0;
    const ev: string[] = [];
    if (allDevices === 'yes') {
      score += 68;
      ev.push('끊김 시점에 같은 네트워크의 다른 기기도 동시에 끊기므로 단일 PC가 아닌 공유기·모뎀 또는 상위 ISP 회선 불안정이 유력합니다.');
      if (pingLoss === 'yes') {
        score += 18;
        ev.push('기본 게이트웨이 연속 ping에서 손실이 발생해 공유기·내부 스위치 장비 불안정(과열/재부팅/세션 포화) 가능성이 높습니다.');
      } else if (pingLoss === 'no') {
        score += 14;
        ev.push('내부 기본 게이트웨이 응답은 유지되지만 전 기기 외부 연결이 끊겨 모뎀·ISP 상위 회선 불안정이 유력합니다.');
      }
      if (signalRoam === 'no' || cablePhys === 'no') {
        score += 6;
        ev.push('단말 무선 신호·물리 케이블 이상 징후가 없어 공용 네트워크 구간 원인이 더욱 뒷받침됩니다.');
      }
    } else if (allDevices === 'unknown' && pingLoss === 'yes') {
      score += 36;
      ev.push('게이트웨이 연속 ping 손실이 확인되었으나 타 기기 동시 끊김 여부가 미확인 상태입니다.');
    }

    const isIspLikely = allDevices === 'yes' && pingLoss === 'no';
    rules.push({
      id: 'drop-router-isp-instability',
      ruleId: 'RULE-DROP-03',
      title: isIspLikely
        ? '모뎀 또는 상위 ISP 외부 회선 간헐적 불안정'
        : '공유기·모뎀 장비 과부하 또는 상위 회선 불안정',
      score: clampScore(score),
      explanation: isIspLikely
        ? '내부 공유기까지는 안정적으로 통신되지만 모든 기기의 외부 인터넷 연결이 동시 중단됩니다. 모뎀 신호 품질 저하나 ISP 외부 회선 흔들림을 우선 점검해야 합니다.'
        : '같은 네트워크의 모든 기기가 동시에 끊기고 있어 공유기 과열·펌웨어 불안정·전원 어댑터 불량 또는 상위 ISP 회선 단절 가능성이 높습니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: '게이트웨이 vs 외부 IP 동시 연속 ping 비교',
          instruction: 'ping -n 20 <기본 게이트웨이>와 ping -n 20 8.8.8.8 결과를 비교해 내부 장비 문제와 ISP 회선 문제를 구분합니다.',
          commandId: 'ping',
        },
        {
          title: '외부 경로 추적(tracert)',
          instruction: '끊김 직후 tracert -d 8.8.8.8로 어느 구간에서 시간 초과가 발생하는지 기록합니다.',
          commandId: 'tracert',
        },
      ],
      safeResolutions: [
        '끊김이 발생하는 정확한 시각과 빈도를 기록하고, 모뎀·공유기 LED가 순간 적색/소등으로 변하는지 관찰합니다.',
        '가정·소규모 환경에서는 공유기 통풍·발열과 전원 어댑터 체결을 점검하고 최신 공식 펌웨어 유지 및 안전 재시작을 진행합니다.',
        '반복적인 다수 기기 동시 끊김이 지속되면 기록한 발생 시각 및 ping/tracert 결과와 함께 사내 IT 팀 또는 통신사(ISP)에 회선 신호 품질 점검을 요청합니다.',
      ],
    });
  }

  // RULE-DROP-04: 단말 NIC 드라이버·절전 모드·IP 임대 갱신 이상
  {
    let score = 0;
    const ev: string[] = [];
    if (allDevices === 'no') {
      score += 38;
      ev.push('다른 기기는 정상 유지되고 현재 PC만 단독으로 끊겨 단말 내부 요인 가능성이 높습니다.');
      if (signalRoam === 'no' || cablePhys === 'no') {
        score += 38;
        ev.push('무선 신호 약화나 케이블 물리 접촉 불량 징후가 없어 NIC 드라이버, 절전 관리 또는 DHCP 임대 갱신 이상이 유력합니다.');
      }
      if (pingLoss === 'yes') {
        score += 12;
        ev.push('단독 단말에서 기본 게이트웨이 연속 ping 손실이 확인되었습니다.');
      } else if (pingLoss === 'no') {
        score += 6;
      }
    }

    rules.push({
      id: 'drop-nic-driver-power',
      ruleId: 'RULE-DROP-04',
      title: '단말 네트워크 어댑터(NIC) 드라이버·전원 절전 관리 또는 IP 임대 갱신 이상',
      score: clampScore(score),
      explanation:
        '공유기와 케이블/신호 상태는 양호하지만 현재 PC에서만 간헐적으로 연결이 끊깁니다. 오래된 네트워크 어댑터 드라이버, 공격적인 절전 모드 전환, 또는 짧은 DHCP 임대 갱신 충돌이 주요 원인입니다.',
      supportingEvidence: ev,
      checkSteps: [
        {
          title: 'DHCP 임대 획득·만료 시각 확인',
          instruction: 'ipconfig /all에서 "임대 얻은 날짜"와 "임대 만료 날짜" 간격이 비정상적으로 짧아 끊김 주기와 겹치는지 확인합니다.',
          commandId: 'ipconfig',
        },
        {
          title: '기본 게이트웨이 연속 ping 점검',
          instruction: 'ping -n 20 <기본 게이트웨이 IP>를 실행해 끊김 주기 및 손실 패턴을 기록합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: [
        'PC 또는 노트북 제조사 공식 지원 페이지에서 네트워크 어댑터(Wi-Fi/이더넷) 최신 안정 드라이버로 업데이트합니다.',
        '노트북 배터리 절약 모드에서 네트워크 어댑터 절전 기능이 과도하게 개입하는지 Windows 전원 관리 옵션을 점검합니다.',
        'ipconfig /all에서 DHCP 임대 만료 시점과 끊김 시점이 일치한다면 공유기/사내 네트워크 관리자에게 IP 충돌 또는 임대 주기 설정 확인을 요청합니다.',
      ],
    });
  }

  return rules;
}

function evaluateCandidatesByFaultType(
  faultType: FaultType,
  answerMap: Map<string, DiagnosticAnswer>
): InternalRuleCandidate[] {
  switch (faultType) {
    case 'NO_INTERNET':
      return evaluateNoInternet(answerMap);
    case 'VPN_FAILURE':
      return evaluateVpnFailure(answerMap);
    case 'DNS_ERROR':
      return evaluateDnsError(answerMap);
    case 'SLOW_NETWORK':
      return evaluateSlowNetwork(answerMap);
    case 'INTERMITTENT_DROP':
      return evaluateIntermittentDrop(answerMap);
  }
}

function buildFallbackCandidates(faultType: FaultType): InternalRuleCandidate[] {
  const label = FAULT_TYPE_LABELS[faultType];
  const fallbackCommand: CommandId =
    faultType === 'DNS_ERROR'
      ? 'nslookup'
      : faultType === 'VPN_FAILURE'
        ? 'test-netconnection'
        : 'ipconfig';

  return [
    {
      id: `${faultType.toLowerCase()}-insufficient-data`,
      ruleId: `RULE-${faultType.slice(0, 3)}-00`,
      title: `${label} — 기초 점검 정보 부족 (다수 구간 미확인)`,
      score: 25,
      explanation:
        '핵심 감별 질문에 대한 확인 결과가 충분하지 않아 특정 원인으로 좁히지 못했습니다. Windows 기본 읽기 전용 명령어로 기초 정보를 먼저 수집해 주세요.',
      supportingEvidence: ['응답 중 확인된 결정적 감별 신호가 부족합니다.'],
      checkSteps: [
        {
          title: '기초 네트워크 구성 확인',
          instruction: 'ipconfig /all을 실행해 IPv4 주소, 기본 게이트웨이, DNS 서버 정보를 확인합니다.',
          commandId: fallbackCommand,
        },
        {
          title: '기본 게이트웨이 및 외부 IP 응답 점검',
          instruction: 'ping -n 4 <기본 게이트웨이>와 ping -n 4 8.8.8.8 결과를 확보합니다.',
          commandId: 'ping',
        },
      ],
      safeResolutions: [
        '추천 점검 순서에 따라 안전한 읽기 전용 Windows 명령어(ipconfig, ping, nslookup 등) 결과를 먼저 확보한 뒤 재진단을 진행합니다.',
        '기존 보안 설정을 유지하고 임의의 네트워크 구성 변경을 피한 상태에서 읽기 전용 점검을 우선 수행합니다.',
      ],
    },
  ];
}

function computeSuggestedSeverity(
  faultType: FaultType,
  answerMap: Map<string, DiagnosticAnswer>,
  isConclusive: boolean
): Severity {
  if (faultType === 'NO_INTERNET') {
    if (getAnswerValue(answerMap, 'ni_other_devices') === 'yes') {
      return 'critical';
    }
    if (getAnswerValue(answerMap, 'ni_external_ping') === 'no') {
      return 'high';
    }
    return isConclusive ? 'high' : 'medium';
  }

  if (faultType === 'VPN_FAILURE') {
    if (getAnswerValue(answerMap, 'vpn_base_internet') === 'no') {
      return 'high';
    }
    return 'high';
  }

  if (faultType === 'DNS_ERROR') {
    if (
      getAnswerValue(answerMap, 'dns_ip_ok') === 'no' ||
      getAnswerValue(answerMap, 'dns_all_domains') === 'yes'
    ) {
      return 'high';
    }
    return 'medium';
  }

  if (faultType === 'INTERMITTENT_DROP') {
    if (getAnswerValue(answerMap, 'drop_all_devices') === 'yes') {
      return 'high';
    }
    return 'medium';
  }

  // SLOW_NETWORK
  if (
    getAnswerValue(answerMap, 'slow_other_devices') === 'yes' &&
    getAnswerValue(answerMap, 'slow_specific_service') === 'no'
  ) {
    return 'medium';
  }
  return isConclusive ? 'medium' : 'low';
}

function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function buildRecommendedCheckOrder(
  topCandidate: InternalRuleCandidate,
  unknownAnswers: DiagnosticAnswer[]
): CheckStep[] {
  const rawSteps: Omit<CheckStep, 'order'>[] = [];
  const seenTitles = new Set<string>();

  const pushUnique = (step: Omit<CheckStep, 'order'>) => {
    if (seenTitles.has(step.title)) return;
    seenTitles.add(step.title);
    rawSteps.push(step);
  };

  // Prioritize gathering missing evidence for any unknown answers first
  for (const ans of unknownAnswers) {
    const guidance = UNKNOWN_CHECK_GUIDANCE[ans.questionId];
    if (guidance) {
      pushUnique(guidance.checkStep);
    }
  }

  // Then include the top candidate's tailored verification steps
  for (const step of topCandidate.checkSteps) {
    pushUnique(step);
  }

  return rawSteps.slice(0, 6).map((step, index) => ({
    order: index + 1,
    ...step,
  }));
}

/**
 * Pure deterministic rule-based diagnostic evaluator.
 * Evaluates actual user answers without any React/DOM/LocalStorage dependencies.
 */
export function evaluateDiagnosis(input: EvaluateDiagnosisInput): DiagnosisResult {
  const { faultType, answers } = input;
  const sessionId =
    input.sessionId?.trim() || `diag-${faultType.toLowerCase()}-${answers.length}`;
  const completedAt = input.evaluatedAt ?? new Date().toISOString();
  const normalizedSymptom = input.symptomSummary?.trim() ?? '';

  const normalizedAnswers: DiagnosticAnswer[] = answers.map((ans) => {
    const q = getQuestionById(ans.questionId);
    return {
      questionId: ans.questionId,
      questionPrompt: ans.questionPrompt || q?.prompt || ans.questionId,
      value: ans.value,
      valueLabel: ans.valueLabel || ANSWER_VALUE_LABELS[ans.value],
      ...(ans.note?.trim() ? { note: ans.note.trim() } : {}),
      answeredAt: ans.answeredAt || completedAt,
    };
  });

  const answerMap = new Map(normalizedAnswers.map((a) => [a.questionId, a]));
  const totalAnswers = normalizedAnswers.length;
  const unknownAnswers = normalizedAnswers.filter((a) => a.value === 'unknown');
  const unknownCount = unknownAnswers.length;
  const unknownRatio = totalAnswers === 0 ? 1 : unknownCount / totalAnswers;

  const evaluatedRules = evaluateCandidatesByFaultType(faultType, answerMap)
    .filter((rule) => rule.score > 0)
    .sort((a, b) => b.score - a.score || a.ruleId.localeCompare(b.ruleId));

  const rankedInternal =
    evaluatedRules.length > 0 ? evaluatedRules : buildFallbackCandidates(faultType);

  const topCandidate = rankedInternal[0];
  const secondCandidate = rankedInternal[1];
  const topScore = topCandidate?.score ?? 0;
  const secondScore = secondCandidate?.score ?? 0;
  const scoreGap = rankedInternal.length >= 2 ? topScore - secondScore : topScore;

  const reasonsForInconclusive: string[] = [];
  if (totalAnswers === 0) {
    reasonsForInconclusive.push('진단 질문 응답이 입력되지 않았습니다.');
  }
  if (totalAnswers > 0 && unknownRatio >= 0.5) {
    reasonsForInconclusive.push(
      `전체 ${totalAnswers}개 질문 중 ${unknownCount}개(${Math.round(unknownRatio * 100)}%)가 "모름"으로 응답되었습니다.`
    );
  }
  if (topScore < 60) {
    reasonsForInconclusive.push(
      `최상위 원인 후보의 규칙 적합도 점수(${topScore}점)가 확정 기준(60점) 미만입니다.`
    );
  }
  if (rankedInternal.length >= 2 && scoreGap <= 10) {
    reasonsForInconclusive.push(
      `상위 두 후보("${topCandidate.title}" ${topScore}점 vs "${secondCandidate.title}" ${secondScore}점)의 점수 차이가 ${scoreGap}점 이하로 경합 상태입니다.`
    );
  }

  const isConclusive = reasonsForInconclusive.length === 0;

  const conclusivenessNotice = isConclusive
    ? `입력하신 ${totalAnswers}개 점검 응답을 바탕으로 1차 유력 원인 후보("${topCandidate.title}")로 범위가 좁혀졌습니다. 아래 추천 점검 순서와 안전한 해결 방법으로 최종 검증해 주세요.`
    : `${INCONCLUSIVE_STANDARD_NOTICE} (${reasonsForInconclusive.join(' ')})`;

  const candidates: CauseCandidate[] = rankedInternal.slice(0, 4).map((rule) => ({
    id: rule.id,
    ruleId: rule.ruleId,
    title: rule.title,
    likelihood: scoreToLikelihood(rule.score),
    score: rule.score,
    explanation: rule.explanation,
    supportingEvidence:
      rule.supportingEvidence.length > 0
        ? rule.supportingEvidence
        : ['현재까지 입력된 응답 조합을 기준으로 보조 후보로 분류되었습니다.'],
  }));

  // Build dynamic inference evidence strictly from user answers
  const evidence: string[] = [];
  if (normalizedSymptom) {
    evidence.push(`사용자 증상 메모: "${normalizedSymptom}"`);
  }
  for (const ans of normalizedAnswers) {
    evidence.push(`응답 반영 — ${formatAnswerBrief(ans)}`);
  }
  if (isConclusive) {
    evidence.push(
      `규칙 추론 요약: ${topCandidate.ruleId}("${topCandidate.title}")가 규칙 적합도 ${topCandidate.score}점으로 가장 높게 평가되었습니다.`
    );
  } else {
    evidence.push(
      `근거 부족 판정: ${reasonsForInconclusive.join(' ')}`
    );
  }

  const recommendedCheckOrder = buildRecommendedCheckOrder(topCandidate, unknownAnswers);

  const safeResolutions = deduplicateStrings([
    ...topCandidate.safeResolutions,
    ...(isConclusive
      ? []
      : [
          '원인이 확정되지 않은 상태에서 공유기 초기화나 네트워크 설정 일괄 변경을 진행하지 말고, 먼저 읽기 전용 점검 명령어 결과를 확보해 재진단합니다.',
        ]),
    '점검 결과를 사내 IT 지원팀이나 통신사(ISP)에 공유할 때는 비밀번호·인증 토큰·내부 비공개 키 등 민감 정보를 제외하고 전달합니다.',
  ]);

  const additionalChecks: string[] = [];
  for (const ans of unknownAnswers) {
    const guidance = UNKNOWN_CHECK_GUIDANCE[ans.questionId];
    if (guidance) {
      additionalChecks.push(`[미확인 항목: ${ans.questionPrompt}] ${guidance.instruction}`);
    } else {
      additionalChecks.push(
        `[미확인 항목] "${ans.questionPrompt}" 항목을 직접 확인한 뒤 재진단해 주세요.`
      );
    }
  }

  if (!isConclusive && rankedInternal.length >= 2 && scoreGap <= 10) {
    additionalChecks.push(
      `상위 경합 후보("${topCandidate.title}" vs "${secondCandidate.title}")를 분리하기 위해 추천 점검 순서의 Windows 명령어 실행 결과를 비교해 주세요.`
    );
  }

  if (additionalChecks.length === 0) {
    additionalChecks.push(
      '안전한 해결 방법 적용 후 동일한 Windows 점검 명령어(ping/nslookup/ipconfig 등)를 재실행해 정상 복구 여부를 검증해 주세요.'
    );
    additionalChecks.push(
      '동일 장애가 반복된다면 발생 시각, 영향 범위(단일 기기/다수 기기), 오류 코드를 장애 이력에 함께 기록해 두면 후속 분석에 도움이 됩니다.'
    );
  }

  const suggestedSeverity = computeSuggestedSeverity(faultType, answerMap, isConclusive);

  return {
    sessionId,
    faultType,
    completedAt,
    isConclusive,
    conclusivenessNotice,
    userSymptomSummary: normalizedSymptom || '별도 증상 요약 미입력',
    inputSummary: normalizedAnswers,
    candidates,
    evidence: deduplicateStrings(evidence),
    recommendedCheckOrder,
    safeResolutions,
    additionalChecksNeeded: deduplicateStrings(additionalChecks),
    suggestedSeverity,
  };
}
