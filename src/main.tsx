import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyPersistedTheme } from './themes.ts'

// Apply the saved theme palette to :root before React renders, so the very
// first paint already uses the right colors (no flash of the default Sorbet).
applyPersistedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
