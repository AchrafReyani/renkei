import NextAuth from 'next-auth';

/**
 * renkei is a standard OIDC provider, so Auth.js needs nothing LINE-specific.
 * The `line` scope adds line:user_id / line:friend / line:channel_id / line:region.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: 'renkei',
      name: 'LINE',
      type: 'oidc',
      issuer: process.env.RENKEI_ISSUER,
      clientId: process.env.RENKEI_CLIENT_ID,
      clientSecret: process.env.RENKEI_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email line' } },
      profile(profile) {
        return {
          id: String(profile.sub),
          name: profile.name as string | undefined,
          email: profile.email as string | undefined,
          image: profile.picture as string | undefined,
        };
      },
    },
  ],
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.line = {
          userId: profile['line:user_id'],
          friend: profile['line:friend'],
          channelId: profile['line:channel_id'],
          region: profile['line:region'],
        };
      }
      return token;
    },
    session({ session, token }) {
      (session as typeof session & { line?: unknown }).line = token.line;
      return session;
    },
  },
});
