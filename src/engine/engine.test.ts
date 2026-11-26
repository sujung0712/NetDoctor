import { describe, expect, it } from 'vitest';
import {
  ANSWER_VALUE_LABELS,
  FAULT_TYPES,
  type AnswerValue,
  type CommandId,
  type DiagnosticAnswer,
  type FaultType,
} from '../types';
import {
  DIAGNOSTIC_QUESTIONS,
  evaluateDiagnosis,
  getInitialQuestion,
  getNextQuestion,
  getQuestionById,
  getQuestionsForFaultType,
} from './index';

const VALID_COMMAND_IDS: CommandId[] = [
  'ipconfig',
  'ping',
  'nslookup',
  'tracert',
  'test-netconnection',
];

function makeAnswer(
  questionId: string,
  value: AnswerValue,
  note?: string
): DiagnosticAnswer {
  const q = getQuestionById(questionId);
  if (!q) {
    throw new Error(`Unknown questionId in test: ${questionId}`);
  }
  return {
    questionId,
    questionPrompt: q.prompt,
    value,
    valueLabel: ANSWER_VALUE_LABELS[value],
    note,
    answeredAt: '2026-11-26T05:00:00.000Z',
  };
}

function runPath(
  faultType: FaultType,
  answerLookup: Record<string, AnswerValue>
): DiagnosticAnswer[] {
  const answers: DiagnosticAnswer[] = [];
  let current = getInitialQuestion(faultType);
  let safetyGuard = 0;

  while (current && safetyGuard < 15) {
    const val = answerLookup[current.id] ?? 'unknown';
    answers.push(makeAnswer(current.id, val));
    const next = getNextQuestion(faultType, answers);
    if (!next) break;
    current = next;
    safetyGuard += 1;
  }

  return answers;
}

