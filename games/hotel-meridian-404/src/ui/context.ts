import { createContext, useContext } from 'react';
import type { GameEngine } from '../engine/engine';

export interface EngineHandle {
  engine: GameEngine | null;
  /** Przejście do menu głównego (zachowuje zapis). */
  toMenu: () => void;
  /** Nowa gra – kasuje zapis i startuje od zera. */
  newGame: () => void;
  /** Kontynuacja zapisanej gry lub nowa, jeśli brak zapisu. */
  continueGame: () => void;
}

export const EngineContext = createContext<EngineHandle>({
  engine: null,
  toMenu: () => undefined,
  newGame: () => undefined,
  continueGame: () => undefined,
});

export const useEngine = (): EngineHandle => useContext(EngineContext);
