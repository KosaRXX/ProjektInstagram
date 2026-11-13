import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { gameStore, startGame, exitGame, saveGame, loadGame, getGameState, pauseGame, resumeGame } from './game/gameApi';
import './styles/app.css';

// Haczyk diagnostyczny/testowy: tylko z ?debug=1. Zwykła rozgrywka go nie używa.
if (new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__hm404 = { gameStore, startGame, exitGame, saveGame, loadGame, getGameState, pauseGame, resumeGame };
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
