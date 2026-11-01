// ── The "Get started" guide — one file of prose per language ───────────────
//
// Like the Follow-up help, the text is edited as prose, not as a hundred
// translation keys: each section's body is an array of lines where '## ' makes
// a heading, a leading digit a numbered step, '💡 ' a tip, and anything else a
// paragraph. The row and menu item that open it are ordinary translations
// (guideEntry), so the main bundle does not carry seven languages of prose.

import type { SpotId } from './spots';

export interface GuideSection {
  emoji: string;
  title: string;
  body: string[];
}

/** One "Show me" button: its label in the guide, and what the bubble says
 *  beside the lit-up control. */
export interface GuideSpot {
  label: string;
  text: string;
}

export interface Guide {
  title: string;
  intro: string;
  close: string;
  /** Above a section's "Show me" buttons. */
  showMe: string;
  /** In the bubble and the bar: back to the guide, where you were. */
  backToGuide: string;
  /** In the bubble: put the light out, stay where you are. */
  ok: string;
  /** Under the spot's name on the bar the guide shrinks to on a phone. */
  barHint: string;
  /** In the bubble when the control is not on screen right now. */
  notHere: string;
  spots: Record<SpotId, GuideSpot>;
  sections: GuideSection[];
}
