import type { Lang } from '../i18n';
import type { Guide } from './types';
import { svGuide } from './sv';
import { enGuide } from './en';
import { esGuide } from './es';
import { frGuide } from './fr';
import { deGuide } from './de';
import { jaGuide } from './ja';
import { zhGuide } from './zh';
import { itGuide } from './it';
import { ptGuide } from './pt';
import { ruGuide } from './ru';
import { trGuide } from './tr';

export type { Guide, GuideSection } from './types';

/** Every language, or the build fails: a guide that fell back to another
 *  language is what the first version did, and nobody could read it. */
export const GUIDES: Record<Lang, Guide> = {
  sv: svGuide, en: enGuide, es: esGuide, fr: frGuide, de: deGuide,
  it: itGuide, pt: ptGuide, ru: ruGuide, tr: trGuide, ja: jaGuide, zh: zhGuide,
};

export function guideFor(lang: Lang): Guide {
  return GUIDES[lang];
}
