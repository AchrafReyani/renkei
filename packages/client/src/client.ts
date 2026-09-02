import { DEFAULT_SCOPE, decodeClaimsUnverified, type RenkeiClaims } from './claims.js';

/** `bot_prompt` values renkei forwards to LINE (`none` suppresses the friend-add prompt). */
export type BotPrompt = 'aggressive' | 'normal' | 'none';

export interface RenkeiClientOptions {
  /** The renkei server's public URL (= OIDC issuer), e.g. `https://auth.example.com`. */
  issuer: string;
  /** The client registered with `renkei add-client`. */
  clientId: string;
  /**
   * Only for confidential clients running server-side (`exchangeCode`,
   * `exchangeLiffToken` from a backend). Never ship this to a browser.
   */
  clientSecret?: string;
  /** Override `fetch` (tests, custom agents, or a renkei instance's own handler). */
  fetch?: typeof fetch;
}

export interface LoginUrlOptions {
  /** Where renkei sends the user back with `?code=&state=` — must be registered on the client. */
  redirectUri: string;
  /** CSRF token you keep in the session and compare on return. */
  state: string;
  /** Replay protection; compare with the id_token's `nonce` after the code exchange. */
  nonce?: string;
  /** Default `openid profile email line`. */
  scope?: string | readonly string[];
  /** Friend-add prompt on LINE's consent screen; falls back to the channel's default. */
  botPrompt?: BotPrompt;
  /** Route the login to the channel of this region when the server has several (`jp`, `tw`, …). */
  lineRegion?: string;
  /** PKCE challenge from `generatePkce()`; required for public clients. */
  codeChallenge?: string;
  /** Any other OIDC authorize parameter (`prompt`, `ui_locales`, `login_hint`, …). */
  extra?: Record<string, string>;
}

export interface SessionLoginUrlOptions {
  /** Same-origin path, or an absolute URL allow-listed in `sessionCookie.returnUrls`. */
  returnTo?: string;
  botPrompt?: BotPrompt;
  lineRegion?: string;
}

export interface ExchangeCodeOptions {
  code: string;
  /** The exact `redirectUri` used in `loginUrl()`. */
  redirectUri: string;
  /** The PKCE verifier paired with the `codeChallenge` sent in `loginUrl()`. */
  codeVerifier?: string;
}

/** The token endpoint's response (`/oidc/token`). */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
}

export interface LiffExchangeOptions {
  /** `liff.getIDToken()` — proves identity. */
  idToken?: string;
  /** `liff.getAccessToken()` — additionally enables the friendship check and profile. */
  accessToken?: string;
  /** Default `openid profile email line`. */
  scope?: string | readonly string[];
}

export interface LiffExchangeResult {
  /** renkei-signed id_token (RS256, `aud` = your clientId, verifiable at `/oidc/jwks`). */
  idToken: string;
  /** Seconds until `idToken` expires. */
  expiresIn: number;
  /** renkei's stable user ID. */
  sub: string;
  /** `idToken`'s payload, decoded (not verified — it came straight from renkei in this response). */
  claims: RenkeiClaims;
}

export interface RequestOptions {
  /**
   * Extra request headers. Server-side (Next.js middleware, an API route) pass
   * the incoming `cookie` header here so `session()` sees the user's cookie.
   */
  headers?: HeadersInit;
  /** Abort the request. */
  signal?: AbortSignal;
}

/** The fixed paths a renkei server answers on, resolved against the issuer. */
export interface RenkeiEndpoints {
  discovery: string;
  authorization: string;
  token: string;
  userinfo: string;
  jwks: string;
  revocation: string;
  liffExchange: string;
  login: string;
  session: string;
  logout: string;
}

