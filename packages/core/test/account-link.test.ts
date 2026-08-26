import { describe, expect, it, vi } from 'vitest';
import { buildAccountLinkUrl, issueLinkToken, startAccountLink } from '../src/line/account-link.js';

const USER = 'U54de992ad068a07f1d4ef661a0a946bd';
const TOKEN = 'messaging-channel-access-token';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('issueLinkToken', () => {
  it('POSTs to the per-user linkToken endpoint with the access token', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ linkToken: 'LT-123' }),
    );
    const token = await issueLinkToken(USER, TOKEN, { fetch });

    expect(token).toBe('LT-123');
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(url).toBe(`https://api.line.me/v2/bot/user/${USER}/linkToken`);
    expect(init?.method).toBe('POST');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('url-encodes the user id', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ linkToken: 'LT' }),
    );
    await issueLinkToken('U/with spaces', TOKEN, { fetch });
    expect(String(fetch.mock.calls.at(0)?.[0])).toContain('U%2Fwith%20spaces');
  });

  it('throws a LineApiError on a non-2xx response', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ message: 'Not found' }, { status: 404 }),
    );
    await expect(issueLinkToken(USER, TOKEN, { fetch })).rejects.toMatchObject({
      name: 'LineApiError',
      endpoint: 'linkToken',
      status: 404,
    });
  });

  it('throws when the body has no linkToken', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}));
    await expect(issueLinkToken(USER, TOKEN, { fetch })).rejects.toThrow(/no linkToken/);
  });
});

describe('buildAccountLinkUrl', () => {
  it('builds the dialog URL with linkToken and nonce', () => {
    const url = new URL(buildAccountLinkUrl({ linkToken: 'LT-123', nonce: 'n-abc' }));
    expect(url.origin + url.pathname).toBe('https://access.line.me/dialog/bot/accountLink');
    expect(url.searchParams.get('linkToken')).toBe('LT-123');
    expect(url.searchParams.get('nonce')).toBe('n-abc');
  });
});

describe('startAccountLink', () => {
  it('mints a token and returns the dialog URL for the given nonce', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ linkToken: 'LT-xyz' }),
    );
    const { url, linkToken } = await startAccountLink(
      { userId: USER, channelAccessToken: TOKEN, nonce: 'n-1' },
      { fetch },
    );
    expect(linkToken).toBe('LT-xyz');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('linkToken')).toBe('LT-xyz');
    expect(parsed.searchParams.get('nonce')).toBe('n-1');
  });
});
