import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import {
  type BotPrompt,
  createRenkeiClient,
  generatePkce,
  type RenkeiClaims,
  type RenkeiClient,
  RenkeiClientError,
  randomString,
} from 'renkei-client';
import { deriveKey, readCookie, seal, serializeCookie, unseal } from './cookies.js';

export interface RenkeiAuthOptions {
  /** renkei's public URL (= OIDC issuer). */
  issuer: string;
  /** The client registered with `renkei add-client … --redirect <app>/api/renkei/callback`. */
  clientId: string;
  /** Omit for a public client (PKCE only). */
  clientSecret?: string;
  /**
   * Encrypts the session and login-flow cookies (`dir` / `A256GCM`, key =
   * SHA-256 of this string). At least 32 characters; rotate it to log everyone out.
   */
  secret: string;
  /** Where the route handlers are mounted. Default `/api/renkei`. */
  basePath?: string;
  /** Default `openid profile email line`. */
  scope?: string | readonly string[];
  /** Friend-add prompt on LINE's consent screen; falls back to the channel default. */
  botPrompt?: BotPrompt;
  /** Multi-channel servers: which region's channel to log in with. */
  lineRegion?: string;
  session?: {
    /** Default `renkei_next_session`. */
    cookieName?: string;
    /** Seconds the session cookie lives. Default 7 days. */
    maxAge?: number;
  };
  /** Where `/login` and `/logout` send the user when no `return_to` is given. Default `/`. */
  defaultReturnTo?: string;
  /**
   * Where a failed login redirects (gets `?error=&error_description=`).
   * Default: respond with a plain 400/401.
   */
  errorRedirect?: string;
  /** Override `fetch` for the calls to renkei (tests, custom agents). */
  fetch?: typeof fetch;
}

export interface ProxyOptions {
  /**
   * Which paths need a session: prefixes (`['/account', '/orders']`) or a
   * predicate. Default: every path except the handlers' `basePath`, `/_next`
   * and files with an extension.
   */
  protect?: readonly string[] | ((url: URL) => boolean);
}

export type RouteHandler = (request: Request) => Promise<Response>;

export interface RenkeiAuth {
  /** The underlying renkei-client. */
  client: RenkeiClient;
  basePath: string;
  /** Absolute paths of the four handlers. */
  paths: { login: string; callback: string; logout: string; session: string };
  /** `export const { GET, POST } = renkei.handlers` in `app/api/renkei/[...renkei]/route.ts`. */
  handlers: { GET: RouteHandler; POST: RouteHandler };
  /** The dispatcher behind `handlers`, for custom mounting. */
  handle: RouteHandler;
  /** `/api/renkei/login?return_to=…` — link or redirect the user here to log in. */
  loginPath(returnTo?: string, options?: { botPrompt?: BotPrompt }): string;
  /** `/api/renkei/logout?return_to=…`. */
  logoutPath(returnTo?: string): string;
  /** Server Components, Server Actions, Route Handlers: the current user's claims or `null`. */
  getSession(): Promise<RenkeiClaims | null>;
  /** Same, from any `Request` (proxy/middleware, custom handlers). */
  getSessionFromRequest(request: Request): Promise<RenkeiClaims | null>;
  /**
   * `export default renkei.proxy({ protect: ['/account'] })` in `proxy.ts`
   * (Next 16) or `middleware.ts` (Next ≤ 15): redirects anonymous requests to
   * the login with `return_to` set, lets everything else through.
   */
  proxy(options?: ProxyOptions): (request: Request) => Promise<Response | undefined>;
  /** Alias of `proxy` for `middleware.ts`. */
  middleware(options?: ProxyOptions): (request: Request) => Promise<Response | undefined>;
}

