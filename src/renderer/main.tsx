import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

console.log('[Renderer] main.tsx starting...')

const rootElement = document.getElementById('root')
console.log('[Renderer] root element:', rootElement)

if (!rootElement) {
  console.error('[Renderer] Root element not found!')
} else {
  console.log('[Renderer] Creating React root...')
  
  try {
    const root = ReactDOM.createRoot(rootElement)
    console.log('[Renderer] React root created, rendering app...')
    
    root.render(
      <React.StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </React.StrictMode>,
    )
    
    console.log('[Renderer] App rendered successfully')
  } catch (error) {
    console.error('[Renderer] Failed to render:', error)
  }
}
