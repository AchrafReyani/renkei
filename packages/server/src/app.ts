import { type Context, Hono } from 'hono';
import type Provider from 'oidc-provider';
import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  getFriendshipStatus,
  getProfile,
  isAccountLinkEvent,
  isFollowEvent,
  isUnfollowEvent,
  LineApiError,
  LineAuthorizationError,
  LineIdTokenError,
  parseCallback,
  parseWebhook,
  randomToken,
  type Storage,
  startAccountLink,
  upsertIdentityFromLine,
  verifyIdToken,
  verifyWebhookSignature,
} from 'renkei-core';
import { bridge, nodePair } from './adapters/fetch-to-node.js';
import { reportFirstRunChecks } from './checks.js';
import {
  type LineChannelConfig,
  parseConfig,
  type RenkeiConfig,
  type RenkeiOptions,
} from './config.js';
import { devRoutes } from './dev-rp.js';
import { createWebhookLog, inspectRoutes } from './inspect.js';
import { generateDevJwks } from './keys.js';
import { liffRoutes } from './liff.js';
import { createProvider, INTERACTION_PATH } from './oidc/provider.js';

/** Short-lived login state, keyed by the OAuth `state` sent to LINE. */
const LOGIN_MODEL = 'renkei:login';
/** One-time handoff from /line/callback to /interaction/:uid/finish. */
const RESULT_MODEL = 'renkei:login-result';
/** Pending account link, keyed by the nonce echoed back on the accountLink webhook. */
const LINK_MODEL = 'renkei:link';
/** Standalone `/link` login state, keyed by the OAuth `state` sent to LINE. */
const LINK_FLOW_MODEL = 'renkei:link-flow';
const LOGIN_TTL = 600;
const RESULT_TTL = 60;
/** LINE link tokens live ~10 min; match the nonce store to that. */
const LINK_TTL = 600;

interface LoginState {
  uid: string;
  nonce: string;
  verifier: string;
  channelId: string;
}

/** State for the browser-initiated `/link` flow (no OIDC interaction behind it). */
interface LinkFlowState {
  nonce: string;
  verifier: string;
  channelId: string;
}

export interface Renkei {
  app: Hono;
  provider: Provider;
  config: RenkeiConfig;
  storage: Storage;
  fetch: (request: Request) => Promise<Response>;
}

/**
 * Build the renkei application: a Hono app that serves the OIDC provider,
 * runs the LINE login as the provider's "interaction", and exposes health.
 */
