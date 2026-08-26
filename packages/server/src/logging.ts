/**
 * Structured logging with redaction.
 *
 * renkei handles channel secrets, access tokens, id_tokens, link tokens and
 * cookies — none of which should ever reach a log sink. `createLogger` wraps a
 * base logger (console by default) and, before anything is emitted, deep-redacts
 * the metadata object by key name. It can also emit one JSON object per line for
 * production log aggregators. Redaction is key-based and always on; the JSON
 * format is opt-in.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/**
 * Metadata keys whose values are replaced with `[redacted]` (case-insensitive,
 * matched after stripping `_`/`-` so `access_token`, `accessToken` and
 * `access-token` all hit). Deliberately broad: better to redact a harmless
 * field than to leak a token.
 */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'authorization',
  'cookie',
  'setcookie',
  'xlinesignature',
  'xrenkeisignature',
  'secret',
  'channelsecret',
  'channelaccesstoken',
  'clientsecret',
  'accountlinkforwardsecret',
  'admintoken',
  'cookiekeys',
  'jwks',
  'jwk',
  'privatekey',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'token',
  'linktoken',
  'code',
  'codeverifier',
  'password',
  'nonce',
];

const REDACTED = '[redacted]';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/**
 * Return a copy of `value` with any property whose key matches `keys` replaced
 * by `[redacted]`. Recurses into plain objects and arrays; leaves primitives as
 * is; guards against cycles. Errors become `{ name, message }` (their `stack`
 * can carry URLs with tokens, so it is dropped).
 */
export function redact(
  value: unknown,
  keys: ReadonlySet<string>,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redact(v, keys, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = keys.has(normalizeKey(k)) ? REDACTED : redact(v, keys, seen);
  }
  return out;
}

export interface LoggerOptions {
  /** Sink the wrapped logger writes to. Defaults to `console`. */
  base?: Pick<Console, LogLevel>;
  /** Emit one JSON object per line instead of `(message, meta)`. */
  json?: boolean;
  /** Extra keys to redact, on top of {@link DEFAULT_REDACT_KEYS}. */
  redactKeys?: Iterable<string>;
}

/**
 * Wrap a base logger so every call redacts its metadata first. With
 * `json: true`, each entry is emitted as a single JSON line
 * (`{ level, msg, ...meta }`) — otherwise as `base[level](message, redactedMeta)`.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const base = options.base ?? console;
  const keys = new Set<string>(DEFAULT_REDACT_KEYS.map(normalizeKey));
  for (const k of options.redactKeys ?? []) keys.add(normalizeKey(k));

  const emit = (level: LogLevel, message: string, meta?: unknown) => {
    const safe = meta === undefined ? undefined : redact(meta, keys);
    if (options.json) {
      const record: Record<string, unknown> = { level, msg: message };
      if (safe !== undefined) {
        if (safe && typeof safe === 'object' && !Array.isArray(safe)) {
          Object.assign(record, safe);
        } else {
          record.meta = safe;
        }
      }
      base[level](JSON.stringify(record));
    } else if (safe === undefined) {
      base[level](message);
    } else {
      base[level](message, safe);
    }
  };

  return {
    info: (m, meta) => emit('info', m, meta),
    warn: (m, meta) => emit('warn', m, meta),
    error: (m, meta) => emit('error', m, meta),
  };
}
