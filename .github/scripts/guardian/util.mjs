const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export function isBot(user) {
  return Boolean(user && (user.type === 'Bot' || /\[bot\]$/i.test(user.login ?? '')));
}

export function normalizeLogin(login) {
  return typeof login === 'string' ? login.trim() : '';
}

export function isSafeLogin(login) {
  return LOGIN_PATTERN.test(normalizeLogin(login));
}

export function isSameLogin(left, right) {
  return normalizeLogin(left).toLowerCase() === normalizeLogin(right).toLowerCase();
}

/**
 * Escape text for a Markdown table or paragraph while preventing mentions and
 * raw HTML from being interpreted. Guardian renders names and check titles
 * that may originate outside the trusted default branch.
 */
export function escapeInline(value, { maxLength = 300 } = {}) {
  let text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/@/g, '&#64;')
    .replace(/([\[\]*_~])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLength) text = `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  return text;
}

export function codeSpan(value, options) {
  const text = escapeInline(value, options).replace(/\\([\[\]*_~])/g, '$1');
  return text ? `\`${text}\`` : '`unknown`';
}

export function parseDate(value) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? time : null;
}

export function ageInDays(isoDate, now = Date.now()) {
  const time = parseDate(isoDate);
  if (time == null) return null;
  return Math.max(0, (now - time) / 86_400_000);
}

export function ageInMinutes(isoDate, now = Date.now()) {
  const time = parseDate(isoDate);
  if (time == null) return null;
  return Math.max(0, (now - time) / 60_000);
}

export function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

export function envFlag(value, defaultValue) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function envInteger(value, defaultValue, { min = 0, max = 3650 } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}

export function parseCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function stableFindingSort(findings) {
  return [...findings].sort((left, right) => left.id.localeCompare(right.id));
}

/** Deterministic slug for check names so dismissal IDs survive reruns. */
export function slug(value, fallback = 'check') {
  const text = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return text || fallback;
}

export function shortSha(sha) {
  return typeof sha === 'string' && sha.length >= 7 ? sha.slice(0, 7) : 'unknown';
}
