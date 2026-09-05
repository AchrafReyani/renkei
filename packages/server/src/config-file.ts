/**
 * `renkei.yaml` — the structured configuration file. Node-only: it reads the
 * filesystem and pulls in a YAML parser, so the Workers and Supabase Edge
 * entries never import this module (neither has a filesystem; both stay on
 * `configFromEnv`).
 *
 * The file is the whole configuration. Environment variables are for the two
 * slots the deploy platform owns — `PORT` and `DATABASE_URL` (a fallback for
 * `storage:`) — plus whatever the file references as `${VAR}`. Every other
 * `LINE_*` / `RENKEI_*` variable is ignored, and `ignoredEnvVars()` names the
 * ones that were set so the boot banner can say so out loud.
 *
 *   issuer: https://auth.example.com
 *   storage: postgres://…            # or sqlite:./data/renkei.db; DATABASE_URL if absent
 *   channels:
 *     - id: "1234567890"             # channel_id / channelId also accepted
 *       region: jp
 *       secret: ${LINE_JP_SECRET}    # never a literal, so the file is committable
 *   messaging:                       # or messaging_channels: [ … ] for several
 *     channel_id: "3456789012"
 *     channel_secret: ${LINE_MSG_SECRET}
 *   clients:
 *     - client_id: supabase
 *       client_secret: ${SUPABASE_CLIENT_SECRET}
 *       redirect_uris: ["https://xyz.supabase.co/auth/v1/callback"]
 *
 * Keys are snake_case; the camelCase spelling of the zod schema is accepted
 * too, so a `RENKEI_CHANNELS` JSON entry can be pasted in unchanged.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { randomToken } from 'renkei-core';
import { parse as parseYaml } from 'yaml';
import type { RenkeiConfigInput } from './config.js';
import { parseConfig } from './config.js';
import { withDevClients } from './dev-rp.js';
import type { EnvLike } from './env.js';

/** Files looked for in the working directory, in order, when `RENKEI_CONFIG` is unset. */
export const CONFIG_FILE_NAMES = ['renkei.yaml', 'renkei.yml'] as const;

/**
 * Everything `renkei.yaml` can hold that is not part of `renkeiConfigSchema`:
 * the deploy-time slots the Node entry owns.
 */
export interface FileDeployOptions {
  /** `postgres://…` or `sqlite:<file>` — what `DATABASE_URL` sets when there is no file. */
  storage?: string;
  /** Listen port. `PORT` wins over it, so a platform that injects one still works. */
  port?: number;
  /** LIFF app ID used only by the `/dev/liff` page. */
  liffId?: string;
  /** `json` for one JSON object per log line. */
  logFormat?: 'text' | 'json';
}

export interface FileConfig extends FileDeployOptions {
  config: RenkeiConfigInput;
  /** Absolute path of the file this came from. */
  path: string;
}

/** Config variables `configFromEnv` reads and a `renkei.yaml` makes irrelevant. */
export const ENV_VARS_SUPERSEDED_BY_FILE = [
  'ISSUER',
  'LINE_LOGIN_CHANNEL_ID',
  'LINE_LOGIN_CHANNEL_SECRET',
  'LINE_LOGIN_REGION',
  'RENKEI_CHANNELS',
  'LINE_MINIAPP_CHANNEL_ID',
  'LINE_MINIAPP_CHANNEL_SECRET',
  'LINE_MESSAGING_CHANNEL_ID',
  'LINE_MESSAGING_CHANNEL_SECRET',
  'LINE_MESSAGING_CHANNEL_REGION',
  'LINE_MESSAGING_CHANNEL_ACCESS_TOKEN',
  'LINE_ACCOUNTLINK_FORWARD_URL',
  'LINE_ACCOUNTLINK_FORWARD_SECRET',
  'RENKEI_BOT_PROMPT',
  'RENKEI_REQUEST_EMAIL',
  'RENKEI_COOKIE_KEYS',
  'RENKEI_JWKS',
  'RENKEI_CLIENTS',
  'RENKEI_CORS_ORIGINS',
  'RENKEI_DEV',
  'RENKEI_ADMIN_TOKEN',
  'RENKEI_SESSION_COOKIE',
  'RENKEI_SESSION_RETURN_URLS',
  'RENKEI_LOG_FORMAT',
  'LIFF_ID',
] as const;

