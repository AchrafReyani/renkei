// Target 2: Deno 2 (what Supabase Edge Functions run). Uses Deno's npm: compat.
import Provider from 'npm:oidc-provider@9.11.5';
import { config } from './provider-config.mjs';
const issuer = 'http://localhost:43998';
const provider = new Provider(issuer, config);
const server = provider.listen(43998);
try {
  const disc = await fetch(`${issuer}/.well-known/openid-configuration`);
  const body = await disc.json();
  const jwks = await fetch(body.jwks_uri);
  const jwksBody = await jwks.json();
  console.log(JSON.stringify({ target: 'deno', deno: Deno.version.deno, discovery: disc.status, endpoints: Object.keys(body).length, jwks: jwks.status, keys: jwksBody.keys?.length }));
} finally { server.close(); }
