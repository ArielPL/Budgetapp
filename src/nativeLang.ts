import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Lang } from './i18n';
import type { Mode } from './themes';

// ── The app's language, told to the native side ───────────────────────────
//
// The phone apps draw confirm() and alert() themselves (SceneDelegate.swift,
// MainActivity.java), and their buttons have to be in the APP's language: the
// app can be Spanish on a Swedish phone, and "Avbryt / OK" under a Spanish
// question read as two apps (store screenshots, 2026-10-05). The native side
// falls back to the phone's own words until it has been told.

const AppLang = registerPlugin<{
  set(options: { lang: string }): Promise<void>;
  theme(options: { mode: Mode; background: string }): Promise<void>;
}>('AppLang');

export function tellNativeLang(lang: Lang): void {
  if (!Capacitor.isNativePlatform()) return;
  AppLang.set({ lang }).catch(() => { /* an older native shell: phone's language */ });
}

// ── The app's theme, told the same way ────────────────────────────────────
//
// iOS hides the budget in the app switcher behind a cover that looks like the
// app (SceneDelegate.swift). It used to be light whatever the app looked like,
// so a dark app flashed white there (full sweep 2026-10-08). The app's OWN
// theme decides — it can differ from the phone's appearance — and the colour
// is the theme's real background, custom palettes included.

export function tellNativeTheme(mode: Mode, background: string): void {
  if (!Capacitor.isNativePlatform()) return;
  AppLang.theme({ mode, background }).catch(() => { /* an older native shell: its own cover */ });
}
