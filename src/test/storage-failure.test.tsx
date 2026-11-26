import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import {
  clearSampleIncidentsFromStorage,
  createIncidentRecord,
  deleteIncidentRecord,
  loadIncidents,
  loadSampleIncidentsIntoStorage,
  saveIncidents,
  updateIncidentRecord,
} from '../storage';
import type { IncidentCreateInput, IncidentRecord } from '../types';

function createQuotaExceededError(): DOMException {
  return new DOMException(
    'The quota has been exceeded.',
    'QuotaExceededError'
  );
}

function createSecurityError(): DOMException {
  return new DOMException(
    'Access to localStorage is denied.',
    'SecurityError'
  );
}

function buildValidCreateInput(
  overrides: Partial<IncidentCreateInput> = {}
): IncidentCreateInput {
  return {
    title: '사내 게이트웨이 응답 지연 점검',
    faultType: 'DNS_ERROR',
    severity: 'high',
    status: 'open',
    symptomSummary: '외부 도메인 이름 해석 실패 및 지연 발생',
    userCheckSummary: ['ping 8.8.8.8 정상 응답'],
    possibleCauses: ['로컬 DNS 캐시 손상'],
    evidence: ['IP 통신 정상, 도메인 해석 실패'],
    actionNotes: '1차 DNS 상태 점검 진행',
    ...overrides,
  };
}

function getSidebar(): HTMLElement {
  return screen.getByRole('complementary', { name: '주요 내비게이션' });
}

