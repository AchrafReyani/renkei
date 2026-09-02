import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renkeiConfigSchema } from 'renkei-server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../lib/cli.js';
import { parseEnv, setEnvLine } from '../lib/env-file.js';

const FAKE_JWKS = [
  { kty: 'RSA', kid: 'ktest', alg: 'RS256', use: 'sig', n: 'x', e: 'AQAB', d: 'y' },
];

/** Drive the CLI in a temp directory, collecting stdout. */
function harness() {
  const cwd = mkdtempSync(join(tmpdir(), 'renkei-cli-'));
  /** @type {string[]} */
  const lines = [];
  const io = {
    cwd,
    stdout: (l) => lines.push(l),
    now: () => new Date('2026-08-30T00:00:00Z'),
    jwks: async () => FAKE_JWKS,
  };
  return {
    cwd,
    lines,
    out: () => lines.join('\n'),
    run: (argv) => run(argv, io),
    env: () => parseEnv(readFileSync(join(cwd, '.env'), 'utf8')),
    raw: () => readFileSync(join(cwd, '.env'), 'utf8'),
  };
}

describe('env-file', () => {
  it('parses KEY=value, quotes, comments and export prefixes', () => {
    const env = parseEnv(
      '# c\nA=1\nexport B="two words"\nC=\'x=y\'\n# D=hidden\nRENKEI_CLIENTS=[{"a":"b"}]\n',
    );
    expect(env).toEqual({ A: '1', B: 'two words', C: 'x=y', RENKEI_CLIENTS: '[{"a":"b"}]' });
  });

  it('replaces an active line in place, ignores commented ones, appends otherwise', () => {
    const t = '# RENKEI_CLIENTS=[]\nISSUER=http://a\nRENKEI_CLIENTS=[1]\n';
    expect(setEnvLine(t, 'RENKEI_CLIENTS', '[2]')).toBe(
      '# RENKEI_CLIENTS=[]\nISSUER=http://a\nRENKEI_CLIENTS=[2]\n',
    );
    expect(setEnvLine('ISSUER=http://a', 'X', 'y')).toBe('ISSUER=http://a\nX=y\n');
    expect(setEnvLine('', 'X', 'y')).toBe('X=y\n');
  });
});

describe('renkei init', () => {
  let h;
  beforeEach(() => {
    h = harness();
  });
  afterEach(() => rmSync(h.cwd, { recursive: true, force: true }));

  it('writes a runnable .env with generated keys, sqlite storage and the dev page on', async () => {
    expect(await h.run(['init'])).toBe(0);
    const env = h.env();
    expect(env.ISSUER).toBe('http://localhost:3000');
    expect(env.DATABASE_URL).toBe('sqlite:./data/renkei.db');
    expect(env.RENKEI_DEV).toBe('true');
    expect(env.RENKEI_COOKIE_KEYS.length).toBeGreaterThanOrEqual(32);
    expect(JSON.parse(env.RENKEI_JWKS)).toEqual(FAKE_JWKS);
    expect(env.LINE_LOGIN_CHANNEL_ID).toBe('');
    expect(env.LINE_LOGIN_CHANNEL_SECRET).toBe('');
    expect(h.raw()).toContain('http://localhost:3000/line/callback');
    expect(h.out()).toContain('npx renkei');
  });

  it('honours --issuer and --db and strips a trailing slash', async () => {
    await h.run(['init', '--issuer', 'https://auth.example.com/', '--db', 'postgres://u:p@h/db']);
    const env = h.env();
    expect(env.ISSUER).toBe('https://auth.example.com');
    expect(env.DATABASE_URL).toBe('postgres://u:p@h/db');
    expect(h.raw()).toContain('https://auth.example.com/line/callback');
  });

  it('refuses to overwrite an existing .env', async () => {
    writeFileSync(join(h.cwd, '.env'), 'KEEP=1\n');
    expect(await h.run(['init'])).toBe(1);
    expect(h.raw()).toBe('KEEP=1\n');
    expect(h.out()).toContain('already exists');
  });

  it('--print writes nothing', async () => {
    expect(await h.run(['init', '--print'])).toBe(0);
    expect(() => h.raw()).toThrow();
    expect(h.out()).toContain('RENKEI_JWKS=');
  });

  it('rejects a relative issuer', async () => {
    expect(await h.run(['init', '--issuer', 'auth.example.com'])).toBe(1);
    expect(h.out()).toContain('absolute URL');
  });
});

