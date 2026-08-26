/**
 * Node entry point: configuration from environment variables, storage
 * selection, and an HTTP listener.
 *
 *   ISSUER                     public base URL (default http://localhost:3000)
 *   PORT                       listen port (default: from ISSUER, else 3000)
 *   LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET / LINE_LOGIN_REGION
 *   LINE_MESSAGING_CHANNEL_SECRET / LINE_MESSAGING_CHANNEL_ID  (enables POST /line/webhook)
 *   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN                        (enables POST /link/start)
 *   LINE_ACCOUNTLINK_FORWARD_URL / LINE_ACCOUNTLINK_FORWARD_SECRET  (forward app-owned accountLink)
 *   RENKEI_BOT_PROMPT          aggressive | normal | none   (default aggressive)
 *   RENKEI_REQUEST_EMAIL       true to request the email scope
 *   RENKEI_COOKIE_KEYS         comma-separated; generated for dev if absent
 *   RENKEI_CLIENTS             JSON array of { clientId, clientSecret, redirectUris, tokenEndpointAuthMethod?, lineRegion? }
 *   RENKEI_JWKS                JSON array of private JWKs; generated for dev if absent
 *   RENKEI_CORS_ORIGINS        comma-separated browser origins allowed on /liff/exchange
 *   RENKEI_DEV                 true to mount the /dev relying party
 *   RENKEI_ADMIN_TOKEN         bearer token; when set, mounts read-only /inspect
 *   RENKEI_LOG_FORMAT          "json" for one JSON object per log line (secrets always redacted)
 *   DATABASE_URL               Postgres URL; in-memory storage if absent
 */
import { serve } from '@hono/node-server';
import { createMemoryStorage, randomToken, type Storage } from 'renkei-core';
import { createPostgresStorage } from 'renkei-storage-postgres';
import { createRenkei } from './app.js';
import type { RenkeiConfigInput } from './config.js';

const env = process.env;
const issuer = env.ISSUER ?? 'http://localhost:3000';
const dev = env.RENKEI_DEV === 'true' || (!env.RENKEI_CLIENTS && !env.DATABASE_URL);

const clients: RenkeiConfigInput['clients'] = env.RENKEI_CLIENTS
  ? JSON.parse(env.RENKEI_CLIENTS)
  : [
      {
        clientId: 'renkei-dev',
        clientSecret: 'renkei-dev-secret',
        redirectUris: [`${issuer}/dev/callback`],
      },
      {
        clientId: 'renkei-dev-liff',
        redirectUris: [`${issuer}/dev/liff`],
        tokenEndpointAuthMethod: 'none' as const,
      },
    ];

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
  ],
  clients,
  ...(env.LINE_MESSAGING_CHANNEL_SECRET
    ? {
        messagingChannels: [
          {
            channelSecret: env.LINE_MESSAGING_CHANNEL_SECRET,
            region: env.LINE_LOGIN_REGION ?? 'jp',
            ...(env.LINE_MESSAGING_CHANNEL_ID ? { channelId: env.LINE_MESSAGING_CHANNEL_ID } : {}),
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
  ...(env.RENKEI_JWKS ? { jwks: JSON.parse(env.RENKEI_JWKS) } : {}),
};

const storage: Storage = env.DATABASE_URL
  ? createPostgresStorage({ connectionString: env.DATABASE_URL })
  : createMemoryStorage();

const renkei = await createRenkei({
  config,
  storage,
  liffId: env.LIFF_ID,
  logStructured: env.RENKEI_LOG_FORMAT === 'json',
});
const port = Number(env.PORT ?? new URL(issuer).port ?? 3000) || 3000;

serve({ fetch: renkei.app.fetch, port }, () => {
  console.log(
    `renkei → ${issuer}  (listening on :${port}, storage: ${env.DATABASE_URL ? 'postgres' : 'memory'}${dev ? ', dev RP at /dev' : ''})`,
  );
});

function required(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set — copy .env.example to .env and fill it in`);
  return v;
}
