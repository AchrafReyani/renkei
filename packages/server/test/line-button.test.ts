/**
 * The framework-free guideline button, and the `/dev` page that renders it.
 * The rules being pinned come from LINE's design guideline
 * (https://developers.line.biz/en/docs/line-login/login-button/) — the icon
 * unmodified, the brand green, and a disabled state that is not clickable.
 */
import { createMemoryStorage } from 'renkei-core';
import { describe, expect, it } from 'vitest';
import { createRenkei } from '../src/app.js';
import {
  LINE_GREEN,
  LINE_ICON_DATA_URI,
  lineLoginButton,
  lineLoginButtonCss,
} from '../src/line-button.js';

const ISSUER = 'http://renkei.test';
const JP = { channelId: '1', channelSecret: 'jp-channel-secret-0123456789', region: 'jp' };
const TW = { channelId: '2', channelSecret: 'tw-channel-secret-0123456789', region: 'tw' };

function config(channels = [JP]) {
  return {
    issuer: ISSUER,
    dev: true,
    channels,
    clients: [
      {
        clientId: 'renkei-dev',
        clientSecret: 'renkei-dev-secret',
        redirectUris: [`${ISSUER}/dev/callback`],
      },
    ],
    cookieKeys: ['cookie-key-at-least-16-chars'],
  };
}

describe('lineLoginButton', () => {
  it('renders a link carrying the unmodified official icon', () => {
    const html = lineLoginButton({ href: '/login' });
    expect(html).toContain('href="/login"');
    expect(html).toContain(LINE_ICON_DATA_URI);
    expect(html).toContain('LINEでログイン');
    expect(html).toContain('class="rk-line-login"');
  });

  it('uses LINE’s brand green and the guideline overlays', () => {
    const css = lineLoginButtonCss();
    expect(LINE_GREEN).toBe('#06C755');
    expect(css).toContain(`background:${LINE_GREEN}`);
    // hover = 10 % black, press = 30 % black, over the green rather than a new colour.
    expect(css).toContain('.rk-line-login:hover::after{opacity:.1}');
    expect(css).toContain('.rk-line-login:active::after{opacity:.3}');
  });

  it('takes a locale, a custom label and the small size', () => {
    expect(lineLoginButton({ href: '/l', locale: 'en' })).toContain('Log in with LINE');
    expect(lineLoginButton({ href: '/l', label: 'つづける' })).toContain('つづける');
    expect(lineLoginButton({ href: '/l', size: 'sm' })).toContain('rk-line-login--sm');
  });

  it('labels an icon-only button for screen readers, since the text is gone', () => {
    const html = lineLoginButton({ href: '/l', iconOnly: true, locale: 'en' });
    expect(html).toContain('aria-label="Log in with LINE"');
    expect(html).not.toContain('rk-line-login__label');
  });

  it('makes a disabled button unreachable rather than merely grey', () => {
    const html = lineLoginButton({ href: '/l', disabled: true });
    expect(html).not.toContain('href=');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it('escapes the href and the label', () => {
    const html = lineLoginButton({
      href: '/l?a=1&b="x"',
      label: '<script>alert(1)</script>',
    });
    expect(html).toContain('href="/l?a=1&amp;b=&quot;x&quot;"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('/dev renders the guideline button', () => {
  it('shows one button for the default login, with the stylesheet', async () => {
    const renkei = await createRenkei({ config: config(), storage: createMemoryStorage() });
    const html = await (await renkei.app.request(`${ISSUER}/dev`)).text();
    expect(html).toContain('class="rk-line-login"');
    expect(html).toContain(`background:${LINE_GREEN}`);
    // `base` is the issuer's path prefix, empty for a root-mounted issuer.
    expect(html).toContain('href="/dev/login"');
    expect((html.match(/class="rk-line-login"/g) ?? []).length).toBe(1);
    // The bot_prompt / scope knobs stay plain links — they are test controls.
    expect(html).toContain('/dev/login?bot_prompt=normal');
    expect(html).toContain('rk-variants');
  });

  it('shows one button per Login channel when several regions are configured', async () => {
    const renkei = await createRenkei({ config: config([JP, TW]), storage: createMemoryStorage() });
    const html = await (await renkei.app.request(`${ISSUER}/dev`)).text();
    expect((html.match(/class="rk-line-login"/g) ?? []).length).toBe(2);
    expect(html).toContain('line_region=jp');
    expect(html).toContain('line_region=tw');
    expect(html).toContain('channel 1');
    expect(html).toContain('channel 2');
  });
});