describe('NetDoctor Diagnostic Engine — Questions & Dynamic Branching', () => {
  it('supports all 5 fault types with valid options (yes/no/unknown) and CommandIds', () => {
    expect(FAULT_TYPES).toHaveLength(5);

    for (const faultType of FAULT_TYPES) {
      const initial = getInitialQuestion(faultType);
      expect(initial).toBeDefined();
      expect(initial.faultType).toBe(faultType);

      const questions = getQuestionsForFaultType(faultType);
      expect(questions.length).toBeGreaterThanOrEqual(4);

      for (const q of questions) {
        const optionValues = q.options.map((o) => o.value);
        expect(optionValues).toEqual(['yes', 'no', 'unknown']);
        expect(q.options.map((o) => o.label)).toEqual(['예', '아니오', '모름']);
        if (q.recommendedCommandId) {
          expect(VALID_COMMAND_IDS).toContain(q.recommendedCommandId);
        }
      }
    }

    expect(Object.keys(DIAGNOSTIC_QUESTIONS).length).toBeGreaterThanOrEqual(20);
  });

  it('branches dynamically on NO_INTERNET based on yes vs no answers', () => {
    const nextAfterNoLink = getNextQuestion('NO_INTERNET', [makeAnswer('ni_link', 'no')]);
    const nextAfterYesLink = getNextQuestion('NO_INTERNET', [makeAnswer('ni_link', 'yes')]);

    expect(nextAfterNoLink?.id).toBe('ni_other_devices');
    expect(nextAfterYesLink?.id).toBe('ni_apipa');
    expect(nextAfterNoLink?.id).not.toBe(nextAfterYesLink?.id);

    const nextAfterApipaYes = getNextQuestion('NO_INTERNET', [
      makeAnswer('ni_link', 'yes'),
      makeAnswer('ni_apipa', 'yes'),
    ]);
    const nextAfterApipaNo = getNextQuestion('NO_INTERNET', [
      makeAnswer('ni_link', 'yes'),
      makeAnswer('ni_apipa', 'no'),
    ]);

    expect(nextAfterApipaYes?.id).toBe('ni_other_devices');
    expect(nextAfterApipaNo?.id).toBe('ni_gateway_ping');
  });

  it('branches dynamically on VPN_FAILURE based on yes vs no answers', () => {
    const nextAfterBaseNo = getNextQuestion('VPN_FAILURE', [
      makeAnswer('vpn_base_internet', 'no'),
    ]);
    const nextAfterBaseYes = getNextQuestion('VPN_FAILURE', [
      makeAnswer('vpn_base_internet', 'yes'),
    ]);

    expect(nextAfterBaseNo).toBeNull();
    expect(nextAfterBaseYes?.id).toBe('vpn_other_network');

    const nextAfterOtherYes = getNextQuestion('VPN_FAILURE', [
      makeAnswer('vpn_base_internet', 'yes'),
      makeAnswer('vpn_other_network', 'yes'),
    ]);
    const nextAfterOtherNo = getNextQuestion('VPN_FAILURE', [
      makeAnswer('vpn_base_internet', 'yes'),
      makeAnswer('vpn_other_network', 'no'),
    ]);

    expect(nextAfterOtherYes?.id).toBe('vpn_error_stage');
    expect(nextAfterOtherNo?.id).toBe('vpn_port_check');
  });

  it('branches dynamically on DNS_ERROR based on yes vs no answers', () => {
    const nextAfterIpNo = getNextQuestion('DNS_ERROR', [makeAnswer('dns_ip_ok', 'no')]);
    const nextAfterIpYes = getNextQuestion('DNS_ERROR', [makeAnswer('dns_ip_ok', 'yes')]);

    expect(nextAfterIpNo).toBeNull();
    expect(nextAfterIpYes?.id).toBe('dns_all_domains');

    const nextAfterAllYes = getNextQuestion('DNS_ERROR', [
      makeAnswer('dns_ip_ok', 'yes'),
      makeAnswer('dns_all_domains', 'yes'),
    ]);
    const nextAfterAllNo = getNextQuestion('DNS_ERROR', [
      makeAnswer('dns_ip_ok', 'yes'),
      makeAnswer('dns_all_domains', 'no'),
    ]);

    expect(nextAfterAllYes?.id).toBe('dns_alt_server');
    expect(nextAfterAllNo?.id).toBe('dns_cache_or_hosts');
  });

  it('branches dynamically on SLOW_NETWORK based on yes vs no answers', () => {
    const nextAfterWifiYes = getNextQuestion('SLOW_NETWORK', [makeAnswer('slow_wifi', 'yes')]);
    const nextAfterWifiNo = getNextQuestion('SLOW_NETWORK', [makeAnswer('slow_wifi', 'no')]);

    expect(nextAfterWifiYes?.id).toBe('slow_wired_compare');
    expect(nextAfterWifiNo?.id).toBe('slow_other_devices');

    const stopAfterWiredNo = getNextQuestion('SLOW_NETWORK', [
      makeAnswer('slow_wifi', 'yes'),
      makeAnswer('slow_wired_compare', 'no'),
      makeAnswer('slow_gateway_latency', 'yes'),
    ]);
    const continueAfterWiredYes = getNextQuestion('SLOW_NETWORK', [
      makeAnswer('slow_wifi', 'yes'),
      makeAnswer('slow_wired_compare', 'yes'),
      makeAnswer('slow_gateway_latency', 'no'),
    ]);

    expect(stopAfterWiredNo).toBeNull();
    expect(continueAfterWiredYes?.id).toBe('slow_specific_service');
  });

  it('branches dynamically on INTERMITTENT_DROP based on yes vs no answers', () => {
    const nextAfterWifiYes = getNextQuestion('INTERMITTENT_DROP', [
      makeAnswer('drop_wifi', 'yes'),
    ]);
    const nextAfterWifiNo = getNextQuestion('INTERMITTENT_DROP', [
      makeAnswer('drop_wifi', 'no'),
    ]);

    expect(nextAfterWifiYes?.id).toBe('drop_signal_or_roam');
    expect(nextAfterWifiNo?.id).toBe('drop_cable_physical');
  });
});

