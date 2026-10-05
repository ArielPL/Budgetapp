// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { useModalFocus, closeTopLayer, openLayerCount } from './useModalFocus';

// ── Android Back closes the layer on top, and only that one ────────────────
// iOS/Android review 2026-09-26: Back with the menu open left the app. Every
// panel that uses useModalFocus is now recorded while open, and Back closes the
// newest — a panel opened from the menu before the menu itself.

afterEach(cleanup);

const Layer = ({ name, onClose }: { name: string; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, true, onClose);
  return <div ref={ref} data-layer={name}><button>{name}</button></div>;
};

const Harness = () => {
  const [menu, setMenu] = useState(true);
  const [theme, setTheme] = useState(false);
  return (
    <>
      {menu && <Layer name="menu" onClose={() => setMenu(false)} />}
      {menu && <button onClick={() => setTheme(true)}>open theme</button>}
      {theme && <Layer name="theme" onClose={() => setTheme(false)} />}
    </>
  );
};

const open = () => [...document.querySelectorAll('[data-layer]')].map(e => e.getAttribute('data-layer'));

describe('Back on Android', () => {
  it('closes the newest layer first, then the next', () => {
    render(<Harness />);
    act(() => { document.querySelector<HTMLButtonElement>('button:not([data-layer] button)')!.click(); });
    expect(open()).toEqual(['menu', 'theme']);

    act(() => { expect(closeTopLayer()).toBe(true); });
    expect(open()).toEqual(['menu']);

    act(() => { expect(closeTopLayer()).toBe(true); });
    expect(open()).toEqual([]);
  });

  it('reports that nothing was open, so the app can go back a tab or minimise', () => {
    render(<Harness />);
    act(() => { closeTopLayer(); });
    expect(openLayerCount()).toBe(0);
    expect(closeTopLayer()).toBe(false);
  });

  it('forgets a layer that closed some other way', () => {
    const { unmount } = render(<Layer name="x" onClose={() => {}} />);
    expect(openLayerCount()).toBe(1);
    unmount();
    expect(openLayerCount()).toBe(0);
  });
});
