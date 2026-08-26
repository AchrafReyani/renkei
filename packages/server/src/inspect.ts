import { Hono } from 'hono';
import type { Storage } from 'renkei-core';
import type { RenkeiConfig } from './config.js';

/**
 * Read-only inspection endpoints under `/inspect`, mounted only when
 * `config.adminToken` is set. Everything is gated on that token (Bearer).
 * This is a debugging aid — look up an identity, see its LINE accounts and
 * friendship/link state, glance at recent webhooks — not an admin console:
 * nothing here mutates state, and there is deliberately no "list all users".
 */

export interface WebhookLogEntry {
  /** When renkei received it (ms since epoch, supplied by the caller). */
  at: number;
  type: string;
  userId?: string | undefined;
  /** For accountLink events. */
  result?: string | undefined;
  /** Whether the signature verified (false entries are rejected requests). */
  verified: boolean;
}

export interface WebhookLog {
  record(entry: WebhookLogEntry): void;
  recent(): WebhookLogEntry[];
}

/**
 * A fixed-size in-memory ring of the most recent webhook events. Per-process
 * and non-persistent (lost on restart, not shared across instances) — enough
 * to answer "did that follow arrive?" without a storage schema for it.
 */
export function createWebhookLog(cap = 50): WebhookLog {
  const buf: WebhookLogEntry[] = [];
  return {
    record(entry) {
      buf.push(entry);
      if (buf.length > cap) buf.shift();
    },
    recent() {
      return [...buf].reverse();
    },
  };
}

/** Constant-time string comparison, so token checks don't leak length/prefix. */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] as number) ^ (y[i] as number);
  return diff === 0;
}

export interface InspectDeps {
  config: RenkeiConfig;
  storage: Storage;
  webhookLog: WebhookLog;
}

export function inspectRoutes(deps: InspectDeps): Hono {
  const { config, storage, webhookLog } = deps;
  const app = new Hono();

  const regionOf = (channelId: string) =>
    config.channels.find((c) => c.channelId === channelId)?.region;

  // Bearer admin-token gate on the data API. The HTML shell itself carries no
  // data, so it is served without auth and asks the viewer for the token.
  app.use('/api/*', async (c, next) => {
    const adminToken = config.adminToken;
    if (!adminToken) return c.json({ error: 'not_configured' }, 404);
    const authorization = c.req.header('authorization');
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!bearer || !safeEqual(bearer, adminToken)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });

  const shape = async (sub: string) => {
    const identity = await storage.identities.findIdentity(sub);
    if (!identity) return undefined;
    const accounts = await storage.identities.listLineAccounts(sub);
    return {
      identity,
      linked: accounts.some((a) => a.kind === 'messaging'),
      accounts: accounts.map((a) => ({
        channelId: a.channelId,
        region: regionOf(a.channelId),
        lineUserId: a.lineUserId,
        kind: a.kind,
        friend: a.friend,
        friendCheckedAt: a.friendCheckedAt,
        updatedAt: a.updatedAt,
      })),
    };
  };

  app.get('/api/identity/:sub', async (c) => {
    const data = await shape(c.req.param('sub'));
    if (!data) return c.json({ error: 'not_found' }, 404);
    return c.json(data);
  });

  app.get('/api/line/:channelId/:userId', async (c) => {
    const identity = await storage.identities.findIdentityByLineAccount(
      c.req.param('channelId'),
      c.req.param('userId'),
    );
    if (!identity) return c.json({ error: 'not_found' }, 404);
    return c.json(await shape(identity.sub));
  });

  app.get('/api/webhooks', (c) => c.json({ events: webhookLog.recent() }));

  app.get('/', (c) => c.html(INSPECT_HTML));

  return app;
}

/**
 * Self-contained inspection page. Carries no data or secret: it prompts for the
 * admin token (kept in localStorage on the viewer's machine) and calls the
 * `/inspect/api/*` endpoints with a Bearer header via fetch.
 */
const INSPECT_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>renkei inspect</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.3rem; } h2 { font-size: 1rem; margin-top: 1.5rem; }
  input { font: inherit; padding: .4rem .5rem; border: 1px solid #8888; border-radius: .3rem; }
  button { font: inherit; padding: .4rem .8rem; border-radius: .3rem; border: 1px solid #8886; cursor: pointer; }
  .row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: .5rem 0; }
  .row input { flex: 1; min-width: 12rem; }
  pre { background: #8881; padding: 1rem; border-radius: .4rem; overflow-x: auto; }
  .muted { color: #888; font-size: .85rem; }
</style>
<h1>renkei inspect <span class="muted">read-only</span></h1>
<p class="muted">識別子の参照専用ツール。データは保存されません。 / Read-only lookup. The admin token stays in this browser.</p>
<div class="row">
  <input id="token" type="password" placeholder="admin token" autocomplete="off">
  <button onclick="saveToken()">保存 / Save token</button>
</div>
<h2>Identity by sub</h2>
<div class="row"><input id="sub" placeholder="sub"><button onclick="bySub()">Look up</button></div>
<h2>Identity by LINE account</h2>
<div class="row">
  <input id="channelId" placeholder="channelId">
  <input id="userId" placeholder="LINE userId">
  <button onclick="byLine()">Look up</button>
</div>
<h2>Recent webhooks</h2>
<div class="row"><button onclick="webhooks()">Refresh</button></div>
<pre id="out">—</pre>
<script>
  const $ = (id) => document.getElementById(id);
  try { $('token').value = localStorage.getItem('renkei-inspect-token') || ''; } catch {}
  function saveToken() {
    try { localStorage.setItem('renkei-inspect-token', $('token').value); } catch {}
    $('out').textContent = 'token saved';
  }
  async function call(path) {
    $('out').textContent = 'loading…';
    try {
      const res = await fetch('api/' + path, { headers: { authorization: 'Bearer ' + $('token').value } });
      const text = await res.text();
      let body; try { body = JSON.stringify(JSON.parse(text), null, 2); } catch { body = text; }
      $('out').textContent = res.status + ' ' + res.statusText + '\\n' + body;
    } catch (e) { $('out').textContent = 'error: ' + e; }
  }
  const enc = encodeURIComponent;
  function bySub() { call('identity/' + enc($('sub').value)); }
  function byLine() { call('line/' + enc($('channelId').value) + '/' + enc($('userId').value)); }
  function webhooks() { call('webhooks'); }
</script>`;
