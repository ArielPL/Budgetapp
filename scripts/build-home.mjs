// Builds www.yourofflinebudget.com: the homepage, one static page per language,
// plus the privacy and support pages, into dist-site/. Vercel runs this on the
// `website` branch (see vercel.json there), which is what `main` deploys.
//
// Designed by Ariel in Claude Design (2026-10-23). The export rendered itself in
// the browser through Claude Design's runtime, which could fetch React and Babel
// from unpkg.com. This renders the same layout ahead of time instead: plain
// HTML and CSS, no third-party code, readable without JavaScript. The texts stay
// in homepage/i18n/*.js, exactly as the design tool wrote them.
//
//   node scripts/build-home.mjs
//
// From 2 November 2026 the site is only this: the app itself is no longer a web
// app, and lives on the `development` branch and in the stores.

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const LANGS = [['en', 'English'], ['sv', 'Svenska'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português (Brasil)'], ['ru', 'Русский'], ['tr', 'Türkçe'], ['ja', '日本語'], ['zh', '简体中文']];
const SYMS = ['kr', '€', '$', '£', '¥', '₽', 'R$', '₹', '₺'];
const VIS = [
  { shot: '01-budget', tintBg: '#eaf3de', tintText: '#173404' },
  { shot: '02-actual', tintBg: '#faece7', tintText: '#4a1b0c' },
  { shot: '04-savings-plan', tintBg: '#e2f4fa', tintText: '#064a59' },
  { shot: '05-debt', tintBg: '#f0eefb', tintText: '#463a7a' },
  { shot: '06-wallet', tintBg: '#e1f5ee', tintText: '#04342c' },
];

// The translation files assign to window.YB_I18N and fire an event; run them
// in a sandbox that offers just that.
const sandbox = { window: { addEventListener() {}, dispatchEvent() {} }, Event: class {} };
vm.createContext(sandbox);
for (const [code] of LANGS) {
  vm.runInContext(readFileSync(new URL(`homepage/i18n/${code}.js`, ROOT), 'utf8'), sandbox);
}
for (const page of ['privacy', 'support']) {
  vm.runInContext(readFileSync(new URL(`homepage/pages/${page}.js`, ROOT), 'utf8'), sandbox);
}
const ALL = sandbox.window.YB_I18N;
const DOCS = { privacy: sandbox.window.YB_PRIVACY, support: sandbox.window.YB_SUPPORT };

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Each language has its own file: sv.html, privacy-sv.html, support-sv.html. */
const pageOf = (code, kind = '') => (kind ? `${kind}-${code}.html` : `${code}.html`);

const CSS = `
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:400 800;font-display:swap;src:url('assets/fonts/plus-jakarta-sans-latin.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212;}
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:400 800;font-display:swap;src:url('assets/fonts/plus-jakarta-sans-latin-ext.woff2') format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+1E00-1E9F,U+20A0-20AB,U+20AD-20C0;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.skip{position:absolute;left:16px;top:-80px;z-index:30;background:#20203a;color:#fff;padding:10px 16px;border-radius:999px;font-size:15px;font-weight:600}
.skip:focus{top:12px;color:#fff;text-decoration:none}
main:focus{outline:none}
.site-header{position:sticky;top:0;z-index:10;background:rgba(251,250,255,0.9);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid #ece9f5}
.site-bar{max-width:1440px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;gap:12px 24px;flex-wrap:wrap;font-size:15px;font-weight:600}
.site-logo{display:flex;align-items:center;gap:10px;color:#20203a;margin-right:auto}
.site-logo:hover{text-decoration:none;color:#20203a}
.site-logo span{font-weight:800;font-size:18px;letter-spacing:-0.01em}
.site-links{display:flex;align-items:center;gap:24px;white-space:nowrap}
.site-links a{color:#5d5972}
.site-cta{background:#7c3aed;color:#fff;padding:10px 18px;border-radius:999px;white-space:nowrap}
.site-cta:hover{color:#fff;text-decoration:none;background:#6d28d9}
.site-links .site-cta{display:none}
.lang-code{display:none}
#top{overflow-x:clip}
h1,h2,h3{overflow-wrap:break-word}
section[id]{scroll-margin-top:88px}
/* The one-line menu needs up to 1420px (Russian), hence the wider bar above.
   Below that the links get a row of their own, and the bar lines up with the
   page again. Down to 900px that row fits every language on one line. */
@media (max-width:1480px){
  .site-bar{max-width:1160px}
  .site-links{order:3;flex:1 0 100%;flex-wrap:wrap;gap:8px 24px}
  section[id]{scroll-margin-top:124px}
}
/* Narrower, the links wrap onto as many lines as they need, so every one stays
   in sight, and the header scrolls away with the page instead of covering it. */
@media (max-width:900px){
  .site-header{position:static}
  .site-links{gap:8px 20px}
  section[id]{scroll-margin-top:12px}
}
/* On a phone the language button shows just its code, and the app button moves
   to the end of the links, where there is room for it. */
@media (max-width:640px){
  .site-bar{padding:10px 16px;gap:0 14px;font-size:14px}
  .site-bar::after{content:'';order:2;flex-basis:100%}
  .site-links{margin-top:10px;gap:10px 18px}
  .site-bar>.site-cta{display:none}
  .site-links .site-cta{display:inline-block;padding:6px 14px;color:#fff}
  .lang>summary{padding:8px 12px}
  h1,h2,h3{hyphens:auto;-webkit-hyphens:auto}
  .lang-name{display:none}
  .lang-code{display:inline}
}
body{background:#fbfaff;color:#20203a;font-family:'Plus Jakarta Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:#7c3aed;text-decoration:none}
a:hover{color:#6d28d9;text-decoration:underline}
img{display:block}
.label{font-size:14px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.08em}
.h2{font-size:clamp(32px,4.5vw,46px);line-height:1.1;font-weight:800;letter-spacing:-0.025em;text-wrap:balance}
.store{display:flex;flex-direction:column;align-items:flex-start;background:#20203a;color:#fff;padding:11px 22px;border-radius:14px;min-width:170px;opacity:.82;cursor:default;user-select:none}
.store small{font-size:11px;font-weight:600;opacity:.8}
.store b{font-size:18px;font-weight:700}
.lang{position:relative}
.lang>summary{list-style:none;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #ece9f5;border-radius:999px;padding:9px 14px;font-size:14px;font-weight:600;color:#20203a;cursor:pointer}
.lang>summary::-webkit-details-marker{display:none}
.lang-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:20;min-width:220px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #ece9f5;border-radius:16px;padding:6px;box-shadow:0 20px 40px -16px rgba(32,32,58,.3);display:flex;flex-direction:column;gap:2px}
.lang-menu a{display:flex;justify-content:space-between;gap:12px;border-radius:10px;padding:10px 12px;font-size:15px;color:#20203a;font-weight:500}
.lang-menu a:hover{background:#f6f4fb;text-decoration:none}
.lang-menu a[aria-current]{background:#f0eefb;font-weight:700}
.lang-menu a[aria-current]::after{content:'✓';color:#7c3aed;font-weight:800}
.chip-link{background:#fff;color:#463a7a;font-size:14px;font-weight:600;padding:7px 12px;border-radius:999px}
.chip-link:hover{background:#e5e1f8;text-decoration:none;color:#463a7a}
.chip-link[aria-current]{outline:2px solid #7c3aed}
.faq{border-bottom:1px solid #ece9f5}
.faq>summary{list-style:none;cursor:pointer;padding:22px 0;display:flex;justify-content:space-between;align-items:center;gap:16px;font-size:18px;font-weight:700;color:#20203a}
.faq>summary::-webkit-details-marker{display:none}
.faq .sign{flex:none;width:32px;height:32px;border-radius:50%;background:#f6f4fb;color:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600}
.faq .sign::after{content:'+'}
.faq[open] .sign::after{content:'−'}
.faq p{font-size:16px;line-height:1.65;color:#5d5972;padding:0 48px 24px 0;text-wrap:pretty}
.phone{aspect-ratio:1186/2576;border:6px solid #20203a;overflow:hidden;background:#fff;box-shadow:0 30px 60px -24px rgba(32,32,58,.4)}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top}
`;

// Not links until the apps are in the stores (January 2027): each says when.
const storeButtons = t => `
      <span class="store"><small>${esc(t.store.soon)}</small><b>App Store</b></span>
      <span class="store"><small>${esc(t.store.soon)}</small><b>Google Play</b></span>`;

/** The same page in each language. */
const langLinks = (cls, code, kind = '') => LANGS.map(([c, n]) =>
  `<a class="${cls}" href="${pageOf(c, kind)}" hreflang="${c}" lang="${c}"${c === code ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('');

/** The header every page shares. The homepage links to its own sections; the
 *  privacy and support pages link back to it instead. */
const siteHeader = (t, code, kind = '') => `<a class="skip" href="#main">${esc(t.nav.skip)}</a>
<header class="site-header">
  <div class="site-bar">
    <a class="site-logo" href="${kind ? pageOf(code) : '#top'}">
      <img src="assets/icon.png" alt="" width="36" height="36" style="border-radius:10px;">
      <span>YourBudget</span>
    </a>
    <nav class="site-links">${kind ? `
      <a href="${pageOf(code)}">← YourBudget</a>` : `
      <a href="#features">${esc(t.nav.features)}</a>
      <a href="#devices">${esc(t.nav.devices)}</a>
      <a href="#start">${esc(t.nav.start)}</a>
      <a href="#faq">${esc(t.nav.faq)}</a>`}
      <a href="${pageOf(code, 'about')}"${kind === 'about' ? ' aria-current="page"' : ''}>${esc(t.nav.about)}</a>
      <a href="${pageOf(code, 'support')}"${kind === 'support' ? ' aria-current="page"' : ''}>${esc(t.footer.support)}</a>
      <a href="${pageOf(code, 'privacy')}"${kind === 'privacy' ? ' aria-current="page"' : ''}>${esc(t.footer.privacy)}</a>
      <a class="site-cta" href="${kind ? pageOf(code) : ''}#download">${esc(t.nav.download)}</a>
    </nav>
    <details class="lang">
      <summary aria-label="${esc(t.nav.langLabel)}: ${esc(LANGS.find(l => l[0] === code)[1])}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"></circle><path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5s-1.3 6.7-3.9 9.5c-2.6-2.8-3.9-6-3.9-9.5s1.3-6.7 3.9-9.5z"></path></svg>
        <span class="lang-name">${esc(LANGS.find(l => l[0] === code)[1])}</span><span class="lang-code">${code.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#5d5972" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 3.5l3 3 3-3"></path></svg>
      </summary>
      <div class="lang-menu">${langLinks('', code, kind)}</div>
    </details>
    <a class="site-cta" href="${kind ? pageOf(code) : ''}#download">${esc(t.nav.download)}</a>
  </div>
</header>`;

/** The footer every page shares. */
const siteFooter = (t, code, kind = '') => `<footer style="border-top:1px solid #ece9f5;">
  <div style="max-width:1160px;margin:0 auto;padding:28px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;font-size:14px;color:#6c687f;">
    <span>© 2026 YourBudget · yourofflinebudget.com</span>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <a href="#top">↑ ${esc(t.nav.toTop)}</a>${kind ? `
      <a href="${pageOf(code)}">YourBudget</a>` : ''}
      <a href="${pageOf(code, 'about')}">${esc(t.nav.about)}</a>
      <a href="${pageOf(code, 'privacy')}">${esc(t.footer.privacy)}</a>
      <a href="${pageOf(code, 'support')}">${esc(t.footer.support)}</a>
    </div>
  </div>
</footer>`;

function render(code) {
  const t = { ...ALL.en, ...ALL[code] };
  const features = t.features.map((f, i) => {
    const v = VIS[i];
    const textOrder = i % 2 ? 2 : 1;
    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:56px;align-items:center;">
      <div style="display:flex;flex-direction:column;gap:20px;order:${textOrder};">
        <span style="align-self:flex-start;background:${v.tintBg};color:${v.tintText};font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:0.06em;">${esc(f.tag)}</span>
        <h3 style="font-size:clamp(28px,3.5vw,38px);line-height:1.15;font-weight:800;letter-spacing:-0.02em;text-wrap:balance;">${esc(f.title)}</h3>
        <p style="font-size:18px;line-height:1.6;color:#5d5972;text-wrap:pretty;">${esc(f.body)}</p>
        <ul style="list-style:none;display:flex;flex-direction:column;gap:12px;">${f.points.map(p => `
          <li style="display:flex;gap:12px;align-items:flex-start;font-size:16px;line-height:1.5;"><span style="flex:none;width:8px;height:8px;border-radius:50%;background:#7c3aed;margin-top:8px;"></span><span>${esc(p)}</span></li>`).join('')}
        </ul>
      </div>
      <div style="display:flex;justify-content:center;padding:32px 0;border-radius:20px;background:${v.tintBg};order:${3 - textOrder};">
        <div class="phone" style="width:240px;border-radius:36px;"><img src="assets/shots/${v.shot}.jpg" alt="${esc(f.tag)}" loading="lazy" width="560" height="1216"></div>
      </div>
    </div>`;
  }).join('');

  return `<!doctype html>
<html lang="${esc(t.htmlLang || code)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.pageTitle)}</title>
<meta name="description" content="${esc(t.lead)}">
<link rel="icon" href="assets/icon.png">
${LANGS.map(([c]) => `<link rel="alternate" hreflang="${c}" href="${pageOf(c)}">`).join('\n')}
<!-- Generated by scripts/build-home.mjs from homepage/i18n/${code}.js. Edit those, not this. -->
<!-- No third-party resources of any kind: the fonts and images are served from here. -->
<style>${CSS}</style>
__REDIRECT__
</head>
<body>
<div style="min-height:100vh;background:#fbfaff;">

${siteHeader(t, code)}

<main id="main" tabindex="-1">
<section id="top" style="max-width:1160px;margin:0 auto;padding:72px 24px 88px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:56px;align-items:center;">
  <div style="display:flex;flex-direction:column;gap:28px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">${t.chips.map(c => `
      <span style="background:#eeedfe;color:#5b4bb3;font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c)}</span>`).join('')}
    </div>
    <h1 style="font-size:clamp(40px,6vw,64px);line-height:1.04;font-weight:800;letter-spacing:-0.03em;text-wrap:balance;">${esc(t.h1)}</h1>
    <p style="font-size:19px;line-height:1.55;color:#5d5972;max-width:520px;text-wrap:pretty;">${esc(t.lead)}</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">${storeButtons(t)}
    </div>
    <p style="font-size:14px;color:#6c687f;font-weight:600;">${esc(t.price)}</p>
  </div>
  <div style="position:relative;display:flex;justify-content:center;align-items:center;min-height:560px;">
    <div style="position:absolute;width:78%;aspect-ratio:1;border-radius:50%;background:#f0eefb;"></div>
    <div class="phone" style="position:absolute;transform:translateX(38%) rotate(6deg) scale(0.88);width:250px;border-width:7px;border-radius:38px;box-shadow:0 30px 60px -20px rgba(32,32,58,0.35);">
      <img src="assets/shots/02-actual.jpg" alt="" width="560" height="1216">
    </div>
    <div class="phone" style="position:relative;transform:translateX(-22%);width:260px;border-width:7px;border-radius:40px;box-shadow:0 40px 80px -24px rgba(32,32,58,0.45);">
      <img src="assets/shots/01-budget.jpg" alt="YourBudget" width="560" height="1216">
    </div>
  </div>
</section>

<section id="philosophy" style="background:#f0eefb;">
  <div style="max-width:860px;margin:0 auto;padding:clamp(72px,10vw,120px) 24px;display:flex;flex-direction:column;align-items:center;gap:32px;text-align:center;">
    <p class="label">${esc(t.phil.label)}</p>
    <blockquote style="font-size:clamp(24px,3.2vw,34px);line-height:1.45;font-weight:600;letter-spacing:-0.015em;text-wrap:pretty;">${esc(t.phil.quote)}</blockquote>
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="assets/icon.png" alt="" width="40" height="40" style="border-radius:11px;">
      <p style="font-size:16px;font-weight:700;color:#463a7a;text-align:left;">Ariel<span style="display:block;font-weight:500;font-size:14px;color:#5d5972;">${esc(t.phil.role)}</span></p>
    </div>
  </div>
</section>

<section id="devices" style="max-width:1160px;margin:0 auto;padding:96px 24px;display:flex;flex-direction:column;gap:48px;">
  <div style="display:flex;flex-direction:column;gap:14px;max-width:680px;">
    <p class="label">${esc(t.devices.label)}</p>
    <h2 class="h2">${esc(t.devices.title)}</h2>
    <p style="font-size:18px;line-height:1.6;color:#5d5972;text-wrap:pretty;">${esc(t.devices.body)}</p>
  </div>
  <div style="display:flex;justify-content:center;align-items:flex-end;gap:clamp(16px,3vw,36px);flex-wrap:wrap;background:#f0eefb;border-radius:28px;padding:clamp(28px,5vw,56px) clamp(16px,4vw,48px);">
    <div style="flex:1 1 420px;max-width:560px;display:flex;flex-direction:column;align-items:center;">
      <div style="width:100%;aspect-ratio:2560/1440;border:10px solid #20203a;border-bottom-width:14px;border-radius:16px 16px 4px 4px;overflow:hidden;background:#fff;">
        <img src="assets/shots/tab-savings.jpg" alt="" loading="lazy" width="1200" height="675" style="width:100%;height:100%;object-fit:cover;">
      </div>
      <div style="width:114%;height:12px;background:#c9c6d6;border-radius:0 0 14px 14px;"></div>
    </div>
    <div style="flex:0 1 200px;max-width:220px;aspect-ratio:2064/2752;border:8px solid #20203a;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 30px 60px -24px rgba(32,32,58,0.4);">
      <img src="assets/shots/ipad-budget.jpg" alt="" loading="lazy" width="560" height="747" style="width:100%;height:100%;object-fit:cover;object-position:top;">
    </div>
    <div class="phone" style="flex:0 1 110px;max-width:120px;border-width:5px;border-radius:22px;">
      <img src="assets/shots/03-questions.jpg" alt="" loading="lazy" width="560" height="1216">
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;">${t.devices.cards.map(d => `
    <div style="background:#fff;border:1px solid #ece9f5;border-radius:18px;padding:24px;display:flex;flex-direction:column;gap:6px;">
      <p style="font-size:17px;font-weight:700;">${esc(d.t)}</p>
      <p style="font-size:15px;line-height:1.5;color:#5d5972;">${esc(d.d)}</p>
    </div>`).join('')}
  </div>
</section>

<section id="features" style="background:#fff;border-top:1px solid #ece9f5;border-bottom:1px solid #ece9f5;">
  <div style="max-width:1160px;margin:0 auto;padding:96px 24px;display:flex;flex-direction:column;gap:112px;">
    <div style="display:flex;flex-direction:column;gap:14px;max-width:640px;">
      <p class="label">${esc(t.featuresHead.label)}</p>
      <h2 class="h2">${esc(t.featuresHead.title)}</h2>
    </div>
${features}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:20px;">
      <div style="background:#e2f4fa;border-radius:20px;padding:36px;display:flex;flex-direction:column;gap:14px;color:#064a59;">
        <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${esc(t.importC.label)}</span>
        <h3 style="font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;">${esc(t.importC.title)}</h3>
        <p style="font-size:16px;line-height:1.6;">${esc(t.importC.body)}</p>
      </div>
      <div style="background:#f0eefb;border-radius:20px;padding:36px;display:flex;flex-direction:column;gap:14px;color:#463a7a;">
        <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${esc(t.langC.label)}</span>
        <h3 style="font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;">${esc(t.langC.title)}</h3>
        <p style="font-size:13px;font-weight:700;margin-top:4px;">${esc(t.langC.langs)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${langLinks('chip-link', code)}</div>
        <p style="font-size:13px;font-weight:700;margin-top:8px;">${esc(t.langC.curs)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">${SYMS.map((sym, i) => `
          <span style="display:flex;align-items:center;gap:8px;background:#fff;font-size:14px;font-weight:600;padding:7px 12px;border-radius:999px;"><span style="font-weight:800;">${esc(sym)}</span><span>${esc(t.cur[i])}</span></span>`).join('')}
        </div>
      </div>
    </div>
  </div>
</section>

<section style="max-width:1160px;margin:0 auto;padding:96px 24px;">
  <div style="background:#20203a;border-radius:28px;padding:clamp(36px,6vw,72px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:48px;align-items:start;">
    <div style="display:flex;flex-direction:column;gap:16px;">
      <p class="label" style="color:#c4b5fd;">${esc(t.privacy.label)}</p>
      <h2 style="font-size:clamp(30px,4vw,42px);line-height:1.12;font-weight:800;letter-spacing:-0.025em;color:#fff;text-wrap:balance;">${esc(t.privacy.title)}</h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px;">${t.privacy.items.map(p => `
      <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid #475569;padding-top:16px;">
        <p style="font-size:17px;font-weight:700;color:#fff;">${esc(p.t)}</p>
        <p style="font-size:15px;line-height:1.55;color:#c8c6d8;">${esc(p.d)}</p>
      </div>`).join('')}
    </div>
  </div>
</section>

<section id="start" style="max-width:1160px;margin:0 auto;padding:16px 24px 96px;display:flex;flex-direction:column;gap:40px;">
  <div style="display:flex;flex-direction:column;gap:14px;max-width:640px;">
    <p class="label">${esc(t.start.label)}</p>
    <h2 class="h2">${esc(t.start.title)}</h2>
  </div>
  <ol style="list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:20px;">${t.start.steps.map((s, i) => `
    <li style="background:#fff;border:1px solid #ece9f5;border-radius:20px;padding:28px;display:flex;flex-direction:column;gap:14px;">
      <span style="width:40px;height:40px;border-radius:50%;background:#7c3aed;color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
      <p style="font-size:18px;font-weight:700;line-height:1.3;">${esc(s.title)}</p>
      <p style="font-size:15px;line-height:1.55;color:#5d5972;">${esc(s.body)}</p>
    </li>`).join('')}
  </ol>
</section>

<section id="faq" style="background:#fff;border-top:1px solid #ece9f5;border-bottom:1px solid #ece9f5;">
  <div style="max-width:820px;margin:0 auto;padding:96px 24px;display:flex;flex-direction:column;gap:40px;">
    <h2 class="h2">${esc(t.faqTitle)}</h2>
    <div style="border-top:1px solid #ece9f5;">${t.faq.map((q, i) => `
      <details class="faq"${i === 0 ? ' open' : ''}>
        <summary><span>${esc(q.q)}</span><span class="sign" aria-hidden="true"></span></summary>
        <p>${esc(q.a)}</p>
      </details>`).join('')}
    </div>
  </div>
</section>

<section id="download" style="max-width:1160px;margin:0 auto;padding:112px 24px;display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center;">
  <img src="assets/icon.png" alt="" width="96" height="96" style="border-radius:24px;box-shadow:0 20px 40px -16px rgba(32,32,58,0.4);">
  <h2 style="font-size:clamp(34px,5vw,52px);line-height:1.08;font-weight:800;letter-spacing:-0.03em;max-width:720px;text-wrap:balance;">${esc(t.dl.title)}</h2>
  <p style="font-size:18px;line-height:1.5;font-style:italic;color:#463a7a;">${esc(t.dl.verse)}<span style="display:block;font-style:normal;font-weight:700;font-size:14px;margin-top:6px;letter-spacing:0.04em;">${esc(t.dl.ref)}</span></p>
  <p style="font-size:18px;color:#5d5972;">${esc(t.dl.soon)}</p>
  <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">${storeButtons(t)}
  </div>
  <p style="font-size:14px;color:#6c687f;font-weight:600;">${esc(t.price)}</p>
</section>
</main>

${siteFooter(t, code)}

</div>
</body>
</html>
`;
}

const MAIL = '<a href="mailto:ariel_padilla@hotmail.com">ariel_padilla@hotmail.com</a>';
const APPLE = '<a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>';
const GOOGLE_REFUND = 'https://support.google.com/googleplay/answer/2479637';

/** A paragraph of a privacy or support text, with its few links filled in. */
const prose = (text, code) => esc(text)
  .replace('{MAIL}', MAIL)
  .replace('{APPLE}', APPLE)
  .replace(/\{GOOGLE:([^}]*)\}/, (_, s) => `<a href="${GOOGLE_REFUND}">${s}</a>`)
  .replace(/\{PRIV:([^}]*)\}/, (_, s) => `<a href="${pageOf(code, 'privacy')}">${s}</a>`);

