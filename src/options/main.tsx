import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import { setPreviewConnect } from '../popup/rpc';
import { applyThemeHint } from '../popup/theme';
import { OptionsApp } from './OptionsApp';

applyThemeHint();

async function start(): Promise<void> {
  if (__RH_PREVIEW__) {
    const { createPreviewConnect } = await import('../dev/shim');
    setPreviewConnect(await createPreviewConnect());
  }
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <OptionsApp />
    </StrictMode>,
  );
}

void start();
