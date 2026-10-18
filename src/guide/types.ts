// ── The "Get started" guide — one file of prose per language ───────────────
//
// Like the Follow-up help, the text is edited as prose, not as a hundred
// translation keys: each section's body is an array of lines where '## ' makes
// a heading, a leading digit a numbered step, '💡 ' a tip, and anything else a
// paragraph. The row and menu item that open it are ordinary translations
// (guideEntry), so the main bundle does not carry seven languages of prose.

export interface GuideSection {
  emoji: string;
  title: string;
  body: string[];
}

export interface Guide {
  title: string;
  intro: string;
  close: string;
  sections: GuideSection[];
}