/**
 * Which superseded variables are actually set — the boot banner names them so a
 * stale `LINE_LOGIN_CHANNEL_ID` in a shell is never silently in effect.
 * `${VAR}` references in the file are excluded: those are the file's own inputs.
 */
export function ignoredEnvVars(env: EnvLike, referenced: Iterable<string> = []): string[] {
  const refs = new Set(referenced);
  return ENV_VARS_SUPERSEDED_BY_FILE.filter((name) => Boolean(env[name]) && !refs.has(name));
}

/**
 * The config file to use: `RENKEI_CONFIG` if set (an error when it does not
 * exist — an explicit path that is missing is a mistake, not a fallback), else
 * the first of `CONFIG_FILE_NAMES` present in `cwd`, else `undefined` for the
 * environment-variable path.
 */
export function findConfigFile(cwd: string, env: EnvLike): string | undefined {
  if (env.RENKEI_CONFIG) {
    const path = isAbsolute(env.RENKEI_CONFIG)
      ? env.RENKEI_CONFIG
      : resolve(cwd, env.RENKEI_CONFIG);
    readOrThrow(path, 'RENKEI_CONFIG');
    return path;
  }
  for (const name of CONFIG_FILE_NAMES) {
    const path = resolve(cwd, name);
    try {
      readFileSync(path, 'utf8');
      return path;
    } catch {
      // not there — try the next name
    }
  }
  return undefined;
}

function readOrThrow(path: string, why: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `設定ファイルが読めません / cannot read the renkei config file "${path}" (${why})`,
    );
  }
}

/** Read, expand, validate. `path` comes from `findConfigFile`. */
export function loadConfigFile(path: string, env: EnvLike): FileConfig {
  return parseConfigFile(readOrThrow(path, 'config file'), env, path);
}

/**
 * The whole transformation, without touching the filesystem, so tests (and the
 * CLI) can drive it from a string. `path` is only used in error messages.
 */
