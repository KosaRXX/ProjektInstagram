import { useEffect, useState, type ReactNode } from 'react';
import { EXIT_CODE, ITEM_NAMES, PUZZLES, PUZZLE_ORDER, RADIO_STATIONS, RADIO_TOLERANCE_MHZ, TRUTHS } from '../data/puzzles';
import { NOTE_TEXT, TEXT, decisionComment } from '../data/narrative';
import { canOpenMirrorDoor, decisionLabel } from '../game/logic';
import { gameStore, type Overlay } from '../game/gameApi';
import type { ItemId, Quality, Settings } from '../game/types';
import { useEngine } from './context';
import { useGame } from './useGame';
import { CONTROLS_TEXT } from './StartScreen';

/** Wszystkie panele nakładkowe. Każdy otwiera się z obiektu 3D i zamyka do eksploracji. */
export function Overlays() {
  const overlay = useGame((s) => s.overlay);
  if (!overlay) return null;
  const close = () => gameStore.getState().setOverlay(null);
  switch (overlay.kind) {
    case 'phone':
      return <Modal title="Telefon" onClose={close}><PhonePanel /></Modal>;
    case 'decision':
      return <Modal title="Decyzja" onClose={close}><DecisionPanel /></Modal>;
    case 'clock':
      return <Modal title="Zegar" onClose={close}><ClockPanel /></Modal>;
    case 'radio':
      return <Modal title="Radio" onClose={close} wide><RadioPanel /></Modal>;
    case 'mirror':
      return <Modal title="Lustro pamięci" onClose={close} wide><MirrorPanel /></Modal>;
    case 'keypad':
      return <Modal title="Drzwi główne" onClose={close}><KeypadPanel /></Modal>;
    case 'inventory':
      return <Modal title="Ekwipunek" onClose={close}><InventoryPanel /></Modal>;
    case 'journal':
      return <Modal title="Dziennik odkryć" onClose={close} wide><JournalPanel /></Modal>;
    case 'pause':
      return <Modal title="Pauza" onClose={() => undefined} dismissible={false}><PausePanel /></Modal>;
    case 'settings':
      return <Modal title="Ustawienia" onClose={close}><SettingsPanel /></Modal>;
    case 'message':
      return <MessageBox overlay={overlay} onClose={close} />;
    default:
      return null;
  }
}

