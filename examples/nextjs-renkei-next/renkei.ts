import { createRenkeiAuth } from 'renkei-next';

/**
 * One instance for the whole app: route handlers, proxy guard and getSession()
 * all hang off it. renkei is the OIDC provider; this app is a confidential client
 * registered with
 *   npx renkei add-client my-next-app --redirect http://localhost:3500/api/renkei/callback --preset next
 *
 * Values come from .env.local (see .env.example). The fallbacks only exist so
 * `next build` succeeds without one — set real values before deploying.
 */
export const renkei = createRenkeiAuth({
  issuer: process.env.RENKEI_ISSUER ?? 'http://localhost:8787',
  clientId: process.env.RENKEI_CLIENT_ID ?? 'my-next-app',
  clientSecret: process.env.RENKEI_CLIENT_SECRET,
  secret: process.env.RENKEI_NEXT_SECRET ?? 'example-only-dev-secret-change-me-before-deploying',
  botPrompt: 'normal',
});
