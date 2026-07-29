// MUST stay first: it disables React's dev-only component performance track,
// and it only works if it runs before react-dom is evaluated. See the module.
import './devPerfTrack'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installRendererErrorForwarding } from './reportErrors'
import './assets/main.css'

// Forward uncaught renderer errors + unhandled rejections to main (scrubbed +
// logged there) before anything renders.
installRendererErrorForwarding()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
