/** Conservative integer micro-USD accounting; no provider prices are bundled. */
export function microUsd(value, rounding = Math.ceil) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new TypeError('Invalid budget amount');
  return rounding(value * 1000000);
}
export function budgetScope(session, now = new Date()) {
  if (typeof session !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(session) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid budget scope');
  return {session,month:now.toISOString().slice(0,7)};
}
