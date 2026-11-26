import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ReportPage } from '../features/report/ReportPage';
import {
  REPORT_MIME_TYPES,
  buildSafeReportFilename,
  createIncidentRecord,
  createReportBlob,
  downloadIncidentReport,
  downloadReportContent,
} from '../storage';
import type { IncidentRecord } from '../types';

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Expected ArrayBuffer from FileReader'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsArrayBuffer(blob);
  });
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  const buffer = await readBlobAsArrayBuffer(blob);
  return new Uint8Array(buffer);
}

async function readBlobText(blob: Blob, ignoreBOM = false): Promise<string> {
  const bytes = await readBlobBytes(blob);
  return new TextDecoder('utf-8', { ignoreBOM }).decode(bytes);
}

const activeUrlRestorers: Array<() => void> = [];

function stubObjectUrlApi(
  createImpl: (obj: Blob | MediaSource) => string = () => 'blob:netdoctor-mock-url'
) {
  const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

  const createObjectURL = vi.fn(createImpl);
  const revokeObjectURL = vi.fn();

  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
    writable: true,
  });

  activeUrlRestorers.push(() => {
    if (originalCreate) {
      Object.defineProperty(URL, 'createObjectURL', originalCreate);
    } else {
      delete (URL as unknown as Record<string, unknown>).createObjectURL;
    }
    if (originalRevoke) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    } else {
      delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
    }
  });

  return { createObjectURL, revokeObjectURL };
}

function buildSampleIncident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    id: 'inc-download-test-1',
    title: '사내 위키 접속 불가',
    faultType: 'DNS_ERROR',
    severity: 'high',
    status: 'resolved',
    symptomSummary: '사내 위키 도메인 이름 해석 실패 및 브라우저 연결 오류 발생',
    userCheckSummary: [
      '외부 IP 통신(ping 8.8.8.8): 정상',
      '공용 DNS 지정 nslookup: 정상 응답',
    ],
    possibleCauses: ['사내 DNS 서버 캐시 지연 또는 응답 오류'],
    evidence: ['IP 통신은 정상이나 도메인 조회만 실패'],
    actionNotes: '로컬 DNS 캐시 확인 후 사내 IT 지원팀에 DNS 장애 티켓 접수 완료',
    occurredAt: '2026-11-26T02:00:00.000Z',
    resolvedAt: '2026-11-26T02:35:00.000Z',
    resolutionMinutes: 35,
    updatedAt: '2026-11-26T02:35:00.000Z',
    ...overrides,
  };
}

function getSidebar(): HTMLElement {
  return screen.getByRole('complementary', { name: '주요 내비게이션' });
}