interface FlowCookie extends Record<string, unknown> {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface SessionCookie extends Record<string, unknown> {
  claims: RenkeiClaims;
}

const FLOW_MAX_AGE = 600;
const DAY = 86_400;
/** id_token bookkeeping that has no business in the session. */
const TRANSIENT_CLAIMS = new Set(['iss', 'aud', 'exp', 'iat', 'nonce', 'at_hash', 'auth_time']);

export function createRenkeiAuth(options: RenkeiAuthOptions): RenkeiAuth {
  const basePath = normalizeBasePath(options.basePath ?? '/api/renkei');
  const paths = {
    login: `${basePath}/login`,
    callback: `${basePath}/callback`,
    logout: `${basePath}/logout`,
    session: `${basePath}/session`,
  };
  const cookieName = options.session?.cookieName ?? 'renkei_next_session';
  const flowCookieName = `${cookieName}_flow`;
  const sessionMaxAge = options.session?.maxAge ?? 7 * DAY;
  const defaultReturnTo = options.defaultReturnTo ?? '/';
  const client = createRenkeiClient({
    issuer: options.issuer,
    clientId: options.clientId,
    ...(options.clientSecret ? { clientSecret: options.clientSecret } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const jwks = createRemoteJWKSet(
    new URL(client.endpoints.jwks),
    options.fetch ? { [customFetch]: options.fetch } : {},
  );
  const keyPromise = deriveKey(options.secret);

  const safeReturnTo = (raw: string | null | undefined): string => {
    if (!raw) return defaultReturnTo;
    // Same-origin paths only: no scheme, no protocol-relative `//host`.
    if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
    return defaultReturnTo;
  };

  const withQuery = (path: string, params: Record<string, string | undefined>): string => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  const loginPath: RenkeiAuth['loginPath'] = (returnTo, o) =>
    withQuery(paths.login, { return_to: returnTo, bot_prompt: o?.botPrompt });
  const logoutPath: RenkeiAuth['logoutPath'] = (returnTo) =>
    withQuery(paths.logout, { return_to: returnTo });

  const readSession = async (cookieValue: string | undefined): Promise<RenkeiClaims | null> => {
    const rec = await unseal<SessionCookie>(cookieValue, await keyPromise);
    return rec?.claims && typeof rec.claims.sub === 'string' ? rec.claims : null;
  };

  const getSessionFromRequest: RenkeiAuth['getSessionFromRequest'] = (request) =>
    readSession(readCookie(request.headers, cookieName));

  const getSession: RenkeiAuth['getSession'] = async () => {
    // Imported lazily so the module can be loaded outside a Next request
    // scope (tests, scripts) and so `proxy.ts` does not pull it in.
    const { cookies } = await import('next/headers');
    const store = await cookies();
    return readSession(store.get(cookieName)?.value);
  };

  const fail = (
    request: Request,
    status: number,
    error: string,
    description?: string,
  ): Response => {
    if (options.errorRedirect) {
      const url = new URL(options.errorRedirect, request.url);
      url.searchParams.set('error', error);
      if (description) url.searchParams.set('error_description', description);
      return Response.redirect(url, 303);
    }
    return new Response(description ? `${error}: ${description}` : error, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const login: RouteHandler = async (request) => {
    const url = new URL(request.url);
    const state = randomString();
    const nonce = randomString();
    const pkce = await generatePkce();
    const returnTo = safeReturnTo(url.searchParams.get('return_to'));
    const botPrompt = parseBotPrompt(url.searchParams.get('bot_prompt')) ?? options.botPrompt;
    const flow: FlowCookie = { state, nonce, verifier: pkce.verifier, returnTo };
    const target = client.loginUrl({
      redirectUri: new URL(paths.callback, url).toString(),
      state,
      nonce,
      codeChallenge: pkce.challenge,
      ...(options.scope !== undefined ? { scope: options.scope } : {}),
      ...(botPrompt ? { botPrompt } : {}),
      ...(options.lineRegion ? { lineRegion: options.lineRegion } : {}),
    });
    return redirect(target, [
      serializeCookie(flowCookieName, await seal(flow, await keyPromise, FLOW_MAX_AGE), {
        maxAge: FLOW_MAX_AGE,
        secure: isHttps(url),
      }),
    ]);
  };

  const callback: RouteHandler = async (request) => {
    const url = new URL(request.url);
    const key = await keyPromise;
    const clearFlow = serializeCookie(flowCookieName, '', { maxAge: 0, secure: isHttps(url) });
    const flow = await unseal<FlowCookie>(readCookie(request.headers, flowCookieName), key);
    if (!flow) return fail(request, 400, 'invalid_request', 'login flow expired or missing');

    const error = url.searchParams.get('error');
    if (error) {
      return fail(request, 401, error, url.searchParams.get('error_description') ?? undefined);
    }
    if (url.searchParams.get('state') !== flow.state) {
      return fail(request, 400, 'invalid_request', 'state mismatch');
    }
    const code = url.searchParams.get('code');
    if (!code) return fail(request, 400, 'invalid_request', 'missing code');

    let idToken: string;
    try {
      const tokens = await client.exchangeCode({
        code,
        redirectUri: new URL(paths.callback, url).toString(),
        codeVerifier: flow.verifier,
      });
      if (!tokens.id_token)
        return fail(request, 502, 'server_error', 'renkei returned no id_token');
      idToken = tokens.id_token;
    } catch (e) {
      if (e instanceof RenkeiClientError) return fail(request, 401, e.error, e.errorDescription);
      throw e;
    }

    let claims: RenkeiClaims;
    try {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: client.issuer,
        audience: client.clientId,
      });
      if (payload.nonce !== flow.nonce)
        return fail(request, 400, 'invalid_token', 'nonce mismatch');
      claims = Object.fromEntries(
        Object.entries(payload).filter(([k]) => !TRANSIENT_CLAIMS.has(k)),
      ) as RenkeiClaims;
    } catch (e) {
      return fail(request, 401, 'invalid_token', (e as Error).message);
    }

    const session: SessionCookie = { claims };
    return redirect(new URL(flow.returnTo, url), [
      clearFlow,
      serializeCookie(cookieName, await seal(session, key, sessionMaxAge), {
        maxAge: sessionMaxAge,
        secure: isHttps(url),
      }),
    ]);
  };

  const logout: RouteHandler = async (request) => {
    const url = new URL(request.url);
    return redirect(new URL(safeReturnTo(url.searchParams.get('return_to')), url), [
      serializeCookie(cookieName, '', { maxAge: 0, secure: isHttps(url) }),
    ]);
  };

  const session: RouteHandler = async (request) => {
    const claims = await getSessionFromRequest(request);
    if (!claims) return Response.json({ error: 'no_session' }, { status: 401 });
    return Response.json(claims, { headers: { 'cache-control': 'no-store' } });
  };

  const handle: RouteHandler = async (request) => {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '');
    const method = request.method.toUpperCase();
    if (pathname === paths.login && method === 'GET') return login(request);
    if (pathname === paths.callback && method === 'GET') return callback(request);
    if (pathname === paths.logout && (method === 'GET' || method === 'POST'))
      return logout(request);
    if (pathname === paths.session && method === 'GET') return session(request);
    return new Response('not found', { status: 404 });
  };

  const proxy: RenkeiAuth['proxy'] = (o = {}) => {
    const protect = o.protect;
    const needsSession = (url: URL): boolean => {
      const p = url.pathname;
      if (p === basePath || p.startsWith(`${basePath}/`)) return false;
      if (typeof protect === 'function') return protect(url);
      if (protect) return protect.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
      return !p.startsWith('/_next/') && !/\.[a-z0-9]+$/i.test(p);
    };
    return async (request) => {
      const url = new URL(request.url);
      if (!needsSession(url)) return undefined;
      if (await getSessionFromRequest(request)) return undefined;
      return Response.redirect(new URL(loginPath(url.pathname + url.search), url), 307);
    };
  };

  return {
    client,
    basePath,
    paths,
    handlers: { GET: handle, POST: handle },
    handle,
    loginPath,
    logoutPath,
    getSession,
    getSessionFromRequest,
    proxy,
    middleware: proxy,
  };
}

function normalizeBasePath(raw: string): string {
  const p = `/${raw}`.replace(/\/+/g, '/').replace(/\/$/, '');
  if (p === '') throw new TypeError('basePath must not be the site root');
  return p;
}

function parseBotPrompt(raw: string | null): BotPrompt | undefined {
  return raw === 'aggressive' || raw === 'normal' || raw === 'none' ? raw : undefined;
}

function isHttps(url: URL): boolean {
  return url.protocol === 'https:';
}

function redirect(to: string | URL, setCookies: string[]): Response {
  const headers = new Headers({ location: to.toString(), 'cache-control': 'no-store' });
  for (const c of setCookies) headers.append('set-cookie', c);
  return new Response(null, { status: 303, headers });
}
