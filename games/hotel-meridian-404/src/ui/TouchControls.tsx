import { useRef, useState } from 'react';
import type { GameEngine } from '../engine/engine';
import { gameStore } from '../game/gameApi';

/**
 * Sterowanie dotykowe: wirtualny joystick (lewy dół), przeciąganie po prawej stronie = rozglądanie,
 * dotknięcie obiektu = interakcja, czytelne przyciski akcji.
 */
export function TouchControls({ engine }: { engine: GameEngine | null }) {
  const stickRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const lookRef = useRef<{ id: number; x: number; y: number; t: number; moved: number } | null>(null);
  const RADIUS = 48;

  const onStickMove = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el || !(e.buttons || e.type === 'pointerdown')) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    engine?.setMove(dx / RADIUS, -dy / RADIUS);
  };
  const onStickEnd = () => {
    setKnob({ x: 0, y: 0 });
    engine?.setMove(0, 0);
  };

  const onLookDown = (e: React.PointerEvent) => {
    lookRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onLookMove = (e: React.PointerEvent) => {
    const s = lookRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    s.x = e.clientX;
    s.y = e.clientY;
    s.moved += Math.hypot(dx, dy);
    engine?.look(dx * 1.4, dy * 1.4);
  };
  const onLookUp = (e: React.PointerEvent) => {
    const s = lookRef.current;
    lookRef.current = null;
    if (!s || s.id !== e.pointerId) return;
    // krótkie stuknięcie bez przeciągania = interakcja z obiektem pod palcem
    if (s.moved < 10 && performance.now() - s.t < 350) engine?.pointerActivate(e.clientX, e.clientY);
  };

  const press = (fn: () => void) => (e: React.PointerEvent) => {
    e.stopPropagation();
    fn();
  };
  const set = gameStore.getState;

  return (
    <div className="touch" aria-label="Sterowanie dotykowe">
      <div className="touch__look" onPointerDown={onLookDown} onPointerMove={onLookMove} onPointerUp={onLookUp} onPointerCancel={onLookUp} />
      <div
        ref={stickRef}
        className="stick"
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          onStickMove(e);
        }}
        onPointerMove={onStickMove}
        onPointerUp={onStickEnd}
        onPointerCancel={onStickEnd}
      >
        <div className="stick__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="touch__actions">
        <button className="round-btn round-btn--primary" onPointerDown={press(() => engine?.activateCenter())} aria-label="Interakcja">E</button>
        <button className="round-btn" onPointerDown={press(() => set().setOverlay({ kind: 'inventory' }))} aria-label="Ekwipunek">Tab</button>
        <button className="round-btn" onPointerDown={press(() => engine?.requestHint())} aria-label="Podpowiedź">H</button>
        <button className="round-btn" onPointerDown={press(() => set().setOverlay({ kind: 'journal' }))} aria-label="Dziennik">J</button>
        <button className="round-btn" onPointerDown={press(() => engine?.pause())} aria-label="Pauza">II</button>
      </div>
    </div>
  );
}