describe('NetDoctor Diagnostic Engine — Evaluation across all 5 FaultTypes', () => {
  it('evaluates NO_INTERNET scenarios distinctly and conclusively', () => {
    const apipaAnswers = runPath('NO_INTERNET', {
      ni_link: 'yes',
      ni_apipa: 'yes',
      ni_other_devices: 'yes',
    });
    const apipaResult = evaluateDiagnosis({
      sessionId: 'sess-ni-apipa',
      faultType: 'NO_INTERNET',
      symptomSummary: '사내 사무실 PC 여러 대가 인터넷이 안 됩니다.',
      answers: apipaAnswers,
      evaluatedAt: '2026-11-26T05:00:00.000Z',
    });

    expect(apipaResult.isConclusive).toBe(true);
    expect(apipaResult.candidates[0].ruleId).toBe('RULE-NI-02');
    expect(apipaResult.candidates[0].score).toBeGreaterThanOrEqual(80);
    expect(apipaResult.suggestedSeverity).toBe('critical');
    expect(apipaResult.inputSummary).toHaveLength(3);

    const ispAnswers = runPath('NO_INTERNET', {
      ni_link: 'yes',
      ni_apipa: 'no',
      ni_gateway_ping: 'yes',
      ni_external_ping: 'no',
    });
    const ispResult = evaluateDiagnosis({
      sessionId: 'sess-ni-isp',
      faultType: 'NO_INTERNET',
      symptomSummary: '공유기는 응답하는데 외부 접속이 불가합니다.',
      answers: ispAnswers,
      evaluatedAt: '2026-11-26T05:00:00.000Z',
    });

    expect(ispResult.isConclusive).toBe(true);
    expect(ispResult.candidates[0].ruleId).toBe('RULE-NI-04');
    expect(ispResult.candidates[0].title).not.toBe(apipaResult.candidates[0].title);

    const extOkAnswers = runPath('NO_INTERNET', {
      ni_link: 'yes',
      ni_apipa: 'no',
      ni_gateway_ping: 'yes',
      ni_external_ping: 'yes',
    });
    const extOkResult = evaluateDiagnosis({
      sessionId: 'sess-ni-dns',
      faultType: 'NO_INTERNET',
      symptomSummary: '웹페이지가 안 열립니다.',
      answers: extOkAnswers,
      evaluatedAt: '2026-11-26T05:00:00.000Z',
    });

    expect(extOkResult.isConclusive).toBe(true);
    expect(extOkResult.candidates[0].ruleId).toBe('RULE-NI-05');
  });

  it('evaluates VPN_FAILURE scenarios distinctly (base down vs auth vs port block)', () => {
    const baseDown = evaluateDiagnosis({
      sessionId: 'sess-vpn-1',
      faultType: 'VPN_FAILURE',
      symptomSummary: 'VPN도 안 되고 일반 웹도 안 열립니다.',
      answers: runPath('VPN_FAILURE', { vpn_base_internet: 'no' }),
    });
    expect(baseDown.isConclusive).toBe(true);
    expect(baseDown.candidates[0].ruleId).toBe('RULE-VPN-01');

    const authFail = evaluateDiagnosis({
      sessionId: 'sess-vpn-2',
      faultType: 'VPN_FAILURE',
      symptomSummary: '핫스팟에서도 VPN 로그인 인증이 실패합니다.',
      answers: runPath('VPN_FAILURE', {
        vpn_base_internet: 'yes',
        vpn_other_network: 'yes',
        vpn_error_stage: 'yes',
      }),
    });
    expect(authFail.isConclusive).toBe(true);
    expect(authFail.candidates[0].ruleId).toBe('RULE-VPN-02');

    const portBlock = evaluateDiagnosis({
      sessionId: 'sess-vpn-3',
      faultType: 'VPN_FAILURE',
      symptomSummary: '카페 Wi-Fi에서만 VPN이 연결되지 않습니다.',
      answers: runPath('VPN_FAILURE', {
        vpn_base_internet: 'yes',
        vpn_other_network: 'no',
        vpn_port_check: 'yes',
      }),
    });
    expect(portBlock.isConclusive).toBe(true);
    expect(portBlock.candidates[0].ruleId).toBe('RULE-VPN-03');
  });

  it('evaluates DNS_ERROR scenarios distinctly (resolver failure vs path block vs specific domain)', () => {
    const resolverDown = evaluateDiagnosis({
      sessionId: 'sess-dns-1',
      faultType: 'DNS_ERROR',
      symptomSummary: '도메인 접속이 안 되지만 8.8.8.8 ping은 됩니다.',
      answers: runPath('DNS_ERROR', {
        dns_ip_ok: 'yes',
        dns_all_domains: 'yes',
        dns_alt_server: 'yes',
      }),
    });
    expect(resolverDown.isConclusive).toBe(true);
    expect(resolverDown.candidates[0].ruleId).toBe('RULE-DNS-02');

    const pathBlocked = evaluateDiagnosis({
      sessionId: 'sess-dns-2',
      faultType: 'DNS_ERROR',
      symptomSummary: '모든 DNS 조회가 시간 초과됩니다.',
      answers: runPath('DNS_ERROR', {
        dns_ip_ok: 'yes',
        dns_all_domains: 'yes',
        dns_alt_server: 'no',
      }),
    });
    expect(pathBlocked.isConclusive).toBe(true);
    expect(pathBlocked.candidates[0].ruleId).toBe('RULE-DNS-03');

    const specificDomain = evaluateDiagnosis({
      sessionId: 'sess-dns-3',
      faultType: 'DNS_ERROR',
      symptomSummary: '특정 업무 사이트만 DNS 오류가 납니다.',
      answers: runPath('DNS_ERROR', {
        dns_ip_ok: 'yes',
        dns_all_domains: 'no',
        dns_cache_or_hosts: 'yes',
      }),
    });
    expect(specificDomain.isConclusive).toBe(true);
    expect(specificDomain.candidates[0].ruleId).toBe('RULE-DNS-04');
  });

  it('evaluates SLOW_NETWORK scenarios distinctly (Wi-Fi vs specific route vs ISP vs endpoint)', () => {
    const wifiSlow = evaluateDiagnosis({
      sessionId: 'sess-slow-1',
      faultType: 'SLOW_NETWORK',
      symptomSummary: '회의실 Wi-Fi가 너무 느립니다.',
      answers: runPath('SLOW_NETWORK', {
        slow_wifi: 'yes',
        slow_wired_compare: 'no',
        slow_gateway_latency: 'yes',
      }),
    });
    expect(wifiSlow.isConclusive).toBe(true);
    expect(wifiSlow.candidates[0].ruleId).toBe('RULE-SLOW-01');

    const specificServiceSlow = evaluateDiagnosis({
      sessionId: 'sess-slow-2',
      faultType: 'SLOW_NETWORK',
      symptomSummary: '특정 해외 SaaS만 로딩이 느립니다.',
      answers: runPath('SLOW_NETWORK', {
        slow_wifi: 'no',
        slow_other_devices: 'yes',
        slow_gateway_latency: 'no',
        slow_specific_service: 'yes',
      }),
    });
    expect(specificServiceSlow.isConclusive).toBe(true);
    expect(specificServiceSlow.candidates[0].ruleId).toBe('RULE-SLOW-02');

    const ispSlow = evaluateDiagnosis({
      sessionId: 'sess-slow-3',
      faultType: 'SLOW_NETWORK',
      symptomSummary: '사무실 전체 기기 인터넷이 전반적으로 느립니다.',
      answers: runPath('SLOW_NETWORK', {
        slow_wifi: 'no',
        slow_other_devices: 'yes',
        slow_gateway_latency: 'no',
        slow_specific_service: 'no',
      }),
    });
    expect(ispSlow.isConclusive).toBe(true);
    expect(ispSlow.candidates[0].ruleId).toBe('RULE-SLOW-03');
  });

  it('evaluates INTERMITTENT_DROP scenarios distinctly (Wi-Fi vs cable vs router/ISP vs NIC)', () => {
    const cableDrop = evaluateDiagnosis({
      sessionId: 'sess-drop-1',
      faultType: 'INTERMITTENT_DROP',
      symptomSummary: '책상을 건드리면 유선 연결이 끊깁니다.',
      answers: runPath('INTERMITTENT_DROP', {
        drop_wifi: 'no',
        drop_cable_physical: 'yes',
        drop_all_devices: 'no',
        drop_ping_loss: 'yes',
      }),
    });
    expect(cableDrop.isConclusive).toBe(true);
    expect(cableDrop.candidates[0].ruleId).toBe('RULE-DROP-02');

    const routerDrop = evaluateDiagnosis({
      sessionId: 'sess-drop-2',
      faultType: 'INTERMITTENT_DROP',
      symptomSummary: '사무실 전체 PC가 10분마다 함께 끊깁니다.',
      answers: runPath('INTERMITTENT_DROP', {
        drop_wifi: 'no',
        drop_cable_physical: 'no',
        drop_all_devices: 'yes',
        drop_ping_loss: 'yes',
      }),
    });
    expect(routerDrop.isConclusive).toBe(true);
    expect(routerDrop.candidates[0].ruleId).toBe('RULE-DROP-03');

    const nicDrop = evaluateDiagnosis({
      sessionId: 'sess-drop-3',
      faultType: 'INTERMITTENT_DROP',
      symptomSummary: '내 PC만 간헐적으로 연결이 해제됩니다.',
      answers: runPath('INTERMITTENT_DROP', {
        drop_wifi: 'no',
        drop_cable_physical: 'no',
        drop_all_devices: 'no',
        drop_ping_loss: 'yes',
      }),
    });
    expect(nicDrop.isConclusive).toBe(true);
    expect(nicDrop.candidates[0].ruleId).toBe('RULE-DROP-04');
  });

  it('includes user answer notes dynamically in inputSummary and evidence', () => {
    const answers = [
      makeAnswer('ni_link', 'no', '벽면 랜포트 LED가 완전히 꺼져 있음'),
      makeAnswer('ni_other_devices', 'no', '옆자리 동료 PC는 정상'),
    ];
    const result = evaluateDiagnosis({
      sessionId: 'sess-note-test',
      faultType: 'NO_INTERNET',
      symptomSummary: '아침 출근 후 유선 연결 불가',
      answers,
    });

    expect(result.inputSummary[0].note).toBe('벽면 랜포트 LED가 완전히 꺼져 있음');
    expect(result.evidence.some((e) => e.includes('벽면 랜포트 LED가 완전히 꺼져 있음'))).toBe(
      true
    );
  });
});

