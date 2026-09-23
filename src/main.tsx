import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyPersistedTheme } from './themes.ts'
import { appStorage } from './storage.ts'
import { isLang, deviceLang } from './i18n.ts'
import { repairFiling } from './filingRepair.ts'

// Apply the saved theme palette to :root before React renders, so the very
// first paint already uses the right colors (no flash of the default Sorbet).
applyPersistedTheme()

// And the document's language, for the same reason: index.html hard-codes
// lang="sv", but since v1.12.0 the app opens in the DEVICE's language — so an
// English or Spanish interface was being announced by VoiceOver, TalkBack and
// NVDA under Swedish pronunciation rules (finding 12). App keeps this in sync
// when the user changes language; this is the value for the first paint.
const startupLang = appStorage.getItem('budget_lang')
document.documentElement.lang = isLang(startupLang) ? startupLang : deviceLang()

// Entries stored in a different month than the pay-period rule gives them are
// moved home before anything is drawn — see filingRepair.ts. Before render, so
// no tab can load the old filing first and hold it in memory. Once per page
// load, outside React, so StrictMode's double render cannot run it twice.
const startupRepair = repairFiling(appStorage)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App startupRepair={startupRepair} />
  </StrictMode>,
)
