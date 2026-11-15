import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine } from './engine/engine';
import { gameStore, startGame, resetGame, exitGame } from './game/gameApi';
import { EngineContext, type EngineHandle } from './ui/context';
import { useGame } from './ui/useGame';
import { StartScreen } from './ui/StartScreen';
import { Hud } from './ui/Hud';
import { TouchControls } from './ui/TouchControls';
import { Overlays } from './ui/Overlays';
import { EndingScreen } from './ui/EndingScreen';

const isCoarse = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Parametr ?uid= z adresu – demonstracja przekazania identyfikatora z aplikacji nadrzędnej. */
function hostUserId(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get('uid') ?? undefined;
  } catch {
    return undefined;
  }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const started = useGame((s) => s.started);
  const phase = useGame((s) => s.game.phase);
  const cinema = useGame((s) => s.cinema);
  const quality = useGame((s) => s.game.settings.quality);
  const sensitivity = useGame((s) => s.game.settings.sensitivity);
  const muted = useGame((s) => s.game.settings.muted);
  const overlay = useGame((s) => s.overlay);
  const touch = useRef(isCoarse());

  // Silnik 3D: przebudowa tylko przy zmianie jakości grafiki (stan gry zostaje w store)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const e = new GameEngine(canvas, { quality, mobile: touch.current });
    e.start();
    if (gameStore.getState().started) e.resumeSession();
    setEngine(e);
    const w = window as unknown as { __hm404?: Record<string, unknown> };
    if (w.__hm404) w.__hm404.engine = e;
    return () => {
      e.dispose();
      setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality]);

  useEffect(() => {
    engine?.setSensitivity(sensitivity);
  }, [engine, sensitivity]);

  useEffect(() => {
    engine?.setMuted(muted);
  }, [engine, muted]);

  // Zakończenie sesji (menu/wyjście) – kamera wraca do menu
  useEffect(() => {
    if (!started) engine?.end();
  }, [engine, started]);

  const beginSession = useCallback(() => {
    engine?.begin();
  }, [engine]);

  const toMenu = useCallback(() => {
    gameStore.setState({ overlay: null, cinema: null, started: false });
    gameStore.getState().dispatch({ type: 'setPhase', phase: 'menu' });
    engine?.end();
  }, [engine]);

  const newGame = useCallback(() => {
    resetGame();
    startGame({ userId: hostUserId(), quality: gameStore.getState().game.settings.quality, continue: false });
    beginSession();
  }, [beginSession]);

  const continueGame = useCallback(() => {
    startGame({ userId: hostUserId(), quality: gameStore.getState().game.settings.quality, continue: true });
    beginSession();
  }, [beginSession]);

  const handle: EngineHandle = { engine, toMenu, newGame, continueGame };

  // Kliknięcie w scenę: blokada kursora + interakcja z celownikiem (desktop)
  const onCanvasClick = (e: React.MouseEvent) => {
    if (!engine || !engine.canControl()) return;
    if (document.pointerLockElement === canvasRef.current) {
      engine.activateCenter();
    } else {
      engine.requestLock();
      engine.pointerActivate(e.clientX, e.clientY);
    }
  };

  const onExitApp = () => {
    exitGame();
  };

  return (
    <EngineContext.Provider value={handle}>
      <div className="app" data-phase={phase} data-overlay={overlay?.kind ?? 'none'}>
        <canvas ref={canvasRef} className="scene" onClick={onCanvasClick} aria-label="Widok pokoju 404" />
        <div className="vignette" aria-hidden="true" />
        {!started ? (
          <StartScreen />
        ) : (
          <>
            <Hud touch={touch.current} />
            {touch.current && <TouchControls engine={engine} />}
            <Overlays />
            {phase === 'ending' && !cinema && <EndingScreen onExitApp={onExitApp} />}
          </>
        )}
        {/* Krótkie przejście (zaciemnienie i rozjaśnienie) przy starcie każdej sekwencji filmowej */}
        <div key={cinema ?? 'none'} className={`fade ${cinema ? 'fade--flash' : ''}`} aria-hidden="true" />
      </div>
    </EngineContext.Provider>
  );
}
