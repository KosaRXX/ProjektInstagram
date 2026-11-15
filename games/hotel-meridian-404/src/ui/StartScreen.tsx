import { useState } from 'react';
import { hasSavedGame, gameStore } from '../game/gameApi';
import { useEngine } from './context';

export function StartScreen() {
  const { newGame, continueGame } = useEngine();
  const [hasSave] = useState(() => hasSavedGame());
  const open = (kind: 'settings' | 'message') => {
    if (kind === 'settings') gameStore.getState().setOverlay({ kind: 'settings' });
    else gameStore.getState().setOverlay({ kind: 'message', title: 'Sterowanie', text: CONTROLS_TEXT });
  };
  return (
    <main className="start" aria-label="Menu główne">
      <div className="start__inner">
        <p className="start__kicker">Kinowy escape room 3D</p>
        <h1 className="start__title">HOTEL MERIDIAN</h1>
        <p className="start__room">POKÓJ 404</p>
        <div className="start__actions">
          <button className="btn btn--primary" onClick={newGame}>Rozpocznij</button>
          <button className="btn" onClick={continueGame} disabled={!hasSave} title={hasSave ? '' : 'Brak zapisanej gry'}>Kontynuuj</button>
          <button className="btn" onClick={() => open('settings')}>Ustawienia</button>
          <button className="btn btn--ghost" onClick={() => open('message')}>Sterowanie</button>
        </div>
        <p className="start__foot">Dźwięk i grafika reagują na Twoje urządzenie. Najlepiej z słuchawkami.</p>
      </div>
    </main>
  );
}

export const CONTROLS_TEXT = [
  'Komputer: WASD – ruch, mysz – rozglądanie (kliknij scenę, by ją przechwycić), E lub klik – interakcja.',
  'Tab – ekwipunek, J – dziennik, H – podpowiedź, Esc – pauza.',
  'Telefon: przeciągnij palcem, by się rozglądać. Dotknij przedmiotu, by z nim działać. Lewy dolny róg – ruch.',
].join('\n\n');
