import { PUZZLES, PUZZLE_ORDER } from '../data/puzzles';
import { currentPuzzle } from '../game/logic';
import { gameStore } from '../game/gameApi';
import { useEngine } from './context';
import { useGame } from './useGame';

/** Minimalny HUD: celownik, etykieta obiektu, napisy, podpowiedź – bez stałego panelu. */
export function Hud({ touch }: { touch: boolean }) {
  const prompt = useGame((s) => s.prompt);
  const subtitle = useGame((s) => s.subtitle);
  const toast = useGame((s) => s.toast);
  const hint = useGame((s) => s.hint);
  const game = useGame((s) => s.game);
  const overlay = useGame((s) => s.overlay);
  const cinema = useGame((s) => s.cinema);
  const subtitlesOn = game.settings.subtitles;
  const active = currentPuzzle(game);
  const solved = PUZZLE_ORDER.filter((id) => game.puzzles[id] === 'solved').length;
  const timer = game.settings.showTimer ? formatClock(game.elapsedMs) : null;
  const set = gameStore.getState;
  const { engine } = useEngine();

  if (overlay) return <div className="hud hud--muted" />;
  if (cinema) {
    // podczas sekwencji filmowej zostają tylko napisy
    return (
      <div className="hud">
        {subtitlesOn && subtitle && (
          <div className="subtitle" key={subtitle.id} aria-live="polite"><span>{subtitle.text}</span></div>
        )}
      </div>
    );
  }

  return (
    <div className="hud">
      <div className={`crosshair ${prompt ? 'crosshair--active' : ''}`} aria-hidden="true" />
      {prompt && <div className="prompt" role="status">{touch ? 'Dotknij: ' : 'E · '}{prompt}</div>}

      <div className="hud__top">
        <div className="chip" aria-label="Postęp">
          <span className="chip__label">Zagadki</span>
          <span className="chip__value">{solved}/6</span>
          {active && <span className="chip__hint">{PUZZLES[active].title}</span>}
        </div>
        {timer && <div className="chip chip--timer" aria-label="Czas gry">{timer}</div>}
      </div>

      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
        </div>
      )}

      {subtitlesOn && subtitle && (
        <div className="subtitle" key={subtitle.id} aria-live="polite">
          <span>{subtitle.text}</span>
        </div>
      )}

      {hint && (
        <aside className="hintcard" key={hint.id} aria-label="Podpowiedź">
          <div className="hintcard__head">
            <span>Podpowiedź {hint.level}/3</span>
            <button className="icon-btn" onClick={() => gameStore.setState({ hint: null })} aria-label="Zamknij podpowiedź">×</button>
          </div>
          <p>{hint.text}</p>
        </aside>
      )}

      {!touch && (
        <div className="hud__keys" aria-hidden="true">
          <span>WASD ruch</span><span>E interakcja</span><span>Tab ekwipunek</span><span>J dziennik</span><span>H podpowiedź</span><span>Esc pauza</span>
        </div>
      )}
      {!touch && <div className="hud__buttons">
        <button className="chip-btn" onClick={() => set().setOverlay({ kind: 'inventory' })}>Ekwipunek</button>
        <button className="chip-btn" onClick={() => set().setOverlay({ kind: 'journal' })}>Dziennik</button>
        <button className="chip-btn" onClick={() => engine?.requestHint()}>Podpowiedź</button>
        <button className="chip-btn" onClick={() => engine?.pause()}>Pauza</button>
      </div>}
    </div>
  );
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
