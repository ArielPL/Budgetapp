// ── check-native-bundles — do the iOS and Android apps carry THIS web build? ─
//
// `npx cap sync` copies dist/ into each native project (ios/App/App/public and
// android/app/src/main/assets/public). Xcode and Gradle then build whatever is
// there, and say nothing if it is old: on 2026-09-29 the Android copy matched
// dist/ while the iOS copy was a build behind, and the iOS build succeeded
// anyway (foundation review, P1). An app sent to a store from such a build
// would not contain the code that was tested.
//
// This compares every file in dist/ with both copies, byte for byte, and fails
// on the first difference. Run it via `npm run native:sync`, which builds and
// syncs first, or on its own with `npm run native:check`.
//
// It also prints the native version numbers beside the app's own, as a
// reminder, not a check: which version a store release carries is decided when
// the release is made.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const copies = {
  iOS: join(root, 'ios/App/App/public'),
  Android: join(root, 'android/app/src/main/assets/public'),
};

/** Every file under `dir`, as paths relative to it. */
function files(dir) {
  const out = [];
  const walk = d => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('✗ dist/index.html is missing — run `npm run build` first.');
  process.exit(1);
}

const expected = files(dist);
let failed = false;
for (const [platform, dir] of Object.entries(copies)) {
  if (!existsSync(dir)) {
    console.error(`✗ ${platform}: ${relative(root, dir)} is missing — run \`npx cap sync\`.`);
    failed = true;
    continue;
  }
  // Capacitor adds a few files of its own (cordova.js, plugin lists); only the
  // web build's files are compared, and every one of them must be there.
  const differing = expected.filter(f => !existsSync(join(dir, f)) || hash(join(dir, f)) !== hash(join(dist, f)));
  if (differing.length > 0) {
    console.error(`✗ ${platform}: ${differing.length} of ${expected.length} files differ from dist/, e.g. ${differing.slice(0, 3).join(', ')}`);
    failed = true;
  } else {
    console.log(`✓ ${platform}: all ${expected.length} files match dist/`);
  }
}

// The version numbers, side by side.
const changelog = readFileSync(join(root, 'src/changelog.ts'), 'utf8');
const appVersion = /version:\s*'([^']+)'/.exec(changelog)?.[1] ?? '?';
const pbx = readFileSync(join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const iosVersion = /MARKETING_VERSION = ([^;]+);/.exec(pbx)?.[1] ?? '?';
const iosBuild = /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(pbx)?.[1] ?? '?';
const androidVersion = /versionName "([^"]+)"/.exec(gradle)?.[1] ?? '?';
const androidBuild = /versionCode (\d+)/.exec(gradle)?.[1] ?? '?';
console.log(`  versions — app ${appVersion} · iOS ${iosVersion} (build ${iosBuild}) · Android ${androidVersion} (build ${androidBuild})`);

process.exit(failed ? 1 : 0);
