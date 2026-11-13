import { ENDINGS } from '../data/narrative';
import { solvedCount } from '../game/logic';
import { gameStore } from '../game/gameApi';
import { useEngine } from './context';
import { useGame } from './useGame';

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function EndingScreen({ onExitApp }: { onExitApp: () => void }) {
  const { newGame, toMenu } = useEngine();
  const game = useGame((s) => s.game);
  const ending = game.ending;
  if (!ending) return null;
  const info = ENDINGS[ending];
  return (
    <section className="ending" role="dialog" aria-modal="true" aria-labelledby="ending-title">
      <div className="panel ending__panel">
        <p className="kicker">Zakończenie</p>
        <h2 id="ending-title" className="ending__title">{info.title}</h2>
        <p className="ending__text">{info.text}</p>
        <dl className="stats">
          <div><dt>Czas gry</dt><dd>{formatTime(game.elapsedMs)}</dd></div>
          <div><dt>Zagadki</dt><dd>{solvedCount(game)} / 6</dd></div>
          <div><dt>Prawdy</dt><dd>{game.truths.length} / 5</dd></div>
        </dl>
        <div className="actions">
          <button className="btn btn--primary" onClick={newGame}>Zagraj ponownie</button>
          <button className="btn" onClick={toMenu}>Menu główne</button>
          <button className="btn btn--ghost" onClick={() => { gameStore.getState().setOverlay(null); onExitApp(); }}>Zakończ rozgrywkę</button>
        </div>
      </div>
    </section>
  );
}
