import {
  buildAuthorizeUrl,
  exchangeCode,
  generatePkce,
  getFriendshipStatus,
  getProfile,
  LineApiError,
  LineAuthorizationError,
  LineIdTokenError,
  parseCallback,
  randomToken,
  type Storage,
  upsertIdentityFromLine,
  verifyIdToken,
} from '@renkei/core';
import { Hono } from 'hono';
import type Provider from 'oidc-provider';
import { bridge, nodePair } from './adapters/fetch-to-node.js';
import {
  type LineChannelConfig,
  parseConfig,
  type RenkeiConfig,
  type RenkeiOptions,
} from './config.js';
import { devRoutes } from './dev-rp.js';
import { generateDevJwks } from './keys.js';
import { liffRoutes } from './liff.js';
import { createProvider, INTERACTION_PATH } from './oidc/provider.js';

/** Short-lived login state, keyed by the OAuth `state` sent to LINE. */
const LOGIN_MODEL = 'renkei:login';
/** One-time handoff from /line/callback to /interaction/:uid/finish. */
const RESULT_MODEL = 'renkei:login-result';
const LOGIN_TTL = 600;
const RESULT_TTL = 60;

interface LoginState {
  uid: string;
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
    logger.warn(
      '[renkei] 署名鍵が設定されていないため一時的な鍵を生成しました。再起動でトークンが無効になります。本番では jwks を設定してください。 / No signing keys configured; generated a temporary key. Tokens die on restart. Configure jwks in production.',
    );
  }
  if (!storage.init) {
    logger.warn(
      '[renkei] インメモリストレージを使用しています。本番では使用しないでください。 / Using in-memory storage. Do not use in production.',
    );
  }
  for (const ch of config.channels) {
    if (ch.requestEmail) {
      logger.info(
        `[renkei] channel ${ch.channelId}: email scope is requested. LINE silently drops it unless the channel has email permission — verify in LINE Developers Console.`,
      );
    }
  }

  await storage.init?.();
  const provider = createProvider({ config, storage, jwks, logger });
  const app = new Hono();

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
      if (!login) return c.text('ログイン状態が無効です / invalid or expired login state', 400);
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

  app.route('/liff', liffRoutes({ config, storage, jwks, fetch: lineFetch, logger }));

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