/** A non-2xx answer from renkei, with the OAuth-style error fields when present. */
export class RenkeiClientError extends Error {
  override readonly name = 'RenkeiClientError';
  constructor(
    readonly status: number,
    /** `invalid_client`, `invalid_grant`, `invalid_token`, `no_session`, … */
    readonly error: string,
    readonly errorDescription?: string,
  ) {
    super(errorDescription ? `${error}: ${errorDescription}` : error);
  }
}

export interface RenkeiClient {
  readonly issuer: string;
  readonly clientId: string;
  readonly endpoints: RenkeiEndpoints;

  /** The `/oidc/auth` URL to send the user to. Nothing is fetched. */
  loginUrl(options: LoginUrlOptions): string;
  /**
   * Session-cookie mode (`RENKEI_SESSION_COOKIE=true`): the `/login` URL that
   * runs LINE login and comes back with a first-party cookie set.
   */
  sessionLoginUrl(options?: SessionLoginUrlOptions): string;

  /** Authorization-code exchange at `/oidc/token`. Server-side for confidential clients. */
  exchangeCode(options: ExchangeCodeOptions): Promise<TokenResponse>;
  /** `GET /oidc/me` with a renkei access token. */
  userinfo(accessToken: string, options?: RequestOptions): Promise<RenkeiClaims>;

  /** `POST /liff/exchange`: LIFF tokens in, renkei id_token out. */
  exchangeLiffToken(
    options: LiffExchangeOptions,
    request?: RequestOptions,
  ): Promise<LiffExchangeResult>;

  /** Session-cookie mode: the current user's claims, or `null` when there is no session. */
  session(options?: RequestOptions): Promise<RenkeiClaims | null>;
  /** Session-cookie mode: destroy the session and clear the cookie. */
  logout(options?: RequestOptions): Promise<void>;
}

