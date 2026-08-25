import {
  buildClaims,
  decodeIdTokenAudience,
  getFriendshipStatus,
  getProfile,
  LineApiError,
  LineIdTokenError,
  type Storage,
  upsertIdentityFromLine,
  verifyAccessToken,
  verifyIdToken,
} from '@renkei/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { importJWK, type JWK, SignJWT } from 'jose';
import type { LineChannelConfig, OidcClientConfig, RenkeiConfig } from './config.js';
import { CLAIMS_BY_SCOPE } from './oidc/provider.js';

export interface LiffDeps {
  config: RenkeiConfig;
  storage: Storage;
  jwks: JWK[];
  fetch: typeof fetch;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

interface ExchangeBody {
  id_token?: string;
  access_token?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
}

/**
 * `POST /liff/exchange`
 *
 * A LIFF / LINE Mini App front-end holds LINE tokens from `liff.getIDToken()`
 * and `liff.getAccessToken()`. It must never send profile JSON to a server;
 * it sends the tokens, and renkei verifies them with LINE, upserts the same
 * identity a web login would produce, and returns a renkei-signed id_token
 * (RS256, verifiable via the issuer's JWKS like any OIDC id_token) for the
 * OIDC client that owns the app.
 *
 * Accepts JSON or form bodies with `id_token` and/or `access_token`, plus
 * `client_id` (and `client_secret`, or HTTP Basic, for confidential clients).
 * `id_token` proves identity; `access_token` additionally enables the
 * friendship check and the profile call.
 */
export function liffRoutes(deps: LiffDeps) {
  const { config, storage, logger } = deps;
  const app = new Hono();
  const regionOf = (channelId: string) =>
    config.channels.find((c) => c.channelId === channelId)?.region;

  if (config.corsOrigins.length > 0) {
    app.use(
      '/*',
      cors({ origin: config.corsOrigins, allowMethods: ['POST', 'OPTIONS'], maxAge: 600 }),
    );
  }

  app.post('/exchange', async (c) => {
    const body = await readBody(c.req.raw);
    const client = authenticateClient(config, c.req.raw, body);
    if (!client) return c.json({ error: 'invalid_client' }, 401);
    if (!body.id_token && !body.access_token) {
      return c.json(
        { error: 'invalid_request', error_description: 'id_token or access_token is required' },
        400,
      );
    }

    try {
      let channel: LineChannelConfig | undefined;
      let lineUserId: string | undefined;
      let idClaims: Awaited<ReturnType<typeof verifyIdToken>> | undefined;

      if (body.id_token) {
        const aud = decodeIdTokenAudience(body.id_token);
        channel = config.channels.find((ch) => ch.channelId === aud);
        if (!channel)
          return c.json(
            {
              error: 'invalid_token',
              error_description: 'id_token is not for one of our channels',
            },
            401,
          );
        idClaims = await verifyIdToken(body.id_token, { channel });
        lineUserId = idClaims.sub;
      }

      let profile: Awaited<ReturnType<typeof getProfile>> | undefined;
      let friend: boolean | undefined;
      if (body.access_token) {
        const info = await verifyAccessToken(body.access_token, { fetch: deps.fetch });
        const tokenChannel = config.channels.find((ch) => ch.channelId === info.client_id);
        if (!tokenChannel)
          return c.json(
            {
              error: 'invalid_token',
              error_description: 'access_token is not for one of our channels',
            },
            401,
          );
        if (channel && tokenChannel.channelId !== channel.channelId) {
          return c.json(
            {
              error: 'invalid_token',
              error_description: 'id_token and access_token belong to different channels',
            },
            401,
          );
        }
        channel = tokenChannel;
        profile = await getProfile(body.access_token, { fetch: deps.fetch });
        if (lineUserId && profile.userId !== lineUserId) {
          return c.json(
            {
              error: 'invalid_token',
              error_description: 'id_token and access_token belong to different users',
            },
            401,
          );
        }
        lineUserId = profile.userId;
        friend = await getFriendshipStatus(body.access_token, { fetch: deps.fetch }).catch(
          (e: unknown) => {
            logger.warn('[renkei] liff friendship check failed', { message: (e as Error).message });
            return undefined;
          },
        );
      }
      if (!channel || !lineUserId) return c.json({ error: 'invalid_token' }, 401);

      const { identity, created } = await upsertIdentityFromLine(storage, {
        channelId: channel.channelId,
        claims: idClaims ?? { sub: lineUserId },
        kind: 'liff',
        ...(profile ? { profile } : {}),
        ...(friend !== undefined ? { friend } : {}),
      });
      logger.info('[renkei] liff exchange', {
        sub: identity.sub,
        created,
        friend,
        client: client.clientId,
      });

      const scope = (body.scope ?? 'openid profile email line').split(' ');
      const allowed = new Set<string>(
        scope.flatMap((s) => CLAIMS_BY_SCOPE[s as keyof typeof CLAIMS_BY_SCOPE] ?? []),
      );
      const accounts = await storage.identities.listLineAccounts(identity.sub);
      const all = buildClaims(identity, accounts, { regionOf, preferChannelId: channel.channelId });
      const claims = Object.fromEntries(
        Object.entries(all).filter(([k]) => k === 'sub' || allowed.has(k)),
      );

      const key = deps.jwks[0];
      if (!key) throw new Error('no signing key');
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ ...claims, auth_time: now, amr: idClaims?.amr ?? ['liff'] })
        .setProtectedHeader({ alg: key.alg ?? 'RS256', kid: key.kid ?? '', typ: 'JWT' })
        .setIssuer(config.issuer)
        .setAudience(client.clientId)
        .setSubject(identity.sub)
        .setIssuedAt(now)
        .setExpirationTime(now + config.ttl.idToken)
        .sign(await importJWK(key, key.alg ?? 'RS256'));

      return c.json({
        token_type: 'Bearer',
        id_token: token,
        expires_in: config.ttl.idToken,
        sub: identity.sub,
      });
    } catch (e) {
      if (e instanceof LineIdTokenError) {
        return c.json({ error: 'invalid_token', error_description: `id_token: ${e.reason}` }, 401);
      }
      if (e instanceof LineApiError) {
        logger.warn('[renkei] liff exchange LINE error', {
          endpoint: e.endpoint,
          status: e.status,
          code: e.code,
        });
        return c.json(
          { error: 'invalid_token', error_description: `LINE ${e.endpoint} rejected the token` },
          401,
        );
      }
      throw e;
    }
  });

  return app;
}

async function readBody(req: Request): Promise<ExchangeBody> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return ((await req.json()) ?? {}) as ExchangeBody;
  const form = new URLSearchParams(await req.text());
  return Object.fromEntries(form) as ExchangeBody;
}

function authenticateClient(
  config: RenkeiConfig,
  req: Request,
  body: ExchangeBody,
): OidcClientConfig | undefined {
  let clientId = body.client_id;
  let secret = body.client_secret;
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    const [id, ...rest] = atob(auth.slice(6)).split(':');
    clientId = id ? decodeURIComponent(id) : undefined;
    secret = decodeURIComponent(rest.join(':'));
  }
  if (!clientId) return undefined;
  const client = config.clients.find((cl) => cl.clientId === clientId);
  if (!client) return undefined;
  if (client.tokenEndpointAuthMethod === 'none') return client;
  return client.clientSecret && secret && timingSafeEqual(client.clientSecret, secret)
    ? client
    : undefined;
}

function timingSafeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
