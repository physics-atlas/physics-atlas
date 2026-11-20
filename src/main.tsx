import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The display font, served from the site itself — never from Google Fonts, which would
// send every visitor's IP address to Google (docs/PRIVACY-NOTICE.md, Decision 51).
import '@fontsource/sora/300.css'
import '@fontsource/sora/400.css'
import '@fontsource/sora/600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
