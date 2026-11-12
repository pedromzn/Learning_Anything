import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* the fonts ship with the package: the app works offline */
import '@fontsource-variable/fraunces/index.css'
import '@fontsource-variable/instrument-sans/index.css'
import '@fontsource-variable/geist-mono/index.css'
import 'katex/dist/katex.min.css'
import './i18n'
import './style/theme.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
