import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { lockZoom } from './lib/lockZoom'
import './index.css'

lockZoom()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
