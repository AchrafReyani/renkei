import { isFriend, isLinked } from 'renkei-next';
import { renkei } from '@/renkei';

// proxy.ts already redirected anonymous visitors, so getSession() is non-null here
// in practice; the check keeps the page correct if the guard is removed.
export default async function Account() {
  const session = await renkei.getSession();
  if (!session) {
    return (
      <main>
        <p>
          ログインしていません → <a href={renkei.loginPath('/account')}>ログイン</a>
        </p>
      </main>
    );
  }
  return (
    <main>
      <h1>アカウント / Account</h1>
      <ul>
        <li>LINE user ID: {session['line:user_id']}</li>
        <li>友だち / friend: {String(isFriend(session))}</li>
        <li>アカウント連携 / linked: {String(isLinked(session))}</li>
        <li>region: {session['line:region']}</li>
      </ul>
      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify(session, null, 2)}
      </pre>
      <p>
        <a href="/">トップ</a> · <a href={renkei.logoutPath('/')}>ログアウト / Log out</a>
      </p>
    </main>
  );
}
