import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerSW } from 'virtual:pwa-register';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Service worker registration.
 * `registerType: 'prompt'` means an updated bundle is downloaded and prepared
 * but not activated until the user reloads — a seller mid-entry never loses
 * work to a silent swap.
 */
if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('vite-plugin-pwa:update-ready'));
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('vite-plugin-pwa:offline-ready'));
    },
  });
}
