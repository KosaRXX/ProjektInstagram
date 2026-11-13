import { useStore } from 'zustand';
import { gameStore, type GameStoreState } from '../game/gameApi';

/** Subskrypcja do store gry z selektorem (zapobiega zbędnym renderom). */
export function useGame<T>(selector: (s: GameStoreState) => T): T {
  return useStore(gameStore, selector);
}
