import type { ReactNode } from 'react';

export const metadata = { title: 'renkei × Next.js example' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body
        style={{ fontFamily: 'system-ui', maxWidth: '40rem', margin: '3rem auto', lineHeight: 1.6 }}
      >
        {children}
      </body>
    </html>
  );
}
