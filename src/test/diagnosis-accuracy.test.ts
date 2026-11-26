import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_QUESTIONS,
  evaluateDiagnosis,
  getInitialQuestion,
  getNextQuestion,
  getQuestionsForFaultType,
} from '../engine';
import { WINDOWS_COMMAND_GUIDES } from '../features/guide/commands';
import {
  ANSWER_VALUE_LABELS,
  FAULT_TYPES,
  type AnswerValue,
  type DiagnosisResult,
  type DiagnosticAnswer,
  type FaultType,
} from '../types';

function makeAnswer(
  questionId: string,
  value: AnswerValue,
  note?: string
): DiagnosticAnswer {
  const question = DIAGNOSTIC_QUESTIONS[questionId];
  return {
    questionId,
    questionPrompt: question?.prompt ?? questionId,
    value,
    valueLabel: ANSWER_VALUE_LABELS[value],
    ...(note ? { note } : {}),
    answeredAt: '2026-11-26T05:00:00.000Z',
  };
}

function runSession(
  faultType: FaultType,
  answerLookup: Record<string, AnswerValue>,
  symptomSummary = ''
): { answers: DiagnosticAnswer[]; result: DiagnosisResult } {
  const answers: DiagnosticAnswer[] = [];
  let next = getNextQuestion(faultType, answers);
  let guard = 0;

  while (next !== null && guard < 15) {
    const chosen: AnswerValue = answerLookup[next.id] ?? 'unknown';
    answers.push(makeAnswer(next.id, chosen));
    next = getNextQuestion(faultType, answers);
    guard += 1;
  }

  expect(next).toBeNull();

  const result = evaluateDiagnosis({
    faultType,
    symptomSummary,
    answers,
    evaluatedAt: '2026-11-26T05:10:00.000Z',
  });

  return { answers, result };
}

function assertAllSixRequiredSections(result: DiagnosisResult): void {
  expect(Array.isArray(result.candidates)).toBe(true);
  expect(result.candidates.length).toBeGreaterThan(0);

  expect(Array.isArray(result.evidence)).toBe(true);
  expect(result.evidence.length).toBeGreaterThan(0);

  expect(Array.isArray(result.inputSummary)).toBe(true);

  expect(Array.isArray(result.recommendedCheckOrder)).toBe(true);
  expect(result.recommendedCheckOrder.length).toBeGreaterThan(0);
  result.recommendedCheckOrder.forEach((step, idx) => {
    expect(step.order).toBe(idx + 1);
    expect(step.title.trim().length).toBeGreaterThan(0);
    expect(step.instruction.trim().length).toBeGreaterThan(0);
  });

  expect(Array.isArray(result.safeResolutions)).toBe(true);
  expect(result.safeResolutions.length).toBeGreaterThan(0);

  expect(Array.isArray(result.additionalChecksNeeded)).toBe(true);
  expect(result.additionalChecksNeeded.length).toBeGreaterThan(0);
}

