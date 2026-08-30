// Minimal .env reader/writer. Understands what `node --env-file` understands
// (KEY=value, # comments, optional matching quotes) and rewrites a file by
// replacing the line that sets a key, or appending — every other line is kept
// byte for byte. Values are written unquoted on one line so the same file
// works for `node --env-file`, `docker run --env-file` and docker compose.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** @param {string} text @returns {Record<string, string>} */
export function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m || raw.trimStart().startsWith('#')) continue;
    let value = m[2].trim();
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/** @param {string} path */
export function readEnvFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

/**
 * Set `key` to `value` in the file's text: replaces the first active line that
 * sets it (an active line wins over a commented `# KEY=` one), otherwise
 * appends at the end.
 * @param {string} text @param {string} key @param {string} value
 */
export function setEnvLine(text, key, value) {
  const lines = text.split(/\r?\n/);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const idx = lines.findIndex((l) => {
    const m = LINE.exec(l);
    return m && m[1] === key && !l.trimStart().startsWith('#');
  });
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`;
    return lines.join(nl);
  }
  const trimmed = text.replace(/\s+$/, '');
  return `${trimmed}${trimmed ? nl : ''}${key}=${value}${nl}`;
}

/** @param {string} path @param {string} key @param {string} value */
export function writeEnvKey(path, key, value) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, setEnvLine(text, key, value));
}