describe('Report Download (feature/report-download)', () => {
  afterEach(() => {
    while (activeUrlRestorers.length > 0) {
      const restore = activeUrlRestorers.pop();
      restore?.();
    }
    vi.restoreAllMocks();
  });

  describe('Unit tests: buildSafeReportFilename', () => {
    it('preserves Korean titles and appends .md or .txt with deterministic UTC date stamp', () => {
      const incident = {
        title: '사내 위키 접속 불가',
        faultType: 'DNS_ERROR' as const,
        occurredAt: '2026-11-26T03:15:00.000Z',
      };

      expect(buildSafeReportFilename(incident, 'markdown')).toBe(
        'netdoctor-report-사내-위키-접속-불가-20261126.md'
      );
      expect(buildSafeReportFilename(incident, 'text')).toBe(
        'netdoctor-report-사내-위키-접속-불가-20261126.txt'
      );
    });

    it('strips path traversal, Windows illegal characters, control characters, and HTML tags', () => {
      const traversalFilename = buildSafeReportFilename(
        {
          title: '../../etc/passwd',
          faultType: 'NO_INTERNET',
          occurredAt: '2026-11-26T00:00:00.000Z',
        },
        'markdown'
      );
      expect(traversalFilename).toBe('netdoctor-report-etc-passwd-20261126.md');
      expect(traversalFilename).not.toContain('..');
      expect(traversalFilename).not.toMatch(/[/\\]/);

      const illegalCharsFilename = buildSafeReportFilename(
        {
          title: 'VPN<장애>: "포트" / 경로 \\ 점검 | 상태? *긴급*\u0000\r\n\t\u001f\u007f',
          faultType: 'VPN_FAILURE',
          occurredAt: '2026-11-26T00:00:00.000Z',
        },
        'text'
      );
      expect(illegalCharsFilename).toMatch(/^netdoctor-report-.*-20261126\.txt$/);
      expect(illegalCharsFilename).not.toMatch(/[<>:"/\\|?*]/);
      for (let i = 0; i < illegalCharsFilename.length; i += 1) {
        const code = illegalCharsFilename.charCodeAt(i);
        expect(code).toBeGreaterThanOrEqual(0x20);
        expect(code).not.toBe(0x7f);
      }

      const xssTitleFilename = buildSafeReportFilename(
        {
          title: '<script>alert(1)</script> 사내망 점검',
          faultType: 'DNS_ERROR',
          occurredAt: '2026-11-26T00:00:00.000Z',
        },
        'markdown'
      );
      expect(xssTitleFilename).toBe('netdoctor-report-alert-1-사내망-점검-20261126.md');
      expect(xssTitleFilename).not.toContain('<script>');
      expect(xssTitleFilename).not.toMatch(/[<>/"']/);
    });

    it('guards Windows reserved device names (CON, NUL, COM1, LPT1) in both builder and direct download', () => {
      for (const reserved of ['CON', 'con', 'NUL', 'COM1', 'PRN', 'AUX', 'LPT1']) {
        const built = buildSafeReportFilename(
          {
            title: reserved,
            faultType: 'SLOW_NETWORK',
            occurredAt: '2026-11-26T00:00:00.000Z',
          },
          'markdown'
        );
        expect(built).toBe(`netdoctor-report-file-${reserved}-20261126.md`);
      }

      // Direct downloadReportContent filename guard
      const { createObjectURL, revokeObjectURL } = stubObjectUrlApi(
        () => 'blob:netdoctor-reserved'
      );
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});

      const result = downloadReportContent('보고서 본문', 'CON.txt', 'text');
      expect(result.ok).toBe(true);
      expect(result.filename).toBe('netdoctor-CON.txt');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:netdoctor-reserved');
    });

    it('clamps overly long titles and falls back cleanly for symbol-only titles', () => {
      const longTitle = '네트워크장애보고서제목매우길게작성된테스트케이스'.repeat(6);
      const clamped = buildSafeReportFilename(
        {
          title: longTitle,
          faultType: 'INTERMITTENT_DROP',
          occurredAt: '2026-11-26T00:00:00.000Z',
        },
        'markdown'
      );
      const slugMatch = clamped.match(/^netdoctor-report-(.+)-20261126\.md$/);
      expect(slugMatch).not.toBeNull();
      expect(slugMatch?.[1].length).toBeLessThanOrEqual(50);

      const symbolOnlyWithFault = buildSafeReportFilename(
        {
          title: '!!!@@@###$$$%%%',
          faultType: 'VPN_FAILURE',
          occurredAt: '2026-11-26T00:00:00.000Z',
        },
        'text'
      );
      expect(symbolOnlyWithFault).toBe('netdoctor-report-vpn-failure-20261126.txt');

      const symbolOnlyNoFault = buildSafeReportFilename(
        {
          title: '///???***',
          faultType: '' as IncidentRecord['faultType'],
          occurredAt: '2026-11-26T00:00:00.000Z',
        },
        'markdown'
      );
      expect(symbolOnlyNoFault).toBe('netdoctor-report-incident-20261126.md');
    });
  });

  describe('Unit tests: createReportBlob', () => {
    it('creates UTF-8 Blobs with correct MIME types, single UTF-8 BOM, and intact Korean text', async () => {
      const sampleMarkdown = '# NetDoctor 네트워크 장애 보고서\n- 장애 제목: 사내 위키 접속 불가';
      const mdBlob = createReportBlob(sampleMarkdown, 'markdown');

      expect(mdBlob).not.toBeNull();
      expect(mdBlob?.type).toBe(REPORT_MIME_TYPES.markdown);

      const mdBytes = await readBlobBytes(mdBlob as Blob);
      // UTF-8 BOM: 0xEF, 0xBB, 0xBF
      expect(Array.from(mdBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      expect(mdBlob?.size).toBe(mdBytes.byteLength);

      const decodedWithoutBom = await readBlobText(mdBlob as Blob, false);
      expect(decodedWithoutBom).toBe(sampleMarkdown);

      // Plain text format and no duplicate BOM if input already starts with BOM
      const sampleText = '[1. 장애 유형]\n- 분류: DNS 이름 해석 오류';
      const txtBlob = createReportBlob(`\uFEFF${sampleText}`, 'text');
      expect(txtBlob).not.toBeNull();
      expect(txtBlob?.type).toBe(REPORT_MIME_TYPES.text);

      const txtBytes = await readBlobBytes(txtBlob as Blob);
      expect(Array.from(txtBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
      // Ensure BOM was not duplicated (bytes 3..5 must not be another BOM)
      expect(Array.from(txtBytes.slice(3, 6))).not.toEqual([0xef, 0xbb, 0xbf]);
      expect(await readBlobText(txtBlob as Blob, false)).toBe(sampleText);
    });

    it('returns null for empty or whitespace-only content', () => {
      expect(createReportBlob('', 'markdown')).toBeNull();
      expect(createReportBlob('   \n\t\r\n  ', 'text')).toBeNull();
    });
  });

  describe('Unit tests: downloadReportContent & downloadIncidentReport', () => {
    it('blocks empty/whitespace-only content and null incident without ever calling URL.createObjectURL', () => {
      const { createObjectURL } = stubObjectUrlApi(() => 'blob:should-not-be-called');

      const emptyMd = downloadReportContent('', 'report.md', 'markdown');
      expect(emptyMd.ok).toBe(false);
      expect(emptyMd.error).toBeTruthy();

      const whitespaceTxt = downloadReportContent('   \n\t  ', 'report.txt', 'text');
      expect(whitespaceTxt.ok).toBe(false);
      expect(whitespaceTxt.error).toBeTruthy();

      const nullIncident = downloadIncidentReport(null, 'markdown');
      expect(nullIncident.ok).toBe(false);
      expect(nullIncident.error).toBeTruthy();

      const undefinedIncident = downloadIncidentReport(undefined, 'text');
      expect(undefinedIncident.ok).toBe(false);
      expect(undefinedIncident.error).toBeTruthy();

      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('creates Object URL, clicks hidden download anchor, removes anchor from DOM, and revokes Object URL', () => {
      const fakeUrl = 'blob:http://localhost/netdoctor-normal-1';
      let capturedBlob: Blob | null = null;
      let clickedAnchorDownload = '';
      let clickedAnchorHref = '';
      let clickedAnchorRel = '';
      let anchorWasInDomDuringClick = false;

      const { createObjectURL, revokeObjectURL } = stubObjectUrlApi((obj) => {
        capturedBlob = obj as Blob;
        return fakeUrl;
      });
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          clickedAnchorDownload = this.download;
          clickedAnchorHref = this.href;
          clickedAnchorRel = this.rel;
          anchorWasInDomDuringClick = document.body.contains(this);
        });

      const result = downloadReportContent(
        '# NetDoctor 보고서\n정상 테스트 내용',
        'netdoctor-report-테스트-20261126.md',
        'markdown'
      );

      expect(result.ok).toBe(true);
      expect(result.filename).toBe('netdoctor-report-테스트-20261126.md');
      expect(result.byteLength).toBeGreaterThan(0);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(capturedBlob).toBeInstanceOf(Blob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(anchorWasInDomDuringClick).toBe(true);
      expect(clickedAnchorDownload).toBe('netdoctor-report-테스트-20261126.md');
      expect(clickedAnchorHref).toBe(fakeUrl);
      expect(clickedAnchorRel).toBe('noopener noreferrer');
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
    });

    it('revokes Object URL and removes anchor in finally even when anchor.click() throws', () => {
      const fakeUrl = 'blob:http://localhost/netdoctor-error-cleanup';
      const { createObjectURL, revokeObjectURL } = stubObjectUrlApi(() => fakeUrl);
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        throw new Error('Synthetic click failure');
      });

      const result = downloadReportContent(
        '테스트 보고서 본문',
        'netdoctor-report-cleanup-20261126.txt',
        'text'
      );

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Synthetic click failure');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
    });

    it('returns a safe error result without throwing when URL.createObjectURL is unavailable', () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');

      Object.defineProperty(URL, 'createObjectURL', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      try {
        const result = downloadReportContent('보고서 내용', 'report.md', 'markdown');
        expect(result.ok).toBe(false);
        expect(result.error).toContain('지원하지 않습니다');
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(URL, 'createObjectURL', originalDescriptor);
        } else {
          delete (URL as unknown as Record<string, unknown>).createObjectURL;
        }
      }
    });

    it('neutralizes XSS and javascript: payloads in downloaded .md and .txt report Blobs', async () => {
      const capturedBlobs: Blob[] = [];
      stubObjectUrlApi((obj) => {
        capturedBlobs.push(obj as Blob);
        return `blob:netdoctor-xss-${capturedBlobs.length}`;
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const maliciousIncident = buildSampleIncident({
        title: '<script>alert(1)</script> 사내 포털 오류',
        symptomSummary: '<img src=x onerror=alert(1)> 접속 실패',
        evidence: ['링크 클릭: javascript:alert(document.cookie)'],
        actionNotes: '조치 메모 <script>evil()</script> 및 javascript:void(0) 차단 확인',
      });

      const mdResult = downloadIncidentReport(maliciousIncident, 'markdown');
      const txtResult = downloadIncidentReport(maliciousIncident, 'text');

      expect(mdResult.ok).toBe(true);
      expect(txtResult.ok).toBe(true);
      expect(mdResult.filename).not.toMatch(/[<>]/);
      expect(txtResult.filename).not.toMatch(/[<>]/);
      expect(capturedBlobs).toHaveLength(2);

      const mdContent = await readBlobText(capturedBlobs[0], false);
      const txtContent = await readBlobText(capturedBlobs[1], false);

      for (const content of [mdContent, txtContent]) {
        expect(content).not.toContain('<script>');
        expect(content).not.toContain('</script>');
        expect(content).not.toContain('<img ');
        expect(content).not.toMatch(/javascript\s*:/i);
        expect(content).toContain('&lt;script&gt;');
        expect(content).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(content).toContain('javascript_blocked:');
      }
    });
  });

  describe('UI integration tests: ReportPage & App', () => {
    it('downloads Markdown .md report via ".md 다운로드", shows aria-live filename feedback, and preserves "보고서 복사"', async () => {
      const user = userEvent.setup();
      const capturedBlobs: Blob[] = [];
      const clickedDownloads: string[] = [];

      const { createObjectURL, revokeObjectURL } = stubObjectUrlApi((obj) => {
        capturedBlobs.push(obj as Blob);
        return 'blob:netdoctor-ui-md';
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        clickedDownloads.push(this.download);
      });
      const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

      const created = createIncidentRecord({
        title: '사내 위키 접속 불가',
        faultType: 'DNS_ERROR',
        severity: 'high',
        status: 'resolved',
        symptomSummary: '사내 위키 도메인 해석 실패',
        userCheckSummary: ['ping 8.8.8.8 정상'],
        possibleCauses: ['사내 DNS 응답 지연'],
        evidence: ['도메인만 해석 불가'],
        actionNotes: 'IT 지원팀 DNS 티켓 접수',
        occurredAt: '2026-11-26T01:00:00.000Z',
        resolvedAt: '2026-11-26T01:30:00.000Z',
      });
      expect(created).not.toBeNull();

      render(<App />);
      await user.click(within(getSidebar()).getByRole('button', { name: /장애 보고서/ }));

      const mdDownloadBtn = screen.getByRole('button', { name: '.md 다운로드' });
      await user.click(mdDownloadBtn);

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:netdoctor-ui-md');
      expect(clickedDownloads).toEqual(['netdoctor-report-사내-위키-접속-불가-20261126.md']);
      expect(capturedBlobs[0].type).toBe(REPORT_MIME_TYPES.markdown);

      const mdBlobText = await readBlobText(capturedBlobs[0], false);
      expect(mdBlobText).toContain('# NetDoctor 네트워크 장애 보고서');
      expect(mdBlobText).toContain('## 1. 장애 유형');
      expect(mdBlobText).toContain('## 6. 해결 상태');

      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).not.toBeNull();
      expect(liveRegion).toHaveTextContent(
        '"netdoctor-report-사내-위키-접속-불가-20261126.md" 파일 다운로드가 시작되었습니다.'
      );

      // Existing clipboard copy button still works seamlessly
      await user.click(screen.getByRole('button', { name: '보고서 복사' }));
      expect(writeTextSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: '복사 완료' })).toBeInTheDocument();
      expect(liveRegion).toHaveTextContent('클립보드에 복사되었습니다.');
    });

    it('downloads plain text .txt report via ".txt 다운로드" containing [1. 장애 유형]..[6. 해결 상태]', async () => {
      const user = userEvent.setup();
      const capturedBlobs: Blob[] = [];
      const clickedDownloads: string[] = [];

      const { revokeObjectURL } = stubObjectUrlApi((obj) => {
        capturedBlobs.push(obj as Blob);
        return 'blob:netdoctor-ui-txt';
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement
      ) {
        clickedDownloads.push(this.download);
      });

      const incident = buildSampleIncident();
      render(
        <ReportPage incidents={[incident]} initialIncidentId={incident.id} onOpenHistory={vi.fn()} />
      );

      // Preview starts in Markdown mode, yet clicking ".txt 다운로드" must produce plain-text .txt content
      await user.click(screen.getByRole('button', { name: '.txt 다운로드' }));

      expect(clickedDownloads).toEqual(['netdoctor-report-사내-위키-접속-불가-20261126.txt']);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:netdoctor-ui-txt');
      expect(capturedBlobs).toHaveLength(1);
      expect(capturedBlobs[0].type).toBe(REPORT_MIME_TYPES.text);

      const txtBlobText = await readBlobText(capturedBlobs[0], false);
      expect(txtBlobText).toContain('[1. 장애 유형]');
      expect(txtBlobText).toContain('[2. 사용자 점검 결과]');
      expect(txtBlobText).toContain('[3. 가능한 원인 후보]');
      expect(txtBlobText).toContain('[4. 판단 근거]');
      expect(txtBlobText).toContain('[5. 조치 내역]');
      expect(txtBlobText).toContain('[6. 해결 상태]');
      expect(txtBlobText).not.toContain('## 1. 장애 유형');

      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toHaveTextContent(
        '"netdoctor-report-사내-위키-접속-불가-20261126.txt" 파일 다운로드가 시작되었습니다.'
      );
    });

    it('displays a role="alert" danger AlertBanner cleanly when URL.createObjectURL throws', async () => {
      const user = userEvent.setup();
      const { createObjectURL } = stubObjectUrlApi(() => {
        throw new Error('Blob URL allocation failed');
      });

      const incident = buildSampleIncident();
      render(
        <ReportPage incidents={[incident]} initialIncidentId={incident.id} onOpenHistory={vi.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '.md 다운로드' }));

      const alertBanner = screen.getByRole('alert');
      expect(alertBanner).toHaveTextContent('보고서 파일 다운로드에 실패했습니다');
      expect(alertBanner).toHaveTextContent('Blob URL allocation failed');

      // Ensure app did not crash and recovers when download succeeds next
      createObjectURL.mockReturnValue('blob:netdoctor-recovered');
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      await user.click(screen.getByRole('button', { name: '.txt 다운로드' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
        '파일 다운로드가 시작되었습니다.'
      );
    });

    it('clears active copy and download feedback timers via window.clearTimeout on unmount (PR #1 Minor #4)', async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      stubObjectUrlApi(() => 'blob:netdoctor-timer-test');
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

      const incident = buildSampleIncident();
      const { unmount } = render(
        <ReportPage incidents={[incident]} initialIncidentId={incident.id} onOpenHistory={vi.fn()} />
      );

      await user.click(screen.getByRole('button', { name: '보고서 복사' }));
      await user.click(screen.getByRole('button', { name: '.md 다운로드' }));

      // Capture the timer IDs created by ReportPage (3000ms copy timer & 3500ms download timer)
      const scheduledIds: number[] = [];
      setTimeoutSpy.mock.calls.forEach((call, idx) => {
        const delay = call[1];
        if (delay === 3000 || delay === 3500) {
          const result = setTimeoutSpy.mock.results[idx];
          if (result?.type === 'return') {
            scheduledIds.push(result.value as number);
          }
        }
      });
      expect(scheduledIds).toHaveLength(2);

      clearTimeoutSpy.mockClear();
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
      for (const timerId of scheduledIds) {
        expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId);
      }
    });
  });
});