function Modal({ title, onClose, children, wide, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; dismissible?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && dismissible) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dismissible]);
  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && dismissible && onClose()}>
      <section className={`panel modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2>{title}</h2>
          {dismissible && (
            <button className="icon-btn" onClick={onClose} aria-label="Zamknij">×</button>
          )}
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

function MessageBox({ overlay, onClose }: { overlay: Overlay; onClose: () => void }) {
  return (
    <Modal title={overlay.title ?? 'Notatka'} onClose={onClose}>
      <p className="prose" style={{ whiteSpace: 'pre-line' }}>{overlay.text}</p>
      <div className="actions"><button className="btn" onClick={onClose}>Zamknij</button></div>
    </Modal>
  );
}

// ---------- Telefon i decyzja ----------

function PhonePanel() {
  const game = useGame((s) => s.game);
  const shiftRestored = game.puzzles.shift === 'active' && !game.flags.paintingFlipped && !game.flags.chairMoved && !game.flags.clockReversed;
  const canDecide = shiftRestored && game.decision === null;
  const lines: string[] = [...TEXT.phoneAnswer];
  if (game.puzzles.books === 'active' || game.puzzles.books === 'solved') lines.push(TEXT.phoneAfterClock);
  if (game.decision) lines.push(decisionComment(game.decision, game.flags.bookPullsWrong));
  else if (shiftRestored) lines.push(TEXT.phoneAfterAll);
  else if (game.puzzles.shift === 'active') lines.push(TEXT.phoneWaiting);
  return (
    <div className="transcript">
      {lines.map((l, i) => (
        <p key={i} className="bubble">{l}</p>
      ))}
      {canDecide && (
        <div className="actions">
          <button className="btn btn--primary" onClick={() => gameStore.getState().setOverlay({ kind: 'decision' })}>Zdecyduj</button>
        </div>
      )}
    </div>
  );
}

function DecisionPanel() {
  const game = useGame((s) => s.game);
  if (game.decision) {
    return (
      <div>
        <p className="prose">{decisionComment(game.decision, game.flags.bookPullsWrong)}</p>
        <div className="actions"><button className="btn" onClick={() => gameStore.getState().setOverlay(null)}>Zamknij</button></div>
      </div>
    );
  }
  const choose = (choice: 'keep' | 'forget') => {
    const st = gameStore.getState();
    st.dispatch({ type: 'decision', choice });
    const after = gameStore.getState().game;
    st.setOverlay(null);
    st.showSubtitle(after.decision ? decisionComment(choice, after.flags.bookPullsWrong) : TEXT.phoneWaiting, 7000);
  };
  return (
    <div>
      <p className="prose">{TEXT.phoneAfterAll}</p>
      <div className="choices">
        <button className="choice" onClick={() => choose('keep')}>
          <strong>Zachowaj wspomnienie</strong>
          <span>Pamiętasz wszystko. Odbicie w lustrze zostanie otwarte.</span>
        </button>
        <button className="choice" onClick={() => choose('forget')}>
          <strong>Zapomnij</strong>
          <span>Drzwi główne zostają jedyną drogą. Lustro pozostaje zamknięte.</span>
        </button>
      </div>
    </div>
  );
}

// ---------- Zegar ----------

function ClockPanel() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const { hour12, minute, pm } = game.clock;
  const setClock = (patch: Partial<typeof game.clock>) => dispatch({ type: 'clockSet', clock: { ...game.clock, ...patch } });
  const hourAdj = (d: number) => setClock({ hour12: ((hour12 - 1 + d + 12) % 12) + 1 });
  const minAdj = (d: number) => setClock({ minute: (minute + d + 60) % 60 });
  const hourAngle = ((hour12 % 12) + minute / 60) * 30;
  const minAngle = minute * 6;
  const feedback = game.flags.clockReversed ? TEXT.clockReversed : game.puzzles.clock === 'solved' ? 'Zegar pracuje równo.' : TEXT.clockHint;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="clock">
      <svg viewBox="-60 -60 120 120" className="clock__dial" aria-hidden="true">
        <circle r="56" fill="#E9E4D9" stroke="#B79A61" strokeWidth="3" />
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1="0" y1="-50" x2="0" y2="-44" stroke="#17191D" strokeWidth="2.5" transform={`rotate(${i * 30})`} />
        ))}
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#17191D" strokeWidth="4" strokeLinecap="round" transform={`rotate(${hourAngle})`} />
        <line x1="0" y1="0" x2="0" y2="-44" stroke="#17191D" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${minAngle})`} />
        <circle r="3" fill="#B79A61" />
      </svg>
      <div className="clock__readout" aria-live="polite">
        <span>{hour12}</span>:<span>{pad(minute)}</span>
        <em>{pm ? 'PM' : 'AM'}</em>
      </div>
      <div className="clock__controls">
        <Stepper label="Godzina" onMinus={() => hourAdj(-1)} onPlus={() => hourAdj(1)} />
        <Stepper label="Minuty" onMinus={() => minAdj(-1)} onPlus={() => minAdj(1)} extra={[() => minAdj(-10), () => minAdj(10)]} />
        <div className="stepper">
          <span className="stepper__label">Okienko</span>
          <button className="btn btn--small" onClick={() => setClock({ pm: !pm })}>{pm ? 'PM → AM' : 'AM → PM'}</button>
        </div>
      </div>
      <p className="prose prose--small">{feedback}</p>
    </div>
  );
}

function Stepper({ label, onMinus, onPlus, extra }: { label: string; onMinus: () => void; onPlus: () => void; extra?: Array<() => void> }) {
  return (
    <div className="stepper">
      <span className="stepper__label">{label}</span>
      <div className="stepper__btns">
        {extra && <button className="btn btn--small" onClick={extra[0]}>−10</button>}
        <button className="btn btn--small" onClick={onMinus} aria-label={`${label} mniej`}>−</button>
        <button className="btn btn--small" onClick={onPlus} aria-label={`${label} więcej`}>+</button>
        {extra && <button className="btn btn--small" onClick={extra[1]}>+10</button>}
      </div>
    </div>
  );
}

// ---------- Radio ----------

