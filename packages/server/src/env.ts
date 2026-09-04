/**
 * renkei configuration from environment-style variables. Shared by the Node
 * entry (`process.env`) and the Cloudflare Workers entry (vars + secrets), so
 * the variable names are the same everywhere:
 *
 *   ISSUER                     public base URL (default http://localhost:3000)
 *   LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET / LINE_LOGIN_REGION
 *   LINE_MINIAPP_CHANNEL_ID / LINE_MINIAPP_CHANNEL_SECRET   (a LINE MINI App channel of the same provider, for /liff/exchange;
 *                                                            comma-separate several: one per stage, Developing / Review / Published)
 *   LINE_MESSAGING_CHANNEL_SECRET / LINE_MESSAGING_CHANNEL_ID  (enables POST /line/webhook)
 *   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN                        (enables POST /link/start)
 *   LINE_ACCOUNTLINK_FORWARD_URL / LINE_ACCOUNTLINK_FORWARD_SECRET  (forward app-owned accountLink)
 *   RENKEI_BOT_PROMPT          aggressive | normal | none   (default aggressive)
 *   RENKEI_REQUEST_EMAIL       true to request the email scope
 *   RENKEI_COOKIE_KEYS         comma-separated; generated for dev if absent
 *   RENKEI_CLIENTS             JSON array of { clientId, clientSecret, redirectUris, tokenEndpointAuthMethod?, lineRegion? }
 *   RENKEI_JWKS                JSON array of private JWKs; generated for dev if absent
 *   RENKEI_CORS_ORIGINS        comma-separated browser origins allowed on /liff/exchange
 *   RENKEI_DEV                 true to mount the /dev relying party (adds the renkei-dev clients even when RENKEI_CLIENTS is set)
 *   RENKEI_ADMIN_TOKEN         bearer token; when set, mounts read-only /inspect
 *   RENKEI_LOG_FORMAT          "json" for one JSON object per log line (secrets always redacted)
 *   RENKEI_SESSION_COOKIE      "true" to mount /login, /session, /logout (first-party session cookie)
 *   RENKEI_SESSION_RETURN_URLS comma-separated absolute return_to URLs allowed after /login
 *   LIFF_ID                    LIFF app ID, used only by the /dev/liff page
 *   DATABASE_URL               Node entry only: postgres://… or sqlite:<file>; in-memory storage if absent
 */
import { randomToken } from 'renkei-core';
import type { RenkeiConfigInput } from './config.js';
import { devClientsFor, withDevClients } from './dev-rp.js';

export type EnvLike = Record<string, string | undefined>;

export interface EnvConfigOptions {
  /**
   * Whether persistent storage is configured. Decides the `dev` default
   * (`/dev` is on when neither clients nor a database are configured).
   * Defaults to `Boolean(env.DATABASE_URL)`; the Workers entry passes its own answer.
   */
  hasDatabase?: boolean;
}

export interface EnvConfig {
  config: RenkeiConfigInput;
  issuer: string;
  dev: boolean;
  liffId: string | undefined;
  logStructured: boolean;
  /** Which of the two keys were generated because the variable was absent — fine in dev, fatal in a multi-process deployment. */
  generated: { cookieKeys: boolean; jwks: boolean };
}

/**
 * `LINE_MINIAPP_CHANNEL_ID` / `LINE_MINIAPP_CHANNEL_SECRET` as `miniapp` channels
 * next to the Login channel (same provider, same region). Several IDs — one per
 * MINI App stage — are comma-separated; secrets pair up by position, and a
 * single secret applies to every ID.
 */
