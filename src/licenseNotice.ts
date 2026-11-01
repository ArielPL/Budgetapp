// ── licenseNotice — the open-source licences the app has to carry ──────────
//
// The libraries the app is built from (React, Recharts, Capacitor, SQLCipher …)
// are MIT, BSD, Apache 2.0 and OFL. All of them allow a closed, paid app, and
// all of them ask for one thing: that their copyright and licence text come
// along with every copy. The build strips every licence comment from the
// bundle, so before 2026-10-31 none of them did.
//
// The build (vite.config.ts) now collects the packages that actually end up in
// the bundle, reads each one's own licence file, and adds the native libraries
// of the iPhone and Android apps from licenses/native.txt. The result is
// assets/licenses.txt, which "About the app" shows under "Open-source licences".
//
// Pure, so it is tested without a build.

export interface PackageLicense {
  name: string;
  version: string;
  /** The SPDX name from package.json, e.g. "MIT". */
  license: string;
  /** The package's own licence file, or '' when it ships none. */
  text: string;
}

/** The npm package a bundled module belongs to, or null for the app's own
 *  code and the bundler's virtual modules. Nested installs resolve to the
 *  innermost package, which is the one whose code was bundled. */
export function packageOf(moduleId: string): string | null {
  if (moduleId.startsWith('\0')) return null;
  const path = moduleId.split('\\').join('/');
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const [first, second] = path.slice(at + '/node_modules/'.length).split('/');
  if (!first) return null;
  if (first.startsWith('@')) return second ? `${first}/${second}` : null;
  return first;
}

const RULE = '-'.repeat(79);

/** The file's own opening, for whoever reads it outside the app. The app
 *  leaves it out, since it says the same in the reader's language. */
export const NOTICE_INTRO = 'YourBudget is built on free and open-source software. These are the\nlibraries it contains and the licences they are released under.';

/** The notice as the app shows it: one section per library, split at the
 *  rules between them. */
export function noticeSections(notice: string): string[] {
  return notice.split(`\n${RULE}\n`).map(s => s.trim()).filter(s => s && s !== NOTICE_INTRO);
}

/** Licence files are hard-wrapped at about 80 columns, which a phone wraps a
 *  second time into ragged lines. A line that runs on from a long one is
 *  joined to it; short lines (titles, names, copyright lines), indented and
 *  bulleted lines, and table rows keep their own line. */
export function reflow(text: string): string {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const prev = out[out.length - 1];
    const runsOn = prev !== undefined && prev.length >= 50 && !/\s{3}/.test(prev)
      && line !== '' && !/^\s/.test(line) && !/^([*•-]|\d+[.)]|Copyright\b|License:)/.test(line)
      && !/\s{3}/.test(line);
    if (runsOn) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out.join('\n');
}

/** The whole notice: the bundled packages in name order, then the native
 *  libraries and any further texts (the font's OFL, the Apache licence). */
export function licenseNotice(packages: PackageLicense[], appendix: string[]): string {
  const seen = new Set<string>();
  const sections = [...packages]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(p => !seen.has(p.name) && seen.add(p.name))
    .map(p => {
      const head = p.license ? `${p.name} ${p.version}\nLicense: ${p.license}` : `${p.name} ${p.version}`;
      const body = p.text.trim()
        || `This package ships no licence file; it is released under ${p.license || 'the terms in its package.json'}.`;
      return `${head}\n\n${body}`;
    });
  return [
    NOTICE_INTRO,
    ...sections.map(s => `\n${RULE}\n${s}`),
    ...appendix.map(s => `\n${RULE}\n${s.trim()}`),
  ].join('\n') + '\n';
}