/** The privacy or support page, laid out like the privacy page in the design. */
function renderDoc(kind, code) {
  const t = { ...ALL.en, ...ALL[code] };
  const d = DOCS[kind][code] ?? DOCS[kind].en;
  return `<!doctype html>
<html lang="${esc(t.htmlLang || code)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} — YourBudget</title>
<meta name="description" content="${esc(d.intro)}">
<link rel="icon" href="assets/icon.png">
${LANGS.map(([c]) => `<link rel="alternate" hreflang="${c}" href="${pageOf(c, kind)}">`).join('\n')}
<!-- Generated by scripts/build-home.mjs from homepage/pages/${kind}.js. Edit that, not this. -->
<style>${CSS}</style>
__REDIRECT__
</head>
<body>
<div id="top" style="min-height:100vh;background:#fbfaff;display:flex;flex-direction:column;">
${siteHeader(t, code, kind)}
<main id="main" tabindex="-1" style="flex:1;width:100%;max-width:760px;margin:0 auto;padding:clamp(48px,8vw,88px) 24px 96px;display:flex;flex-direction:column;gap:40px;">
  <div style="display:flex;flex-direction:column;gap:20px;">
    <h1 style="font-size:clamp(34px,5vw,48px);line-height:1.1;font-weight:800;letter-spacing:-0.025em;text-wrap:balance;">${esc(d.title)}</h1>
    <p style="font-size:20px;line-height:1.55;font-weight:600;color:#463a7a;background:#f0eefb;border-radius:18px;padding:22px 26px;text-wrap:pretty;">${esc(d.intro)}</p>
  </div>
  <div style="display:flex;flex-direction:column;">${d.blocks.map(b => `
    <section style="display:flex;flex-direction:column;gap:12px;padding:28px 0;border-top:1px solid #ece9f5;">
      <h2 style="font-size:20px;line-height:1.3;font-weight:800;letter-spacing:-0.01em;">${esc(b.h)}</h2>${b.ps.map(para => `
      <p style="font-size:16px;line-height:1.7;color:#5d5972;text-wrap:pretty;">${prose(para, code)}</p>`).join('')}
    </section>`).join('')}
  </div>
  <p style="font-size:14px;color:#6c687f;font-weight:600;">${esc(d.updated)}</p>
</main>
${siteFooter(t, code, kind)}
</div>
</body>
</html>
`;
}

