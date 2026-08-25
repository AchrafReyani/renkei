import { LINE_ENDPOINTS, type LineLoginChannel } from './channel.js';
import { readLineError } from './errors.js';

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
  /** Present only when the `openid` scope was requested. */
  id_token?: string;
}

export interface ExchangeCodeParams {
  channel: Pick<LineLoginChannel, 'channelId' | 'channelSecret'>;
  code: string;
  /** Must be identical to the `redirect_uri` used in the authorize request. */
  redirectUri: string;
  /** PKCE verifier if a challenge was sent. */
  codeVerifier?: string;
}

export interface FetchOptions {
  /** Injectable for tests and for runtimes with a custom fetch. */
  fetch?: typeof fetch;
}

/** Exchange an authorization code for tokens (LINE Login v2.1 token endpoint). */
export async function exchangeCode(
  params: ExchangeCodeParams,
  options: FetchOptions = {},
): Promise<TokenResponse> {
  const f = options.fetch ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.channel.channelId,
    client_secret: params.channel.channelSecret,
  });
  if (params.codeVerifier) body.set('code_verifier', params.codeVerifier);

  const res = await f(LINE_ENDPOINTS.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw await readLineError('token', res);
  return (await res.json()) as TokenResponse;
}
