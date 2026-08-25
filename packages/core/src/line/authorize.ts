import { LINE_ENDPOINTS } from './channel.js';

/**
 * `bot_prompt` controls the "add the linked LINE Official Account as a friend"
 * step during login. Requires the channel to have a linked Official Account
 * (Developers Console → channel → Basic settings → Add friend option).
 *
 * - `normal`: friend-add is offered on the consent screen.
 * - `aggressive`: a dedicated friend-add screen is shown after consent.
 */
export type BotPrompt = 'normal' | 'aggressive';

export const DEFAULT_LOGIN_SCOPES = ['openid', 'profile'] as const;

export interface AuthorizeUrlParams {
  channelId: string;
  /** Must exactly match one of the callback URLs registered on the channel. */
  redirectUri: string;
  /** CSRF token; verify on callback. */
  state: string;
  /** Replay protection for the id_token; verify against the `nonce` claim. */
  nonce: string;
  /** Defaults to `openid profile`. Add `email` only if the channel has email permission. */
  scope?: readonly string[];
  botPrompt?: BotPrompt;
  /** PKCE `code_challenge` (S256). Strongly recommended; LINE supports it since 2021. */
  codeChallenge?: string;
  /** Force the consent screen even for returning users. */
  prompt?: 'consent';
  /** Seconds since the user last authenticated that LINE will accept. */
  maxAge?: number;
  /** Consent screen language, e.g. `ja-JP`, `zh-TW`, `th-TH`, `en-US`. */
  uiLocales?: string;
  /** Show the QR-code login method first on desktop. */
  initialAmrDisplay?: 'lineqr';
  /** Hide the "switch login method" link. */
  switchAmr?: boolean;
  /** Disable auto-login when opened in the LINE in-app browser (Android+iOS). */
  disableAutoLogin?: boolean;
  /** Disable auto-login on iOS only. */
  disableIosAutoLogin?: boolean;
}

/**
 * Build the LINE Login authorization URL (OAuth 2.0 / OIDC authorization
 * code flow). Every LINE-specific parameter is exposed here so callers never
 * have to hand-edit the URL — that is where the `bot_prompt` bugs come from.
 */
export function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
  const url = new URL(LINE_ENDPOINTS.authorize);
  const q = url.searchParams;
  q.set('response_type', 'code');
  q.set('client_id', params.channelId);
  q.set('redirect_uri', params.redirectUri);
  q.set('state', params.state);
  q.set('scope', (params.scope ?? DEFAULT_LOGIN_SCOPES).join(' '));
  q.set('nonce', params.nonce);
  if (params.botPrompt) q.set('bot_prompt', params.botPrompt);
  if (params.codeChallenge) {
    q.set('code_challenge', params.codeChallenge);
    q.set('code_challenge_method', 'S256');
  }
  if (params.prompt) q.set('prompt', params.prompt);
  if (params.maxAge !== undefined) q.set('max_age', String(params.maxAge));
  if (params.uiLocales) q.set('ui_locales', params.uiLocales);
  if (params.initialAmrDisplay) q.set('initial_amr_display', params.initialAmrDisplay);
  if (params.switchAmr === false) q.set('switch_amr', 'false');
  if (params.disableAutoLogin) q.set('disable_auto_login', 'true');
  if (params.disableIosAutoLogin) q.set('disable_ios_auto_login', 'true');
  return url.toString();
}