function RadioPanel() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [freq, setFreq] = useState(92);
  const [msg, setMsg] = useState('');
  const near = (Object.keys(RADIO_STATIONS) as Array<keyof typeof RADIO_STATIONS>).find((id) => Math.abs(RADIO_STATIONS[id].freq - freq) <= RADIO_TOLERANCE_MHZ);
  const tuned = near ? game.progress.radioTuned.includes(near) : false;

  useEffect(() => {
    if (!near) return;
    if (!game.progress.radioTuned.includes(near)) {
      gameStore.getState().dispatch({ type: 'radioTuned', station: near });
      gameStore.getState().showSubtitle(RADIO_STATIONS[near].fragment, 6500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  useEffect(() => {
    if (game.puzzles.radio === 'solved') gameStore.getState().setOverlay(null);
  }, [game.puzzles.radio]);

  const order = game.progress.radioOrder;
  const addToOrder = (id: string) => {
    if (order.includes(id) || order.length >= 3) return;
    const next = [...order, id];
    dispatch({ type: 'radioOrder', order: next });
    const after = gameStore.getState().game;
    if (next.length === 3 && after.puzzles.radio !== 'solved') {
      setMsg('Ta kolejność nie pasuje do chronologii nadawania.');
      window.setTimeout(() => gameStore.getState().dispatch({ type: 'radioOrder', order: [] }), 900);
    }
  };
  const label = (id: string) => String(RADIO_STATIONS[id as keyof typeof RADIO_STATIONS].year);
  const tunedCount = game.progress.radioTuned.length;
  return (
    <div className="radio">
      <div className={`static ${near ? 'static--clear' : ''}`} aria-hidden="true" />
      <div className="radio__display" aria-live="polite">
        <span className="radio__freq">{freq.toFixed(1)}</span>
        <span className="radio__unit">MHz</span>
        <span className="radio__station">{near && tuned ? `Stacja z ${label(near)}` : near ? 'Łapię sygnał…' : 'Szum'}</span>
      </div>
      <label className="radio__slider">
        <span className="sr-only">Częstotliwość</span>
        <input type="range" min={88} max={106} step={0.1} value={freq} onChange={(e) => setFreq(parseFloat(e.target.value))} />
        <span className="radio__scale"><span>88</span><span>97</span><span>106</span></span>
      </label>
      <p className="prose prose--small">
        Dostrojono {tunedCount} z 3 stacji. Każda stacja nadaje w innym roku – fragmenty ułożą się dopiero w kolejności nadawania.
      </p>
      <div className="order">
        <span className="stepper__label">Kolejność nadawania (od najstarszej)</span>
        <div className="order__btns">
          {(['st-1974', 'st-1989', 'st-2026'] as const).map((id) => (
            <button key={id} className="btn btn--small" disabled={order.includes(id)} onClick={() => addToOrder(id)}>{label(id)}</button>
          ))}
          <button className="btn btn--ghost btn--small" onClick={() => { setMsg(''); dispatch({ type: 'radioOrder', order: [] }); }}>Wyczyść</button>
        </div>
        <p className="order__chips">
          {order.length ? order.map((id, i) => <span key={i} className="chip chip--inline">{label(id)}</span>) : <span className="muted">brak</span>}
        </p>
        {msg && <p className="prose prose--small prose--warn">{msg}</p>}
      </div>
    </div>
  );
}

// ---------- Lustro (porównanie dwóch obrazów) ----------

type Spot = 'lamp' | 'chair' | 'painting';
const SPOT_LABEL: Record<Spot, string> = { lamp: 'lampa', chair: 'krzesło', painting: 'obraz' };

function MirrorPanel() {
  const game = useGame((s) => s.game);
  const found = game.progress.mirrorFound;
  const [note, setNote] = useState('Porównaj pokój z odbiciem. Kliknij to, co się zmieniło w odbiciu.');
  const tap = (spot: Spot) => {
    if (found.includes(spot)) return;
    gameStore.getState().dispatch({ type: 'mirrorSpot', spot });
    const after = gameStore.getState().game;
    if (after.puzzles.mirror === 'solved') {
      gameStore.getState().setOverlay(null);
      gameStore.getState().showSubtitle(TEXT.mirrorNeedsDecision, 5000);
      return;
    }
    setNote(`Dobrze: ${SPOT_LABEL[spot]} jest w innym miejscu. Zostało ${3 - found.length - 1}.`);
  };
  const miss = () => setNote('Tutaj nic się nie zmieniło.');
  const panel = (reflect: boolean) => (
    <g>
      <rect width="360" height="300" rx="6" fill="#17191D" stroke="#B79A61" strokeWidth="3" />
      {/* obraz */}
      <g transform={reflect ? 'rotate(8 110 85)' : ''}>
        <rect x="50" y="30" width="110" height="110" fill="#527A91" stroke="#B79A61" strokeWidth="4" />
        <circle cx="105" cy="70" r="22" fill="#E9E4D9" />
      </g>
      {/* biurko */}
      <rect x="170" y="190" width="150" height="16" fill="#2A1D13" />
      <rect x="180" y="206" width="8" height="60" fill="#2A1D13" />
      <rect x="300" y="206" width="8" height="60" fill="#2A1D13" />
      {/* lampa */}
      <g>
        <circle cx={reflect ? 80 : 270} cy="160" r="14" fill="#E7B76A" opacity="0.9" />
        <rect x={reflect ? 78 : 268} y="174" width="4" height="16" fill="#B79A61" />
      </g>
      {/* krzesło */}
      <rect x={reflect ? 210 : 90} y="230" width="66" height="26" rx="4" fill="#2B3A46" />
      <rect x={reflect ? 210 : 90} y="200" width="66" height="30" rx="4" fill="#2B3A46" opacity="0.6" />
      {/* strefy kliknięć tylko w odbiciu */}
      {reflect && (
        <g>
          {(['painting', 'chair', 'lamp'] as Spot[]).map((spot) => {
            const box = spot === 'lamp' ? [45, 120, 70, 80] : spot === 'chair' ? [180, 190, 110, 90] : [30, 12, 150, 104];
            const done = found.includes(spot);
            return (
              <g key={spot}>
                <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="transparent" className="mirror-zone" onClick={(e) => { e.stopPropagation(); tap(spot); }} />
                {done && <circle cx={box[0] + box[2] / 2} cy={box[1] + box[3] / 2} r={Math.min(box[2], box[3]) / 2 - 4} fill="none" stroke="#E7B76A" strokeWidth="3" />}
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
  return (
    <div className="mirror">
      <svg viewBox="0 0 740 300" className="mirror__svg" role="img" aria-label="Pokój i jego odbicie w lustrze">
        <g>{panel(false)}</g>
        <g transform="translate(380,0)" onClick={miss}>{panel(true)}</g>
      </svg>
      <p className="mirror__labels"><span>Pokój</span><span>Odbicie</span></p>
      <p className="prose prose--small">{note}</p>
      <p className="muted small">Znaleziono: {found.length} z 3</p>
    </div>
  );
}

// ---------- Klawiatura drzwi ----------

function KeypadPanel() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('Wpisz kod z klucza.');
  const press = (d: string) => setCode((c) => (c.length < 4 ? c + d : c));
  const submit = () => {
    if (code.length < 4) return;
    const st = gameStore.getState();
    st.dispatch({ type: 'keypadEntered', code });
    const after = gameStore.getState().game;
    if (after.ending) return;
    if (code !== EXIT_CODE) setMsg(TEXT.keypadWrong);
    else if (!after.inventory.includes('bolt')) setMsg(TEXT.keypadNoBolt);
    setCode('');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return (
    <div className="keypad">
      <p className="prose prose--small">{TEXT.doorMainSign}</p>
      <div className="keypad__screen" aria-live="polite">
        {Array.from({ length: 4 }).map((_, i) => <span key={i}>{code[i] ?? '–'}</span>)}
      </div>
      <div className="keypad__grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>{d}</button>
        ))}
        <button className="key key--ghost" onClick={() => setCode('')} aria-label="Wyczyść">C</button>
        <button className="key" onClick={() => press('0')}>0</button>
        <button className="key key--primary" onClick={submit} aria-label="Zatwierdź">OK</button>
      </div>
      <p className="prose prose--small prose--warn">{msg}</p>
    </div>
  );
}

// ---------- Ekwipunek, dziennik, pauza, ustawienia ----------

const ITEM_DESC: Record<ItemId, string> = {
  key: TEXT.keyText,
  note: NOTE_TEXT,
  drawerKey: 'Mały, mosiężny. Pasuje do szuflady biurka – ale szuflada i tak jest już otwarta.',
  bolt: 'Ciężka żelazna zasuwa. Trzyma główne drzwi zamknięte od środka.',
};

function InventoryPanel() {
  const inventory = useGame((s) => s.game.inventory);
  const [selected, setSelected] = useState<ItemId | null>(inventory[0] ?? null);
  if (inventory.length === 0) return <p className="prose">Pusto. Rozejrzyj się.</p>;
  const current = selected && inventory.includes(selected) ? selected : inventory[0];
  return (
    <div className="inventory">
      <ul className="inventory__list">
        {inventory.map((item) => (
          <li key={item}>
            <button className={`inv-item ${item === current ? 'inv-item--on' : ''}`} onClick={() => setSelected(item)}>{ITEM_NAMES[item]}</button>
          </li>
        ))}
      </ul>
      <div className="inventory__detail">
        <h3>{ITEM_NAMES[current]}</h3>
        <p className="prose">{ITEM_DESC[current]}</p>
      </div>
    </div>
  );
}

function JournalPanel() {
  const game = useGame((s) => s.game);
  const truths = Object.keys(TRUTHS) as Array<keyof typeof TRUTHS>;
  const label = (st: string) => (st === 'solved' ? 'rozwiązana' : st === 'active' ? 'aktywna' : 'zablokowana');
  return (
    <div className="journal">
      <section>
        <h3>Prawdy ({game.truths.length}/{truths.length})</h3>
        <ol className="truths">
          {truths.map((t) => (
            <li key={t} className={game.truths.includes(t) ? '' : 'truths__locked'}>
              {game.truths.includes(t) ? TRUTHS[t] : '…'}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Zagadki</h3>
        <ul className="puzzles">
          {PUZZLE_ORDER.map((id) => (
            <li key={id} className={`puzzle puzzle--${game.puzzles[id]}`}>
              <span>{PUZZLES[id].title}</span>
              <em>{label(game.puzzles[id])}</em>
            </li>
          ))}
        </ul>
        <p className="prose prose--small">Decyzja: {decisionLabel(game.decision)}</p>
        {game.puzzles.exit === 'active' && !canOpenMirrorDoor(game) && game.decision === 'forget' && (
          <p className="prose prose--small muted">Lustro nie prowadzi już nigdzie. Główne drzwi wciąż są otwarte.</p>
        )}
      </section>
    </div>
  );
}

function PausePanel() {
  const { engine, toMenu } = useEngine();
  const [saved, setSaved] = useState('');
  const save = () => {
    const ok = gameStore.getState().saveAdapter.write(gameStore.getState().game);
    gameStore.setState({ hasSave: ok || gameStore.getState().hasSave });
    setSaved(ok ? 'Zapisano postęp.' : 'Nie udało się zapisać – magazyn jest niedostępny.');
  };
  return (
    <div className="pause">
      <button className="btn btn--primary" onClick={() => engine?.resume()}>Wznów</button>
      <button className="btn" onClick={save}>Zapisz grę</button>
      <button className="btn" onClick={() => gameStore.getState().setOverlay({ kind: 'settings' })}>Ustawienia</button>
      <button className="btn btn--ghost" onClick={toMenu}>Menu główne</button>
      {saved && <p className="prose prose--small">{saved}</p>}
    </div>
  );
}

function SettingsPanel() {
  const settings = useGame((s) => s.game.settings);
  const patch = (p: Partial<Settings>) => gameStore.getState().dispatch({ type: 'setSettings', patch: p });
  const qualities: Quality[] = ['low', 'medium', 'high', 'ultra'];
  const labels: Record<Quality, string> = { low: 'Niska', medium: 'Średnia', high: 'Wysoka', ultra: 'Ultra' };
  return (
    <div className="settings">
      <label className="field">
        <span>Jakość grafiki</span>
        <select value={settings.quality} onChange={(e) => patch({ quality: e.target.value as Quality })}>
          {qualities.map((q) => <option key={q} value={q}>{labels[q]}</option>)}
        </select>
      </label>
      <label className="field field--toggle">
        <span>Podpowiedzi</span>
        <input type="checkbox" checked={settings.hintsEnabled} onChange={(e) => patch({ hintsEnabled: e.target.checked })} />
      </label>
      <label className="field field--toggle">
        <span>Napisy</span>
        <input type="checkbox" checked={settings.subtitles} onChange={(e) => patch({ subtitles: e.target.checked })} />
      </label>
      <label className="field field--toggle">
        <span>Licznik czasu</span>
        <input type="checkbox" checked={settings.showTimer} onChange={(e) => patch({ showTimer: e.target.checked })} />
      </label>
      <label className="field field--toggle">
        <span>Wyciszenie</span>
        <input type="checkbox" checked={settings.muted} onChange={(e) => patch({ muted: e.target.checked })} />
      </label>
      <label className="field">
        <span>Czułość myszy / dotyku: {settings.sensitivity.toFixed(1)}</span>
        <input type="range" min={0.5} max={2} step={0.1} value={settings.sensitivity} onChange={(e) => patch({ sensitivity: parseFloat(e.target.value) })} />
      </label>
      <p className="prose prose--small muted">{CONTROLS_TEXT.split('\n\n')[0]}</p>
    </div>
  );
}
