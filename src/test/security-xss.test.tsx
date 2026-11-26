import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import {
  containsSensitiveCredential,
  createIncidentRecord,
  generateIncidentReport,
  isBlank,
  loadIncidents,
  sanitizeText,
  updateIncidentRecord,
  validateIncidentRecord,
} from '../storage';
import { INPUT_LIMITS, STORAGE_KEYS } from '../types';

function collectProductionSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Exclude test directory from production static code scan
      if (entry.name === 'test') {
        continue;
      }
      results.push(...collectProductionSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

function stripJsComments(source: string): string {
  return source.replace(
    /(['"`])(?:\\.|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, quote: string | undefined) => (quote ? match : '')
  );
}

describe('NetDoctor Security, Validation & XSS Defense Suite', () => {
  describe('Empty and whitespace-only input rejection (storage & UI)', () => {
    it('rejects empty and whitespace-only titles in storage operations', () => {
      expect(isBlank('')).toBe(true);
      expect(isBlank('   \t\n  ')).toBe(true);
      expect(isBlank('정상 제목')).toBe(false);

      const emptyCreate = createIncidentRecord({
        title: '',
        faultType: 'NO_INTERNET',
        severity: 'low',
        status: 'open',
        symptomSummary: '',
        userCheckSummary: [],
        possibleCauses: [],
        evidence: [],
        actionNotes: '',
      });
      expect(emptyCreate).toBeNull();

      const whitespaceCreate = createIncidentRecord({
        title: '   \t\n   ',
        faultType: 'DNS_ERROR',
        severity: 'medium',
        status: 'open',
        symptomSummary: '증상',
        userCheckSummary: [],
        possibleCauses: [],
        evidence: [],
        actionNotes: '',
      });
      expect(whitespaceCreate).toBeNull();
      expect(loadIncidents()).toHaveLength(0);

      // Valid record cannot be updated to a blank title
      const valid = createIncidentRecord({
        title: '정상 장애 기록',
        faultType: 'DNS_ERROR',
        severity: 'medium',
        status: 'open',
        symptomSummary: '증상',
        userCheckSummary: [],
        possibleCauses: [],
        evidence: [],
        actionNotes: '',
      });
      expect(valid).not.toBeNull();
      expect(updateIncidentRecord(valid!.id, { title: '   ' })).toBeNull();
      expect(loadIncidents()[0].title).toBe('정상 장애 기록');
    });

    it('rejects whitespace-only input in HistoryPage manual incident modal and DiagnosisPage', async () => {
      const user = userEvent.setup();
      render(<App />);

      // 1) HistoryPage modal rejects whitespace-only title
      const sidebar = screen.getByRole('complementary', { name: '주요 내비게이션' });
      await user.click(within(sidebar).getByRole('button', { name: /장애 이력/ }));
      await user.click(screen.getAllByRole('button', { name: /수동 장애 등록/ })[0]);

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/장애 제목/), '     ');
      await user.click(within(dialog).getByRole('button', { name: '이력 등록' }));

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        '장애 제목을 입력해 주세요. 공백만 입력할 수 없습니다.'
      );
      expect(loadIncidents()).toHaveLength(0);
      await user.click(within(dialog).getByRole('button', { name: '취소' }));

      // 2) DiagnosisPage rejects whitespace-only symptom summary
      await user.click(within(sidebar).getByRole('button', { name: /^장애 진단/ }));
      await user.click(screen.getByRole('button', { name: /인터넷 연결 불가/ }));
      await user.type(screen.getByLabelText(/상세 증상 메모/), '    ');

      expect(
        screen.getByText('공백만 입력할 수 없습니다. 증상을 입력하거나 입력란을 비워 주세요.')
      ).toHaveAttribute('role', 'alert');
      expect(
        within(screen.getByRole('main')).getByRole('button', { name: /진단 시작/ })
      ).toBeDisabled();
    });
  });

  describe('Max-length enforcement (INPUT_LIMITS)', () => {
    it('clamps oversized strings strictly to INPUT_LIMITS in sanitizer and storage', () => {
      const longTitle = 'A'.repeat(INPUT_LIMITS.TITLE_MAX + 80);
      const longSymptom = 'B'.repeat(INPUT_LIMITS.SYMPTOM_MAX + 150);
      const longActionNotes = 'C'.repeat(INPUT_LIMITS.ACTION_NOTES_MAX + 500);
      const longSearch = 'D'.repeat(INPUT_LIMITS.SEARCH_MAX + 50);
      const longAnswerNote = 'E'.repeat(INPUT_LIMITS.ANSWER_NOTE_MAX + 50);

      expect(sanitizeText(longTitle, INPUT_LIMITS.TITLE_MAX)).toHaveLength(INPUT_LIMITS.TITLE_MAX);
      expect(sanitizeText(longSymptom, INPUT_LIMITS.SYMPTOM_MAX)).toHaveLength(
        INPUT_LIMITS.SYMPTOM_MAX
      );
      expect(sanitizeText(longActionNotes, INPUT_LIMITS.ACTION_NOTES_MAX)).toHaveLength(
        INPUT_LIMITS.ACTION_NOTES_MAX
      );
      expect(sanitizeText(longSearch, INPUT_LIMITS.SEARCH_MAX)).toHaveLength(
        INPUT_LIMITS.SEARCH_MAX
      );
      expect(sanitizeText(longAnswerNote, INPUT_LIMITS.ANSWER_NOTE_MAX)).toHaveLength(
        INPUT_LIMITS.ANSWER_NOTE_MAX
      );

      const created = createIncidentRecord({
        title: longTitle,
        faultType: 'SLOW_NETWORK',
        severity: 'low',
        status: 'open',
        symptomSummary: longSymptom,
        userCheckSummary: [],
        possibleCauses: [],
        evidence: [],
        actionNotes: longActionNotes,
      });

      expect(created).not.toBeNull();
      expect(created!.title).toHaveLength(INPUT_LIMITS.TITLE_MAX);
      expect(created!.symptomSummary).toHaveLength(INPUT_LIMITS.SYMPTOM_MAX);
      expect(created!.actionNotes).toHaveLength(INPUT_LIMITS.ACTION_NOTES_MAX);
    });

    it('enforces maxLength attributes on UI form controls', async () => {
      const user = userEvent.setup();
      render(<App />);

      const sidebar = screen.getByRole('complementary', { name: '주요 내비게이션' });
      await user.click(within(sidebar).getByRole('button', { name: /장애 이력/ }));
      await user.click(screen.getAllByRole('button', { name: /수동 장애 등록/ })[0]);

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByLabelText(/장애 제목/)).toHaveAttribute(
        'maxlength',
        String(INPUT_LIMITS.TITLE_MAX)
      );
      expect(within(dialog).getByLabelText('증상 요약')).toHaveAttribute(
        'maxlength',
        String(INPUT_LIMITS.SYMPTOM_MAX)
      );
      expect(within(dialog).getByLabelText('조치 내역')).toHaveAttribute(
        'maxlength',
        String(INPUT_LIMITS.ACTION_NOTES_MAX)
      );
    });
  });

  describe('XSS payload neutralization and safe DOM rendering', () => {
    it('renders script, img onerror, and javascript: payloads strictly as escaped text with zero executable elements', async () => {
      const user = userEvent.setup();

      const scriptPayload = `<script>alert('xss')</script>`;
      const imgOnerrorPayload = `<img src=x onerror=alert(1)>`;
      const jsUriPayload = `javascript:alert(1)`;

      const record = createIncidentRecord({
        title: `테스트 ${scriptPayload}`,
        faultType: 'DNS_ERROR',
        severity: 'medium',
        status: 'open',
        symptomSummary: `증상 ${imgOnerrorPayload}`,
        userCheckSummary: [`점검 ${jsUriPayload}`],
        possibleCauses: [`원인 ${scriptPayload}`],
        evidence: [`근거 ${imgOnerrorPayload}`],
        actionNotes: `조치 ${jsUriPayload} 및 ${imgOnerrorPayload}`,
      });
      expect(record).not.toBeNull();

      // Verify report generator neutralizes raw HTML tags and javascript: URIs
      const mdReport = generateIncidentReport(record!, 'markdown');
      expect(mdReport).not.toContain('<script>');
      expect(mdReport).not.toContain('<img ');
      expect(mdReport).not.toContain('javascript:alert');
      expect(mdReport).toContain('&lt;script&gt;');
      expect(mdReport).toContain('javascript_blocked:');

      // Render full App and inspect Dashboard, History, and Report DOMs
      const { container } = render(<App />);

      const assertNoExecutableXssInDom = () => {
        expect(container.querySelectorAll('script')).toHaveLength(0);
        expect(container.querySelectorAll('[onerror]')).toHaveLength(0);
        expect(container.querySelectorAll('img[src="x"]')).toHaveLength(0);
        expect(container.querySelectorAll('a[href^="javascript:"]')).toHaveLength(0);
      };

      // 1) Dashboard view
      expect(screen.getByText(`테스트 ${scriptPayload}`)).toBeInTheDocument();
      assertNoExecutableXssInDom();

      // 2) History view
      const sidebar = screen.getByRole('complementary', { name: '주요 내비게이션' });
      await user.click(within(sidebar).getByRole('button', { name: /장애 이력/ }));
      expect(screen.getByText(`테스트 ${scriptPayload}`)).toBeInTheDocument();
      expect(screen.getByText(`증상 ${imgOnerrorPayload}`)).toBeInTheDocument();
      expect(
        screen.getByText(`조치 ${jsUriPayload} 및 ${imgOnerrorPayload}`)
      ).toBeInTheDocument();
      assertNoExecutableXssInDom();

      // 3) Report view
      await user.click(within(sidebar).getByRole('button', { name: /장애 보고서/ }));
      const codePreview = container.querySelector('pre code')?.textContent ?? '';
      expect(codePreview).toContain('&lt;script&gt;');
      expect(codePreview).toContain('javascript_blocked:');
      assertNoExecutableXssInDom();
    });
  });

  describe('Corrupted LocalStorage JSON and prototype-pollution resilience', () => {
    it('recovers safely from corrupted JSON, null, malformed structures, and __proto__ keys without crashing', () => {
      const corruptedPayloads = [
        '{broken',
        'null',
        '12345',
        '{"not":"an-array"}',
        '[null, 42, "string", {}, {"id": "only-id"}]',
      ];

      for (const payload of corruptedPayloads) {
        window.localStorage.setItem(STORAGE_KEYS.INCIDENTS, payload);
        expect(() => loadIncidents()).not.toThrow();
        expect(loadIncidents()).toEqual([]);
      }

      // Prototype-pollution payload mixed with a valid record
      const protoPayload = JSON.stringify([
        JSON.parse(
          '{"id":"inc-proto-1","title":"정상 제목","faultType":"DNS_ERROR","severity":"low","status":"open","symptomSummary":"증상","userCheckSummary":[],"possibleCauses":[],"evidence":[],"actionNotes":"","occurredAt":"2026-11-26T00:00:00.000Z","updatedAt":"2026-11-26T00:00:00.000Z","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}'
        ),
        { id: 'bad', faultType: 'UNKNOWN_ENUM' },
      ]);

      window.localStorage.setItem(STORAGE_KEYS.INCIDENTS, protoPayload);
      const recovered = loadIncidents();
      expect(recovered).toHaveLength(1);
      expect(recovered[0].id).toBe('inc-proto-1');
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(recovered[0], '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(recovered[0], 'constructor')).toBe(false);

      // validateIncidentRecord rejects invalid records cleanly
      expect(validateIncidentRecord(null)).toBeNull();
      expect(validateIncidentRecord([])).toBeNull();
      expect(validateIncidentRecord({ id: 'x', title: 't', faultType: 'INVALID' })).toBeNull();

      // App renders cleanly even when LocalStorage holds broken JSON
      window.localStorage.setItem(STORAGE_KEYS.INCIDENTS, '{broken');
      expect(() => render(<App />)).not.toThrow();
      expect(screen.getByText('아직 저장된 장애 이력이 없습니다.')).toBeInTheDocument();
    });
  });

  describe('Sensitive credential blocking', () => {
    it('blocks password, Korean 비밀번호, Bearer tokens, and API keys in storage and UI forms', async () => {
      const blockedSamples = [
        'password=12345',
        '비밀번호: test',
        'Bearer abc.def.ghi',
        'api_key=sk-test-9999',
        '-----BEGIN PRIVATE KEY-----',
      ];

      for (const sample of blockedSamples) {
        expect(containsSensitiveCredential(sample)).toBe(true);
        const created = createIncidentRecord({
          title: '인증정보 포함 테스트',
          faultType: 'VPN_FAILURE',
          severity: 'high',
          status: 'open',
          symptomSummary: sample,
          userCheckSummary: [],
          possibleCauses: [],
          evidence: [],
          actionNotes: '',
        });
        expect(created).toBeNull();
      }
      expect(loadIncidents()).toHaveLength(0);

      // UI form validation in HistoryPage modal
      const user = userEvent.setup();
      render(<App />);
      const sidebar = screen.getByRole('complementary', { name: '주요 내비게이션' });
      await user.click(within(sidebar).getByRole('button', { name: /장애 이력/ }));
      await user.click(screen.getAllByRole('button', { name: /수동 장애 등록/ })[0]);

      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/장애 제목/), 'VPN 접속 오류');
      await user.type(within(dialog).getByLabelText('조치 내역'), '테스트 계정 password=12345');
      await user.click(within(dialog).getByRole('button', { name: '이력 등록' }));

      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        '민감한 인증 정보는 저장할 수 없습니다'
      );
      expect(loadIncidents()).toHaveLength(0);

      // Also verify Korean 비밀번호 and Bearer token rejection in UI
      const notesInput = within(dialog).getByLabelText('조치 내역');
      await user.clear(notesInput);
      await user.type(notesInput, '비밀번호: test');
      await user.click(within(dialog).getByRole('button', { name: '이력 등록' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        '민감한 인증 정보는 저장할 수 없습니다'
      );

      await user.clear(notesInput);
      await user.type(notesInput, 'Authorization: Bearer abc.def.ghi');
      await user.click(within(dialog).getByRole('button', { name: '이력 등록' }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        '민감한 인증 정보는 저장할 수 없습니다'
      );
      expect(loadIncidents()).toHaveLength(0);
    });
  });

  describe('Static code security scan across production src/', () => {
    it('confirms ZERO occurrences of dangerouslySetInnerHTML, eval(, new Function, or .innerHTML across src/ (excluding src/test/)', () => {
      const currentFile = fileURLToPath(import.meta.url);
      const srcRoot = path.resolve(path.dirname(currentFile), '..');
      const sourceFiles = collectProductionSourceFiles(srcRoot);

      expect(sourceFiles.length).toBeGreaterThan(10);

      const forbiddenPatterns: Array<{ name: string; regex: RegExp }> = [
        { name: 'dangerouslySetInnerHTML', regex: /\bdangerouslySetInnerHTML\b/ },
        { name: 'eval(', regex: /\beval\s*\(/ },
        { name: 'new Function', regex: /\bnew\s+Function\b/ },
        { name: '.innerHTML', regex: /\.innerHTML\b/ },
      ];

      const violations: string[] = [];

      for (const filePath of sourceFiles) {
        const rawSource = fs.readFileSync(filePath, 'utf-8');
        const codeWithoutComments = stripJsComments(rawSource);

        for (const pattern of forbiddenPatterns) {
          if (pattern.regex.test(codeWithoutComments)) {
            violations.push(`${path.relative(srcRoot, filePath)} matched ${pattern.name}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });
});
