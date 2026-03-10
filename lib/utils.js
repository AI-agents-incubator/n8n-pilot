/**
 * n8n Pilot — Shared Utilities
 */

/**
 * Generate a UUID v4.
 */
export function uuid() {
  return crypto.randomUUID();
}

/**
 * Current ISO timestamp.
 */
export function now() {
  return new Date().toISOString();
}

/**
 * Sleep for ms milliseconds.
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely parse JSON, returning null on failure.
 */
export function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Extract JSON from a string that may contain markdown code blocks or extra text.
 * Tries multiple strategies:
 * 1. Direct JSON.parse
 * 2. Extract from ```json ... ``` blocks
 * 3. Find first { ... } or [ ... ] in the string
 */
export function extractJson(str) {
  if (!str || typeof str !== 'string') return null;

  // Strategy 1: Direct parse
  const direct = safeJsonParse(str.trim());
  if (direct) return direct;

  // Strategy 2: Markdown code block
  const codeBlockMatch = str.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const parsed = safeJsonParse(codeBlockMatch[1].trim());
    if (parsed) return parsed;
  }

  // Strategy 3: Find outermost braces/brackets
  const firstBrace = str.indexOf('{');
  const firstBracket = str.indexOf('[');

  let startChar, endChar, startIdx;
  if (firstBrace === -1 && firstBracket === -1) return null;

  if (firstBrace === -1) {
    startChar = '['; endChar = ']'; startIdx = firstBracket;
  } else if (firstBracket === -1) {
    startChar = '{'; endChar = '}'; startIdx = firstBrace;
  } else if (firstBrace < firstBracket) {
    startChar = '{'; endChar = '}'; startIdx = firstBrace;
  } else {
    startChar = '['; endChar = ']'; startIdx = firstBracket;
  }

  // Find matching closing bracket/brace
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === startChar) depth++;
    if (ch === endChar) depth--;

    if (depth === 0) {
      const candidate = str.substring(startIdx, i + 1);
      const parsed = safeJsonParse(candidate);
      if (parsed) return parsed;
      break;
    }
  }

  return null;
}

/**
 * Truncate string to maxLen characters with ellipsis.
 */
export function truncate(str, maxLen = 100) {
  if (!str || str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Format a timestamp to a human-readable relative time.
 */
export function timeAgo(isoString) {
  const date = new Date(isoString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format token count (e.g., 1234 → "1.2k")
 */
export function formatTokens(count) {
  if (count < 1000) return String(count);
  return (count / 1000).toFixed(1) + 'k';
}

/**
 * Debounce a function.
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Sanitize text for safe insertion into DOM via textContent.
 * (textContent is already safe, but this strips control characters.)
 */
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  // Remove control characters except newline and tab
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
