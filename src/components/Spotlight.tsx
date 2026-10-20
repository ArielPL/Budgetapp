// ── Spotlight — dim the app, light up one real control, say what it is ──────
//
// Used by the guide's "Show me" and by the one-time pointer to the guide after
// a first budget is made. It lights up the element itself, found by selector,
// so it is right in every language, theme and screen size.
//
// The dimming is the ring's own shadow, and the ring lets clicks through: the
// lit control can be tried at once, and any tap outside the bubble puts the
// light out (onDismiss). A control that is not there right now (the menu's
// items while it closes, "Left to live on" without an income) still gets its
// bubble, at the bottom, with a line saying so.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStayLive } from '../useStayLive';

export interface SpotlightAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface Props {
  selector: string;
  title?: string;
  text: string;
  /** Added to the text when the element cannot be found. */
  notHere?: string;
  actions: SpotlightAction[];
  onDismiss: () => void;
  /** Taps inside this (the guide's bar or panel) do not dismiss, and the
   *  bubble keeps clear of it. */
  keep?: string;
}

const PAD = 6;
const GAP = 12;
const WIDTH = 300;

export const Spotlight = ({ selector, title, text, notHere, actions, onDismiss, keep }: Props) => {
  const root = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [bubbleH, setBubbleH] = useState(120);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; });
  // An open menu makes everything outside itself inert; the bubble's buttons
  // must still work when "Show me" opened that menu.
  useStayLive(root);

  // Find the element (a tab or the menu may still be opening), bring it into
  // view, then follow it while the page scrolls or resizes.
  useEffect(() => {
    setRect(null);
    setMissing(false);
    let raf = 0;
    let el: HTMLElement | null = null;
    const visible = (e: Element | null): e is HTMLElement =>
      e instanceof HTMLElement && e.getClientRects().length > 0;
    const follow = () => {
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setRect(prev => prev && prev.top === r.top && prev.left === r.left
          && prev.width === r.width && prev.height === r.height ? prev : r);
      } else if (el) {
        el = null;
        setRect(null);
        setMissing(true);
      }
      raf = requestAnimationFrame(follow);
    };
    let tries = 0;
    const find = setInterval(() => {
      const found = document.querySelector(selector);
      if (visible(found)) {
        clearInterval(find);
        el = found;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        raf = requestAnimationFrame(follow);
      } else if (++tries >= 20) {
        clearInterval(find);
        setMissing(true);
        raf = requestAnimationFrame(follow);
      }
    }, 100);
    return () => { clearInterval(find); cancelAnimationFrame(raf); };
  }, [selector]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && root.current?.contains(t)) return;
      if (t instanceof Element && keep && t.closest(keep)) return;
      onDismissRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [keep]);

  // Where the bubble goes depends on how tall it is (above or below the
  // control); ResizeObserver reports it once it is laid out, and again if
  // its text wraps differently.
  const shown = !!rect || missing;
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!shown || !el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBubbleH(el.offsetHeight || 120));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown]);

  const vh = window.innerHeight;
  // What the bubble must keep clear of: the guide's bar below it, or the
  // guide's panel to the right of it.
  const kept = keep ? [...document.querySelectorAll(keep)].map(e => e.getBoundingClientRect()) : [];
  const bar = kept.find(r => r.height > 0 && r.top > vh / 2);
  const side = kept.find(r => r.width > 0 && r.left > window.innerWidth / 2);
  const floor = bar ? bar.top - GAP : vh - GAP;
  const vw = side ? side.left : window.innerWidth;
  const w = Math.min(WIDTH, vw - 24);

  let bubbleStyle: CSSProperties;
  let arrow: { x: number; up: boolean } | null = null;
  if (rect) {
    const cx = rect.left + rect.width / 2;
    const left = Math.max(12, Math.min(vw - w - 12, cx - w / 2));
    const below = rect.bottom + PAD + GAP;
    const fitsBelow = below + bubbleH <= floor;
    const fitsAbove = rect.top - PAD - GAP - bubbleH >= 12;
    const top = fitsBelow || !fitsAbove
      ? Math.min(below, floor - bubbleH)
      : rect.top - PAD - GAP - bubbleH;
    arrow = fitsBelow || !fitsAbove ? { x: cx - left, up: true } : { x: cx - left, up: false };
    arrow.x = Math.max(18, Math.min(w - 18, arrow.x));
    bubbleStyle = { left, top: Math.max(12, top), width: w };
  } else {
    bubbleStyle = { left: (vw - w) / 2, top: Math.max(12, floor - bubbleH), width: w };
  }

  return createPortal(
    <div className="spot-root" ref={root}>
      {rect && (
        <div
          className="spot-ring"
          aria-hidden="true"
          style={{
            left: rect.left - PAD, top: rect.top - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          }}
        />
      )}
      {shown && (
        <div className="spot-bubble" ref={bubble} style={bubbleStyle} role="dialog" aria-live="polite"
          aria-label={title ?? text}>
          {arrow && <span className={`spot-arrow${arrow.up ? ' is-up' : ' is-down'}`} style={{ left: arrow.x }} />}
          {title && <strong className="spot-title">{title}</strong>}
          <p className="spot-text">{text}</p>
          {missing && notHere && <p className="spot-missing">{notHere}</p>}
          <div className="spot-actions">
            {actions.map(a => (
              <button key={a.label} type="button"
                className={a.primary ? 'custom-primary-btn' : 'custom-secondary-btn'}
                onClick={a.onClick}>{a.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};
