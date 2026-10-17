// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { applyTextSize, isTextSize, loadTextSize, TEXT_SIZE_KEY } from './textSize';

// Larger text for anyone who wants it (tester, 2026-10-17).
const store = (v: string | null) => ({
  getItem: (k: string) => (k === TEXT_SIZE_KEY ? v : null),
  setItem() {}, removeItem() {}, key: () => null, length: 0,
});

describe('text size', () => {
  it('reads what is stored, and normal for anything else', () => {
    expect(loadTextSize(store('larger'))).toBe('larger');
    expect(loadTextSize(store(null))).toBe('normal');
    expect(loadTextSize(store('huge'))).toBe('normal');
    expect(isTextSize('large')).toBe(true);
    expect(isTextSize(7)).toBe(false);
  });

  it('scales the root, which every rem in the app follows', () => {
    applyTextSize('larger');
    expect(document.documentElement.style.fontSize).toBe('130%');
    applyTextSize('normal');
    expect(document.documentElement.style.fontSize).toBe('100%');
  });
});
