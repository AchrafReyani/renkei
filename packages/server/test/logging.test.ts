/**
 * Structured logging + redaction: secrets never reach the sink, and JSON mode
 * emits one object per line.
 */
import { describe, expect, it } from 'vitest';
import { createLogger, DEFAULT_REDACT_KEYS, type LogLevel, redact } from '../src/logging.js';

const KEYS = new Set(DEFAULT_REDACT_KEYS);

describe('redact', () => {
  it('replaces sensitive keys regardless of case, underscores or dashes', () => {
    const out = redact(
      {
        access_token: 'at',
        accessToken: 'at2',
        'access-token': 'at3',
        Authorization: 'Bearer x',
        channelSecret: 's',
        sub: 'keep-me',
      },
      KEYS,
    ) as Record<string, unknown>;
    expect(out.access_token).toBe('[redacted]');
    expect(out.accessToken).toBe('[redacted]');
    expect(out['access-token']).toBe('[redacted]');
    expect(out.Authorization).toBe('[redacted]');
    expect(out.channelSecret).toBe('[redacted]');
    expect(out.sub).toBe('keep-me');
  });

  it('recurses into nested objects and arrays', () => {
    const out = redact(
      { user: { id: 1, id_token: 'jwt' }, items: [{ token: 't' }, { ok: true }] },
      KEYS,
    ) as { user: Record<string, unknown>; items: Array<Record<string, unknown>> };
    expect(out.user.id).toBe(1);
    expect(out.user.id_token).toBe('[redacted]');
    expect(out.items[0]?.token).toBe('[redacted]');
    expect(out.items[1]?.ok).toBe(true);
  });

  it('reduces Errors to name+message (drops stack, which can carry tokens)', () => {
    const out = redact({ err: new Error('boom') }, KEYS) as { err: Record<string, unknown> };
    expect(out.err).toEqual({ name: 'Error', message: 'boom' });
    expect(out.err.stack).toBeUndefined();
  });

  it('handles circular references without throwing', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    const out = redact(a, KEYS) as Record<string, unknown>;
    expect(out.name).toBe('a');
    expect(out.self).toBe('[circular]');
  });

  it('leaves primitives untouched', () => {
    expect(redact('hello', KEYS)).toBe('hello');
    expect(redact(42, KEYS)).toBe(42);
    expect(redact(null, KEYS)).toBe(null);
  });
});

interface Captured {
  level: LogLevel;
  args: unknown[];
}

function capturingBase() {
  const calls: Captured[] = [];
  const make =
    (level: LogLevel) =>
    (...args: unknown[]) =>
      calls.push({ level, args });
  return { calls, info: make('info'), warn: make('warn'), error: make('error') };
}

describe('createLogger', () => {
  it('redacts metadata before passing it to the base sink', () => {
    const base = capturingBase();
    const log = createLogger({ base });
    log.info('login', { sub: 'u1', access_token: 'secret' });
    expect(base.calls[0]?.args[0]).toBe('login');
    expect(base.calls[0]?.args[1]).toEqual({ sub: 'u1', access_token: '[redacted]' });
  });

  it('passes the message alone when there is no metadata', () => {
    const base = capturingBase();
    createLogger({ base }).warn('just a message');
    expect(base.calls[0]?.args).toEqual(['just a message']);
  });

  it('emits one JSON line with level + msg + fields in json mode', () => {
    const base = capturingBase();
    const log = createLogger({ base, json: true });
    log.error('boom', { channelSecret: 's', status: 502 });
    expect(base.calls[0]?.args).toHaveLength(1);
    const parsed = JSON.parse(String(base.calls[0]?.args[0]));
    expect(parsed).toEqual({
      level: 'error',
      msg: 'boom',
      channelSecret: '[redacted]',
      status: 502,
    });
  });

  it('honours extra redact keys', () => {
    const base = capturingBase();
    const log = createLogger({ base, redactKeys: ['ssn'] });
    log.info('x', { ssn: '123-45-6789', name: 'ok' });
    expect(base.calls[0]?.args[1]).toEqual({ ssn: '[redacted]', name: 'ok' });
  });
});
