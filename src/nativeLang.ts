import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Lang } from './i18n';

// ── The app's language, told to the native side ───────────────────────────
//
// The phone apps draw confirm() and alert() themselves (SceneDelegate.swift,
// MainActivity.java), and their buttons have to be in the APP's language: the
// app can be Spanish on a Swedish phone, and "Avbryt / OK" under a Spanish
// question read as two apps (store screenshots, 2026-10-05). The native side
// falls back to the phone's own words until it has been told.

const AppLang = registerPlugin<{ set(options: { lang: string }): Promise<void> }>('AppLang');

export function tellNativeLang(lang: Lang): void {
  if (!Capacitor.isNativePlatform()) return;
  AppLang.set({ lang }).catch(() => { /* an older native shell: phone's language */ });
}