export function parseConfigFile(text: string, env: EnvLike, path = 'renkei.yaml'): FileConfig {
  let document: unknown;
  try {
    document = parseYaml(text);
  } catch (err) {
    throw new Error(
      `${path}: YAML として解釈できません / not valid YAML — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (document === null || document === undefined) {
    throw new Error(`${path}: 設定が空です / the config file is empty`);
  }
  if (typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(
      `${path}: トップレベルはマッピングである必要があります / the top level must be a mapping`,
    );
  }

  const expanded = expand(camelizeKeys(document), env, path, '') as Record<string, unknown>;
  const { storage, port, liffId, logFormat, ...rest } = aliases(expanded, path);

  if (storage !== undefined && typeof storage !== 'string') {
    throw new Error(`${path}: storage は文字列である必要があります / storage must be a string`);
  }
  if (port !== undefined && (typeof port !== 'number' || !Number.isInteger(port))) {
    throw new Error(`${path}: port は整数である必要があります / port must be an integer`);
  }
  if (liffId !== undefined && typeof liffId !== 'string') {
    throw new Error(`${path}: liff_id は文字列である必要があります / liff_id must be a string`);
  }
  if (logFormat !== undefined && logFormat !== 'text' && logFormat !== 'json') {
    throw new Error(
      `${path}: log_format は "text" か "json" です / log_format must be "text" or "json"`,
    );
  }

  // `dev: true` mounts the /dev relying party, which logs in through clients of
  // its own. The environment path adds them in `configFromEnv`; do the same here
  // so `dev: true` alone is enough and nobody has to copy the dev client IDs in.
  if (rest.dev === true && typeof rest.issuer === 'string') {
    const clients = (Array.isArray(rest.clients) ? rest.clients : []) as Parameters<
      typeof withDevClients
    >[0];
    rest.clients = withDevClients(clients, rest.issuer);
  }
  // As on the environment path: no `cookie_keys` is fine for a first run (one is
  // generated), it just cannot survive a restart or a second process. Missing
  // `jwks` is the same trade-off and `firstRunChecks` already says so out loud.
  if (rest.cookieKeys === undefined) rest.cookieKeys = [randomToken(32)];

  // parseConfig throws with the field paths already spelled out; prefix the file
  // name so a boot failure says which file to open.
  try {
    parseConfig(rest as RenkeiConfigInput);
  } catch (err) {
    throw new Error(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    config: rest as RenkeiConfigInput,
    path,
    ...(storage !== undefined ? { storage } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(liffId !== undefined ? { liffId } : {}),
    ...(logFormat !== undefined ? { logFormat } : {}),
  };
}

/** Every `${VAR}` name the file references, so the boot banner does not call them ignored. */
export function referencedEnvVars(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(REFERENCE)) {
    if (m[1]) names.add(m[1]);
  }
  return [...names];
}

// ── key spelling ────────────────────────────────────────────────────────────

/** `jwks` members are JWK parameter names (`key_ops`, `x5c`, …) — not ours to rewrite. */
const OPAQUE_KEYS = new Set(['jwks']);

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    out[camel] = OPAQUE_KEYS.has(camel) ? v : camelizeKeys(v);
  }
  return out;
}

/**
 * The spellings the file has that the schema does not: `channels[].id` /
 * `.secret` (shorter, and what a channel is called in the LINE console), and
 * `messaging:` as a single mapping instead of a one-entry `messaging_channels`.
 * `cookie_keys` and `jwks` additionally accept a string, so both can be a
 * single `${VAR}` holding what the environment variable holds.
 */
function aliases(input: Record<string, unknown>, path: string): Record<string, unknown> {
  const out = { ...input };

  if (Array.isArray(out.channels)) {
    out.channels = out.channels.map((c: unknown) => channelAliases(c));
  }

  if (out.messaging !== undefined) {
    if (out.messagingChannels !== undefined) {
      throw new Error(
        `${path}: messaging と messaging_channels の両方は指定できません / set either messaging or messaging_channels, not both`,
      );
    }
    out.messagingChannels = [messagingAliases(out.messaging)];
    delete out.messaging;
  } else if (out.messagingChannels !== undefined && Array.isArray(out.messagingChannels)) {
    out.messagingChannels = out.messagingChannels.map((m: unknown) => messagingAliases(m));
  }

  if (typeof out.cookieKeys === 'string') {
    out.cookieKeys = out.cookieKeys
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof out.jwks === 'string') {
    try {
      out.jwks = JSON.parse(out.jwks);
    } catch {
      throw new Error(
        `${path}: jwks が JSON として解釈できません / jwks is a string but not valid JSON — give a list, or a \${VAR} holding what RENKEI_JWKS holds`,
      );
    }
  }
  return out;
}

function channelAliases(channel: unknown): unknown {
  if (channel === null || typeof channel !== 'object' || Array.isArray(channel)) return channel;
  const c = { ...(channel as Record<string, unknown>) };
  if (c.id !== undefined && c.channelId === undefined) c.channelId = c.id;
  if (c.secret !== undefined && c.channelSecret === undefined) c.channelSecret = c.secret;
  delete c.id;
  delete c.secret;
  // The console shows channel IDs as digits; YAML would read an unquoted one as
  // a number, and every comparison downstream is on strings.
  if (typeof c.channelId === 'number') c.channelId = String(c.channelId);
  return c;
}

function messagingAliases(messaging: unknown): unknown {
  if (messaging === null || typeof messaging !== 'object' || Array.isArray(messaging)) {
    return messaging;
  }
  const m = { ...(messaging as Record<string, unknown>) };
  if (m.secret !== undefined && m.channelSecret === undefined) m.channelSecret = m.secret;
  delete m.secret;
  if (typeof m.channelId === 'number') m.channelId = String(m.channelId);
  return m;
}

// ── ${VAR} expansion ────────────────────────────────────────────────────────

/** `$${` is a literal `${`; `${VAR}` and `${VAR:-fallback}` read the environment. */
const REFERENCE = /\$\$\{|\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

function expand(value: unknown, env: EnvLike, path: string, at: string): unknown {
  if (Array.isArray(value)) return value.map((v, i) => expand(v, env, path, `${at}[${i}]`));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = expand(v, env, path, at ? `${at}.${key}` : key);
    }
    return out;
  }
  if (typeof value !== 'string') return value;
  return value.replace(REFERENCE, (match, name?: string, fallback?: string) => {
    if (name === undefined) return '${';
    const found = env[name];
    if (found) return found;
    if (fallback !== undefined) return fallback;
    throw new Error(
      `${path}: ${at || '(root)'} は環境変数 ${name} を参照していますが設定されていません / references \${${name}}, which is not set${
        match === value ? '' : ` (in "${value}")`
      }`,
    );
  });
}
