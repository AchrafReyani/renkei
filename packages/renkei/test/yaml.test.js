/**
 * The renkei.yaml half of the CLI: `renkei init --yaml` (template and .env
 * conversion), `renkei add-channel`, and `renkei add-client` writing to the
 * file instead of RENKEI_CLIENTS. The rule under all of it: the YAML is
 * committable, so a secret is only ever a `${VAR}` in it.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfigFile } from 'renkei-server/config-file';
import { beforeEach, describe, expect, it } from 'vitest';
import { run } from '../lib/cli.js';
import { parseEnv } from '../lib/env-file.js';

const FAKE_JWKS = [
  { kty: 'RSA', kid: 'ktest', alg: 'RS256', use: 'sig', n: 'x', e: 'AQAB', d: 'y' },
];

function harness() {
  const cwd = mkdtempSync(join(tmpdir(), 'renkei-yaml-'));
  const lines = [];
  const io = {
    cwd,
    stdout: (l) => lines.push(l),
    now: () => new Date('2026-09-05T00:00:00Z'),
    jwks: async () => FAKE_JWKS,
  };
  return {
    cwd,
    out: () => lines.join('\n'),
    run: (argv) => run(argv, io),
    yaml: () => readFileSync(join(cwd, 'renkei.yaml'), 'utf8'),
    env: () => parseEnv(readFileSync(join(cwd, '.env'), 'utf8')),
    writeEnv: (text) => writeFileSync(join(cwd, '.env'), text),
    /** Everything the server would see: the file, expanded against the .env. */
    load: () =>
      parseConfigFile(
        readFileSync(join(cwd, 'renkei.yaml'), 'utf8'),
        parseEnv(readFileSync(join(cwd, '.env'), 'utf8')),
      ),
  };
}

/** No literal secret may appear in a file meant to be committed. */
function expectNoSecrets(yaml, secrets) {
  for (const s of secrets) expect(yaml).not.toContain(s);
}

