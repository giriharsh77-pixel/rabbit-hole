import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/app.css';
import { App } from './App';
import { setPreviewConnect } from './rpc';
import { applyThemeHint } from './theme';

applyThemeHint();

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'tab' ? 'tab' : 'popup';
const tabParam = Number(params.get('tab'));
const sourceTabId = Number.isInteger(tabParam) && tabParam > 0 ? tabParam : undefined;

document.body.classList.add(`mode-${mode}`);

async function start(): Promise<void> {
  // Compiled out of real extension builds (`__RH_PREVIEW__` is false there).
  if (__RH_PREVIEW__) {
    const { createPreviewConnect } = await import('../dev/shim');
    setPreviewConnect(await createPreviewConnect());
  }
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <App mode={mode} sourceTabId={sourceTabId} />
    </StrictMode>,
  );
}

void start();
