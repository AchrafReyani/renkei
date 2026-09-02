import type { AnchorHTMLAttributes, CSSProperties } from 'react';
import { LINE_ICON_DATA_URI } from './line-icon.js';

/**
 * A LINE Login button that follows LINE's design guideline
 * (https://developers.line.biz/en/docs/line-login/login-button/):
 * base `#06C755`, hover = 10 % black overlay, press = 30 % black overlay,
 * white text, the official LINE icon (unmodified, embedded) separated by an
 * 8 % black vertical line, side padding ≥ the speech-bubble width; the
 * disabled state is white with `#1E1E1E` at 20 % and a 60 % `#E5E5E5` border.
 *
 * It is a plain `<a>` with no hooks, so it renders in Server and Client
 * Components alike. Styles ship inline as a hoisted `<style>` (deduplicated
 * by React 19; harmlessly repeated on React 18).
 */
export interface LineLoginButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> {
  /** The login route. Default `/api/renkei/login`. */
  href?: string;
  /** Where to land after login (`return_to`). */
  returnTo?: string;
  /** Friend-add prompt (`bot_prompt`). */
  botPrompt?: 'aggressive' | 'normal' | 'none';
  /** `'ja'` → 「LINEでログイン」, `'en'` → "Log in with LINE". Default `'ja'`. */
  locale?: 'ja' | 'en';
  /** Custom text. Must say clearly that this logs the user in with LINE; no line breaks. */
  label?: string;
  /** Height: `'md'` = 44 px (default), `'sm'` = 32 px. */
  size?: 'md' | 'sm';
  /** Icon only, no text (allowed by the guideline). */
  iconOnly?: boolean;
  disabled?: boolean;
}

const LABELS = { ja: 'LINEでログイン', en: 'Log in with LINE' } as const;

export const LINE_GREEN = '#06C755';

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

export function LineLoginButton({
  href = '/api/renkei/login',
  returnTo,
  botPrompt,
  locale = 'ja',
  label,
  size = 'md',
  iconOnly = false,
  disabled = false,
  className,
  style,
  ...rest
}: LineLoginButtonProps) {
  const text = label ?? LABELS[locale];
  const q = new URLSearchParams();
  if (returnTo) q.set('return_to', returnTo);
  if (botPrompt) q.set('bot_prompt', botPrompt);
  const target = q.size > 0 ? `${href}${href.includes('?') ? '&' : '?'}${q}` : href;
  const classes = [
    'rk-line-login',
    size === 'sm' ? 'rk-line-login--sm' : '',
    disabled ? 'rk-line-login--disabled' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const inlineStyle: CSSProperties | undefined = style;

  return (
    <>
      <style href="renkei-next/line-login-button" precedence="renkei">
        {CSS}
      </style>
      <a
        {...rest}
        className={classes}
        style={inlineStyle}
        {...(disabled ? { role: 'link', 'aria-disabled': true, tabIndex: -1 } : { href: target })}
        {...(iconOnly ? { 'aria-label': text } : {})}
      >
        <span className="rk-line-login__icon" aria-hidden="true">
          {/* biome-ignore lint/performance/noImgElement: an embedded data URI; next/image would tie a framework-agnostic component to Next */}
          <img src={LINE_ICON_DATA_URI} alt="" width={44} height={44} />
        </span>
        {iconOnly ? null : <span className="rk-line-login__label">{text}</span>}
      </a>
    </>
  );
}