export function createRenkeiClient(options: RenkeiClientOptions): RenkeiClient {
  const issuer = normalizeIssuer(options.issuer);
  const { clientId, clientSecret } = options;
  if (!clientId) throw new TypeError('clientId is required');
  // Bind lazily and through a closure: an unbound `fetch` throws "Illegal
  // invocation" in browsers, and tests swap it for a renkei instance's handler.
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  const endpoints: RenkeiEndpoints = {
    discovery: `${issuer}/.well-known/openid-configuration`,
    authorization: `${issuer}/oidc/auth`,
    token: `${issuer}/oidc/token`,
    userinfo: `${issuer}/oidc/me`,
    jwks: `${issuer}/oidc/jwks`,
    revocation: `${issuer}/oidc/token/revocation`,
    liffExchange: `${issuer}/liff/exchange`,
    login: `${issuer}/login`,
    session: `${issuer}/session`,
    logout: `${issuer}/logout`,
  };

  const loginUrl = (o: LoginUrlOptions): string => {
    if (!o.redirectUri) throw new TypeError('redirectUri is required');
    if (!o.state) throw new TypeError('state is required');
    const url = new URL(endpoints.authorization);
    const p = url.searchParams;
    p.set('client_id', clientId);
    p.set('response_type', 'code');
    p.set('redirect_uri', o.redirectUri);
    p.set('scope', scopeString(o.scope));
    p.set('state', o.state);
    if (o.nonce) p.set('nonce', o.nonce);
    if (o.botPrompt) p.set('bot_prompt', o.botPrompt);
    if (o.lineRegion) p.set('line_region', o.lineRegion);
    if (o.codeChallenge) {
      p.set('code_challenge', o.codeChallenge);
      p.set('code_challenge_method', 'S256');
    }
    for (const [k, v] of Object.entries(o.extra ?? {})) p.set(k, v);
    return url.toString();
  };

  const sessionLoginUrl = (o: SessionLoginUrlOptions = {}): string => {
    const url = new URL(endpoints.login);
    if (o.returnTo) url.searchParams.set('return_to', o.returnTo);
    if (o.botPrompt) url.searchParams.set('bot_prompt', o.botPrompt);
    if (o.lineRegion) url.searchParams.set('line_region', o.lineRegion);
    return url.toString();
  };

  const exchangeCode = async (o: ExchangeCodeOptions): Promise<TokenResponse> => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: o.code,
      redirect_uri: o.redirectUri,
    });
    if (o.codeVerifier) body.set('code_verifier', o.codeVerifier);
    const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
    if (clientSecret) headers.set('authorization', basicAuth(clientId, clientSecret));
    else body.set('client_id', clientId);
    const res = await doFetch(endpoints.token, { method: 'POST', headers, body });
    return (await readJson(res)) as TokenResponse;
  };

  const userinfo = async (accessToken: string, r: RequestOptions = {}): Promise<RenkeiClaims> => {
    const headers = new Headers(r.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    const res = await doFetch(endpoints.userinfo, withSignal({ headers }, r));
    return (await readJson(res)) as RenkeiClaims;
  };

  const exchangeLiffToken = async (
    o: LiffExchangeOptions,
    r: RequestOptions = {},
  ): Promise<LiffExchangeResult> => {
    if (!o.idToken && !o.accessToken) throw new TypeError('idToken or accessToken is required');
    const headers = new Headers(r.headers);
    headers.set('content-type', 'application/json');
    if (clientSecret) headers.set('authorization', basicAuth(clientId, clientSecret));
    const res = await doFetch(
      endpoints.liffExchange,
      withSignal(
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            client_id: clientId,
            ...(o.idToken ? { id_token: o.idToken } : {}),
            ...(o.accessToken ? { access_token: o.accessToken } : {}),
            scope: scopeString(o.scope),
          }),
        },
        r,
      ),
    );
    const body = (await readJson(res)) as { id_token: string; expires_in: number; sub: string };
    return {
      idToken: body.id_token,
      expiresIn: body.expires_in,
      sub: body.sub,
      claims: decodeClaimsUnverified(body.id_token),
    };
  };

  const session = async (r: RequestOptions = {}): Promise<RenkeiClaims | null> => {
    const res = await doFetch(
      endpoints.session,
      withSignal({ headers: new Headers(r.headers), credentials: 'include' }, r),
    );
    if (res.status === 401) return null;
    return (await readJson(res)) as RenkeiClaims;
  };

  const logout = async (r: RequestOptions = {}): Promise<void> => {
    const res = await doFetch(
      endpoints.logout,
      withSignal({ method: 'POST', headers: new Headers(r.headers), credentials: 'include' }, r),
    );
    if (!res.ok) throw await toError(res);
  };

  return {
    issuer,
    clientId,
    endpoints,
    loginUrl,
    sessionLoginUrl,
    exchangeCode,
    userinfo,
    exchangeLiffToken,
    session,
    logout,
  };
}

function normalizeIssuer(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TypeError(`issuer must be an absolute URL, got "${raw}"`);
  }
  if (url.search || url.hash) throw new TypeError('issuer must not have a query or fragment');
  return url.toString().replace(/\/+$/, '');
}

function scopeString(scope: string | readonly string[] | undefined): string {
  if (scope === undefined) return DEFAULT_SCOPE;
  return typeof scope === 'string' ? scope : scope.join(' ');
}

function basicAuth(id: string, secret: string): string {
  // RFC 6749 §2.3.1: form-encode both halves before base64.
  return `Basic ${btoa(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`)}`;
}

function withSignal(init: RequestInit, r: RequestOptions): RequestInit {
  return r.signal ? { ...init, signal: r.signal } : init;
}

async function readJson(res: Response): Promise<unknown> {
  if (!res.ok) throw await toError(res);
  return res.json();
}

async function toError(res: Response): Promise<RenkeiClientError> {
  let body: { error?: unknown; error_description?: unknown } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // not JSON
  }
  const error = typeof body.error === 'string' ? body.error : `http_${res.status}`;
  const description =
    typeof body.error_description === 'string' ? body.error_description : undefined;
  return new RenkeiClientError(res.status, error, description);
}
