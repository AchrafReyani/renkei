/**
 * Bridge a WHATWG `Request` to a Node `(req, res)` handler and back to a
 * `Response`. This is what lets `oidc-provider` (Koa, Node-only) run under
 * Hono on any runtime — Node, Deno, Supabase edge-runtime, Workers.
 *
 * Proven in `spikes/supabase-edge-runtime`. Only the surface Koa and
 * oidc-provider actually touch is implemented; it is not a general shim.
 */
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

export type NodeHandler = (req: NodeRequestLike, res: NodeResponseLike) => unknown;
// biome-ignore lint/suspicious/noExplicitAny: shaped to satisfy Koa's duck typing, not Node's types
export type NodeRequestLike = any;
// biome-ignore lint/suspicious/noExplicitAny: same
export type NodeResponseLike = any;

export interface BridgeOptions {
  /**
   * Host to present to the handler (`Host` header). oidc-provider derives
   * absolute URLs from it, so it must be the issuer's host — not whatever
   * the upstream proxy used.
   */
  host: string;
  /** `https` | `http`, presented as `X-Forwarded-Proto`. Defaults to the request URL's scheme. */
  protocol?: string;
  /** Rewrite the path before handing it to the handler (e.g. strip a mount prefix). */
  path?: string;
  /**
   * Path the handler is mounted under (`/functions/v1/renkei` for a
   * path-prefixed issuer). Presented as Express-style `originalUrl` =
   * mountPath + url, which is how oidc-provider recovers its mount path when
   * it builds absolute URLs (discovery endpoints, interaction redirects, cookie
   * paths).
   */
  mountPath?: string;
  /** Remote address reported to the handler. */
  remoteAddress?: string;
}

/** Fake socket with the properties Koa reads (`encrypted`, `writable`, `remoteAddress`). */
function fakeSocket(encrypted: boolean, remoteAddress: string) {
  const s = new EventEmitter() as EventEmitter & Record<string, unknown>;
  s.encrypted = encrypted;
  s.writable = true;
  s.readable = true;
  s.remoteAddress = remoteAddress;
  s.setTimeout = () => s;
  s.setNoDelay = () => s;
  s.setKeepAlive = () => s;
  return s;
}

export async function toNodeRequest(
  request: Request,
  options: BridgeOptions,
): Promise<NodeRequestLike> {
  const url = new URL(request.url);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array(0);
  const protocol = options.protocol ?? url.protocol.replace(':', '');
  const req = Readable.from([body]) as NodeRequestLike;
  req.method = request.method;
  req.url = options.path !== undefined ? options.path + url.search : url.pathname + url.search;
  if (options.mountPath) req.originalUrl = options.mountPath + req.url;
  req.headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  // The issuer decides the public host and scheme. Koa (with `proxy` on) prefers
  // X-Forwarded-Host / X-Forwarded-Proto, and gateways set them to what *they*
  // saw (Supabase's Kong sends `127.0.0.1` without the port), so override both.
  req.headers.host = options.host;
  req.headers['x-forwarded-host'] = options.host;
  req.headers['x-forwarded-proto'] = protocol;
  if (hasBody) req.headers['content-length'] = String(body.byteLength);
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.socket = fakeSocket(protocol === 'https', options.remoteAddress ?? '127.0.0.1');
  req.connection = req.socket;
  return req;
}

export class NodeResponseBridge extends EventEmitter {
  statusCode = 200;
  statusMessage = '';
  headersSent = false;
  finished = false;
  writableEnded = false;
  writableFinished = false;
  readonly socket: unknown;
  readonly done: Promise<Response>;
  private resolve!: (r: Response) => void;
  private readonly chunks: Uint8Array[] = [];
  private readonly headers: Record<string, string | string[] | number> = {};

  constructor(socket: unknown) {
    super();
    this.socket = socket;
    this.done = new Promise<Response>((resolve) => {
      this.resolve = resolve;
    });
  }

  getHeader(name: string) {
    return this.headers[name.toLowerCase()];
  }
  getHeaders() {
    return this.headers;
  }
  getHeaderNames() {
    return Object.keys(this.headers);
  }
  hasHeader(name: string) {
    return name.toLowerCase() in this.headers;
  }
  setHeader(name: string, value: string | string[] | number) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  removeHeader(name: string) {
    delete this.headers[name.toLowerCase()];
  }
  writeHead(status: number, a?: unknown, b?: unknown) {
    this.statusCode = status;
    const hdrs = (typeof a === 'object' && a !== null ? a : b) as
      | Record<string, string | string[] | number>
      | undefined;
    if (hdrs && !Array.isArray(hdrs))
      for (const k of Object.keys(hdrs)) this.setHeader(k, hdrs[k] as string);
    this.headersSent = true;
    return this;
  }
  flushHeaders() {
    this.headersSent = true;
  }
  write(chunk: string | Uint8Array) {
    this.chunks.push(
      typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk),
    );
    return true;
  }
  end(chunk?: string | Uint8Array) {
    if (chunk) this.write(chunk);
    this.finished = this.writableEnded = this.writableFinished = this.headersSent = true;
    const headers = new Headers();
    for (const [k, v] of Object.entries(this.headers)) {
      if (Array.isArray(v)) for (const x of v) headers.append(k, String(x));
      else if (v !== undefined && v !== null) headers.set(k, String(v));
    }
    const len = this.chunks.reduce((n, c) => n + c.byteLength, 0);
    const body = new Uint8Array(len);
    let o = 0;
    for (const c of this.chunks) {
      body.set(c, o);
      o += c.byteLength;
    }
    const nullBody = this.statusCode === 204 || this.statusCode === 304 || len === 0;
    this.resolve(new Response(nullBody ? null : body, { status: this.statusCode, headers }));
    this.emit('finish');
    this.emit('close');
    return this;
  }
}

/** Run a Node-style handler for a fetch Request and get a fetch Response. */
export async function bridge(
  handler: NodeHandler,
  request: Request,
  options: BridgeOptions,
): Promise<Response> {
  const req = await toNodeRequest(request, options);
  const res = new NodeResponseBridge(req.socket);
  await handler(req, res);
  return res.done;
}

/**
 * For oidc-provider's `interactionDetails` / `interactionFinished`, which
 * take Node `(req, res)` and may or may not write to `res`. `done` resolves
 * once the handler ends the response.
 */
export async function nodePair(request: Request, options: BridgeOptions) {
  const req = await toNodeRequest(request, options);
  const bridged = new NodeResponseBridge(req.socket);
  return {
    req: req as IncomingMessage,
    res: bridged as unknown as ServerResponse,
    done: bridged.done,
  };
}
