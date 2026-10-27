import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DisplayApp } from './app/DisplayApp';
import { PlayerApp } from './app/PlayerApp';
import { ImpressumPage } from './app/ImpressumApp';
import './styles/global.css';

// /play is what phones open (via the QR code); /impressum is the legal notice page.
const pathName = window.location.pathname.replace(/\/+$/, '');
const isPlayer = pathName.endsWith('/play');
const isImpressum = pathName.endsWith('/impressum') || pathName.endsWith('/impressum.html');

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {isImpressum ? <ImpressumPage /> : isPlayer ? <PlayerApp /> : <DisplayApp />}
  </StrictMode>,
);