function miniAppChannels(env: EnvLike): RenkeiConfigInput['channels'] {
  if (!env.LINE_MINIAPP_CHANNEL_ID) return [];
  const ids = env.LINE_MINIAPP_CHANNEL_ID.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const secrets = (env.LINE_MINIAPP_CHANNEL_SECRET ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (secrets.length === 0) {
    throw new Error(
      'LINE_MINIAPP_CHANNEL_SECRET is not set — required with LINE_MINIAPP_CHANNEL_ID',
    );
  }
  if (secrets.length !== 1 && secrets.length !== ids.length) {
    throw new Error(
      `LINE_MINIAPP_CHANNEL_SECRET: give one secret, or one per LINE_MINIAPP_CHANNEL_ID (${ids.length} IDs, ${secrets.length} secrets)`,
    );
  }
  return ids.map((channelId, i) => ({
    channelId,
    channelSecret: (secrets.length === 1 ? secrets[0] : secrets[i]) as string,
    region: env.LINE_LOGIN_REGION ?? 'jp',
    kind: 'miniapp' as const,
  }));
}

export function configFromEnv(env: EnvLike, options: EnvConfigOptions = {}): EnvConfig {
  const issuer = env.ISSUER ?? 'http://localhost:3000';
  const hasDatabase = options.hasDatabase ?? Boolean(env.DATABASE_URL);
  const dev = env.RENKEI_DEV === 'true' || (!env.RENKEI_CLIENTS && !hasDatabase);

  // RENKEI_CLIENTS replaces the client list; with RENKEI_DEV=true the /dev
  // clients are appended so the test page keeps working next to real clients.
  const clients: RenkeiConfigInput['clients'] = env.RENKEI_CLIENTS
    ? dev
      ? withDevClients(JSON.parse(env.RENKEI_CLIENTS), issuer)
      : JSON.parse(env.RENKEI_CLIENTS)
    : devClientsFor(issuer);

  const required = (name: string): string => {
    const v = env[name];
    if (!v) throw new Error(`${name} is not set — copy .env.example to .env and fill it in`);
    return v;
  };

  const config: RenkeiConfigInput = {
    issuer,
    dev,
    channels: [
      {
        channelId: required('LINE_LOGIN_CHANNEL_ID'),
        channelSecret: required('LINE_LOGIN_CHANNEL_SECRET'),
        region: env.LINE_LOGIN_REGION ?? 'jp',
        botPrompt:
          (env.RENKEI_BOT_PROMPT as 'aggressive' | 'normal' | 'none' | undefined) ?? 'aggressive',
        requestEmail: env.RENKEI_REQUEST_EMAIL === 'true',
      },
      ...miniAppChannels(env),
    ],
    clients,
    ...(env.LINE_MESSAGING_CHANNEL_SECRET
      ? {
          messagingChannels: [
            {
              channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET,
              region: env.LINE_LOGIN_REGION ?? 'jp',
              ...(env.LINE_MESSAGING_CHANNEL_ID
                ? { channelId: env.LINE_MESSAGING_CHANNEL_ID }
                : {}),
              ...(env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
                ? { channelAccessToken: env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN }
                : {}),
              ...(env.LINE_ACCOUNTLINK_FORWARD_URL
                ? { accountLinkForwardUrl: env.LINE_ACCOUNTLINK_FORWARD_URL }
                : {}),
              ...(env.LINE_ACCOUNTLINK_FORWARD_SECRET
                ? { accountLinkForwardSecret: env.LINE_ACCOUNTLINK_FORWARD_SECRET }
                : {}),
            },
          ],
        }
      : {}),
    cookieKeys: env.RENKEI_COOKIE_KEYS ? env.RENKEI_COOKIE_KEYS.split(',') : [randomToken(32)],
    corsOrigins: env.RENKEI_CORS_ORIGINS ? env.RENKEI_CORS_ORIGINS.split(',') : [],
    ...(env.RENKEI_ADMIN_TOKEN ? { adminToken: env.RENKEI_ADMIN_TOKEN } : {}),
    ...(env.RENKEI_SESSION_COOKIE === 'true'
      ? {
          sessionCookie: {
            enabled: true,
            ...(env.RENKEI_SESSION_RETURN_URLS
              ? { returnUrls: env.RENKEI_SESSION_RETURN_URLS.split(',') }
              : {}),
          },
        }
      : {}),
    ...(env.RENKEI_JWKS ? { jwks: JSON.parse(env.RENKEI_JWKS) } : {}),
  };

  return {
    config,
    issuer,
    dev,
    liffId: env.LIFF_ID,
    logStructured: env.RENKEI_LOG_FORMAT === 'json',
    generated: { cookieKeys: !env.RENKEI_COOKIE_KEYS, jwks: !env.RENKEI_JWKS },
  };
}