/** The About page: the quote from the homepage, the promises, and where to ask. */
function renderAbout(code) {
  const t = { ...ALL.en, ...ALL[code] };
  const title = t.nav.aboutTitle;
  return `<!doctype html>
<html lang="${esc(t.htmlLang || code)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(t.lead)}">
<link rel="icon" href="assets/icon.png">
${LANGS.map(([c]) => `<link rel="alternate" hreflang="${c}" href="${pageOf(c, 'about')}">`).join('\n')}
<!-- Generated by scripts/build-home.mjs from the homepage texts in homepage/i18n/${code}.js. Edit those, not this. -->
<style>${CSS}</style>
__REDIRECT__
</head>
<body>
<div id="top" style="min-height:100vh;background:#fbfaff;display:flex;flex-direction:column;">
${siteHeader(t, code, 'about')}
<main id="main" tabindex="-1" style="flex:1;width:100%;max-width:760px;margin:0 auto;padding:clamp(48px,8vw,88px) 24px 96px;display:flex;flex-direction:column;gap:40px;">
  <div style="display:flex;align-items:center;gap:18px;">
    <img src="assets/icon.png" alt="" width="72" height="72" style="border-radius:18px;box-shadow:0 14px 28px -14px rgba(32,32,58,0.4);">
    <h1 style="font-size:clamp(34px,5vw,48px);line-height:1.1;font-weight:800;letter-spacing:-0.025em;text-wrap:balance;">${esc(title)}</h1>
  </div>
  <p style="font-size:20px;line-height:1.55;font-weight:600;color:#463a7a;background:#f0eefb;border-radius:18px;padding:22px 26px;text-wrap:pretty;">${esc(t.h1)}</p>
  <section style="display:flex;flex-direction:column;gap:20px;padding:8px 0 4px;">
    <p class="label">${esc(t.phil.label)}</p>
    <blockquote style="font-size:clamp(22px,3vw,28px);line-height:1.5;font-weight:600;letter-spacing:-0.01em;text-wrap:pretty;">${esc(t.phil.quote)}</blockquote>
    <p style="font-size:16px;font-weight:700;color:#463a7a;">Ariel<span style="display:block;font-weight:500;font-size:14px;color:#5d5972;">${esc(t.phil.role)}</span></p>
  </section>
  <section style="display:flex;flex-direction:column;gap:16px;padding:28px 0;border-top:1px solid #ece9f5;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">${t.chips.map(c => `
      <span style="background:#eeedfe;color:#5b4bb3;font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c)}</span>`).join('')}
    </div>
    <p style="font-size:16px;line-height:1.7;color:#5d5972;">${esc(t.price)}</p>
    <p style="font-size:16px;line-height:1.7;color:#5d5972;">${esc(t.dl.soon)}</p>
  </section>
  <p style="display:flex;gap:24px;flex-wrap:wrap;font-size:16px;font-weight:600;padding-top:28px;border-top:1px solid #ece9f5;">
    <a href="${pageOf(code, 'support')}">${esc(t.footer.support)}</a>
    <a href="${pageOf(code, 'privacy')}">${esc(t.footer.privacy)}</a>
  </p>
</main>
${siteFooter(t, code, 'about')}
</div>
</body>
</html>
`;
}

// index.html is the English page, plus one inline line that sends a visitor
// whose browser prefers another of the eleven languages to that page. Picking a
// language in the menu goes to that language's own file, which never redirects.
// privacy.html and support.html, the addresses the stores link to, do the same,
// and also honour an old link's #sv-style anchor. Any other anchor, like #faq,
// comes along to the language's page.
const redirect = kind => `<script>(function(){var s=${JSON.stringify(LANGS.map(l => l[0]).filter(c => c !== 'en'))};var p=${JSON.stringify(kind ? kind + '-' : '')};var h=location.hash.slice(1);function go(c){location.replace(p+c+'.html'+(c===h?'':location.hash))}if(s.indexOf(h)>=0)return go(h);if(h==='en')return;var l=navigator.languages||[navigator.language||''];for(var i=0;i<l.length;i++){var c=String(l[i]).slice(0,2).toLowerCase();if(c==='en')return;if(s.indexOf(c)>=0)return go(c)}})();</script>`;

// Replaces the web app's service worker on browsers that still have it: it
// clears its caches and unregisters, so the old app stops being served from a
// cache. Only caches: what the app stored for the user is not the worker's to
// touch, and stays in that browser.
const RETIRE_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
`;

const OUT = new URL('dist-site/', ROOT);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [code] of LANGS) {
  writeFileSync(new URL(pageOf(code), OUT), render(code).replace('__REDIRECT__\n', ''));
}
writeFileSync(new URL('index.html', OUT), render('en').replace('__REDIRECT__', redirect('')));
for (const kind of ['privacy', 'support']) {
  for (const [code] of LANGS) {
    writeFileSync(new URL(pageOf(code, kind), OUT), renderDoc(kind, code).replace('__REDIRECT__\n', ''));
  }
  writeFileSync(new URL(`${kind}.html`, OUT), renderDoc(kind, 'en').replace('__REDIRECT__', redirect(kind)));
}
for (const [code] of LANGS) {
  writeFileSync(new URL(pageOf(code, 'about'), OUT), renderAbout(code).replace('__REDIRECT__\n', ''));
}
writeFileSync(new URL('about.html', OUT), renderAbout('en').replace('__REDIRECT__', redirect('about')));
cpSync(new URL('homepage/assets/', ROOT), new URL('assets/', OUT), { recursive: true });
writeFileSync(new URL('sw.js', OUT), RETIRE_SW);
console.log(`site: home, about, privacy and support in ${LANGS.length} languages → dist-site/`);
