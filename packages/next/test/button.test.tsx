import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LINE_GREEN, LineLoginButton } from '../src/button.js';
import { LINE_ICON_DATA_URI } from '../src/line-icon.js';

/** The rendered anchor without the hoisted <style> (whose CSS text mentions class names and href). */
const anchor = (html: string) => html.slice(html.indexOf('</style>'));

describe('<LineLoginButton />', () => {
  it('renders a guideline-coloured link to the login route with the official icon and Japanese label', () => {
    const html = renderToStaticMarkup(<LineLoginButton />);
    expect(html).toContain('href="/api/renkei/login"');
    expect(html).toContain(LINE_GREEN);
    expect(LINE_GREEN).toBe('#06C755');
    expect(html).toContain('LINEでログイン');
    expect(html).toContain(`src="${LINE_ICON_DATA_URI}"`);
    expect(LINE_ICON_DATA_URI.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    // hover / press overlays and the 8 % separator from the guideline
    expect(html).toMatch(/:hover::after\{opacity:\.1\}/);
    expect(html).toMatch(/:active::after\{opacity:\.3\}/);
    expect(html).toContain('rgba(0,0,0,.08)');
  });

  it('builds return_to / bot_prompt into the href, supports English, custom text, sm and icon-only', () => {
    const html = renderToStaticMarkup(
      <LineLoginButton
        href="/auth/login"
        returnTo="/account?tab=1"
        botPrompt="none"
        locale="en"
        size="sm"
      />,
    );
    expect(html).toContain('href="/auth/login?return_to=%2Faccount%3Ftab%3D1&amp;bot_prompt=none"');
    expect(html).toContain('Log in with LINE');
    expect(html).toContain('rk-line-login--sm');

    expect(renderToStaticMarkup(<LineLoginButton label="LINEで続ける" />)).toContain(
      'LINEで続ける',
    );

    const iconOnly = renderToStaticMarkup(<LineLoginButton iconOnly locale="en" />);
    expect(anchor(iconOnly)).not.toContain('rk-line-login__label');
    expect(iconOnly).toContain('aria-label="Log in with LINE"');
  });

  it('disabled: no href, aria-disabled, white/grey styling', () => {
    const html = renderToStaticMarkup(<LineLoginButton disabled />);
    expect(anchor(html)).not.toContain('href=');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('rk-line-login--disabled');
    expect(html).toContain('rgba(30,30,30,.2)');
    expect(html).toContain('rgba(229,229,229,.6)');
  });

  it('passes through anchor attributes and merges className', () => {
    const html = renderToStaticMarkup(
      <LineLoginButton className="mine" id="login" data-testid="line" target="_self" />,
    );
    expect(html).toContain('class="rk-line-login mine"');
    expect(html).toContain('id="login"');
    expect(html).toContain('data-testid="line"');
  });
});