describe('LocalStorage failure resilience & error UX', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Storage layer unit tests (src/storage/incidentStorage.ts)', () => {
    it('saveIncidents returns true on normal save and false on QuotaExceededError and SecurityError', () => {
      const sampleRecord: IncidentRecord = {
        id: 'inc-unit-save-1',
        title: '정상 저장 테스트',
        faultType: 'NO_INTERNET',
        severity: 'medium',
        status: 'open',
        symptomSummary: '인터넷 연결 끊김',
        userCheckSummary: [],
        possibleCauses: [],
        evidence: [],
        actionNotes: '',
        occurredAt: '2026-11-26T01:00:00.000Z',
        updatedAt: '2026-11-26T01:00:00.000Z',
      };

      expect(saveIncidents([sampleRecord])).toBe(true);
      expect(loadIncidents()).toHaveLength(1);

      const quotaSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });
      expect(saveIncidents([sampleRecord])).toBe(false);
      quotaSpy.mockRestore();

      const securitySpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createSecurityError();
        });
      expect(saveIncidents([sampleRecord])).toBe(false);
      securitySpy.mockRestore();
    });

    it('saveIncidents returns false when window.localStorage is unavailable', () => {
      const localStorageGetter = vi
        .spyOn(window, 'localStorage', 'get')
        .mockImplementation(() => {
          throw createSecurityError();
        });

      expect(saveIncidents([])).toBe(false);
      localStorageGetter.mockRestore();
    });

    it('createIncidentRecord returns null on QuotaExceededError and preserves existing records', () => {
      const existing = createIncidentRecord(
        buildValidCreateInput({ title: '기존 정상 장애 기록' })
      );
      expect(existing).not.toBeNull();
      expect(loadIncidents()).toHaveLength(1);

      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      const created = createIncidentRecord(
        buildValidCreateInput({ title: '저장 실패 예정 신규 기록' })
      );
      expect(created).toBeNull();

      spy.mockRestore();

      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(existing!.id);
      expect(stored[0].title).toBe('기존 정상 장애 기록');
    });

    it('updateIncidentRecord returns null on QuotaExceededError and preserves original record', () => {
      const existing = createIncidentRecord(
        buildValidCreateInput({
          title: '수정 전 원본 제목',
          status: 'open',
          actionNotes: '원본 조치 내역',
        })
      );
      expect(existing).not.toBeNull();

      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      const updated = updateIncidentRecord(existing!.id, {
        title: '수정 실패 예정 제목',
        status: 'resolved',
        actionNotes: '수정 실패 예정 내역',
      });
      expect(updated).toBeNull();

      spy.mockRestore();

      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('수정 전 원본 제목');
      expect(stored[0].status).toBe('open');
      expect(stored[0].actionNotes).toBe('원본 조치 내역');
    });

    it('deleteIncidentRecord returns false on QuotaExceededError and preserves existing record', () => {
      const existing = createIncidentRecord(
        buildValidCreateInput({ title: '삭제 실패 시 유지되어야 하는 기록' })
      );
      expect(existing).not.toBeNull();

      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      const deleted = deleteIncidentRecord(existing!.id);
      expect(deleted).toBe(false);

      spy.mockRestore();

      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(existing!.id);
      expect(stored[0].title).toBe('삭제 실패 시 유지되어야 하는 기록');
    });

    it('loadSampleIncidentsIntoStorage and clearSampleIncidentsFromStorage preserve existing records when setItem throws', () => {
      const realRecord = createIncidentRecord(
        buildValidCreateInput({ title: '기존 사용자 실제 기록' })
      );
      expect(realRecord).not.toBeNull();

      // 1) Loading sample incidents fails when setItem throws -> returns previous existing list
      const loadSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      const afterFailedLoad = loadSampleIncidentsIntoStorage();
      expect(afterFailedLoad).toHaveLength(1);
      expect(afterFailedLoad[0].id).toBe(realRecord!.id);
      loadSpy.mockRestore();
      expect(loadIncidents()).toHaveLength(1);

      // 2) Load samples normally first, then simulate failure when clearing samples
      const loadedWithSamples = loadSampleIncidentsIntoStorage();
      expect(loadedWithSamples).toHaveLength(5);

      const clearSpy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createSecurityError();
        });

      const afterFailedClear = clearSampleIncidentsFromStorage();
      expect(afterFailedClear).toHaveLength(5);
      clearSpy.mockRestore();
      expect(loadIncidents()).toHaveLength(5);
    });
  });

  describe('UI integration tests under QuotaExceededError', () => {
    it('DiagnosisPage: shows storage-failure alert, never shows saved banner, and preserves existing records when setItem throws', async () => {
      const user = userEvent.setup();

      const existing = createIncidentRecord(
        buildValidCreateInput({ title: '기존 보존 장애 기록' })
      );
      expect(existing).not.toBeNull();

      render(<App />);

      // Navigate to Diagnosis page and run a quick DNS_ERROR flow
      await user.click(
        within(getSidebar()).getByRole('button', { name: /^장애 진단/ })
      );
      await user.click(screen.getByRole('button', { name: /DNS 오류/ }));
      await user.click(
        within(screen.getByRole('main')).getByRole('button', {
          name: /진단 시작/,
        })
      );

      // Complete 3-question DNS branch (yes -> yes -> yes)
      await user.click(screen.getByRole('radio', { name: /^예/ }));
      await user.click(screen.getByRole('button', { name: /다음 질문/ }));
      await user.click(screen.getByRole('radio', { name: /^예/ }));
      await user.click(screen.getByRole('button', { name: /다음 질문/ }));
      await user.click(screen.getByRole('radio', { name: /^예/ }));
      await user.click(screen.getByRole('button', { name: /진단 결과 분석/ }));

      // Enable QuotaExceededError right before saving
      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      await user.click(
        screen.getByRole('button', { name: '장애 이력으로 저장' })
      );

      // Must NEVER claim success
      expect(
        screen.queryByText('장애 이력이 저장되었습니다.')
      ).not.toBeInTheDocument();

      // Must show clear storage-failure error notice
      const alertBanner = screen.getByRole('alert');
      expect(alertBanner).toHaveTextContent(/장애 이력 저장 실패/);
      expect(alertBanner).toHaveTextContent(/LocalStorage/);
      expect(alertBanner).toHaveTextContent(/용량 초과/);

      spy.mockRestore();

      // Existing stored record must remain completely intact
      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(existing!.id);
      expect(stored[0].title).toBe('기존 보존 장애 기록');
    });

    it('HistoryPage: manual create fails cleanly on QuotaExceededError, keeps modal open, shows error alert, and preserves existing records', async () => {
      const user = userEvent.setup();

      const existing = createIncidentRecord(
        buildValidCreateInput({ title: '기존 유지 대상 장애' })
      );
      expect(existing).not.toBeNull();

      render(<App />);
      await user.click(
        within(getSidebar()).getByRole('button', { name: /장애 이력/ })
      );

      await user.click(
        screen.getAllByRole('button', { name: /수동 장애 등록/ })[0]
      );
      const dialog = screen.getByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(/장애 제목/),
        '저장 실패 신규 장애'
      );
      await user.type(
        within(dialog).getByLabelText('증상 요약'),
        '게이트웨이 연결 불가'
      );

      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      await user.click(
        within(dialog).getByRole('button', { name: '이력 등록' })
      );

      // Modal stays open and displays clear error alert
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const modalAlert = within(dialog).getByRole('alert');
      expect(modalAlert).toHaveTextContent(/저장에 실패했습니다/);
      expect(modalAlert).toHaveTextContent(/LocalStorage/);
      expect(
        screen.queryByText(/이\(가\) 저장되었습니다/)
      ).not.toBeInTheDocument();

      spy.mockRestore();

      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(existing!.id);
      expect(stored[0].title).toBe('기존 유지 대상 장애');
    });

    it('HistoryPage: edit modal and quick status toggle fail cleanly on QuotaExceededError, show error alert, and preserve status', async () => {
      const user = userEvent.setup();

      const existing = createIncidentRecord(
        buildValidCreateInput({
          title: '상태 변경 실패 검증 기록',
          status: 'open',
        })
      );
      expect(existing).not.toBeNull();

      render(<App />);
      await user.click(
        within(getSidebar()).getByRole('button', { name: /장애 이력/ })
      );

      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      // 1) Quick status toggle ('해결 완료') fails cleanly
      await user.click(screen.getByRole('button', { name: '해결 완료' }));

      expect(
        screen.queryByText(/해결 완료 처리했습니다/)
      ).not.toBeInTheDocument();
      const pageAlert = screen.getByRole('alert');
      expect(pageAlert).toHaveTextContent(/저장 실패/);
      expect(pageAlert).toHaveTextContent(/LocalStorage/);
      expect(pageAlert).toHaveTextContent(/기존 장애 이력 데이터는 그대로 유지/);

      const incidentCard = screen.getByRole('article');
      expect(within(incidentCard).getByText('미해결')).toBeInTheDocument();

      // 2) Edit modal fails cleanly and stays open with error alert
      await user.click(within(incidentCard).getByRole('button', { name: '수정' }));
      const editDialog = screen.getByRole('dialog');
      const titleInput = within(editDialog).getByLabelText(/장애 제목/);
      await user.clear(titleInput);
      await user.type(titleInput, '수정 실패 예정 제목');
      await user.click(
        within(editDialog).getByRole('button', { name: '변경 사항 저장' })
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const editAlert = within(editDialog).getByRole('alert');
      expect(editAlert).toHaveTextContent(/수정 내용을 저장하지 못했습니다/);
      expect(editAlert).toHaveTextContent(/LocalStorage/);
      expect(
        screen.queryByText(/업데이트되었습니다/)
      ).not.toBeInTheDocument();

      spy.mockRestore();

      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('상태 변경 실패 검증 기록');
      expect(stored[0].status).toBe('open');
    });

    it('HistoryPage: delete fails cleanly on QuotaExceededError, preserves record in UI & storage, and shows error alert', async () => {
      const user = userEvent.setup();

      const existing = createIncidentRecord(
        buildValidCreateInput({ title: '삭제 실패 시 보존 기록' })
      );
      expect(existing).not.toBeNull();

      render(<App />);
      await user.click(
        within(getSidebar()).getByRole('button', { name: /장애 이력/ })
      );

      const incidentCard = screen.getByRole('article');
      await user.click(within(incidentCard).getByRole('button', { name: '삭제' }));
      const deleteDialog = screen.getByRole('dialog');

      const spy = vi
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw createQuotaExceededError();
        });

      await user.click(
        within(deleteDialog).getByRole('button', { name: '영구 삭제' })
      );

      // Must NOT show deletion success feedback
      expect(
        screen.queryByText(/장애 이력이 삭제되었습니다/)
      ).not.toBeInTheDocument();

      // Must show clear error alert and keep the record visible in the list
      const pageAlert = screen.getByRole('alert');
      expect(pageAlert).toHaveTextContent(/저장 실패/);
      expect(pageAlert).toHaveTextContent(/삭제를 LocalStorage에 저장하지 못했습니다/);
      expect(screen.getByText('삭제 실패 시 보존 기록')).toBeInTheDocument();

      spy.mockRestore();

      const stored = loadIncidents();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(existing!.id);
      expect(stored[0].title).toBe('삭제 실패 시 보존 기록');
    });
  });
});
