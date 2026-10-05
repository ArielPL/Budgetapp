// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { SparPlanSection } from './components/SparPlan';
import { translations } from './i18n';
import { SPARPLAN_KEY } from './sparplan';

// Choosing how far ahead the savings plan looks. Synthetic figures only.

const sv = translations.sv;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const hero = () => document.querySelector('.sparplan-hero-sub')?.textContent ?? '';
const value = () => document.querySelector('.sparplan-hero-value')?.textContent ?? '';
const pick = (n: number) => fireEvent.click(screen.getByRole('button', { name: sv.sparplanYearsShort(n) }));

describe('the savings plan’s horizon', () => {
  it('starts at five years and can look further ahead', () => {
    render(<SparPlanSection />);
    expect(hero()).toContain(sv.sparplanInYears(5));
    const five = value();
    pick(20);
    expect(hero()).toContain(sv.sparplanInYears(20));
    expect(value()).not.toBe(five);
    expect(screen.getByRole('button', { name: sv.sparplanYearsShort(20) }).getAttribute('aria-pressed')).toBe('true');
  });

  it('is stored with a plan that exists, and read back', () => {
    localStorage.setItem(SPARPLAN_KEY, JSON.stringify({ monthlyAmount: 1000, annualReturnPct: 0, startAmount: 0, startYM: '2026-01' }));
    render(<SparPlanSection />);
    expect(hero()).toContain(sv.sparplanInYears(5));
    pick(30);
    expect(JSON.parse(localStorage.getItem(SPARPLAN_KEY)!).years).toBe(30);
    // 1 000 a month at 0 %, thirty years.
    expect(value().replace(/\s/g, '')).toBe('360000kr');
    cleanup();
    render(<SparPlanSection />);
    expect(hero()).toContain(sv.sparplanInYears(30));
  });

  it('only shows a horizon for the example, without saving a plan', () => {
    render(<SparPlanSection />);
    pick(10);
    expect(localStorage.getItem(SPARPLAN_KEY)).toBeNull();
  });
});
