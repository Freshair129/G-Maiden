import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'
import App from './App'
import './index.css'

function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== 'pageview') return null

  const url = new URL(event.url, window.location.origin)
  return { ...event, url: `${url.origin}${url.pathname}` }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Analytics beforeSend={redactAnalyticsEvent} />
  </React.StrictMode>,
)
