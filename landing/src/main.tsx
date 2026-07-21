import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react'
import App from './App'
import './index.css'

function shouldEnableAnalytics() {
  if (!import.meta.env.PROD) return false

  const hostname = window.location.hostname
  return hostname !== 'localhost' && hostname !== '127.0.0.1'
}

function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== 'pageview') return null

  const url = new URL(event.url, window.location.origin)
  return { ...event, url: `${url.origin}${url.pathname}` }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    {shouldEnableAnalytics() ? <Analytics beforeSend={redactAnalyticsEvent} /> : null}
  </React.StrictMode>,
)
