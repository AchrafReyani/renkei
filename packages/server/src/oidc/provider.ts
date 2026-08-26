import Provider, { type Configuration, type KoaContextWithOIDC } from 'oidc-provider';
import { buildClaims, LINE_CLAIMS, LINE_SCOPE, type Storage } from 'renkei-core';
import type { RenkeiConfig } from '../config.js';
import { adapterFactory } from './adapter.js';
import { applyEmailPlaceholder, EMAIL_PLACEHOLDER_CLAIM } from './claims.js';

/** Paths of the OIDC provider. Discovery is fixed by spec at the issuer root. */
export const OIDC_ROUTES = {
  authorization: '/oidc/auth',
  token: '/oidc/token',
  jwks: '/oidc/jwks',
  userinfo: '/oidc/me',
  revocation: '/oidc/token/revocation',
  introspection: '/oidc/token/introspection',
  pushed_authorization_request: '/oidc/request',
  end_session: '/oidc/session/end',
  backchannel_authentication: '/oidc/backchannel',
  device_authorization: '/oidc/device/auth',
  code_verification: '/oidc/device',
  registration: '/oidc/reg',
} as const;

export const INTERACTION_PATH = '/interaction';

/** Standard + renkei claims released per scope. */
export const CLAIMS_BY_SCOPE = {
  openid: ['sub'],
  profile: ['name', 'picture'],
  email: ['email', 'email_verified', EMAIL_PLACEHOLDER_CLAIM],
  [LINE_SCOPE]: [LINE_CLAIMS.userId, LINE_CLAIMS.friend, LINE_CLAIMS.channelId, LINE_CLAIMS.region],
} as const;

export interface ProviderDeps {
  config: RenkeiConfig;
  storage: Storage;
  jwks: NonNullable<RenkeiConfig['jwks']>;
  logger: Pick<Console, 'info' | 'warn' | 'error'>;
}

export function createProvider({ config, storage, jwks, logger }: ProviderDeps): Provider {
  const regionOf = (channelId: string) =>
    config.channels.find((c) => c.channelId === channelId)?.region;

  const configuration: Configuration = {
    adapter: adapterFactory(storage.payloads),
    clients: config.clients.map((c) => ({
      client_id: c.clientId,
      ...(c.clientSecret ? { client_secret: c.clientSecret } : {}),
      redirect_uris: c.redirectUris,
      token_endpoint_auth_method: c.tokenEndpointAuthMethod,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    })),
    cookies: { keys: config.cookieKeys },
    jwks: { keys: jwks },
    clientDefaults: {
      id_token_signed_response_alg: 'RS256',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    routes: OIDC_ROUTES,
    claims: CLAIMS_BY_SCOPE as unknown as Configuration['claims'],
    scopes: ['openid', 'offline_access', 'profile', 'email', LINE_SCOPE],
    // Put profile/email/line claims in the id_token too, not only at /oidc/me.
    // Downstream IdPs (Supabase, Cognito, Keycloak) mostly read the id_token.
    conformIdTokenClaims: false,
    // LINE-specific params a client may pass through the OIDC authorize request.
    extraParams: ['bot_prompt', 'line_region'],
    pkce: {
      // Public clients must use PKCE. Confidential ones may — Cognito can't,
      // so requiring it for everyone would lock out a real downstream target.
      required: (_ctx, client) => client.tokenEndpointAuthMethod === 'none',
    },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: false },
    },
    ttl: {
      AccessToken: config.ttl.accessToken,
      IdToken: config.ttl.idToken,
      RefreshToken: config.ttl.refreshToken,
      Session: config.ttl.session,
      Interaction: config.ttl.interaction,
      Grant: config.ttl.session,
    },
    interactions: {
      url: (_ctx, interaction) => `${INTERACTION_PATH}/${interaction.uid}`,
    },
    async findAccount(ctx, sub) {
      const identity = await storage.identities.findIdentity(sub);
      if (!identity) return undefined;
      const clientId = ctx.oidc.client?.clientId;
      const client = config.clients.find((c) => c.clientId === clientId);
      return {
        accountId: sub,
        async claims(_use, _scope, _claims, _rejected) {
          const accounts = await storage.identities.listLineAccounts(sub);
          const base = buildClaims(identity, accounts, { regionOf });
          return applyEmailPlaceholder(base, client) as { sub: string } & Record<string, unknown>;
        },
      };
    },
    // renkei is a first-party broker: the user already consented on LINE's
    // screen, so we never show a second consent page. Auto-issue a grant
    // covering everything the client asked for.
    async loadExistingGrant(ctx: KoaContextWithOIDC) {
      const oidc = ctx.oidc;
      const client = oidc.client;
      const accountId = oidc.session?.accountId;
      if (!client || !accountId) return undefined;
      const grantId = oidc.result?.consent?.grantId ?? oidc.session?.grantIdFor(client.clientId);
      if (grantId) {
        const existing = await oidc.provider.Grant.find(grantId);
        if (existing) return existing;
      }
      const grant = new oidc.provider.Grant({ clientId: client.clientId, accountId });
      const scope = String(oidc.params?.scope ?? 'openid');
      grant.addOIDCScope(scope);
      const claimNames = scope
        .split(' ')
        .flatMap((s) => CLAIMS_BY_SCOPE[s as keyof typeof CLAIMS_BY_SCOPE] ?? []);
      grant.addOIDCClaims([...claimNames]);
      await grant.save();
      return grant;
    },
    renderError(ctx, out, error) {
      logger.error('[oidc] error', { error: out.error, description: out.error_description });
      ctx.type = 'html';
      ctx.body = `<!doctype html><meta charset="utf-8"><title>renkei</title>
<body style="font-family:system-ui;max-width:36rem;margin:4rem auto;line-height:1.6">
<h1>エラーが発生しました / Something went wrong</h1>
<p><code>${escapeHtml(out.error)}</code>${out.error_description ? ` — ${escapeHtml(String(out.error_description))}` : ''}</p>
<p style="color:#666">${escapeHtml(String((error as Error)?.message ?? ''))}</p>`;
    },
  };

  const provider = new Provider(config.issuer, configuration);
  // Trust X-Forwarded-Proto: renkei always sits behind something (Kong,
  // a load balancer, or our own fetch→node bridge which sets it).
  provider.proxy = true;
  return provider;
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
