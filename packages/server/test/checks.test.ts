import { describe, expect, it } from 'vitest';
import { firstRunChecks, reportFirstRunChecks } from '../src/checks.js';
import { parseConfig, type RenkeiConfigInput } from '../src/config.js';

const base: RenkeiConfigInput = {
  issuer: 'https://auth.example.com',
  channels: [{ channelId: '1000', channelSecret: 'login-secret-0123456789', region: 'jp' }],
  clients: [
    {
      clientId: 'app',
      clientSecret: 'app-secret-0123456789abcdef',
      redirectUris: ['https://app.example.com/cb'],
    },
  ],
  cookieKeys: ['0123456789abcdef0123'],
  // A configured (empty-shaped) JWK so the no-jwks check does not fire by default.
  jwks: [{ kty: 'oct', k: 'x' }],
};

function codes(input: RenkeiConfigInput, hasPersistentStorage = true): string[] {
  return firstRunChecks(parseConfig(input), { hasPersistentStorage }).map((c) => c.code);
}

describe('firstRunChecks', () => {
  it('is quiet for a well-formed production-shaped config', () => {
    expect(codes(base)).toEqual([]);
  });

  it('warns when no signing keys are configured', () => {
    const { jwks: _drop, ...noJwks } = base;
    const found = firstRunChecks(parseConfig(noJwks), { hasPersistentStorage: true });
    const c = found.find((x) => x.code === 'no-jwks');
    expect(c?.level).toBe('warn');
  });

  it('warns when storage is in-memory', () => {
    expect(codes(base, false)).toContain('memory-storage');
  });

  it('notes when the /inspect endpoints are enabled via adminToken', () => {
    const found = firstRunChecks(
      parseConfig({ ...base, adminToken: 'a-long-enough-admin-token' }),
      { hasPersistentStorage: true },
    );
    const c = found.find((x) => x.code === 'inspect-enabled');
    expect(c?.level).toBe('info');
  });

  it('warns when the /dev relying party is enabled', () => {
    const found = firstRunChecks(parseConfig({ ...base, dev: true }), {
      hasPersistentStorage: true,
    });
    const c = found.find((x) => x.code === 'dev-rp-enabled');
    expect(c?.level).toBe('warn');
  });

  it('notes each channel that requests the email scope', () => {
    const cfg: RenkeiConfigInput = {
      ...base,
      channels: [
        {
          channelId: '1000',
          channelSecret: 'login-secret-0123456789',
          region: 'jp',
          requestEmail: true,
        },
      ],
    };
    const found = firstRunChecks(parseConfig(cfg), { hasPersistentStorage: true });
    const c = found.find((x) => x.code === 'email-scope-requested');
    expect(c?.level).toBe('info');
    expect(c?.message).toContain('1000');
  });

  it('warns when a messaging channel region matches no login channel', () => {
    const cfg: RenkeiConfigInput = {
      ...base,
      messagingChannels: [{ channelSecret: 'msg-secret-0123456789', region: 'tw' }],
    };
    const found = firstRunChecks(parseConfig(cfg), { hasPersistentStorage: true });
    const c = found.find((x) => x.code === 'messaging-region-unmatched');
    expect(c?.level).toBe('warn');
    expect(c?.message).toContain('tw');
  });

  it('does not warn when the messaging channel region matches a login channel', () => {
    const cfg: RenkeiConfigInput = {
      ...base,
      messagingChannels: [{ channelSecret: 'msg-secret-0123456789', region: 'jp' }],
    };
    expect(codes(cfg)).not.toContain('messaging-region-unmatched');
  });

  it('reminds about provider-sharing and the webhook URL when messaging is configured', () => {
    const cfg: RenkeiConfigInput = {
      ...base,
      messagingChannels: [{ channelSecret: 'msg-secret-0123456789', region: 'jp' }],
    };
    const found = firstRunChecks(parseConfig(cfg), { hasPersistentStorage: true });
    const c = found.find((x) => x.code === 'messaging-provider-reminder');
    expect(c?.level).toBe('info');
    expect(c?.message).toContain('https://auth.example.com/line/webhook');
  });

  it('reportFirstRunChecks routes levels to the matching logger method', () => {
    const warns: string[] = [];
    const infos: string[] = [];
    const cfg: RenkeiConfigInput = {
      ...base,
      dev: true,
      messagingChannels: [{ channelSecret: 'msg-secret-0123456789', region: 'jp' }],
    };
    reportFirstRunChecks(
      parseConfig(cfg),
      { hasPersistentStorage: false },
      { warn: (m) => warns.push(String(m)), info: (m) => infos.push(String(m)) },
    );
    expect(warns.some((m) => m.includes('memory'))).toBe(true);
    expect(warns.some((m) => m.includes('/dev'))).toBe(true);
    expect(infos.some((m) => m.includes('/line/webhook'))).toBe(true);
    expect(warns.every((m) => m.startsWith('[renkei] '))).toBe(true);
  });
});
