import { auth, signIn, signOut } from '@/auth';

export default async function Page() {
  const session = await auth();
  if (!session) {
    return (
      <main>
        <h1>renkei × Next.js</h1>
        <p>Auth.js の汎用 OIDC プロバイダーで renkei にログインします。</p>
        <form
          action={async () => {
            'use server';
            await signIn('renkei');
          }}
        >
          <button type="submit">LINEでログイン</button>
        </form>
      </main>
    );
  }
  const line = (session as typeof session & { line?: unknown }).line;
  return (
    <main>
      <h1>ログイン中 / Signed in</h1>
      <p>{session.user?.name}</p>
      <pre>{JSON.stringify({ user: session.user, line }, null, 2)}</pre>
      <form
        action={async () => {
          'use server';
          await signOut();
        }}
      >
        <button type="submit">ログアウト</button>
      </form>
    </main>
  );
}
