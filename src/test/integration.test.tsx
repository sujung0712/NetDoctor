import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { createIncidentRecord, loadIncidents } from '../storage';
import { STORAGE_KEYS } from '../types';

function getSidebar(): HTMLElement {
  return screen.getByRole('complementary', { name: '주요 내비게이션' });
}

describe('NetDoctor End-to-End UI Integration Flows', () => {
  it('Flow A: completes DNS_ERROR diagnosis from Dashboard, saves to LocalStorage, persists across remount, and updates Dashboard KPIs strictly from stored records', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    // Initial Dashboard KPIs must reflect 0 stored records
    const kpiSection = screen.getByRole('region', { name: '핵심 장애 지표' });
    expect(within(kpiSection).getByText('전체 장애 건수').parentElement?.parentElement).toHaveTextContent('0건');
    expect(within(kpiSection).getByText('해결 건수').parentElement?.parentElement).toHaveTextContent('0건');
    expect(within(kpiSection).getByText('미해결 건수').parentElement?.parentElement).toHaveTextContent('0건');
    expect(within(kpiSection).getByText('해결률').parentElement?.parentElement).toHaveTextContent('0%');
    expect(within(kpiSection).getByText('평균 처리 시간').parentElement?.parentElement).toHaveTextContent('데이터 없음');

    // Start new diagnosis from Dashboard main area
    const main = screen.getByRole('main');
    const startButtons = within(main).getAllByRole('button', { name: /신규 진단 시작/ });
    await user.click(startButtons[0]);

    // Step 1: Select DNS_ERROR and enter symptom summary
    expect(screen.getByRole('heading', { name: '네트워크 장애 진단 마법사' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /DNS 오류/ }));
    await user.type(
      screen.getByLabelText(/상세 증상 메모/),
      '사내 포털 도메인 접속 시 NXDOMAIN 오류 발생'
    );
    await user.click(within(main).getByRole('button', { name: /진단 시작/ }));

    // Step 2: Dynamic Q&A for DNS_ERROR (dns_ip_ok=yes -> dns_all_domains=yes -> dns_alt_server=yes)
    expect(
      screen.getByText(/외부 IP 주소\(예: ping 8\.8\.8\.8\)로의 통신은 정상 응답하나요\?/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^예/ }));
    await user.click(screen.getByRole('button', { name: /다음 질문/ }));

    expect(
      screen.getByText(/대부분의 웹사이트·도메인 이름 해석이 모두 실패하나요\?/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^예/ }));
    await user.click(screen.getByRole('button', { name: /다음 질문/ }));

    expect(
      screen.getByText(/nslookup example\.com 8\.8\.8\.8처럼 다른 공용 DNS를 지정해 조회하면 성공하나요\?/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /^예/ }));
    await user.click(screen.getByRole('button', { name: /진단 결과 분석/ }));

    // Step 3: Verify all 6 required result sections are rendered
    expect(screen.getByRole('heading', { name: '가능한 원인 후보' })).toBeInTheDocument();
    expect(screen.getByText('RULE-DNS-02')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '판단 근거' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '사용자 입력 요약' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '추천 점검 순서' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '안전한 해결 방법' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '추가 확인이 필요한 사항' })).toBeInTheDocument();
    expect(
      screen.getAllByText(/사내 포털 도메인 접속 시 NXDOMAIN 오류 발생/).length
    ).toBeGreaterThanOrEqual(1);

    // Save to incident history
    const titleInput = screen.getByLabelText(/장애 제목/);
    await user.clear(titleInput);
    await user.type(titleInput, '사내 포털 DNS 리졸버 장애 진단');
    await user.type(
      screen.getByLabelText(/조치 및 확인 메모/),
      'nslookup example.com 8.8.8.8 정상 응답 확인 후 IT팀 전달 예정'
    );
    await user.click(screen.getByRole('button', { name: '장애 이력으로 저장' }));

    expect(screen.getByText('장애 이력이 저장되었습니다.')).toBeInTheDocument();

    // Verify LocalStorage persistence directly
    const storedRaw = window.localStorage.getItem(STORAGE_KEYS.INCIDENTS);
    expect(storedRaw).not.toBeNull();
    const storedRecords = loadIncidents();
    expect(storedRecords).toHaveLength(1);
    expect(storedRecords[0].title).toBe('사내 포털 DNS 리졸버 장애 진단');
    expect(storedRecords[0].faultType).toBe('DNS_ERROR');
    expect(storedRecords[0].status).toBe('open');

    // Unmount and remount App to prove full reload persistence & strict KPI computation
    unmount();
    render(<App />);

    const remountedKpi = screen.getByRole('region', { name: '핵심 장애 지표' });
    expect(within(remountedKpi).getByText('전체 장애 건수').parentElement?.parentElement).toHaveTextContent('1건');
    expect(within(remountedKpi).getByText('해결 건수').parentElement?.parentElement).toHaveTextContent('0건');
    expect(within(remountedKpi).getByText('미해결 건수').parentElement?.parentElement).toHaveTextContent('1건');
    expect(within(remountedKpi).getByText('해결률').parentElement?.parentElement).toHaveTextContent('0%');
    expect(within(remountedKpi).getByText('평균 처리 시간').parentElement?.parentElement).toHaveTextContent('데이터 없음');
    expect(screen.getByText('사내 포털 DNS 리졸버 장애 진단')).toBeInTheDocument();
  });

  it('Flow B: verifies all 5 Windows commands in Command Guide, search, category filter, copy feedback, and Microsoft Learn links', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    render(<App />);

    await user.click(within(getSidebar()).getByRole('button', { name: /명령어 가이드/ }));

    const commandList = screen.getByRole('complementary', { name: '진단 명령어 목록' });
    const expectedCommands = [
      { label: 'ipconfig /all', urlPart: 'windows-commands/ipconfig' },
      { label: 'ping', urlPart: 'windows-commands/ping' },
      { label: 'nslookup', urlPart: 'windows-commands/nslookup' },
      { label: 'tracert', urlPart: 'windows-commands/tracert' },
      { label: 'Test-NetConnection', urlPart: 'nettcpip/test-netconnection' },
    ];

    // Verify all 5 commands exist and each links to official Microsoft Learn documentation
    for (const cmd of expectedCommands) {
      const cmdBtn = within(commandList).getByRole('button', {
        name: new RegExp(cmd.label.replace('/', '\\/'), 'i'),
      });
      await user.click(cmdBtn);

      const detailArticle = screen.getByRole('article', { name: `${cmd.label} 상세 가이드` });
      const docLink = within(detailArticle).getByRole('link', { name: /Microsoft 공식 문서/ });
      expect(docLink).toHaveAttribute(
        'href',
        expect.stringContaining(`https://learn.microsoft.com/en-us/`)
      );
      expect(docLink).toHaveAttribute('href', expect.stringContaining(cmd.urlPart));
      expect(docLink).toHaveAttribute('target', '_blank');
      expect(docLink).toHaveAttribute('rel', 'noopener noreferrer');
    }

    // Test copy button feedback on Test-NetConnection
    const copyButtons = screen.getAllByRole('button', { name: /명령어 복사/ });
    await user.click(copyButtons[0]);
    expect(writeTextSpy).toHaveBeenCalledWith(
      'Test-NetConnection -ComputerName example.com -Port 443'
    );
    expect(screen.getByText('복사됨')).toBeInTheDocument();

    // Test search input filtering
    const searchBox = screen.getByRole('searchbox', { name: 'Windows 네트워크 명령어 검색' });
    await user.type(searchBox, '169.254');
    expect(screen.getByText(/총 5개 중/)).toHaveTextContent('총 5개 중 1개 표시');
    expect(
      within(screen.getByRole('complementary', { name: '진단 명령어 목록' })).getAllByRole('button')
    ).toHaveLength(1);

    // Reset filter
    await user.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(screen.getByText(/총 5개 중/)).toHaveTextContent('총 5개 중 5개 표시');

    // Test category filter
    const categoryGroup = screen.getByRole('group', { name: '명령어 카테고리 필터' });
    await user.click(within(categoryGroup).getByRole('button', { name: /DNS 이름 해석/ }));
    expect(screen.getByText(/총 5개 중/)).toHaveTextContent('총 5개 중 1개 표시');
    expect(screen.getByRole('article', { name: 'nslookup 상세 가이드' })).toBeInTheDocument();

    await user.click(within(categoryGroup).getByRole('button', { name: /^전체/ }));
    expect(screen.getByText(/총 5개 중/)).toHaveTextContent('총 5개 중 5개 표시');
  });

  it('Flow C: executes Incident History CRUD (create, edit & resolve with resolution time, delete, and verify persistence)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(within(getSidebar()).getByRole('button', { name: /장애 이력/ }));

    // Create manual incident
    await user.click(screen.getAllByRole('button', { name: /수동 장애 등록/ })[0]);
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/장애 제목/), '회의실 유선 LAN 단절 점검');
    await user.selectOptions(within(dialog).getByLabelText('장애 유형'), 'NO_INTERNET');
    await user.selectOptions(within(dialog).getByLabelText('심각도'), 'high');
    await user.selectOptions(within(dialog).getByLabelText('상태'), 'open');

    const occurredInput = within(dialog).getByLabelText('장애 발생 시각');
    await user.clear(occurredInput);
    await user.type(occurredInput, '2026-11-26T10:00');

    await user.type(
      within(dialog).getByLabelText('증상 요약'),
      '유선 연결 표시이나 게이트웨이 응답 없음'
    );
    await user.type(
      within(dialog).getByLabelText('조치 내역'),
      '1차 LAN 케이블 재체결 확인'
    );

    await user.click(within(dialog).getByRole('button', { name: '이력 등록' }));

    expect(screen.getByText('회의실 유선 LAN 단절 점검')).toBeInTheDocument();
    expect(loadIncidents()).toHaveLength(1);

    // Edit incident: update action notes, mark resolved 30 minutes later
    await user.click(screen.getByRole('button', { name: '수정' }));
    const editDialog = screen.getByRole('dialog');

    await user.selectOptions(within(editDialog).getByLabelText('상태'), 'resolved');
    const resolvedInput = within(editDialog).getByLabelText(/해결 시각/);
    await user.clear(resolvedInput);
    await user.type(resolvedInput, '2026-11-26T10:30');

    const notesTextarea = within(editDialog).getByLabelText('조치 내역');
    await user.clear(notesTextarea);
    await user.type(notesTextarea, '스위치 예비 포트로 교체 후 게이트웨이 ping 정상 복구');

    await user.click(within(editDialog).getByRole('button', { name: '변경 사항 저장' }));

    // Verify status, updated notes, and deterministic 30-minute resolution time
    const incidentCard = screen.getByRole('article');
    expect(within(incidentCard).getByText('해결됨')).toBeInTheDocument();
    expect(within(incidentCard).getByText('소요 시간: 30분')).toBeInTheDocument();
    expect(
      within(incidentCard).getByText('스위치 예비 포트로 교체 후 게이트웨이 ping 정상 복구')
    ).toBeInTheDocument();

    const updatedInStorage = loadIncidents();
    expect(updatedInStorage[0].status).toBe('resolved');
    expect(updatedInStorage[0].resolutionMinutes).toBe(30);

    // Delete incident
    await user.click(within(incidentCard).getByRole('button', { name: '삭제' }));
    const deleteDialog = screen.getByRole('dialog');
    await user.click(within(deleteDialog).getByRole('button', { name: '영구 삭제' }));

    expect(screen.queryByText('회의실 유선 LAN 단절 점검')).not.toBeInTheDocument();
    expect(loadIncidents()).toHaveLength(0);

    // Confirm deletion persists across remount
    unmount();
    render(<App />);
    await user.click(within(getSidebar()).getByRole('button', { name: /장애 이력/ }));
    expect(screen.getByText('등록된 장애 이력이 없습니다')).toBeInTheDocument();
  });

  it('Flow D: loads sample data with unmistakable [샘플] badges and clears sample data while preserving real records', async () => {
    const user = userEvent.setup();

    // Seed one real user record to ensure sample clearing only removes sample records
    createIncidentRecord({
      title: '실제 사내 회선 점검 기록',
      faultType: 'NO_INTERNET',
      severity: 'medium',
      status: 'open',
      symptomSummary: '외부 회선 단절',
      userCheckSummary: [],
      possibleCauses: [],
      evidence: [],
      actionNotes: 'ISP 문의 완료',
    });

    // Clear storage first to test Dashboard empty-state "샘플 데이터 불러오기" button
    window.localStorage.clear();

    render(<App />);

    const loadSampleBtns = screen.getAllByRole('button', { name: /샘플 데이터 불러오기/ });
    await user.click(loadSampleBtns[0]);

    // Verify sample warning banner and [샘플] badges
    expect(
      screen.getByText('시연용 샘플 데이터 4건이 포함되어 있습니다.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('[샘플]').length).toBeGreaterThanOrEqual(4);

    // Verify KPIs reflect 4 sample records (2 resolved, 2 unresolved, 50% rate)
    const kpiSection = screen.getByRole('region', { name: '핵심 장애 지표' });
    expect(within(kpiSection).getByText('전체 장애 건수').parentElement?.parentElement).toHaveTextContent('4건');
    expect(within(kpiSection).getByText('해결 건수').parentElement?.parentElement).toHaveTextContent('2건');
    expect(within(kpiSection).getByText('미해결 건수').parentElement?.parentElement).toHaveTextContent('2건');
    expect(within(kpiSection).getByText('해결률').parentElement?.parentElement).toHaveTextContent('50%');

    // Clear sample data
    await user.click(screen.getByRole('button', { name: /샘플 데이터 삭제/ }));

    expect(screen.queryByText('[샘플]')).not.toBeInTheDocument();
    expect(loadIncidents()).toHaveLength(0);
    expect(screen.getByText('아직 저장된 장애 이력이 없습니다.')).toBeInTheDocument();
  });

  it('Flow E: generates Incident Report with all 6 required sections in Markdown & plain text, copies to clipboard, and excludes deferred feature-branch controls', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    const created = createIncidentRecord({
      title: '재택근무 VPN 포트 제한 점검 보고',
      faultType: 'VPN_FAILURE',
      severity: 'high',
      status: 'resolved',
      symptomSummary: '일반 인터넷은 정상이나 사내 VPN 연결 시 시간 초과 발생',
      userCheckSummary: [
        'VPN 해제 시 일반 인터넷 접속: 예',
        '모바일 핫스팟 교차 테스트: 정상 연결',
      ],
      possibleCauses: ['현재 네트워크·공유기의 VPN 포트 또는 프로토콜 경로 제한'],
      evidence: ['Test-NetConnection TCP 443 실패 확인'],
      actionNotes: 'IT 지원팀 안내에 따라 SSL-VPN 공식 프로파일로 전환 완료',
      occurredAt: '2026-11-26T01:00:00.000Z',
      resolvedAt: '2026-11-26T01:45:00.000Z',
    });
    expect(created).not.toBeNull();

    render(<App />);
    await user.click(within(getSidebar()).getByRole('button', { name: /장애 보고서/ }));

    // Verify all 6 required sections in Markdown preview
    const previewCode = document.querySelector('pre code');
    expect(previewCode).not.toBeNull();
    const markdownText = previewCode?.textContent ?? '';

    expect(markdownText).toContain('## 1. 장애 유형');
    expect(markdownText).toContain('## 2. 사용자 점검 결과');
    expect(markdownText).toContain('## 3. 가능한 원인 후보');
    expect(markdownText).toContain('## 4. 판단 근거');
    expect(markdownText).toContain('## 5. 조치 내역');
    expect(markdownText).toContain('## 6. 해결 상태');
    expect(markdownText).toContain('VPN 연결 실패');
    expect(markdownText).toContain('45분');

    // Copy Markdown report
    await user.click(screen.getByRole('button', { name: '보고서 복사' }));
    expect(writeTextSpy).toHaveBeenCalledWith(markdownText);
    expect(screen.getByRole('button', { name: '복사 완료' })).toBeInTheDocument();

    // Switch to plain text format and verify all 6 required sections
    await user.click(screen.getByRole('button', { name: '일반 텍스트' }));
    const plainText = document.querySelector('pre code')?.textContent ?? '';

    expect(plainText).toContain('[1. 장애 유형]');
    expect(plainText).toContain('[2. 사용자 점검 결과]');
    expect(plainText).toContain('[3. 가능한 원인 후보]');
    expect(plainText).toContain('[4. 판단 근거]');
    expect(plainText).toContain('[5. 조치 내역]');
    expect(plainText).toContain('[6. 해결 상태]');
    expect(plainText).not.toContain('## 1. 장애 유형');

    // Verify base version does NOT include file download or advanced diagnosis comparison controls
    expect(
      screen.queryByRole('button', { name: /다운로드|내보내기|download|export/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /진단 비교|결과 비교|비교하기/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/feature\/report-download/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/feature\/diagnosis-comparison/)
    ).toBeInTheDocument();
  });
});
