import { describe, it, expect } from 'vitest';
import { resolveDisplayName, inferDefaultNameKey } from './components/CustomV3';
import { translations } from './i18n';

// The real translation tables — if a default name's translation changes, these
// tests follow along instead of pinning stale strings.
const { sv, en, es } = translations;

describe('Custom default names survive a language switch (§9)', () => {
  it('a quick-start block created in Swedish shows Spanish after the switch', () => {
    // What quickStart stores: the creation-language string + the key.
    const block = { name: 'Inkomster', nameKey: 'summaryIncome' as const, userNamed: false };
    expect(resolveDisplayName(block, es)).toBe('Ingresos');
    expect(resolveDisplayName(block, en)).toBe('Income');
    expect(resolveDisplayName(block, sv)).toBe('Inkomster');
  });

  it('a quick-start block created in Spanish shows English after the switch', () => {
    const block = { name: 'Gastos', nameKey: 'summaryExpenses' as const, userNamed: false };
    expect(resolveDisplayName(block, en)).toBe('Expenses');
  });

  it('a user\'s own name is never translated', () => {
    const block = { name: 'Semesterkonto', userNamed: true, nameKey: 'summaryIncome' as const };
    // Even WITH a stale key attached, the user's text wins in every language.
    expect(resolveDisplayName(block, es)).toBe('Semesterkonto');
    expect(resolveDisplayName(block, en)).toBe('Semesterkonto');
  });

  it('"Ny rad" translates until the user renames the row', () => {
    const fresh = { name: 'Ny rad', nameKey: 'newRowName' as const, userNamed: false };
    expect(resolveDisplayName(fresh, es)).toBe('Fila nueva');
    const renamed = { ...fresh, name: 'Hyra', userNamed: true };
    expect(resolveDisplayName(renamed, es)).toBe('Hyra');
  });

  it('an entity with no metadata at all shows its stored name as-is', () => {
    // Old data the migration could not match: assumed user-named.
    expect(resolveDisplayName({ name: 'Mitt konto' }, es)).toBe('Mitt konto');
  });
});

describe('migration of pre-nameKey structures', () => {
  it('maps every language\'s exact default names to their key', () => {
    expect(inferDefaultNameKey('Inkomster')).toBe('summaryIncome');
    expect(inferDefaultNameKey('Income')).toBe('summaryIncome');
    expect(inferDefaultNameKey('Ingresos')).toBe('summaryIncome');
    expect(inferDefaultNameKey('Sammanfattning')).toBe('summaryBlock');
    expect(inferDefaultNameKey('Ny rad')).toBe('newRowName');
    expect(inferDefaultNameKey('Nota')).toBe('newNoteName');
  });

  it('does NOT map near-misses — unknown names stay the user\'s own', () => {
    expect(inferDefaultNameKey('inkomster')).toBe(undefined);  // case differs
    expect(inferDefaultNameKey('Inkomster 2')).toBe(undefined);
    expect(inferDefaultNameKey('Semesterkonto')).toBe(undefined);
    expect(inferDefaultNameKey('')).toBe(undefined);
  });

  it('the migration map agrees with the live translation tables', () => {
    // Guards against the tables drifting: every default name string in each
    // language must round-trip back to its own key.
    for (const t of [sv, en, es]) {
      expect(inferDefaultNameKey(t.summaryIncome)).toBe('summaryIncome');
      expect(inferDefaultNameKey(t.summaryExpenses)).toBe('summaryExpenses');
      expect(inferDefaultNameKey(t.summarySaved)).toBe('summarySaved');
      expect(inferDefaultNameKey(t.summaryBlock)).toBe('summaryBlock');
      expect(inferDefaultNameKey(t.newBlockName)).toBe('newBlockName');
      expect(inferDefaultNameKey(t.newRowName)).toBe('newRowName');
      expect(inferDefaultNameKey(t.newNoteName)).toBe('newNoteName');
    }
  });
});
