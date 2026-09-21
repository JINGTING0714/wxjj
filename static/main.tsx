import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/700.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/700.css';
import '@fontsource/ma-shan-zheng/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '../app/globals.css';
import './static.css';
import App from '../app/page';
import { VaultProvider } from '../components/prism/vault-provider';
import { PwaRegister } from '../components/prism/pwa-register';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VaultProvider>
      <App />
      <PwaRegister />
    </VaultProvider>
  </StrictMode>,
);