describe('renkei init --yaml', () => {
  let h;
  beforeEach(() => {
    h = harness();
  });

  it('writes a committable renkei.yaml and the .env of secrets it references', async () => {
    expect(await h.run(['init', '--yaml'])).toBe(0);
    const yaml = h.yaml();
    expect(yaml).toContain('secret: "${LINE_LOGIN_CHANNEL_SECRET}"');
    expect(yaml).toContain('cookie_keys: "${RENKEI_COOKIE_KEYS}"');
    expect(yaml).toContain('storage: sqlite:./data/renkei.db');
    expect(yaml).toContain('dev: true');
    // The generated keys are in .env, never in the file.
    const env = h.env();
    expect(env.RENKEI_COOKIE_KEYS).toMatch(/^\S{16,}$/);
    expect(env.RENKEI_JWKS).toBe(JSON.stringify(FAKE_JWKS));
    expect(env.LINE_LOGIN_CHANNEL_ID).toBe('');
    expectNoSecrets(yaml, [env.RENKEI_COOKIE_KEYS, 'ktest']);
    expect(h.out()).toContain('(commit this)');
  });

  it('boots once the channel is pasted in, and not before', async () => {
    await h.run(['init', '--yaml']);
    // Nothing in LINE_LOGIN_CHANNEL_ID yet: the error names the variable.
    expect(() => h.load()).toThrow(/LINE_LOGIN_CHANNEL_ID/);
    h.writeEnv(
      `${readFileSync(join(h.cwd, '.env'), 'utf8')}\nLINE_LOGIN_CHANNEL_ID=2011257262\nLINE_LOGIN_CHANNEL_SECRET=jp-secret\n`,
    );
    const { config } = h.load();
    expect(config.channels).toEqual([
      {
        channelId: '2011257262',
        region: 'jp',
        channelSecret: 'jp-secret',
        botPrompt: 'aggressive',
      },
    ]);
  });

  it('refuses to overwrite an existing renkei.yaml', async () => {
    await h.run(['init', '--yaml']);
    expect(await h.run(['init', '--yaml'])).toBe(1);
    expect(h.out()).toContain('already exists');
  });

  it('--print writes nothing', async () => {
    expect(await h.run(['init', '--yaml', '--print'])).toBe(0);
    expect(existsSync(join(h.cwd, 'renkei.yaml'))).toBe(false);
    expect(existsSync(join(h.cwd, '.env'))).toBe(false);
    expect(h.out()).toContain('channels:');
  });

  describe('converting an existing .env', () => {
    const EXISTING = [
      'ISSUER=https://auth.example.com',
      'DATABASE_URL=postgres://renkei@db/renkei',
      'LINE_LOGIN_CHANNEL_ID=2011257262',
      'LINE_LOGIN_CHANNEL_SECRET=jp-secret-abcdef',
      'RENKEI_CHANNELS=[{"channelId":"2011447387","channelSecret":"tw-secret-abcdef","region":"tw"}]',
      'LINE_MINIAPP_CHANNEL_ID=2011444277',
      'LINE_MINIAPP_CHANNEL_SECRET=miniapp-secret-abcdef',
      'LINE_MESSAGING_CHANNEL_SECRET=msg-secret-abcdef',
      'RENKEI_COOKIE_KEYS=cookie-key-that-is-long-enough',
      `RENKEI_JWKS=${JSON.stringify(FAKE_JWKS)}`,
      'RENKEI_CLIENTS=[{"clientId":"app","clientSecret":"app-secret-abcdef","redirectUris":["https://app.example.com/cb"]}]',
      'RENKEI_SESSION_COOKIE=true',
      '',
    ].join('\n');

    it('says the same thing the variables said', async () => {
      h.writeEnv(EXISTING);
      expect(await h.run(['init', '--yaml'])).toBe(0);
      const { config } = h.load();
      expect(config.issuer).toBe('https://auth.example.com');
      expect(config.channels.map((c) => `${c.channelId}:${c.kind ?? 'login'}:${c.region}`)).toEqual(
        ['2011257262:login:jp', '2011447387:login:tw', '2011444277:miniapp:jp'],
      );
      expect(config.channels.map((c) => c.channelSecret)).toEqual([
        'jp-secret-abcdef',
        'tw-secret-abcdef',
        'miniapp-secret-abcdef',
      ]);
      expect(config.clients).toEqual([
        {
          clientId: 'app',
          clientSecret: 'app-secret-abcdef',
          redirectUris: ['https://app.example.com/cb'],
        },
      ]);
      expect(config.messagingChannels[0].channelSecret).toBe('msg-secret-abcdef');
      expect(config.sessionCookie).toEqual({ enabled: true });
    });

    it('never leaves a secret in the file — the ones buried in JSON get a variable', async () => {
      h.writeEnv(EXISTING);
      await h.run(['init', '--yaml']);
      expectNoSecrets(h.yaml(), [
        'jp-secret-abcdef',
        'tw-secret-abcdef',
        'miniapp-secret-abcdef',
        'msg-secret-abcdef',
        'app-secret-abcdef',
        'cookie-key-that-is-long-enough',
      ]);
      // These two had no variable of their own; the conversion minted one.
      const env = h.env();
      expect(env.LINE_TW_CHANNEL_SECRET).toBe('tw-secret-abcdef');
      expect(env.RENKEI_APP_CLIENT_SECRET).toBe('app-secret-abcdef');
      expect(h.out()).toContain('LINE_TW_CHANNEL_SECRET');
      // The ones that already had a variable keep it rather than gaining a second.
      expect(h.yaml()).toContain('"${LINE_LOGIN_CHANNEL_SECRET}"');
    });

    it('leaves the /dev clients out — `dev: true` puts them back at boot', async () => {
      h.writeEnv('LINE_LOGIN_CHANNEL_ID=1\nLINE_LOGIN_CHANNEL_SECRET=s\n');
      await h.run(['init', '--yaml']);
      expect(h.yaml()).not.toContain('renkei-dev');
      expect(h.yaml()).toContain('dev: true');
      expect(h.load().config.clients.map((c) => c.clientId)).toEqual([
        'renkei-dev',
        'renkei-dev-liff',
      ]);
    });

    it('refuses a .env that configures no channel rather than clobbering it', async () => {
      h.writeEnv('SOMETHING_ELSE=1\n');
      expect(await h.run(['init', '--yaml'])).toBe(1);
      expect(h.out()).toContain('configures no LINE channel');
      expect(existsSync(join(h.cwd, 'renkei.yaml'))).toBe(false);
    });
  });
});

