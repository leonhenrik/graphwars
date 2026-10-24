import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DisplayApp } from './app/DisplayApp';
import { PlayerApp } from './app/PlayerApp';
import './styles/global.css';

// /play is what phones open (via the QR code); everything else is the big screen on the laptop.
const isPlayer = window.location.pathname.replace(/\/+$/, '').endsWith('/play');

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>{isPlayer ? <PlayerApp /> : <DisplayApp />}</StrictMode>,
);
