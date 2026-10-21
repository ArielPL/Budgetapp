// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { attachSwipeToClose } from './swipeToClose';

// ── Swipe a sheet down to close it (tester, 2026-10-21) ─────────────────────

let panel: HTMLElement;
let close: ReturnType<typeof vi.fn<() => void>>;
let detach: () => void;

const touch = (type: string, y: number, target: Element = panel) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [{ clientY: y }] });
  target.dispatchEvent(e);
  return e;
};
/** A drag from y=100 down by `by`, in steps, then release. */
const drag = (by: number, target: Element = panel) => {
  touch('touchstart', 100, target);
  for (let y = 100; y <= 100 + by; y += 20) touch('touchmove', y, target);
  touch('touchmove', 100 + by, target);
  touch('touchend', 100 + by, target);
};
const placed = (top: number, bottom: number) =>
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top, bottom, height: bottom - top } as DOMRect);

beforeEach(() => {
  vi.useFakeTimers();
  panel = document.createElement('div');
  panel.innerHTML = '<p class="text">Text</p><input class="field"><div class="list"><p class="item">Rad</p></div>';
  document.body.appendChild(panel);
  close = vi.fn<() => void>();
  detach = attachSwipeToClose(panel, close);
  placed(200, window.innerHeight);
});
afterEach(() => { detach(); panel.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('a sheet on the bottom edge', () => {
  it('closes when pulled down far enough', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
    drag(150);
    vi.advanceTimersByTime(250);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('springs back from a short pull, and stays open', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
    drag(40);
    vi.advanceTimersByTime(250);
    expect(close).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('follows the finger while it is pulled', () => {
    touch('touchstart', 100);
    const move = touch('touchmove', 160);
    expect(panel.style.transform).toBe('translateY(60px)');
    expect(move.defaultPrevented).toBe(true);
  });

  it('an upward drag is a scroll, not a close', () => {
    touch('touchstart', 300);
    const move = touch('touchmove', 200);
    touch('touchend', 200);
    vi.advanceTimersByTime(250);
    expect(close).not.toHaveBeenCalled();
    expect(move.defaultPrevented).toBe(false);
  });

  it('a list scrolled down scrolls back first', () => {
    const list = panel.querySelector('.list') as HTMLElement;
    list.scrollTop = 50;
    Object.defineProperty(list, 'scrollTop', { value: 50 });
    drag(200, panel.querySelector('.item')!);
    vi.advanceTimersByTime(250);
    expect(close).not.toHaveBeenCalled();
  });

  it('a field keeps its own gestures', () => {
    drag(200, panel.querySelector('.field')!);
    vi.advanceTimersByTime(250);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('a card in the middle of the screen', () => {
  it('is not pulled down', () => {
    placed(200, window.innerHeight - 200);
    drag(200);
    vi.advanceTimersByTime(250);
    expect(close).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });
});