describe('renkei add-channel', () => {
  let h;
  beforeEach(async () => {
    h = harness();
    await h.run(['init', '--yaml']);
    h.writeEnv(
      `${readFileSync(join(h.cwd, '.env'), 'utf8')}\nLINE_LOGIN_CHANNEL_ID=2011257262\nLINE_LOGIN_CHANNEL_SECRET=jp-secret\n`,
    );
  });

  it('adds a second region, secret in .env and referenced from the file', async () => {
    expect(
      await h.run(['add-channel', '2011447387', '--region', 'tw', '--secret', 'tw-secret']),
    ).toBe(0);
    expect(h.yaml()).toContain('secret: "${LINE_TW_CHANNEL_SECRET}"');
    expectNoSecrets(h.yaml(), ['tw-secret']);
    expect(h.env().LINE_TW_CHANNEL_SECRET).toBe('tw-secret');
    const { config } = h.load();
    expect(config.channels.map((c) => c.region)).toEqual(['jp', 'tw']);
    expect(config.channels[1].channelSecret).toBe('tw-secret');
  });

  it('adds a MINI App stage, named after the channel because there is one per stage', async () => {
    await h.run([
      'add-channel',
      '2011444277',
      '--miniapp',
      '--secret',
      'ma-secret',
      '--liff-id',
      '2011444277-oYFL2elQ',
    ]);
    expect(h.env().LINE_MINIAPP_2011444277_CHANNEL_SECRET).toBe('ma-secret');
    const channel = h.load().config.channels[1];
    expect(channel).toMatchObject({
      channelId: '2011444277',
      kind: 'miniapp',
      region: 'jp',
      liffIds: ['2011444277-oYFL2elQ'],
    });
  });

  it('--secret-env only references a variable it does not write', async () => {
    await h.run(['add-channel', '2011447387', '--region', 'tw', '--secret-env', 'MY_TW_SECRET']);
    expect(h.yaml()).toContain('"${MY_TW_SECRET}"');
    expect(h.env().MY_TW_SECRET).toBeUndefined();
    expect(h.out()).toContain('Set MY_TW_SECRET in the environment');
  });

  it('keeps the file readable: comments survive and the entry is block style', async () => {
    await h.run(['add-channel', '2011447387', '--region', 'tw', '--secret', 's']);
    const yaml = h.yaml();
    expect(yaml).toContain('# LINE channels. `renkei add-channel` appends here.');
    expect(yaml).toContain('# Downstream OIDC clients.');
    expect(yaml).not.toMatch(/channels: \[/);
  });

  it('refuses a duplicate channel unless --replace', async () => {
    await h.run(['add-channel', '2011447387', '--region', 'tw', '--secret', 'one']);
    expect(await h.run(['add-channel', '2011447387', '--region', 'tw', '--secret', 'two'])).toBe(1);
    expect(h.out()).toContain('--replace');
    expect(
      await h.run(['add-channel', '2011447387', '--region', 'tw', '--secret', 'two', '--replace']),
    ).toBe(0);
    expect(h.load().config.channels).toHaveLength(2);
    expect(h.env().LINE_TW_CHANNEL_SECRET).toBe('two');
  });

  it('rejects --secret together with --secret-env, and a bad --bot-prompt', async () => {
    expect(await h.run(['add-channel', '1', '--secret', 'a', '--secret-env', 'B'])).toBe(1);
    expect(h.out()).toContain('not both');
    expect(await h.run(['add-channel', '1', '--bot-prompt', 'loud'])).toBe(1);
    expect(h.out()).toContain('--bot-prompt must be one of');
  });

  it('says where to go when there is no renkei.yaml', async () => {
    const bare = harness();
    expect(await bare.run(['add-channel', '2011447387'])).toBe(1);
    expect(bare.out()).toContain('renkei init --yaml');
  });
});

describe('renkei add-client with a renkei.yaml', () => {
  let h;
  beforeEach(async () => {
    h = harness();
    await h.run(['init', '--yaml']);
    h.writeEnv(
      `${readFileSync(join(h.cwd, '.env'), 'utf8')}\nLINE_LOGIN_CHANNEL_ID=2011257262\nLINE_LOGIN_CHANNEL_SECRET=jp-secret\n`,
    );
  });

  it('appends to clients: and puts the generated secret in .env', async () => {
    expect(await h.run(['add-client', 'my-app', '--redirect', 'https://app.example.com/cb'])).toBe(
      0,
    );
    expect(h.yaml()).toContain('client_id: my-app');
    expect(h.yaml()).toContain('client_secret: "${RENKEI_MY_APP_CLIENT_SECRET}"');
    const secret = h.env().RENKEI_MY_APP_CLIENT_SECRET;
    expect(secret).toMatch(/^\S{16,}$/);
    expectNoSecrets(h.yaml(), [secret]);
    // The printed snippet carries the real secret, which is what gets pasted.
    expect(h.out()).toContain(secret);
    const client = h.load().config.clients.find((c) => c.clientId === 'my-app');
    expect(client.clientSecret).toBe(secret);
    expect(client.redirectUris).toEqual(['https://app.example.com/cb']);
  });

  it('leaves RENKEI_CLIENTS alone — one file is the config, not two', async () => {
    await h.run(['add-client', 'my-app', '--redirect', 'https://app.example.com/cb']);
    expect(h.env().RENKEI_CLIENTS).toBeUndefined();
  });

  it('writes no secret for a public client', async () => {
    await h.run([
      'add-client',
      'spa',
      '--preset',
      'public',
      '--redirect',
      'https://spa.example.com/cb',
    ]);
    expect(h.yaml()).toContain('token_endpoint_auth_method: none');
    expect(h.yaml()).not.toContain('client_secret');
    expect(h.env().RENKEI_SPA_CLIENT_SECRET).toBeUndefined();
  });

  it('takes the issuer from the file, so the snippet points at the right renkei', async () => {
    await h.run(['add-client', 'my-app', '--redirect', 'https://app.example.com/cb']);
    expect(h.out()).toContain('http://localhost:3000/.well-known/openid-configuration');
  });

  it('refuses a duplicate unless --replace', async () => {
    await h.run(['add-client', 'my-app', '--redirect', 'https://a.example.com/cb']);
    expect(await h.run(['add-client', 'my-app', '--redirect', 'https://b.example.com/cb'])).toBe(1);
    expect(h.out()).toContain('--replace');
    expect(
      await h.run(['add-client', 'my-app', '--redirect', 'https://b.example.com/cb', '--replace']),
    ).toBe(0);
    const clients = h.load().config.clients.filter((c) => c.clientId === 'my-app');
    expect(clients).toHaveLength(1);
    expect(clients[0].redirectUris).toEqual(['https://b.example.com/cb']);
  });
});
