import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { LayoutProvider } from './hooks/use-layout'
import './globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LayoutProvider>
      <App />
    </LayoutProvider>
  </StrictMode>,
)
