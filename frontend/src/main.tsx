import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import '@fontsource-variable/figtree'
import '@fontsource-variable/inter'
import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import App from './App.tsx'

// Cards rise in once per page load; tab switches after that stay quick.
document.documentElement.classList.add('first-load')
window.setTimeout(() => document.documentElement.classList.remove('first-load'), 1600)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Honour the visitor's reduced-motion setting everywhere Motion runs. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
