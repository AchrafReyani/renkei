// Target 1: Node 22 baseline. oidc-provider is designed for this; expected PASS.
import Provider from 'oidc-provider';
import { config } from './provider-config.mjs';
const issuer = 'http://localhost:43999';
const provider = new Provider(issuer, config);
const server = provider.listen(43999);
try {
  const disc = await fetch(`${issuer}/.well-known/openid-configuration`);
  const body = await disc.json();
  const jwks = await fetch(body.jwks_uri);
  const jwksBody = await jwks.json();
  console.log(JSON.stringify({ target: 'node', node: process.version, discovery: disc.status, endpoints: Object.keys(body).length, jwks: jwks.status, keys: jwksBody.keys?.length }));
} finally { server.close(); }
