import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, generatePkce, pkceChallenge } from '../src/index.js';

describe('buildAuthorizeUrl', () => {
  const base = {
    channelId: '2011257262',
    redirectUri: 'http://localhost:3000/line/callback',
    state: 'st',
    nonce: 'nc',
  };

  it('builds the minimal URL with default scopes', () => {
    const u = new URL(buildAuthorizeUrl(base));
    expect(u.origin + u.pathname).toBe('https://access.line.me/oauth2/v2.1/authorize');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('2011257262');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3000/line/callback');
    expect(u.searchParams.get('scope')).toBe('openid profile');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('nonce')).toBe('nc');
    expect(u.searchParams.has('bot_prompt')).toBe(false);
    expect(u.searchParams.has('code_challenge')).toBe(false);
  });

  it('exposes every LINE-specific parameter', () => {
    const u = new URL(
      buildAuthorizeUrl({
        ...base,
        scope: ['openid', 'profile', 'email'],
        botPrompt: 'aggressive',
        codeChallenge: 'chal',
        prompt: 'consent',
        maxAge: 300,
        uiLocales: 'ja-JP',
        initialAmrDisplay: 'lineqr',
        switchAmr: false,
        disableAutoLogin: true,
        disableIosAutoLogin: true,
      }),
    );
    expect(u.searchParams.get('scope')).toBe('openid profile email');
    expect(u.searchParams.get('bot_prompt')).toBe('aggressive');
    expect(u.searchParams.get('code_challenge')).toBe('chal');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('max_age')).toBe('300');
    expect(u.searchParams.get('ui_locales')).toBe('ja-JP');
    expect(u.searchParams.get('initial_amr_display')).toBe('lineqr');
    expect(u.searchParams.get('switch_amr')).toBe('false');
    expect(u.searchParams.get('disable_auto_login')).toBe('true');
    expect(u.searchParams.get('disable_ios_auto_login')).toBe('true');
  });

  it('omits switch_amr unless explicitly false', () => {
    const u = new URL(buildAuthorizeUrl({ ...base, switchAmr: true }));
    expect(u.searchParams.has('switch_amr')).toBe(false);
  });
});

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('generates a verifier of valid length and charset', async () => {
    const { verifier, challenge, method } = await generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    expect(method).toBe('S256');
    expect(await pkceChallenge(verifier)).toBe(challenge);
  });
});
