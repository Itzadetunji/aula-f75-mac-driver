import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PreferencesProvider } from './hooks/use-layout'
import './lib/i18n'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
)
