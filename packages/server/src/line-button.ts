/**
 * A LINE Login button in plain HTML and CSS, following LINE's design guideline
 * (https://developers.line.biz/en/docs/line-login/login-button/): base
 * `#06C755`, hover = 10 % black overlay, press = 30 % black overlay, white
 * text, the official LINE icon unmodified and separated by an 8 % black
 * vertical line, side padding at least the width of the speech bubble; the
 * disabled state is white with `#1E1E1E` at 20 % and a 60 % `#E5E5E5` border.
 *
 * No framework, no build step: `lineLoginButtonCss()` once in the page and
 * `lineLoginButton()` per button. `/dev` uses it, and so can a hand-written
 * login page. React users want `<LineLoginButton />` from `renkei-next`, which
 * renders the same design from the same icon — `packages/next/test` keeps the
 * two icons byte-equal.
 *
 * Trademark: LINE and the LINE logo are trademarks of LY Corporation. The
 * guideline requires the icon unmodified, which is why it is embedded rather
 * than left to the caller.
 */

/** The official LINE icon from LINE's Login button template (DeskTop/2x/44dp/line_88.png). */
export const LINE_ICON_DATA_URI =
  'data:image/png;base64,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';

export const LINE_GREEN = '#06C755';

export interface LineLoginButtonOptions {
  /** Where the button links to. */
  href: string;
  /** `'ja'` → 「LINEでログイン」, `'en'` → "Log in with LINE". Default `'ja'`. */
  locale?: 'ja' | 'en';
  /** Custom text. Must say clearly that this logs the user in with LINE; no line breaks. */
  label?: string;
  /** Height: `'md'` = 44 px (default), `'sm'` = 32 px. */
  size?: 'md' | 'sm';
  /** Icon only, no text (allowed by the guideline). */
  iconOnly?: boolean;
  disabled?: boolean;
  /** Extra classes on the `<a>`, for layout only — do not restyle the button itself. */
  className?: string;
}

const LABELS = { ja: 'LINEでログイン', en: 'Log in with LINE' } as const;

/** The stylesheet the buttons need. Emit it once per page, inside `<style>`. */
export function lineLoginButtonCss(): string {
  return CSS;
}

const CSS = `
.rk-line-login{position:relative;display:inline-flex;align-items:stretch;box-sizing:border-box;height:44px;border-radius:8px;background:${LINE_GREEN};color:#fff;text-decoration:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP",sans-serif;font-weight:700;font-size:16px;line-height:1;overflow:hidden;vertical-align:middle;cursor:pointer;-webkit-tap-highlight-color:transparent}
.rk-line-login::after{content:"";position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .1s}
.rk-line-login:hover::after{opacity:.1}
.rk-line-login:active::after{opacity:.3}
.rk-line-login:focus-visible{outline:2px solid #1E1E1E;outline-offset:2px}
.rk-line-login__icon{display:flex;align-items:center;justify-content:center;width:44px;flex:none}
.rk-line-login__icon img{display:block;width:44px;height:44px}
.rk-line-login__label{display:flex;align-items:center;padding:0 24px;border-left:1px solid rgba(0,0,0,.08);white-space:nowrap}
.rk-line-login--sm{height:32px;border-radius:6px;font-size:14px}
.rk-line-login--sm .rk-line-login__icon{width:32px}
.rk-line-login--sm .rk-line-login__icon img{width:32px;height:32px}
.rk-line-login--sm .rk-line-login__label{padding:0 18px}
.rk-line-login--disabled{background:#fff;color:rgba(30,30,30,.2);border:1px solid rgba(229,229,229,.6);cursor:default;pointer-events:none}
.rk-line-login--disabled .rk-line-login__icon img{filter:brightness(0);opacity:.2}
.rk-line-login--disabled .rk-line-login__label{border-left-color:rgba(229,229,229,.6)}
`.trim();

/** One button, as an HTML string. Pair with `lineLoginButtonCss()`. */
export function lineLoginButton(options: LineLoginButtonOptions): string {
  const {
    href,
    locale = 'ja',
    label,
    size = 'md',
    iconOnly = false,
    disabled = false,
    className,
  } = options;
  const text = label ?? LABELS[locale];
  const classes = [
    'rk-line-login',
    size === 'sm' ? 'rk-line-login--sm' : '',
    disabled ? 'rk-line-login--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  // A disabled button must not be reachable: no href, out of the tab order.
  const link = disabled
    ? 'role="link" aria-disabled="true" tabindex="-1"'
    : `href="${escapeHtml(href)}"`;
  const labelled = iconOnly ? ` aria-label="${escapeHtml(text)}"` : '';
  const body = iconOnly ? '' : `<span class="rk-line-login__label">${escapeHtml(text)}</span>`;
  return (
    `<a class="${escapeHtml(classes)}" ${link}${labelled}>` +
    `<span class="rk-line-login__icon" aria-hidden="true">` +
    `<img src="${LINE_ICON_DATA_URI}" alt="" width="44" height="44"></span>` +
    `${body}</a>`
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
