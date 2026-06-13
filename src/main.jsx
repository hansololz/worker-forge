/* Renderer entry: bundle fonts (offline) + styles, mount the app. */
import React from 'react'
import ReactDOM from 'react-dom/client'

// IBM Plex Sans + Mono, bundled so the desktop app works offline.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'

import './index.css'
import App from './App'
import { initOverlayScroll } from './overlay-scroll'

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App))

// Floating overlay scrollbars over the main scroll regions (native bars hidden in CSS).
initOverlayScroll()