describe('renkei add-client', () => {
  let h;
  beforeEach(async () => {
    h = harness();
    await h.run(['init', '--issuer', 'https://auth.example.com']);
    h.lines.length = 0;
  });
  afterEach(() => rmSync(h.cwd, { recursive: true, force: true }));

  it('registers an Auth.js client with a generated secret and prints the provider block', async () => {
    const code = await h.run([
      'add-client',
      'my-next-app',
      '--redirect',
      'http://localhost:3400/api/auth/callback/renkei',
      '--preset',
      'authjs',
    ]);
    expect(code).toBe(0);
    const clients = JSON.parse(h.env().RENKEI_CLIENTS);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      clientId: 'my-next-app',
      redirectUris: ['http://localhost:3400/api/auth/callback/renkei'],
    });
    expect(clients[0].clientSecret).toHaveLength(32);
    expect(h.out()).toContain(`RENKEI_CLIENT_SECRET=${clients[0].clientSecret}`);
    expect(h.out()).toContain('RENKEI_ISSUER=https://auth.example.com');
    expect(h.out()).toContain("type: 'oidc'");
  });

  it('supabase preset defaults a placeholder email domain and prints the Keycloak fields', async () => {
    await h.run([
      'add-client',
      'supabase',
      '--redirect',
      'https://abc.supabase.co/auth/v1/callback',
      '--preset',
      'supabase',
    ]);
    const [c] = JSON.parse(h.env().RENKEI_CLIENTS);
    expect(c.placeholderEmailDomain).toBe('line-users.auth.example.com');
    expect(h.out()).toContain('Keycloak');
    expect(h.out()).toContain('Realm URL      https://auth.example.com');
    expect(h.out()).toContain(`secret = "${c.clientSecret}"`);
    expect(h.out()).toContain('[auth.external.keycloak]');
  });

  it('public preset has no secret and says PKCE', async () => {
    await h.run([
      'add-client',
      'spa',
      '--redirect',
      'https://spa.example.com/cb',
      '--preset',
      'public',
    ]);
    const [c] = JSON.parse(h.env().RENKEI_CLIENTS);
    expect(c).toEqual({
      clientId: 'spa',
      redirectUris: ['https://spa.example.com/cb'],
      tokenEndpointAuthMethod: 'none',
    });
    expect(h.out()).toContain('PKCE');
  });

  it('appends to existing clients, refuses duplicates unless --replace, keeps the rest of .env', async () => {
    await h.run(['add-client', 'a', '--redirect', 'https://a.example.com/cb']);
    await h.run([
      'add-client',
      'b',
      '--redirect',
      'https://b.example.com/cb',
      '--redirect',
      'https://b.example.com/cb2',
    ]);
    expect(JSON.parse(h.env().RENKEI_CLIENTS).map((c) => c.clientId)).toEqual(['a', 'b']);
    expect(JSON.parse(h.env().RENKEI_CLIENTS)[1].redirectUris).toHaveLength(2);

    h.lines.length = 0;
    expect(await h.run(['add-client', 'a', '--redirect', 'https://a.example.com/new'])).toBe(1);
    expect(h.out()).toContain('--replace');

    expect(
      await h.run(['add-client', 'a', '--redirect', 'https://a.example.com/new', '--replace']),
    ).toBe(0);
    const clients = JSON.parse(h.env().RENKEI_CLIENTS);
    expect(clients.map((c) => c.clientId)).toEqual(['a', 'b']);
    expect(clients[0].redirectUris).toEqual(['https://a.example.com/new']);

    const env = h.env();
    expect(env.ISSUER).toBe('https://auth.example.com');
    expect(env.RENKEI_DEV).toBe('true');
    expect(h.raw().match(/^RENKEI_CLIENTS=/gm)).toHaveLength(1);
  });

  it('produces a RENKEI_CLIENTS the server config accepts as-is', async () => {
    await h.run([
      'add-client',
      'app',
      '--redirect',
      'https://app.example.com/cb',
      '--preset',
      'authjs',
    ]);
    await h.run([
      'add-client',
      'spa',
      '--redirect',
      'https://spa.example.com/cb',
      '--preset',
      'public',
    ]);
    const env = h.env();
    const config = renkeiConfigSchema.parse({
      issuer: env.ISSUER,
      channels: [{ channelId: '1', channelSecret: 'secret-secret-secret', region: 'jp' }],
      clients: JSON.parse(env.RENKEI_CLIENTS),
      cookieKeys: env.RENKEI_COOKIE_KEYS.split(','),
    });
    expect(config.clients.map((c) => c.clientId)).toEqual(['app', 'spa']);
  });

  it('validates input: missing redirect, bad preset, unknown region, invalid existing JSON', async () => {
    expect(await h.run(['add-client', 'x'])).toBe(1);
    expect(h.out()).toContain('--redirect is required');
    h.lines.length = 0;
    expect(await h.run(['add-client', 'x', '--redirect', 'https://x/cb', '--preset', 'nope'])).toBe(
      1,
    );
    expect(h.out()).toContain('--preset must be one of');
    h.lines.length = 0;
    expect(await h.run(['add-client', 'x', '--redirect', 'not a url'])).toBe(1);
    h.lines.length = 0;
    writeFileSync(join(h.cwd, '.env'), 'RENKEI_CLIENTS=[oops\n');
    expect(await h.run(['add-client', 'x', '--redirect', 'https://x/cb'])).toBe(1);
    expect(h.out()).toContain('not valid JSON');
  });

  it('--print shows the line and snippet without touching .env; needs no .env at all', async () => {
    const before = h.raw();
    expect(await h.run(['add-client', 'p', '--redirect', 'https://p/cb', '--print'])).toBe(0);
    expect(h.raw()).toBe(before);
    expect(h.out()).toMatch(/^RENKEI_CLIENTS=\[\{"clientId":"p"/m);

    rmSync(join(h.cwd, '.env'));
    h.lines.length = 0;
    expect(
      await h.run([
        'add-client',
        'q',
        '--redirect',
        'https://q/cb',
        '--print',
        '--issuer',
        'https://i.example.com',
      ]),
    ).toBe(0);
    expect(h.out()).toContain('https://i.example.com/.well-known/openid-configuration');
    expect(h.out()).toContain(
      "createRenkeiClient({ issuer: 'https://i.example.com', clientId: 'q' })",
    );
    expect(h.out()).toContain("redirectUri: 'https://q/cb', state, nonce });");
    h.lines.length = 0;
    expect(await h.run(['add-client', 'q', '--redirect', 'https://q/cb'])).toBe(1);
    expect(h.out()).toContain('renkei init');
  });
});

describe('renkei (no args / unknown)', () => {
  it('prints help and fails on an unknown command', async () => {
    const lines = [];
    expect(await run(['frobnicate'], { stdout: (l) => lines.push(l) })).toBe(1);
    expect(lines.join('\n')).toContain('usage: renkei');
  });
});
