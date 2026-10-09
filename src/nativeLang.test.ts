import { describe, it, expect, vi, beforeEach } from 'vitest';

const native = vi.hoisted(() => ({
  on: false, set: vi.fn(() => Promise.resolve()), theme: vi.fn(() => Promise.resolve()),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.on },
  registerPlugin: () => ({ set: native.set, theme: native.theme }),
}));

const { tellNativeLang, tellNativeTheme } = await import('./nativeLang');

describe('tellNativeLang', () => {
  beforeEach(() => { native.set.mockClear(); });

  it('tells a phone app which language the app is in', () => {
    native.on = true;
    tellNativeLang('es');
    expect(native.set).toHaveBeenCalledWith({ lang: 'es' });
  });

  it('does nothing on the web', () => {
    native.on = false;
    tellNativeLang('sv');
    expect(native.set).not.toHaveBeenCalled();
  });

  it('never throws when the native side does not know the call', async () => {
    native.on = true;
    native.set.mockImplementationOnce(() => Promise.reject(new Error('not implemented')));
    expect(() => tellNativeLang('en')).not.toThrow();
    await Promise.resolve();
  });
});

describe('tellNativeTheme (full sweep 2026-10-08)', () => {
  beforeEach(() => { native.theme.mockClear(); });

  it('tells a phone app the theme and its background, for the app-switcher cover', () => {
    native.on = true;
    tellNativeTheme('dark', '#0f172a');
    expect(native.theme).toHaveBeenCalledWith({ mode: 'dark', background: '#0f172a' });
  });

  it('does nothing on the web, and never throws on an older shell', async () => {
    native.on = false;
    tellNativeTheme('light', '#fbfaff');
    expect(native.theme).not.toHaveBeenCalled();
    native.on = true;
    native.theme.mockImplementationOnce(() => Promise.reject(new Error('not implemented')));
    expect(() => tellNativeTheme('light', '#fbfaff')).not.toThrow();
    await Promise.resolve();
  });
});
