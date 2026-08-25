// Spike 2: bypass node:http entirely. Feed Koa's (req, res) callback with a
// minimal shim built from node:stream / node:events, driven by Deno.serve.
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import Provider from 'npm:oidc-provider@9.11.5';

const ISSUER = 'http://127.0.0.1:54321/functions/v1/renkei-shim';
const provider = new Provider(ISSUER, {
  clients: [{ client_id: 'spike', client_secret: 'spike-secret', redirect_uris: ['http://localhost:3000/cb'] }],
  features: { devInteractions: { enabled: false } },
});
const handler = provider.callback();

function toNodeReq(req: Request, url: URL, body: Uint8Array) {
  const r: any = Readable.from([body]);
  r.method = req.method;
  r.url = url.pathname.replace(/^\/renkei-shim/, '') + url.search || '/';
  r.headers = Object.fromEntries([...req.headers].map(([k, v]) => [k.toLowerCase(), v]));
  r.headers['content-length'] = String(body.byteLength);
  r.httpVersion = '1.1'; r.httpVersionMajor = 1; r.httpVersionMinor = 1;
  r.socket = { encrypted: false, writable: true, readable: true, remoteAddress: '127.0.0.1', on() {}, once() {}, removeListener() {}, addListener() {}, setTimeout() {} };
  r.connection = r.socket;
  return r;
}

class FakeRes extends EventEmitter {
  statusCode = 200; statusMessage = ''; headersSent = false; finished = false; writableEnded = false; writableFinished = false;
  socket: any; chunks: Uint8Array[] = []; private h: Record<string, any> = {};
  resolve!: (r: Response) => void; done: Promise<Response>;
  constructor(socket: any) { super(); this.socket = socket; this.done = new Promise((res) => (this.resolve = res)); }
  getHeader(n: string) { return this.h[n.toLowerCase()]; }
  getHeaders() { return this.h; }
  getHeaderNames() { return Object.keys(this.h); }
  hasHeader(n: string) { return n.toLowerCase() in this.h; }
  setHeader(n: string, v: any) { this.h[n.toLowerCase()] = v; return this; }
  removeHeader(n: string) { delete this.h[n.toLowerCase()]; }
  writeHead(s: number, a?: any, b?: any) { this.statusCode = s; const hd = typeof a === 'object' ? a : b; if (hd && !Array.isArray(hd)) for (const k in hd) this.setHeader(k, hd[k]); this.headersSent = true; return this; }
  flushHeaders() { this.headersSent = true; }
  write(c: any) { this.chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : new Uint8Array(c)); return true; }
  end(c?: any) {
    if (c) this.write(c);
    this.finished = this.writableEnded = this.writableFinished = true; this.headersSent = true;
    const headers = new Headers();
    for (const [k, v] of Object.entries(this.h)) { if (Array.isArray(v)) v.forEach((x) => headers.append(k, String(x))); else if (v != null) headers.set(k, String(v)); }
    const len = this.chunks.reduce((n, x) => n + x.byteLength, 0);
    const out = new Uint8Array(len); let o = 0; for (const x of this.chunks) { out.set(x, o); o += x.byteLength; }
    this.resolve(new Response(len ? out : null, { status: this.statusCode, headers }));
    this.emit('finish'); this.emit('close');
    return this;
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const body = new Uint8Array(req.method === 'GET' || req.method === 'HEAD' ? 0 : await req.arrayBuffer());
    const nreq = toNodeReq(req, url, body);
    const nres = new FakeRes(nreq.socket);
    handler(nreq, nres);
    return await nres.done;
  } catch (e) {
    return Response.json({ shimError: String((e as any)?.stack || e) }, { status: 500 });
  }
});
