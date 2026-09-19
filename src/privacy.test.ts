import { describe, it, expect } from 'vitest';
import { translations } from './i18n';
import page from '../public/privacy.html?raw';

// ── The two copies must say the same thing ─────────────────────────────────
//
// Apple wants the policy reachable inside the app AND at a public URL, so
// there are necessarily two copies: the strings in i18n.ts and the standalone
// page a store listing links to. Two copies of a promise drift, and a privacy
// policy that says one thing in the app and another on the web is worse than
// having none — it is evidence that nobody is minding it.
//
// This does not check the promise is TRUE. What makes it true is that the app
// makes no network requests at all, which src/index.css and package.json are
// the record of: three dependencies, no analytics, and a self-hosted typeface
// after the Google Fonts import that used to send every user's IP to a third
// party on startup was removed.

// Inline markup is stripped before comparing. The page may legitimately wrap a
// word in a tag — the contact address is a mailto link, which is the right
// thing on a public page — while the in-app string is plain text. What must
// match is the SENTENCE, not the markup around it. Entities are decoded after
// the tags come out, so an escaped `<` in the prose is not mistaken for one.
const decoded = page
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe('the privacy policy exists in all three languages', () => {
  it.each(['sv', 'en', 'es'] as const)('%s has a title, a body and a date', (lang) => {
    const t = translations[lang];
    expect(t.privacyTitle.length).toBeGreaterThan(2);
    expect(t.privacyBody.length).toBeGreaterThan(8);
    expect(t.privacyUpdated).toMatch(/2026/);
  });

  it.each(['sv', 'en', 'es'] as const)('%s says plainly that nothing is collected', (lang) => {
    // The one sentence Apple's declaration rests on. If it ever stops being
    // true, this test is where someone should have to come and delete it.
    const first = translations[lang].privacyBody[0].toLowerCase();
    expect(first).toMatch(/samlar inte in|does not collect|no recoge/);
  });
});

describe('the page and the app say the same thing', () => {
  it.each(['sv', 'en', 'es'] as const)('every %s paragraph appears on the page', (lang) => {
    const missing = translations[lang].privacyBody
      .map(p => (p.startsWith('## ') ? p.slice(3) : p))
      .filter(p => !decoded.includes(p));
    expect(missing, `missing from public/privacy.html:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the page fetches nothing from anywhere', () => {
    // A privacy policy that phones a third party to render itself would be a
    // poor advertisement for what it is promising.
    expect(page).not.toMatch(/https?:\/\//);
    expect(page).not.toMatch(/<script/i);
  });
});
