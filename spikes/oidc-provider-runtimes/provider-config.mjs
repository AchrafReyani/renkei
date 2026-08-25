// Shared minimal oidc-provider configuration used by every runtime target.
export const clients = [{
  client_id: 'spike',
  client_secret: 'spike-secret',
  redirect_uris: ['http://localhost:3000/cb'],
  grant_types: ['authorization_code'],
  response_types: ['code'],
}];
export const config = {
  clients,
  features: { devInteractions: { enabled: false } },
  // Static claims so we can see whether findAccount/claims plumbing works too.
  claims: { openid: ['sub'], profile: ['name'], line: ['line:user_id', 'line:friend'] },
  findAccount: async (_ctx, id) => ({ accountId: id, claims: async () => ({ sub: id, name: 'Spike', 'line:user_id': 'U123', 'line:friend': true }) }),
};