describe('NetDoctor Diagnostic Engine — Conclusive vs Inconclusive (unknown / tie / low score)', () => {
  it('marks result inconclusive when all answers are unknown across all 5 fault types', () => {
    for (const faultType of FAULT_TYPES) {
      const answers = runPath(faultType, {});
      const result = evaluateDiagnosis({
        sessionId: `sess-unknown-${faultType}`,
        faultType,
        symptomSummary: '정확한 확인 결과를 아직 모릅니다.',
        answers,
      });

      expect(result.isConclusive).toBe(false);
      expect(result.conclusivenessNotice).toContain('확정하기 어렵습니다');
      expect(result.additionalChecksNeeded.length).toBeGreaterThanOrEqual(answers.length);
      expect(result.recommendedCheckOrder.length).toBeGreaterThan(0);
    }
  });

  it('marks result inconclusive when >= 50% of answers are unknown', () => {
    const answers = [
      makeAnswer('ni_link', 'no'),
      makeAnswer('ni_other_devices', 'unknown'),
    ];
    const result = evaluateDiagnosis({
      sessionId: 'sess-half-unknown',
      faultType: 'NO_INTERNET',
      symptomSummary: '연결 아이콘이 끊김 표시입니다.',
      answers,
    });

    expect(result.isConclusive).toBe(false);
    expect(result.conclusivenessNotice).toContain('50%');
    expect(result.additionalChecksNeeded.some((item) => item.includes('다른 기기'))).toBe(true);
  });

  it('marks result inconclusive when top two candidates are within 10 points (competing causes)', () => {
    // Both weak Wi-Fi signal/roaming AND all devices dropping simultaneously -> competing candidates
    const answers = runPath('INTERMITTENT_DROP', {
      drop_wifi: 'yes',
      drop_signal_or_roam: 'yes',
      drop_all_devices: 'yes',
      drop_ping_loss: 'yes',
    });
    const result = evaluateDiagnosis({
      sessionId: 'sess-competing',
      faultType: 'INTERMITTENT_DROP',
      symptomSummary: '신호도 약하고 다른 기기도 같이 끊깁니다.',
      answers,
    });

    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    const gap = result.candidates[0].score - result.candidates[1].score;
    expect(gap).toBeLessThanOrEqual(10);
    expect(result.isConclusive).toBe(false);
    expect(result.conclusivenessNotice).toContain('경합');
  });
});

