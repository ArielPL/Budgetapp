// ── Swipe a sheet down to close it ─────────────────────────────────────────
//
// A tester tried to pull the guide down on an Android phone and could not
// (2026-10-21): "it would help to be able to take the box down — not only that
// one, every box that pops up". useModalFocus attaches this to every panel it
// manages, so the gesture means the same as Escape and Android's Back: close.
//
// Only a SHEET — a panel resting on the bottom edge, as every panel is on a
// phone. A centred card (the first-run intro, the beginner's questions) is left
// alone: it is not something you pull down. And only from the top of what you
// touch: a list scrolled down scrolls back first, as on iOS, and fields, lists
// and sliders keep their own gestures.

/** How far down, in px, a release closes the sheet. */
const CLOSE_AT = 90;
/** Or a flick: this fast, in px per ms. */
const FLICK = 0.6;

const OWN_GESTURE = 'input, textarea, select, [contenteditable="true"], [data-no-swipe]';

/** The nearest element between `from` and `panel` that is scrolled down. */
function scrolledAbove(from: Element, panel: HTMLElement): boolean {
  for (let el: Element | null = from; el && el !== panel.parentElement; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollTop > 0) return true;
  }
  return false;
}

export function attachSwipeToClose(panel: HTMLElement, close: () => void): () => void {
  let startY = 0;
  let startT = 0;
  let dy = 0;
  let tracking = false;
  let dragging = false;

  const isSheet = () => {
    const r = panel.getBoundingClientRect();
    return r.height > 0 && r.bottom >= window.innerHeight - 2 && r.top > 0;
  };
  const settle = (to: number, then?: () => void) => {
    panel.style.transition = 'transform 0.2s ease-out';
    panel.style.transform = to ? `translateY(${to}px)` : '';
    window.setTimeout(() => {
      panel.style.transition = '';
      then?.();
    }, 200);
  };

  const onStart = (e: TouchEvent) => {
    tracking = false;
    dragging = false;
    if (e.touches.length !== 1 || !isSheet()) return;
    const target = e.target as Element | null;
    if (!target || target.closest(OWN_GESTURE) || scrolledAbove(target, panel)) return;
    tracking = true;
    startY = e.touches[0].clientY;
    startT = performance.now();
    dy = 0;
  };
  const onMove = (e: TouchEvent) => {
    if (!tracking) return;
    dy = e.touches[0].clientY - startY;
    if (!dragging) {
      // Upward first: the reader is scrolling, not closing.
      if (dy < -4) { tracking = false; return; }
      if (dy < 8) return;
      dragging = true;
    }
    e.preventDefault();
    panel.style.transition = '';
    panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  };
  const onEnd = () => {
    if (!dragging) { tracking = false; return; }
    tracking = false;
    dragging = false;
    const speed = dy / Math.max(1, performance.now() - startT);
    if (dy > CLOSE_AT || speed > FLICK) {
      settle(panel.getBoundingClientRect().height, () => {
        close();
        // A panel that stays open (its close refused) comes back up.
        if (panel.isConnected) panel.style.transform = '';
      });
    } else {
      settle(0);
    }
  };

  panel.addEventListener('touchstart', onStart, { passive: true });
  panel.addEventListener('touchmove', onMove, { passive: false });
  panel.addEventListener('touchend', onEnd);
  panel.addEventListener('touchcancel', onEnd);
  return () => {
    panel.removeEventListener('touchstart', onStart);
    panel.removeEventListener('touchmove', onMove);
    panel.removeEventListener('touchend', onEnd);
    panel.removeEventListener('touchcancel', onEnd);
    panel.style.transform = '';
    panel.style.transition = '';
  };
}
