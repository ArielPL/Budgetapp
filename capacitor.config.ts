import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.arielpl.budget',
  appName: 'Budget',
  webDir: 'dist',
  // Behind the page while it loads: the splash's colour and the default dark
  // theme's, so there is no white flash between the splash and the budget.
  backgroundColor: '#0f172a',
  plugins: {
    // Android: follow the page's viewport-fit=cover, so the app draws behind
    // the status bar and CSS env(safe-area-inset-*) holds the real sizes (the
    // header pads itself with them — see .app-header). 'native' rather than the
    // default 'css': the app needs no injected variables, and the injection
    // logged "Error injecting safe area CSS" on start.
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      // Light icons for the first frame, matching the default dark theme;
      // themes.ts then sets them to fit whichever theme the user chose.
      style: 'DARK',
    },
    // The app's data store on iOS and Android — see src/nativeStorage.ts.
    CapacitorSQLite: {
      // Inside Library/, which iOS includes in the user's own device backup
      // (iCloud or computer). Ariel chose to allow that on 2026-09-26.
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      // No device-bound encryption key: a database locked with a key that stays
      // on the old phone would restore as unreadable. The platforms already
      // encrypt the device and its backups.
      iosIsEncryption: false,
      androidIsEncryption: false,
      electronIsEncryption: false,
    },
  },
};

export default config;