describe('NetDoctor Diagnostic Engine — Safety & Determinism Invariants', () => {
  const FORBIDDEN_PATTERNS: RegExp[] = [
    /방화벽.{0,12}(끄|해제|비활성화|중지|종료)/i,
    /백신.{0,12}(끄|해제|비활성화|중지|종료)/i,
    /defender.{0,12}(disable|off|turn off|비활성화|끄|해제)/i,
    /disable\s+(the\s+)?firewall/i,
    /자동으로\s*네트워크\s*설정을\s*변경/i,
    /\b\d+\s*ms\b/i,
    /\b\d+\s*Mbps\b/i,
  ];

  it('never produces unsafe security advice or fabricated live network metrics across scenarios', () => {
    const scenarioSet: Array<{ faultType: FaultType; map: Record<string, AnswerValue> }> = [
      { faultType: 'NO_INTERNET', map: { ni_link: 'no', ni_other_devices: 'no' } },
      { faultType: 'NO_INTERNET', map: { ni_link: 'no', ni_other_devices: 'yes' } },
      { faultType: 'NO_INTERNET', map: { ni_link: 'yes', ni_apipa: 'yes', ni_other_devices: 'no' } },
      { faultType: 'NO_INTERNET', map: { ni_link: 'yes', ni_apipa: 'no', ni_gateway_ping: 'no', ni_other_devices: 'yes' } },
      { faultType: 'NO_INTERNET', map: { ni_link: 'yes', ni_apipa: 'no', ni_gateway_ping: 'yes', ni_external_ping: 'no' } },
      { faultType: 'NO_INTERNET', map: { ni_link: 'yes', ni_apipa: 'no', ni_gateway_ping: 'yes', ni_external_ping: 'yes' } },
      { faultType: 'VPN_FAILURE', map: { vpn_base_internet: 'no' } },
      { faultType: 'VPN_FAILURE', map: { vpn_base_internet: 'yes', vpn_other_network: 'yes', vpn_error_stage: 'yes' } },
      { faultType: 'VPN_FAILURE', map: { vpn_base_internet: 'yes', vpn_other_network: 'no', vpn_port_check: 'yes' } },
      { faultType: 'DNS_ERROR', map: { dns_ip_ok: 'no' } },
      { faultType: 'DNS_ERROR', map: { dns_ip_ok: 'yes', dns_all_domains: 'yes', dns_alt_server: 'yes' } },
      { faultType: 'DNS_ERROR', map: { dns_ip_ok: 'yes', dns_all_domains: 'yes', dns_alt_server: 'no' } },
      { faultType: 'DNS_ERROR', map: { dns_ip_ok: 'yes', dns_all_domains: 'no', dns_cache_or_hosts: 'yes' } },
      { faultType: 'SLOW_NETWORK', map: { slow_wifi: 'yes', slow_wired_compare: 'no', slow_gateway_latency: 'yes' } },
      { faultType: 'SLOW_NETWORK', map: { slow_wifi: 'no', slow_other_devices: 'yes', slow_gateway_latency: 'no', slow_specific_service: 'yes' } },
      { faultType: 'SLOW_NETWORK', map: { slow_wifi: 'no', slow_other_devices: 'no', slow_gateway_latency: 'no', slow_specific_service: 'no' } },
      { faultType: 'INTERMITTENT_DROP', map: { drop_wifi: 'yes', drop_signal_or_roam: 'yes', drop_all_devices: 'no', drop_ping_loss: 'yes' } },
      { faultType: 'INTERMITTENT_DROP', map: { drop_wifi: 'no', drop_cable_physical: 'yes', drop_all_devices: 'no', drop_ping_loss: 'yes' } },
      { faultType: 'INTERMITTENT_DROP', map: { drop_wifi: 'no', drop_cable_physical: 'no', drop_all_devices: 'yes', drop_ping_loss: 'no' } },
      { faultType: 'INTERMITTENT_DROP', map: {} },
    ];

    for (const scenario of scenarioSet) {
      const answers = runPath(scenario.faultType, scenario.map);
      const result = evaluateDiagnosis({
        sessionId: 'sess-safety',
        faultType: scenario.faultType,
        answers,
        evaluatedAt: '2026-11-26T05:00:00.000Z',
      });

      const fullText = [
        result.conclusivenessNotice,
        ...result.evidence,
        ...result.safeResolutions,
        ...result.additionalChecksNeeded,
        ...result.candidates.flatMap((c) => [c.title, c.explanation, ...c.supportingEvidence]),
        ...result.recommendedCheckOrder.flatMap((s) => [s.title, s.instruction]),
      ].join('\n');

      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(fullText, `Forbidden pattern ${pattern} matched in ${scenario.faultType}`).not.toMatch(
          pattern
        );
      }
    }
  });

  it('produces completely deterministic results for identical inputs', () => {
    const answers = runPath('DNS_ERROR', {
      dns_ip_ok: 'yes',
      dns_all_domains: 'yes',
      dns_alt_server: 'yes',
    });

    const first = evaluateDiagnosis({
      sessionId: 'sess-det',
      faultType: 'DNS_ERROR',
      symptomSummary: '도메인 해석 실패',
      answers,
      evaluatedAt: '2026-11-26T05:00:00.000Z',
    });
    const second = evaluateDiagnosis({
      sessionId: 'sess-det',
      faultType: 'DNS_ERROR',
      symptomSummary: '도메인 해석 실패',
      answers,
      evaluatedAt: '2026-11-26T05:00:00.000Z',
    });

    expect(first).toEqual(second);
  });
});
