---
"renkei-server": minor
---

The LINE Login button, framework-free. `lineLoginButton({ href, locale?, label?, size?, iconOnly?, disabled?, className? })` returns an `<a>` as an HTML string and `lineLoginButtonCss()` the stylesheet it needs, both following LINE's design guideline — brand green `#06C755`, the official icon embedded unmodified, the 10 % / 30 % black hover and press overlays, and a disabled state that is genuinely unreachable rather than merely grey. No framework, no build step, so a hand-written login page can be compliant out of the box.

renkei's own `/dev` page now uses it: the real login entry points are guideline buttons (one per Login channel when several regions are configured, so `line_region` routing is still reachable), while the `bot_prompt` and scope knobs stay plain links — they are test controls, and a wall of identical green buttons is not what the guideline is for. Closes #19 for `/dev`; `examples/nextjs` keeps its plain submit button, since it demonstrates Auth.js and pulling in `renkei-next` would defeat that.

The React component in `renkei-next/button` is unchanged. It cannot import this one (`renkei-server` is a devDependency there, and the dependency runs the other way), so the icon and CSS exist twice — `packages/next/test` now asserts the two icons are byte-equal and the guideline CSS rules match, because the guideline requires the icon unmodified and a silent drift would make one copy non-compliant.
