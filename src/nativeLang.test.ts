import { describe, it, expect, vi, beforeEach } from 'vitest';

const native = vi.hoisted(() => ({ on: false, set: vi.fn(() => Promise.resolve()) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.on },
  registerPlugin: () => ({ set: native.set }),
}));

const { tellNativeLang } = await import('./nativeLang');

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