describe('NetDoctor Diagnostic Engine — Accuracy, Branching & Safety', () => {
  describe('Question catalog & answer option contract', () => {
    it('covers all 5 core fault types with valid initial questions', () => {
      expect(FAULT_TYPES).toEqual([
        'NO_INTERNET',
        'VPN_FAILURE',
        'DNS_ERROR',
        'SLOW_NETWORK',
        'INTERMITTENT_DROP',
      ]);

      for (const faultType of FAULT_TYPES) {
        const initial = getInitialQuestion(faultType);
        expect(initial).toBeDefined();
        expect(initial.faultType).toBe(faultType);
        expect(getQuestionsForFaultType(faultType).length).toBeGreaterThanOrEqual(4);
      }
    });

    it('ensures every single diagnostic question supports yes, no, and unknown', () => {
      const allQuestions = Object.values(DIAGNOSTIC_QUESTIONS);
      expect(allQuestions.length).toBeGreaterThanOrEqual(20);

      for (const question of allQuestions) {
        const optionValues = question.options.map((opt) => opt.value);
        expect(optionValues).toEqual(['yes', 'no', 'unknown']);
        for (const opt of question.options) {
          expect(opt.label.trim().length).toBeGreaterThan(0);
          expect(opt.hint && opt.hint.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Dynamic branching proof (yes vs no yields different follow-up questions)', () => {
    it('branches dynamically for NO_INTERNET', () => {
      const afterLinkYes = getNextQuestion('NO_INTERNET', [makeAnswer('ni_link', 'yes')]);
      const afterLinkNo = getNextQuestion('NO_INTERNET', [makeAnswer('ni_link', 'no')]);

      expect(afterLinkYes?.id).toBe('ni_apipa');
      expect(afterLinkNo?.id).toBe('ni_other_devices');
      expect(afterLinkYes?.id).not.toBe(afterLinkNo?.id);

      const afterApipaYes = getNextQuestion('NO_INTERNET', [
        makeAnswer('ni_link', 'yes'),
        makeAnswer('ni_apipa', 'yes'),
      ]);
      const afterApipaNo = getNextQuestion('NO_INTERNET', [
        makeAnswer('ni_link', 'yes'),
        makeAnswer('ni_apipa', 'no'),
      ]);
      expect(afterApipaYes?.id).toBe('ni_other_devices');
      expect(afterApipaNo?.id).toBe('ni_gateway_ping');
    });

    it('branches dynamically for VPN_FAILURE', () => {
      const afterBaseYes = getNextQuestion('VPN_FAILURE', [
        makeAnswer('vpn_base_internet', 'yes'),
      ]);
      const afterBaseNo = getNextQuestion('VPN_FAILURE', [
        makeAnswer('vpn_base_internet', 'no'),
      ]);

      expect(afterBaseYes?.id).toBe('vpn_other_network');
      expect(afterBaseNo).toBeNull();

      const afterOtherYes = getNextQuestion('VPN_FAILURE', [
        makeAnswer('vpn_base_internet', 'yes'),
        makeAnswer('vpn_other_network', 'yes'),
      ]);
      const afterOtherNo = getNextQuestion('VPN_FAILURE', [
        makeAnswer('vpn_base_internet', 'yes'),
        makeAnswer('vpn_other_network', 'no'),
      ]);
      expect(afterOtherYes?.id).toBe('vpn_error_stage');
      expect(afterOtherNo?.id).toBe('vpn_port_check');
    });

    it('branches dynamically for DNS_ERROR', () => {
      const afterIpYes = getNextQuestion('DNS_ERROR', [makeAnswer('dns_ip_ok', 'yes')]);
      const afterIpNo = getNextQuestion('DNS_ERROR', [makeAnswer('dns_ip_ok', 'no')]);

      expect(afterIpYes?.id).toBe('dns_all_domains');
      expect(afterIpNo).toBeNull();

      const afterAllYes = getNextQuestion('DNS_ERROR', [
        makeAnswer('dns_ip_ok', 'yes'),
        makeAnswer('dns_all_domains', 'yes'),
      ]);
      const afterAllNo = getNextQuestion('DNS_ERROR', [
        makeAnswer('dns_ip_ok', 'yes'),
        makeAnswer('dns_all_domains', 'no'),
      ]);
      expect(afterAllYes?.id).toBe('dns_alt_server');
      expect(afterAllNo?.id).toBe('dns_cache_or_hosts');
    });

    it('branches dynamically for SLOW_NETWORK', () => {
      const afterWifiYes = getNextQuestion('SLOW_NETWORK', [makeAnswer('slow_wifi', 'yes')]);
      const afterWifiNo = getNextQuestion('SLOW_NETWORK', [makeAnswer('slow_wifi', 'no')]);

      expect(afterWifiYes?.id).toBe('slow_wired_compare');
      expect(afterWifiNo?.id).toBe('slow_other_devices');
    });

    it('branches dynamically for INTERMITTENT_DROP', () => {
      const afterWifiYes = getNextQuestion('INTERMITTENT_DROP', [
        makeAnswer('drop_wifi', 'yes'),
      ]);
      const afterWifiNo = getNextQuestion('INTERMITTENT_DROP', [
        makeAnswer('drop_wifi', 'no'),
      ]);

      expect(afterWifiYes?.id).toBe('drop_signal_or_roam');
      expect(afterWifiNo?.id).toBe('drop_cable_physical');
    });
  });

  describe('Accurate rule evaluation across all 5 fault types', () => {
    it('evaluates NO_INTERNET scenarios accurately (APIPA, ISP/WAN, and DNS/Proxy layer)', () => {
      const apipaRun = runSession(
        'NO_INTERNET',
        { ni_link: 'yes', ni_apipa: 'yes', ni_other_devices: 'no' },
        'ipconfig에서 169.254.12.5 표시'
      );
      expect(apipaRun.result.isConclusive).toBe(true);
      expect(apipaRun.result.candidates[0].ruleId).toBe('RULE-NI-02');
      expect(apipaRun.result.candidates[0].title).toContain('DHCP');
      assertAllSixRequiredSections(apipaRun.result);

      const ispRun = runSession('NO_INTERNET', {
        ni_link: 'yes',
        ni_apipa: 'no',
        ni_gateway_ping: 'yes',
        ni_external_ping: 'no',
      });
      expect(ispRun.result.isConclusive).toBe(true);
      expect(ispRun.result.candidates[0].ruleId).toBe('RULE-NI-04');
      expect(ispRun.result.candidates[0].title).toContain('ISP');
      assertAllSixRequiredSections(ispRun.result);

      const extOkRun = runSession('NO_INTERNET', {
        ni_link: 'yes',
        ni_apipa: 'no',
        ni_gateway_ping: 'yes',
        ni_external_ping: 'yes',
      });
      expect(extOkRun.result.isConclusive).toBe(true);
      expect(extOkRun.result.candidates[0].ruleId).toBe('RULE-NI-05');
      expect(extOkRun.result.candidates[0].title).toContain('DNS');
      assertAllSixRequiredSections(extOkRun.result);

      // Multi-device physical outage escalates severity to critical
      const multiDeviceOutage = runSession('NO_INTERNET', {
        ni_link: 'no',
        ni_other_devices: 'yes',
      });
      expect(multiDeviceOutage.result.isConclusive).toBe(true);
      expect(multiDeviceOutage.result.candidates[0].ruleId).toBe('RULE-NI-01');
      expect(multiDeviceOutage.result.suggestedSeverity).toBe('critical');
    });

    it('evaluates VPN_FAILURE scenarios accurately (base internet down, auth stage, port restriction)', () => {
      const baseDown = runSession('VPN_FAILURE', { vpn_base_internet: 'no' });
      expect(baseDown.answers).toHaveLength(1);
      expect(baseDown.result.isConclusive).toBe(true);
      expect(baseDown.result.candidates[0].ruleId).toBe('RULE-VPN-01');
      assertAllSixRequiredSections(baseDown.result);

      const authStage = runSession('VPN_FAILURE', {
        vpn_base_internet: 'yes',
        vpn_other_network: 'yes',
        vpn_error_stage: 'yes',
      });
      expect(authStage.result.isConclusive).toBe(true);
      expect(authStage.result.candidates[0].ruleId).toBe('RULE-VPN-02');
      expect(authStage.result.candidates[0].title).toContain('인증');
      assertAllSixRequiredSections(authStage.result);

      const portBlocked = runSession('VPN_FAILURE', {
        vpn_base_internet: 'yes',
        vpn_other_network: 'no',
        vpn_port_check: 'yes',
      });
      expect(portBlocked.result.isConclusive).toBe(true);
      expect(portBlocked.result.candidates[0].ruleId).toBe('RULE-VPN-03');
      expect(portBlocked.result.candidates[0].title).toContain('포트');
      assertAllSixRequiredSections(portBlocked.result);
    });

    it('evaluates DNS_ERROR scenarios accurately (upstream down, default resolver, path restriction, local cache)', () => {
      const upstream = runSession('DNS_ERROR', { dns_ip_ok: 'no' });
      expect(upstream.result.isConclusive).toBe(true);
      expect(upstream.result.candidates[0].ruleId).toBe('RULE-DNS-01');
      assertAllSixRequiredSections(upstream.result);

      const defaultResolver = runSession('DNS_ERROR', {
        dns_ip_ok: 'yes',
        dns_all_domains: 'yes',
        dns_alt_server: 'yes',
      });
      expect(defaultResolver.result.isConclusive).toBe(true);
      expect(defaultResolver.result.candidates[0].ruleId).toBe('RULE-DNS-02');
      assertAllSixRequiredSections(defaultResolver.result);

      const dnsPath = runSession('DNS_ERROR', {
        dns_ip_ok: 'yes',
        dns_all_domains: 'yes',
        dns_alt_server: 'no',
      });
      expect(dnsPath.result.isConclusive).toBe(true);
      expect(dnsPath.result.candidates[0].ruleId).toBe('RULE-DNS-03');
      assertAllSixRequiredSections(dnsPath.result);

      const localCache = runSession('DNS_ERROR', {
        dns_ip_ok: 'yes',
        dns_all_domains: 'no',
        dns_cache_or_hosts: 'yes',
      });
      expect(localCache.result.isConclusive).toBe(true);
      expect(localCache.result.candidates[0].ruleId).toBe('RULE-DNS-04');
      expect(localCache.result.candidates[0].title).toContain('캐시');
      assertAllSixRequiredSections(localCache.result);
    });

    it('evaluates SLOW_NETWORK scenarios accurately (Wi-Fi, specific server, ISP congestion, endpoint resource)', () => {
      const wifiSlow = runSession('SLOW_NETWORK', {
        slow_wifi: 'yes',
        slow_wired_compare: 'no',
        slow_gateway_latency: 'yes',
      });
      expect(wifiSlow.result.isConclusive).toBe(true);
      expect(wifiSlow.result.candidates[0].ruleId).toBe('RULE-SLOW-01');
      assertAllSixRequiredSections(wifiSlow.result);

      const specificRoute = runSession('SLOW_NETWORK', {
        slow_wifi: 'no',
        slow_other_devices: 'yes',
        slow_gateway_latency: 'no',
        slow_specific_service: 'yes',
      });
      expect(specificRoute.result.isConclusive).toBe(true);
      expect(specificRoute.result.candidates[0].ruleId).toBe('RULE-SLOW-02');
      assertAllSixRequiredSections(specificRoute.result);

      const bandwidthSat = runSession('SLOW_NETWORK', {
        slow_wifi: 'no',
        slow_other_devices: 'yes',
        slow_gateway_latency: 'no',
        slow_specific_service: 'no',
      });
      expect(bandwidthSat.result.isConclusive).toBe(true);
      expect(bandwidthSat.result.candidates[0].ruleId).toBe('RULE-SLOW-03');
      assertAllSixRequiredSections(bandwidthSat.result);

      const endpointBusy = runSession('SLOW_NETWORK', {
        slow_wifi: 'no',
        slow_other_devices: 'no',
        slow_gateway_latency: 'no',
        slow_specific_service: 'no',
      });
      expect(endpointBusy.result.isConclusive).toBe(true);
      expect(endpointBusy.result.candidates[0].ruleId).toBe('RULE-SLOW-04');
      assertAllSixRequiredSections(endpointBusy.result);
    });

    it('evaluates INTERMITTENT_DROP scenarios accurately (Wi-Fi roam, loose cable, router/ISP, NIC driver)', () => {
      const wifiDrop = runSession('INTERMITTENT_DROP', {
        drop_wifi: 'yes',
        drop_signal_or_roam: 'yes',
        drop_all_devices: 'no',
        drop_ping_loss: 'yes',
      });
      expect(wifiDrop.result.isConclusive).toBe(true);
      expect(wifiDrop.result.candidates[0].ruleId).toBe('RULE-DROP-01');
      assertAllSixRequiredSections(wifiDrop.result);

      const cableDrop = runSession('INTERMITTENT_DROP', {
        drop_wifi: 'no',
        drop_cable_physical: 'yes',
        drop_all_devices: 'no',
        drop_ping_loss: 'yes',
      });
      expect(cableDrop.result.isConclusive).toBe(true);
      expect(cableDrop.result.candidates[0].ruleId).toBe('RULE-DROP-02');
      assertAllSixRequiredSections(cableDrop.result);

      const routerDrop = runSession('INTERMITTENT_DROP', {
        drop_wifi: 'no',
        drop_cable_physical: 'no',
        drop_all_devices: 'yes',
        drop_ping_loss: 'yes',
      });
      expect(routerDrop.result.isConclusive).toBe(true);
      expect(routerDrop.result.candidates[0].ruleId).toBe('RULE-DROP-03');
      assertAllSixRequiredSections(routerDrop.result);

      const nicDrop = runSession('INTERMITTENT_DROP', {
        drop_wifi: 'no',
        drop_cable_physical: 'no',
        drop_all_devices: 'no',
        drop_ping_loss: 'yes',
      });
      expect(nicDrop.result.isConclusive).toBe(true);
      expect(nicDrop.result.candidates[0].ruleId).toBe('RULE-DROP-04');
      assertAllSixRequiredSections(nicDrop.result);
    });
  });

  describe('Dynamic reflection of user answers (not canned static output)', () => {
    it('produces distinct causes, evidence, check steps, and resolutions for different answer paths', () => {
      const customSymptom = '오전 10시 15분부터 그룹웨어 도메인 접속 불가';
      const customNote = 'nslookup example.com 8.8.8.8 정상 확인';

      const pathA = evaluateDiagnosis({
        faultType: 'DNS_ERROR',
        symptomSummary: customSymptom,
        answers: [
          makeAnswer('dns_ip_ok', 'yes'),
          makeAnswer('dns_all_domains', 'yes'),
          makeAnswer('dns_alt_server', 'yes', customNote),
        ],
      });

      const pathB = evaluateDiagnosis({
        faultType: 'DNS_ERROR',
        symptomSummary: '특정 개발 서버 도메인만 열리지 않음',
        answers: [
          makeAnswer('dns_ip_ok', 'yes'),
          makeAnswer('dns_all_domains', 'no'),
          makeAnswer('dns_cache_or_hosts', 'yes'),
        ],
      });

      assertAllSixRequiredSections(pathA);
      assertAllSixRequiredSections(pathB);

      expect(pathA.candidates[0].ruleId).not.toBe(pathB.candidates[0].ruleId);
      expect(pathA.candidates[0].title).not.toBe(pathB.candidates[0].title);
      expect(pathA.evidence.join('\n')).not.toBe(pathB.evidence.join('\n'));
      expect(pathA.safeResolutions.join('\n')).not.toBe(pathB.safeResolutions.join('\n'));

      // Verify user symptom and note dynamically reflected in output
      expect(pathA.userSymptomSummary).toBe(customSymptom);
      expect(pathA.evidence.some((line) => line.includes(customSymptom))).toBe(true);
      expect(pathA.evidence.some((line) => line.includes(customNote))).toBe(true);
      expect(pathA.inputSummary[2].note).toBe(customNote);
    });
  });

  describe('Insufficient evidence handling (all unknown or >= 50% unknown)', () => {
    it('sets isConclusive === false for all-unknown answers across all 5 fault types', () => {
      for (const faultType of FAULT_TYPES) {
        const { answers, result } = runSession(faultType, {});
        expect(answers.length).toBeGreaterThan(0);
        expect(answers.every((a) => a.value === 'unknown')).toBe(true);

        expect(result.isConclusive).toBe(false);
        expect(result.conclusivenessNotice).toContain('단일 원인을 확정하기 어렵습니다');
        expect(result.evidence.some((line) => line.includes('근거 부족 판정'))).toBe(true);
        expect(
          result.additionalChecksNeeded.some((item) => item.includes('[미확인 항목'))
        ).toBe(true);
        assertAllSixRequiredSections(result);
      }
    });

    it('sets isConclusive === false when >= 50% of answers are unknown', () => {
      // 2 of 4 answers are unknown (50%)
      const fiftyPercentUnknown = evaluateDiagnosis({
        faultType: 'INTERMITTENT_DROP',
        answers: [
          makeAnswer('drop_wifi', 'no'),
          makeAnswer('drop_cable_physical', 'yes'),
          makeAnswer('drop_all_devices', 'unknown'),
          makeAnswer('drop_ping_loss', 'unknown'),
        ],
      });

      expect(fiftyPercentUnknown.isConclusive).toBe(false);
      expect(fiftyPercentUnknown.conclusivenessNotice).toContain('50%');
      expect(fiftyPercentUnknown.conclusivenessNotice).toContain(
        '단일 원인을 확정하기 어렵습니다'
      );
      expect(fiftyPercentUnknown.additionalChecksNeeded.length).toBeGreaterThanOrEqual(2);
      assertAllSixRequiredSections(fiftyPercentUnknown);
    });

    it('sets isConclusive === false when zero answers are supplied', () => {
      const emptyResult = evaluateDiagnosis({
        faultType: 'NO_INTERNET',
        answers: [],
      });

      expect(emptyResult.isConclusive).toBe(false);
      expect(emptyResult.conclusivenessNotice).toContain('단일 원인을 확정하기 어렵습니다');
      assertAllSixRequiredSections(emptyResult);
    });
  });

  describe('Safety invariants across diagnostic engine & command guides', () => {
    it('never recommends disabling firewalls/security, never claims automatic setting mutation, and never fabricates live latency/speed metrics', () => {
      const sampledScenarios: Array<{
        faultType: FaultType;
        answers: Record<string, AnswerValue>;
      }> = [
        { faultType: 'NO_INTERNET', answers: { ni_link: 'no', ni_other_devices: 'no' } },
        { faultType: 'NO_INTERNET', answers: { ni_link: 'yes', ni_apipa: 'yes', ni_other_devices: 'yes' } },
        { faultType: 'NO_INTERNET', answers: { ni_link: 'yes', ni_apipa: 'no', ni_gateway_ping: 'no', ni_other_devices: 'no' } },
        { faultType: 'NO_INTERNET', answers: { ni_link: 'yes', ni_apipa: 'no', ni_gateway_ping: 'yes', ni_external_ping: 'no' } },
        { faultType: 'NO_INTERNET', answers: { ni_link: 'yes', ni_apipa: 'no', ni_gateway_ping: 'yes', ni_external_ping: 'yes' } },
        { faultType: 'NO_INTERNET', answers: {} },
        { faultType: 'VPN_FAILURE', answers: { vpn_base_internet: 'no' } },
        { faultType: 'VPN_FAILURE', answers: { vpn_base_internet: 'yes', vpn_other_network: 'yes', vpn_error_stage: 'yes' } },
        { faultType: 'VPN_FAILURE', answers: { vpn_base_internet: 'yes', vpn_other_network: 'no', vpn_port_check: 'yes' } },
        { faultType: 'VPN_FAILURE', answers: {} },
        { faultType: 'DNS_ERROR', answers: { dns_ip_ok: 'no' } },
        { faultType: 'DNS_ERROR', answers: { dns_ip_ok: 'yes', dns_all_domains: 'yes', dns_alt_server: 'yes' } },
        { faultType: 'DNS_ERROR', answers: { dns_ip_ok: 'yes', dns_all_domains: 'yes', dns_alt_server: 'no' } },
        { faultType: 'DNS_ERROR', answers: { dns_ip_ok: 'yes', dns_all_domains: 'no', dns_cache_or_hosts: 'yes' } },
        { faultType: 'DNS_ERROR', answers: {} },
        { faultType: 'SLOW_NETWORK', answers: { slow_wifi: 'yes', slow_wired_compare: 'no', slow_gateway_latency: 'yes' } },
        { faultType: 'SLOW_NETWORK', answers: { slow_wifi: 'no', slow_other_devices: 'yes', slow_gateway_latency: 'no', slow_specific_service: 'yes' } },
        { faultType: 'SLOW_NETWORK', answers: { slow_wifi: 'no', slow_other_devices: 'yes', slow_gateway_latency: 'no', slow_specific_service: 'no' } },
        { faultType: 'SLOW_NETWORK', answers: { slow_wifi: 'no', slow_other_devices: 'no', slow_gateway_latency: 'no', slow_specific_service: 'no' } },
        { faultType: 'SLOW_NETWORK', answers: {} },
        { faultType: 'INTERMITTENT_DROP', answers: { drop_wifi: 'yes', drop_signal_or_roam: 'yes', drop_all_devices: 'no', drop_ping_loss: 'yes' } },
        { faultType: 'INTERMITTENT_DROP', answers: { drop_wifi: 'no', drop_cable_physical: 'yes', drop_all_devices: 'no', drop_ping_loss: 'yes' } },
        { faultType: 'INTERMITTENT_DROP', answers: { drop_wifi: 'no', drop_cable_physical: 'no', drop_all_devices: 'yes', drop_ping_loss: 'yes' } },
        { faultType: 'INTERMITTENT_DROP', answers: { drop_wifi: 'no', drop_cable_physical: 'no', drop_all_devices: 'no', drop_ping_loss: 'yes' } },
        { faultType: 'INTERMITTENT_DROP', answers: {} },
      ];

      // Patterns that affirmatively instruct disabling security/firewall or mutating OS network state
      const unsafeGuidancePatterns: RegExp[] = [
        /방화벽을\s*(끄|해제|비활성화하[세고]|중단)/,
        /Windows\s*Defender.*(끄|비활성화하[세고]|해제)/i,
        /백신.*(끄|종료하[세고]|비활성화하[세고])/,
        /보안\s*(기능|프로그램|솔루션)을?\s*(끄|해제하[세고]|비활성화하[세고])/,
        /netsh\s+advfirewall/i,
        /Set-NetFirewallProfile/i,
        /자동으로\s*네트워크\s*설정을\s*(변경|수정|복구)했/,
        /설정을\s*자동\s*(변경|수정)합니다/,
      ];

      // Fabricated live measurement numbers (e.g. "현재 속도 85 Mbps", "실측 지연 24ms")
      const fabricatedLiveMetricsPatterns: RegExp[] = [
        /\b\d+(\.\d+)?\s*(Mbps|Gbps|Kbps)\b/i,
        /(현재|실측|측정된)\s*(지연|응답\s*시간|속도|패킷\s*손실)\s*[:=]?\s*\d+/i,
      ];

      for (const scenario of sampledScenarios) {
        const { result } = runSession(scenario.faultType, scenario.answers);
        const corpus = [
          result.conclusivenessNotice,
          ...result.candidates.flatMap((c) => [c.title, c.explanation, ...c.supportingEvidence]),
          ...result.evidence,
          ...result.recommendedCheckOrder.flatMap((s) => [s.title, s.instruction]),
          ...result.safeResolutions,
          ...result.additionalChecksNeeded,
        ].join('\n');

        for (const pattern of unsafeGuidancePatterns) {
          expect(corpus).not.toMatch(pattern);
        }
        for (const pattern of fabricatedLiveMetricsPatterns) {
          expect(corpus).not.toMatch(pattern);
        }
      }

      // Also verify all 5 Windows command guides adhere to read-only safety invariants
      for (const guide of WINDOWS_COMMAND_GUIDES) {
        const guideCorpus = [
          guide.summary,
          guide.safetyNote,
          ...guide.safeExamples.flatMap((ex) => [ex.label, ex.command, ex.purpose]),
          ...guide.executionSteps,
          ...guide.interpretations.flatMap((i) => [i.meaning, i.safeNextStep]),
        ].join('\n');

        for (const pattern of unsafeGuidancePatterns) {
          expect(guideCorpus).not.toMatch(pattern);
        }

        // Verify safeExamples never contain mutating Windows network flags
        for (const example of guide.safeExamples) {
          expect(example.command).not.toMatch(/\/(release|renew|flushdns|registerdns)/i);
          expect(example.command).not.toMatch(/\bnetsh\b/i);
        }
      }
    });
  });
});