export async function createRenkei(options: RenkeiOptions): Promise<Renkei> {
  const config = parseConfig(options.config);
  const { storage } = options;
  const logger = options.logger ?? console;
  const lineFetch = options.fetch ?? fetch;
  const issuer = new URL(config.issuer);
  const bridgeOpts = { host: issuer.host, protocol: issuer.protocol.replace(':', '') };

  let jwks = config.jwks;
  if (!jwks) {
    jwks = await generateDevJwks();
  }

  // Surface the config mistakes that otherwise fail silently at runtime.
  reportFirstRunChecks(config, { hasPersistentStorage: Boolean(storage.init) }, logger);

  await storage.init?.();
  const provider = createProvider({ config, storage, jwks, logger });
  const app = new Hono();
  // Recent-webhook ring for the /inspect view (in-memory, per-process).
  const webhookLog = createWebhookLog();

  const channelFor = (region?: string): LineChannelConfig => {
    const first = config.channels[0] as LineChannelConfig;
    if (!region) return first;
    return config.channels.find((c) => c.region === region) ?? first;
  };

  app.get('/healthz', (c) => c.json({ ok: true }));

  // ── OIDC provider: discovery + everything under /oidc ───────────────────
  const toProvider = (c: { req: { raw: Request } }) =>
    bridge(provider.callback(), c.req.raw, bridgeOpts);
  app.all('/.well-known/*', toProvider);
  app.all('/oidc/*', toProvider);

  // Keycloak-shaped aliases. Supabase Auth (hosted *and* the local CLI, every
  // plan) ships a "keycloak" provider that only needs a base URL and calls
  // `${url}/protocol/openid-connect/{auth,token,userinfo}`. Answering on
  // those paths lets Supabase use renkei with zero custom-provider features.
  // Other Keycloak-brokering clients get the same benefit.
  const keycloakAlias: Record<string, string> = {
    auth: '/oidc/auth',
    token: '/oidc/token',
    userinfo: '/oidc/me',
    certs: '/oidc/jwks',
    logout: '/oidc/session/end',
    revoke: '/oidc/token/revocation',
  };
  app.all('/protocol/openid-connect/:endpoint', (c) => {
    const endpoint = c.req.param('endpoint');
    const target = keycloakAlias[endpoint];
    if (!target) return c.notFound();
    let request = c.req.raw;
    if (endpoint === 'auth') {
      // Keycloak clients (Supabase among them) send `scope=profile email`
      // without `openid`. Keycloak tolerates that; a strict OIDC provider
      // does not. Add it so the request means what the client meant.
      const url = new URL(request.url);
      const scope = (url.searchParams.get('scope') ?? '').split(' ').filter(Boolean);
      if (!scope.includes('openid')) {
        url.searchParams.set('scope', ['openid', ...scope].join(' '));
        request = new Request(url, request);
      }
    }
    return bridge(provider.callback(), request, { ...bridgeOpts, path: target });
  });

  // ── Interaction: the provider needs a user → send them to LINE ──────────
  app.get(`${INTERACTION_PATH}/:uid`, async (c) => {
    const { req, res } = await nodePair(c.req.raw, bridgeOpts);
    let details: Awaited<ReturnType<Provider['interactionDetails']>>;
    try {
      details = await provider.interactionDetails(req, res);
    } catch (e) {
      logger.warn('[renkei] interaction lookup failed', { message: (e as Error).message });
      return c.text(
        'ログインセッションが見つかりません。最初からやり直してください。 / Login session not found. Please start over.',
        400,
      );
    }
    const params = details.params as Record<string, string | undefined>;
    const client = config.clients.find((cl) => cl.clientId === params.client_id);
    const channel = channelFor(params.line_region ?? client?.lineRegion);
    const botPrompt = pickBotPrompt(params.bot_prompt, channel.botPrompt);

    const state = randomToken();
    const nonce = randomToken();
    const pkce = await generatePkce();
    const login: LoginState = {
      uid: details.uid,
      nonce,
      verifier: pkce.verifier,
      channelId: channel.channelId,
    };
    await storage.payloads.upsert(LOGIN_MODEL, state, { ...login }, LOGIN_TTL);

    const scope = ['openid', 'profile', ...(channel.requestEmail ? ['email'] : [])];
    const url = buildAuthorizeUrl({
      channelId: channel.channelId,
      redirectUri: new URL(config.lineCallbackPath, config.issuer).toString(),
      state,
      nonce,
      scope,
      codeChallenge: pkce.challenge,
      ...(botPrompt ? { botPrompt } : {}),
      ...(params.ui_locales ? { uiLocales: params.ui_locales } : {}),
    });
    return c.redirect(url);
  });

  // ── LINE sends the user back here ───────────────────────────────────────
  app.get(config.lineCallbackPath, async (c) => {
    try {
      const cb = parseCallback(c.req.url);
      const login = (await storage.payloads.find(LOGIN_MODEL, cb.state)) as LoginState | undefined;
      if (!login) {
        // Not an OIDC login — maybe a browser-initiated /link flow.
        const linkFlow = (await storage.payloads.find(LINK_FLOW_MODEL, cb.state)) as
          | LinkFlowState
          | undefined;
        if (linkFlow) return await finishLinkFlow(c, cb, linkFlow);
        return c.text('ログイン状態が無効です / invalid or expired login state', 400);
      }
      await storage.payloads.destroy(LOGIN_MODEL, cb.state);
      const channel = config.channels.find((ch) => ch.channelId === login?.channelId);
      if (!channel) return c.text('unknown channel', 500);

      const redirectUri = new URL(config.lineCallbackPath, config.issuer).toString();
      const tokens = await exchangeCode(
        { channel, code: cb.code, redirectUri, codeVerifier: login.verifier },
        { fetch: lineFetch },
      );
      if (!tokens.id_token) return c.text('LINE returned no id_token', 502);
      const claims = await verifyIdToken(tokens.id_token, { channel, nonce: login.nonce });

      const [profile, friend] = await Promise.all([
        getProfile(tokens.access_token, { fetch: lineFetch }).catch((e: unknown) => {
          logger.warn('[renkei] profile fetch failed', { message: (e as Error).message });
          return undefined;
        }),
        getFriendshipStatus(tokens.access_token, { fetch: lineFetch }).catch((e: unknown) => {
          // 4xx here usually means the channel has no linked Official Account.
          logger.warn('[renkei] friendship check failed', { message: (e as Error).message });
          return undefined;
        }),
      ]);

      const { identity, created } = await upsertIdentityFromLine(storage, {
        channelId: channel.channelId,
        claims,
        ...(profile ? { profile } : {}),
        ...(friend !== undefined ? { friend } : {}),
      });
      logger.info('[renkei] login', {
        sub: identity.sub,
        created,
        friend,
        friendshipStatusChanged: cb.friendshipStatusChanged,
        amr: claims.amr,
      });

      // Hand the result to the interaction path so oidc-provider's
      // path-scoped interaction cookie is present when we finish it.
      const token = randomToken();
      await storage.payloads.upsert(
        RESULT_MODEL,
        token,
        { sub: identity.sub, uid: login.uid },
        RESULT_TTL,
      );
      return c.redirect(`${INTERACTION_PATH}/${login.uid}/finish?t=${token}`);
    } catch (e) {
      const info = describeError(e);
      logger.warn('[renkei] LINE login failed', info);
      // LINE reported an OAuth error (user cancelled, ...). The state param
      // still identifies our login attempt, so hand the error to the client
      // through the standard OIDC error redirect instead of a dead-end page.
      if (e instanceof LineAuthorizationError && e.state) {
        const pending = (await storage.payloads.find(LOGIN_MODEL, e.state)) as
          | LoginState
          | undefined;
        if (pending) {
          await storage.payloads.destroy(LOGIN_MODEL, e.state);
          const description =
            e.code === 'access_denied'
              ? 'ユーザーがLINEログインをキャンセルしました / user cancelled LINE login'
              : (e.description ?? 'LINE login failed');
          const token = randomToken();
          await storage.payloads.upsert(
            RESULT_MODEL,
            token,
            { uid: pending.uid, error: e.code, error_description: description },
            RESULT_TTL,
          );
          return c.redirect(`${INTERACTION_PATH}/${pending.uid}/finish?t=${token}`);
        }
        // Or a browser-initiated /link flow that the user cancelled.
        const pendingLink = (await storage.payloads.find(LINK_FLOW_MODEL, e.state)) as
          | LinkFlowState
          | undefined;
        if (pendingLink) {
          await storage.payloads.destroy(LINK_FLOW_MODEL, e.state);
          return c.text(
            'アカウント連携がキャンセルされました / account linking was cancelled',
            400,
          );
        }
      }
      return c.text(`LINE ログインに失敗しました / LINE login failed: ${info.type}`, 400);
    }
  });

  // ── Finish the interaction and resume the OIDC flow ─────────────────────
  app.get(`${INTERACTION_PATH}/:uid/finish`, async (c) => {
    const uid = c.req.param('uid');
    const t = c.req.query('t');
    const result = t ? await storage.payloads.find(RESULT_MODEL, t) : undefined;
    if (!t || !result || result.uid !== uid) {
      return c.text('ログイン結果が無効です / invalid login result', 400);
    }
    await storage.payloads.destroy(RESULT_MODEL, t);
    const { req, res, done } = await nodePair(c.req.raw, bridgeOpts);
    const outcome =
      typeof result.error === 'string'
        ? { error: result.error, error_description: String(result.error_description ?? '') }
        : { login: { accountId: String(result.sub) } };
    await provider.interactionFinished(req, res, outcome, { mergeWithLastSubmission: false });
    return done;
  });

  // ── Account linking: browser-initiated entry ────────────────────────────
  // A user with no renkei access token in hand can open /link directly. renkei
  // logs them in at LINE (a normal login round-trip on the same callback), then
  // — instead of finishing an OIDC interaction — starts account linking and
  // sends them to the accountLink dialog. Requires a messaging channel with a
  // channelAccessToken; region via `?line_region=`.
  app.get('/link', async (c) => {
    const messaging = config.messagingChannels.find((m) => m.channelAccessToken);
    if (!messaging?.channelAccessToken) {
      return c.text('アカウント連携は設定されていません / account linking is not configured', 404);
    }
    const channel = channelFor(c.req.query('line_region'));
    const state = randomToken();
    const nonce = randomToken();
    const pkce = await generatePkce();
    await storage.payloads.upsert(
      LINK_FLOW_MODEL,
      state,
      { nonce, verifier: pkce.verifier, channelId: channel.channelId },
      LOGIN_TTL,
    );
    const url = buildAuthorizeUrl({
      channelId: channel.channelId,
      redirectUri: new URL(config.lineCallbackPath, config.issuer).toString(),
      state,
      nonce,
      scope: ['openid', 'profile'],
      codeChallenge: pkce.challenge,
    });
    return c.redirect(url);
  });

  // Complete a browser-initiated /link flow from the shared LINE callback:
  // log the user in, then mint a link token and redirect to the accountLink
  // dialog (the same nonce store the webhook consumes).
  async function finishLinkFlow(
    c: Context,
    cb: ReturnType<typeof parseCallback>,
    linkFlow: LinkFlowState,
  ): Promise<Response> {
    await storage.payloads.destroy(LINK_FLOW_MODEL, cb.state);
    const messaging = config.messagingChannels.find((m) => m.channelAccessToken);
    if (!messaging?.channelAccessToken) {
      return c.text('アカウント連携は設定されていません / account linking is not configured', 404);
    }
    const channel = config.channels.find((ch) => ch.channelId === linkFlow.channelId);
    if (!channel) return c.text('unknown channel', 500);

    const redirectUri = new URL(config.lineCallbackPath, config.issuer).toString();
    const tokens = await exchangeCode(
      { channel, code: cb.code, redirectUri, codeVerifier: linkFlow.verifier },
      { fetch: lineFetch },
    );
    if (!tokens.id_token) return c.text('LINE returned no id_token', 502);
    const claims = await verifyIdToken(tokens.id_token, { channel, nonce: linkFlow.nonce });

    const profile = await getProfile(tokens.access_token, { fetch: lineFetch }).catch(
      () => undefined,
    );
    const { identity } = await upsertIdentityFromLine(storage, {
      channelId: channel.channelId,
      claims,
      ...(profile ? { profile } : {}),
    });

    // The LINE userId is the id_token subject.
    const nonce = randomToken();
    const { url } = await startAccountLink(
      { userId: claims.sub, channelAccessToken: messaging.channelAccessToken, nonce },
      { fetch: lineFetch },
    );
    await storage.payloads.upsert(
      LINK_MODEL,
      nonce,
      { sub: identity.sub, channelId: channel.channelId },
      LINK_TTL,
    );
    logger.info('[renkei] link flow: redirecting to accountLink', { sub: identity.sub });
    return c.redirect(url);
  }

  // ── Account linking: start the LINE accountLink flow ────────────────────
  // A downstream app that already holds a renkei access token for the user
  // POSTs here (Authorization: Bearer <access_token>). renkei resolves the
  // token to a sub, mints a one-time LINE link token for that user's LINE
  // account, stores nonce → sub, and returns the accountLink dialog URL for
  // the app to redirect the browser to. The link is finalised asynchronously
  // when LINE delivers the accountLink webhook (below). Requires a messaging
  // channel with a channelAccessToken configured.
  app.post('/link/start', async (c) => {
    const messaging = config.messagingChannels.find((m) => m.channelAccessToken);
    if (!messaging?.channelAccessToken) {
      return c.json({ error: 'account_linking_not_configured' }, 404);
    }

    const authorization = c.req.header('authorization');
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!bearer) return c.json({ error: 'unauthorized' }, 401);
    const accessToken = await provider.AccessToken.find(bearer);
    const sub = accessToken?.accountId;
    if (!sub) return c.json({ error: 'invalid_token' }, 401);

    // Find the LINE user ID for this identity (the login/liff account, not a
    // messaging one), preferring the channel this messaging channel serves.
    const loginChannel = channelFor(messaging.region);
    const accounts = await storage.identities.listLineAccounts(sub);
    const account =
      accounts.find((a) => a.channelId === loginChannel.channelId && a.kind !== 'messaging') ??
      accounts.find((a) => a.kind !== 'messaging');
    if (!account) return c.json({ error: 'no_line_account' }, 409);

    const nonce = randomToken();
    try {
      const { url } = await startAccountLink(
        {
          userId: account.lineUserId,
          channelAccessToken: messaging.channelAccessToken,
          nonce,
        },
        { fetch: lineFetch },
      );
      await storage.payloads.upsert(
        LINK_MODEL,
        nonce,
        { sub, channelId: loginChannel.channelId },
        LINK_TTL,
      );
      return c.json({ url });
    } catch (e) {
      logger.warn('[renkei] account link start failed', { message: (e as Error).message });
      return c.json({ error: 'link_start_failed' }, 502);
    }
  });

  // ── Messaging API webhook: keep friendship state current ────────────────
  // LINE POSTs follow/unfollow/accountLink events here, signed with a
  // Messaging API channel secret. We verify the signature, then mirror
  // follow/unfollow into the identity store so `line:friend` stays accurate
  // between logins. Always answer 200 quickly on a valid request so LINE does
  // not retry. Configure via `messagingChannels` (LINE_MESSAGING_CHANNEL_*).
  app.post('/line/webhook', async (c) => {
    if (config.messagingChannels.length === 0) {
      return c.text('webhook not configured', 404);
    }
    const raw = await c.req.text();
    const signature = c.req.header('x-line-signature');

    // Find the messaging channel whose secret signed this request.
    let matched: (typeof config.messagingChannels)[number] | undefined;
    for (const mc of config.messagingChannels) {
      if (await verifyWebhookSignature(mc.channelSecret, raw, signature)) {
        matched = mc;
        break;
      }
    }
    if (!matched) {
      logger.warn('[renkei] webhook signature verification failed');
      webhookLog.record({ at: Date.now(), type: '(unverified)', verified: false });
      return c.text('invalid signature', 401);
    }

    // Re-parse through the verified secret (throws only on malformed body now).
    let payload: Awaited<ReturnType<typeof parseWebhook>>;
    try {
      payload = await parseWebhook({
        body: raw,
        signature,
        channelSecret: matched.channelSecret,
      });
    } catch {
      return c.text('bad request', 400);
    }

    // Friendship is tracked on the Login channel for this messaging channel's region.
    const loginChannel = channelFor(matched.region);
    for (const event of payload.events) {
      const userId = event.source?.userId;
      webhookLog.record({
        at: Date.now(),
        type: event.type,
        userId,
        result: isAccountLinkEvent(event) ? event.link.result : undefined,
        verified: true,
      });
      if (!userId) continue;
      const at = new Date(event.timestamp);
      if (isFollowEvent(event)) {
        await storage.identities.setFriendship(loginChannel.channelId, userId, true, at);
      } else if (isUnfollowEvent(event)) {
        await storage.identities.setFriendship(loginChannel.channelId, userId, false, at);
      } else if (isAccountLinkEvent(event)) {
        // Finalise a link started at /link/start: resolve nonce → sub and
        // record the messaging-side account, which flips the `line:linked`
        // claim. The nonce is one-time — drop it whatever the result.
        const pending = (await storage.payloads.find(LINK_MODEL, event.link.nonce)) as
          | { sub?: string }
          | undefined;
        if (event.link.result === 'ok' && pending?.sub) {
          await storage.identities.upsertLineAccount({
            identitySub: pending.sub,
            channelId: matched.channelId ?? loginChannel.channelId,
            lineUserId: userId,
            kind: 'messaging',
          });
          logger.info(`[renkei] accountLink ok: linked ${userId} to ${pending.sub}`);
        } else {
          logger.info(
            `[renkei] accountLink ${event.link.result} for ${userId}${pending ? '' : ' (no pending nonce)'}`,
          );
        }
        if (pending) await storage.payloads.destroy(LINK_MODEL, event.link.nonce);
      }
    }
    return c.json({ ok: true });
  });

  app.route('/liff', liffRoutes({ config, storage, jwks, fetch: lineFetch, logger }));

  // Read-only inspection, only when an admin token is configured.
  if (config.adminToken) app.route('/inspect', inspectRoutes({ config, storage, webhookLog }));

  if (config.dev) app.route('/dev', devRoutes({ config, provider, liffId: options.liffId }));

  return {
    app,
    provider,
    config,
    storage,
    fetch: (request) => Promise.resolve(app.fetch(request)),
  };
}

function pickBotPrompt(requested: string | undefined, fallback: LineChannelConfig['botPrompt']) {
  const v = requested ?? fallback;
  return v === 'normal' || v === 'aggressive' ? v : undefined;
}

function describeError(e: unknown) {
  if (e instanceof LineAuthorizationError)
    return { type: 'authorization', code: e.code, description: e.description };
  if (e instanceof LineApiError)
    return {
      type: 'api',
      endpoint: e.endpoint,
      status: e.status,
      code: e.code,
      description: e.description,
    };
  if (e instanceof LineIdTokenError)
    return { type: 'id_token', reason: e.reason, message: e.message };
  return { type: 'unknown', message: (e as Error)?.message ?? String(e) };
}
