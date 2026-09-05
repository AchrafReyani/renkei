import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStorage } from 'renkei-core';
import { describe, expect, it } from 'vitest';
import { createRenkei } from '../src/app.js';
import {
  findConfigFile,
  ignoredEnvVars,
  loadConfigFile,
  parseConfigFile,
  referencedEnvVars,
} from '../src/config-file.js';

const SECRETS = {
  LINE_JP_SECRET: 'jp-secret-value',
  LINE_TW_SECRET: 'tw-secret-value',
  APP_SECRET: 'app-secret-value',
};

const MINIMAL = `
issuer: https://auth.example.com
channels:
  - id: "1234567890"
    region: jp
    secret: \${LINE_JP_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/callback"]
cookie_keys: ["cookie-key-at-least-16-chars"]
`;

function parse(text: string, env: Record<string, string | undefined> = SECRETS) {
  return parseConfigFile(text, env);
}

describe('renkei.yaml', () => {
  it('reads the sketch shape into the server config', () => {
    const { config } = parse(MINIMAL);
    expect(config.issuer).toBe('https://auth.example.com');
    expect(config.channels).toEqual([
      { channelId: '1234567890', region: 'jp', channelSecret: 'jp-secret-value' },
    ]);
    expect(config.clients).toEqual([
      {
        clientId: 'app',
        clientSecret: 'app-secret-value',
        redirectUris: ['https://app.example.com/callback'],
      },
    ]);
  });

  it('accepts the camelCase spelling of the schema next to snake_case', () => {
    const { config } = parse(`
issuer: https://auth.example.com
channels:
  - channelId: "1"
    channelSecret: \${LINE_JP_SECRET}
    botPrompt: normal
    liffIds: ["1-abc"]
clients:
  - clientId: app
    clientSecret: \${APP_SECRET}
    redirectUris: ["https://app.example.com/cb"]
    tokenEndpointAuthMethod: client_secret_post
cookie_keys: ["cookie-key-at-least-16-chars"]
`);
    expect(config.channels[0]).toMatchObject({ botPrompt: 'normal', liffIds: ['1-abc'] });
    expect(config.clients[0]).toMatchObject({ tokenEndpointAuthMethod: 'client_secret_post' });
  });

  it('keeps an unquoted numeric channel id a string', () => {
    const { config } = parse(`
issuer: https://auth.example.com
channels:
  - id: 1234567890
    secret: \${LINE_JP_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/cb"]
cookie_keys: ["cookie-key-at-least-16-chars"]
`);
    expect(config.channels[0]?.channelId).toBe('1234567890');
  });

  it('carries the deploy-time fields separately from the server config', () => {
    const loaded = parse(`${MINIMAL}
storage: sqlite:./data/renkei.db
port: 8787
liff_id: 1234567890-abcdefgh
log_format: json
`);
    expect(loaded.storage).toBe('sqlite:./data/renkei.db');
    expect(loaded.port).toBe(8787);
    expect(loaded.liffId).toBe('1234567890-abcdefgh');
    expect(loaded.logFormat).toBe('json');
    expect(loaded.config).not.toHaveProperty('storage');
    expect(loaded.config).not.toHaveProperty('port');
  });

  it('folds a single `messaging:` mapping into messagingChannels', () => {
    const { config } = parse(`${MINIMAL}
messaging:
  channel_id: 3456789012
  channel_secret: \${LINE_JP_SECRET}
  channel_access_token: token
`);
    expect(config.messagingChannels).toEqual([
      { channelId: '3456789012', channelSecret: 'jp-secret-value', channelAccessToken: 'token' },
    ]);
  });

  it('refuses messaging and messaging_channels together', () => {
    expect(() =>
      parse(`${MINIMAL}
messaging:
  channel_secret: \${LINE_JP_SECRET}
messaging_channels:
  - channel_secret: \${LINE_JP_SECRET}
`),
    ).toThrow(/not both/);
  });

  it('takes cookie_keys and jwks as a single ${VAR} holding what the env var holds', () => {
    const jwks = [
      { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd', kid: 'k1', key_ops: ['sign'] },
    ];
    const { config } = parse(
      `
issuer: https://auth.example.com
channels:
  - id: "1"
    secret: \${LINE_JP_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/cb"]
cookie_keys: \${RENKEI_COOKIE_KEYS}
jwks: \${RENKEI_JWKS}
`,
      {
        ...SECRETS,
        RENKEI_COOKIE_KEYS: 'cookie-key-at-least-16-chars,second-key-at-least-16',
        RENKEI_JWKS: JSON.stringify(jwks),
      },
    );
    expect(config.cookieKeys).toEqual(['cookie-key-at-least-16-chars', 'second-key-at-least-16']);
    // JWK member names are not ours to rewrite: `key_ops` must survive intact.
    expect(config.jwks).toEqual(jwks);
  });

  it('generates a cookie key when the file sets none, as the env path does', () => {
    const { config } = parse(`
issuer: https://auth.example.com
channels:
  - id: "1"
    secret: \${LINE_JP_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/cb"]
`);
    expect(config.cookieKeys?.[0]).toMatch(/^\S{16,}$/);
  });

  it('registers the /dev clients for `dev: true` so the file needs no client at all', () => {
    const { config } = parse(`
issuer: https://auth.example.com
dev: true
channels:
  - id: "1"
    secret: \${LINE_JP_SECRET}
`);
    expect(config.clients?.map((c) => c.clientId)).toEqual(['renkei-dev', 'renkei-dev-liff']);
  });

  describe('${VAR} expansion', () => {
    it('interpolates inside a longer string', () => {
      const { config } = parse(
        `
issuer: https://\${HOST}/auth
channels:
  - id: "1"
    secret: \${LINE_JP_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/cb"]
cookie_keys: ["cookie-key-at-least-16-chars"]
`,
        { ...SECRETS, HOST: 'auth.example.com' },
      );
      expect(config.issuer).toBe('https://auth.example.com/auth');
    });

    it('names the variable and the field when it is not set', () => {
      expect(() => parse(MINIMAL, {})).toThrow(/channels\[0\]\.secret/);
      expect(() => parse(MINIMAL, {})).toThrow(/LINE_JP_SECRET/);
    });

    it('uses :- as a fallback', () => {
      const { config } = parse(
        `
issuer: https://auth.example.com
channels:
  - id: "1"
    region: \${LINE_REGION:-jp}
    secret: \${LINE_JP_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/cb"]
cookie_keys: ["cookie-key-at-least-16-chars"]
`,
        SECRETS,
      );
      expect(config.channels[0]?.region).toBe('jp');
    });

    it('leaves $${ as a literal ${', () => {
      const { config } = parse(`${MINIMAL}
cors_origins: ["https://$\${literal}.example.com"]
`);
      expect(config.corsOrigins).toEqual(['https://${literal}.example.com']);
    });

    it('lists the names a file references', () => {
      expect(referencedEnvVars(MINIMAL).sort()).toEqual(['APP_SECRET', 'LINE_JP_SECRET']);
    });
  });

  describe('errors', () => {
    it('prefixes schema failures with the file name', () => {
      expect(() =>
        parseConfigFile('issuer: not-a-url\nchannels: []\nclients: []\n', {}, 'my.yaml'),
      ).toThrow(/^my\.yaml: /);
    });

    it('rejects an empty file and a non-mapping top level', () => {
      expect(() => parse('')).toThrow(/empty/);
      expect(() => parse('- a\n- b\n')).toThrow(/top level must be a mapping/);
    });

    it('reports invalid YAML as such', () => {
      expect(() => parse('issuer: "unterminated\n')).toThrow(/not valid YAML/);
    });

    it('still enforces one Login channel per region', () => {
      expect(() =>
        parse(`
issuer: https://auth.example.com
channels:
  - id: "1"
    secret: \${LINE_JP_SECRET}
  - id: "2"
    secret: \${LINE_TW_SECRET}
clients:
  - client_id: app
    client_secret: \${APP_SECRET}
    redirect_uris: ["https://app.example.com/cb"]
cookie_keys: ["cookie-key-at-least-16-chars"]
`),
      ).toThrow(/duplicate channel region/);
    });
  });

  describe('discovery and precedence', () => {
    it('finds renkei.yaml in the working directory, and nothing when there is none', () => {
      const dir = mkdtempSync(join(tmpdir(), 'renkei-cfg-'));
      expect(findConfigFile(dir, {})).toBeUndefined();
      writeFileSync(join(dir, 'renkei.yaml'), MINIMAL);
      expect(findConfigFile(dir, {})).toBe(join(dir, 'renkei.yaml'));
      expect(loadConfigFile(join(dir, 'renkei.yaml'), SECRETS).config.issuer).toBe(
        'https://auth.example.com',
      );
    });

    it('follows RENKEI_CONFIG, and fails loudly when that path does not exist', () => {
      const dir = mkdtempSync(join(tmpdir(), 'renkei-cfg-'));
      writeFileSync(join(dir, 'other.yaml'), MINIMAL);
      expect(findConfigFile(dir, { RENKEI_CONFIG: 'other.yaml' })).toBe(join(dir, 'other.yaml'));
      expect(() => findConfigFile(dir, { RENKEI_CONFIG: 'missing.yaml' })).toThrow(/cannot read/);
    });

    it('names the env variables the file supersedes, but not the ones it references', () => {
      const env = {
        LINE_LOGIN_CHANNEL_ID: 'stale',
        RENKEI_CLIENTS: '[]',
        LINE_JP_SECRET: 'referenced',
        DATABASE_URL: 'postgres://…',
        PORT: '3000',
      };
      const ignored = ignoredEnvVars(env, referencedEnvVars(MINIMAL));
      expect(ignored).toEqual(['LINE_LOGIN_CHANNEL_ID', 'RENKEI_CLIENTS']);
      // The two slots the deploy platform owns keep working next to a file.
      expect(ignored).not.toContain('DATABASE_URL');
      expect(ignored).not.toContain('PORT');
    });
  });

  it('boots a working renkei — the file is the whole configuration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'renkei-cfg-'));
    writeFileSync(
      join(dir, 'renkei.yaml'),
      `${MINIMAL}
session_cookie:
  enabled: true
cors_origins: ["https://liff.example.com"]
`,
    );
    const { config } = loadConfigFile(findConfigFile(dir, {}) as string, SECRETS);
    const renkei = await createRenkei({ config, storage: createMemoryStorage() });

    const discovery = await renkei.app.request(
      'https://auth.example.com/.well-known/openid-configuration',
    );
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({ issuer: 'https://auth.example.com' });
    // `session_cookie.enabled` in the file really mounts the session routes.
    const session = await renkei.app.request('https://auth.example.com/session');
    expect(session.status).toBe(401);
  });
});
