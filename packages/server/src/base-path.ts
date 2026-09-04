/**
 * Path-prefixed issuers. renkei normally sits at the root of its host, but
 * some hosts put it under a path: Supabase Edge Functions serve a function at
 * `/functions/v1/<name>`, a reverse proxy may mount renkei at `/auth`. The
 * issuer then carries that path, every URL renkei builds must keep it, and
 * incoming requests carry it (or, behind a proxy that strips part of it, a
 * trailing piece of it) in front of renkei's own routes.
 */
import { Hono } from 'hono';

/** `/functions/v1/renkei` for `https://x.supabase.co/functions/v1/renkei`; `''` for a root issuer. */
export function issuerBasePath(issuer: URL): string {
  return issuer.pathname.replace(/\/+$/, '');
}

/**
 * Remove the base path from a request path. Accepts the full base path and
 * every trailing sub-path of it (`/functions/v1/renkei`, `/v1/renkei`, `/renkei`),
 * because gateways strip a leading part before the function sees the request —
 * Supabase hands its function `/<name>/…`. Returns undefined when the path does
 * not start with any of them (the request is then routed as is).
 */
export function stripBasePath(pathname: string, basePath: string): string | undefined {
  const segments = basePath.split('/').filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join('/')}`;
    if (pathname === candidate) return '/';
    if (pathname.startsWith(`${candidate}/`)) return pathname.slice(candidate.length);
  }
  return undefined;
}

/** Wrap an app so requests under `basePath` (or a trailing piece of it) reach it with the prefix removed. */
export function withBasePath(inner: Hono, basePath: string): Hono {
  const outer = new Hono();
  outer.all('*', async (c) => {
    const url = new URL(c.req.url);
    const stripped = stripBasePath(url.pathname, basePath);
    let request = c.req.raw;
    if (stripped !== undefined) {
      url.pathname = stripped;
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      request = new Request(url, {
        method: request.method,
        headers: request.headers,
        body: hasBody ? await request.arrayBuffer() : null,
      });
    }
    let executionCtx: unknown;
    try {
      executionCtx = c.executionCtx;
    } catch {
      executionCtx = undefined;
    }
    return inner.fetch(request, c.env, executionCtx as never);
  });
  return outer;
}
