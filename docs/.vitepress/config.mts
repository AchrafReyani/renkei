import { defineConfig } from 'vitepress';

/**
 * Docs site. Japanese is the root locale, English lives under /en/.
 * Sources stay where they are in the repo (README.md, docs/**.{ja,en}.md);
 * `rewrites` maps them onto the site's URL structure.
 */
export default defineConfig({
  srcDir: '..',
  srcExclude: [
    '**/node_modules/**',
    'packages/**',
    'examples/**',
    'spikes/**',
    'drafts/**',
    '.github/**',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    'docs/PLAN.md',
    'docs/DECISIONS.md',
    'docs/ARCHITECTURE.md',
    'docs/ROADMAP.md',
    'docs/LAUNCH.md',
    'docs/DEV_SETUP.md',
    'docs/SPIKE-*.md',
    'docs/DESIGN-*.md',
  ],
  rewrites: {
    'README.md': 'index.md',
    'README.en.md': 'en/index.md',
    'docs/:dir/:name.ja.md': ':dir/:name.md',
    'docs/:dir/:name.en.md': 'en/:dir/:name.md',
  },
  ignoreDeadLinks: true,
  title: 'renkei',
  description: 'LINEログインの「その先」を全部引き受ける、セルフホスト型IDブローカー',
  cleanUrls: true,
  locales: {
    root: {
      label: '日本語',
      lang: 'ja',
      themeConfig: {
        nav: [
          { text: 'ガイド', link: '/guides/line-console' },
          { text: 'チュートリアル', link: '/tutorials/supabase' },
          { text: 'リファレンス', link: '/reference/config' },
        ],
        sidebar: [
          { text: 'はじめに', items: [{ text: 'renkei とは', link: '/' }] },
          {
            text: 'ガイド',
            items: [
              { text: 'LINE Developers Console の準備', link: '/guides/line-console' },
              { text: 'Render にデプロイする（無料枠）', link: '/guides/deploy-render' },
              { text: 'Fly.io にデプロイする', link: '/guides/deploy-fly' },
            ],
          },
          {
            text: 'チュートリアル',
            items: [
              { text: 'Supabase', link: '/tutorials/supabase' },
              { text: 'Next.js（Auth.js）', link: '/tutorials/nextjs' },
              { text: 'アカウント連携', link: '/tutorials/account-linking' },
            ],
          },
          {
            text: 'リファレンス',
            items: [
              { text: '設定', link: '/reference/config' },
              { text: 'エンドポイントとクレーム', link: '/reference/endpoints' },
              { text: 'クライアント SDK（renkei-client）', link: '/reference/client' },
              { text: 'Next.js ヘルパー（renkei-next）', link: '/reference/next' },
            ],
          },
        ],
        outline: { label: '目次' },
        docFooter: { prev: '前へ', next: '次へ' },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guides/line-console' },
          { text: 'Tutorials', link: '/en/tutorials/supabase' },
          { text: 'Reference', link: '/en/reference/config' },
        ],
        sidebar: [
          { text: 'Introduction', items: [{ text: 'What is renkei', link: '/en/' }] },
          {
            text: 'Guides',
            items: [
              { text: 'LINE Developers Console', link: '/en/guides/line-console' },
              { text: 'Deploying to Render (free)', link: '/en/guides/deploy-render' },
              { text: 'Deploying to Fly.io', link: '/en/guides/deploy-fly' },
            ],
          },
          {
            text: 'Tutorials',
            items: [
              { text: 'Supabase', link: '/en/tutorials/supabase' },
              { text: 'Next.js (Auth.js)', link: '/en/tutorials/nextjs' },
              { text: 'Account linking', link: '/en/tutorials/account-linking' },
            ],
          },
          {
            text: 'Reference',
            items: [
              { text: 'Configuration', link: '/en/reference/config' },
              { text: 'Endpoints and claims', link: '/en/reference/endpoints' },
              { text: 'Client SDK (renkei-client)', link: '/en/reference/client' },
              { text: 'Next.js helpers (renkei-next)', link: '/en/reference/next' },
            ],
          },
        ],
      },
    },
  },
  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/AchrafReyani/renkei' }],
    search: { provider: 'local' },
    footer: {
      message: 'Apache-2.0. renkei は LINEヤフー株式会社とは無関係の個人プロジェクトです。 / Not affiliated with LY Corporation.',
    },
  },
});
