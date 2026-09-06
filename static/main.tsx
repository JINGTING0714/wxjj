import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
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
