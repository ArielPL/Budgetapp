import { describe, it, expect } from 'vitest';
import manifest from '../public/manifest.json?raw';
import indexHtml from '../index.html?raw';
import capConfig from '../capacitor.config.ts?raw';
import infoPlist from '../ios/App/App/Info.plist?raw';
import androidStrings from '../android/app/src/main/res/values/strings.xml?raw';

// The app is called YourBudget (renamed 2026-10-11). The name lives in six
// files across web, iOS and Android; a rename that misses one shows the old
// name on somebody's home screen.
describe('the app is called YourBudget everywhere it names itself', () => {
  it('home screen and browser tab', () => {
    expect(JSON.parse(manifest).short_name).toBe('YourBudget');
    expect(indexHtml).toContain('content="YourBudget"');
    expect(indexHtml).toMatch(/<title>YourBudget – /);
  });

  it('native apps', () => {
    expect(capConfig).toContain("appName: 'YourBudget'");
    expect(infoPlist).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>YourBudget<\/string>/);
    expect(androidStrings).toContain('<string name="app_name">YourBudget</string>');
  });
});
