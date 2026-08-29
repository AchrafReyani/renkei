/**
 * The /dev relying party must only ever log in as a client registered for
 * renkei's own /dev/callback — never the first client in the list. With
 * RENKEI_DEV=true next to RENKEI_CLIENTS the dev clients are appended.
 */
import { createMemoryStorage } from 'renkei-core';
import { describe, expect, it } from 'vitest';
import type { RenkeiConfigInput } from '../src/config.js';
import { devClientsFor, withDevClients } from '../src/dev-rp.js';
import { createRenkei } from '../src/index.js';

const ISSUER = 'http://renkei.test';
const APP = {
  clientId: 'app',
  clientSecret: 'app-secret-0123456789abcdef',
  redirectUris: ['http://app.test/cb'],
};

function config(clients: RenkeiConfigInput['clients']): RenkeiConfigInput {
  return {
    issuer: ISSUER,
    dev: true,
    channels: [{ channelId: '2011257262', channelSecret: 'login-secret-0123456789', region: 'jp' }],
    clients,
    cookieKeys: ['0123456789abcdef0123'],
  };
}

async function boot(clients: RenkeiConfigInput['clients']) {
  const warns: string[] = [];
  const renkei = await createRenkei({
    config: config(clients),
    storage: createMemoryStorage(),
    logger: { warn: (m) => warns.push(String(m)), info: () => {}, error: () => {} },
  });
  return { renkei, warns };
}

describe('withDevClients', () => {
  it('appends both dev clients after the operator-supplied ones', () => {
    const merged = withDevClients([APP], ISSUER);
    expect(merged.map((c) => c.clientId)).toEqual(['app', 'renkei-dev', 'renkei-dev-liff']);
    expect(merged[0]).toBe(APP);
    expect(merged[1]?.redirectUris).toEqual([`${ISSUER}/dev/callback`]);
    expect(merged[2]?.tokenEndpointAuthMethod).toBe('none');
  });

  it('keeps an operator-defined client with the same clientId', () => {
    const mine = { ...APP, clientId: 'renkei-dev' };
    const merged = withDevClients([mine], ISSUER);
    expect(merged.map((c) => c.clientId)).toEqual(['renkei-dev', 'renkei-dev-liff']);
    expect(merged[0]).toBe(mine);
  });
});

describe('/dev client selection', () => {
  it('logs in as renkei-dev, not the first client, when both are present', async () => {
    const { renkei, warns } = await boot([APP, ...devClientsFor(ISSUER)]);
    const res = await renkei.fetch(new Request(`${ISSUER}/dev/login`, { redirect: 'manual' }));
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get('location') ?? '');
    expect(url.pathname).toBe('/oidc/auth');
    expect(url.searchParams.get('client_id')).toBe('renkei-dev');
    expect(url.searchParams.get('redirect_uri')).toBe(`${ISSUER}/dev/callback`);
    expect(warns.some((m) => m.includes('/dev/callback'))).toBe(false);

    const page = await renkei.fetch(new Request(`${ISSUER}/dev`));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<code>renkei-dev</code>');
  });

  it('refuses to borrow a foreign client: explains, 503s, warns at boot', async () => {
    const { renkei, warns } = await boot([APP]);
    expect(warns.some((m) => m.includes(`${ISSUER}/dev/callback`))).toBe(true);

    const page = await renkei.fetch(new Request(`${ISSUER}/dev`));
    expect(page.status).toBe(503);
    const html = await page.text();
    expect(html).toContain('renkei-dev');
    expect(html).toContain(`${ISSUER}/dev/callback`);
    expect(html).not.toContain('<code>app</code>');

    const login = await renkei.fetch(new Request(`${ISSUER}/dev/login`, { redirect: 'manual' }));
    expect(login.status).toBe(404);
  });
});
