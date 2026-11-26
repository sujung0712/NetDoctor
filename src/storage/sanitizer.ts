import {
  FAULT_TYPES,
  INPUT_LIMITS,
  type DiagnosisResult,
  type FaultType,
  type IncidentRecord,
  type IncidentStatus,
  type Severity,
} from '../types';

const VALID_FAULT_TYPES = new Set<string>(FAULT_TYPES);
const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);
const VALID_STATUSES = new Set<string>(['open', 'in_progress', 'resolved']);
const UNSAFE_OBJECT_KEYS = new Set<string>(['__proto__', 'constructor', 'prototype']);

const CREDENTIAL_PATTERNS: RegExp[] = [
  /\bpassword\s*[:=]/i,
  /\bpasswd\s*[:=]/i,
  /\bpwd\s*[:=]/i,
  /비밀번호\s*[:=]/,
  /패스워드\s*[:=]/,
  /\bapi[_-]?key\s*[:=]/i,
  /\bsecret(?:[_-]?key)?\s*[:=]/i,
  /\baccess[_-]?token\s*[:=]/i,
  /\bauth[_-]?token\s*[:=]/i,
  /\bbearer\s+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

/**
 * Trims whitespace, strips ASCII control characters except newlines (\n),
 * and slices to maxLength.
 */
export function sanitizeText(input: string, maxLength: number): string {
  if (typeof input !== 'string') {
    return '';
  }

  const normalized = input.replace(/\r\n?/g, '\n');
  let cleaned = '';

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    // Allow printable ASCII, newline (10), tab converted to space (9), and non-ASCII chars (> 127)
    if (code === 9) {
      cleaned += ' ';
    } else if (code === 10 || (code >= 32 && code !== 127)) {
      cleaned += normalized[i];
    }
  }

  const safeMax = Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : 0;
  return cleaned.trim().slice(0, safeMax);
}

/**
 * Returns true if the string is empty or contains only whitespace.
 */
export function isBlank(input: string): boolean {
  return typeof input !== 'string' || input.trim().length === 0;
}

/**
 * Detects obvious credential patterns (passwords, API keys, Bearer tokens, private keys)
 * to prevent storing sensitive secrets in LocalStorage or reports.
 */
export function containsSensitiveCredential(input: string): boolean {
  if (typeof input !== 'string' || input.length === 0) {
    return false;
  }
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Checks whether a value is a valid ISO / parseable date string.
 */
export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/**
 * Computes rounded non-negative resolution duration in minutes
 * ONLY when both ISO timestamps are valid and resolvedAt >= occurredAt.
 */
export function computeResolutionMinutes(
  occurredAt: string,
  resolvedAt?: string
): number | undefined {
  if (!resolvedAt) {
    return undefined;
  }
  if (!isValidIsoTimestamp(occurredAt) || !isValidIsoTimestamp(resolvedAt)) {
    return undefined;
  }
  const startMs = Date.parse(occurredAt);
  const endMs = Date.parse(resolvedAt);
  if (endMs < startMs) {
    return undefined;
  }
  return Math.round((endMs - startMs) / 60000);
}

/**
 * Neutralizes raw HTML/script tags and javascript: URIs for safe plain-text/markdown output.
 */
export function neutralizeUnsafeMarkup(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/<\/?[a-zA-Z][^>]*>/g, (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .replace(/<\s*script/gi, '&lt;script')
    .replace(/javascript\s*:/gi, 'javascript_blocked:');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Recursively strips prototype-pollution keys (__proto__, constructor, prototype).
 */
function stripPrototypeKeys(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripPrototypeKeys(item, depth + 1));
  }
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      continue;
    }
    clean[key] = stripPrototypeKeys((value as Record<string, unknown>)[key], depth + 1);
  }
  return clean;
}

function sanitizeStringArray(raw: unknown, maxItems = 30, itemMaxLength = 300): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const result: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }
    const cleaned = sanitizeText(entry, itemMaxLength);
    if (cleaned.length > 0) {
      result.push(cleaned);
    }
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

/**
 * Strict runtime schema validator for LocalStorage integrity.
 * Rejects non-objects, invalid enums, blank titles, invalid timestamps;
 * clamps strings to INPUT_LIMITS; strips prototype pollution keys.
 */
export function validateIncidentRecord(raw: unknown): IncidentRecord | null {
  if (!isPlainRecord(raw)) {
    return null;
  }

  const clean = stripPrototypeKeys(raw) as Record<string, unknown>;

  if (typeof clean.id !== 'string' || isBlank(clean.id)) {
    return null;
  }
  const id = sanitizeText(clean.id, 80);
  if (isBlank(id)) {
    return null;
  }

  if (typeof clean.title !== 'string') {
    return null;
  }
  const title = sanitizeText(clean.title, INPUT_LIMITS.TITLE_MAX);
  if (isBlank(title)) {
    return null;
  }

  if (typeof clean.faultType !== 'string' || !VALID_FAULT_TYPES.has(clean.faultType)) {
    return null;
  }
  const faultType = clean.faultType as FaultType;

  if (typeof clean.severity !== 'string' || !VALID_SEVERITIES.has(clean.severity)) {
    return null;
  }
  const severity = clean.severity as Severity;

  if (typeof clean.status !== 'string' || !VALID_STATUSES.has(clean.status)) {
    return null;
  }
  const status = clean.status as IncidentStatus;

  if (!isValidIsoTimestamp(clean.occurredAt)) {
    return null;
  }
  const occurredAt = clean.occurredAt;

  if (!isValidIsoTimestamp(clean.updatedAt)) {
    return null;
  }
  const updatedAt = clean.updatedAt;

  if (typeof clean.symptomSummary !== 'string') {
    return null;
  }
  const symptomSummary = sanitizeText(clean.symptomSummary, INPUT_LIMITS.SYMPTOM_MAX);

  if (typeof clean.actionNotes !== 'string') {
    return null;
  }
  const actionNotes = sanitizeText(clean.actionNotes, INPUT_LIMITS.ACTION_NOTES_MAX);

  const userCheckSummary = sanitizeStringArray(clean.userCheckSummary);
  const possibleCauses = sanitizeStringArray(clean.possibleCauses);
  const evidence = sanitizeStringArray(clean.evidence);
  if (userCheckSummary === null || possibleCauses === null || evidence === null) {
    return null;
  }

  let resolvedAt: string | undefined;
  let resolutionMinutes: number | undefined;

  if (clean.resolvedAt !== undefined && clean.resolvedAt !== null && clean.resolvedAt !== '') {
    if (!isValidIsoTimestamp(clean.resolvedAt)) {
      return null;
    }
    if (status === 'resolved') {
      resolvedAt = clean.resolvedAt;
      resolutionMinutes = computeResolutionMinutes(occurredAt, resolvedAt);
    }
  }

  const record: IncidentRecord = {
    id,
    title,
    faultType,
    severity,
    status,
    symptomSummary,
    userCheckSummary,
    possibleCauses,
    evidence,
    actionNotes,
    occurredAt,
    updatedAt,
  };

  if (typeof clean.isSample === 'boolean') {
    record.isSample = clean.isSample;
  }

  if (resolvedAt !== undefined) {
    record.resolvedAt = resolvedAt;
  }

  if (resolutionMinutes !== undefined) {
    record.resolutionMinutes = resolutionMinutes;
  }

  if (isPlainRecord(clean.diagnosisResult)) {
    record.diagnosisResult = clean.diagnosisResult as unknown as DiagnosisResult;
  }

  return record;
}
