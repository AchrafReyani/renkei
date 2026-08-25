import { describe, expect, it, vi } from 'vitest';
import {
  exchangeCode,
  getFriendshipStatus,
  getProfile,
  type LineApiError,
  LineAuthorizationError,
  parseCallback,
} from '../src/index.js';

const channel = { channelId: '2011257262', channelSecret: 'sec' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('exchangeCode', () => {
  it('posts the correct form body and returns tokens', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('abc');
      expect(body.get('redirect_uri')).toBe('http://localhost:3000/line/callback');
      expect(body.get('client_id')).toBe('2011257262');
      expect(body.get('client_secret')).toBe('sec');
      expect(body.get('code_verifier')).toBe('ver');
      return jsonResponse({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 2592000,
        refresh_token: 'rt',
        scope: 'openid profile',
        id_token: 'idt',
      });
    });
    const res = await exchangeCode(
      {
        channel,
        code: 'abc',
        redirectUri: 'http://localhost:3000/line/callback',
        codeVerifier: 'ver',
      },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/oauth2/v2.1/token',
      expect.anything(),
    );
    expect(res.access_token).toBe('at');
    expect(res.id_token).toBe('idt');
  });

  it('maps LINE error bodies to LineApiError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: 'invalid_grant', error_description: 'invalid authorization code' },
        400,
      ),
    );
    await expect(
      exchangeCode(
        { channel, code: 'x', redirectUri: 'r' },
        { fetch: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      name: 'LineApiError',
      endpoint: 'token',
      status: 400,
      code: 'invalid_grant',
    } satisfies Partial<LineApiError>);
  });
});

describe('parseCallback', () => {
  it('extracts code, state and friendship_status_changed', () => {
    const cb = parseCallback(
      'http://localhost:3000/line/callback?code=c&state=s&friendship_status_changed=true',
    );
    expect(cb).toEqual({ code: 'c', state: 's', friendshipStatusChanged: true });
  });
  it('omits friendshipStatusChanged when LINE did not send it', () => {
    expect(parseCallback(new URLSearchParams('code=c&state=s'))).toEqual({ code: 'c', state: 's' });
  });
  it('throws LineAuthorizationError on error responses (e.g. user cancelled)', () => {
    expect(() =>
      parseCallback('http://x/cb?error=access_denied&error_description=The+user+cancelled&state=s'),
    ).toThrowError(LineAuthorizationError);
  });
  it('throws when code or state are missing', () => {
    expect(() => parseCallback('http://x/cb?code=c')).toThrowError(LineAuthorizationError);
  });
});

describe('profile and friendship', () => {
  it('sends the bearer token and parses the responses', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer at');
      return String(url).includes('friendship')
        ? jsonResponse({ friendFlag: true })
        : jsonResponse({ userId: 'U1', displayName: 'Taro' });
    });
    const f = fetchMock as unknown as typeof fetch;
    expect(await getFriendshipStatus('at', { fetch: f })).toBe(true);
    expect(await getProfile('at', { fetch: f })).toEqual({ userId: 'U1', displayName: 'Taro' });
  });
});
