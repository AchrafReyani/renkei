import type { JWK } from 'jose';
import type { Storage } from 'renkei-core';
import { z } from 'zod';

const botPromptSchema = z.enum(['normal', 'aggressive', 'none']);

export const lineChannelSchema = z.object({
  channelId: z.string().min(1),
  channelSecret: z.string().min(1),
  /** jp | tw | th | … Used for `line_region` routing and the `line:region` claim. */
  region: z.string().min(2).default('jp'),
  liffIds: z.array(z.string()).default([]),
  /** Default friend-add behaviour for this channel. `none` disables `bot_prompt`. */
  botPrompt: botPromptSchema.default('aggressive'),
  /** Request the `email` scope. Only works if LINE granted the channel email permission. */
  requestEmail: z.boolean().default(false),
});

export const messagingChannelSchema = z.object({
  /** Messaging API channel secret — signs incoming webhooks (NOT the Login channel secret). */
  channelSecret: z.string().min(1),
  /** Which Login channel's users these events concern (a `channels[].region`). Defaults to the first channel. */
  region: z.string().min(2).optional(),
  /** Messaging API channel ID. Informational. */
  channelId: z.string().optional(),
});

export const oidcClientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
  redirectUris: z.array(z.string().url()).min(1),
  /** `client_secret_basic` (default), `client_secret_post`, or `none` for public clients (PKCE enforced). */
  tokenEndpointAuthMethod: z
    .enum(['client_secret_basic', 'client_secret_post', 'none'])
    .default('client_secret_basic'),
  /** Pin the LINE channel (region) this client logs in through. Defaults to the first channel. */
  lineRegion: z.string().optional(),
  /**
   * Some downstream systems (Supabase Auth's built-in providers, for one)
   * refuse users without an email, but LINE only supplies one when the
   * channel has email permission *and* the user consents. When set, users
   * without an email get `<sub>@<domain>` with `email_verified: true` and an
   * extra `email_placeholder: true` claim so your app can tell. Use a domain
   * you control and never deliver mail to it.
   */
  placeholderEmailDomain: z
    .string()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'must be a bare domain like line-users.example.com')
    .optional(),
});

export const renkeiConfigSchema = z.object({
  /** Public base URL, e.g. https://auth.example.com — becomes the OIDC issuer. */
  issuer: z.string().url(),
  channels: z.array(lineChannelSchema).min(1),
  /** LINE Messaging API channels whose webhooks renkei accepts at `POST /line/webhook`. */
  messagingChannels: z.array(messagingChannelSchema).default([]),
  clients: z.array(oidcClientSchema).min(1),
  /** Keys for signing cookies. Rotate by prepending a new one. */
  cookieKeys: z.array(z.string().min(16)).min(1),
  /** Private JWKs used to sign tokens. Generated (and warned about) if absent. */
  jwks: z.array(z.custom<JWK>()).optional(),
  /** Enable the built-in `/dev` relying party for manual testing. Never in production. */
  dev: z.boolean().default(false),
  /** Where LINE redirects after login: `${issuer}/line/callback` unless overridden. */
  lineCallbackPath: z.string().default('/line/callback'),
  /** Browser origins allowed to call `/liff/exchange` (your LIFF app URLs). Empty = no CORS. */
  corsOrigins: z.array(z.string().url()).default([]),
  /** Token lifetimes in seconds. */
  ttl: z
    .object({
      accessToken: z.number().int().positive().default(3600),
      idToken: z.number().int().positive().default(3600),
      refreshToken: z
        .number()
        .int()
        .positive()
        .default(14 * 24 * 3600),
      session: z
        .number()
        .int()
        .positive()
        .default(14 * 24 * 3600),
      interaction: z.number().int().positive().default(600),
    })
    .prefault({}),
});

export type RenkeiConfigInput = z.input<typeof renkeiConfigSchema>;
export type RenkeiConfig = z.output<typeof renkeiConfigSchema>;
export type LineChannelConfig = z.output<typeof lineChannelSchema>;
export type MessagingChannelConfig = z.output<typeof messagingChannelSchema>;
export type OidcClientConfig = z.output<typeof oidcClientSchema>;

export interface RenkeiOptions {
  config: RenkeiConfigInput;
  storage: Storage;
  /** Injectable fetch for LINE API calls (tests, custom agents). */
  fetch?: typeof fetch;
  /** Logger. Defaults to console. */
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  /** LIFF app ID used only by the /dev/liff page. */
  liffId?: string | undefined;
}

export function parseConfig(input: RenkeiConfigInput): RenkeiConfig {
  const parsed = renkeiConfigSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`renkei の設定が不正です / invalid renkei config:\n${issues.join('\n')}`);
  }
  const config = parsed.data;
  const seen = new Set<string>();
  for (const ch of config.channels) {
    if (seen.has(ch.region)) {
      throw new Error(
        `チャネルの region が重複しています / duplicate channel region "${ch.region}" — one LINE Login channel per region`,
      );
    }
    seen.add(ch.region);
  }
  for (const c of config.clients) {
    if (c.tokenEndpointAuthMethod !== 'none' && !c.clientSecret) {
      throw new Error(
        `client "${c.clientId}": clientSecret is required unless tokenEndpointAuthMethod is "none"`,
      );
    }
    if (c.lineRegion && !seen.has(c.lineRegion)) {
      throw new Error(
        `client "${c.clientId}": lineRegion "${c.lineRegion}" has no matching channel`,
      );
    }
  }
  return config;
}
