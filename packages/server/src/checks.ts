/**
 * First-run configuration checks.
 *
 * renkei can't reach the LINE Developers Console, so it can't *prove* a
 * channel is set up correctly. What it can do is inspect the config it was
 * given and flag the mistakes that otherwise fail silently at runtime — a
 * misrouted webhook region, the `/dev` relying party left on in production,
 * an email scope the channel may not have. These run once at startup and are
 * pure (no I/O), so they're easy to test and easy to log.
 */
import type { RenkeiConfig } from './config.js';

export type CheckLevel = 'warn' | 'info';

export interface FirstRunCheck {
  level: CheckLevel;
  /** Stable identifier, handy for tests and for silencing individual checks later. */
  code: string;
  message: string;
}

export interface CheckContext {
  /** False when the storage adapter is the in-memory one (no `init`). */
  hasPersistentStorage: boolean;
}

/**
 * Inspect a parsed config and return the advisories that apply. Ordered
 * roughly by severity within the run; the caller decides how to surface them.
 */
export function firstRunChecks(config: RenkeiConfig, ctx: CheckContext): FirstRunCheck[] {
  const checks: FirstRunCheck[] = [];

  if (!config.jwks || config.jwks.length === 0) {
    checks.push({
      level: 'warn',
      code: 'no-jwks',
      message:
        '署名鍵が設定されていないため一時的な鍵を生成しました。再起動でトークンが無効になります。本番では jwks を設定してください。 / No signing keys configured; a temporary key was generated. Tokens die on restart. Configure jwks in production.',
    });
  }

  if (!ctx.hasPersistentStorage) {
    checks.push({
      level: 'warn',
      code: 'memory-storage',
      message:
        'インメモリストレージを使用しています。再起動で全セッションが消えます。本番では使用しないでください。 / Using in-memory storage; all sessions are lost on restart. Do not use in production.',
    });
  }

  if (config.dev) {
    checks.push({
      level: 'warn',
      code: 'dev-rp-enabled',
      message:
        '/dev テスト用リライングパーティが有効です。誰でもアクセスできるため本番では無効にしてください（dev: false）。 / The /dev test relying party is enabled and world-reachable. Disable it in production (dev: false).',
    });
  }

  if (config.adminToken) {
    checks.push({
      level: 'info',
      code: 'inspect-enabled',
      message:
        'adminToken が設定されているため、読み取り専用の /inspect が有効です（Bearer 認証）。トークンは十分に長くランダムなものを使ってください。 / adminToken is set: the read-only /inspect endpoints are mounted (Bearer-gated). Use a long random token.',
    });
  }

  const regions = new Set(config.channels.filter((c) => c.kind === 'login').map((c) => c.region));

  for (const ch of config.channels) {
    if (ch.requestEmail) {
      checks.push({
        level: 'info',
        code: 'email-scope-requested',
        message: `channel ${ch.channelId} (${ch.region}): the email scope is requested. LINE silently drops it unless the channel has email permission — verify it in the LINE Developers Console.`,
      });
    }
  }

  if (regions.size > 1) {
    const first = config.channels.find((c) => c.kind === 'login');
    checks.push({
      level: 'info',
      code: 'multi-region',
      message: `${regions.size} LINE Login channels configured (${[...regions].join(', ')}). A login without \`line_region\` (and a client without \`lineRegion\`) uses "${first?.region}" — the first channel in the list.`,
    });
  }

  for (const mc of config.messagingChannels) {
    if (mc.region && !regions.has(mc.region)) {
      checks.push({
        level: 'warn',
        code: 'messaging-region-unmatched',
        message: `messaging channel${mc.channelId ? ` ${mc.channelId}` : ''}: region "${mc.region}" matches no LINE Login channel (have: ${[...regions].join(', ')}). Follow/unfollow events would be mirrored onto the first channel "${config.channels[0]?.region}" instead. Fix the region or add the matching Login channel.`,
      });
    }
  }

  for (const mc of config.messagingChannels) {
    if (mc.accountLinkForwardUrl && !mc.accountLinkForwardSecret) {
      checks.push({
        level: 'warn',
        code: 'accountlink-forward-unsigned',
        message: `messaging channel${mc.channelId ? ` ${mc.channelId}` : ''}: accountLinkForwardUrl is set without accountLinkForwardSecret — forwarded events are unsigned, so the receiving app cannot verify they came from renkei. Set a shared secret.`,
      });
    }
  }

  if (config.messagingChannels.length > 0) {
    checks.push({
      level: 'info',
      code: 'messaging-provider-reminder',
      message: `${config.messagingChannels.length} messaging channel(s) configured. The Messaging API channel must live under the SAME LINE provider as its Login channel for friend status to line up, and its webhook URL must point at ${config.issuer.replace(/\/$/, '')}/line/webhook (enable "Use webhook" and disable auto-reply in the console).`,
    });
  }

  return checks;
}

/** Run the checks and emit them through the given logger. Returns them too. */
export function reportFirstRunChecks(
  config: RenkeiConfig,
  ctx: CheckContext,
  logger: Pick<Console, 'info' | 'warn'>,
): FirstRunCheck[] {
  const checks = firstRunChecks(config, ctx);
  for (const c of checks) {
    const line = `[renkei] ${c.message}`;
    if (c.level === 'warn') logger.warn(line);
    else logger.info(line);
  }
  return checks;
}
