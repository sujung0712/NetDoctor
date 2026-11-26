import type { IncidentRecord, ReportDownloadResult, ReportFormat } from '../types';
import { generateIncidentReport } from './reportGenerator';

const UTF8_BOM = '\uFEFF';
const MAX_SLUG_LENGTH = 50;
const MAX_FILENAME_BASE_LENGTH = 90;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const REPORT_MIME_TYPES: Record<ReportFormat, string> = {
  markdown: 'text/markdown;charset=utf-8',
  text: 'text/plain;charset=utf-8',
};

export const REPORT_FILE_EXTENSIONS: Record<ReportFormat, string> = {
  markdown: 'md',
  text: 'txt',
};

function stripControlChars(input: string): string {
  let cleaned = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= 0x20 && code !== 0x7f) {
      cleaned += input[i];
    }
  }
  return cleaned;
}

function isWindowsReservedName(name: string): boolean {
  return WINDOWS_RESERVED_NAME_PATTERN.test(name);
}

function sanitizeSlugSegment(raw: string, maxLength: number): string {
  if (typeof raw !== 'string') {
    return '';
  }

  const withoutControls = stripControlChars(raw);
  const withoutHtmlTags = withoutControls.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');
  const withoutTraversal = withoutHtmlTags.replace(/\.{2,}/g, ' ');

  const sanitized = withoutTraversal
    .replace(/[^A-Za-z0-9\uAC00-\uD7A3\u3131-\u318E_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  return sanitized.slice(0, maxLength).replace(/^[-.]+|[-.]+$/g, '');
}

function extractDateStamp(iso?: string): string {
  const parsed = typeof iso === 'string' && iso.trim().length > 0 ? Date.parse(iso) : Number.NaN;
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getFallbackSlug(faultType?: string): string {
  if (typeof faultType === 'string' && faultType.trim().length > 0) {
    const normalized = faultType.toLowerCase().replace(/_/g, '-');
    const candidate = sanitizeSlugSegment(normalized, MAX_SLUG_LENGTH);
    if (candidate.length > 0 && !isWindowsReservedName(candidate)) {
      return candidate;
    }
  }
  return 'incident';
}

function sanitizeDownloadFilename(filename: string, format: ReportFormat): string {
  const ext = REPORT_FILE_EXTENSIONS[format] ?? REPORT_FILE_EXTENSIONS.text;
  const extSuffix = `.${ext}`;

  const raw = typeof filename === 'string' ? filename.trim() : '';
  const withoutExt = raw.toLowerCase().endsWith(extSuffix)
    ? raw.slice(0, raw.length - extSuffix.length)
    : raw;

  let safeBase = sanitizeSlugSegment(withoutExt, MAX_FILENAME_BASE_LENGTH);

  if (safeBase.length === 0) {
    safeBase = `netdoctor-report-${extractDateStamp()}`;
  } else if (isWindowsReservedName(safeBase)) {
    safeBase = `netdoctor-${safeBase}`;
  }

  return `${safeBase}${extSuffix}`;
}

/**
 * Generates a deterministic, sanitized report filename:
 * `netdoctor-report-<safeSlug>-<YYYYMMDD>.<ext>`
 */
export function buildSafeReportFilename(
  incident: Pick<IncidentRecord, 'title' | 'faultType' | 'occurredAt'>,
  format: ReportFormat
): string {
  const ext = REPORT_FILE_EXTENSIONS[format] ?? REPORT_FILE_EXTENSIONS.text;
  const dateStamp = extractDateStamp(incident.occurredAt);

  let slug = sanitizeSlugSegment(incident.title, MAX_SLUG_LENGTH);

  if (slug.length === 0) {
    slug = getFallbackSlug(incident.faultType);
  } else if (isWindowsReservedName(slug)) {
    slug = `file-${slug}`.slice(0, MAX_SLUG_LENGTH);
  }

  return `netdoctor-report-${slug}-${dateStamp}.${ext}`;
}

/**
 * Creates a UTF-8 Blob (with BOM for Windows editor compatibility) for report download.
 * Returns null if content is empty or whitespace-only.
 */
export function createReportBlob(content: string, format: ReportFormat): Blob | null {
  if (typeof content !== 'string' || content.trim().length === 0) {
    return null;
  }

  const mimeType = REPORT_MIME_TYPES[format] ?? REPORT_MIME_TYPES.text;
  const payload = content.startsWith(UTF8_BOM) ? content : `${UTF8_BOM}${content}`;
  return new Blob([payload], { type: mimeType });
}

/**
 * Triggers a client-side file download for report content using Blob + Object URL.
 * Always cleans up the temporary anchor element and revokes the Object URL.
 */
export function downloadReportContent(
  content: string,
  filename: string,
  format: ReportFormat
): ReportDownloadResult {
  if (typeof content !== 'string' || content.trim().length === 0) {
    return {
      ok: false,
      error: '다운로드할 보고서 내용이 비어 있습니다.',
    };
  }

  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof document.createElement !== 'function' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return {
      ok: false,
      error: '현재 브라우저 환경에서는 파일 다운로드를 지원하지 않습니다.',
    };
  }

  const safeFilename = sanitizeDownloadFilename(filename, format);
  const blob = createReportBlob(content, format);
  if (!blob) {
    return {
      ok: false,
      error: '다운로드할 보고서 내용이 비어 있습니다.',
    };
  }

  let objectUrl: string | null = null;
  let anchor: HTMLAnchorElement | null = null;

  try {
    objectUrl = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeFilename;
    anchor.rel = 'noopener noreferrer';
    if (anchor.style) {
      anchor.style.display = 'none';
    }

    document.body.appendChild(anchor);
    anchor.click();

    return {
      ok: true,
      filename: safeFilename,
      byteLength: blob.size,
    };
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    return {
      ok: false,
      error: `보고서 파일 다운로드 중 오류가 발생했습니다.${detail}`,
    };
  } finally {
    if (anchor) {
      try {
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        } else if (typeof anchor.remove === 'function') {
          anchor.remove();
        }
      } catch {
        // Ignore DOM cleanup errors
      }
    }
    if (objectUrl !== null && typeof URL.revokeObjectURL === 'function') {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore Object URL cleanup errors
      }
    }
  }
}

/**
 * Generates and downloads a Markdown or plain-text report for the given incident record.
 */
export function downloadIncidentReport(
  incident: IncidentRecord | null | undefined,
  format: ReportFormat
): ReportDownloadResult {
  if (!incident) {
    return {
      ok: false,
      error: '다운로드할 장애 이력이 선택되지 않았습니다.',
    };
  }

  try {
    const content = generateIncidentReport(incident, format);
    const filename = buildSafeReportFilename(incident, format);
    return downloadReportContent(content, filename, format);
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    return {
      ok: false,
      error: `보고서 생성 중 오류가 발생했습니다.${detail}`,
    };
  }
}
