/**
 * Deliberate issue references in pull-request text.
 *
 * Only same-repository references are returned. Fenced code, inline code and
 * external `owner/repo#123` forms are ignored so a PR cannot claim compliance
 * by quoting an example or pointing at another repository.
 */

const MAX_ISSUE_REFERENCES = 10;

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

/** Extract deliberate same-repository issue references, excluding external forms. */
export function extractIssueNumbers(body = '') {
  const text = stripCode(String(body));
  const found = new Set();
  const patterns = [
    /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+(?:#(\d+)|([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#\d+)\b/gi,
    /\brelated\s+issue\s*:\s*#(\d+)\b/gi,
    /\bissue\s+#(\d+)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      // External owner/repository#number references are intentionally ignored.
      if (match[1] && !match[2]) found.add(Number(match[1]));
    }
  }
  return [...found]
    .filter((number) => Number.isSafeInteger(number) && number > 0)
    .slice(0, MAX_ISSUE_REFERENCES);
}

export { MAX_ISSUE_REFERENCES };
