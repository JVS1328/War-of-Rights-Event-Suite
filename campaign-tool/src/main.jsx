import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App.jsx'
import { DialogProvider } from './components/ui/Dialog.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </StrictMode>,
)
