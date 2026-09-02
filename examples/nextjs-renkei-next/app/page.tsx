import { LineLoginButton } from 'renkei-next/button';
import { renkei } from '@/renkei';

export default async function Page() {
  const session = await renkei.getSession();
  if (!session) {
    return (
      <main>
        <h1>renkei × Next.js（renkei-next）</h1>
        <p>
          Auth.js なし。renkei-next のルートハンドラと暗号化セッションクッキーでログインします。
        </p>
        <p style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <LineLoginButton returnTo="/account" />
          <LineLoginButton locale="en" size="sm" botPrompt="none" returnTo="/account" />
          <LineLoginButton iconOnly returnTo="/account" />
        </p>
        <p>
          <a href="/account">/account</a> は proxy.ts
          で保護されています（未ログインならログインへ）。
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>ログイン中 / Signed in</h1>
      <p>{session.name}</p>
      <p>
        <a href="/account">アカウント / account</a> ·{' '}
        <a href={renkei.logoutPath('/')}>ログアウト</a>
      </p>
    </main>
  );
}
